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

async function verifyDesktop(browser, auth) {
    const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.stack || error.message));
    await seedPage(page, auth);

    await page.route('**/api/book-metadata/isbn/9780140328721', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                message: 'Данные найдены. Проверьте их перед сохранением книги.',
                metadata: {
                    isbn: '9780140328721',
                    title: 'Fantastic Mr. Fox',
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
            })
        });
    });

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

    await page.locator('#bookIsbn').fill('978-0-14-032872-1');
    await page.locator('#lookupBookIsbnBtn').click();
    await page.waitForSelector('#bookIsbnPreview:not([hidden])');
    assert.equal(await page.locator('#bookIsbnPreview').getByText('Fantastic Mr. Fox').count(), 1, 'lookup preview title is missing');
    assert.equal(await page.locator('#bookIsbnPreview').getByText('Roald Dahl').count(), 1, 'lookup preview author is missing');
    assert.equal(await page.locator('#applyIsbnMetadataBtn').isVisible(), true, 'apply metadata action is missing');

    await page.locator('#applyIsbnMetadataBtn').click();
    assert.equal(await page.locator('#bookTitle').inputValue(), 'Fantastic Mr. Fox');
    assert.equal(await page.locator('#bookAuthor').inputValue(), 'Roald Dahl');
    assert.equal(await page.locator('#bookPublicationYear').inputValue(), '1988');
    assert.equal(await page.locator('#bookPublisher').inputValue(), 'Puffin');
    assert.equal(await page.locator('#bookGenre').inputValue(), 'Children’s fiction, Foxes');
    assert.equal(await page.locator('#bookLanguage').inputValue(), 'Английский');
    assert.equal(await page.locator('#bookMetadataSource').inputValue(), 'openlibrary');

    await page.locator('#bookCopies').fill('2');
    await page.locator('#bookForm .submit-modal').click();
    await page.waitForFunction(() => !document.getElementById('bookModal')?.classList.contains('active'), { timeout: 20000 });
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.book-card .book-title')).some(node => node.textContent.includes('Fantastic Mr. Fox')));

    const catalog = await request('/api/books?search=9780140328721', { token: auth.token });
    assert.equal(catalog.response.status, 200);
    const created = catalog.payload.find(book => book.isbn === '9780140328721');
    assert.ok(created, 'saved ISBN book is missing from catalog API');
    assert.equal(created.publisher, 'Puffin');
    assert.equal(created.genre, 'Children’s fiction, Foxes');
    assert.equal(created.language, 'Английский');

    await page.locator(`.book-card[data-id="${created.id}"]`).click();
    await page.waitForSelector('#viewModal.active');
    await page.waitForSelector('#viewBibliographicMeta:not([hidden])');
    assert.equal(await page.locator('#viewBibliographicMeta').getByText('9780140328721').count(), 1, 'ISBN is missing in book details');
    assert.equal(await page.locator('#viewBibliographicMeta').getByText('Puffin').count(), 1, 'publisher is missing in book details');
    assert.equal(await page.locator('#viewBibliographicMeta').getByText('Английский').count(), 1, 'language is missing in book details');

    await page.locator('#editBookBtn').click();
    await page.waitForSelector('#bookModal.active');
    assert.equal(await page.locator('#bookIsbn').inputValue(), '9780140328721', 'ISBN is not restored in edit form');
    assert.equal(await page.locator('#bookPublicationYear').inputValue(), '1988', 'year is not restored in edit form');
    assert.equal(await page.locator('#bookPublisher').inputValue(), 'Puffin', 'publisher is not restored in edit form');
    await page.locator('#bookPublisher').fill('Puffin Books');
    await page.locator('#bookForm .submit-modal').click();
    await page.waitForFunction(() => !document.getElementById('bookModal')?.classList.contains('active'), { timeout: 20000 });

    const detail = await request(`/api/books/${created.id}`, { token: auth.token });
    assert.equal(detail.response.status, 200);
    assert.equal(detail.payload.publisher, 'Puffin Books');
    assert.equal(detail.payload.isbn, '9780140328721');

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
    await page.locator('#menuIcon').click();
    await page.waitForSelector('#navMenu.active');
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
    const browser = await chromium.launch({ headless: true });
    try {
        await verifyDesktop(browser, auth);
        await verifyMobile(browser, auth);
    } finally {
        await browser.close();
    }
    console.log('ISBN metadata UI smoke OK: lookup preview, apply, save, details, edit and mobile layout work.');
})().catch(error => {
    console.error(error.stack || error);
    process.exit(1);
});
