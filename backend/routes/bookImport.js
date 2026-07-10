'use strict';

const express = require('express');
const multer = require('multer');
const pool = require('../db/pool');
const localStore = require('../services/localStore');
const localBookImportStore = require('../services/localBookImportStore');
const { authMiddleware, isAdmin } = require('../middleware/auth');
const { buildBookQrCode } = require('../utils/bookQr');
const {
    MAX_IMPORT_ROWS,
    TEMPLATE_HEADERS,
    parseImportFile,
    buildPreview,
    stableRowsPayload,
    signPreviewRows,
    verifyPreviewRows
} = require('../services/bookImport');

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { files: 1, fileSize: 5 * 1024 * 1024 }
});

function uploadImportFile(req, res, next) {
    upload.single('file')(req, res, error => {
        if (!error) return next();
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'Файл должен быть меньше 5 МБ.', code: 'FILE_TOO_LARGE' });
        }
        return res.status(400).json({ error: 'Не удалось прочитать файл.', code: error.code || 'UPLOAD_ERROR' });
    });
}

async function ensureImportSchema(client = pool) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS storage_locations (
            id SERIAL PRIMARY KEY,
            shelf_code VARCHAR(80) NOT NULL,
            place_code VARCHAR(80) NOT NULL,
            note VARCHAR(160),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (shelf_code, place_code, note)
        );
        ALTER TABLE books ADD COLUMN IF NOT EXISTS description TEXT;
        ALTER TABLE books ADD COLUMN IF NOT EXISTS cover_data_url TEXT;
        ALTER TABLE books ADD COLUMN IF NOT EXISTS copies INTEGER DEFAULT 1;
        ALTER TABLE books ADD COLUMN IF NOT EXISTS available BOOLEAN DEFAULT TRUE;
        ALTER TABLE books ADD COLUMN IF NOT EXISTS qr_code VARCHAR(32);
        ALTER TABLE books ADD COLUMN IF NOT EXISTS location_id INTEGER REFERENCES storage_locations(id) ON DELETE SET NULL;
        ALTER TABLE books ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
    `);
}

async function readPostgresSnapshot(client = pool, lockBooks = false) {
    await ensureImportSchema(client);
    const [booksResult, locationsResult] = await Promise.all([
        client.query(`SELECT id, title, author, copies FROM books ORDER BY id${lockBooks ? ' FOR UPDATE' : ''}`),
        client.query('SELECT id, shelf_code, place_code, note FROM storage_locations ORDER BY id')
    ]);
    return { books: booksResult.rows, locations: locationsResult.rows };
}

async function readSnapshot() {
    try {
        return await readPostgresSnapshot();
    } catch (error) {
        if (pool.isConfigured) throw error;
        return {
            books: localStore.getBooks(),
            locations: localStore.listStorageLocations()
        };
    }
}

function publicPreview(preview) {
    return {
        summary: preview.summary,
        rows: preview.rows.map(row => ({
            rowNumber: row.rowNumber,
            status: row.status,
            data: row.data,
            errors: row.errors,
            warnings: row.warnings,
            duplicate: row.duplicate
        }))
    };
}

async function commitPostgres(user, incomingRows, duplicateStrategy) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await ensureImportSchema(client);
        // One import at a time prevents two admins from creating the same title/author pair concurrently.
        await client.query('SELECT pg_advisory_xact_lock($1)', [20260710]);
        const snapshot = await readPostgresSnapshot(client, true);
        const preview = buildPreview(incomingRows, snapshot.books, snapshot.locations);
        const result = { created: 0, merged: 0, skipped: 0, errors: 0, createdBookIds: [], rows: [] };

        for (const row of preview.rows) {
            if (row.status === 'error') {
                result.errors += 1;
                result.rows.push({ rowNumber: row.rowNumber, action: 'error', messages: row.errors });
                continue;
            }
            if (row.duplicate?.type === 'file') {
                result.skipped += 1;
                result.rows.push({ rowNumber: row.rowNumber, action: 'skipped_file_duplicate', messages: [row.duplicate.message] });
                continue;
            }
            if (row.duplicate?.type === 'catalog') {
                if (duplicateStrategy !== 'merge_copies' || Number(row.data.copies || 0) <= 0) {
                    result.skipped += 1;
                    result.rows.push({ rowNumber: row.rowNumber, action: 'skipped_catalog_duplicate', bookId: row.duplicate.bookId });
                    continue;
                }
                const updated = await client.query(`
                    UPDATE books
                    SET copies = GREATEST(0, COALESCE(copies, 0)) + $1,
                        available = (GREATEST(0, COALESCE(copies, 0)) + $1) > 0,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $2
                    RETURNING id, copies
                `, [row.data.copies, row.duplicate.bookId]);
                if (!updated.rows.length) throw new Error(`Duplicate book #${row.duplicate.bookId} disappeared during import.`);
                result.merged += 1;
                result.rows.push({ rowNumber: row.rowNumber, action: 'merged_copies', bookId: updated.rows[0].id, copies: updated.rows[0].copies });
                continue;
            }

            const inserted = await client.query(`
                INSERT INTO books (title, author, description, cover_data_url, copies, available, location_id, user_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id
            `, [
                row.data.title,
                row.data.author,
                row.data.description || '',
                row.data.coverDataURL || null,
                row.data.copies,
                row.data.available,
                row.data.locationId || null,
                user.id
            ]);
            const bookId = inserted.rows[0].id;
            await client.query('UPDATE books SET qr_code = $1 WHERE id = $2', [buildBookQrCode(bookId), bookId]);
            result.created += 1;
            result.createdBookIds.push(bookId);
            result.rows.push({ rowNumber: row.rowNumber, action: 'created', bookId });
        }

        await client.query('COMMIT');
        return { ...result, totalProcessed: preview.rows.length };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

router.post('/preview', authMiddleware, isAdmin, uploadImportFile, async (req, res) => {
    try {
        const parsed = await parseImportFile(req.file);
        const snapshot = await readSnapshot();
        const preview = buildPreview(parsed.rows, snapshot.books, snapshot.locations);
        const responsePreview = publicPreview(preview);
        res.json({
            file: {
                name: req.file.originalname,
                size: req.file.size,
                sheetName: parsed.sheetName,
                headers: parsed.headers
            },
            templateHeaders: TEMPLATE_HEADERS,
            ...responsePreview,
            importToken: signPreviewRows(responsePreview.rows)
        });
    } catch (error) {
        console.warn('[BOOK IMPORT] Preview failed:', error.message);
        const status = error.code === 'TOO_MANY_ROWS' ? 413
            : error.code === 'UNSUPPORTED_FILE' ? 415
                : pool.isConfigured && !error.code ? 503 : 400;
        res.status(status).json({ error: error.message || 'Не удалось проверить файл.', code: error.code || 'IMPORT_PREVIEW_ERROR' });
    }
});

router.post('/commit', authMiddleware, isAdmin, async (req, res) => {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const duplicateStrategy = req.body.duplicateStrategy === 'merge_copies' ? 'merge_copies' : 'skip';
    if (!rows.length) return res.status(400).json({ error: 'Нет строк для импорта.', code: 'ROWS_REQUIRED' });
    if (rows.length > MAX_IMPORT_ROWS) {
        return res.status(413).json({ error: `За один раз можно импортировать не больше ${MAX_IMPORT_ROWS} строк.`, code: 'TOO_MANY_ROWS' });
    }

    const stableRows = stableRowsPayload(rows);
    if (!verifyPreviewRows(stableRows, req.body.importToken)) {
        return res.status(409).json({ error: 'Предпросмотр устарел или данные были изменены. Выберите файл заново.', code: 'PREVIEW_MISMATCH' });
    }

    try {
        let result;
        if (pool.isConfigured) {
            result = await commitPostgres(req.user, stableRows, duplicateStrategy);
        } else {
            const snapshot = await readSnapshot();
            const preview = buildPreview(stableRows, snapshot.books, snapshot.locations);
            result = localBookImportStore.bulkImportBooks(req.user, preview.rows, duplicateStrategy);
        }
        res.status(201).json({
            message: 'Импорт завершён.',
            duplicateStrategy,
            ...result
        });
    } catch (error) {
        console.error('[BOOK IMPORT] Commit failed:', error);
        res.status(pool.isConfigured ? 503 : 500).json({
            error: 'Импорт отменён целиком: ни одна строка не была добавлена.',
            code: 'IMPORT_COMMIT_ERROR'
        });
    }
});

module.exports = router;
