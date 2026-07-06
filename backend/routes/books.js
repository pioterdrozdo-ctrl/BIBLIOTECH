const express = require('express');
const pool = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');
const localStore = require('../services/localStore');
const { buildBookQrCode, buildBookQrPayload, normalizeBookQrFields } = require('../utils/bookQr');
const router = express.Router();

function mapBookResponse(book) {
    const qrFields = normalizeBookQrFields(book);
    return {
        ...book,
        ...qrFields,
        coverDataURL: book.cover_data_url || book.coverDataURL || null
    };
}

async function ensureBookQrCode(bookId) {
    const qrCode = buildBookQrCode(bookId);
    const result = await pool.query(
        'UPDATE books SET qr_code = $1 WHERE id = $2 RETURNING *',
        [qrCode, bookId]
    );
    return result.rows[0];
}

// Получить все книги с фильтрацией
router.get('/', async (req, res) => {
    const { filter, sort, search, minCopies } = req.query;

    let query = `
        SELECT b.*, 
               COALESCE(json_agg(json_build_object('id', c.id, 'text', c.text, 'date', c.created_at, 'created_at', c.created_at, 'username', c.username, 'user_id', c.user_id)) 
                        FILTER (WHERE c.id IS NOT NULL), '[]') as comments
        FROM books b
        LEFT JOIN comments c ON b.id = c.book_id
    `;

    const conditions = [];
    const params = [];
    let paramCounter = 1;

    // Поиск
    if (search && search.trim()) {
        conditions.push(`(b.title ILIKE $${paramCounter} OR b.author ILIKE $${paramCounter} OR b.description ILIKE $${paramCounter} OR b.qr_code ILIKE $${paramCounter})`);
        params.push(`%${search}%`);
        paramCounter++;
    }

    // Фильтр по наличию
    if (filter === 'available') {
        conditions.push('b.available = true');
    } else if (filter === 'unavailable') {
        conditions.push('b.available = false');
    }

    // Фильтр по количеству копий
    if (minCopies && parseInt(minCopies) > 0) {
        conditions.push(`b.copies >= $${paramCounter}`);
        params.push(parseInt(minCopies));
        paramCounter++;
    }

    if (conditions.length) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' GROUP BY b.id';

    // Сортировка
    switch (sort) {
        case 'title-asc':
            query += ' ORDER BY b.title ASC';
            break;
        case 'title-desc':
            query += ' ORDER BY b.title DESC';
            break;
        case 'author-asc':
            query += ' ORDER BY b.author ASC';
            break;
        case 'date-newest':
            query += ' ORDER BY b.created_at DESC';
            break;
        case 'date-oldest':
            query += ' ORDER BY b.created_at ASC';
            break;
        case 'copies-desc':
            query += ' ORDER BY b.copies DESC';
            break;
        case 'copies-asc':
            query += ' ORDER BY b.copies ASC';
            break;
        default:
            query += ' ORDER BY b.created_at DESC';
    }

    try {
        const result = await pool.query(query, params);
        res.json(result.rows.map(mapBookResponse));
    } catch (error) {
        console.warn('[DB fallback] GET /api/books:', error.message);
        res.json(localStore.getBooks(req.query));
    }
});

// Получить одну книгу
router.get('/:id', async (req, res) => {
    try {
        const bookResult = await pool.query('SELECT * FROM books WHERE id = $1', [req.params.id]);
        if (bookResult.rows.length === 0) {
            return res.status(404).json({ error: 'Book not found' });
        }

        const commentsResult = await pool.query(
            'SELECT * FROM comments WHERE book_id = $1 ORDER BY created_at DESC',
            [req.params.id]
        );

        const book = bookResult.rows[0];
        book.comments = commentsResult.rows;

        res.json(mapBookResponse(book));
    } catch (error) {
        const book = localStore.getBook(req.params.id);
        if (!book) return res.status(404).json({ error: 'Book not found' });
        res.json(book);
    }
});

// Добавить книгу (только для авторизованных)
router.post('/', authMiddleware, async (req, res) => {
    const { title, author, description, coverDataURL, copies, available } = req.body;

    if (!title || !author) {
        return res.status(400).json({ error: 'Title and author are required' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO books (title, author, description, cover_data_url, copies, available, user_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [title, author, description || '', coverDataURL || null, copies || 1, available !== false, req.user.id]
        );

        const created = await ensureBookQrCode(result.rows[0].id);
        res.status(201).json(mapBookResponse({ ...created, comments: [] }));
    } catch (error) {
        try {
            res.status(201).json(localStore.addBook(req.user, req.body));
        } catch (fallbackError) {
            res.status(500).json({ error: 'Failed to add book' });
        }
    }
});

// Обновить книгу
router.put('/:id', authMiddleware, async (req, res) => {
    const { title, author, description, coverDataURL, copies, available } = req.body;

    try {
        const result = await pool.query(
            `UPDATE books 
             SET title = COALESCE($1, title),
                 author = COALESCE($2, author),
                 description = COALESCE($3, description),
                 cover_data_url = COALESCE($4, cover_data_url),
                 copies = COALESCE($5, copies),
                 available = COALESCE($6, available)
             WHERE id = $7 RETURNING *`,
            [title, author, description, coverDataURL, copies, available, req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Book not found' });
        }

        let book = result.rows[0];
        if (!book.qr_code) {
            book = await ensureBookQrCode(book.id);
        }

        res.json(mapBookResponse(book));
    } catch (error) {
        const book = localStore.updateBook(req.params.id, req.body);
        if (!book) return res.status(404).json({ error: 'Book not found' });
        res.json(book);
    }
});

// Удалить книгу
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM books WHERE id = $1 RETURNING id', [req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Book not found' });
        }

        res.json({ message: 'Book deleted successfully' });
    } catch (error) {
        try {
            const deleted = localStore.deleteBook(req.params.id, req.user);
            if (!deleted) return res.status(404).json({ error: 'Book not found' });
            res.json({ message: 'Book deleted successfully' });
        } catch (fallbackError) {
            res.status(500).json({ error: 'Failed to delete book' });
        }
    }
});

module.exports = router;
