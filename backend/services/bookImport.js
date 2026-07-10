'use strict';

const crypto = require('crypto');
const path = require('path');
const ExcelJS = require('exceljs');

const MAX_IMPORT_ROWS = 500;
const MAX_DESCRIPTION_LENGTH = 10000;
const MAX_COPIES = 9999;
const MAX_IMPORT_COLUMNS = 50;
const SUPPORTED_EXTENSIONS = new Set(['.csv', '.xlsx']);

const HEADER_ALIASES = {
    title: ['title', 'book title', 'name', 'название', 'название книги', 'книга'],
    author: ['author', 'authors', 'автор', 'авторы'],
    description: ['description', 'annotation', 'summary', 'описание', 'аннотация'],
    copies: ['copies', 'copy count', 'quantity', 'count', 'экземпляры', 'количество', 'количество экземпляров'],
    available: ['available', 'availability', 'in stock', 'доступна', 'доступность', 'в наличии', 'наличие'],
    locationId: ['location id', 'location_id', 'storage id', 'id места', 'id хранения', 'место id'],
    shelfCode: ['shelf', 'shelf code', 'zone', 'полка', 'код полки', 'зона'],
    placeCode: ['place', 'place code', 'position', 'место', 'код места', 'позиция'],
    locationNote: ['location note', 'note', 'storage note', 'заметка', 'примечание', 'заметка места'],
    coverDataURL: ['cover', 'cover url', 'image url', 'обложка', 'обложка url', 'ссылка на обложку']
};

const TEMPLATE_HEADERS = [
    'Название',
    'Автор',
    'Описание',
    'Количество',
    'Доступна',
    'ID места',
    'Полка',
    'Место',
    'Заметка',
    'Обложка URL'
];

function normalizeHeader(value) {
    return String(value ?? '')
        .normalize('NFKC')
        .trim()
        .toLowerCase()
        .replace(/[._-]+/g, ' ')
        .replace(/\s+/g, ' ');
}

const HEADER_LOOKUP = Object.entries(HEADER_ALIASES).reduce((lookup, [field, aliases]) => {
    aliases.concat(field).forEach(alias => lookup.set(normalizeHeader(alias), field));
    return lookup;
}, new Map());

function normalizeIdentity(value) {
    return String(value ?? '')
        .normalize('NFKC')
        .trim()
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[«»„“”"']/g, '')
        .replace(/\s+/g, ' ');
}

function buildBookKey(title, author) {
    return `${normalizeIdentity(title)}\u0000${normalizeIdentity(author)}`;
}

function asText(value) {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).trim();
}

function parseInteger(value, fallback = 1) {
    const raw = asText(value);
    if (!raw) return fallback;
    const normalized = raw.replace(/\s+/g, '').replace(',', '.');
    const number = Number(normalized);
    if (!Number.isFinite(number) || !Number.isInteger(number)) return null;
    return number;
}

function parseBoolean(value, fallback) {
    const raw = normalizeIdentity(value);
    if (!raw) return fallback;
    if (['1', 'true', 'yes', 'y', 'да', 'доступна', 'в наличии', 'есть'].includes(raw)) return true;
    if (['0', 'false', 'no', 'n', 'нет', 'недоступна', 'нет в наличии'].includes(raw)) return false;
    return null;
}

function detectDelimiter(text) {
    const sample = String(text || '').split(/\r?\n/).find(line => line.trim()) || '';
    const candidates = [';', ',', '\t'];
    let best = ';';
    let bestCount = -1;
    for (const delimiter of candidates) {
        let count = 0;
        let quoted = false;
        for (let index = 0; index < sample.length; index += 1) {
            const char = sample[index];
            if (char === '"') {
                if (quoted && sample[index + 1] === '"') index += 1;
                else quoted = !quoted;
            } else if (!quoted && char === delimiter) {
                count += 1;
            }
        }
        if (count > bestCount) {
            best = delimiter;
            bestCount = count;
        }
    }
    return best;
}

function parseDelimitedText(text) {
    const source = String(text || '').replace(/^\uFEFF/, '');
    const delimiter = detectDelimiter(source);
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;

    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        if (char === '"') {
            if (quoted && source[index + 1] === '"') {
                cell += '"';
                index += 1;
            } else {
                quoted = !quoted;
            }
            continue;
        }
        if (!quoted && char === delimiter) {
            row.push(cell);
            cell = '';
            continue;
        }
        if (!quoted && (char === '\n' || char === '\r')) {
            if (char === '\r' && source[index + 1] === '\n') index += 1;
            row.push(cell);
            if (row.some(value => String(value).trim())) rows.push(row);
            row = [];
            cell = '';
            continue;
        }
        cell += char;
    }

    if (quoted) {
        const error = new Error('В CSV-файле не закрыты кавычки.');
        error.code = 'INVALID_CSV';
        throw error;
    }

    row.push(cell);
    if (row.some(value => String(value).trim())) rows.push(row);
    return rows;
}

function tableToObjects(table) {
    if (!Array.isArray(table) || !table.length) {
        const error = new Error('Файл не содержит данных.');
        error.code = 'EMPTY_FILE';
        throw error;
    }

    const headers = table[0].slice(0, MAX_IMPORT_COLUMNS).map(asText);
    if (!headers.some(Boolean)) {
        const error = new Error('В первой строке должны быть заголовки столбцов.');
        error.code = 'MISSING_HEADERS';
        throw error;
    }

    const rows = table.slice(1)
        .map((values, index) => ({
            rowNumber: index + 2,
            values: headers.reduce((record, header, column) => {
                record[header || `column_${column + 1}`] = values[column] ?? '';
                return record;
            }, {})
        }))
        .filter(item => Object.values(item.values).some(value => asText(value)));

    if (!rows.length) {
        const error = new Error('После строки заголовков нет книг для импорта.');
        error.code = 'EMPTY_ROWS';
        throw error;
    }
    if (rows.length > MAX_IMPORT_ROWS) {
        const error = new Error(`За один раз можно импортировать не больше ${MAX_IMPORT_ROWS} строк.`);
        error.code = 'TOO_MANY_ROWS';
        throw error;
    }

    return { headers, rows };
}

async function parseXlsx(buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
        const error = new Error('В Excel-файле нет листов.');
        error.code = 'EMPTY_FILE';
        throw error;
    }

    const table = [];
    worksheet.eachRow({ includeEmpty: false }, row => {
        const values = [];
        const maxColumn = Math.min(Math.max(row.cellCount, worksheet.actualColumnCount || 0), MAX_IMPORT_COLUMNS);
        for (let column = 1; column <= maxColumn; column += 1) {
            const cell = row.getCell(column);
            const value = cell.value && typeof cell.value === 'object' && Object.prototype.hasOwnProperty.call(cell.value, 'result')
                ? cell.value.result
                : cell.value;
            values.push(value ?? '');
        }
        table.push(values);
    });
    return { ...tableToObjects(table), sheetName: worksheet.name || 'Лист 1' };
}

async function parseImportFile(file) {
    if (!file?.buffer?.length) {
        const error = new Error('Выберите CSV или XLSX-файл.');
        error.code = 'FILE_REQUIRED';
        throw error;
    }

    const extension = path.extname(file.originalname || '').toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
        const error = new Error('Поддерживаются только файлы .csv и .xlsx.');
        error.code = 'UNSUPPORTED_FILE';
        throw error;
    }

    if (extension === '.csv') {
        const parsed = tableToObjects(parseDelimitedText(file.buffer.toString('utf8')));
        return { ...parsed, sheetName: 'CSV' };
    }
    return parseXlsx(file.buffer);
}

function mapCanonicalValues(raw) {
    const values = raw?.values && typeof raw.values === 'object' ? raw.values : raw;
    const canonical = {};
    Object.entries(values || {}).forEach(([header, value]) => {
        const field = HEADER_LOOKUP.get(normalizeHeader(header));
        if (field && (canonical[field] === undefined || canonical[field] === '')) canonical[field] = value;
    });
    return canonical;
}

function normalizeLocation(location = {}) {
    return {
        id: Number(location.id),
        shelfCode: asText(location.shelfCode ?? location.shelf_code),
        placeCode: asText(location.placeCode ?? location.place_code),
        note: asText(location.note)
    };
}

function resolveLocation(canonical, locations) {
    const warnings = [];
    const normalizedLocations = (locations || []).map(normalizeLocation).filter(location => Number.isInteger(location.id));
    const requestedId = parseInteger(canonical.locationId, null);

    if (asText(canonical.locationId) && (!Number.isInteger(requestedId) || requestedId <= 0)) {
        warnings.push('ID места хранения должен быть целым положительным числом. Книга будет импортирована без места.');
    } else if (requestedId) {
        const match = normalizedLocations.find(location => location.id === requestedId);
        if (match) return { locationId: match.id, label: [match.note, match.shelfCode, match.placeCode].filter(Boolean).join(' · '), warnings };
        warnings.push(`Место хранения с ID ${requestedId} не найдено. Книга будет импортирована без места.`);
    }

    const shelfCode = asText(canonical.shelfCode);
    const placeCode = asText(canonical.placeCode);
    const note = asText(canonical.locationNote);
    if (!shelfCode && !placeCode && !note) return { locationId: null, label: '', warnings };
    if (!shelfCode || !placeCode) {
        warnings.push('Для поиска места укажите и полку, и место. Книга будет импортирована без места.');
        return { locationId: null, label: '', warnings };
    }

    const match = normalizedLocations.find(location =>
        normalizeIdentity(location.shelfCode) === normalizeIdentity(shelfCode)
        && normalizeIdentity(location.placeCode) === normalizeIdentity(placeCode)
        && (!note || normalizeIdentity(location.note) === normalizeIdentity(note))
    );
    if (!match) {
        warnings.push(`Место «${[note, shelfCode, placeCode].filter(Boolean).join(' · ')}» не найдено. Книга будет импортирована без места.`);
        return { locationId: null, label: '', warnings };
    }
    return { locationId: match.id, label: [match.note, match.shelfCode, match.placeCode].filter(Boolean).join(' · '), warnings };
}

function normalizeImportRow(raw, locations = []) {
    const canonical = mapCanonicalValues(raw);
    const errors = [];
    const warnings = [];
    const title = asText(canonical.title);
    const author = asText(canonical.author);
    const description = asText(canonical.description);

    if (!title) errors.push('Не указано название.');
    if (!author) errors.push('Не указан автор.');
    if (title.length > 255) errors.push('Название длиннее 255 символов.');
    if (author.length > 255) errors.push('Автор длиннее 255 символов.');
    if (description.length > MAX_DESCRIPTION_LENGTH) errors.push(`Описание длиннее ${MAX_DESCRIPTION_LENGTH} символов.`);

    const copies = parseInteger(canonical.copies, 1);
    if (!Number.isInteger(copies) || copies < 0 || copies > MAX_COPIES) {
        errors.push(`Количество должно быть целым числом от 0 до ${MAX_COPIES}.`);
    }

    const available = parseBoolean(canonical.available, Number(copies) > 0);
    if (available === null) errors.push('Доступность должна быть: да/нет, true/false или 1/0.');
    if (available === true && copies === 0) warnings.push('При нулевом количестве книга будет отмечена как недоступная.');

    let coverDataURL = asText(canonical.coverDataURL);
    if (coverDataURL && !/^https?:\/\//i.test(coverDataURL)) {
        warnings.push('Ссылка на обложку пропущена: разрешены только http/https URL.');
        coverDataURL = '';
    }
    if (coverDataURL.length > 2000) {
        warnings.push('Ссылка на обложку слишком длинная и будет пропущена.');
        coverDataURL = '';
    }

    const location = resolveLocation(canonical, locations);
    warnings.push(...location.warnings);

    return {
        rowNumber: Number(raw?.rowNumber) || null,
        data: {
            title,
            author,
            description,
            copies: Number.isInteger(copies) ? copies : 1,
            available: available === true && copies > 0,
            locationId: location.locationId,
            locationLabel: location.label,
            coverDataURL: coverDataURL || null
        },
        errors,
        warnings
    };
}

function buildPreview(rawRows, existingBooks = [], locations = []) {
    const existingMap = new Map();
    (existingBooks || []).forEach(book => {
        const key = buildBookKey(book.title, book.author);
        if (!existingMap.has(key)) existingMap.set(key, book);
    });

    const firstFileRows = new Map();
    const rows = (rawRows || []).map((raw, index) => {
        const sourceValues = raw?.values && typeof raw.values === 'object'
            ? raw.values
            : raw?.data && typeof raw.data === 'object'
                ? raw.data
                : raw;
        const normalized = normalizeImportRow({
            rowNumber: raw?.rowNumber || index + 2,
            values: sourceValues
        }, locations);
        const key = buildBookKey(normalized.data.title, normalized.data.author);
        let duplicate = null;

        if (!normalized.errors.length && normalized.data.title && normalized.data.author) {
            if (firstFileRows.has(key)) {
                duplicate = {
                    type: 'file',
                    rowNumber: firstFileRows.get(key),
                    message: `Повтор строки ${firstFileRows.get(key)} в этом файле.`
                };
            } else {
                firstFileRows.set(key, normalized.rowNumber);
                const existing = existingMap.get(key);
                if (existing) {
                    duplicate = {
                        type: 'catalog',
                        bookId: existing.id,
                        copies: Number(existing.copies || 0),
                        message: `Такая книга уже есть в каталоге (#${existing.id}).`
                    };
                }
            }
        }

        const status = normalized.errors.length ? 'error' : duplicate ? 'duplicate' : 'ready';
        return { ...normalized, key, duplicate, status };
    });

    const summary = {
        total: rows.length,
        ready: rows.filter(row => row.status === 'ready').length,
        duplicateCatalog: rows.filter(row => row.duplicate?.type === 'catalog').length,
        duplicateFile: rows.filter(row => row.duplicate?.type === 'file').length,
        errors: rows.filter(row => row.status === 'error').length,
        warnings: rows.filter(row => row.warnings.length).length
    };
    summary.importable = summary.ready + summary.duplicateCatalog;

    return { rows, summary };
}

function stableRowsPayload(rows) {
    return (rows || []).map(row => ({
        rowNumber: Number(row.rowNumber) || null,
        data: {
            title: asText(row.data?.title),
            author: asText(row.data?.author),
            description: asText(row.data?.description),
            copies: Number(row.data?.copies ?? 1),
            available: Boolean(row.data?.available),
            locationId: row.data?.locationId ? Number(row.data.locationId) : null,
            coverDataURL: row.data?.coverDataURL || null
        }
    }));
}

function importSecret() {
    return process.env.JWT_SECRET || 'bibliotech-dev-secret-change-me';
}

function signPreviewRows(rows) {
    return crypto.createHmac('sha256', importSecret())
        .update(JSON.stringify(stableRowsPayload(rows)))
        .digest('hex');
}

function verifyPreviewRows(rows, signature) {
    if (!/^[a-f0-9]{64}$/i.test(String(signature || ''))) return false;
    const expected = signPreviewRows(rows);
    const received = String(signature).toLowerCase();
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'));
}

module.exports = {
    MAX_IMPORT_ROWS,
    TEMPLATE_HEADERS,
    SUPPORTED_EXTENSIONS,
    parseImportFile,
    buildPreview,
    buildBookKey,
    stableRowsPayload,
    signPreviewRows,
    verifyPreviewRows
};
