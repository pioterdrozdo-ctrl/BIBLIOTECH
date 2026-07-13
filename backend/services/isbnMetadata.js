'use strict';

const LOOKUP_TIMEOUT_MS = 10000;
const PROVIDER_RETRY_ATTEMPTS = 2;
const PROVIDER_RETRY_DELAY_MS = 120;
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

function cleanIsbn(value) {
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

function isbn10To13(value) {
    const isbn10 = cleanIsbn(value);
    if (!isValidIsbn10(isbn10)) return isbn10;
    const body = `978${isbn10.slice(0, 9)}`;
    const sum = body.split('').reduce((total, char, index) => {
        return total + Number(char) * (index % 2 === 0 ? 1 : 3);
    }, 0);
    return `${body}${(10 - (sum % 10)) % 10}`;
}

function isbn13To10(value) {
    const isbn13 = cleanIsbn(value);
    if (!/^978\d{10}$/.test(isbn13) || !isValidIsbn13(isbn13)) return '';
    const body = isbn13.slice(3, 12);
    const sum = body.split('').reduce((total, char, index) => total + Number(char) * (10 - index), 0);
    const checkValue = (11 - (sum % 11)) % 11;
    return `${body}${checkValue === 10 ? 'X' : checkValue}`;
}

function normalizeIsbn(value) {
    const isbn = cleanIsbn(value);
    return isbn.length === 10 && isValidIsbn10(isbn) ? isbn10To13(isbn) : isbn;
}

function validateIsbn(value) {
    const isbn = cleanIsbn(value);
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

function asArray(value) {
    if (Array.isArray(value)) return value;
    return value === null || value === undefined || value === '' ? [] : [value];
}

function openLibraryPath(value, prefix) {
    const raw = cleanText(value, 200);
    if (!raw) return '';
    if (raw.startsWith('/')) return raw;
    return new RegExp(`^OL[0-9A-Z]+${prefix}$`, 'i').test(raw)
        ? `/${prefix === 'W' ? 'works' : 'books'}/${raw}`
        : '';
}

function findSearchDocument(payload, isbn) {
    const documents = Array.isArray(payload?.docs) ? payload.docs : [];
    return documents.find(document => asArray(document?.isbn).some(value => normalizeIsbn(value) === isbn))
        || documents[0]
        || null;
}

function mapOpenLibrarySearchDocument(document = {}) {
    const coverId = Number(document.cover_i) > 0 ? Number(document.cover_i) : null;
    const workPath = openLibraryPath(document.key, 'W');
    return {
        title: cleanText(document.title, 255),
        subtitle: cleanText(document.subtitle, 255),
        authors: asArray(document.author_name).map(name => ({ name: cleanText(name, 120) })).filter(item => item.name),
        publishers: asArray(document.publisher).map(name => ({ name: cleanText(name, 255) })).filter(item => item.name),
        publish_date: document.first_publish_year || asArray(document.publish_year)[0] || null,
        subjects: asArray(document.subject).map(name => ({ name: cleanText(name, 80) })).filter(item => item.name),
        languages: asArray(document.language),
        cover: coverId ? { large: `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` } : null,
        url: workPath ? `https://openlibrary.org${workPath}` : ''
    };
}

function mapOpenLibraryMetadata(isbn, bookData = {}, editionData = {}, workData = {}) {
    const subjects = [
        ...asArray(editionData.subjects),
        ...asArray(bookData.subjects),
        ...asArray(workData.subjects)
    ].map(item => cleanText(item?.name || item, 80)).filter(Boolean);
    const authors = Array.isArray(bookData.authors)
        ? bookData.authors.map(item => cleanText(item?.name, 120)).filter(Boolean)
        : [];
    const editionLanguages = [
        ...asArray(editionData.languages),
        ...asArray(bookData.languages)
    ].map(item => normalizeLanguage(item?.key || item)).filter(Boolean);
    const coverId = Array.isArray(editionData.covers) && Number(editionData.covers[0]) > 0
        ? Number(editionData.covers[0])
        : null;
    const coverUrl = normalizeHttpUrl(
        bookData.cover?.large
        || bookData.cover?.medium
        || (coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : '')
    );
    const title = cleanText(editionData.title || bookData.title, 255);
    const subtitle = cleanText(editionData.subtitle || bookData.subtitle, 255);
    const description = normalizeDescription(workData.description || editionData.description)
        || cleanText(bookData.excerpts?.[0]?.text || '', MAX_DESCRIPTION_LENGTH);

    return {
        isbn,
        title: title && subtitle && !title.toLowerCase().includes(subtitle.toLowerCase()) ? `${title}: ${subtitle}` : title || subtitle,
        author: authors.join(', ').slice(0, 255),
        description,
        publisher: cleanText(editionData.publishers?.[0], 255) || firstName(bookData.publishers),
        publicationYear: normalizePublicationYear(editionData.publish_date || bookData.publish_date),
        genre: [...new Set(subjects)].slice(0, 3).join(', ').slice(0, 160),
        language: [...new Set(editionLanguages)].slice(0, 2).join(', ').slice(0, 80),
        coverDataURL: coverUrl || null,
        source: 'openlibrary',
        sourceUrl: normalizeHttpUrl((editionData.key ? `https://openlibrary.org${editionData.key}` : '') || bookData.url) || null
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

function waitForRetry(delayMs, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            const error = new Error('Lookup aborted');
            error.name = 'AbortError';
            reject(error);
            return;
        }
        const timer = setTimeout(resolve, delayMs);
        signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            const error = new Error('Lookup aborted');
            error.name = 'AbortError';
            reject(error);
        }, { once: true });
    });
}

function shouldRetryProviderError(error) {
    if (error?.name === 'AbortError') return false;
    if (!Number.isFinite(error?.status)) return true;
    return [408, 425, 429].includes(error.status) || error.status >= 500;
}

async function fetchJson(url, fetchImpl, signal, { attempts = PROVIDER_RETRY_ATTEMPTS } = {}) {
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            const response = await fetchImpl(url, {
                signal,
                headers: {
                    Accept: 'application/json',
                    'User-Agent': 'BIBLIOTECH/1.0 book metadata lookup'
                }
            });
            if (response.status === 404) return null;
            if (!response.ok) {
                const error = new Error(`Metadata provider returned ${response.status}`);
                error.code = 'METADATA_PROVIDER_ERROR';
                error.status = response.status;
                throw error;
            }
            return await response.json();
        } catch (error) {
            lastError = error;
            if (attempt >= attempts || !shouldRetryProviderError(error)) throw error;
            await waitForRetry(PROVIDER_RETRY_DELAY_MS * attempt, signal);
        }
    }
    throw lastError;
}

function isbnVariants(isbn) {
    return [...new Set([normalizeIsbn(isbn), isbn13To10(isbn)].filter(Boolean))];
}

function hasUsefulMetadata(metadata) {
    return Boolean(metadata && (metadata.title || metadata.author));
}

function normalizeCoverUrl(value) {
    const raw = cleanText(value, 2000).replace(/^http:\/\//i, 'https://');
    return normalizeHttpUrl(raw) || null;
}

function stripMarkup(value) {
    return cleanText(String(value ?? '').replace(/<[^>]*>/g, ' '), MAX_DESCRIPTION_LENGTH);
}

async function lookupOpenLibraryMetadata(isbn, fetchImpl, signal) {
    const editionUrl = `https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`;
    const searchFields = 'key,title,subtitle,author_name,first_publish_year,publish_year,publisher,subject,language,cover_i,isbn';
    const searchUrl = `https://openlibrary.org/search.json?isbn=${encodeURIComponent(isbn)}&fields=${encodeURIComponent(searchFields)}&limit=1`;
    const [editionResult, searchResult] = await Promise.allSettled([
        fetchJson(editionUrl, fetchImpl, signal),
        fetchJson(searchUrl, fetchImpl, signal)
    ]);
    const editionData = editionResult.status === 'fulfilled' ? editionResult.value : null;
    const searchPayload = searchResult.status === 'fulfilled' ? searchResult.value : null;
    const searchDocument = findSearchDocument(searchPayload, isbn);
    const providerErrors = [editionResult, searchResult]
        .filter(result => result.status === 'rejected')
        .map(result => result.reason);

    if (!editionData && !searchDocument) {
        if (providerErrors.length === 2) {
            throw providerErrors.find(error => error?.name === 'AbortError') || providerErrors[0];
        }
        return null;
    }

    const bookData = mapOpenLibrarySearchDocument(searchDocument || {});
    let workData = null;
    const workKey = editionData?.works?.[0]?.key || openLibraryPath(searchDocument?.key, 'W');
    if (workKey && /^\/works\/OL[0-9A-Z]+W$/i.test(workKey)) {
        try {
            workData = await fetchJson(`https://openlibrary.org${workKey}.json`, fetchImpl, signal, { attempts: 1 });
        } catch { /* Description enrichment is optional; keep already found edition data. */ }
    }

    const metadata = mapOpenLibraryMetadata(isbn, bookData || {}, editionData || {}, workData || {});
    return hasUsefulMetadata(metadata) ? metadata : null;
}

function mapGoogleBooksMetadata(isbn, item = {}) {
    const info = item.volumeInfo || {};
    const title = cleanText(info.title, 255);
    const subtitle = cleanText(info.subtitle, 255);
    return {
        isbn,
        title: title && subtitle && !title.toLowerCase().includes(subtitle.toLowerCase()) ? `${title}: ${subtitle}` : title || subtitle,
        author: asArray(info.authors).map(author => cleanText(author, 120)).filter(Boolean).join(', ').slice(0, 255),
        description: stripMarkup(info.description),
        publisher: cleanText(info.publisher, 255),
        publicationYear: normalizePublicationYear(info.publishedDate),
        genre: asArray(info.categories).map(category => cleanText(category, 80)).filter(Boolean).slice(0, 3).join(', ').slice(0, 160),
        language: normalizeLanguage(info.language),
        coverDataURL: normalizeCoverUrl(info.imageLinks?.extraLarge || info.imageLinks?.large || info.imageLinks?.medium || info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail),
        source: 'googlebooks',
        sourceUrl: normalizeHttpUrl(info.infoLink || info.canonicalVolumeLink) || null
    };
}

async function lookupGoogleBooksMetadata(isbn, fetchImpl, signal, apiKey = '') {
    const params = new URLSearchParams({
        q: `isbn:${isbn}`,
        maxResults: '5',
        printType: 'books',
        projection: 'full'
    });
    if (apiKey) params.set('key', apiKey);
    const payload = await fetchJson(`https://www.googleapis.com/books/v1/volumes?${params}`, fetchImpl, signal);
    const items = asArray(payload?.items);
    const expected = new Set(isbnVariants(isbn));
    const exactItem = items.find(item => asArray(item?.volumeInfo?.industryIdentifiers)
        .some(identifier => expected.has(cleanIsbn(identifier?.identifier))));
    const metadata = mapGoogleBooksMetadata(isbn, exactItem || items[0] || {});
    return hasUsefulMetadata(metadata) ? metadata : null;
}

function firstStructuredValue(...values) {
    for (const value of values) {
        const candidate = Array.isArray(value) ? value[0] : value;
        if (candidate && typeof candidate === 'object') {
            const nested = firstStructuredValue(candidate.name, candidate.title, candidate.value);
            if (nested) return nested;
        } else {
            const text = cleanText(candidate, 2000);
            if (text) return text;
        }
    }
    return '';
}

function cleanSearchResultTitle(value) {
    const title = cleanText(value, 255);
    return cleanText(title.split(/\s(?:\||—)\s/)[0], 255);
}

function mapGoogleCustomSearchMetadata(isbn, item = {}) {
    const pageMap = item.pagemap || {};
    const book = asArray(pageMap.book)[0] || {};
    const product = asArray(pageMap.product)[0] || {};
    const meta = asArray(pageMap.metatags)[0] || {};
    const image = asArray(pageMap.cse_image)[0] || {};
    const title = cleanSearchResultTitle(firstStructuredValue(
        book.name,
        book.title,
        product.name,
        meta['og:title'],
        item.title
    ));
    if (!title) return null;
    const author = firstStructuredValue(book.author, meta['book:author'], meta['og:book:author'], meta.author);
    const description = firstStructuredValue(
        book.description,
        product.description,
        meta['og:description'],
        meta.description,
        item.snippet
    );
    return {
        isbn,
        title,
        author: cleanText(author, 255),
        description: stripMarkup(description),
        publisher: cleanText(firstStructuredValue(book.publisher, product.brand, meta.publisher), 255),
        publicationYear: normalizePublicationYear(firstStructuredValue(book.datepublished, product.releasedate, meta['article:published_time'])),
        genre: cleanText(firstStructuredValue(book.genre, product.category), 160),
        language: normalizeLanguage(firstStructuredValue(book.inlanguage, meta['og:locale'], meta.language)),
        coverDataURL: normalizeCoverUrl(firstStructuredValue(image.src, book.image, product.image, meta['og:image'])),
        source: 'googlecustomsearch',
        sourceUrl: normalizeHttpUrl(item.link) || null
    };
}

async function lookupGoogleCustomSearchMetadata(isbn, fetchImpl, signal, apiKey, cx) {
    if (!apiKey || !cx) return null;
    const variants = isbnVariants(isbn);
    const params = new URLSearchParams({
        key: apiKey,
        cx,
        q: `${variants.map(value => `"${value}"`).join(' OR ')} книга ISBN`,
        num: '5',
        safe: 'active'
    });
    const payload = await fetchJson(`https://www.googleapis.com/customsearch/v1?${params}`, fetchImpl, signal);
    for (const item of asArray(payload?.items)) {
        const metadata = mapGoogleCustomSearchMetadata(isbn, item);
        if (metadata) return metadata;
    }
    return null;
}

async function runProviderLookup(task) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
    try {
        return { value: await task(controller.signal), error: null };
    } catch (error) {
        return { value: null, error };
    } finally {
        clearTimeout(timeout);
    }
}

async function lookupIsbnMetadata(value, {
    fetchImpl = global.fetch,
    useCache = true,
    googleBooksApiKey = process.env.GOOGLE_BOOKS_API_KEY || process.env.GOOGLE_API_KEY || '',
    googleCustomSearchApiKey = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY || process.env.GOOGLE_API_KEY || '',
    googleCustomSearchCx = process.env.GOOGLE_CUSTOM_SEARCH_CX || ''
} = {}) {
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

    const providers = [
        signal => lookupOpenLibraryMetadata(isbn, fetchImpl, signal),
        signal => lookupGoogleBooksMetadata(isbn, fetchImpl, signal, googleBooksApiKey)
    ];
    if (googleCustomSearchApiKey && googleCustomSearchCx) {
        providers.push(signal => lookupGoogleCustomSearchMetadata(
            isbn,
            fetchImpl,
            signal,
            googleCustomSearchApiKey,
            googleCustomSearchCx
        ));
    }

    const providerErrors = [];
    for (const provider of providers) {
        const result = await runProviderLookup(provider);
        if (result.value) {
            cache.set(isbn, { value: result.value, expiresAt: Date.now() + CACHE_TTL_MS });
            return result.value;
        }
        if (result.error) providerErrors.push(result.error);
    }

    const allTimedOut = providerErrors.length === providers.length
        && providerErrors.every(error => error?.name === 'AbortError');
    if (allTimedOut) {
        const error = new Error('Сервисы ISBN не ответили вовремя. Попробуйте ещё раз.');
        error.code = 'METADATA_TIMEOUT';
        throw error;
    }
    const customSearchConfigured = Boolean(googleCustomSearchApiKey && googleCustomSearchCx);
    const error = new Error(customSearchConfigured
        ? 'ISBN корректен, но сведения не найдены в Open Library, Google Books и Google Search. Заполните данные вручную.'
        : 'ISBN корректен, но сведения не найдены в Open Library и Google Books. Google Search не настроен на сервере; заполните данные вручную.');
    error.code = 'ISBN_NOT_FOUND';
    throw error;
}

module.exports = {
    normalizeIsbn,
    isbn10To13,
    isbn13To10,
    validateIsbn,
    normalizePublicationYear,
    normalizeBookMetadataInput,
    mapOpenLibraryMetadata,
    mapGoogleBooksMetadata,
    mapGoogleCustomSearchMetadata,
    lookupIsbnMetadata
};
