const express = require('express');
const pool = require('../db/pool');
const { authMiddleware, optionalAuthMiddleware, isAdmin } = require('../middleware/auth');
const localStore = require('../services/localStore');
const { buildBookQrCode, buildBookQrPayload, normalizeBookQrFields } = require('../utils/bookQr');
const router = express.Router();

function mapBookResponse(book) {
    const qrFields = normalizeBookQrFields(book);
    const location = book.location || (book.location_id ? {
        id: book.location_id,
        shelf_code: book.shelf_code || book.location_shelf_code || '',
        shelfCode: book.shelf_code || book.location_shelf_code || '',
        place_code: book.place_code || book.location_place_code || '',
        placeCode: book.place_code || book.location_place_code || '',
        note: book.location_note || book.note || ''
    } : null);
    const activeRentalsCount = Number(book.active_rentals_count || book.activeRentalsCount || 0);
    const myRentalId = book.my_rental_id || book.myRentalId || null;
    return {
        ...book,
        ...qrFields,
        location_id: book.location_id || null,
        locationId: book.location_id || null,
        location,
        active_rentals_count: activeRentalsCount,
        activeRentalsCount,
        my_rental_id: myRentalId,
        myRentalId,
        rentedByMe: Boolean(myRentalId || book.rentedByMe),
        coverDataURL: book.cover_data_url || book.coverDataURL || null
    };
}

async function ensureLibrarySchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS storage_locations (
            id SERIAL PRIMARY KEY,
            shelf_code VARCHAR(80) NOT NULL,
            place_code VARCHAR(80) NOT NULL,
            note VARCHAR(160),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (shelf_code, place_code, note)
        );
        ALTER TABLE books ADD COLUMN IF NOT EXISTS location_id INTEGER REFERENCES storage_locations(id) ON DELETE SET NULL;
        CREATE TABLE IF NOT EXISTS book_rentals (
            id SERIAL PRIMARY KEY,
            book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            username VARCHAR(50),
            rented_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            returned_at TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_books_location_id ON books(location_id);
        CREATE INDEX IF NOT EXISTS idx_book_rentals_book_id ON book_rentals(book_id);
        CREATE INDEX IF NOT EXISTS idx_book_rentals_user_id ON book_rentals(user_id);
        INSERT INTO storage_locations (shelf_code, place_code, note)
        VALUES ('ИКТ-ФВ 13', '09', 'Надставка'), ('ИКТ-ФВ 13', '12', 'Надставка')
        ON CONFLICT DO NOTHING;
    `);
}

async function ensureBookQrCode(bookId) {
    const qrCode = buildBookQrCode(bookId);
    const result = await pool.query(
        'UPDATE books SET qr_code = $1 WHERE id = $2 RETURNING *',
        [qrCode, bookId]
    );
    return result.rows[0];
}

async function fetchBookDetail(bookId, userId = null) {
    const result = await pool.query(`
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
    if (!result.rows.length) return null;
    const commentsResult = await pool.query(
        'SELECT * FROM comments WHERE book_id = $1 ORDER BY created_at DESC',
        [bookId]
    );
    return mapBookResponse({ ...result.rows[0], comments: commentsResult.rows });
}

// Получить все книги с фильтрацией
router.get('/', optionalAuthMiddleware, async (req, res) => {
    const { filter, sort, search, minCopies } = req.query;

    let query = `
        SELECT b.*,
               l.shelf_code,
               l.place_code,
               l.note AS location_note,
               (SELECT COUNT(*) FROM book_rentals br WHERE br.book_id = b.id AND br.returned_at IS NULL) AS active_rentals_count,
               (SELECT br.id FROM book_rentals br WHERE br.book_id = b.id AND br.user_id = $1 AND br.returned_at IS NULL LIMIT 1) AS my_rental_id,
               COALESCE(json_agg(json_build_object('id', c.id, 'text', c.text, 'date', c.created_at, 'created_at', c.created_at, 'username', c.username, 'user_id', c.user_id)) 
                        FILTER (WHERE c.id IS NOT NULL), '[]') as comments
        FROM books b
        LEFT JOIN storage_locations l ON l.id = b.location_id
        LEFT JOIN comments c ON b.id = c.book_id
    `;

    const conditions = [];
    const params = [req.user?.id || null];
    let paramCounter = 2;

    // Поиск
    if (search && search.trim()) {
        conditions.push(`(b.title ILIKE $${paramCounter} OR b.author ILIKE $${paramCounter} OR b.description ILIKE $${paramCounter} OR b.qr_code ILIKE $${paramCounter} OR l.shelf_code ILIKE $${paramCounter} OR l.place_code ILIKE $${paramCounter} OR l.note ILIKE $${paramCounter})`);
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

    query += ' GROUP BY b.id, l.id, l.shelf_code, l.place_code, l.note';

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
        await ensureLibrarySchema();
        const result = await pool.query(query, params);
        res.json(result.rows.map(mapBookResponse));
    } catch (error) {
        console.warn('[DB fallback] GET /api/books:', error.message);
        res.json(localStore.getBooks(req.query, req.user));
    }
});

// Получить одну книгу
router.get('/:id', optionalAuthMiddleware, async (req, res) => {
    try {
        await ensureLibrarySchema();
        const book = await fetchBookDetail(req.params.id, req.user?.id || null);
        if (!book) {
            return res.status(404).json({ error: 'Book not found' });
        }

        res.json(book);
    } catch (error) {
        const book = localStore.getBook(req.params.id, req.user);
        if (!book) return res.status(404).json({ error: 'Book not found' });
        res.json(book);
    }
});

// Добавить книгу (только админ)
router.post('/', authMiddleware, isAdmin, async (req, res) => {
    const { title, author, description, coverDataURL, copies, available, locationId, location_id } = req.body;

    if (!title || !author) {
        return res.status(400).json({ error: 'Title and author are required' });
    }

    try {
        await ensureLibrarySchema();
        const normalizedLocationId = locationId ?? location_id ?? null;
        const result = await pool.query(
            `INSERT INTO books (title, author, description, cover_data_url, copies, available, location_id, user_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [title, author, description || '', coverDataURL || null, copies || 1, available !== false, normalizedLocationId || null, req.user.id]
        );

        const created = await ensureBookQrCode(result.rows[0].id);
        const hydrated = await fetchBookDetail(created.id, req.user.id);
        res.status(201).json(hydrated || mapBookResponse({ ...created, comments: [] }));
    } catch (error) {
        try {
            res.status(201).json(localStore.addBook(req.user, req.body));
        } catch (fallbackError) {
            res.status(500).json({ error: 'Failed to add book' });
        }
    }
});

// Обновить книгу (только админ)
router.put('/:id', authMiddleware, isAdmin, async (req, res) => {
    const { title, author, description, coverDataURL, copies, available, locationId, location_id } = req.body;

    try {
        await ensureLibrarySchema();
        const locationProvided = Object.prototype.hasOwnProperty.call(req.body, 'locationId')
            || Object.prototype.hasOwnProperty.call(req.body, 'location_id');
        const rawLocationId = locationId ?? location_id;
        const normalizedLocationId = rawLocationId ? Number(rawLocationId) : null;
        const result = await pool.query(
            `UPDATE books 
             SET title = COALESCE($1, title),
                 author = COALESCE($2, author),
                 description = COALESCE($3, description),
                 cover_data_url = COALESCE($4, cover_data_url),
                 copies = COALESCE($5, copies),
                 available = COALESCE($6, available),
                 location_id = CASE WHEN $7::boolean THEN $8::integer ELSE location_id END
             WHERE id = $9 RETURNING *`,
            [title, author, description, coverDataURL, copies, available, locationProvided, normalizedLocationId, req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Book not found' });
        }

        let book = result.rows[0];
        if (!book.qr_code) {
            book = await ensureBookQrCode(book.id);
        }

        const hydrated = await fetchBookDetail(book.id, req.user.id);
        res.json(hydrated || mapBookResponse(book));
    } catch (error) {
        const book = localStore.updateBook(req.params.id, req.body);
        if (!book) return res.status(404).json({ error: 'Book not found' });
        res.json(book);
    }
});

// Удалить книгу (только админ)
router.post('/:id/rent', authMiddleware, async (req, res) => {
    try {
        await ensureLibrarySchema();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const existing = await client.query(
                'SELECT id FROM book_rentals WHERE book_id = $1 AND user_id = $2 AND returned_at IS NULL',
                [req.params.id, req.user.id]
            );
            if (existing.rows.length) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'Book already rented by this user' });
            }

            const updated = await client.query(
                `UPDATE books
                 SET copies = copies - 1,
                     available = (copies - 1) > 0
                 WHERE id = $1 AND copies > 0
                 RETURNING id`,
                [req.params.id]
            );
            if (!updated.rows.length) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'No copies available' });
            }

            const rental = await client.query(
                `INSERT INTO book_rentals (book_id, user_id, username)
                 VALUES ($1, $2, $3) RETURNING *`,
                [req.params.id, req.user.id, req.user.username]
            );
            await client.query('COMMIT');
            const book = await fetchBookDetail(req.params.id, req.user.id);
            res.status(201).json({ rental: rental.rows[0], book });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        try {
            const result = localStore.rentBook(req.params.id, req.user);
            res.status(201).json(result);
        } catch (fallbackError) {
            const status = fallbackError.code === 'NOT_FOUND' ? 404 : 409;
            res.status(status).json({ error: fallbackError.message || 'Failed to rent book' });
        }
    }
});

router.post('/:id/return', authMiddleware, async (req, res) => {
    try {
        await ensureLibrarySchema();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const rentalResult = await client.query(
                `SELECT *
                 FROM book_rentals
                 WHERE book_id = $1
                   AND returned_at IS NULL
                   AND (($4::integer IS NOT NULL AND id = $4)
                        OR ($4::integer IS NULL AND ($3::boolean OR user_id = $2)))
                 ORDER BY rented_at DESC
                 LIMIT 1`,
                [req.params.id, req.user.id, req.user.role === 'admin', req.body.rentalId || null]
            );
            if (!rentalResult.rows.length) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Active rental not found' });
            }

            const rental = rentalResult.rows[0];
            await client.query('UPDATE book_rentals SET returned_at = CURRENT_TIMESTAMP WHERE id = $1', [rental.id]);
            await client.query('UPDATE books SET copies = copies + 1, available = true WHERE id = $1', [req.params.id]);
            await client.query('COMMIT');
            const book = await fetchBookDetail(req.params.id, req.user.id);
            res.json({ rental: { ...rental, returned_at: new Date().toISOString() }, book });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        try {
            const result = localStore.returnBook(req.params.id, req.user, req.body.rentalId || null);
            res.json(result);
        } catch (fallbackError) {
            const status = fallbackError.code === 'NOT_FOUND' ? 404 : 409;
            res.status(status).json({ error: fallbackError.message || 'Failed to return book' });
        }
    }
});

router.delete('/:id', authMiddleware, isAdmin, async (req, res) => {
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
