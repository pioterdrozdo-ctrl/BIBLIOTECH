'use strict';

const fs = require('fs');
const path = require('path');
const localStore = require('./localStore');
const { buildBookKey } = require('./bookImport');
const { buildBookQrCode, buildBookQrPayload } = require('../utils/bookQr');

function now() {
    return new Date().toISOString();
}

function readStore() {
    return JSON.parse(fs.readFileSync(localStore.STORE_FILE, 'utf8'));
}

function writeStoreAtomic(store) {
    const directory = path.dirname(localStore.STORE_FILE);
    const temporary = path.join(directory, `.store-import-${process.pid}-${Date.now()}.json`);
    fs.writeFileSync(temporary, JSON.stringify(store, null, 2));
    fs.renameSync(temporary, localStore.STORE_FILE);
}

function nextBookId(store) {
    if (!store.counters) store.counters = {};
    const currentMax = Math.max(
        Number(store.counters.books || 0),
        ...(store.books || []).map(book => Number(book.id || 0))
    );
    store.counters.books = currentMax + 1;
    return store.counters.books;
}

function bulkImportBooks(user, previewRows, duplicateStrategy = 'skip') {
    const store = readStore();
    if (!Array.isArray(store.books)) store.books = [];
    if (!Array.isArray(store.storage_locations)) store.storage_locations = [];

    const existingMap = new Map();
    store.books.forEach(book => {
        const key = buildBookKey(book.title, book.author);
        if (!existingMap.has(key)) existingMap.set(key, book);
    });

    const result = { created: 0, merged: 0, skipped: 0, errors: 0, createdBookIds: [], rows: [] };

    for (const row of previewRows || []) {
        if (row.status === 'error') {
            result.errors += 1;
            result.rows.push({ rowNumber: row.rowNumber, action: 'error', messages: row.errors || [] });
            continue;
        }
        if (row.duplicate?.type === 'file') {
            result.skipped += 1;
            result.rows.push({ rowNumber: row.rowNumber, action: 'skipped_file_duplicate', messages: [row.duplicate.message] });
            continue;
        }

        const existing = existingMap.get(buildBookKey(row.data.title, row.data.author));
        if (existing) {
            if (duplicateStrategy !== 'merge_copies' || Number(row.data.copies || 0) <= 0) {
                result.skipped += 1;
                result.rows.push({ rowNumber: row.rowNumber, action: 'skipped_catalog_duplicate', bookId: existing.id });
                continue;
            }
            existing.copies = Math.max(0, Number(existing.copies || 0)) + Number(row.data.copies || 0);
            existing.available = existing.copies > 0;
            existing.updated_at = now();
            result.merged += 1;
            result.rows.push({ rowNumber: row.rowNumber, action: 'merged_copies', bookId: existing.id, copies: existing.copies });
            continue;
        }

        const bookId = nextBookId(store);
        const locationExists = row.data.locationId
            && store.storage_locations.some(location => Number(location.id) === Number(row.data.locationId));
        const qrCode = buildBookQrCode(bookId);
        const qrPayload = buildBookQrPayload(bookId);
        const book = {
            id: bookId,
            title: row.data.title,
            author: row.data.author,
            description: row.data.description || '',
            coverDataURL: row.data.coverDataURL || null,
            cover_data_url: row.data.coverDataURL || null,
            copies: Math.max(0, Number(row.data.copies || 0)),
            available: Boolean(row.data.available) && Number(row.data.copies || 0) > 0,
            location_id: locationExists ? Number(row.data.locationId) : null,
            user_id: user.id,
            qr_code: qrCode,
            qrCode,
            qr_payload: qrPayload,
            qrPayload,
            created_at: now(),
            updated_at: now()
        };
        store.books.unshift(book);
        existingMap.set(buildBookKey(book.title, book.author), book);
        result.created += 1;
        result.createdBookIds.push(bookId);
        result.rows.push({ rowNumber: row.rowNumber, action: 'created', bookId });
    }

    writeStoreAtomic(store);
    return { ...result, totalProcessed: (previewRows || []).length };
}

module.exports = { bulkImportBooks };
