const express = require('express');
const pool = require('../db/pool');
const { authMiddleware, isAdmin } = require('../middleware/auth');
const localStore = require('../services/registerReservationFallback');
const {
    ensureReservationSchema,
    reconcileReservationQueues,
    listUserReservations,
    mapReservation
} = require('../services/reservationQueue');

const router = express.Router();

async function ensureRentalSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS book_rentals (
            id SERIAL PRIMARY KEY,
            book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            username VARCHAR(50),
            rented_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            returned_at TIMESTAMP,
            due_at TIMESTAMP
        );
        ALTER TABLE book_rentals ADD COLUMN IF NOT EXISTS due_at TIMESTAMP;
        UPDATE book_rentals
        SET due_at = rented_at + INTERVAL '14 days'
        WHERE due_at IS NULL AND returned_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_book_rentals_book_id ON book_rentals(book_id);
        CREATE INDEX IF NOT EXISTS idx_book_rentals_user_id ON book_rentals(user_id);
    `);
    await ensureReservationSchema();
}

function mapRental(row) {
    const rentedAt = row.rented_at ? new Date(row.rented_at) : null;
    const fallbackDue = rentedAt && !Number.isNaN(rentedAt.getTime())
        ? new Date(rentedAt.getTime() + 14 * 86400000).toISOString()
        : null;
    return {
        id: row.id,
        book_id: row.book_id,
        book_title: row.book_title || 'Книга удалена',
        book_author: row.book_author || '',
        book_cover_data_url: row.book_cover_data_url || row.cover_data_url || null,
        user_id: row.user_id,
        username: row.username || 'Пользователь',
        rented_at: row.rented_at,
        due_at: row.due_at || fallbackDue,
        returned_at: row.returned_at || null,
        status: row.returned_at ? 'returned' : (row.due_at && new Date(row.due_at) < new Date() ? 'overdue' : 'active')
    };
}

router.get('/me', authMiddleware, async (req, res) => {
    try {
        await ensureRentalSchema();
        await reconcileReservationQueues();
        const result = await pool.query(`
            SELECT r.*,
                   b.title AS book_title,
                   b.author AS book_author,
                   b.cover_data_url AS book_cover_data_url,
                   COALESCE(u.username, r.username) AS username
            FROM book_rentals r
            LEFT JOIN books b ON b.id = r.book_id
            LEFT JOIN users u ON u.id = r.user_id
            WHERE r.user_id = $1
            ORDER BY r.returned_at IS NULL DESC, r.rented_at DESC
            LIMIT 100
        `, [req.user.id]);
        const reservations = await listUserReservations(pool, req.user.id);
        res.json({ rentals: result.rows.map(mapRental), reservations });
    } catch (error) {
        const rentals = localStore.listRentalsForAdmin()
            .filter(rental => Number(rental.user_id) === Number(req.user.id))
            .map(mapRental);
        const reservations = typeof localStore.listReservationsForUser === 'function'
            ? localStore.listReservationsForUser(req.user.id)
            : [];
        res.json({ rentals, reservations });
    }
});

router.get('/', authMiddleware, isAdmin, async (req, res) => {
    try {
        await ensureRentalSchema();
        await reconcileReservationQueues();
        const result = await pool.query(`
            SELECT r.*, b.title AS book_title, b.author AS book_author, b.cover_data_url AS book_cover_data_url, COALESCE(u.username, r.username) AS username
            FROM book_rentals r
            LEFT JOIN books b ON b.id = r.book_id
            LEFT JOIN users u ON u.id = r.user_id
            ORDER BY r.returned_at IS NULL DESC, r.rented_at DESC
            LIMIT 100
        `);
        const reservationResult = await pool.query(`
            WITH ranked AS (
                SELECT r.*,
                       CASE WHEN r.status = 'waiting' THEN
                           ROW_NUMBER() OVER (PARTITION BY r.book_id, r.status ORDER BY r.created_at, r.id)
                       ELSE 1 END AS queue_position
                FROM book_reservations r
                WHERE r.status IN ('waiting', 'ready')
            )
            SELECT r.*, b.title AS book_title, b.author AS book_author, b.cover_data_url AS book_cover_data_url
            FROM ranked r
            LEFT JOIN books b ON b.id = r.book_id
            ORDER BY CASE WHEN r.status = 'ready' THEN 0 ELSE 1 END, r.created_at
            LIMIT 200
        `);
        res.json({
            rentals: result.rows.map(mapRental),
            reservations: reservationResult.rows.map(row => mapReservation(row, Number(row.queue_position || 1)))
        });
    } catch (error) {
        res.json({
            rentals: localStore.listRentalsForAdmin().map(mapRental),
            reservations: []
        });
    }
});

module.exports = router;
