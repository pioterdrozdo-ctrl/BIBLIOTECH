'use strict';

const express = require('express');
const pool = require('../db/pool');
const localStore = require('../services/registerReservationFallback');
const { authMiddleware } = require('../middleware/auth');
const { normalizeBookQrFields } = require('../utils/bookQr');
const {
    ensureReservationSchema,
    promoteBookReservations,
    syncBookAvailability,
    getReservationSummaries,
    attachReservationFields,
    mapReservation
} = require('../services/reservationQueue');

const router = express.Router();

async function fetchBookSnapshot(client, bookId, userId) {
    const result = await client.query(`
        SELECT b.*,
               l.shelf_code,
               l.place_code,
               l.note AS location_note,
               (SELECT COUNT(*) FROM book_rentals br WHERE br.book_id = b.id AND br.returned_at IS NULL) AS active_rentals_count,
               (SELECT br.id FROM book_rentals br WHERE br.book_id = b.id AND br.user_id = $2 AND br.returned_at IS NULL LIMIT 1) AS my_rental_id
        FROM books b
        LEFT JOIN storage_locations l ON l.id = b.location_id
        WHERE b.id = $1
    `, [bookId, userId]);
    const row = result.rows[0];
    if (!row) return null;
    const comments = await client.query('SELECT * FROM comments WHERE book_id = $1 ORDER BY created_at DESC', [bookId]);
    const summaries = await getReservationSummaries(client, [Number(bookId)], userId);
    const location = row.location_id ? {
        id: row.location_id,
        shelf_code: row.shelf_code || '',
        shelfCode: row.shelf_code || '',
        place_code: row.place_code || '',
        placeCode: row.place_code || '',
        note: row.location_note || ''
    } : null;
    const book = {
        ...row,
        ...normalizeBookQrFields(row),
        location,
        locationId: row.location_id || null,
        activeRentalsCount: Number(row.active_rentals_count || 0),
        active_rentals_count: Number(row.active_rentals_count || 0),
        myRentalId: row.my_rental_id || null,
        my_rental_id: row.my_rental_id || null,
        rentedByMe: Boolean(row.my_rental_id),
        coverDataURL: row.cover_data_url || row.coverDataURL || null,
        publicationYear: row.publication_year ?? null,
        metadataSource: row.metadata_source || null,
        metadataSourceUrl: row.metadata_source_url || null,
        comments: comments.rows
    };
    return attachReservationFields(book, summaries.get(Number(bookId)));
}

function sendError(res, error, fallbackMessage) {
    const code = error.code || 'RESERVATION_ERROR';
    const status = {
        NOT_FOUND: 404,
        RENTAL_NOT_FOUND: 404,
        RESERVATION_NOT_FOUND: 404,
        ALREADY_RENTED: 409,
        ALREADY_RESERVED: 409,
        BOOK_AVAILABLE: 409,
        WAITING_IN_QUEUE: 409,
        RESERVED_FOR_QUEUE: 409,
        NO_COPIES: 409,
        '23505': 409
    }[code] || 500;
    res.status(status).json({ error: error.message || fallbackMessage, code });
}

async function transaction(handler) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await ensureReservationSchema(client);
        const result = await handler(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

router.get('/:id/reservation', authMiddleware, async (req, res) => {
    try {
        const result = await transaction(async client => {
            await promoteBookReservations(client, req.params.id);
            return fetchBookSnapshot(client, req.params.id, req.user.id);
        });
        if (!result) return res.status(404).json({ error: 'Книга не найдена.', code: 'NOT_FOUND' });
        res.json({ book: result, reservation: result.reservation || null });
    } catch (error) {
        if (!pool.isConfigured) {
            try {
                const book = localStore.getReservationState(req.params.id, req.user);
                if (!book) return res.status(404).json({ error: 'Книга не найдена.', code: 'NOT_FOUND' });
                return res.json({ book, reservation: book.reservation || null });
            } catch (fallbackError) {
                return sendError(res, fallbackError, 'Не удалось получить состояние бронирования.');
            }
        }
        sendError(res, error, 'Не удалось получить состояние бронирования.');
    }
});

router.post('/:id/reserve', authMiddleware, async (req, res) => {
    try {
        const payload = await transaction(async client => {
            await promoteBookReservations(client, req.params.id);
            const bookResult = await client.query('SELECT id, title, copies FROM books WHERE id = $1 FOR UPDATE', [req.params.id]);
            const book = bookResult.rows[0];
            if (!book) {
                const error = new Error('Книга не найдена.');
                error.code = 'NOT_FOUND';
                throw error;
            }

            const activeRental = await client.query(`
                SELECT id FROM book_rentals
                WHERE book_id = $1 AND user_id = $2 AND returned_at IS NULL
                LIMIT 1
            `, [req.params.id, req.user.id]);
            if (activeRental.rows.length) {
                const error = new Error('Книга уже находится у вас.');
                error.code = 'ALREADY_RENTED';
                throw error;
            }

            const existing = await client.query(`
                SELECT * FROM book_reservations
                WHERE book_id = $1 AND user_id = $2 AND status IN ('waiting', 'ready')
                LIMIT 1
            `, [req.params.id, req.user.id]);
            if (existing.rows.length) {
                const error = new Error('Вы уже находитесь в очереди на эту книгу.');
                error.code = 'ALREADY_RESERVED';
                throw error;
            }

            const ready = await client.query(`
                SELECT COUNT(*)::integer AS count FROM book_reservations
                WHERE book_id = $1 AND status = 'ready'
                  AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
            `, [req.params.id]);
            if (Number(book.copies || 0) - Number(ready.rows[0]?.count || 0) > 0) {
                const error = new Error('Книга доступна — её можно взять без бронирования.');
                error.code = 'BOOK_AVAILABLE';
                throw error;
            }

            const created = await client.query(`
                INSERT INTO book_reservations (book_id, user_id, username, status)
                VALUES ($1, $2, $3, 'waiting')
                RETURNING *
            `, [req.params.id, req.user.id, req.user.username]);
            await syncBookAvailability(client, req.params.id);
            const snapshot = await fetchBookSnapshot(client, req.params.id, req.user.id);
            return { reservation: snapshot.reservation || mapReservation(created.rows[0], snapshot.myQueuePosition), book: snapshot };
        });
        res.status(201).json(payload);
    } catch (error) {
        if (!pool.isConfigured) {
            try {
                return res.status(201).json(localStore.reserveBook(req.params.id, req.user));
            } catch (fallbackError) {
                return sendError(res, fallbackError, 'Не удалось забронировать книгу.');
            }
        }
        sendError(res, error, 'Не удалось забронировать книгу.');
    }
});

router.delete('/:id/reserve', authMiddleware, async (req, res) => {
    try {
        const payload = await transaction(async client => {
            await promoteBookReservations(client, req.params.id);
            const result = await client.query(`
                UPDATE book_reservations
                SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP
                WHERE id = (
                    SELECT id FROM book_reservations
                    WHERE book_id = $1 AND user_id = $2 AND status IN ('waiting', 'ready')
                    ORDER BY created_at, id
                    FOR UPDATE
                    LIMIT 1
                )
                RETURNING *
            `, [req.params.id, req.user.id]);
            if (!result.rows.length) {
                const error = new Error('Активная бронь не найдена.');
                error.code = 'RESERVATION_NOT_FOUND';
                throw error;
            }
            const queue = await promoteBookReservations(client, req.params.id);
            const book = await fetchBookSnapshot(client, req.params.id, req.user.id);
            return {
                reservation: mapReservation(result.rows[0]),
                promoted: queue.promoted.map(item => mapReservation(item)),
                book
            };
        });
        res.json(payload);
    } catch (error) {
        if (!pool.isConfigured) {
            try {
                return res.json(localStore.cancelReservation(req.params.id, req.user));
            } catch (fallbackError) {
                return sendError(res, fallbackError, 'Не удалось отменить бронирование.');
            }
        }
        sendError(res, error, 'Не удалось отменить бронирование.');
    }
});

router.post('/:id/rent', authMiddleware, async (req, res) => {
    try {
        const payload = await transaction(async client => {
            await promoteBookReservations(client, req.params.id);
            const bookResult = await client.query('SELECT id, copies FROM books WHERE id = $1 FOR UPDATE', [req.params.id]);
            const book = bookResult.rows[0];
            if (!book) {
                const error = new Error('Книга не найдена.');
                error.code = 'NOT_FOUND';
                throw error;
            }

            const existingRental = await client.query(`
                SELECT id FROM book_rentals
                WHERE book_id = $1 AND user_id = $2 AND returned_at IS NULL
                LIMIT 1
            `, [req.params.id, req.user.id]);
            if (existingRental.rows.length) {
                const error = new Error('Книга уже находится у вас.');
                error.code = 'ALREADY_RENTED';
                throw error;
            }

            const reservations = await client.query(`
                SELECT * FROM book_reservations
                WHERE book_id = $1 AND status IN ('waiting', 'ready')
                  AND (status <> 'ready' OR expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
                ORDER BY CASE WHEN status = 'ready' THEN 0 ELSE 1 END, created_at, id
                FOR UPDATE
            `, [req.params.id]);
            const mine = reservations.rows.find(item => Number(item.user_id) === Number(req.user.id));
            if (mine?.status === 'waiting') {
                const waiting = reservations.rows.filter(item => item.status === 'waiting');
                const position = waiting.findIndex(item => Number(item.id) === Number(mine.id)) + 1;
                const error = new Error(`Сейчас вы ${position}-й в очереди.`);
                error.code = 'WAITING_IN_QUEUE';
                throw error;
            }
            const readyCount = reservations.rows.filter(item => item.status === 'ready').length;
            const availableOutsideQueue = Number(book.copies || 0) - readyCount;
            if (reservations.rows.length && mine?.status !== 'ready' && availableOutsideQueue <= 0) {
                const error = new Error('Свободный экземпляр закреплён за читателем из очереди.');
                error.code = 'RESERVED_FOR_QUEUE';
                throw error;
            }
            if (Number(book.copies || 0) <= 0) {
                const error = new Error('Свободных экземпляров нет.');
                error.code = 'NO_COPIES';
                throw error;
            }

            const updated = await client.query(`
                UPDATE books
                SET copies = copies - 1
                WHERE id = $1 AND copies > 0
                RETURNING id
            `, [req.params.id]);
            if (!updated.rows.length) {
                const error = new Error('Свободных экземпляров нет.');
                error.code = 'NO_COPIES';
                throw error;
            }
            const rental = await client.query(`
                INSERT INTO book_rentals (book_id, user_id, username, due_at)
                VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '14 days')
                RETURNING *
            `, [req.params.id, req.user.id, req.user.username]);
            if (mine?.status === 'ready') {
                await client.query(`
                    UPDATE book_reservations
                    SET status = 'fulfilled', fulfilled_at = CURRENT_TIMESTAMP
                    WHERE id = $1
                `, [mine.id]);
            }
            await promoteBookReservations(client, req.params.id);
            const snapshot = await fetchBookSnapshot(client, req.params.id, req.user.id);
            return { rental: rental.rows[0], book: snapshot };
        });
        res.status(201).json(payload);
    } catch (error) {
        if (!pool.isConfigured) {
            try {
                return res.status(201).json(localStore.rentBookWithQueue(req.params.id, req.user));
            } catch (fallbackError) {
                return sendError(res, fallbackError, 'Не удалось арендовать книгу.');
            }
        }
        sendError(res, error, 'Не удалось арендовать книгу.');
    }
});

router.post('/:id/return', authMiddleware, async (req, res) => {
    try {
        const payload = await transaction(async client => {
            await promoteBookReservations(client, req.params.id);
            const rentalResult = await client.query(`
                SELECT *
                FROM book_rentals
                WHERE book_id = $1
                  AND returned_at IS NULL
                  AND (
                      ($3::boolean = TRUE AND ($4::integer IS NULL OR id = $4))
                      OR
                      ($3::boolean = FALSE AND user_id = $2 AND ($4::integer IS NULL OR id = $4))
                  )
                ORDER BY rented_at DESC
                FOR UPDATE
                LIMIT 1
            `, [req.params.id, req.user.id, req.user.role === 'admin', req.body.rentalId || null]);
            if (!rentalResult.rows.length) {
                const error = new Error('Активная аренда не найдена.');
                error.code = 'RENTAL_NOT_FOUND';
                throw error;
            }
            const rental = rentalResult.rows[0];
            await client.query('UPDATE book_rentals SET returned_at = CURRENT_TIMESTAMP WHERE id = $1', [rental.id]);
            await client.query('UPDATE books SET copies = COALESCE(copies, 0) + 1 WHERE id = $1', [req.params.id]);
            const queue = await promoteBookReservations(client, req.params.id);
            const snapshot = await fetchBookSnapshot(client, req.params.id, req.user.id);
            return {
                rental: { ...rental, returned_at: new Date().toISOString() },
                promoted: queue.promoted.map(item => mapReservation(item)),
                book: snapshot
            };
        });
        res.json(payload);
    } catch (error) {
        if (!pool.isConfigured) {
            try {
                return res.json(localStore.returnBookWithQueue(req.params.id, req.user, req.body.rentalId || null));
            } catch (fallbackError) {
                return sendError(res, fallbackError, 'Не удалось вернуть книгу.');
            }
        }
        sendError(res, error, 'Не удалось вернуть книгу.');
    }
});

module.exports = router;
