'use strict';

const LOOKUP_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_DESCRIPTION_LENGTH = 10000;
const cache = new Map();

const LANGUAGE_NAMES = {
    rus: 'Русский',
    eng: 'Английский',
    deu: 'Немецкий',
    ger: 'Немецкий',
    fra: 'Французский',
    fre: 'Французский',
    spa: 'Испанский',
    ita: 'Итальянский',
    por: 'Португальский',
    ukr: 'Украинский',
    bel: 'Белорусский',
    pol: 'Польский',
    ces: 'Чешский',
    cze: 'Чешский',
    lat: 'Латинский',
    zho: 'Китайский',
    chi: 'Китайский',
    jpn: 'Японский'
};

function cleanText(value, maxLength = 255) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeHttpUrl(value) {
    const raw = cleanText(value, 2000);
    if (!raw) return '';
    try {
        const url = new URL(raw);
        return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
    } catch {
        return '';
    }
}

function normalizeIsbn(value) {
    return String(value ?? '').toUpperCase().replace(/[^0-9X]/g, '');
}

function isValidIsbn10(isbn) {
    if (!/^\d{9}[\dX]$/.test(isbn)) return false;
    const sum = isbn.split('').reduce((total, char, index) => {
        const digit = char === 'X' ? 10 : Number(char);
        return total + digit * (10 - index);
    }, 0);
    return sum % 11 === 0;
}

function isValidIsbn13(isbn) {
    if (!/^\d{13}$/.test(isbn)) return false;
    const sum = isbn.slice(0, 12).split('').reduce((total, char, index) => {
        return total + Number(char) * (index % 2 === 0 ? 1 : 3);
    }, 0);
    const expected = (10 - (sum % 10)) % 10;
    return expected === Number(isbn[12]);
}

function validateIsbn(value) {
    const isbn = normalizeIsbn(value);
    return (isbn.length === 10 && isValidIsbn10(isbn)) || (isbn.length === 13 && isValidIsbn13(isbn));
}

function normalizePublicationYear(value) {
    if (value === null || value === undefined || value === '') return null;
    const match = String(value).match(/(?:1[0-9]{3}|20[0-9]{2}|2100)/);
    if (!match) return null;
    const year = Number(match[0]);
    const maxYear = new Date().getFullYear() + 1;
    return year >= 1000 && year <= maxYear ? year : null;
}

function normalizeLanguage(value) {
    const raw = cleanText(value, 80);
    if (!raw) return '';
    const code = raw.split('/').filter(Boolean).pop().toLowerCase();
    return LANGUAGE_NAMES[code] || raw;
}

function normalizeDescription(value) {
    if (!value) return '';
    const description = typeof value === 'string' ? value : value.value;
    return cleanText(description, MAX_DESCRIPTION_LENGTH);
}

function firstName(items) {
    return Array.isArray(items) ? cleanText(items.find(item => item?.name)?.name || '', 255) : '';
}

function mapOpenLibraryMetadata(isbn, bookData = {}, editionData = {}, workData = {}) {
    const subjects = Array.isArray(bookData.subjects)
        ? bookData.subjects.map(item => cleanText(item?.name || item, 80)).filter(Boolean)
        : Array.isArray(workData.subjects)
            ? workData.subjects.map(item => cleanText(item, 80)).filter(Boolean)
            : [];
    const authors = Array.isArray(bookData.authors)
        ? bookData.authors.map(item => cleanText(item?.name, 120)).filter(Boolean)
        : [];
    const editionLanguages = Array.isArray(editionData.languages)
        ? editionData.languages.map(item => normalizeLanguage(item?.key || item)).filter(Boolean)
        : [];
    const coverId = Array.isArray(editionData.covers) && Number(editionData.covers[0]) > 0
        ? Number(editionData.covers[0])
        : null;
    const coverUrl = normalizeHttpUrl(
        bookData.cover?.large
        || bookData.cover?.medium
        || (coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : '')
    );
    const title = cleanText(bookData.title || editionData.title, 255);
    const subtitle = cleanText(bookData.subtitle || editionData.subtitle, 255);
    const description = normalizeDescription(workData.description || editionData.description)
        || cleanText(bookData.excerpts?.[0]?.text || '', MAX_DESCRIPTION_LENGTH);

    return {
        isbn,
        title: subtitle && !title.toLowerCase().includes(subtitle.toLowerCase()) ? `${title}: ${subtitle}` : title,
        author: authors.join(', ').slice(0, 255),
        description,
        publisher: firstName(bookData.publishers) || cleanText(editionData.publishers?.[0], 255),
        publicationYear: normalizePublicationYear(bookData.publish_date || editionData.publish_date),
        genre: [...new Set(subjects)].slice(0, 3).join(', ').slice(0, 160),
        language: [...new Set(editionLanguages)].slice(0, 2).join(', ').slice(0, 80),
        coverDataURL: coverUrl || null,
        source: 'openlibrary',
        sourceUrl: normalizeHttpUrl(bookData.url || (editionData.key ? `https://openlibrary.org${editionData.key}` : '')) || null
    };
}

function normalizeBookMetadataInput(data = {}, { partial = false } = {}) {
    const has = key => Object.prototype.hasOwnProperty.call(data, key);
    const read = (camel, snake) => has(camel) ? data[camel] : data[snake];
    const result = {};

    if (!partial || has('isbn')) {
        const isbn = normalizeIsbn(read('isbn', 'isbn'));
        if (isbn && !validateIsbn(isbn)) {
            const error = new Error('Некорректный ISBN. Проверьте контрольную цифру.');
            error.code = 'INVALID_ISBN';
            throw error;
        }
        result.isbn = isbn || null;
    }

    if (!partial || has('publicationYear') || has('publication_year')) {
        const rawYear = read('publicationYear', 'publication_year');
        const year = rawYear === '' || rawYear === null || rawYear === undefined ? null : normalizePublicationYear(rawYear);
        if (rawYear !== '' && rawYear !== null && rawYear !== undefined && !year) {
            const error = new Error('Год издания должен быть корректным четырёхзначным годом.');
            error.code = 'INVALID_PUBLICATION_YEAR';
            throw error;
        }
        result.publicationYear = year;
    }

    const textFields = [
        ['publisher', 'publisher', 255],
        ['genre', 'genre', 160],
        ['language', 'language', 80],
        ['metadataSource', 'metadata_source', 40]
    ];
    textFields.forEach(([camel, snake, limit]) => {
        if (!partial || has(camel) || has(snake)) result[camel] = cleanText(read(camel, snake), limit) || null;
    });

    if (!partial || has('metadataSourceUrl') || has('metadata_source_url')) {
        result.metadataSourceUrl = normalizeHttpUrl(read('metadataSourceUrl', 'metadata_source_url')) || null;
    }

    return result;
}

async function fetchJson(url, fetchImpl, signal) {
    const response = await fetchImpl(url, {
        signal,
        headers: {
            Accept: 'application/json',
            'User-Agent': 'BIBLIOTECH/1.0 book metadata lookup'
        }
    });
    if (response.status === 404) return null;
    if (!response.ok) {
        const error = new Error(`Open Library returned ${response.status}`);
        error.code = 'METADATA_PROVIDER_ERROR';
        throw error;
    }
    return response.json();
}

async function lookupIsbnMetadata(value, { fetchImpl = global.fetch, useCache = true } = {}) {
    const isbn = normalizeIsbn(value);
    if (!validateIsbn(isbn)) {
        const error = new Error('Некорректный ISBN. Введите ISBN-10 или ISBN-13.');
        error.code = 'INVALID_ISBN';
        throw error;
    }
    if (typeof fetchImpl !== 'function') {
        const error = new Error('Metadata lookup is unavailable.');
        error.code = 'METADATA_PROVIDER_ERROR';
        throw error;
    }

    const cached = cache.get(isbn);
    if (useCache && cached && cached.expiresAt > Date.now()) return cached.value;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
    try {
        const bibKey = `ISBN:${isbn}`;
        const dataUrl = `https://openlibrary.org/api/books?bibkeys=${encodeURIComponent(bibKey)}&jscmd=data&format=json`;
        const editionUrl = `https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`;
        const [bookPayload, editionData] = await Promise.all([
            fetchJson(dataUrl, fetchImpl, controller.signal),
            fetchJson(editionUrl, fetchImpl, controller.signal)
        ]);
        const bookData = bookPayload?.[bibKey] || null;
        if (!bookData && !editionData) {
            const error = new Error('Книга с таким ISBN не найдена.');
            error.code = 'ISBN_NOT_FOUND';
            throw error;
        }

        let workData = null;
        const workKey = editionData?.works?.[0]?.key;
        if (workKey && /^\/works\/OL[0-9A-Z]+W$/i.test(workKey)) {
            try {
                workData = await fetchJson(`https://openlibrary.org${workKey}.json`, fetchImpl, controller.signal);
            } catch (error) {
                if (error.name === 'AbortError') throw error;
            }
        }

        const metadata = mapOpenLibraryMetadata(isbn, bookData || {}, editionData || {}, workData || {});
        if (!metadata.title && !metadata.author) {
            const error = new Error('Для этого ISBN не удалось получить полезные данные.');
            error.code = 'ISBN_NOT_FOUND';
            throw error;
        }
        cache.set(isbn, { value: metadata, expiresAt: Date.now() + CACHE_TTL_MS });
        return metadata;
    } catch (error) {
        if (error.name === 'AbortError') {
            const timeoutError = new Error('Сервис ISBN не ответил вовремя. Попробуйте ещё раз.');
            timeoutError.code = 'METADATA_TIMEOUT';
            throw timeoutError;
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

module.exports = {
    normalizeIsbn,
    validateIsbn,
    normalizePublicationYear,
    normalizeBookMetadataInput,
    mapOpenLibraryMetadata,
    lookupIsbnMetadata
};
