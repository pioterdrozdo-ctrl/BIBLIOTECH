'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    normalizeIsbn,
    validateIsbn,
    normalizePublicationYear,
    normalizeBookMetadataInput,
    mapOpenLibraryMetadata,
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
    assert.ok(ui.includes('Применить данные'), 'metadata review step is missing');
    assert.ok(ui.includes("form.addEventListener('submit', saveBookWithMetadata, true)"), 'safe metadata form interception is missing');
    assert.ok(ui.includes('/book-metadata/books'), 'metadata save endpoint is not used');
    assert.ok(ui.includes('viewBibliographicMeta'), 'book detail metadata section is missing');
    assert.ok(ui.includes('После применения все поля останутся редактируемыми'), 'admin review hint is missing');

    assertBalancedCss(css, 'book-metadata.css');
    assert.ok(css.includes('@media (max-width: 700px)'), 'mobile metadata form is missing');
    assert.ok(pwa.includes('book-metadata.js?v=20260710-book-metadata-1'), 'PWA does not load metadata JavaScript');
    assert.ok(pwa.includes('book-metadata.css?v=20260710-book-metadata-1'), 'PWA does not load metadata CSS');
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
    assert.equal(validateIsbn('9780140328721'), true);
    assert.equal(validateIsbn('0451526538'), true);
    assert.equal(validateIsbn('9780140328720'), false);
    assert.equal(validateIsbn('123'), false);
    assert.equal(normalizePublicationYear('Published in 2009'), 2009);
    assert.equal(normalizePublicationYear('unknown'), null);
    assert.throws(() => normalizeBookMetadataInput({ isbn: '9780140328720' }), error => error.code === 'INVALID_ISBN');
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

    let fetchCalls = 0;
    const fakeFetch = async url => {
        fetchCalls += 1;
        if (url.includes('/api/books?')) {
            return response(200, {
                'ISBN:9780140328721': {
                    title: 'Fantastic Mr. Fox',
                    authors: [{ name: 'Roald Dahl' }],
                    publishers: [{ name: 'Puffin' }],
                    publish_date: '1988',
                    subjects: [{ name: 'Children’s fiction' }],
                    cover: { large: 'https://covers.openlibrary.org/b/id/123-L.jpg' },
                    url: 'https://openlibrary.org/books/OL1M'
                }
            });
        }
        if (url.includes('/isbn/')) {
            return response(200, {
                key: '/books/OL1M',
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

    await assert.rejects(
        () => lookupIsbnMetadata('9780140328720', { fetchImpl: fakeFetch }),
        error => error.code === 'INVALID_ISBN'
    );

    console.log('ISBN metadata check OK: validation, URL safety, Open Library mapping, caching, schema, UI, search and PWA integration work.');
})().catch(error => {
    console.error(error.stack || error);
    process.exit(1);
});
