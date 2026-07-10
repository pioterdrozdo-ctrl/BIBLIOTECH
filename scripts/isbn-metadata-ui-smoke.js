'use strict';

const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4173';

async function request(path, { token, method = 'GET', body } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
}

function makeIsbn13(seed) {
    const body = `978${String(seed).replace(/\D/g, '').slice(-9).padStart(9, '0')}`;
    const sum = body.split('').reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
    return body + String((10 - (sum % 10)) % 10);
}

async function login() {
    const result = await request('/api/auth/login', {
        method: 'POST',
        body: { username: 'admin', password: 'GreenScreen' }
    });
    assert.equal(result.response.status, 200, `Login failed: ${JSON.stringify(result.payload)}`);
    return result.payload;
}

async function seedPage(page, auth) {
    await page.addInitScript(({ auth }) => {
        localStorage.setItem('token', auth.token);
        localStorage.setItem('bibliotech_current_user', JSON.stringify(auth.user));
        localStorage.setItem(`bibliotech_product_welcome_v1_${String(auth.user.username).toLowerCase()}`, '1');
    }, { auth });
}

async function installLookupMock(page, isbn, title) {
    await page.addInitScript(({ isbn, title }) => {
        const originalFetch = window.fetch.bind(window);
        window.fetch = function bibliotechTestFetch(input, init) {
            const url = typeof input === 'string' ? input : input?.url || '';
            if (url.includes(`/api/book-metadata/isbn/${isbn}`)) {
                return Promise.resolve(new Response(JSON.stringify({
                    message: 'Данные найдены. Проверьте их перед сохранением книги.',
                    metadata: {
                        isbn,
                        title,
                        author: 'Roald Dahl',
                        description: 'A clever fox protects his family.',
                        publisher: 'Puffin',
                        publicationYear: 1988,
                        genre: 'Children’s fiction, Foxes',
                        language: 'Английский',
                        coverDataURL: 'https://covers.openlibrary.org/b/id/123-L.jpg',
                        source: 'openlibrary',
                        sourceUrl: 'https://openlibrary.org/books/OL7353617M'
                    }
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                }));
            }
            return originalFetch(input, init);
        };
    }, { isbn, title });
}

async function verifyDesktop(browser, auth, isbn, title) {
    const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.stack || error.message));
    await seedPage(page, auth);
    await installLookupMock(page, isbn, title);

    await page.goto(`${baseUrl}/home.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#currentUserPill', { state: 'visible' });
    await page.waitForFunction(() => Boolean(window.BibliotechBookMetadata));
    assert.equal(await page.locator('link[href*="book-metadata.css"]').count(), 1, 'metadata CSS is missing or duplicated');
    assert.equal(await page.locator('script[src*="book-metadata.js"]').count(), 1, 'metadata JavaScript is missing or duplicated');

    await page.locator('#openModalBtn').click();
    await page.waitForSelector('#bookModal.active');
    await page.waitForSelector('#bookIsbn', { state: 'visible' });
    assert.equal(await page.locator('#bookPublicationYear').count(), 1, 'publication year field is missing');
    assert.equal(await page.locator('#bookPublisher').count(), 1, 'publisher field is missing');
    assert.equal(await page.locator('#bookGenre').count(), 1, 'genre field is missing');
    assert.equal(await page.locator('#bookLanguage').count(), 1, 'language field is missing');

    await page.locator('#bookIsbn').fill(isbn);
    await page.locator('#lookupBookIsbnBtn').click();
    await page.waitForSelector('#bookIsbnPreview:not([hidden])');
    assert.equal(await page.locator('#bookIsbnPreview').getByText(title).count(), 1, 'lookup preview title is missing');
    assert.equal(await page.locator('#bookIsbnPreview').getByText('Roald Dahl').count(), 1, 'lookup preview author is missing');
    assert.equal(await page.locator('#applyIsbnMetadataBtn').isVisible(), true, 'apply metadata action is missing');

    await page.locator('#applyIsbnMetadataBtn').click();
    assert.equal(await page.locator('#bookTitle').inputValue(), title);
    assert.equal(await page.locator('#bookAuthor').inputValue(), 'Roald Dahl');
    assert.equal(await page.locator('#bookPublicationYear').inputValue(), '1988');
    assert.equal(await page.locator('#bookPublisher').inputValue(), 'Puffin');
    assert.equal(await page.locator('#bookGenre').inputValue(), 'Children’s fiction, Foxes');
    assert.equal(await page.locator('#bookLanguage').inputValue(), 'Английский');
    assert.equal(await page.locator('#bookMetadataSource').inputValue(), 'openlibrary');

    await page.locator('#bookCopies').fill('2');
    await page.locator('#bookForm .submit-modal').click();
    await page.waitForFunction(() => !document.getElementById('bookModal')?.classList.contains('active'), { timeout: 20000 });
    await page.waitForFunction(expectedTitle => Array.from(document.querySelectorAll('.book-card .book-title')).some(node => node.textContent.includes(expectedTitle)), title);

    const catalog = await request(`/api/books?search=${encodeURIComponent(isbn)}`, { token: auth.token });
    assert.equal(catalog.response.status, 200);
    const created = catalog.payload.find(book => book.isbn === isbn);
    assert.ok(created, 'saved ISBN book is missing from catalog API');
    assert.equal(created.publisher, 'Puffin');
    assert.equal(created.genre, 'Children’s fiction, Foxes');
    assert.equal(created.language, 'Английский');

    await page.locator(`.book-card[data-id="${created.id}"]`).click();
    await page.waitForSelector('#viewModal.active');
    await page.waitForSelector('#viewBibliographicMeta:not([hidden])');
    assert.equal(await page.locator('#viewBibliographicMeta').getByText(isbn).count(), 1, 'ISBN is missing in book details');
    assert.equal(await page.locator('#viewBibliographicMeta').getByText('Puffin', { exact: true }).count(), 1, 'publisher is missing in book details');
    assert.equal(await page.locator('#viewBibliographicMeta').getByText('Английский').count(), 1, 'language is missing in book details');

    await page.locator('#editBookBtn').click();
    await page.waitForSelector('#bookModal.active');
    assert.equal(await page.locator('#bookIsbn').inputValue(), isbn, 'ISBN is not restored in edit form');
    assert.equal(await page.locator('#bookPublicationYear').inputValue(), '1988', 'year is not restored in edit form');
    assert.equal(await page.locator('#bookPublisher').inputValue(), 'Puffin', 'publisher is not restored in edit form');
    await page.locator('#bookPublisher').fill('Puffin Books');
    await page.locator('#bookForm .submit-modal').click();
    await page.waitForFunction(() => !document.getElementById('bookModal')?.classList.contains('active'), { timeout: 20000 });

    const detail = await request(`/api/books/${created.id}`, { token: auth.token });
    assert.equal(detail.response.status, 200);
    assert.equal(detail.payload.publisher, 'Puffin Books');
    assert.equal(detail.payload.isbn, isbn);

    const cleanup = await request(`/api/books/${created.id}`, { token: auth.token, method: 'DELETE' });
    assert.ok([200, 204].includes(cleanup.response.status), `Cleanup failed: ${cleanup.response.status}`);
    assert.deepEqual(errors, [], `Browser errors:\n${errors.join('\n')}`);
    await page.close();
}

async function verifyMobile(browser, auth) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await seedPage(page, auth);
    await page.goto(`${baseUrl}/home.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.BibliotechBookMetadata));
    await page.locator('#openModalBtn').click();
    await page.waitForSelector('#bookModal.active');
    await page.waitForSelector('#bookIsbn');
    const assistant = await page.locator('.isbn-assistant').boundingBox();
    assert.ok(assistant && assistant.width >= 340, `mobile ISBN assistant is too narrow: ${assistant?.width}`);
    assert.equal(await page.locator('#lookupBookIsbnBtn').isVisible(), true, 'mobile ISBN lookup button is not visible');
    assert.equal(await page.locator('.book-metadata-form-grid').isVisible(), true, 'mobile metadata fields are not visible');
    await page.locator('#closeModalBtn').click();
    await page.close();
}

(async () => {
    const auth = await login();
    const stamp = Date.now();
    const isbn = makeIsbn13(stamp);
    const title = `ISBN UI ${stamp}`;
    const browser = await chromium.launch({ headless: true });
    try {
        await verifyDesktop(browser, auth, isbn, title);
        await verifyMobile(browser, auth);
    } finally {
        await browser.close();
    }
    console.log('ISBN metadata UI smoke OK: lookup preview, apply, save, details, edit and mobile layout work.');
})().catch(error => {
    console.error(error.stack || error);
    process.exit(1);
});
