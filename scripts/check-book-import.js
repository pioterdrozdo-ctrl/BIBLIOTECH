'use strict';

const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const {
    parseImportFile,
    buildPreview,
    stableRowsPayload,
    signPreviewRows,
    verifyPreviewRows,
    MAX_IMPORT_ROWS
} = require('../backend/services/bookImport');

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

    console.log('Book import parser OK: CSV, XLSX, validation, locations, duplicates and preview signatures work.');
})().catch(error => {
    console.error(error.stack || error);
    process.exit(1);
});
