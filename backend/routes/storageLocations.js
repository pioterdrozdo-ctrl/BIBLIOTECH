const express = require('express');
const pool = require('../db/pool');
const { authMiddleware, isAdmin } = require('../middleware/auth');
const localStore = require('../services/localStore');

const router = express.Router();

function mapLocation(row) {
    return {
        id: row.id,
        shelf_code: row.shelf_code,
        shelfCode: row.shelf_code,
        place_code: row.place_code,
        placeCode: row.place_code,
        note: row.note || ''
    };
}

async function ensureStorageSchema() {
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
        CREATE INDEX IF NOT EXISTS idx_books_location_id ON books(location_id);
        INSERT INTO storage_locations (shelf_code, place_code, note)
        VALUES ('ИКТ-ФВ 13', '09', 'Надставка'), ('ИКТ-ФВ 13', '12', 'Надставка')
        ON CONFLICT DO NOTHING;
    `);
}

router.get('/', async (req, res) => {
    try {
        await ensureStorageSchema();
        const result = await pool.query(`
            SELECT *
            FROM storage_locations
            ORDER BY shelf_code ASC, place_code ASC, note ASC
        `);
        res.json({ locations: result.rows.map(mapLocation) });
    } catch (error) {
        res.json({ locations: localStore.listStorageLocations() });
    }
});

router.post('/', authMiddleware, isAdmin, async (req, res) => {
    const shelfCode = String(req.body.shelfCode || req.body.shelf_code || '').trim();
    const placeCode = String(req.body.placeCode || req.body.place_code || '').trim();
    const note = String(req.body.note || '').trim();
    if (!shelfCode || !placeCode) {
        return res.status(400).json({ error: 'Shelf and place are required' });
    }

    try {
        await ensureStorageSchema();
        const result = await pool.query(
            `INSERT INTO storage_locations (shelf_code, place_code, note)
             VALUES ($1, $2, $3)
             ON CONFLICT (shelf_code, place_code, note) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [shelfCode, placeCode, note || null]
        );
        res.status(201).json(mapLocation(result.rows[0]));
    } catch (error) {
        try {
            res.status(201).json(localStore.addStorageLocation({ shelfCode, placeCode, note }));
        } catch (fallbackError) {
            res.status(409).json({ error: fallbackError.message || 'Failed to add storage location' });
        }
    }
});

module.exports = router;
