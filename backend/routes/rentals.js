const express = require('express');
const pool = require('../db/pool');
const { authMiddleware, isAdmin } = require('../middleware/auth');
const localStore = require('../services/localStore');

const router = express.Router();

async function ensureRentalSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS book_rentals (
            id SERIAL PRIMARY KEY,
            book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            username VARCHAR(50),
            rented_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            returned_at TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_book_rentals_book_id ON book_rentals(book_id);
        CREATE INDEX IF NOT EXISTS idx_book_rentals_user_id ON book_rentals(user_id);
    `);
}

function mapRental(row) {
    return {
        id: row.id,
        book_id: row.book_id,
        book_title: row.book_title || 'Книга удалена',
        user_id: row.user_id,
        username: row.username || 'Пользователь',
        rented_at: row.rented_at,
        returned_at: row.returned_at || null,
        status: row.returned_at ? 'returned' : 'active'
    };
}

router.get('/', authMiddleware, isAdmin, async (req, res) => {
    try {
        await ensureRentalSchema();
        const result = await pool.query(`
            SELECT r.*, b.title AS book_title, COALESCE(u.username, r.username) AS username
            FROM book_rentals r
            LEFT JOIN books b ON b.id = r.book_id
            LEFT JOIN users u ON u.id = r.user_id
            ORDER BY r.returned_at IS NULL DESC, r.rented_at DESC
            LIMIT 100
        `);
        res.json({ rentals: result.rows.map(mapRental) });
    } catch (error) {
        res.json({ rentals: localStore.listRentalsForAdmin() });
    }
});

module.exports = router;
