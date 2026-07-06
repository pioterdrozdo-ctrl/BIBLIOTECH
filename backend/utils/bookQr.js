function buildBookQrCode(bookId) {
    return `BT${String(bookId).padStart(6, '0')}`;
}

function buildBookQrPayload(bookId) {
    return `bibliotech://book/${bookId}`;
}

function normalizeBookQrFields(book = {}) {
    const id = Number(book.id);
    const qrCode = book.qr_code || book.qrCode || (Number.isFinite(id) && id > 0 ? buildBookQrCode(id) : null);
    const qrPayload = book.qr_payload || book.qrPayload || (Number.isFinite(id) && id > 0 ? buildBookQrPayload(id) : null);

    return {
        qr_code: qrCode,
        qrCode,
        qr_payload: qrPayload,
        qrPayload
    };
}

module.exports = {
    buildBookQrCode,
    buildBookQrPayload,
    normalizeBookQrFields
};
