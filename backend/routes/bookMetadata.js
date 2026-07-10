'use strict';

const express = require('express');
const pool = require('../db/pool');
const localBookMetadataStore = require('../services/localBookMetadataStore');
const { authMiddleware, isAdmin } = require('../middleware/auth');
const { buildBookQrCode, normalizeBookQrFields } = require('../utils/bookQr');
const { ensureBookMetadataSchema } = require('../services/bookMetadataSchema');
const { lookupIsbnMetadata, normalizeBookMetadataInput } = require('../services/isbnMetadata');

const router = express.Router();

function mapBook(book) {
    const location = book.location_id ? {
        id: book.location_id,
        shelf_code: book.shelf_code || '',
        shelfCode: book.shelf_code || '',
        place_code: book.place_code || '',
        placeCode: book.place_code || '',
        note: book.location_note || ''
    } : null;
    return {
        ...book,
        ...normalizeBookQrFields(book),
        publicationYear: book.publication_year ?? null,
        metadataSource: book.metadata_source || null,
        metadataSourceUrl: book.metadata_source_url || null,
        metadataUpdatedAt: book.metadata_updated_at || null,
        locationId: book.location_id || null,
        location,
        coverDataURL: book.cover_data_url || book.coverDataURL || null,
        comments: Array.isArray(book.comments) ? book.comments : []
    };
}

async function fetchBook(bookId) {
    const result = await pool.query(`
        SELECT b.*,
               l.shelf_code,
               l.place_code,
               l.note AS location_note,
               COALESCE(json_agg(json_build_object(
                    'id', c.id,
                    'text', c.text,
                    'date', c.created_at,
                    'created_at', c.created_at,
                    'username', c.username,
                    'user_id', c.user_id
               )) FILTER (WHERE c.id IS NOT NULL), '[]') AS comments
        FROM books b
        LEFT JOIN storage_locations l ON l.id = b.location_id
        LEFT JOIN comments c ON c.book_id = b.id
        WHERE b.id = $1
        GROUP BY b.id, l.id, l.shelf_code, l.place_code, l.note
    `, [bookId]);
    return result.rows[0] ? mapBook(result.rows[0]) : null;
}

function metadataErrorResponse(res, error) {
    if (error.code === 'INVALID_ISBN' || error.code === 'INVALID_PUBLICATION_YEAR') {
        res.status(400).json({ error: error.message, code: error.code });
        return true;
    }
    if (error.code === 'DUPLICATE_ISBN' || error.code === '23505') {
        res.status(409).json({
            error: 'Книга с таким ISBN уже есть в каталоге.',
            code: 'DUPLICATE_ISBN',
            bookId: error.bookId || null
        });
        return true;
    }
    return false;
}

router.get('/isbn/:isbn', authMiddleware, isAdmin, async (req, res) => {
    try {
        const metadata = await lookupIsbnMetadata(req.params.isbn);
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.json({
            metadata,
            message: 'Данные найдены. Проверьте их перед сохранением книги.'
        });
    } catch (error) {
        const status = error.code === 'INVALID_ISBN' ? 400
            : error.code === 'ISBN_NOT_FOUND' ? 404
                : error.code === 'METADATA_TIMEOUT' ? 504 : 502;
        res.status(status).json({
            error: error.message || 'Не удалось получить данные по ISBN.',
            code: error.code || 'METADATA_PROVIDER_ERROR'
        });
    }
});

router.post('/books', authMiddleware, isAdmin, async (req, res) => {
    const title = String(req.body.title || '').trim();
    const author = String(req.body.author || '').trim();
    if (!title || !author) return res.status(400).json({ error: 'Название и автор обязательны.' });

    try {
        const metadata = normalizeBookMetadataInput(req.body);
        await ensureBookMetadataSchema();
        const copies = Math.max(0, Math.min(9999, Number(req.body.copies ?? 1) || 0));
        const available = req.body.available !== false && copies > 0;
        const locationId = req.body.locationId ?? req.body.location_id ?? null;
        const result = await pool.query(`
            INSERT INTO books (
                title, author, description, cover_data_url, copies, available, location_id, user_id,
                isbn, publication_year, publisher, genre, language,
                metadata_source, metadata_source_url, metadata_updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP)
            RETURNING id
        `, [
            title,
            author,
            String(req.body.description || '').trim(),
            req.body.coverDataURL || req.body.cover_data_url || null,
            copies,
            available,
            locationId || null,
            req.user.id,
            metadata.isbn,
            metadata.publicationYear,
            metadata.publisher,
            metadata.genre,
            metadata.language,
            metadata.metadataSource,
            metadata.metadataSourceUrl
        ]);
        const bookId = result.rows[0].id;
        await pool.query('UPDATE books SET qr_code = $1 WHERE id = $2', [buildBookQrCode(bookId), bookId]);
        res.status(201).json(await fetchBook(bookId));
    } catch (error) {
        if (metadataErrorResponse(res, error)) return;
        if (!pool.isConfigured) {
            try {
                return res.status(201).json(localBookMetadataStore.addBook(req.user, req.body));
            } catch (fallbackError) {
                if (metadataErrorResponse(res, fallbackError)) return;
            }
        }
        console.error('[BOOK METADATA] Create failed:', error);
        res.status(500).json({ error: 'Не удалось добавить книгу.' });
    }
});

router.put('/books/:id', authMiddleware, isAdmin, async (req, res) => {
    try {
        const metadata = normalizeBookMetadataInput(req.body, { partial: true });
        await ensureBookMetadataSchema();
        const locationProvided = Object.prototype.hasOwnProperty.call(req.body, 'locationId')
            || Object.prototype.hasOwnProperty.call(req.body, 'location_id');
        const coverProvided = Object.prototype.hasOwnProperty.call(req.body, 'coverDataURL')
            || Object.prototype.hasOwnProperty.call(req.body, 'cover_data_url');
        const metadataProvided = field => Object.prototype.hasOwnProperty.call(metadata, field);
        const rawLocationId = req.body.locationId ?? req.body.location_id;
        const locationId = rawLocationId ? Number(rawLocationId) : null;
        const copies = req.body.copies === undefined ? null : Math.max(0, Math.min(9999, Number(req.body.copies) || 0));
        const available = req.body.available === undefined ? null : Boolean(req.body.available) && (copies === null || copies > 0);

        const result = await pool.query(`
            UPDATE books
            SET title = COALESCE($1, title),
                author = COALESCE($2, author),
                description = COALESCE($3, description),
                cover_data_url = CASE WHEN $4::boolean THEN $5::text ELSE cover_data_url END,
                copies = COALESCE($6, copies),
                available = CASE
                    WHEN $6::integer IS NOT NULL AND $6::integer <= 0 THEN false
                    ELSE COALESCE($7, available)
                END,
                location_id = CASE WHEN $8::boolean THEN $9::integer ELSE location_id END,
                isbn = CASE WHEN $10::boolean THEN $11::varchar ELSE isbn END,
                publication_year = CASE WHEN $12::boolean THEN $13::integer ELSE publication_year END,
                publisher = CASE WHEN $14::boolean THEN $15::varchar ELSE publisher END,
                genre = CASE WHEN $16::boolean THEN $17::varchar ELSE genre END,
                language = CASE WHEN $18::boolean THEN $19::varchar ELSE language END,
                metadata_source = CASE WHEN $20::boolean THEN $21::varchar ELSE metadata_source END,
                metadata_source_url = CASE WHEN $22::boolean THEN $23::text ELSE metadata_source_url END,
                metadata_updated_at = CASE WHEN $10 OR $12 OR $14 OR $16 OR $18 OR $20 OR $22 THEN CURRENT_TIMESTAMP ELSE metadata_updated_at END
            WHERE id = $24
            RETURNING id
        `, [
            req.body.title === undefined ? null : String(req.body.title).trim(),
            req.body.author === undefined ? null : String(req.body.author).trim(),
            req.body.description === undefined ? null : String(req.body.description).trim(),
            coverProvided,
            req.body.coverDataURL ?? req.body.cover_data_url ?? null,
            copies,
            available,
            locationProvided,
            locationId,
            metadataProvided('isbn'),
            metadata.isbn ?? null,
            metadataProvided('publicationYear'),
            metadata.publicationYear ?? null,
            metadataProvided('publisher'),
            metadata.publisher ?? null,
            metadataProvided('genre'),
            metadata.genre ?? null,
            metadataProvided('language'),
            metadata.language ?? null,
            metadataProvided('metadataSource'),
            metadata.metadataSource ?? null,
            metadataProvided('metadataSourceUrl'),
            metadata.metadataSourceUrl ?? null,
            req.params.id
        ]);
        if (!result.rows.length) return res.status(404).json({ error: 'Книга не найдена.' });
        const qrResult = await pool.query('SELECT qr_code FROM books WHERE id = $1', [req.params.id]);
        if (!qrResult.rows[0]?.qr_code) {
            await pool.query('UPDATE books SET qr_code = $1 WHERE id = $2', [buildBookQrCode(req.params.id), req.params.id]);
        }
        res.json(await fetchBook(req.params.id));
    } catch (error) {
        if (metadataErrorResponse(res, error)) return;
        if (!pool.isConfigured) {
            try {
                const book = localBookMetadataStore.updateBook(req.params.id, req.body, req.user);
                if (!book) return res.status(404).json({ error: 'Книга не найдена.' });
                return res.json(book);
            } catch (fallbackError) {
                if (metadataErrorResponse(res, fallbackError)) return;
            }
        }
        console.error('[BOOK METADATA] Update failed:', error);
        res.status(500).json({ error: 'Не удалось обновить книгу.' });
    }
});

module.exports = router;
