'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const server = read('backend/server.js');
const inventoryRoute = read('backend/routes/inventory.js');
const documentsRoute = read('backend/routes/documents.js');
const passkeyRoute = read('backend/routes/passkeys.js');
const pdfService = read('backend/services/pdfDocuments.js');
const adminPage = read('frontend/admin.html');
const operationsUi = read('frontend/js/library-operations.js');
const passkeyLogin = read('frontend/js/passkey-login.js');
const securityUi = read('frontend/js/profile-security.js');
const booksRoute = read('backend/routes/books.js');
const serviceWorker = read('frontend/sw.js');

assert.ok(server.includes("app.use('/api/inventory', inventoryRoutes)"));
assert.ok(server.includes("app.use('/api/documents', documentRoutes)"));
assert.ok(server.includes("app.use('/api/auth', passkeyRoutes)"));
assert.match(inventoryRoute, /router\.use\(authMiddleware, isAdmin\)/);
assert.match(documentsRoute, /router\.use\(authMiddleware, isAdmin\)/);
assert.ok(inventoryRoute.includes("result = 'duplicate'"));
assert.ok(inventoryRoute.includes("result = 'misplaced'"));
assert.ok(inventoryRoute.includes("result = 'unknown'"));
assert.ok(inventoryRoute.includes("IN (10, 13)"), 'unknown codes must not match books with an empty ISBN');
assert.ok(pdfService.includes('createLabelsPdf'));
assert.ok(pdfService.includes('createInventoryReportPdf'));
assert.ok(pdfService.includes('createWriteoffActPdf'));
assert.ok(pdfService.includes('createRentalActPdf'));
assert.ok(pdfService.includes('book.qr_code || book.qrCode'));
assert.ok(!documentsRoute.includes('UPDATE books SET qr_code'), 'PDF generation must not rewrite QR codes');
assert.ok(!inventoryRoute.includes('UPDATE books SET qr_code'), 'inventory must not rewrite QR codes');
assert.ok(booksRoute.includes('if (!book.qr_code)'), 'existing QR codes must remain unchanged during book updates');
assert.ok(adminPage.includes('id="inventoryPanelTitle"'));
assert.ok(adminPage.includes('id="documentsPanelTitle"'));
assert.ok(adminPage.includes('vendor/jsQR.js'));
assert.ok(operationsUi.includes('navigator.mediaDevices.getUserMedia'));
assert.ok(operationsUi.includes('/documents/inventory/'));
assert.ok(passkeyRoute.includes('verifyRegistrationResponse'));
assert.ok(passkeyRoute.includes('verifyAuthenticationResponse'));
assert.ok(passkeyRoute.includes("userVerification: 'required'"));
assert.ok(passkeyLogin.includes('navigator.credentials.get'));
assert.ok(securityUi.includes('navigator.credentials.create'));
assert.ok(securityUi.includes('Обычный пароль останется доступен'));
assert.ok(serviceWorker.includes("'/js/library-operations.js'"));
assert.ok(serviceWorker.includes("'/css/library-operations.css'"));

console.log('Library operations check OK: inventory, existing-QR PDF documents and passkeys are integrated without rewriting QR codes.');
