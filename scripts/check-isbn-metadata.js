'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
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
} = require('../backend/services/isbnMetadata');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

function assertBalancedCss(source, filename) {
    const stripped = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
    let balance = 0;
    for (const character of stripped) {
        if (character === '{') balance += 1;
        if (character === '}') balance -= 1;
        assert.ok(balance >= 0, `${filename}: unexpected closing brace`);
    }
    assert.equal(balance, 0, `${filename}: unbalanced braces`);
}

function validateArchitecture() {
    const route = read('backend/routes/bookMetadata.js');
    const service = read('backend/services/isbnMetadata.js');
    const schema = read('backend/services/bookMetadataSchema.js');
    const fallback = read('backend/services/localBookMetadataStore.js');
    const server = read('backend/server.js');
    const ui = read('frontend/js/book-metadata.js');
    const css = read('frontend/css/book-metadata.css');
    const pwa = read('frontend/js/pwa.js');
    const sw = read('frontend/sw.js');
    const sql = read('backend/sql/init.sql');
    const catalog = read('backend/routes/catalogList.js');

    assert.ok(route.includes("router.get('/isbn/:isbn', authMiddleware, isAdmin"), 'ISBN lookup is not admin protected');
    assert.ok(route.includes("router.post('/books', authMiddleware, isAdmin"), 'metadata create endpoint is not admin protected');
    assert.ok(route.includes("router.put('/books/:id', authMiddleware, isAdmin"), 'metadata update endpoint is not admin protected');
    assert.ok(route.includes('normalizeBookMetadataInput'), 'book metadata validation is not wired');
    assert.ok(route.includes('DUPLICATE_ISBN'), 'duplicate ISBN handling is missing');
    assert.ok(service.includes("['http:', 'https:'].includes(url.protocol)"), 'metadata source URL protocol validation is missing');
    assert.ok(service.includes('Promise.allSettled'), 'ISBN lookup does not tolerate a partial provider failure');
    assert.ok(service.includes('/search.json?isbn='), 'preferred Open Library Search API is not used');
    assert.ok(service.includes('books/v1/volumes?'), 'Google Books fallback is missing');
    assert.ok(service.includes('customsearch/v1?'), 'Google Custom Search fallback is missing');
    assert.ok(service.indexOf('lookupOpenLibraryMetadata(isbn') < service.indexOf('lookupGoogleBooksMetadata(isbn'), 'provider cascade does not start with Open Library');
    assert.ok(service.indexOf('lookupGoogleBooksMetadata(isbn') < service.indexOf('lookupGoogleCustomSearchMetadata('), 'Google Custom Search must run after Google Books');
    assert.ok(service.includes('GOOGLE_CUSTOM_SEARCH_CX'), 'server-side Custom Search configuration is missing');
    assert.ok(service.includes('PROVIDER_RETRY_ATTEMPTS'), 'transient provider retry is missing');
    assert.ok(service.includes('isbn10To13'), 'ISBN-10 to ISBN-13 conversion is missing');
    assert.ok(server.includes("app.use('/api/book-metadata', bookMetadataRoutes)"), 'metadata routes are not mounted');

    for (const column of ['isbn', 'publication_year', 'publisher', 'genre', 'language', 'metadata_source_url']) {
        assert.ok(schema.includes(column), `schema helper is missing ${column}`);
        assert.ok(sql.includes(column), `database migration is missing ${column}`);
    assert.ok(catalog.includes(`b.${column}`), `catalog response is missing ${column}`);
    }
    assert.ok(schema.includes('idx_books_isbn_unique'), 'unique ISBN index is missing');
    assert.ok(fallback.includes('ensureUniqueIsbn'), 'JSON fallback duplicate ISBN check is missing');
    assert.ok(fallback.includes('writeStoreAtomic'), 'JSON metadata update is not atomic');

    assert.ok(ui.includes('id="bookIsbn"'), 'ISBN input is missing');
    assert.ok(ui.includes('lookupIsbn'), 'ISBN lookup UI is missing');
    assert.ok(ui.includes('Open Library → Google Books → Google Search'), 'ISBN provider cascade is not explained in the form');
    assert.equal(ui.includes('GOOGLE_CUSTOM_SEARCH_API_KEY'), false, 'Google API keys are exposed to the browser');
    assert.ok(ui.includes('Применить данные'), 'metadata review step is missing');
    assert.ok(ui.includes("form.addEventListener('submit', saveBookWithMetadata, true)"), 'safe metadata form interception is missing');
    assert.ok(ui.includes('/book-metadata/books'), 'metadata save endpoint is not used');
    assert.ok(ui.includes('viewBibliographicMeta'), 'book detail metadata section is missing');
    assert.ok(ui.includes('После применения все поля останутся редактируемыми'), 'admin review hint is missing');

    assertBalancedCss(css, 'book-metadata.css');
    assert.ok(css.includes('@media (max-width: 700px)'), 'mobile metadata form is missing');
    assert.ok(css.includes('#bookModal .modal-content'), 'book modal has no dedicated scroll container fix');
    assert.match(css, /overflow-y:\s*auto\s*!important/, 'book modal scrolling can be overridden by global polish styles');
    assert.ok(ui.includes('lookupRequestId'), 'stale ISBN responses are not guarded');
    assert.ok(ui.includes('ISBN-10 автоматически преобразуется в ISBN-13'), 'ISBN conversion is not explained in the form');
    assert.ok(ui.includes("event.key !== 'Enter'"), 'ISBN search cannot be started safely with Enter');
    assert.ok(pwa.includes('book-metadata.js?v=20260713-book-metadata-3'), 'PWA does not load current metadata JavaScript');
    assert.ok(pwa.includes('book-metadata.css?v=20260713-book-metadata-3'), 'PWA does not load current metadata CSS');
    assert.match(sw, /const CACHE_NAME = 'bibliotech-pwa-v\d[^']*'/, 'PWA cache has no versioned name');
    assert.ok(sw.includes("'/js/book-metadata.js'"), 'metadata JavaScript is not cached');
    assert.ok(sw.includes("'/css/book-metadata.css'"), 'metadata CSS is not cached');
}

function response(status, payload) {
    return {
        status,
        ok: status >= 200 && status < 300,
        async json() { return payload; }
    };
}

(async () => {
    validateArchitecture();

    assert.equal(normalizeIsbn('978-0-14-032872-1'), '9780140328721');
    assert.equal(normalizeIsbn('0451526538'), '9780451526533');
    assert.equal(normalizeIsbn('5-89815-171-0'), '9785898151713');
    assert.equal(isbn10To13('0451526538'), '9780451526533');
    assert.equal(isbn13To10('9780451526533'), '0451526538');
    assert.equal(isbn13To10('9791234567896'), '');
    assert.equal(validateIsbn('9780140328721'), true);
    assert.equal(validateIsbn('0451526538'), true);
    assert.equal(validateIsbn('5-89815-171-0'), true, 'valid Russian ISBN-10 is rejected');
    assert.equal(validateIsbn('9780140328720'), false);
    assert.equal(validateIsbn('123'), false);
    assert.equal(normalizePublicationYear('Published in 2009'), 2009);
    assert.equal(normalizePublicationYear('unknown'), null);
    assert.throws(() => normalizeBookMetadataInput({ isbn: '9780140328720' }), error => error.code === 'INVALID_ISBN');
    assert.equal(normalizeBookMetadataInput({ isbn: '5-89815-171-0' }).isbn, '9785898151713');
    assert.throws(() => normalizeBookMetadataInput({ publicationYear: 'not a year' }), error => error.code === 'INVALID_PUBLICATION_YEAR');
    assert.equal(normalizeBookMetadataInput({ metadataSourceUrl: 'javascript:alert(1)' }).metadataSourceUrl, null);
    assert.equal(normalizeBookMetadataInput({ metadataSourceUrl: 'https://openlibrary.org/books/OL1M' }).metadataSourceUrl, 'https://openlibrary.org/books/OL1M');

    const mapped = mapOpenLibraryMetadata(
        '9780140328721',
        {
            title: 'Fantastic Mr. Fox',
            authors: [{ name: 'Roald Dahl' }],
            publishers: [{ name: 'Puffin' }],
            publish_date: 'October 1, 1988',
            subjects: [{ name: 'Children’s fiction' }, { name: 'Foxes' }],
            cover: { large: 'https://covers.openlibrary.org/b/id/123-L.jpg' },
            url: 'https://openlibrary.org/books/OL1M'
        },
        { languages: [{ key: '/languages/eng' }] },
        { description: { value: 'A clever fox protects his family.' } }
    );
    assert.equal(mapped.title, 'Fantastic Mr. Fox');
    assert.equal(mapped.author, 'Roald Dahl');
    assert.equal(mapped.publisher, 'Puffin');
    assert.equal(mapped.publicationYear, 1988);
    assert.equal(mapped.language, 'Английский');
    assert.match(mapped.genre, /Children/);
    assert.match(mapped.description, /clever fox/);
    assert.equal(mapped.sourceUrl, 'https://openlibrary.org/books/OL1M');

    const googleMapped = mapGoogleBooksMetadata('9780140328721', {
        volumeInfo: {
            title: 'Fantastic Mr. Fox',
            authors: ['Roald Dahl'],
            publisher: 'Puffin',
            publishedDate: '1988-10-01',
            categories: ['Juvenile Fiction'],
            language: 'en',
            description: '<p>A clever fox.</p>',
            imageLinks: { thumbnail: 'http://books.google.com/cover.jpg' },
            infoLink: 'https://books.google.com/books?id=fox'
        }
    });
    assert.equal(googleMapped.source, 'googlebooks');
    assert.equal(googleMapped.description, 'A clever fox.');
    assert.equal(googleMapped.coverDataURL, 'https://books.google.com/cover.jpg');

    const customMapped = mapGoogleCustomSearchMetadata('9780140328721', {
        title: 'Fantastic Mr. Fox | Book shop',
        link: 'https://example.test/fantastic-mr-fox',
        snippet: 'A clever fox protects his family.',
        pagemap: {
            book: [{ name: 'Fantastic Mr. Fox', author: 'Roald Dahl', datepublished: '1988', publisher: 'Puffin' }],
            cse_image: [{ src: 'https://example.test/cover.jpg' }]
        }
    });
    assert.equal(customMapped.source, 'googlecustomsearch');
    assert.equal(customMapped.author, 'Roald Dahl');
    assert.equal(customMapped.publicationYear, 1988);

    let fetchCalls = 0;
    const fakeFetch = async url => {
        fetchCalls += 1;
        if (url.includes('/search.json?')) {
            return response(200, {
                docs: [{
                    isbn: ['9780140328721'],
                    key: '/works/OL1W',
                    title: 'Fantastic Mr. Fox',
                    author_name: ['Roald Dahl'],
                    publisher: ['Puffin'],
                    first_publish_year: 1988,
                    subject: ['Children’s fiction'],
                    cover_i: 123,
                    language: ['eng']
                }]
            });
        }
        if (url.includes('/isbn/')) {
            return response(200, {
                key: '/books/OL1M',
                title: 'Fantastic Mr. Fox',
                publishers: ['Puffin'],
                publish_date: '1988',
                languages: [{ key: '/languages/eng' }],
                works: [{ key: '/works/OL1W' }]
            });
        }
        if (url.includes('/works/OL1W.json')) {
            return response(200, { description: 'A clever fox protects his family.' });
        }
        return response(404, {});
    };

    const firstLookup = await lookupIsbnMetadata('9780140328721', { fetchImpl: fakeFetch, useCache: true });
    assert.equal(firstLookup.author, 'Roald Dahl');
    assert.equal(fetchCalls, 3);
    const cachedLookup = await lookupIsbnMetadata('9780140328721', { fetchImpl: fakeFetch, useCache: true });
    assert.equal(cachedLookup.title, 'Fantastic Mr. Fox');
    assert.equal(fetchCalls, 3, 'cached ISBN lookup made extra provider requests');

    let retryCalls = 0;
    const partialFailureFetch = async url => {
        if (url.includes('/isbn/')) {
            retryCalls += 1;
            return response(503, {});
        }
        if (url.includes('/search.json?')) {
            return response(200, {
                docs: [{
                    isbn: ['9780140328721'],
                    key: '/works/OL1W',
                    title: 'Fantastic Mr. Fox',
                    author_name: ['Roald Dahl'],
                    publisher: ['Puffin'],
                    first_publish_year: 1988,
                    language: ['eng']
                }]
            });
        }
        const aborted = new Error('optional work request timed out');
        aborted.name = 'AbortError';
        throw aborted;
    };
    const resilientLookup = await lookupIsbnMetadata('9780140328721', {
        fetchImpl: partialFailureFetch,
        useCache: false
    });
    assert.equal(resilientLookup.title, 'Fantastic Mr. Fox');
    assert.equal(resilientLookup.author, 'Roald Dahl');
    assert.equal(retryCalls, 2, 'transient ISBN API failure was not retried');

    const googleCalls = [];
    const googleFallback = await lookupIsbnMetadata('9780140328721', {
        useCache: false,
        googleBooksApiKey: 'server-only-books-key',
        fetchImpl: async url => {
            googleCalls.push(String(url));
            if (String(url).includes('/search.json?')) return response(200, { docs: [] });
            if (String(url).includes('/isbn/')) return response(404, {});
            if (String(url).includes('/books/v1/volumes?')) {
                return response(200, {
                    items: [{
                        volumeInfo: {
                            title: 'Google fallback title',
                            authors: ['Fallback Author'],
                            industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780140328721' }],
                            infoLink: 'https://books.google.com/books?id=fallback'
                        }
                    }]
                });
            }
            return response(404, {});
        }
    });
    assert.equal(googleFallback.source, 'googlebooks');
    assert.equal(googleFallback.title, 'Google fallback title');
    assert.ok(googleCalls.findIndex(url => url.includes('openlibrary.org')) < googleCalls.findIndex(url => url.includes('/books/v1/volumes?')), 'Google Books ran before Open Library finished');
    assert.equal(googleCalls.some(url => url.includes('/customsearch/v1?')), false, 'Custom Search ran after Google Books already found the book');

    const customCalls = [];
    const customFallback = await lookupIsbnMetadata('5898151710', {
        useCache: false,
        googleBooksApiKey: 'server-only-books-key',
        googleCustomSearchApiKey: 'server-only-custom-key',
        googleCustomSearchCx: 'search-engine-id',
        fetchImpl: async url => {
            customCalls.push(String(url));
            if (String(url).includes('/search.json?')) return response(200, { docs: [] });
            if (String(url).includes('/isbn/')) return response(404, {});
            if (String(url).includes('/books/v1/volumes?')) return response(200, { totalItems: 0, items: [] });
            if (String(url).includes('/customsearch/v1?')) {
                return response(200, {
                    items: [{
                        title: 'Грамматика: сборник упражнений | Книжный магазин',
                        link: 'https://example.test/grammar',
                        snippet: 'Ю. Б. Голицынский. Издательство КАРО.',
                        pagemap: {
                            book: [{
                                name: 'Грамматика: сборник упражнений',
                                author: 'Ю. Б. Голицынский',
                                publisher: 'КАРО'
                            }]
                        }
                    }]
                });
            }
            return response(404, {});
        }
    });
    assert.equal(customFallback.source, 'googlecustomsearch');
    assert.equal(customFallback.isbn, '9785898151713');
    assert.equal(customFallback.author, 'Ю. Б. Голицынский');
    const booksCallIndex = customCalls.findIndex(url => url.includes('/books/v1/volumes?'));
    const customCallIndex = customCalls.findIndex(url => url.includes('/customsearch/v1?'));
    assert.ok(booksCallIndex >= 0 && customCallIndex > booksCallIndex, 'Custom Search did not run strictly after Google Books');
    assert.match(customCalls[customCallIndex], /cx=search-engine-id/);

    await assert.rejects(
        () => lookupIsbnMetadata('5898151710', {
            fetchImpl: async url => url.includes('/search.json?')
                ? response(200, { docs: [] })
                : response(404, {}),
            useCache: false
        }),
        error => error.code === 'ISBN_NOT_FOUND'
            && /ISBN корректен/.test(error.message)
            && /вручную/.test(error.message)
    );

    await assert.rejects(
        () => lookupIsbnMetadata('9780140328720', { fetchImpl: fakeFetch }),
        error => error.code === 'INVALID_ISBN'
    );

    console.log('ISBN metadata check OK: validation, ISBN conversion, cascade providers, caching, schema, UI, search and PWA integration work.');
})().catch(error => {
    console.error(error.stack || error);
    process.exit(1);
});
