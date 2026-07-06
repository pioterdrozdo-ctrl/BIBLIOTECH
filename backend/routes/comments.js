const express = require('express');
const pool = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');
const localStore = require('../services/localStore');
const router = express.Router();

// Добавить комментарий
router.post('/', authMiddleware, async (req, res) => {
    const { text, bookId } = req.body;

    if (!text || !text.trim()) {
        return res.status(400).json({ error: 'Comment text is required' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO comments (text, book_id, user_id, username) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [text.trim(), bookId, req.user.id, req.user.username]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        const comment = localStore.addComment(req.user, bookId, text);
        if (!comment) return res.status(404).json({ error: 'Book not found' });
        res.status(201).json(comment);
    }
});

// Удалить комментарий
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const comment = await pool.query('SELECT user_id FROM comments WHERE id = $1', [req.params.id]);

        if (comment.rows.length === 0) {
            return res.status(404).json({ error: 'Comment not found' });
        }

        if (comment.rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'You can only delete your own comments' });
        }

        await pool.query('DELETE FROM comments WHERE id = $1', [req.params.id]);
        res.json({ message: 'Comment deleted successfully' });
    } catch (error) {
        try {
            const deleted = localStore.deleteComment(req.params.id, req.user);
            if (!deleted) return res.status(404).json({ error: 'Comment not found' });
            res.json({ message: 'Comment deleted successfully' });
        } catch (fallbackError) {
            res.status(fallbackError.code === 'FORBIDDEN' ? 403 : 500).json({
                error: fallbackError.code === 'FORBIDDEN' ? 'You can only delete your own comments' : 'Failed to delete comment'
            });
        }
    }
});

// Получить комментарии книги
router.get('/book/:bookId', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM comments WHERE book_id = $1 ORDER BY created_at DESC',
            [req.params.bookId]
        );
        res.json(result.rows);
    } catch (error) {
        res.json(localStore.getComments(req.params.bookId));
    }
});

module.exports = router;
