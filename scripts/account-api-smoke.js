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

    const books = await must('/api/books', { token });
    assert.ok(Array.isArray(books) && books.length > 0, 'catalog is empty in account smoke test');
    const bookId = books[0].id;

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

    const beforePasswordToken = token;
    const changed = await must('/api/account/password', {
        token,
        method: 'POST',
        body: { currentPassword: 'GreenScreen', newPassword: 'GreenScreen2' }
    });
    assert.ok(changed.token, 'password change did not return a replacement token');
    token = changed.token;
    const rejectedBeforePassword = await request('/api/account', { token: beforePasswordToken });
    assert.equal(rejectedBeforePassword.response.status, 403, 'old token remained valid after password change');
    await must('/api/account', { token });

    const relogin = await must('/api/auth/login', {
        method: 'POST',
        body: { username: 'admin', password: 'GreenScreen2' }
    });
    assert.ok(relogin.token, 'login with the changed password failed');

    const deleteSoleAdmin = await request('/api/account', {
        token: relogin.token,
        method: 'DELETE',
        body: { password: 'GreenScreen2' }
    });
    assert.equal(deleteSoleAdmin.response.status, 409, 'sole administrator deletion was not blocked');

    console.log('Account API smoke OK: sessions, password, devices, notifications, privacy, library, export and delete guard validated.');
})().catch(error => {
    console.error(error.stack || error);
    process.exit(1);
});
