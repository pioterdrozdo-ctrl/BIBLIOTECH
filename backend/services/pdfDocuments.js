'use strict';

const path = require('path');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

const fontRoot = path.join(path.dirname(require.resolve('dejavu-fonts-ttf/package.json')), 'ttf');
const fonts = {
    regular: path.join(fontRoot, 'DejaVuSans.ttf'),
    bold: path.join(fontRoot, 'DejaVuSans-Bold.ttf')
};

const colors = {
    ink: '#173126',
    muted: '#62726a',
    accent: '#2f7d5a',
    accentSoft: '#e6f1ea',
    border: '#cfdcd4',
    danger: '#a8443c',
    paper: '#ffffff'
};

function text(value, fallback = '-') {
    const normalized = String(value ?? '').trim();
    return normalized || fallback;
}

function formatDate(value, withTime = false) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {})
    }).format(date);
}

function locationLabel(book = {}) {
    const location = book.location || {};
    return [location.note, location.shelfCode || location.shelf_code, location.placeCode || location.place_code ? `место ${location.placeCode || location.place_code}` : '']
        .filter(Boolean)
        .join(' / ') || 'Место не указано';
}

function createDocument(options = {}) {
    const doc = new PDFDocument({
        size: 'A4',
        margin: 42,
        bufferPages: true,
        info: {
            Title: options.title || 'BIBLIOTECH',
            Author: 'BIBLIOTECH',
            Subject: options.subject || 'Библиотечный документ',
            CreationDate: new Date()
        }
    });
    doc.registerFont('Bibliotech', fonts.regular);
    doc.registerFont('BibliotechBold', fonts.bold);
    doc.font('Bibliotech').fillColor(colors.ink);
    return doc;
}

function collect(doc, render) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('error', reject);
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        Promise.resolve(render(doc)).then(() => {
            addFooters(doc);
            doc.end();
        }).catch(reject);
    });
}

function addFooters(doc) {
    const range = doc.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index += 1) {
        doc.switchToPage(index);
        const label = `BIBLIOTECH  |  страница ${index - range.start + 1} из ${range.count}`;
        doc.font('Bibliotech').fontSize(8).fillColor(colors.muted);
        doc.text(label, (doc.page.width - doc.widthOfString(label)) / 2, doc.page.height - 52, { lineBreak: false });
    }
}

function drawBrandHeader(doc, title, subtitle) {
    const top = doc.y;
    doc.roundedRect(42, top, doc.page.width - 84, 74, 14).fill(colors.ink);
    doc.fillColor(colors.paper).font('BibliotechBold').fontSize(12).text('BIBLIOTECH', 60, top + 14, { characterSpacing: 1.4 });
    doc.fontSize(20).text(title, 60, top + 31, { width: doc.page.width - 120, ellipsis: true });
    doc.y = top + 86;
    if (subtitle) {
        doc.fillColor(colors.muted).font('Bibliotech').fontSize(9.5).text(subtitle, 46, doc.y, { width: doc.page.width - 92 });
        doc.moveDown(0.7);
    }
    doc.fillColor(colors.ink);
}

function drawKeyValue(doc, label, value, options = {}) {
    const x = options.x ?? 46;
    const width = options.width ?? doc.page.width - 92;
    const y = doc.y;
    doc.font('BibliotechBold').fontSize(9).fillColor(colors.muted).text(label.toUpperCase(), x, y, { width });
    doc.font('Bibliotech').fontSize(11).fillColor(colors.ink).text(text(value), x, y + 14, { width });
    doc.y = Math.max(doc.y, y + 38);
}

function ensureRoom(doc, height = 80) {
    if (doc.y + height <= doc.page.height - 54) return;
    doc.addPage();
    doc.x = 42;
    doc.y = 44;
}

function drawSummaryCards(doc, cards = []) {
    const gap = 8;
    const width = (doc.page.width - 84 - gap * (cards.length - 1)) / cards.length;
    const y = doc.y;
    cards.forEach((card, index) => {
        const x = 42 + index * (width + gap);
        doc.roundedRect(x, y, width, 64, 10).fill(card.tone === 'danger' ? '#f7e5e3' : colors.accentSoft);
        doc.fillColor(card.tone === 'danger' ? colors.danger : colors.accent)
            .font('BibliotechBold').fontSize(18).text(String(card.value ?? 0), x + 12, y + 10, { width: width - 24 });
        doc.fillColor(colors.muted).font('Bibliotech').fontSize(8.5).text(card.label, x + 12, y + 37, { width: width - 24 });
    });
    doc.y = y + 76;
}

function drawTable(doc, columns, rows, options = {}) {
    const x = options.x ?? 42;
    const widths = columns.map(column => column.width);
    const totalWidth = widths.reduce((sum, width) => sum + width, 0);
    const headerHeight = 26;
    const rowPadding = 6;

    const drawHeader = () => {
        ensureRoom(doc, headerHeight + 28);
        const y = doc.y;
        doc.rect(x, y, totalWidth, headerHeight).fill(colors.ink);
        let cursor = x;
        columns.forEach((column, index) => {
            doc.fillColor(colors.paper).font('BibliotechBold').fontSize(8)
                .text(column.label, cursor + rowPadding, y + 8, { width: widths[index] - rowPadding * 2, ellipsis: true });
            cursor += widths[index];
        });
        doc.y = y + headerHeight;
    };

    drawHeader();
    if (!rows.length) {
        doc.rect(x, doc.y, totalWidth, 34).strokeColor(colors.border).stroke();
        doc.fillColor(colors.muted).font('Bibliotech').fontSize(9).text(options.emptyText || 'Нет записей', x + 8, doc.y + 11, { width: totalWidth - 16, align: 'center' });
        doc.x = x;
        doc.y += 42;
        return;
    }

    for (const row of rows) {
        const values = columns.map(column => text(typeof column.value === 'function' ? column.value(row) : row[column.key]));
        const heights = values.map((value, index) => doc.font('Bibliotech').fontSize(8.3).heightOfString(value, { width: widths[index] - rowPadding * 2 }));
        const rowHeight = Math.max(28, Math.max(...heights) + rowPadding * 2);
        if (doc.y + rowHeight > doc.page.height - 54) {
            doc.addPage();
            doc.x = x;
            doc.y = 44;
            drawHeader();
        }
        const y = doc.y;
        doc.rect(x, y, totalWidth, rowHeight).fillAndStroke('#ffffff', colors.border);
        let cursor = x;
        columns.forEach((column, index) => {
            if (index > 0) doc.moveTo(cursor, y).lineTo(cursor, y + rowHeight).strokeColor(colors.border).stroke();
            doc.fillColor(colors.ink).font('Bibliotech').fontSize(8.3)
                .text(values[index], cursor + rowPadding, y + rowPadding, { width: widths[index] - rowPadding * 2 });
            cursor += widths[index];
        });
        doc.x = x;
        doc.y = y + rowHeight;
    }
    doc.x = x;
    doc.y += 10;
}

async function createLabelsPdf(books = []) {
    const doc = createDocument({ title: 'Этикетки BIBLIOTECH', subject: 'QR-этикетки для книг' });
    return collect(doc, async pdf => {
        const marginX = 24;
        const marginY = 28;
        const gap = 7;
        const columns = 3;
        const rows = 7;
        const footerReserve = 66;
        const cellWidth = (pdf.page.width - marginX * 2 - gap * (columns - 1)) / columns;
        const cellHeight = (pdf.page.height - marginY - footerReserve - gap * (rows - 1)) / rows;
        for (let index = 0; index < books.length; index += 1) {
            if (index > 0 && index % (columns * rows) === 0) pdf.addPage();
            const pageIndex = index % (columns * rows);
            const column = pageIndex % columns;
            const row = Math.floor(pageIndex / columns);
            const x = marginX + column * (cellWidth + gap);
            const y = marginY + row * (cellHeight + gap);
            const book = books[index];
            pdf.roundedRect(x, y, cellWidth, cellHeight, 8).fillAndStroke('#ffffff', colors.border);
            pdf.roundedRect(x + 7, y + 7, 54, 18, 5).fill(colors.ink);
            pdf.fillColor(colors.paper).font('BibliotechBold').fontSize(6.6).text('BIBLIOTECH', x + 10, y + 12, {
                width: 48, characterSpacing: 0.15, lineBreak: false
            });
            const storedQrCode = text(book.qr_code || book.qrCode, '');
            const qrTarget = text(book.qrLink || book.qr_link || storedQrCode, '');
            if (qrTarget) {
                const png = await QRCode.toBuffer(qrTarget, { type: 'png', errorCorrectionLevel: 'M', margin: 1, width: 180 });
                pdf.image(png, x + 8, y + 31, { width: 57, height: 57 });
            } else {
                pdf.roundedRect(x + 8, y + 31, 57, 57, 5).fill(colors.accentSoft);
                pdf.fillColor(colors.muted).font('Bibliotech').fontSize(7).text('QR не назначен', x + 13, y + 51, { width: 47, align: 'center' });
            }
            const textX = x + 72;
            const textWidth = cellWidth - 80;
            pdf.fillColor(colors.ink).font('BibliotechBold').fontSize(9.2).text(text(book.title), textX, y + 10, {
                width: textWidth, height: 28, ellipsis: true
            });
            pdf.fillColor(colors.muted).font('Bibliotech').fontSize(7.3).text(text(book.author), textX, y + 40, {
                width: textWidth, height: 20, ellipsis: true
            });
            pdf.fillColor(colors.ink).font('BibliotechBold').fontSize(7.5).text(storedQrCode || 'Без QR', textX, y + 65, {
                width: textWidth, ellipsis: true
            });
            pdf.fillColor(colors.muted).font('Bibliotech').fontSize(6.8).text(locationLabel(book), textX, y + 78, {
                width: textWidth, height: 22, ellipsis: true
            });
        }
        if (!books.length) {
            pdf.font('BibliotechBold').fontSize(18).fillColor(colors.ink).text('Нет книг для печати', 42, 80, { align: 'center' });
        }
    });
}

async function createRentalActPdf(rental = {}) {
    const doc = createDocument({ title: `Акт выдачи #${rental.id || ''}`, subject: 'Акт выдачи или возврата книги' });
    return collect(doc, pdf => {
        drawBrandHeader(pdf, `Акт выдачи книги #${rental.id || '-'}`, `Сформирован ${formatDate(new Date(), true)}`);
        drawKeyValue(pdf, 'Книга', `${text(rental.book_title)} / ${text(rental.book_author)}`);
        drawKeyValue(pdf, 'Читатель', `${text(rental.username)} (ID ${text(rental.user_id)})`);
        drawKeyValue(pdf, 'Дата выдачи', formatDate(rental.rented_at, true));
        drawKeyValue(pdf, 'Срок возврата', formatDate(rental.due_at, true));
        drawKeyValue(pdf, 'Статус', rental.returned_at ? `Возвращена ${formatDate(rental.returned_at, true)}` : 'На руках');
        drawKeyValue(pdf, 'Идентификатор книги', text(rental.qr_code || rental.isbn || rental.book_id));
        pdf.moveDown(1.2);
        pdf.font('Bibliotech').fontSize(10).fillColor(colors.ink).text(
            'Настоящий акт подтверждает передачу указанного издания читателю и фиксирует состояние операции в системе BIBLIOTECH.',
            { lineGap: 4 }
        );
        pdf.moveDown(3);
        const y = pdf.y;
        pdf.moveTo(48, y).lineTo(250, y).strokeColor(colors.border).stroke();
        pdf.moveTo(345, y).lineTo(547, y).strokeColor(colors.border).stroke();
        pdf.font('Bibliotech').fontSize(8.5).fillColor(colors.muted).text('Библиотекарь / подпись', 48, y + 8, { width: 202, align: 'center' });
        pdf.text('Читатель / подпись', 345, y + 8, { width: 202, align: 'center' });
    });
}

async function createWriteoffActPdf(books = [], reason = '') {
    const doc = createDocument({ title: 'Акт списания', subject: 'Проект акта списания книг' });
    return collect(doc, pdf => {
        drawBrandHeader(pdf, 'Проект акта списания', `Сформирован ${formatDate(new Date(), true)}. Документ не удаляет книги из каталога.`);
        drawKeyValue(pdf, 'Основание', text(reason, 'Причина не указана'));
        drawKeyValue(pdf, 'Количество позиций', `${books.length}; экземпляров: ${books.reduce((sum, book) => sum + Number(book.copies || 0), 0)}`);
        drawTable(pdf, [
            { label: '№', width: 30, value: row => String(books.indexOf(row) + 1) },
            { label: 'Название', width: 188, key: 'title' },
            { label: 'Автор', width: 128, key: 'author' },
            { label: 'QR / ISBN', width: 94, value: row => row.qr_code || row.qrCode || row.isbn },
            { label: 'Экз.', width: 42, value: row => String(row.copies || 0) }
        ], books, { emptyText: 'Книги не выбраны' });
        ensureRoom(pdf, 110);
        pdf.font('Bibliotech').fontSize(9.5).fillColor(colors.ink).text(
            'Решение комиссии: ____________________________________________________________________________________',
            { lineGap: 10 }
        );
        pdf.moveDown(2.5);
        ['Председатель комиссии', 'Член комиссии', 'Материально ответственное лицо'].forEach(label => {
            pdf.moveTo(48, pdf.y + 10).lineTo(320, pdf.y + 10).strokeColor(colors.border).stroke();
            pdf.font('Bibliotech').fontSize(8).fillColor(colors.muted).text(`${label} / подпись`, 330, pdf.y + 4);
            pdf.moveDown(1.5);
        });
    });
}

async function createInventoryReportPdf(session = {}) {
    const report = session.report || {};
    const summary = report.summary || {};
    const doc = createDocument({ title: `Инвентаризация #${session.id || ''}`, subject: 'Отчёт инвентаризации фонда' });
    return collect(doc, pdf => {
        drawBrandHeader(pdf, `Инвентаризация #${session.id || '-'}`, `${text(session.name)} / ${session.status === 'completed' ? 'завершена' : 'в работе'}`);
        drawKeyValue(pdf, 'Зона проверки', session.location ? locationLabel({ location: session.location }) : 'Весь фонд');
        drawKeyValue(pdf, 'Период', `${formatDate(session.started_at, true)} - ${session.completed_at ? formatDate(session.completed_at, true) : 'не завершена'}`);
        drawSummaryCards(pdf, [
            { label: 'Ожидалось позиций', value: summary.expectedTitles },
            { label: 'Найдено', value: summary.foundTitles },
            { label: 'Не найдено', value: summary.missingTitles, tone: 'danger' },
            { label: 'Не на месте', value: summary.misplacedTitles, tone: 'danger' }
        ]);
        pdf.font('BibliotechBold').fontSize(13).fillColor(colors.ink).text('Не найдено');
        pdf.moveDown(0.5);
        drawTable(pdf, [
            { label: 'Название', width: 210, key: 'title' },
            { label: 'Автор', width: 130, key: 'author' },
            { label: 'QR', width: 82, value: row => row.qr_code || row.qrCode },
            { label: 'Место', width: 100, value: locationLabel }
        ], report.missing || [], { emptyText: 'Все ожидаемые позиции найдены' });
        ensureRoom(pdf, 90);
        pdf.font('BibliotechBold').fontSize(13).fillColor(colors.ink).text('Обнаружено не на месте');
        pdf.moveDown(0.5);
        drawTable(pdf, [
            { label: 'Название', width: 210, key: 'title' },
            { label: 'Автор', width: 130, key: 'author' },
            { label: 'QR', width: 82, value: row => row.qr_code || row.qrCode },
            { label: 'Фактическое место', width: 100, value: locationLabel }
        ], report.misplaced || [], { emptyText: 'Ошибок размещения не обнаружено' });
        ensureRoom(pdf, 90);
        pdf.font('BibliotechBold').fontSize(13).fillColor(colors.ink).text('Технические показатели');
        pdf.moveDown(0.4);
        pdf.font('Bibliotech').fontSize(9.5).fillColor(colors.muted).text(
            `Всего сканирований: ${summary.totalScans || 0}; повторов: ${summary.duplicateScans || 0}; неизвестных кодов: ${summary.unknownScans || 0}; ожидаемых экземпляров: ${summary.expectedCopies || 0}; найденных экземпляров: ${summary.foundCopies || 0}.`,
            { lineGap: 4 }
        );
    });
}

module.exports = {
    createLabelsPdf,
    createRentalActPdf,
    createWriteoffActPdf,
    createInventoryReportPdf
};
