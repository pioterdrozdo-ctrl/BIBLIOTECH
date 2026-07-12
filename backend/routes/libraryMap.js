const express = require('express');
const pool = require('../db/pool');
const { authMiddleware, isAdmin } = require('../middleware/auth');
const localLibraryMapStore = require('../services/localLibraryMapStore');

const router = express.Router();
const ROOM_CODE = '125';
const OBJECT_TYPES = new Set(['floor', 'wall', 'entrance', 'aisle', 'storage']);
const NUMERIC_LIMITS = {
    x: [-100, 100], y: [-100, 100], z: [-100, 100],
    width: [0.02, 100], height: [0.02, 100], depth: [0.02, 100],
    rotation_y: [-Math.PI * 2, Math.PI * 2]
};

function normalizeStorageText(value) {
    return localLibraryMapStore.normalizeStorageText(value);
}

function mapObject(row) {
    if (!row) return null;
    return {
        ...row,
        id: Number(row.id),
        x: Number(row.x),
        y: Number(row.y),
        z: Number(row.z),
        width: Number(row.width),
        height: Number(row.height),
        depth: Number(row.depth),
        rotation_y: Number(row.rotation_y),
        storage_location_id: row.storage_location_id ? Number(row.storage_location_id) : null,
        is_active: row.is_active !== false
    };
}

function mapLocation(row) {
    return {
        id: Number(row.id),
        shelf_code: row.shelf_code,
        shelfCode: row.shelf_code,
        place_code: row.place_code,
        placeCode: row.place_code,
        note: row.note || ''
    };
}

function mapBook(row) {
    return {
        id: Number(row.id),
        title: row.title,
        author: row.author || '',
        available: Boolean(row.available),
        copies: Number(row.copies || 0),
        location_id: row.location_id ? Number(row.location_id) : null
    };
}

function attachBooks({ objects, locations, books, source }) {
    const booksByLocation = new Map();
    books.forEach(book => {
        const key = Number(book.location_id);
        if (!key) return;
        if (!booksByLocation.has(key)) booksByLocation.set(key, []);
        booksByLocation.get(key).push(book);
    });
    const objectByLocation = new Map(
        objects.filter(object => object.storage_location_id).map(object => [Number(object.storage_location_id), object])
    );
    const enrichedLocations = locations.map(location => {
        const locationBooks = booksByLocation.get(Number(location.id)) || [];
        return {
            ...location,
            object: objectByLocation.get(Number(location.id)) || null,
            books: locationBooks,
            available_books_count: locationBooks.filter(book => book.available && book.copies > 0).length,
            books_count: locationBooks.length
        };
    });
    return {
        source,
        room: {
            code: ROOM_CODE,
            title: 'Кабинет 125',
            building: 'Тушино',
            floor: 1,
            is_initial_layout: true,
            accuracy_note: 'Навигационная схема. Координаты не являются точным архитектурным планом.'
        },
        objects,
        locations: enrichedLocations,
        books
    };
}

async function ensureLibraryMapSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS library_map_objects (
            id SERIAL PRIMARY KEY,
            code VARCHAR(80) UNIQUE NOT NULL,
            label VARCHAR(160) NOT NULL,
            object_type VARCHAR(30) NOT NULL,
            room_code VARCHAR(30) NOT NULL DEFAULT '125',
            x NUMERIC NOT NULL DEFAULT 0,
            y NUMERIC NOT NULL DEFAULT 0,
            z NUMERIC NOT NULL DEFAULT 0,
            width NUMERIC NOT NULL DEFAULT 1,
            height NUMERIC NOT NULL DEFAULT 1,
            depth NUMERIC NOT NULL DEFAULT 1,
            rotation_y NUMERIC NOT NULL DEFAULT 0,
            storage_location_id INTEGER REFERENCES storage_locations(id) ON DELETE SET NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_library_map_objects_room_code ON library_map_objects(room_code);
        CREATE INDEX IF NOT EXISTS idx_library_map_objects_object_type ON library_map_objects(object_type);
        CREATE INDEX IF NOT EXISTS idx_library_map_objects_storage_location_id ON library_map_objects(storage_location_id);
    `);
    const countResult = await pool.query('SELECT COUNT(*)::int AS count FROM library_map_objects WHERE room_code = $1', [ROOM_CODE]);
    if (Number(countResult.rows[0]?.count || 0) > 0) return;

    const locationsResult = await pool.query('SELECT id, shelf_code, place_code, note FROM storage_locations');
    const initialObjects = localLibraryMapStore.initialRoom125Objects(locationsResult.rows);
    for (const object of initialObjects) {
        await pool.query(`
            INSERT INTO library_map_objects
                (code, label, object_type, room_code, x, y, z, width, height, depth, rotation_y, storage_location_id, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, TRUE)
            ON CONFLICT (code) DO NOTHING
        `, [
            object.code, object.label, object.object_type, object.room_code,
            object.x, object.y, object.z, object.width, object.height, object.depth,
            object.rotation_y, object.storage_location_id
        ]);
    }
}

async function readPostgresMap(roomCode = ROOM_CODE) {
    await ensureLibraryMapSchema();
    const [objectsResult, locationsResult, booksResult] = await Promise.all([
        pool.query('SELECT * FROM library_map_objects WHERE room_code = $1 AND is_active = TRUE ORDER BY id', [roomCode]),
        pool.query('SELECT id, shelf_code, place_code, note FROM storage_locations ORDER BY shelf_code, place_code, note'),
        pool.query('SELECT id, title, author, available, copies, location_id FROM books ORDER BY title')
    ]);
    return attachBooks({
        objects: objectsResult.rows.map(mapObject),
        locations: locationsResult.rows.map(mapLocation),
        books: booksResult.rows.map(mapBook),
        source: 'postgres'
    });
}

function readFallbackMap(roomCode = ROOM_CODE) {
    const data = localLibraryMapStore.getMapData(roomCode);
    return attachBooks({
        objects: data.objects.map(mapObject),
        locations: data.locations.map(location => ({
            id: Number(location.id),
            shelf_code: location.shelf_code || location.shelfCode,
            shelfCode: location.shelf_code || location.shelfCode,
            place_code: location.place_code || location.placeCode,
            placeCode: location.place_code || location.placeCode,
            note: location.note || ''
        })),
        books: data.books.map(mapBook),
        source: 'json'
    });
}

async function readMap(roomCode = ROOM_CODE) {
    try {
        return await readPostgresMap(roomCode);
    } catch (error) {
        if (pool.isConfigured) console.warn('[LIBRARY MAP] PostgreSQL read failed, using JSON fallback:', error.message);
        return readFallbackMap(roomCode);
    }
}

function parsePositiveId(value, fieldName = 'id') {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) {
        const error = new Error(`Некорректный ${fieldName}`);
        error.status = 400;
        throw error;
    }
    return id;
}

function validateMapObject(input, existing = null) {
    const defaults = {
        room_code: ROOM_CODE,
        x: 0, y: 0, z: 0,
        width: 1, height: 1, depth: 1,
        rotation_y: 0,
        storage_location_id: null,
        is_active: true
    };
    const merged = { ...defaults, ...(existing || {}), ...(input || {}) };
    const code = String(merged.code || '').trim();
    const label = String(merged.label || '').trim();
    const objectType = String(merged.object_type || merged.objectType || '').trim().toLowerCase();
    const roomCode = String(merged.room_code || merged.roomCode || ROOM_CODE).trim();
    if (!code || code.length > 80 || !/^[A-Z0-9_\-]+$/i.test(code)) throw Object.assign(new Error('Код объекта обязателен и может содержать до 80 латинских букв, цифр, _ и -'), { status: 400 });
    if (!label || label.length > 160) throw Object.assign(new Error('Подпись объекта обязательна и не должна превышать 160 символов'), { status: 400 });
    if (!OBJECT_TYPES.has(objectType)) throw Object.assign(new Error('Недопустимый тип объекта'), { status: 400 });
    if (!roomCode || roomCode.length > 30) throw Object.assign(new Error('Некорректный код помещения'), { status: 400 });

    const validated = { code, label, object_type: objectType, room_code: roomCode };
    Object.entries(NUMERIC_LIMITS).forEach(([field, [min, max]]) => {
        const value = Number(merged[field]);
        if (!Number.isFinite(value) || value < min || value > max) {
            throw Object.assign(new Error(`Поле ${field} должно быть числом от ${min} до ${max}`), { status: 400 });
        }
        validated[field] = value;
    });
    const rawLocationId = merged.storage_location_id ?? merged.storageLocationId ?? null;
    validated.storage_location_id = rawLocationId === null || rawLocationId === '' ? null : parsePositiveId(rawLocationId, 'storage_location_id');
    validated.is_active = merged.is_active !== false;
    return validated;
}

async function findPostgresObject(id) {
    const result = await pool.query('SELECT * FROM library_map_objects WHERE id = $1', [id]);
    return result.rows[0] ? mapObject(result.rows[0]) : null;
}

router.get('/', async (req, res) => {
    try {
        res.json(await readMap(ROOM_CODE));
    } catch (error) {
        res.status(500).json({ error: error.message || 'Не удалось получить карту библиотеки' });
    }
});

router.get('/room/:roomCode', async (req, res) => {
    const roomCode = String(req.params.roomCode || '').trim();
    if (roomCode !== ROOM_CODE) return res.status(404).json({ error: 'Помещение не найдено' });
    try {
        res.json(await readMap(roomCode));
    } catch (error) {
        res.status(500).json({ error: error.message || 'Не удалось получить схему помещения' });
    }
});

router.get('/location/:locationId', async (req, res) => {
    try {
        const locationId = parsePositiveId(req.params.locationId, 'locationId');
        const map = await readMap(ROOM_CODE);
        const location = map.locations.find(item => Number(item.id) === locationId);
        if (!location) return res.status(404).json({ error: 'Место хранения не найдено' });
        res.json({ room: map.room, location, object: location.object, books: location.books, source: map.source });
    } catch (error) {
        res.status(error.status || 500).json({ error: error.message || 'Не удалось получить место хранения' });
    }
});

router.post('/objects', authMiddleware, isAdmin, async (req, res) => {
    try {
        const object = validateMapObject(req.body);
        try {
            await ensureLibraryMapSchema();
            const result = await pool.query(`
                INSERT INTO library_map_objects
                    (code, label, object_type, room_code, x, y, z, width, height, depth, rotation_y, storage_location_id, is_active)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *
            `, [object.code, object.label, object.object_type, object.room_code, object.x, object.y, object.z, object.width, object.height, object.depth, object.rotation_y, object.storage_location_id, object.is_active]);
            return res.status(201).json(mapObject(result.rows[0]));
        } catch (error) {
            if (pool.isConfigured) throw error;
            return res.status(201).json(mapObject(localLibraryMapStore.createObject(object)));
        }
    } catch (error) {
        res.status(error.status || (error.code === '23505' || error.code === 'DUPLICATE_MAP_CODE' ? 409 : 500)).json({ error: error.message || 'Не удалось создать объект' });
    }
});

router.put('/objects/:id', authMiddleware, isAdmin, async (req, res) => {
    try {
        const id = parsePositiveId(req.params.id);
        try {
            await ensureLibraryMapSchema();
            const current = await findPostgresObject(id);
            if (!current) return res.status(404).json({ error: 'Объект карты не найден' });
            const object = validateMapObject(req.body, current);
            const result = await pool.query(`
                UPDATE library_map_objects SET
                    code=$1, label=$2, object_type=$3, room_code=$4, x=$5, y=$6, z=$7,
                    width=$8, height=$9, depth=$10, rotation_y=$11, storage_location_id=$12,
                    is_active=$13, updated_at=CURRENT_TIMESTAMP
                WHERE id=$14 RETURNING *
            `, [object.code, object.label, object.object_type, object.room_code, object.x, object.y, object.z, object.width, object.height, object.depth, object.rotation_y, object.storage_location_id, object.is_active, id]);
            return res.json(mapObject(result.rows[0]));
        } catch (error) {
            if (pool.isConfigured) throw error;
            const current = localLibraryMapStore.getObject(id);
            if (!current) return res.status(404).json({ error: 'Объект карты не найден' });
            const object = validateMapObject(req.body, current);
            return res.json(mapObject(localLibraryMapStore.updateObject(id, object)));
        }
    } catch (error) {
        res.status(error.status || (error.code === '23505' || error.code === 'DUPLICATE_MAP_CODE' ? 409 : 500)).json({ error: error.message || 'Не удалось обновить объект' });
    }
});

router.delete('/objects/:id', authMiddleware, isAdmin, async (req, res) => {
    try {
        const id = parsePositiveId(req.params.id);
        try {
            await ensureLibraryMapSchema();
            const result = await pool.query('DELETE FROM library_map_objects WHERE id = $1 RETURNING id', [id]);
            if (!result.rows.length) return res.status(404).json({ error: 'Объект карты не найден' });
        } catch (error) {
            if (pool.isConfigured) throw error;
            if (!localLibraryMapStore.deleteObject(id)) return res.status(404).json({ error: 'Объект карты не найден' });
        }
        res.status(204).end();
    } catch (error) {
        res.status(error.status || 500).json({ error: error.message || 'Не удалось удалить объект' });
    }
});

router.post('/reset-room-125', authMiddleware, isAdmin, async (req, res) => {
    try {
        try {
            await ensureLibraryMapSchema();
            await pool.query('DELETE FROM library_map_objects WHERE room_code = $1', [ROOM_CODE]);
            const locationsResult = await pool.query('SELECT id, shelf_code, place_code, note FROM storage_locations');
            const initialObjects = localLibraryMapStore.initialRoom125Objects(locationsResult.rows);
            for (const object of initialObjects) {
                await pool.query(`
                    INSERT INTO library_map_objects
                        (code,label,object_type,room_code,x,y,z,width,height,depth,rotation_y,storage_location_id,is_active)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE)
                `, [object.code, object.label, object.object_type, object.room_code, object.x, object.y, object.z, object.width, object.height, object.depth, object.rotation_y, object.storage_location_id]);
            }
        } catch (error) {
            if (pool.isConfigured) throw error;
            localLibraryMapStore.resetRoom125();
        }
        res.json(await readMap(ROOM_CODE));
    } catch (error) {
        res.status(500).json({ error: error.message || 'Не удалось сбросить схему кабинета' });
    }
});

module.exports = router;
module.exports.ensureLibraryMapSchema = ensureLibraryMapSchema;
module.exports.normalizeStorageText = normalizeStorageText;
module.exports.validateMapObject = validateMapObject;
