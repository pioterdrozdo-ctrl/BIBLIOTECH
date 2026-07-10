'use strict';

const pool = require('../db/pool');

const READY_HOLD_HOURS = 48;
const ACTIVE_STATUSES = ['waiting', 'ready'];

async function ensureReservationSchema(client = pool) {
    await client.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_available_enabled BOOLEAN DEFAULT TRUE;

        CREATE TABLE IF NOT EXISTS account_notifications (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            type VARCHAR(40) NOT NULL,
            unique_key VARCHAR(120) NOT NULL,
            title VARCHAR(180) NOT NULL,
            message TEXT NOT NULL,
            book_id INTEGER REFERENCES books(id) ON DELETE SET NULL,
            read_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (user_id, unique_key)
        );

        CREATE TABLE IF NOT EXISTS book_reservations (
            id SERIAL PRIMARY KEY,
            book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            username VARCHAR(50),
            status VARCHAR(20) NOT NULL DEFAULT 'waiting',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            ready_at TIMESTAMP,
            expires_at TIMESTAMP,
            fulfilled_at TIMESTAMP,
            cancelled_at TIMESTAMP,
            expired_at TIMESTAMP
        );

        ALTER TABLE book_reservations ADD COLUMN IF NOT EXISTS username VARCHAR(50);
        ALTER TABLE book_reservations ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'waiting';
        ALTER TABLE book_reservations ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        ALTER TABLE book_reservations ADD COLUMN IF NOT EXISTS ready_at TIMESTAMP;
        ALTER TABLE book_reservations ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
        ALTER TABLE book_reservations ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMP;
        ALTER TABLE book_reservations ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;
        ALTER TABLE book_reservations ADD COLUMN IF NOT EXISTS expired_at TIMESTAMP;

        CREATE INDEX IF NOT EXISTS idx_book_reservations_book_queue
            ON book_reservations(book_id, status, created_at, id);
        CREATE INDEX IF NOT EXISTS idx_book_reservations_user
            ON book_reservations(user_id, status, created_at DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_book_reservations_active_user_book
            ON book_reservations(book_id, user_id)
            WHERE status IN ('waiting', 'ready');
        CREATE INDEX IF NOT EXISTS idx_account_notifications_user
            ON account_notifications(user_id, created_at DESC);
    `);
}

function toIso(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapReservation(row = {}, queuePosition = null) {
    return {
        id: row.id,
        book_id: row.book_id,
        bookId: row.book_id,
        user_id: row.user_id,
        userId: row.user_id,
        username: row.username || 'Пользователь',
        status: row.status,
        queue_position: queuePosition,
        queuePosition,
        created_at: toIso(row.created_at) || row.created_at || null,
        ready_at: toIso(row.ready_at),
        readyAt: toIso(row.ready_at),
        expires_at: toIso(row.expires_at),
        expiresAt: toIso(row.expires_at),
        fulfilled_at: toIso(row.fulfilled_at),
        cancelled_at: toIso(row.cancelled_at),
        expired_at: toIso(row.expired_at),
        book_title: row.book_title || null,
        book_author: row.book_author || null,
        book_cover_data_url: row.book_cover_data_url || row.cover_data_url || null
    };
}

async function addNotification(client, reservation, type, title, message) {
    await client.query(`
        INSERT INTO account_notifications (user_id, type, unique_key, title, message, book_id)
        SELECT $1, $2, $3, $4, $5, $6
        FROM users u
        WHERE u.id = $1
          AND ($2 <> 'reservation_ready' OR u.notification_available_enabled IS DISTINCT FROM FALSE)
        ON CONFLICT (user_id, unique_key) DO NOTHING
    `, [
        reservation.user_id,
        type,
        `${type}:${reservation.id}`,
        title,
        message,
        reservation.book_id
    ]);
}

async function expireReadyReservations(client, bookId = null) {
    const params = [];
    let whereBook = '';
    if (bookId !== null && bookId !== undefined) {
        params.push(bookId);
        whereBook = `AND r.book_id = $${params.length}`;
    }
    const result = await client.query(`
        UPDATE book_reservations r
        SET status = 'expired',
            expired_at = CURRENT_TIMESTAMP
        WHERE r.status = 'ready'
          AND r.expires_at IS NOT NULL
          AND r.expires_at <= CURRENT_TIMESTAMP
          ${whereBook}
        RETURNING r.*
    `, params);

    for (const reservation of result.rows) {
        const bookResult = await client.query('SELECT title FROM books WHERE id = $1', [reservation.book_id]);
        const title = bookResult.rows[0]?.title || 'Без названия';
        await addNotification(
            client,
            reservation,
            'reservation_expired',
            'Срок бронирования истёк',
            `Бронь на книгу «${title}» истекла. При необходимости встаньте в очередь снова.`
        );
    }
    return result.rows;
}

async function syncBookAvailability(client, bookId) {
    const result = await client.query(`
        UPDATE books b
        SET available = GREATEST(COALESCE(b.copies, 0) - (
            SELECT COUNT(*)::integer
            FROM book_reservations r
            WHERE r.book_id = b.id
              AND r.status = 'ready'
              AND (r.expires_at IS NULL OR r.expires_at > CURRENT_TIMESTAMP)
        ), 0) > 0
        WHERE b.id = $1
        RETURNING b.id, b.copies, b.available
    `, [bookId]);
    return result.rows[0] || null;
}

async function promoteBookReservations(client, bookId) {
    const expired = await expireReadyReservations(client, bookId);
    const bookResult = await client.query('SELECT id, title, copies FROM books WHERE id = $1 FOR UPDATE', [bookId]);
    const book = bookResult.rows[0];
    if (!book) return { promoted: [], expired };

    const readyResult = await client.query(`
        SELECT COUNT(*)::integer AS count
        FROM book_reservations
        WHERE book_id = $1
          AND status = 'ready'
          AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    `, [bookId]);
    const readyCount = Number(readyResult.rows[0]?.count || 0);
    const slots = Math.max(0, Number(book.copies || 0) - readyCount);
    const promoted = [];

    if (slots > 0) {
        const waitingResult = await client.query(`
            SELECT *
            FROM book_reservations
            WHERE book_id = $1 AND status = 'waiting'
            ORDER BY created_at ASC, id ASC
            FOR UPDATE SKIP LOCKED
            LIMIT $2
        `, [bookId, slots]);

        for (const waiting of waitingResult.rows) {
            const updated = await client.query(`
                UPDATE book_reservations
                SET status = 'ready',
                    ready_at = CURRENT_TIMESTAMP,
                    expires_at = CURRENT_TIMESTAMP + ($2::text || ' hours')::interval
                WHERE id = $1 AND status = 'waiting'
                RETURNING *
            `, [waiting.id, READY_HOLD_HOURS]);
            const reservation = updated.rows[0];
            if (!reservation) continue;
            promoted.push(reservation);
            await addNotification(
                client,
                reservation,
                'reservation_ready',
                'Забронированная книга доступна',
                `Книга «${book.title || 'Без названия'}» вернулась. Она закреплена за вами на ${READY_HOLD_HOURS} часов.`
            );
        }
    }

    await syncBookAvailability(client, bookId);
    return { promoted, expired };
}

async function reconcileReservationQueues({ bookId = null } = {}) {
    if (!pool.isConfigured) return { promoted: [], expired: [] };
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await ensureReservationSchema(client);
        const params = [];
        let bookFilter = '';
        if (bookId !== null && bookId !== undefined) {
            params.push(bookId);
            bookFilter = `AND b.id = $${params.length}`;
        }
        const books = await client.query(`
            SELECT b.id
            FROM books b
            LEFT JOIN book_reservations r ON r.book_id = b.id AND r.status IN ('waiting', 'ready')
            WHERE (r.id IS NOT NULL OR b.available IS DISTINCT FROM (COALESCE(b.copies, 0) > 0))
              ${bookFilter}
            GROUP BY b.id
            ORDER BY b.id
        `, params);
        const promoted = [];
        const expired = [];
        for (const row of books.rows) {
            const result = await promoteBookReservations(client, row.id);
            promoted.push(...result.promoted);
            expired.push(...result.expired);
        }
        await client.query('COMMIT');
        return { promoted, expired };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function getReservationSummaries(client, bookIds = [], userId = null) {
    const ids = [...new Set(bookIds.map(Number).filter(Number.isFinite))];
    const summaries = new Map();
    ids.forEach(id => summaries.set(id, {
        reservationCount: 0,
        waitingCount: 0,
        readyCount: 0,
        myReservation: null
    }));
    if (!ids.length) return summaries;

    const result = await client.query(`
        SELECT r.*
        FROM book_reservations r
        WHERE r.book_id = ANY($1::integer[])
          AND r.status IN ('waiting', 'ready')
          AND (r.status <> 'ready' OR r.expires_at IS NULL OR r.expires_at > CURRENT_TIMESTAMP)
        ORDER BY r.book_id, CASE WHEN r.status = 'ready' THEN 0 ELSE 1 END, r.created_at, r.id
    `, [ids]);

    const waitingPositions = new Map();
    for (const row of result.rows) {
        const currentBookId = Number(row.book_id);
        const summary = summaries.get(currentBookId) || { reservationCount: 0, waitingCount: 0, readyCount: 0, myReservation: null };
        summary.reservationCount += 1;
        if (row.status === 'waiting') {
            summary.waitingCount += 1;
            const position = (waitingPositions.get(currentBookId) || 0) + 1;
            waitingPositions.set(currentBookId, position);
            if (userId && Number(row.user_id) === Number(userId)) summary.myReservation = mapReservation(row, position);
        } else {
            summary.readyCount += 1;
            if (userId && Number(row.user_id) === Number(userId)) summary.myReservation = mapReservation(row, 1);
        }
        summaries.set(currentBookId, summary);
    }
    return summaries;
}

function attachReservationFields(book, summary = {}) {
    const reservation = summary.myReservation || null;
    return {
        ...book,
        reservation_count: Number(summary.reservationCount || 0),
        reservationCount: Number(summary.reservationCount || 0),
        reservation_waiting_count: Number(summary.waitingCount || 0),
        reservationWaitingCount: Number(summary.waitingCount || 0),
        reservation_ready_count: Number(summary.readyCount || 0),
        reservationReadyCount: Number(summary.readyCount || 0),
        my_reservation_id: reservation?.id || null,
        myReservationId: reservation?.id || null,
        my_reservation_status: reservation?.status || null,
        myReservationStatus: reservation?.status || null,
        my_queue_position: reservation?.queuePosition || null,
        myQueuePosition: reservation?.queuePosition || null,
        reservation_ready_expires_at: reservation?.expiresAt || null,
        reservationReadyExpiresAt: reservation?.expiresAt || null,
        reservation
    };
}

async function listUserReservations(client, userId) {
    const result = await client.query(`
        WITH ranked AS (
            SELECT r.*,
                   CASE WHEN r.status = 'waiting' THEN
                       ROW_NUMBER() OVER (PARTITION BY r.book_id, r.status ORDER BY r.created_at, r.id)
                   ELSE 1 END AS queue_position
            FROM book_reservations r
            WHERE r.status IN ('waiting', 'ready')
        )
        SELECT r.*,
               b.title AS book_title,
               b.author AS book_author,
               b.cover_data_url AS book_cover_data_url
        FROM ranked r
        LEFT JOIN books b ON b.id = r.book_id
        WHERE r.user_id = $1
        ORDER BY CASE WHEN r.status = 'ready' THEN 0 ELSE 1 END, r.created_at ASC
    `, [userId]);
    return result.rows.map(row => mapReservation(row, Number(row.queue_position || 1)));
}

module.exports = {
    READY_HOLD_HOURS,
    ACTIVE_STATUSES,
    ensureReservationSchema,
    expireReadyReservations,
    syncBookAvailability,
    promoteBookReservations,
    reconcileReservationQueues,
    getReservationSummaries,
    attachReservationFields,
    listUserReservations,
    mapReservation
};
