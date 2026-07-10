'use strict';

const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4173';

async function jsonRequest(path, { token, method = 'GET', body } = {}) {
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
    const { response, payload } = await jsonRequest('/api/auth/login', {
        method: 'POST',
        body: { username: 'admin', password: 'GreenScreen' }
    });
    assert.equal(response.status, 200, `Login failed: ${JSON.stringify(payload)}`);
    assert.ok(payload.token, 'Login token is missing');
    return payload.token;
}

async function previewFile(token, name, content, type) {
    const form = new FormData();
    form.append('file', new Blob([content], { type }), name);
    const response = await fetch(`${baseUrl}/api/books/import/preview`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
}

(async () => {
    const token = await login();
    const stamp = Date.now();
    const existingTitle = `Импорт существующая ${stamp}`;
    const newTitle = `Импорт новая ${stamp}`;

    const createdExisting = await jsonRequest('/api/books', {
        token,
        method: 'POST',
        body: {
            title: existingTitle,
            author: 'API Import Author',
            description: 'Книга для проверки объединения экземпляров.',
            copies: 2,
            available: true
        }
    });
    assert.equal(createdExisting.response.status, 201, `Existing book seed failed: ${JSON.stringify(createdExisting.payload)}`);

    const csv = '\uFEFFНазвание;Автор;Описание;Количество;Доступна\r\n'
        + `${newTitle};API Import Author;Новая книга;1;да\r\n`
        + `${existingTitle};API Import Author;Дубль каталога;3;да\r\n`
        + `${newTitle};API Import Author;Повтор файла;2;да\r\n`
        + `Строка без автора ${stamp};;Ошибка;1;да\r\n`;

    const unauthorized = await previewFile('', 'books.csv', csv, 'text/csv');
    assert.equal(unauthorized.response.status, 401, 'Import preview is available without authentication');

    const preview = await previewFile(token, 'books.csv', csv, 'text/csv');
    assert.equal(preview.response.status, 200, `Preview failed: ${JSON.stringify(preview.payload)}`);
    assert.equal(preview.payload.summary.total, 4);
    assert.equal(preview.payload.summary.ready, 1);
    assert.equal(preview.payload.summary.duplicateCatalog, 1);
    assert.equal(preview.payload.summary.duplicateFile, 1);
    assert.equal(preview.payload.summary.errors, 1);
    assert.match(preview.payload.importToken, /^[a-f0-9]{64}$/i);

    const rows = preview.payload.rows.map(row => ({ rowNumber: row.rowNumber, data: row.data }));
    const tamperedRows = structuredClone(rows);
    tamperedRows[0].data.copies = 999;
    const tampered = await jsonRequest('/api/books/import/commit', {
        token,
        method: 'POST',
        body: {
            rows: tamperedRows,
            importToken: preview.payload.importToken,
            duplicateStrategy: 'merge_copies'
        }
    });
    assert.equal(tampered.response.status, 409, 'Tampered preview data was accepted');

    const committed = await jsonRequest('/api/books/import/commit', {
        token,
        method: 'POST',
        body: {
            rows,
            importToken: preview.payload.importToken,
            duplicateStrategy: 'merge_copies'
        }
    });
    assert.equal(committed.response.status, 201, `Commit failed: ${JSON.stringify(committed.payload)}`);
    assert.equal(committed.payload.created, 1);
    assert.equal(committed.payload.merged, 1);
    assert.equal(committed.payload.skipped, 1);
    assert.equal(committed.payload.errors, 1);

    const existingAfter = await jsonRequest(`/api/books/${createdExisting.payload.id}`, { token });
    assert.equal(existingAfter.response.status, 200);
    assert.equal(Number(existingAfter.payload.copies), 5, 'Duplicate copies were not merged');

    const catalog = await jsonRequest('/api/books', { token });
    assert.equal(catalog.response.status, 200);
    const imported = catalog.payload.find(book => book.title === newTitle && book.author === 'API Import Author');
    assert.ok(imported, 'New imported book is missing from the catalog');
    assert.match(imported.qrCode || imported.qr_code || '', /^BT\d{6,}$/i, 'Imported book QR code is missing');

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Импорт');
    sheet.addRow(['Название', 'Автор', 'Количество']);
    sheet.addRow([`Excel API ${stamp}`, 'Excel Author', 2]);
    const xlsxBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const xlsxPreview = await previewFile(
        token,
        'books.xlsx',
        xlsxBuffer,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    assert.equal(xlsxPreview.response.status, 200, `XLSX preview failed: ${JSON.stringify(xlsxPreview.payload)}`);
    assert.equal(xlsxPreview.payload.summary.ready, 1);
    assert.equal(xlsxPreview.payload.file.sheetName, 'Импорт');

    console.log('Book import API smoke OK: auth, preview, signatures, duplicates, transaction commit, QR and XLSX work.');
})().catch(error => {
    console.error(error.stack || error);
    process.exit(1);
});
