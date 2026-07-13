'use strict';

const fs = require('fs');
const path = require('path');
const localStore = require('./localStore');

const STORE_FILE = localStore.STORE_FILE;

function now() {
    return new Date().toISOString();
}

function read() {
    const store = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    if (!store.counters) store.counters = {};
    if (!Array.isArray(store.inventory_sessions)) store.inventory_sessions = [];
    if (!Array.isArray(store.inventory_scans)) store.inventory_scans = [];
    if (!Array.isArray(store.storage_locations)) store.storage_locations = [];
    if (!Array.isArray(store.books)) store.books = [];
    return store;
}

function write(store) {
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

function nextId(store, key) {
    store.counters[key] = Number(store.counters[key] || 0) + 1;
    return store.counters[key];
}

function parseBookId(value = '') {
    const text = String(value).trim();
    const match = text.match(/^bibliotech:\/\/book\/(\d+)/i)
        || text.match(/[?&]book=(\d+)/i)
        || text.match(/^book:(\d+)$/i);
    if (match) return Number(match[1]);
    const qrMatch = text.match(/^BT0*(\d+)$/i);
    return qrMatch ? Number(qrMatch[1]) : null;
}

function normalizeCode(value = '') {
    return String(value).trim().replace(/\s+/g, '');
}

function findBook(store, rawCode) {
    const code = normalizeCode(rawCode);
    const parsedId = parseBookId(rawCode);
    return store.books.find(book => {
        if (parsedId && Number(book.id) === parsedId) return true;
        const qr = normalizeCode(book.qr_code || book.qrCode || '');
        const isbn = normalizeCode(book.isbn || '').replace(/-/g, '');
        return (qr && qr.toLowerCase() === code.toLowerCase())
            || (isbn && isbn === code.replace(/-/g, ''));
    }) || null;
}

function locationFor(store, locationId) {
    return store.storage_locations.find(item => Number(item.id) === Number(locationId)) || null;
}

function mapLocation(location) {
    if (!location) return null;
    return {
        id: Number(location.id),
        shelfCode: location.shelf_code,
        shelf_code: location.shelf_code,
        placeCode: location.place_code,
        place_code: location.place_code,
        note: location.note || ''
    };
}

function mapBook(store, book) {
    if (!book) return null;
    return {
        id: Number(book.id),
        title: book.title,
        author: book.author,
        copies: Number(book.copies || 0),
        qrCode: book.qr_code || book.qrCode || null,
        qr_code: book.qr_code || book.qrCode || null,
        isbn: book.isbn || null,
        locationId: book.location_id || book.locationId || null,
        location_id: book.location_id || book.locationId || null,
        location: mapLocation(locationFor(store, book.location_id || book.locationId))
    };
}

function expectedBooks(store, session) {
    return store.books.filter(book => {
        if (Number(book.copies || 0) <= 0) return false;
        if (!session.location_id) return true;
        return Number(book.location_id || book.locationId) === Number(session.location_id);
    });
}

function buildReport(store, session) {
    const events = store.inventory_scans
        .filter(scan => Number(scan.session_id) === Number(session.id))
        .sort((a, b) => new Date(b.scanned_at) - new Date(a.scanned_at));
    const expected = expectedBooks(store, session);
    const firstMatchedByBook = new Map();
    for (const event of events.slice().reverse()) {
        if (event.book_id && !firstMatchedByBook.has(Number(event.book_id))) {
            firstMatchedByBook.set(Number(event.book_id), event);
        }
    }
    const expectedIds = new Set(expected.map(book => Number(book.id)));
    const foundIds = new Set([...firstMatchedByBook.keys()].filter(id => expectedIds.has(id)));
    const missing = expected.filter(book => !foundIds.has(Number(book.id))).map(book => mapBook(store, book));
    const misplaced = [...firstMatchedByBook.entries()]
        .filter(([id, event]) => !expectedIds.has(id) || event.result === 'misplaced')
        .map(([id, event]) => ({ ...mapBook(store, store.books.find(book => Number(book.id) === id)), scannedAt: event.scanned_at }));
    const found = expected.filter(book => foundIds.has(Number(book.id))).map(book => mapBook(store, book));
    const unknownCount = events.filter(event => event.result === 'unknown').length;
    const duplicateCount = events.filter(event => event.result === 'duplicate').length;
    return {
        expected,
        found,
        missing,
        misplaced,
        scans: events.slice(0, 80).map(event => ({
            ...event,
            book: mapBook(store, store.books.find(book => Number(book.id) === Number(event.book_id)))
        })),
        summary: {
            expectedTitles: expected.length,
            expectedCopies: expected.reduce((sum, book) => sum + Number(book.copies || 0), 0),
            foundTitles: found.length,
            foundCopies: found.reduce((sum, book) => sum + Number(book.copies || 0), 0),
            missingTitles: missing.length,
            missingCopies: missing.reduce((sum, book) => sum + Number(book.copies || 0), 0),
            misplacedTitles: misplaced.length,
            unknownScans: unknownCount,
            duplicateScans: duplicateCount,
            totalScans: events.length
        }
    };
}

function hydrateSession(store, session) {
    if (!session) return null;
    const report = buildReport(store, session);
    return {
        ...session,
        id: Number(session.id),
        locationId: session.location_id || null,
        location: mapLocation(locationFor(store, session.location_id)),
        report
    };
}

function listSessions() {
    const store = read();
    return store.inventory_sessions
        .slice()
        .sort((a, b) => new Date(b.started_at) - new Date(a.started_at))
        .slice(0, 30)
        .map(session => hydrateSession(store, session));
}

function createSession(user, data = {}) {
    const store = read();
    const locationId = data.locationId || data.location_id || null;
    if (locationId && !locationFor(store, locationId)) {
        const error = new Error('Место хранения не найдено');
        error.code = 'INVALID_LOCATION';
        throw error;
    }
    const session = {
        id: nextId(store, 'inventory_sessions'),
        name: String(data.name || `Инвентаризация ${new Date().toLocaleDateString('ru-RU')}`).trim().slice(0, 160),
        location_id: locationId ? Number(locationId) : null,
        status: 'active',
        created_by: Number(user.id),
        created_by_username: user.username || 'admin',
        started_at: now(),
        completed_at: null,
        notes: String(data.notes || '').trim().slice(0, 500)
    };
    store.inventory_sessions.push(session);
    write(store);
    return hydrateSession(store, session);
}

function getSession(sessionId) {
    const store = read();
    return hydrateSession(store, store.inventory_sessions.find(item => Number(item.id) === Number(sessionId)));
}

function scan(sessionId, user, rawCode) {
    const store = read();
    const session = store.inventory_sessions.find(item => Number(item.id) === Number(sessionId));
    if (!session) return null;
    if (session.status !== 'active') {
        const error = new Error('Инвентаризация уже завершена');
        error.code = 'SESSION_CLOSED';
        throw error;
    }
    const code = String(rawCode || '').trim();
    if (!code) {
        const error = new Error('Введите QR-код или ISBN');
        error.code = 'EMPTY_CODE';
        throw error;
    }
    const book = findBook(store, code);
    let result = 'unknown';
    if (book) {
        const alreadyScanned = store.inventory_scans.some(event =>
            Number(event.session_id) === Number(session.id)
            && Number(event.book_id) === Number(book.id)
            && event.result !== 'unknown'
        );
        if (alreadyScanned) result = 'duplicate';
        else if (session.location_id && Number(book.location_id || book.locationId) !== Number(session.location_id)) result = 'misplaced';
        else result = 'found';
    }
    const event = {
        id: nextId(store, 'inventory_scans'),
        session_id: Number(session.id),
        book_id: book ? Number(book.id) : null,
        scanned_code: code,
        result,
        scanned_by: Number(user.id),
        scanned_by_username: user.username || 'admin',
        scanned_at: now()
    };
    store.inventory_scans.push(event);
    write(store);
    return { event: { ...event, book: mapBook(store, book) }, session: hydrateSession(store, session) };
}

function completeSession(sessionId) {
    const store = read();
    const session = store.inventory_sessions.find(item => Number(item.id) === Number(sessionId));
    if (!session) return null;
    if (session.status !== 'completed') {
        session.status = 'completed';
        session.completed_at = now();
        write(store);
    }
    return hydrateSession(store, session);
}

module.exports = {
    listSessions,
    createSession,
    getSession,
    scan,
    completeSession,
    findBook,
    mapBook
};
