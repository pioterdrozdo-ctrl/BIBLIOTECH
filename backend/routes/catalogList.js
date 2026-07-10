const express = require('express');
const pool = require('../db/pool');
const localStore = require('../services/registerReservationFallback');
const { optionalAuthMiddleware } = require('../middleware/auth');
const { normalizeBookQrFields } = require('../utils/bookQr');
const { ensureBookMetadataSchema } = require('../services/bookMetadataSchema');
const {
    ensureReservationSchema,
    reconcileReservationQueues,
    getReservationSummaries,
    attachReservationFields
} = require('../services/reservationQueue');

const router = express.Router();

function mapListBook(book) {
    const { cover_data_url, coverDataURL, ...bookData } = book;
    const locationId = book.location_id || book.locationId || book.location?.id || null;
    const location = book.location || (locationId ? {
        id: locationId,
        shelf_code: book.shelf_code || book.location_shelf_code || '',
        shelfCode: book.shelf_code || book.location_shelf_code || '',
        place_code: book.place_code || book.location_place_code || '',
        placeCode: book.place_code || book.location_place_code || '',
        note: book.location_note || book.note || ''
    } : null);
    const activeRentalsCount = Number(book.active_rentals_count || book.activeRentalsCount || 0);
    const myRentalId = book.my_rental_id || book.myRentalId || null;
    return {
        ...bookData,
        ...normalizeBookQrFields(book),
        publicationYear: book.publication_year ?? book.publicationYear ?? null,
        metadataSource: book.metadata_source || book.metadataSource || null,
        metadataSourceUrl: book.metadata_source_url || book.metadataSourceUrl || null,
        metadataUpdatedAt: book.metadata_updated_at || book.metadataUpdatedAt || null,
        location_id: locationId,
        locationId,
        location,
        active_rentals_count: activeRentalsCount,
        activeRentalsCount,
        my_rental_id: myRentalId,
        myRentalId,
        rentedByMe: Boolean(myRentalId || book.rentedByMe),
        coverDataURL: coverDataURL || cover_data_url || null
    };
}

async function ensureCatalogListSchema() {
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
            returned_at TIMESTAMP,
            due_at TIMESTAMP
        );
        ALTER TABLE book_rentals ADD COLUMN IF NOT EXISTS due_at TIMESTAMP;
        CREATE INDEX IF NOT EXISTS idx_books_location_id ON books(location_id);
        CREATE INDEX IF NOT EXISTS idx_book_rentals_book_id ON book_rentals(book_id);
        CREATE INDEX IF NOT EXISTS idx_book_rentals_user_id ON book_rentals(user_id);
        INSERT INTO storage_locations (shelf_code, place_code, note)
        VALUES ('ИКТ-ФВ 13', '09', 'Надставка'), ('ИКТ-ФВ 13', '12', 'Надставка')
        ON CONFLICT DO NOTHING;
    `);
    await ensureBookMetadataSchema();
    await ensureReservationSchema();
}

router.get('/', optionalAuthMiddleware, async (req, res, next) => {
    const { filter, sort, search, minCopies } = req.query;

    let query = `
        SELECT b.id,
               b.title,
               b.author,
               b.description,
               b.cover_data_url,
               b.copies,
               b.available,
               b.created_at,
               b.qr_code,
               b.location_id,
               b.isbn,
               b.publication_year,
               b.publisher,
               b.genre,
               b.language,
               b.metadata_source,
               b.metadata_source_url,
               b.metadata_updated_at,
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

    if (search && search.trim()) {
        conditions.push(`(
            b.title ILIKE $${paramCounter}
            OR b.author ILIKE $${paramCounter}
            OR b.description ILIKE $${paramCounter}
            OR c.text ILIKE $${paramCounter}
            OR b.qr_code ILIKE $${paramCounter}
            OR b.isbn ILIKE $${paramCounter}
            OR b.publisher ILIKE $${paramCounter}
            OR b.genre ILIKE $${paramCounter}
            OR b.language ILIKE $${paramCounter}
            OR CAST(b.publication_year AS TEXT) ILIKE $${paramCounter}
            OR l.shelf_code ILIKE $${paramCounter}
            OR l.place_code ILIKE $${paramCounter}
            OR l.note ILIKE $${paramCounter}
        )`);
        params.push(`%${search}%`);
        paramCounter++;
    }

    if (filter === 'available') conditions.push('b.available = true');
    if (filter === 'unavailable') conditions.push('b.available = false');
    if (minCopies && parseInt(minCopies, 10) > 0) {
        conditions.push(`b.copies >= $${paramCounter}`);
        params.push(parseInt(minCopies, 10));
        paramCounter++;
    }

    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' GROUP BY b.id, l.id, l.shelf_code, l.place_code, l.note';

    switch (sort) {
        case 'title-asc': query += ' ORDER BY b.title ASC'; break;
        case 'title-desc': query += ' ORDER BY b.title DESC'; break;
        case 'author-asc': query += ' ORDER BY b.author ASC'; break;
        case 'date-oldest': query += ' ORDER BY b.created_at ASC'; break;
        case 'copies-desc': query += ' ORDER BY b.copies DESC'; break;
        case 'copies-asc': query += ' ORDER BY b.copies ASC'; break;
        case 'available-first': query += ' ORDER BY b.available DESC, b.title ASC'; break;
        case 'date-newest':
        default: query += ' ORDER BY b.created_at DESC'; break;
    }

    try {
        await ensureCatalogListSchema();
        await reconcileReservationQueues();
        const result = await pool.query(query, params);
        const summaries = await getReservationSummaries(pool, result.rows.map(book => book.id), req.user?.id || null);
        const books = result.rows
            .map(book => attachReservationFields(book, summaries.get(Number(book.id))))
            .map(mapListBook);
        res.json(books);
    } catch (error) {
        if (!pool.isConfigured) {
            res.json(localStore.getBooks(req.query, req.user).map(mapListBook));
            return;
        }
        next(error);
    }
});

module.exports = router;
