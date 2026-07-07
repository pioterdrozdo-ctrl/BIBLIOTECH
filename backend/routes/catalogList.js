const express = require('express');
const pool = require('../db/pool');
const localStore = require('../services/localStore');
const { normalizeBookQrFields } = require('../utils/bookQr');

const router = express.Router();

const DEMO_BOOK_SIGNATURES = new Set([
    ['Мастер и Маргарита', 'Михаил Булгаков'],
    ['Преступление и наказание', 'Фёдор Достоевский'],
    ['Преступление и наказание', 'Федор Достоевский'],
    ['1984', 'Джордж Оруэлл'],
    ['Алхимик', 'Пауло Коэльо'],
    ['Маленький принц', 'Антуан де Сент-Экзюпери'],
    ['Война и мир', 'Лев Толстой']
].map(([title, author]) => `${normalizeText(title)}::${normalizeText(author)}`));

function normalizeText(value = '') {
    return String(value)
        .toLowerCase()
        .replace(/ё/g, 'е')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zа-я0-9\s]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function isDemoBook(book) {
    return DEMO_BOOK_SIGNATURES.has(`${normalizeText(book.title)}::${normalizeText(book.author)}`);
}

function mapListBook(book) {
    const { cover_data_url, coverDataURL, ...bookData } = book;
    return {
        ...bookData,
        ...normalizeBookQrFields(book),
        coverDataURL: null
    };
}

router.get('/', async (req, res, next) => {
    const { filter, sort, search, minCopies } = req.query;

    let query = `
        SELECT b.id,
               b.title,
               b.author,
               b.description,
               b.copies,
               b.available,
               b.created_at,
               b.updated_at,
               b.user_id,
               b.qr_code,
               COALESCE(json_agg(json_build_object('id', c.id, 'text', c.text, 'date', c.created_at, 'created_at', c.created_at, 'username', c.username, 'user_id', c.user_id))
                        FILTER (WHERE c.id IS NOT NULL), '[]') as comments
        FROM books b
        LEFT JOIN comments c ON b.id = c.book_id
    `;

    const conditions = [];
    const params = [];
    let paramCounter = 1;

    if (search && search.trim()) {
        conditions.push(`(b.title ILIKE $${paramCounter} OR b.author ILIKE $${paramCounter} OR b.description ILIKE $${paramCounter} OR b.qr_code ILIKE $${paramCounter})`);
        params.push(`%${search}%`);
        paramCounter++;
    }

    if (filter === 'available') conditions.push('b.available = true');
    if (filter === 'unavailable') conditions.push('b.available = false');
    if (minCopies && parseInt(minCopies) > 0) {
        conditions.push(`b.copies >= $${paramCounter}`);
        params.push(parseInt(minCopies));
        paramCounter++;
    }

    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' GROUP BY b.id';

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
        case 'date-oldest':
            query += ' ORDER BY b.created_at ASC';
            break;
        case 'copies-desc':
            query += ' ORDER BY b.copies DESC';
            break;
        case 'copies-asc':
            query += ' ORDER BY b.copies ASC';
            break;
        case 'available-first':
            query += ' ORDER BY b.available DESC, b.title ASC';
            break;
        case 'date-newest':
        default:
            query += ' ORDER BY b.created_at DESC';
            break;
    }

    try {
        const result = await pool.query(query, params);
        res.json(result.rows.filter(book => !isDemoBook(book)).map(mapListBook));
    } catch (error) {
        if (!pool.isConfigured) {
            res.json(localStore.getBooks(req.query).filter(book => !isDemoBook(book)).map(mapListBook));
            return;
        }
        next(error);
    }
});

module.exports = router;
