const fs = require('fs');
const localStore = require('./localStore');

const ROOM_CODE = '125';

function now() {
    return new Date().toISOString();
}

function normalizeStorageText(value) {
    return String(value || '')
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLocaleUpperCase('ru');
}

function findRoom125Locations(locations = []) {
    const byPlace = new Map();
    locations.forEach(location => {
        const shelf = normalizeStorageText(location.shelf_code || location.shelfCode);
        const place = String(location.place_code || location.placeCode || '').trim().padStart(2, '0');
        const note = normalizeStorageText(location.note);
        if (shelf === 'ИКТ-ФВ 13' && ['09', '12'].includes(place) && note === 'НАДСТАВКА') {
            byPlace.set(place, location);
        }
    });
    return byPlace;
}

function initialRoom125Objects(locations = []) {
    const locationByPlace = findRoom125Locations(locations);
    const createdAt = now();
    const base = [
        ['ROOM_125_FLOOR', 'Пол кабинета 125', 'floor', 0, -0.1, 0, 10, 0.2, 7, 0, null],
        ['ROOM_125_WALL_NORTH', 'Северная условная стена', 'wall', 0, 1.25, -3.45, 10, 2.5, 0.12, 0, null],
        ['ROOM_125_WALL_SOUTH', 'Южная условная стена', 'wall', 0, 1.25, 3.45, 10, 2.5, 0.12, 0, null],
        ['ROOM_125_WALL_EAST', 'Восточная условная стена', 'wall', 4.95, 1.25, 0, 0.12, 2.5, 7, 0, null],
        ['ROOM_125_WALL_WEST', 'Западная условная стена', 'wall', -4.95, 1.25, -1.35, 0.12, 2.5, 4.3, 0, null],
        ['ROOM_125_ENTRANCE', 'Вход в кабинет 125', 'entrance', -4.85, 0.05, 2.1, 0.3, 0.1, 1.35, 0, null],
        ['ROOM_125_AISLE', 'Основной проход', 'aisle', -0.3, 0.015, 0.65, 7.6, 0.03, 1.15, 0, null],
        ['STORAGE_IKT_FV_13_09', 'ИКТ-ФВ 13 · место 09 · Надставка', 'storage', 1.8, 0.85, -1.65, 2.5, 1.7, 0.8, 0, locationByPlace.get('09')?.id || null],
        ['STORAGE_IKT_FV_13_12', 'ИКТ-ФВ 13 · место 12 · Надставка', 'storage', 1.8, 0.85, 1.8, 2.5, 1.7, 0.8, 0, locationByPlace.get('12')?.id || null]
    ];

    return base.map((values, index) => ({
        id: index + 1,
        code: values[0],
        label: values[1],
        object_type: values[2],
        room_code: ROOM_CODE,
        x: values[3],
        y: values[4],
        z: values[5],
        width: values[6],
        height: values[7],
        depth: values[8],
        rotation_y: values[9],
        storage_location_id: values[10],
        is_active: true,
        created_at: createdAt,
        updated_at: createdAt
    }));
}

function readRawStore() {
    localStore.listStorageLocations();
    return JSON.parse(fs.readFileSync(localStore.STORE_FILE, 'utf8'));
}

function writeRawStore(store) {
    fs.writeFileSync(localStore.STORE_FILE, JSON.stringify(store, null, 2));
}

function ensureMapStore() {
    const store = readRawStore();
    if (!store.counters) store.counters = {};
    if (!Array.isArray(store.map_objects) || !store.map_objects.length) {
        store.map_objects = initialRoom125Objects(store.storage_locations || []);
    }
    const maxId = Math.max(0, ...store.map_objects.map(object => Number(object.id) || 0));
    store.counters.map_objects = Math.max(Number(store.counters.map_objects || 0), maxId);
    writeRawStore(store);
    return store;
}

function listObjects(roomCode = ROOM_CODE) {
    const store = ensureMapStore();
    return store.map_objects
        .filter(object => object.is_active !== false && String(object.room_code) === String(roomCode))
        .map(object => ({ ...object }));
}

function getObject(id) {
    const store = ensureMapStore();
    const object = store.map_objects.find(item => Number(item.id) === Number(id));
    return object ? { ...object } : null;
}

function createObject(data) {
    const store = ensureMapStore();
    if (store.map_objects.some(object => String(object.code).toUpperCase() === String(data.code).toUpperCase())) {
        const error = new Error('Объект с таким кодом уже существует');
        error.code = 'DUPLICATE_MAP_CODE';
        throw error;
    }
    const timestamp = now();
    const object = {
        ...data,
        id: Number(store.counters.map_objects || 0) + 1,
        created_at: timestamp,
        updated_at: timestamp
    };
    store.counters.map_objects = object.id;
    store.map_objects.push(object);
    writeRawStore(store);
    return { ...object };
}

function updateObject(id, data) {
    const store = ensureMapStore();
    const index = store.map_objects.findIndex(object => Number(object.id) === Number(id));
    if (index < 0) return null;
    const duplicate = store.map_objects.some((object, objectIndex) =>
        objectIndex !== index && String(object.code).toUpperCase() === String(data.code).toUpperCase()
    );
    if (duplicate) {
        const error = new Error('Объект с таким кодом уже существует');
        error.code = 'DUPLICATE_MAP_CODE';
        throw error;
    }
    store.map_objects[index] = {
        ...store.map_objects[index],
        ...data,
        id: store.map_objects[index].id,
        updated_at: now()
    };
    writeRawStore(store);
    return { ...store.map_objects[index] };
}

function deleteObject(id) {
    const store = ensureMapStore();
    const index = store.map_objects.findIndex(object => Number(object.id) === Number(id));
    if (index < 0) return false;
    store.map_objects.splice(index, 1);
    writeRawStore(store);
    return true;
}

function resetRoom125() {
    const store = ensureMapStore();
    const otherRooms = store.map_objects.filter(object => String(object.room_code) !== ROOM_CODE);
    const replacements = initialRoom125Objects(store.storage_locations || []);
    let nextId = Math.max(Number(store.counters.map_objects || 0), ...otherRooms.map(object => Number(object.id) || 0));
    replacements.forEach(object => { object.id = ++nextId; });
    store.map_objects = [...otherRooms, ...replacements];
    store.counters.map_objects = nextId;
    writeRawStore(store);
    return replacements.map(object => ({ ...object }));
}

function getMapData(roomCode = ROOM_CODE) {
    const objects = listObjects(roomCode);
    const locations = localStore.listStorageLocations();
    const books = localStore.getBooks({}, null).map(book => ({
        id: book.id,
        title: book.title,
        author: book.author,
        available: Boolean(book.available),
        copies: Number(book.copies || 0),
        location_id: book.location_id || book.locationId || null
    }));
    return { objects, locations, books };
}

module.exports = {
    ROOM_CODE,
    normalizeStorageText,
    findRoom125Locations,
    initialRoom125Objects,
    listObjects,
    getObject,
    createObject,
    updateObject,
    deleteObject,
    resetRoom125,
    getMapData
};
