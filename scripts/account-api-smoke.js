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

async function must(path, options = {}, expected = 200) {
    const result = await request(path, options);
    assert.equal(result.response.status, expected, `${options.method || 'GET'} ${path}: expected ${expected}, got ${result.response.status}: ${JSON.stringify(result.payload)}`);
    return result.payload;
}

async function ensureCatalogBook(token) {
    const books = await must('/api/books', { token });
    if (Array.isArray(books) && books.length > 0) return books[0];

    const created = await must('/api/books', {
        token,
        method: 'POST',
        body: {
            title: `Проверка API ${Date.now()}`,
            author: 'BIBLIOTECH Test',
            description: 'Временная книга для проверки API личной библиотеки.',
            copies: 1,
            available: true
        }
    }, 201);
    assert.ok(created.id, 'catalog seed did not return a book id');
    return created;
}

async function verifyPasswordAndResetFlow() {
    const stamp = Date.now();
    const username = `account_smoke_${stamp}`;
    const email = `account_smoke_${stamp}@example.test`;
    const firstPassword = 'SmokePass1';
    const secondPassword = 'SmokePass2';
    const resetPassword = 'SmokePass3';

    const registered = await must('/api/auth/register', {
        method: 'POST',
        body: { username, email, password: firstPassword }
    });
    assert.ok(registered.token, 'temporary account registration did not return a token');
    assert.equal(registered.user.role, 'user');

    const firstToken = registered.token;
    const changed = await must('/api/account/password', {
        token: firstToken,
        method: 'POST',
        body: { currentPassword: firstPassword, newPassword: secondPassword }
    });
    assert.ok(changed.token, 'password change did not return a replacement token');

    const rejectedFirstToken = await request('/api/account', { token: firstToken });
    assert.equal(rejectedFirstToken.response.status, 403, 'old user token remained valid after password change');
    await must('/api/account', { token: changed.token });

    const relogin = await must('/api/auth/login', {
        method: 'POST',
        body: { username, password: secondPassword }
    });
    assert.ok(relogin.token, 'login with the changed password failed');

    const resetRequest = await request('/api/auth/password-reset/request', {
        method: 'POST',
        body: { email }
    });

    let activePassword = secondPassword;
    let activeToken = relogin.token;

    if (resetRequest.response.status === 200 && resetRequest.payload.devCode) {
        await must('/api/auth/password-reset/confirm', {
            method: 'POST',
            body: { email, code: resetRequest.payload.devCode, password: resetPassword }
        });
        activePassword = resetPassword;
        const afterReset = await must('/api/auth/login', {
            method: 'POST',
            body: { username, password: resetPassword }
        });
        activeToken = afterReset.token;
        assert.ok(activeToken, 'login after password reset failed');
    } else if (resetRequest.response.status === 503) {
        assert.equal(
            resetRequest.payload.reason,
            'LOCAL_FALLBACK_NO_EMAIL',
            `unexpected password reset refusal: ${JSON.stringify(resetRequest.payload)}`
        );
        assert.equal(resetRequest.payload.emailSent, false, 'failed reset request incorrectly reports a sent email');
    } else {
        assert.equal(resetRequest.response.status, 200, `unexpected password reset status: ${resetRequest.response.status}`);
        assert.equal(resetRequest.payload.emailSent, true, 'successful reset request neither sent email nor returned a development code');
    }

    const deleted = await must('/api/account', {
        token: activeToken,
        method: 'DELETE',
        body: { password: activePassword }
    });
    assert.equal(deleted.ok, true, 'temporary account was not deleted');

    const deletedLogin = await request('/api/auth/login', {
        method: 'POST',
        body: { username, password: activePassword }
    });
    assert.equal(deletedLogin.response.status, 401, 'deleted account can still log in');
}

(async () => {
    const login = await must('/api/auth/login', {
        method: 'POST',
        body: { username: 'admin', password: 'GreenScreen' }
    });
    assert.ok(login.token, 'versioned login token is missing');
    assert.equal(login.user.role, 'admin');
    let token = login.token;

    const account = await must('/api/account', { token });
    assert.equal(account.user.username, 'admin');
    assert.ok(account.notifications && account.privacy, 'account preferences are missing');

    const devices = await must('/api/account/devices', { token });
    assert.ok(Array.isArray(devices.devices), 'device history is not an array');

    const notificationPrefs = await must('/api/account/notifications/preferences', {
        token,
        method: 'POST',
        body: { due: true, overdue: true, available: true, login: true }
    });
    assert.equal(notificationPrefs.login, true, 'login notification preference was not saved');

    const privacy = await must('/api/account/privacy', {
        token,
        method: 'POST',
        body: { privateProfile: false, privateHistory: false, showComments: true }
    });
    assert.equal(privacy.privateProfile, false);

    const book = await ensureCatalogBook(token);
    const bookId = book.id;

    await must(`/api/account/library/${bookId}`, {
        token,
        method: 'PUT',
        body: { favorite: true, wishlist: true }
    });
    await must(`/api/account/library/${bookId}/viewed`, { token, method: 'POST', body: {} });
    const library = await must('/api/account/library', { token });
    const savedBook = library.items.find(item => Number(item.book_id || item.id) === Number(bookId));
    assert.ok(savedBook?.favorite, 'favorite flag was not saved');
    assert.ok(savedBook?.wishlist, 'wishlist flag was not saved');
    assert.ok(savedBook?.viewed_at, 'view history was not saved');

    const notifications = await must('/api/account/notifications', { token });
    assert.ok(Array.isArray(notifications.notifications), 'notifications are not an array');
    await must('/api/account/notifications/read-all', { token, method: 'POST', body: {} });

    const exported = await must('/api/account/export', { token });
    assert.equal(exported.user.username, 'admin');
    assert.ok(Array.isArray(exported.library), 'export does not include library data');

    const publicProfile = await must('/api/account/public/admin');
    assert.equal(publicProfile.user.username, 'admin');

    const oldToken = token;
    const logoutOthers = await must('/api/account/devices/logout-others', { token, method: 'POST', body: {} });
    assert.ok(logoutOthers.token, 'replacement token was not returned');
    token = logoutOthers.token;
    const rejectedOld = await request('/api/account', { token: oldToken });
    assert.equal(rejectedOld.response.status, 403, 'old token remained valid after logout-others');
    await must('/api/account', { token });

    const deleteSoleAdmin = await request('/api/account', {
        token,
        method: 'DELETE',
        body: { password: 'GreenScreen' }
    });
    assert.equal(deleteSoleAdmin.response.status, 409, 'sole administrator deletion was not blocked');

    await verifyPasswordAndResetFlow();

    console.log('Account API smoke OK: sessions, strong passwords, secure reset fallback, devices, notifications, privacy, library, export and delete guards validated.');
})().catch(error => {
    console.error(error.stack || error);
    process.exit(1);
});
