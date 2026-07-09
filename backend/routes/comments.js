const express = require('express');
const pool = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');
const localStore = require('../services/localStore');
const router = express.Router();

const MAX_COMMENT_LENGTH = 1000;

function normalizeId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeCommentText(value = '') {
    return String(value)
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_COMMENT_LENGTH);
}

// Добавить комментарий
router.post('/', authMiddleware, async (req, res) => {
    const bookId = normalizeId(req.body.bookId || req.body.book_id);
    const text = normalizeCommentText(req.body.text);

    if (!bookId) {
        return res.status(400).json({ error: 'Valid bookId is required' });
    }

    if (!text) {
        return res.status(400).json({ error: 'Comment text is required' });
    }

    try {
        const book = await pool.query('SELECT id FROM books WHERE id = $1', [bookId]);
        if (!book.rows.length) return res.status(404).json({ error: 'Book not found' });

        const result = await pool.query(
            `INSERT INTO comments (text, book_id, user_id, username) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [text, bookId, req.user.id, req.user.username]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        try {
            const comment = localStore.addComment(req.user, bookId, text);
            if (!comment) return res.status(404).json({ error: 'Book not found' });
            res.status(201).json(comment);
        } catch (fallbackError) {
            res.status(500).json({ error: 'Failed to add comment' });
        }
    }
});

// Удалить комментарий
router.delete('/:id', authMiddleware, async (req, res) => {
    const commentId = normalizeId(req.params.id);
    if (!commentId) return res.status(400).json({ error: 'Valid comment id is required' });

    try {
        const comment = await pool.query('SELECT user_id FROM comments WHERE id = $1', [commentId]);

        if (comment.rows.length === 0) {
            return res.status(404).json({ error: 'Comment not found' });
        }

        if (comment.rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'You can only delete your own comments' });
        }

        await pool.query('DELETE FROM comments WHERE id = $1', [commentId]);
        res.json({ message: 'Comment deleted successfully' });
    } catch (error) {
        try {
            const deleted = localStore.deleteComment(commentId, req.user);
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
    const bookId = normalizeId(req.params.bookId);
    if (!bookId) return res.status(400).json({ error: 'Valid book id is required' });

    try {
        const result = await pool.query(
            'SELECT * FROM comments WHERE book_id = $1 ORDER BY created_at DESC LIMIT 100',
            [bookId]
        );
        res.json(result.rows);
    } catch (error) {
        res.json(localStore.getComments(bookId).slice(0, 100));
    }
});

module.exports = router;