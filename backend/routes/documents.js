'use strict';

const express = require('express');
const os = require('os');
const pool = require('../db/pool');
const { authMiddleware, isAdmin } = require('../middleware/auth');
const localStore = require('../services/localStore');
const localInventory = require('../services/localInventoryStore');
const inventoryRoutes = require('./inventory');
const {
    createLabelsPdf,
    createRentalActPdf,
    createWriteoffActPdf,
    createInventoryReportPdf
} = require('../services/pdfDocuments');

const router = express.Router();

router.use(authMiddleware, isAdmin);

function parseBookId(value = '') {
    const text = String(value).trim();
    const match = text.match(/^bibliotech:\/\/book\/(\d+)/i)
        || text.match(/[?&]book=(\d+)/i)
        || text.match(/^book:(\d+)$/i)
        || text.match(/^BT0*(\d+)$/i);
    return match ? Number(match[1]) : null;
}

function normalizeCode(value = '') {
    return String(value).trim().replace(/[^0-9A-Za-z]/g, '').toLowerCase();
}

function codesFrom(value) {
    if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
    return String(value || '').split(/[\n,;]+/).map(item => item.trim()).filter(Boolean);
}

function mapBook(row = {}) {
    return {
        ...row,
        id: Number(row.id),
        copies: Number(row.copies || 0),
        qrCode: row.qr_code || row.qrCode || null,
        location: row.location || (row.location_id ? {
            id: Number(row.location_id),
            shelfCode: row.shelf_code || '',
            shelf_code: row.shelf_code || '',
            placeCode: row.place_code || '',
            place_code: row.place_code || '',
            note: row.location_note || ''
        } : null)
    };
}

function normalizeHttpOrigin(value) {
    try {
        const url = new URL(String(value || '').trim());
        if (!['http:', 'https:'].includes(url.protocol)) return null;
        return url.origin;
    } catch {
        return null;
    }
}

function findLanIpv4() {
    const addresses = Object.values(os.networkInterfaces())
        .flat()
        .filter(address => address && address.family === 'IPv4' && !address.internal)
        .map(address => address.address);
    return addresses.find(address => address.startsWith('192.168.'))
        || addresses.find(address => address.startsWith('10.'))
        || addresses.find(address => /^172\.(1[6-9]|2\d|3[01])\./.test(address))
        || addresses[0]
        || null;
}

function publicAppOrigin(req) {
    const configuredOrigin = normalizeHttpOrigin(process.env.PUBLIC_APP_URL || process.env.RENDER_EXTERNAL_URL);
    if (configuredOrigin) return configuredOrigin;

    const requestOrigin = normalizeHttpOrigin(`${req.protocol}://${req.get('host')}`);
    if (!requestOrigin) return null;

    const url = new URL(requestOrigin);
    if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
        const lanAddress = findLanIpv4();
        if (lanAddress) return `${url.protocol}//${lanAddress}${url.port ? `:${url.port}` : ''}`;
    }
    return url.origin;
}

function buildBookLink(req, bookId) {
    const origin = publicAppOrigin(req);
    if (!origin || !Number.isFinite(Number(bookId))) return null;
    const url = new URL('/home.html', `${origin}/`);
    url.searchParams.set('book', String(bookId));
    return url.toString();
}

async function readBooks() {
    try {
        const result = await pool.query(`
            SELECT b.*, l.shelf_code, l.place_code, l.note AS location_note
            FROM books b
            LEFT JOIN storage_locations l ON l.id = b.location_id
            ORDER BY b.title, b.author, b.id
        `);
        return result.rows.map(mapBook);
    } catch (error) {
        if (pool.isConfigured) throw error;
        return localStore.getBooks({ sort: 'title-asc' }).map(mapBook);
    }
}

async function selectBooks(body = {}) {
    const books = await readBooks();
    const requestedIds = new Set((body.bookIds || body.book_ids || []).map(Number).filter(Number.isFinite));
    const requestedCodes = codesFrom(body.codes || body.bookCodes || body.book_codes);
    const parsedIds = new Set(requestedCodes.map(parseBookId).filter(Boolean));
    const normalizedCodes = new Set(requestedCodes.map(normalizeCode).filter(Boolean));
    const locationId = body.locationId || body.location_id || null;
    const hasExplicitSelection = requestedIds.size > 0 || parsedIds.size > 0 || normalizedCodes.size > 0;
    return books.filter(book => {
        if (locationId && Number(book.location_id || book.locationId) !== Number(locationId)) return false;
        if (!hasExplicitSelection) return true;
        const identifiers = [book.qr_code, book.qrCode, book.isbn, book.id].map(normalizeCode).filter(Boolean);
        return requestedIds.has(Number(book.id))
            || parsedIds.has(Number(book.id))
            || identifiers.some(identifier => normalizedCodes.has(identifier));
    }).slice(0, 500);
}

function sendPdf(res, buffer, filename) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
}

router.post('/labels', async (req, res) => {
    try {
        const books = await selectBooks(req.body);
        if (!books.length) return res.status(404).json({ error: 'Не найдены книги для этикеток' });
        const printableBooks = books.map(book => ({
            ...book,
            qrLink: buildBookLink(req, book.id)
        }));
        sendPdf(res, await createLabelsPdf(printableBooks), `bibliotech-labels-${Date.now()}.pdf`);
    } catch (error) {
        console.error('[PDF] labels:', error);
        res.status(500).json({ error: 'Не удалось сформировать этикетки' });
    }
});

router.post('/writeoff', async (req, res) => {
    try {
        const books = await selectBooks(req.body);
        if (!books.length || (!codesFrom(req.body.codes || req.body.bookCodes).length && !(req.body.bookIds || []).length)) {
            return res.status(400).json({ error: 'Укажите QR, ISBN или ID книг для акта' });
        }
        const reason = String(req.body.reason || '').trim();
        sendPdf(res, await createWriteoffActPdf(books, reason), `bibliotech-writeoff-${Date.now()}.pdf`);
    } catch (error) {
        console.error('[PDF] writeoff:', error);
        res.status(500).json({ error: 'Не удалось сформировать акт списания' });
    }
});

router.post('/inventory/:id/report', async (req, res) => {
    try {
        let session;
        try {
            session = await inventoryRoutes.buildSession(req.params.id);
        } catch (error) {
            if (pool.isConfigured) throw error;
            session = localInventory.getSession(req.params.id);
        }
        if (!session) return res.status(404).json({ error: 'Инвентаризация не найдена' });
        sendPdf(res, await createInventoryReportPdf(session), `bibliotech-inventory-${session.id}.pdf`);
    } catch (error) {
        console.error('[PDF] inventory:', error);
        res.status(500).json({ error: 'Не удалось сформировать отчёт инвентаризации' });
    }
});

router.post('/rentals/:id/act', async (req, res) => {
    try {
        let rental;
        try {
            const result = await pool.query(`
                SELECT r.*, b.title AS book_title, b.author AS book_author, b.qr_code, b.isbn
                FROM book_rentals r
                JOIN books b ON b.id = r.book_id
                WHERE r.id = $1
            `, [req.params.id]);
            rental = result.rows[0] || null;
        } catch (error) {
            if (pool.isConfigured) throw error;
            rental = localStore.listRentalsForAdmin().find(item => Number(item.id) === Number(req.params.id)) || null;
            if (rental) {
                const book = localStore.getBook(rental.book_id);
                rental = { ...rental, book_author: book?.author, qr_code: book?.qr_code, isbn: book?.isbn };
            }
        }
        if (!rental) return res.status(404).json({ error: 'Выдача не найдена' });
        sendPdf(res, await createRentalActPdf(rental), `bibliotech-rental-${rental.id}.pdf`);
    } catch (error) {
        console.error('[PDF] rental:', error);
        res.status(500).json({ error: 'Не удалось сформировать акт выдачи' });
    }
});

module.exports = router;
