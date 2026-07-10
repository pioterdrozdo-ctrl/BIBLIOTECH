'use strict';

const assert = require('node:assert/strict');
const { chromium } = require('playwright');

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
    assert.equal(result.response.status, 200, `Login failed: ${JSON.stringify(result.payload)}`);
    return result.payload;
}

async function register(username, email, password) {
    const result = await request('/api/auth/register', { method: 'POST', body: { username, email, password } });
    assert.equal(result.response.status, 200, `Registration failed: ${JSON.stringify(result.payload)}`);
    return result.payload;
}

async function seedPage(page, auth) {
    await page.addInitScript(({ auth }) => {
        localStorage.setItem('token', auth.token);
        localStorage.setItem('bibliotech_current_user', JSON.stringify(auth.user));
        localStorage.setItem(`bibliotech_product_welcome_v1_${String(auth.user.username).toLowerCase()}`, '1');
    }, { auth });
}

async function closeModal(page, selector) {
    await page.evaluate(target => {
        const modal = document.querySelector(target);
        modal?.classList.remove('active');
        if (modal) modal.hidden = false;
        document.body.classList.remove('modal-open');
    }, selector);
    await page.waitForFunction(target => !document.querySelector(target)?.classList.contains('active'), selector);
}

(async () => {
    const stamp = Date.now();
    const password = 'Queue1234';
    const admin = await login('admin', 'GreenScreen');
    const reader = await register(`queue_ui_${stamp}`, `queue_ui_${stamp}@example.com`, password);
    const created = await request('/api/books', {
        token: admin.token,
        method: 'POST',
        body: {
            title: `Queue UI ${stamp}`,
            author: 'Browser Test',
            description: 'Book without free copies',
            copies: 0,
            available: false
        }
    });
    assert.equal(created.response.status, 201, `Book create failed: ${JSON.stringify(created.payload)}`);
    const bookId = created.payload.id;

    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.stack || error.message));
        await seedPage(page, reader);
        await page.goto(`${baseUrl}/home.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => Boolean(window.BibliotechReservationQueue));
        await page.waitForSelector(`.book-card[data-id="${bookId}"]`);

        const card = page.locator(`.book-card[data-id="${bookId}"]`);
        const cardButton = card.locator('.card-rent-safe-btn');
        await cardButton.waitFor({ state: 'visible' });
        assert.equal((await cardButton.textContent()).trim(), 'Забронировать');
        assert.equal(await cardButton.isEnabled(), true, 'Unavailable book reservation button is disabled');

        await cardButton.click();
        await page.waitForSelector('#viewModal.active');
        await page.waitForFunction(() => document.getElementById('rentBookBtn')?.textContent.trim() === 'Отменить бронь');
        assert.match(await page.locator('#viewRentalStatus').textContent(), /место 1/i);
        assert.match(await page.locator('#viewRentalNote').textContent(), /получите уведомление/i);
        assert.equal(await page.locator('#rentBookBtn').isEnabled(), true);

        await page.waitForFunction(id => {
            const cardElement = document.querySelector(`.book-card[data-id="${id}"]`);
            return cardElement?.dataset.reservationStatus === 'waiting' && cardElement?.dataset.queuePosition === '1';
        }, String(bookId));
        assert.match(await card.locator('.reservation-queue-badge').textContent(), /место 1/i);
        assert.match(await card.locator('.card-rent-safe-btn').textContent(), /Отменить бронь/);

        const state = await request(`/api/books/${bookId}/reservation`, { token: reader.token });
        assert.equal(state.response.status, 200);
        assert.equal(state.payload.reservation.status, 'waiting');
        assert.equal(Number(state.payload.reservation.queuePosition), 1);

        await closeModal(page, '#viewModal');
        await page.locator('#currentUserPill').click();
        await page.waitForSelector('#profileModal.active');
        await page.waitForSelector('#profileReservationsPanel');
        await page.waitForFunction(id => Boolean(document.querySelector(`[data-cancel-reservation-id="${id}"]`)), String(bookId));
        assert.equal(await page.locator('#profileReservationsCounter').textContent(), '1');
        assert.match(await page.locator('#profileReservationsList').textContent(), /Место 1/i);

        const cancellationResponse = page.waitForResponse(response => {
            const url = new URL(response.url());
            return response.request().method() === 'DELETE'
                && url.pathname === `/api/books/${bookId}/reserve`;
        });
        await page.locator(`[data-cancel-reservation-id="${bookId}"]`).click();
        const cancelled = await cancellationResponse;
        assert.equal(cancelled.status(), 200, 'Reservation cancellation request failed');
        await page.evaluate(() => window.BibliotechProfileReservations?.loadReservations());
        await page.waitForFunction(() => document.getElementById('profileReservationsCounter')?.textContent === '0');
        assert.match(await page.locator('#profileReservationsList').textContent(), /Активных бронирований нет/i);

        const afterCancel = await request(`/api/books/${bookId}/reservation`, { token: reader.token });
        assert.equal(afterCancel.response.status, 200);
        assert.equal(afterCancel.payload.reservation, null);

        await page.evaluate(id => window.BibliotechReservationQueue?.refreshBookReservation(Number(id)), String(bookId));
        await closeModal(page, '#profileModal');
        await page.waitForFunction(id => {
            const cardElement = document.querySelector(`.book-card[data-id="${id}"]`);
            return cardElement?.dataset.reservationStatus === '';
        }, String(bookId));
        assert.equal((await card.locator('.card-rent-safe-btn').textContent()).trim(), 'Забронировать');
        assert.deepEqual(pageErrors, [], `Browser errors:\n${pageErrors.join('\n')}`);
        await page.close();

        const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
        await seedPage(mobile, reader);
        await mobile.goto(`${baseUrl}/home.html`, { waitUntil: 'domcontentloaded' });
        await mobile.waitForFunction(() => Boolean(window.BibliotechReservationQueue));
        await mobile.waitForSelector(`.book-card[data-id="${bookId}"]`);
        const mobileCard = mobile.locator(`.book-card[data-id="${bookId}"]`);
        const mobileButton = mobileCard.locator('.card-rent-safe-btn');
        assert.equal(await mobileButton.isVisible(), true, 'Mobile reservation button is not visible');
        assert.equal((await mobileButton.textContent()).trim(), 'Забронировать');
        const box = await mobileButton.boundingBox();
        assert.ok(box && box.width >= 260, `Mobile reservation action is too narrow: ${box?.width}`);
        const overflow = await mobileCard.evaluate(element => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
        assert.ok(overflow.scrollWidth <= overflow.clientWidth + 1, `Mobile card overflows: ${JSON.stringify(overflow)}`);
        await mobile.close();
    } finally {
        await browser.close();
        const cleanup = await request(`/api/books/${bookId}`, { token: admin.token, method: 'DELETE' });
        assert.ok([200, 204].includes(cleanup.response.status), `Cleanup failed: ${cleanup.response.status}`);
    }

    console.log('Reservation queue UI smoke OK: reserve button, queue position, cancel action, profile panel and mobile layout work.');
})().catch(error => {
    console.error(error.stack || error);
    process.exit(1);
});
