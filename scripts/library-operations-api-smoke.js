'use strict';

const assert = require('node:assert/strict');

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4173';

async function json(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, options);
    const data = await response.json().catch(() => ({}));
    return { response, data };
}

async function pdf(path, token, body = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, 200, `${path} returned ${response.status}: ${bytes.toString('utf8', 0, 200)}`);
    assert.match(response.headers.get('content-type') || '', /application\/pdf/);
    assert.equal(bytes.subarray(0, 4).toString('ascii'), '%PDF');
    assert.ok(bytes.length > 3000, `${path} returned an unexpectedly small PDF`);
    return bytes;
}

(async () => {
    const login = await json('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'GreenScreen' })
    });
    assert.equal(login.response.status, 200, 'admin login failed');
    const token = login.data.token;
    assert.ok(token, 'admin token missing');
    const auth = { Authorization: `Bearer ${token}` };

    const before = await json('/api/books', { headers: auth });
    assert.equal(before.response.status, 200);
    assert.ok(Array.isArray(before.data) && before.data.length > 0, 'catalog is empty');
    const qrBefore = new Map(before.data.map(book => [Number(book.id), book.qr_code || book.qrCode || null]));
    const target = before.data.find(book => book.qr_code || book.qrCode);
    assert.ok(target, 'no book with an existing QR code');

    const created = await json('/api/inventory', {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Smoke inventory ${Date.now()}` })
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.data));
    const sessionId = created.data.session.id;

    const scanned = await json(`/api/inventory/${sessionId}/scan`, {
        method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: target.qr_code || target.qrCode })
    });
    assert.equal(scanned.response.status, 201, JSON.stringify(scanned.data));
    assert.equal(scanned.data.event.result, 'found');

    const duplicate = await json(`/api/inventory/${sessionId}/scan`, {
        method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: target.qr_code || target.qrCode })
    });
    assert.equal(duplicate.response.status, 201);
    assert.equal(duplicate.data.event.result, 'duplicate');

    const unknown = await json(`/api/inventory/${sessionId}/scan`, {
        method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: `UNKNOWN-${Date.now()}` })
    });
    assert.equal(unknown.response.status, 404);
    assert.equal(unknown.data.event.result, 'unknown');

    const details = await json(`/api/inventory/${sessionId}`, { headers: auth });
    assert.equal(details.response.status, 200);
    assert.equal(details.data.session.report.summary.foundTitles, 1);
    assert.equal(details.data.session.report.summary.duplicateScans, 1);
    assert.equal(details.data.session.report.summary.unknownScans, 1);

    await pdf('/api/documents/labels', token, { codes: target.qr_code || target.qrCode });
    await pdf('/api/documents/writeoff', token, { codes: target.qr_code || target.qrCode, reason: 'Тестовый проект акта' });
    await pdf(`/api/documents/inventory/${sessionId}/report`, token);

    const completed = await json(`/api/inventory/${sessionId}/complete`, {
        method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: '{}'
    });
    assert.equal(completed.response.status, 200);
    assert.equal(completed.data.session.status, 'completed');

    const passkeys = await json('/api/auth/passkeys', { headers: auth });
    assert.equal(passkeys.response.status, 200);
    assert.ok(Array.isArray(passkeys.data.passkeys));
    const registerOptions = await json('/api/auth/passkeys/register/options', {
        method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: '{}'
    });
    assert.equal(registerOptions.response.status, 200, JSON.stringify(registerOptions.data));
    assert.ok(registerOptions.data.flowId && registerOptions.data.options?.challenge);
    assert.equal(registerOptions.data.options.authenticatorSelection?.userVerification, 'required');
    const authOptions = await json('/api/auth/passkeys/authenticate/options', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
    });
    assert.equal(authOptions.response.status, 200);
    assert.ok(authOptions.data.options?.challenge);

    const after = await json('/api/books', { headers: auth });
    assert.equal(after.response.status, 200);
    for (const book of after.data) {
        if (!qrBefore.has(Number(book.id))) continue;
        assert.equal(book.qr_code || book.qrCode || null, qrBefore.get(Number(book.id)), `QR changed for book ${book.id}`);
    }

    console.log('Library operations API smoke OK: inventory, PDFs and passkey options work; existing QR codes are unchanged.');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
