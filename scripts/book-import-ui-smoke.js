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

async function verifyDesktop(browser, auth, existingTitle, newTitle) {
    const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.stack || error.message));
    await seedPage(page, auth);
    await page.goto(`${baseUrl}/admin.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#openBookImportBtn', { state: 'visible' });
    await page.waitForFunction(() => Boolean(window.BibliotechBookImport));

    assert.equal(await page.locator('link[href*="book-import.css"]').count(), 1, 'book import CSS is duplicated or missing');
    assert.equal(await page.locator('script[src*="book-import.js"]').count(), 1, 'book import JavaScript is duplicated or missing');

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#downloadBookImportTemplateBtn').click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'bibliotech_import_template.csv');

    await page.locator('#openBookImportBtn').click();
    await page.waitForSelector('#bookImportModal.active');
    assert.equal(await page.locator('#bookImportModal').count(), 1, 'import modal is duplicated');
    assert.equal(await page.locator('#bookImportDropzone').isVisible(), true, 'dropzone is not visible');

    const csv = '\uFEFFНазвание;Автор;Описание;Количество;Доступна\r\n'
        + `${newTitle};UI Import Author;Новая книга из интерфейса;2;да\r\n`
        + `${existingTitle};UI Import Author;Дубль каталога;3;да\r\n`
        + `Ошибка UI;;Нет автора;1;да\r\n`;
    await page.locator('#bookImportFileInput').setInputFiles({
        name: 'ui-books.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(csv, 'utf8')
    });

    await page.waitForSelector('#bookImportPreviewStage:not([hidden])', { timeout: 20000 });
    assert.equal(await page.locator('#bookImportSummary .book-import-summary-card').count(), 6, 'preview summary is incomplete');
    assert.equal(await page.locator('#bookImportPreviewBody tr').count(), 3, 'preview row count is incorrect');
    assert.equal(await page.locator('#bookImportPreviewBody .book-import-status.ready').count(), 1, 'ready row is missing');
    assert.equal(await page.locator('#bookImportPreviewBody .book-import-status.duplicate').count(), 1, 'catalog duplicate is missing');
    assert.equal(await page.locator('#bookImportPreviewBody .book-import-status.error').count(), 1, 'invalid row is missing');
    assert.equal(await page.locator('#bookImportStrategyBlock').isVisible(), true, 'duplicate strategy is not shown');

    await page.locator('#bookImportDuplicateStrategy').selectOption('merge_copies');
    const strategyState = await page.evaluate(() => ({
        value: document.getElementById('bookImportDuplicateStrategy')?.value,
        buttonText: document.getElementById('bookImportCommitBtn')?.textContent?.trim(),
        buttonDisabled: document.getElementById('bookImportCommitBtn')?.disabled,
        readyRows: document.querySelectorAll('#bookImportPreviewBody .book-import-status.ready').length,
        duplicateRows: document.querySelectorAll('#bookImportPreviewBody .book-import-status.duplicate').length,
        duplicateCopies: Array.from(document.querySelectorAll('#bookImportPreviewBody tr'))
            .filter(row => row.querySelector('.book-import-status.duplicate'))
            .map(row => row.children[4]?.textContent?.trim())
    }));
    console.log(`Import strategy state: ${JSON.stringify(strategyState)}`);
    assert.equal(strategyState.value, 'merge_copies', `Duplicate strategy was not selected: ${JSON.stringify(strategyState)}`);
    assert.equal(strategyState.buttonText, 'Добавить книги · 2', `Import count is incorrect: ${JSON.stringify(strategyState)}`);
    assert.equal(strategyState.buttonDisabled, false, `Import button stayed disabled: ${JSON.stringify(strategyState)}`);

    await page.locator('#bookImportCommitBtn').click();
    await page.waitForSelector('#bookImportResultStage:not([hidden])', { timeout: 20000 });
    assert.equal(await page.locator('#bookImportResultGrid article').count(), 4, 'import result summary is incomplete');
    assert.equal(await page.locator('#bookImportOpenCatalogBtn').isVisible(), true, 'catalog link is missing after import');

    const catalog = await request('/api/books', { token: auth.token });
    assert.equal(catalog.response.status, 200);
    assert.ok(catalog.payload.some(book => book.title === newTitle), 'UI import did not create the new book');
    const merged = catalog.payload.find(book => book.title === existingTitle && book.author === 'UI Import Author');
    assert.equal(Number(merged?.copies), 5, 'UI import did not merge duplicate copies');

    await page.locator('#bookImportCancelBtn').click();
    await page.waitForFunction(() => !document.getElementById('bookImportModal')?.classList.contains('active'));
    assert.deepEqual(errors, [], `Browser errors:\n${errors.join('\n')}`);
    await page.close();
}

async function verifyMobile(browser, auth) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await seedPage(page, auth);
    await page.goto(`${baseUrl}/admin.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#openBookImportBtn', { state: 'visible' });
    await page.locator('#openBookImportBtn').click();
    await page.waitForSelector('#bookImportModal.active');
    const dialog = await page.locator('#bookImportModal .book-import-dialog').boundingBox();
    assert.ok(dialog && dialog.width >= 350, `mobile import width is too small: ${dialog?.width}`);
    assert.ok(dialog && dialog.height >= 790, `mobile import height is too small: ${dialog?.height}`);
    assert.equal(await page.locator('#bookImportDropzone').isVisible(), true, 'mobile dropzone is not visible');
    await page.locator('#bookImportCancelBtn').click();
    await page.close();
}

(async () => {
    const auth = await login();
    const stamp = Date.now();
    const existingTitle = `UI существующая ${stamp}`;
    const newTitle = `UI новая ${stamp}`;
    const existing = await request('/api/books', {
        token: auth.token,
        method: 'POST',
        body: {
            title: existingTitle,
            author: 'UI Import Author',
            description: 'Книга для браузерной проверки дублей.',
            copies: 2,
            available: true
        }
    });
    assert.equal(existing.response.status, 201, `Book seed failed: ${JSON.stringify(existing.payload)}`);

    const browser = await chromium.launch({
        headless: true,
        ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {})
    });
    try {
        await verifyDesktop(browser, auth, existingTitle, newTitle);
        await verifyMobile(browser, auth);
    } finally {
        await browser.close();
    }
    console.log('Book import UI smoke OK: template, preview, validation, duplicate strategy, commit and mobile layout work.');
})().catch(error => {
    console.error(error.stack || error);
    process.exit(1);
});
