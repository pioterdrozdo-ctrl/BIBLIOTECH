const express = require('express');
const pool = require('../db/pool');
const localStore = require('../services/localStore');
const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const stats = {};

        // Общее количество книг
        const totalBooks = await pool.query('SELECT COUNT(*) FROM books');
        stats.totalBooks = parseInt(totalBooks.rows[0].count);

        // Количество доступных книг
        const availableBooks = await pool.query('SELECT COUNT(*) FROM books WHERE available = true');
        stats.availableBooks = parseInt(availableBooks.rows[0].count);

        // Общее количество экземпляров
        const totalCopies = await pool.query('SELECT SUM(copies) FROM books');
        stats.totalCopies = parseInt(totalCopies.rows[0].sum) || 0;

        // Количество комментариев
        const totalComments = await pool.query('SELECT COUNT(*) FROM comments');
        stats.totalComments = parseInt(totalComments.rows[0].count);

        // Топ авторов
        const topAuthors = await pool.query(
            'SELECT author, COUNT(*) as count FROM books GROUP BY author ORDER BY count DESC LIMIT 5'
        );
        stats.topAuthors = topAuthors.rows;

        // Процент доступных книг
        stats.availablePercent = stats.totalBooks ? Math.round((stats.availableBooks / stats.totalBooks) * 100) : 0;

        res.json(stats);
    } catch (error) {
        console.warn('[DB fallback] GET /api/stats:', error.message);
        res.json(localStore.getStats());
    }
});

module.exports = router;
