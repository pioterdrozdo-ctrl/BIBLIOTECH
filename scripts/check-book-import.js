'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');
const {
    parseImportFile,
    buildPreview,
    stableRowsPayload,
    signPreviewRows,
    verifyPreviewRows,
    MAX_IMPORT_ROWS
} = require('../backend/services/bookImport');

const root = path.join(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assertBalancedCss(source, filename) {
    const stripped = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
    let balance = 0;
    for (const char of stripped) {
        if (char === '{') balance += 1;
        if (char === '}') balance -= 1;
        assert.ok(balance >= 0, `${filename}: unexpected closing brace`);
    }
    assert.equal(balance, 0, `${filename}: unbalanced braces`);
}

function validateArchitecture() {
    const route = read('backend/routes/bookImport.js');
    const parser = read('backend/services/bookImport.js');
    const fallback = read('backend/services/localBookImportStore.js');
    const server = read('backend/server.js');
    const adminHtml = read('frontend/admin.html');
    const ui = read('frontend/js/book-import.js');
    const css = read('frontend/css/book-import.css');
    const sw = read('frontend/sw.js');
    const packageJson = JSON.parse(read('package.json'));

    assert.ok(packageJson.dependencies?.exceljs, 'Excel parser dependency is missing');
    assert.ok(route.includes("router.post('/preview', authMiddleware, isAdmin"), 'preview endpoint is not admin protected');
    assert.ok(route.includes("router.post('/commit', authMiddleware, isAdmin"), 'commit endpoint is not admin protected');
    assert.ok(route.includes("upload.single('file')"), 'multipart upload is missing');
    assert.ok(route.includes("fileSize: 5 * 1024 * 1024"), 'server file size limit is missing');
    assert.ok(route.includes("await client.query('BEGIN')"), 'PostgreSQL import transaction is missing');
    assert.ok(route.includes("await client.query('ROLLBACK')"), 'PostgreSQL rollback is missing');
    assert.ok(route.includes('pg_advisory_xact_lock'), 'concurrent import lock is missing');
    assert.ok(route.includes('verifyPreviewRows'), 'preview tamper protection is missing');
    assert.ok(route.includes('localBookImportStore.bulkImportBooks'), 'atomic JSON fallback is not wired');
    assert.ok(fallback.includes('writeStoreAtomic'), 'JSON import is not atomic');
    assert.ok(fallback.includes('fs.renameSync'), 'JSON atomic rename is missing');

    assert.ok(parser.includes("new Set(['.csv', '.xlsx'])"), 'CSV/XLSX format restriction is missing');
    assert.ok(parser.includes('MAX_IMPORT_ROWS = 500'), 'row limit is missing');
    assert.ok(parser.includes('buildBookKey'), 'duplicate identity key is missing');
    assert.ok(parser.includes('signPreviewRows'), 'preview signing is missing');
    assert.ok(parser.includes('timingSafeEqual'), 'constant-time preview signature comparison is missing');
    assert.ok(parser.includes('Не указано название'), 'title validation is missing');
    assert.ok(parser.includes('Не указан автор'), 'author validation is missing');

    const importMount = server.indexOf("app.use('/api/books/import', bookImportRoutes)");
    const bookMount = server.indexOf("app.use('/api/books', bookRoutes)");
    assert.ok(importMount > 0 && importMount < bookMount, 'import API must be mounted before /api/books/:id routes');

    assert.equal((adminHtml.match(/id="bookImportModal"/g) || []).length, 1, 'import modal is missing or duplicated');
    assert.equal((adminHtml.match(/id="openBookImportBtn"/g) || []).length, 1, 'import launcher is missing or duplicated');
    assert.ok(adminHtml.includes('css/book-import.css'), 'import CSS is not loaded');
    assert.ok(adminHtml.includes('js/book-import.js'), 'import JavaScript is not loaded');
    assert.ok(adminHtml.includes('bookImportDuplicateStrategy'), 'duplicate strategy control is missing');
    assert.ok(adminHtml.includes('bookImportPreviewBody'), 'preview table is missing');

    assert.ok(ui.includes('/books/import/preview'), 'UI preview request is missing');
    assert.ok(ui.includes('/books/import/commit'), 'UI commit request is missing');
    assert.ok(ui.includes('downloadTemplate'), 'CSV template download is missing');
    assert.ok(ui.includes('AbortController'), 'request cancellation is missing');
    assert.ok(ui.includes('duplicateStrategy'), 'duplicate strategy is not submitted');
    assert.ok(!ui.includes('innerHTML = error.message'), 'raw server errors must not be inserted as HTML');

    assertBalancedCss(css, 'book-import.css');
    assert.ok(css.includes('@media (max-width: 700px)'), 'mobile import layout is missing');
    assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'reduced-motion support is missing');

    assert.ok(sw.includes("CACHE_NAME = 'bibliotech-pwa-v24'"), 'PWA cache was not invalidated');
    assert.ok(sw.includes("'/admin.html'"), 'admin page is not cached');
    assert.ok(sw.includes("'/css/book-import.css'"), 'import CSS is not cached');
    assert.ok(sw.includes("'/js/book-import.js'"), 'import JavaScript is not cached');
}

async function parseCsv(text, name = 'books.csv') {
    return parseImportFile({
        originalname: name,
        buffer: Buffer.from(text, 'utf8')
    });
}

async function buildXlsxFile() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Книги');
    sheet.addRow(['Название', 'Автор', 'Описание', 'Количество', 'Доступна', 'Полка', 'Место', 'Заметка']);
    sheet.addRow(['XLSX книга', 'XLSX автор', 'Проверка Excel', 3, 'да', 'A', '01', 'Первый этаж']);
    const buffer = await workbook.xlsx.writeBuffer();
    return { originalname: 'books.xlsx', buffer: Buffer.from(buffer) };
}

(async () => {
    validateArchitecture();

    const csv = '\uFEFFНазвание;Автор;Описание;Количество;Доступна;Полка;Место;Заметка\r\n'
        + '"Новая; книга";Новый автор;"Описание с; точкой";2;да;A;01;Первый этаж\r\n'
        + 'Существующая книга;Известный автор;Дубль каталога;4;да;;;;\r\n'
        + '"Новая; книга";Новый автор;Повтор внутри файла;1;да;;;;\r\n'
        + 'Без автора;;Ошибка;1;да;;;;\r\n'
        + 'Плохое количество;Автор;Ошибка;1.5;да;;;;\r\n'
        + 'Неизвестное место;Автор;Предупреждение;1;да;X;99;Не существует\r\n';

    const parsed = await parseCsv(csv);
    assert.equal(parsed.sheetName, 'CSV');
    assert.equal(parsed.rows.length, 6);
    assert.equal(parsed.headers[0], 'Название');

    const locations = [{ id: 7, shelf_code: 'A', place_code: '01', note: 'Первый этаж' }];
    const existingBooks = [{ id: 42, title: 'Существующая книга', author: 'Известный автор', copies: 5 }];
    const preview = buildPreview(parsed.rows, existingBooks, locations);

    assert.equal(preview.summary.total, 6);
    assert.equal(preview.summary.ready, 2);
    assert.equal(preview.summary.duplicateCatalog, 1);
    assert.equal(preview.summary.duplicateFile, 1);
    assert.equal(preview.summary.errors, 2);
    assert.equal(preview.rows[0].data.title, 'Новая; книга');
    assert.equal(preview.rows[0].data.locationId, 7);
    assert.equal(preview.rows[1].duplicate.type, 'catalog');
    assert.equal(preview.rows[1].duplicate.bookId, 42);
    assert.equal(preview.rows[2].duplicate.type, 'file');
    assert.ok(preview.rows[3].errors.some(message => message.includes('автор')));
    assert.ok(preview.rows[4].errors.some(message => message.includes('целым числом')));
    assert.ok(preview.rows[5].warnings.some(message => message.includes('не найдено')));

    const publicRows = preview.rows.map(row => ({ rowNumber: row.rowNumber, data: row.data }));
    const stable = stableRowsPayload(publicRows);
    const token = signPreviewRows(stable);
    assert.equal(verifyPreviewRows(stable, token), true, 'valid preview token was rejected');
    const tampered = structuredClone(stable);
    tampered[0].data.copies = 999;
    assert.equal(verifyPreviewRows(tampered, token), false, 'tampered preview token was accepted');

    const normalizedPreview = buildPreview(stable, existingBooks, locations);
    assert.equal(normalizedPreview.rows[0].data.title, 'Новая; книга', 'normalized rows were lost between preview and commit');
    assert.equal(normalizedPreview.rows[0].data.copies, 2);

    const xlsx = await parseImportFile(await buildXlsxFile());
    assert.equal(xlsx.sheetName, 'Книги');
    const xlsxPreview = buildPreview(xlsx.rows, [], locations);
    assert.equal(xlsxPreview.summary.ready, 1);
    assert.equal(xlsxPreview.rows[0].data.title, 'XLSX книга');
    assert.equal(xlsxPreview.rows[0].data.copies, 3);
    assert.equal(xlsxPreview.rows[0].data.locationId, 7);

    await assert.rejects(
        () => parseCsv('Название;Автор\r\n"Незакрытая строка;Автор'),
        error => error.code === 'INVALID_CSV'
    );
    await assert.rejects(
        () => parseImportFile({ originalname: 'books.xls', buffer: Buffer.from('old excel') }),
        error => error.code === 'UNSUPPORTED_FILE'
    );

    const tooManyRows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, index) => `Книга ${index};Автор`).join('\r\n');
    await assert.rejects(
        () => parseCsv(`Название;Автор\r\n${tooManyRows}`),
        error => error.code === 'TOO_MANY_ROWS'
    );

    console.log('Book import check OK: architecture, CSV, XLSX, validation, duplicates, transactions, mobile UI and preview signatures work.');
})().catch(error => {
    console.error(error.stack || error);
    process.exit(1);
});
