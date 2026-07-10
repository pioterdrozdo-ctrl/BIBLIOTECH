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

async function login(username, password) {
    const result = await request('/api/auth/login', { method: 'POST', body: { username, password } });
    assert.equal(result.response.status, 200, `Login failed for ${username}: ${JSON.stringify(result.payload)}`);
    return result.payload;
}

async function register(username, email, password) {
    const result = await request('/api/auth/register', { method: 'POST', body: { username, email, password } });
    assert.equal(result.response.status, 200, `Registration failed for ${username}: ${JSON.stringify(result.payload)}`);
    return result.payload;
}

(async () => {
    const stamp = Date.now();
    const password = 'Queue1234';
    const admin = await login('admin', 'GreenScreen');
    const firstReader = await register(`queue_first_${stamp}`, `queue_first_${stamp}@example.com`, password);
    const secondReader = await register(`queue_second_${stamp}`, `queue_second_${stamp}@example.com`, password);
    const thirdReader = await register(`queue_third_${stamp}`, `queue_third_${stamp}@example.com`, password);

    const created = await request('/api/books', {
        token: admin.token,
        method: 'POST',
        body: {
            title: `Queue Book ${stamp}`,
            author: 'BIBLIOTECH Test',
            description: 'Reservation queue smoke test',
            copies: 1,
            available: true
        }
    });
    assert.equal(created.response.status, 201, `Book create failed: ${JSON.stringify(created.payload)}`);
    const bookId = created.payload.id;
    assert.ok(bookId, 'Book id is missing');

    const firstRent = await request(`/api/books/${bookId}/rent`, {
        token: firstReader.token,
        method: 'POST',
        body: {}
    });
    assert.equal(firstRent.response.status, 201, `First rental failed: ${JSON.stringify(firstRent.payload)}`);
    assert.equal(Number(firstRent.payload.book.copies), 0);
    assert.equal(firstRent.payload.book.rentedByMe, true);

    const secondReserve = await request(`/api/books/${bookId}/reserve`, {
        token: secondReader.token,
        method: 'POST',
        body: {}
    });
    assert.equal(secondReserve.response.status, 201, `First reservation failed: ${JSON.stringify(secondReserve.payload)}`);
    assert.equal(secondReserve.payload.reservation.status, 'waiting');
    assert.equal(Number(secondReserve.payload.reservation.queuePosition), 1);

    const duplicateReserve = await request(`/api/books/${bookId}/reserve`, {
        token: secondReader.token,
        method: 'POST',
        body: {}
    });
    assert.equal(duplicateReserve.response.status, 409, 'Duplicate active reservation was accepted');
    assert.equal(duplicateReserve.payload.code, 'ALREADY_RESERVED');

    const thirdReserve = await request(`/api/books/${bookId}/reserve`, {
        token: thirdReader.token,
        method: 'POST',
        body: {}
    });
    assert.equal(thirdReserve.response.status, 201, `Second reservation failed: ${JSON.stringify(thirdReserve.payload)}`);
    assert.equal(Number(thirdReserve.payload.reservation.queuePosition), 2);

    const secondProfileBefore = await request('/api/rentals/me', { token: secondReader.token });
    assert.equal(secondProfileBefore.response.status, 200);
    assert.equal(secondProfileBefore.payload.reservations.length, 1);
    assert.equal(secondProfileBefore.payload.reservations[0].status, 'waiting');
    assert.equal(Number(secondProfileBefore.payload.reservations[0].queuePosition), 1);

    const firstReturn = await request(`/api/books/${bookId}/return`, {
        token: firstReader.token,
        method: 'POST',
        body: { rentalId: firstRent.payload.rental.id }
    });
    assert.equal(firstReturn.response.status, 200, `Return failed: ${JSON.stringify(firstReturn.payload)}`);
    assert.equal(firstReturn.payload.promoted.length, 1, 'First reader in queue was not promoted');
    assert.equal(Number(firstReturn.payload.promoted[0].userId), Number(secondReader.user.id));

    const secondState = await request(`/api/books/${bookId}/reservation`, { token: secondReader.token });
    assert.equal(secondState.response.status, 200);
    assert.equal(secondState.payload.reservation.status, 'ready');
    assert.ok(secondState.payload.reservation.expiresAt, 'Ready reservation has no expiry');
    const holdHours = (new Date(secondState.payload.reservation.expiresAt) - new Date(secondState.payload.reservation.readyAt)) / 3600000;
    assert.ok(holdHours > 47.9 && holdHours < 48.1, `Unexpected hold duration: ${holdHours}`);

    const thirdCannotSkip = await request(`/api/books/${bookId}/rent`, {
        token: thirdReader.token,
        method: 'POST',
        body: {}
    });
    assert.equal(thirdCannotSkip.response.status, 409, 'A later reader bypassed the ready reservation');
    assert.ok(['WAITING_IN_QUEUE', 'RESERVED_FOR_QUEUE', 'NO_COPIES'].includes(thirdCannotSkip.payload.code));

    const secondNotifications = await request('/api/account/notifications', { token: secondReader.token });
    assert.equal(secondNotifications.response.status, 200);
    const readyNotification = secondNotifications.payload.notifications.find(item =>
        item.type === 'reservation_ready' && Number(item.book_id) === Number(bookId)
    );
    assert.ok(readyNotification, 'The first reader in queue did not receive an availability notification');

    const secondRent = await request(`/api/books/${bookId}/rent`, {
        token: secondReader.token,
        method: 'POST',
        body: {}
    });
    assert.equal(secondRent.response.status, 201, `Ready reservation could not be collected: ${JSON.stringify(secondRent.payload)}`);
    assert.equal(secondRent.payload.book.rentedByMe, true);
    assert.equal(secondRent.payload.book.myReservationStatus, null);

    const secondProfileAfter = await request('/api/rentals/me', { token: secondReader.token });
    assert.equal(secondProfileAfter.response.status, 200);
    assert.equal(secondProfileAfter.payload.reservations.length, 0, 'Fulfilled reservation remained active');

    const secondReturn = await request(`/api/books/${bookId}/return`, {
        token: secondReader.token,
        method: 'POST',
        body: { rentalId: secondRent.payload.rental.id }
    });
    assert.equal(secondReturn.response.status, 200);
    assert.equal(secondReturn.payload.promoted.length, 1, 'Second reader in queue was not promoted');
    assert.equal(Number(secondReturn.payload.promoted[0].userId), Number(thirdReader.user.id));

    const thirdState = await request(`/api/books/${bookId}/reservation`, { token: thirdReader.token });
    assert.equal(thirdState.response.status, 200);
    assert.equal(thirdState.payload.reservation.status, 'ready');

    const thirdNotifications = await request('/api/account/notifications', { token: thirdReader.token });
    assert.equal(thirdNotifications.response.status, 200);
    assert.ok(thirdNotifications.payload.notifications.some(item =>
        item.type === 'reservation_ready' && Number(item.book_id) === Number(bookId)
    ), 'Second reader in queue did not receive an availability notification');

    const cancelReady = await request(`/api/books/${bookId}/reserve`, {
        token: thirdReader.token,
        method: 'DELETE'
    });
    assert.equal(cancelReady.response.status, 200, `Ready reservation cancel failed: ${JSON.stringify(cancelReady.payload)}`);
    assert.equal(cancelReady.payload.book.myReservationStatus, null);
    assert.equal(cancelReady.payload.book.available, true, 'Cancelled ready hold did not release the copy');

    const catalog = await request(`/api/books?search=${encodeURIComponent(`Queue Book ${stamp}`)}`, { token: thirdReader.token });
    assert.equal(catalog.response.status, 200);
    const catalogBook = catalog.payload.find(book => Number(book.id) === Number(bookId));
    assert.ok(catalogBook, 'Queue book disappeared from catalog');
    assert.equal(Number(catalogBook.reservationCount), 0);
    assert.equal(catalogBook.available, true);

    const cleanup = await request(`/api/books/${bookId}`, { token: admin.token, method: 'DELETE' });
    assert.ok([200, 204].includes(cleanup.response.status), `Cleanup failed: ${cleanup.response.status}`);

    console.log('Reservation queue API smoke OK: FIFO positions, duplicate protection, return promotion, 48-hour hold, notifications, no queue bypass, fulfillment and cancellation work.');
})().catch(error => {
    console.error(error.stack || error);
    process.exit(1);
});
