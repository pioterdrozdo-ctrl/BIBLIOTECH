'use strict';

const assert = require('node:assert/strict');

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

(async () => {
    const login = await request('/api/auth/login', {
        method: 'POST',
        body: { username: 'admin', password: 'GreenScreen' }
    });
    assert.equal(login.response.status, 200, `Login failed: ${JSON.stringify(login.payload)}`);
    const token = login.payload.token;
    const stamp = Date.now();
    const isbn = makeIsbn13(stamp);
    const title = `ISBN API ${stamp}`;

    const unauthorized = await request('/api/book-metadata/isbn/9780140328721');
    assert.equal(unauthorized.response.status, 401, 'ISBN lookup is available without authentication');

    const invalidLookup = await request('/api/book-metadata/isbn/9780140328720', { token });
    assert.equal(invalidLookup.response.status, 400, 'Invalid ISBN was sent to the metadata provider');
    assert.equal(invalidLookup.payload.code, 'INVALID_ISBN');

    const created = await request('/api/book-metadata/books', {
        token,
        method: 'POST',
        body: {
            title,
            author: 'Metadata Author',
            description: 'Книга для проверки библиографических полей.',
            copies: 2,
            available: true,
            isbn,
            publicationYear: 2024,
            publisher: 'BIBLIOTECH Press',
            genre: 'Техническая литература',
            language: 'Русский',
            metadataSource: 'manual'
        }
    });
    assert.equal(created.response.status, 201, `Metadata create failed: ${JSON.stringify(created.payload)}`);
    assert.ok(created.payload.id, 'Created book id is missing');
    assert.equal(created.payload.isbn, isbn);
    assert.equal(Number(created.payload.publicationYear ?? created.payload.publication_year), 2024);
    assert.equal(created.payload.publisher, 'BIBLIOTECH Press');
    assert.equal(created.payload.genre, 'Техническая литература');
    assert.equal(created.payload.language, 'Русский');

    const catalogSearch = await request(`/api/books?search=${encodeURIComponent(isbn)}`, { token });
    assert.equal(catalogSearch.response.status, 200);
    const found = catalogSearch.payload.find(book => Number(book.id) === Number(created.payload.id));
    assert.ok(found, 'Catalog search cannot find a book by ISBN');
    assert.equal(found.publisher, 'BIBLIOTECH Press');

    const updated = await request(`/api/book-metadata/books/${created.payload.id}`, {
        token,
        method: 'PUT',
        body: {
            title,
            author: 'Metadata Author',
            description: 'Обновлённое описание.',
            copies: 3,
            available: true,
            isbn,
            publicationYear: 2025,
            publisher: 'Updated Press',
            genre: 'Учебная литература',
            language: 'Русский'
        }
    });
    assert.equal(updated.response.status, 200, `Metadata update failed: ${JSON.stringify(updated.payload)}`);
    assert.equal(Number(updated.payload.publicationYear ?? updated.payload.publication_year), 2025);
    assert.equal(updated.payload.publisher, 'Updated Press');

    const oldCopiesUpdate = await request(`/api/books/${created.payload.id}`, {
        token,
        method: 'PUT',
        body: { copies: 4, available: true }
    });
    assert.equal(oldCopiesUpdate.response.status, 200, 'Existing copy update endpoint broke');
    const detail = await request(`/api/books/${created.payload.id}`, { token });
    assert.equal(detail.response.status, 200);
    assert.equal(detail.payload.isbn, isbn, 'Old copy update erased ISBN');
    assert.equal(detail.payload.publisher, 'Updated Press', 'Old copy update erased publisher');
    assert.equal(Number(detail.payload.copies), 4);

    const duplicate = await request('/api/book-metadata/books', {
        token,
        method: 'POST',
        body: {
            title: `Duplicate ${stamp}`,
            author: 'Another Author',
            copies: 1,
            available: true,
            isbn
        }
    });
    assert.equal(duplicate.response.status, 409, 'Duplicate ISBN was accepted');
    assert.equal(duplicate.payload.code, 'DUPLICATE_ISBN');

    const invalidYear = await request(`/api/book-metadata/books/${created.payload.id}`, {
        token,
        method: 'PUT',
        body: { publicationYear: 'year' }
    });
    assert.equal(invalidYear.response.status, 400, 'Invalid publication year was accepted');

    const cleanup = await request(`/api/books/${created.payload.id}`, { token, method: 'DELETE' });
    assert.ok([200, 204].includes(cleanup.response.status), `Cleanup failed: ${cleanup.response.status}`);

    console.log('ISBN metadata API smoke OK: auth, validation, create, edit, search, duplicate protection and legacy copy updates work.');
})().catch(error => {
    console.error(error.stack || error);
    process.exit(1);
});
