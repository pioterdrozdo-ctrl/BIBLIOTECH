'use strict';

const express = require('express');
const pool = require('../db/pool');
const { authMiddleware, isAdmin } = require('../middleware/auth');
const localInventory = require('../services/localInventoryStore');

const router = express.Router();

router.use(authMiddleware, isAdmin);

async function ensureSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS inventory_sessions (
            id SERIAL PRIMARY KEY,
            name VARCHAR(160) NOT NULL,
            location_id INTEGER REFERENCES storage_locations(id) ON DELETE SET NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'active',
            created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_by_username VARCHAR(80),
            notes VARCHAR(500),
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS inventory_scans (
            id SERIAL PRIMARY KEY,
            session_id INTEGER NOT NULL REFERENCES inventory_sessions(id) ON DELETE CASCADE,
            book_id INTEGER REFERENCES books(id) ON DELETE SET NULL,
            scanned_code TEXT NOT NULL,
            result VARCHAR(20) NOT NULL,
            scanned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            scanned_by_username VARCHAR(80),
            scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_inventory_sessions_started ON inventory_sessions(started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_inventory_scans_session ON inventory_scans(session_id, scanned_at DESC);
        CREATE INDEX IF NOT EXISTS idx_inventory_scans_book ON inventory_scans(session_id, book_id);
    `);
}

function parseBookId(value = '') {
    const text = String(value).trim();
    const match = text.match(/^bibliotech:\/\/book\/(\d+)/i)
        || text.match(/[?&]book=(\d+)/i)
        || text.match(/^book:(\d+)$/i)
        || text.match(/^BT0*(\d+)$/i);
    return match ? Number(match[1]) : null;
}

function normalizeCode(value = '') {
    return String(value).trim().replace(/\s+/g, '');
}

function mapLocation(row = {}) {
    if (!row.location_id) return null;
    return {
        id: Number(row.location_id),
        shelfCode: row.shelf_code || '',
        shelf_code: row.shelf_code || '',
        placeCode: row.place_code || '',
        place_code: row.place_code || '',
        note: row.location_note || ''
    };
}

function mapBook(row) {
    if (!row || !row.id) return null;
    return {
        id: Number(row.id),
        title: row.title,
        author: row.author,
        copies: Number(row.copies || 0),
        qrCode: row.qr_code || null,
        qr_code: row.qr_code || null,
        isbn: row.isbn || null,
        locationId: row.location_id || null,
        location_id: row.location_id || null,
        location: mapLocation(row)
    };
}

async function readSessionRow(sessionId) {
    const result = await pool.query(`
        SELECT s.*, l.shelf_code, l.place_code, l.note AS location_note
        FROM inventory_sessions s
        LEFT JOIN storage_locations l ON l.id = s.location_id
        WHERE s.id = $1
    `, [sessionId]);
    return result.rows[0] || null;
}

async function buildSession(sessionId) {
    const session = await readSessionRow(sessionId);
    if (!session) return null;
    const expectedResult = await pool.query(`
        SELECT b.id, b.title, b.author, b.copies, b.qr_code, b.isbn, b.location_id,
               l.shelf_code, l.place_code, l.note AS location_note
        FROM books b
        LEFT JOIN storage_locations l ON l.id = b.location_id
        WHERE b.copies > 0
          AND ($1::integer IS NULL OR b.location_id = $1)
        ORDER BY b.title, b.author, b.id
    `, [session.location_id || null]);
    const scansResult = await pool.query(`
        SELECT s.*, b.title, b.author, b.copies, b.qr_code, b.isbn, b.location_id,
               l.shelf_code, l.place_code, l.note AS location_note
        FROM inventory_scans s
        LEFT JOIN books b ON b.id = s.book_id
        LEFT JOIN storage_locations l ON l.id = b.location_id
        WHERE s.session_id = $1
        ORDER BY s.scanned_at DESC, s.id DESC
    `, [sessionId]);
    const expected = expectedResult.rows.map(mapBook);
    const expectedIds = new Set(expected.map(book => book.id));
    const firstMatchedByBook = new Map();
    for (const row of scansResult.rows.slice().reverse()) {
        if (row.book_id && !firstMatchedByBook.has(Number(row.book_id))) firstMatchedByBook.set(Number(row.book_id), row);
    }
    const foundIds = new Set([...firstMatchedByBook.keys()].filter(id => expectedIds.has(id)));
    const found = expected.filter(book => foundIds.has(book.id));
    const missing = expected.filter(book => !foundIds.has(book.id));
    const misplaced = [...firstMatchedByBook.entries()]
        .filter(([id, row]) => !expectedIds.has(id) || row.result === 'misplaced')
        .map(([, row]) => ({ ...mapBook(row), scannedAt: row.scanned_at }));
    const scans = scansResult.rows.slice(0, 80).map(row => ({
        id: Number(row.id),
        session_id: Number(row.session_id),
        book_id: row.book_id ? Number(row.book_id) : null,
        scanned_code: row.scanned_code,
        result: row.result,
        scanned_by: row.scanned_by,
        scanned_by_username: row.scanned_by_username,
        scanned_at: row.scanned_at,
        book: mapBook(row)
    }));
    const sumCopies = books => books.reduce((sum, book) => sum + Number(book.copies || 0), 0);
    return {
        ...session,
        id: Number(session.id),
        locationId: session.location_id || null,
        location: mapLocation(session),
        report: {
            expected,
            found,
            missing,
            misplaced,
            scans,
            summary: {
                expectedTitles: expected.length,
                expectedCopies: sumCopies(expected),
                foundTitles: found.length,
                foundCopies: sumCopies(found),
                missingTitles: missing.length,
                missingCopies: sumCopies(missing),
                misplacedTitles: misplaced.length,
                unknownScans: scansResult.rows.filter(row => row.result === 'unknown').length,
                duplicateScans: scansResult.rows.filter(row => row.result === 'duplicate').length,
                totalScans: scansResult.rows.length
            }
        }
    };
}

async function findBook(rawCode) {
    const code = normalizeCode(rawCode);
    const parsedId = parseBookId(rawCode);
    const result = await pool.query(`
        SELECT b.*, l.shelf_code, l.place_code, l.note AS location_note
        FROM books b
        LEFT JOIN storage_locations l ON l.id = b.location_id
        WHERE ($1::integer IS NOT NULL AND b.id = $1)
           OR LOWER(COALESCE(b.qr_code, '')) = LOWER($2)
           OR (
                COALESCE(b.isbn, '') <> ''
                AND LENGTH(REGEXP_REPLACE($2, '[^0-9Xx]', '', 'g')) IN (10, 13)
                AND REGEXP_REPLACE(b.isbn, '[^0-9Xx]', '', 'g') = REGEXP_REPLACE($2, '[^0-9Xx]', '', 'g')
           )
        ORDER BY CASE WHEN LOWER(COALESCE(b.qr_code, '')) = LOWER($2) THEN 0 ELSE 1 END, b.id
        LIMIT 1
    `, [parsedId, code]);
    return result.rows[0] || null;
}

router.get('/', async (req, res) => {
    try {
        await ensureSchema();
        const result = await pool.query(`
            SELECT s.*, l.shelf_code, l.place_code, l.note AS location_note,
                   COUNT(sc.id)::integer AS total_scans
            FROM inventory_sessions s
            LEFT JOIN storage_locations l ON l.id = s.location_id
            LEFT JOIN inventory_scans sc ON sc.session_id = s.id
            GROUP BY s.id, l.id, l.shelf_code, l.place_code, l.note
            ORDER BY s.started_at DESC
            LIMIT 30
        `);
        res.json({ sessions: result.rows.map(row => ({
            ...row,
            id: Number(row.id),
            locationId: row.location_id || null,
            location: mapLocation(row)
        })) });
    } catch (error) {
        if (pool.isConfigured) return res.status(500).json({ error: 'Не удалось загрузить инвентаризации' });
        res.json({ sessions: localInventory.listSessions() });
    }
});

router.post('/', async (req, res) => {
    const name = String(req.body.name || '').trim() || `Инвентаризация ${new Date().toLocaleDateString('ru-RU')}`;
    const locationId = req.body.locationId || req.body.location_id || null;
    try {
        await ensureSchema();
        if (locationId) {
            const location = await pool.query('SELECT id FROM storage_locations WHERE id = $1', [locationId]);
            if (!location.rows.length) return res.status(400).json({ error: 'Место хранения не найдено' });
        }
        const result = await pool.query(`
            INSERT INTO inventory_sessions (name, location_id, created_by, created_by_username, notes)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
        `, [name.slice(0, 160), locationId || null, req.user.id, req.user.username, String(req.body.notes || '').trim().slice(0, 500)]);
        res.status(201).json({ session: await buildSession(result.rows[0].id) });
    } catch (error) {
        if (pool.isConfigured) return res.status(500).json({ error: 'Не удалось начать инвентаризацию' });
        try {
            res.status(201).json({ session: localInventory.createSession(req.user, req.body) });
        } catch (fallbackError) {
            res.status(400).json({ error: fallbackError.message });
        }
    }
});

router.get('/:id', async (req, res) => {
    try {
        await ensureSchema();
        const session = await buildSession(req.params.id);
        if (!session) return res.status(404).json({ error: 'Инвентаризация не найдена' });
        res.json({ session });
    } catch (error) {
        if (pool.isConfigured) return res.status(500).json({ error: 'Не удалось загрузить инвентаризацию' });
        const session = localInventory.getSession(req.params.id);
        if (!session) return res.status(404).json({ error: 'Инвентаризация не найдена' });
        res.json({ session });
    }
});

router.post('/:id/scan', async (req, res) => {
    const code = String(req.body.code || req.body.qr || '').trim();
    if (!code) return res.status(400).json({ error: 'Введите QR-код или ISBN' });
    try {
        await ensureSchema();
        const session = await readSessionRow(req.params.id);
        if (!session) return res.status(404).json({ error: 'Инвентаризация не найдена' });
        if (session.status !== 'active') return res.status(409).json({ error: 'Инвентаризация уже завершена' });
        const book = await findBook(code);
        let result = 'unknown';
        if (book) {
            const prior = await pool.query(
                `SELECT id FROM inventory_scans WHERE session_id = $1 AND book_id = $2 AND result <> 'unknown' LIMIT 1`,
                [session.id, book.id]
            );
            if (prior.rows.length) result = 'duplicate';
            else if (session.location_id && Number(book.location_id) !== Number(session.location_id)) result = 'misplaced';
            else result = 'found';
        }
        const inserted = await pool.query(`
            INSERT INTO inventory_scans (session_id, book_id, scanned_code, result, scanned_by, scanned_by_username)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [session.id, book?.id || null, code, result, req.user.id, req.user.username]);
        res.status(result === 'unknown' ? 404 : 201).json({
            event: { ...inserted.rows[0], book: mapBook(book) },
            session: await buildSession(session.id)
        });
    } catch (error) {
        if (pool.isConfigured) return res.status(500).json({ error: 'Не удалось сохранить сканирование' });
        try {
            const payload = localInventory.scan(req.params.id, req.user, code);
            if (!payload) return res.status(404).json({ error: 'Инвентаризация не найдена' });
            res.status(payload.event.result === 'unknown' ? 404 : 201).json(payload);
        } catch (fallbackError) {
            res.status(fallbackError.code === 'SESSION_CLOSED' ? 409 : 400).json({ error: fallbackError.message });
        }
    }
});

router.post('/:id/complete', async (req, res) => {
    try {
        await ensureSchema();
        const result = await pool.query(`
            UPDATE inventory_sessions
            SET status = 'completed', completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)
            WHERE id = $1
            RETURNING id
        `, [req.params.id]);
        if (!result.rows.length) return res.status(404).json({ error: 'Инвентаризация не найдена' });
        res.json({ session: await buildSession(req.params.id) });
    } catch (error) {
        if (pool.isConfigured) return res.status(500).json({ error: 'Не удалось завершить инвентаризацию' });
        const session = localInventory.completeSession(req.params.id);
        if (!session) return res.status(404).json({ error: 'Инвентаризация не найдена' });
        res.json({ session });
    }
});

router.buildSession = buildSession;

module.exports = router;
