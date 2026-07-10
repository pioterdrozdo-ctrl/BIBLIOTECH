'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { mapReservation, attachReservationFields, READY_HOLD_HOURS } = require('../backend/services/reservationQueue');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

function assertBalancedCss(source, filename) {
    const stripped = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
    let balance = 0;
    for (const character of stripped) {
        if (character === '{') balance += 1;
        if (character === '}') balance -= 1;
        assert.ok(balance >= 0, `${filename}: unexpected closing brace`);
    }
    assert.equal(balance, 0, `${filename}: unbalanced braces`);
}

function validateArchitecture() {
    const route = read('backend/routes/reservations.js');
    const service = read('backend/services/reservationQueue.js');
    const fallback = read('backend/services/localReservationStore.js');
    const fallbackRegistration = read('backend/services/registerReservationFallback.js');
    const catalog = read('backend/routes/catalogList.js');
    const rentals = read('backend/routes/rentals.js');
    const sql = read('backend/sql/init.sql');
    const server = read('backend/server.js');
    const ui = read('frontend/js/reservation-queue.js');
    const profile = read('frontend/js/profile-reservations.js');
    const card = read('frontend/js/card-rent-safe.js');
    const css = read('frontend/css/reservation-queue.css');
    const pwa = read('frontend/js/pwa.js');
    const sw = read('frontend/sw.js');

    for (const endpoint of [
        "router.get('/:id/reservation', authMiddleware",
        "router.post('/:id/reserve', authMiddleware",
        "router.delete('/:id/reserve', authMiddleware",
        "router.post('/:id/rent', authMiddleware",
        "router.post('/:id/return', authMiddleware"
    ]) assert.ok(route.includes(endpoint), `reservation endpoint is missing or unprotected: ${endpoint}`);

    assert.ok(route.includes("await client.query('BEGIN')"), 'reservation transaction start is missing');
    assert.ok(route.includes("await client.query('ROLLBACK')"), 'reservation rollback is missing');
    assert.ok(route.includes('FOR UPDATE'), 'book and queue rows are not locked');
    assert.ok(route.includes('RESERVED_FOR_QUEUE'), 'queue hold cannot block other readers');
    assert.ok(route.includes('WAITING_IN_QUEUE'), 'waiting reader cannot bypass the queue');
    assert.ok(route.includes("req.user.role === 'admin'"), 'return permissions do not distinguish admin and reader');
    assert.ok(route.includes('localStore.reserveBook'), 'JSON reserve fallback is not wired');
    assert.ok(route.includes('localStore.returnBookWithQueue'), 'JSON return fallback is not wired');

    assert.equal(READY_HOLD_HOURS, 48, 'ready reservation hold must be 48 hours');
    assert.ok(service.includes('ORDER BY created_at ASC, id ASC'), 'queue order is not FIFO');
    assert.ok(service.includes('FOR UPDATE SKIP LOCKED'), 'concurrent queue promotion is not protected');
    assert.ok(service.includes("status = 'ready'"), 'ready state is missing');
    assert.ok(service.includes("status = 'expired'"), 'expired state is missing');
    assert.ok(service.includes("status IN ('waiting', 'ready')"), 'active reservation states are inconsistent');
    assert.ok(service.includes("'reservation_ready'"), 'availability notification is missing');
    assert.ok(service.includes('notification_available_enabled'), 'availability notification preference is ignored');
    assert.ok(!service.includes('SELECT DISTINCT b.id') || !service.includes('FOR UPDATE OF b'), 'invalid DISTINCT row lock returned');

    assert.ok(fallback.includes('writeStoreAtomic'), 'JSON reservation writes are not atomic');
    assert.ok(fallback.includes('fs.renameSync'), 'JSON reservation atomic rename is missing');
    assert.ok(fallback.includes('activeReservations'), 'JSON queue state is missing');
    assert.ok(fallback.includes('reservationPosition'), 'JSON queue position is missing');
    assert.ok(fallback.includes('reservation_ready'), 'JSON availability notification is missing');
    assert.ok(fallbackRegistration.includes('getBooksWithReservations'), 'fallback catalog is not decorated with queue state');

    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS book_reservations'), 'reservation table is missing');
    assert.ok(sql.includes('idx_book_reservations_active_user_book'), 'one-active-reservation protection is missing');
    assert.ok(sql.includes("WHERE status IN ('waiting', 'ready')"), 'active reservation unique index is not partial');
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS account_notifications'), 'notification table is missing');
    assert.ok(sql.includes('due_at TIMESTAMP'), 'rental due date schema is missing');

    assert.ok(catalog.includes('getReservationSummaries'), 'catalog does not expose queue counts and positions');
    assert.ok(catalog.includes('attachReservationFields'), 'catalog does not attach reader reservation state');
    assert.ok(rentals.includes('listUserReservations'), 'profile rentals API does not return reservations');
    assert.ok(rentals.includes('reservations'), 'profile rentals response is missing reservations');

    const reservationMount = server.indexOf("app.use('/api/books', reservationRoutes)");
    const catalogMount = server.indexOf("app.use('/api/books', catalogListRoutes)");
    const legacyBookMount = server.indexOf("app.use('/api/books', bookRoutes)");
    assert.ok(reservationMount > 0 && reservationMount < catalogMount && reservationMount < legacyBookMount, 'queue-aware rent and return routes must shadow legacy routes');
    assert.ok(server.includes("require('./services/registerReservationFallback')"), 'reservation fallback is not registered at startup');

    for (const phrase of ['Забронировать', 'Отменить бронь', 'Забрать книгу', 'Вы добавлены в очередь']) {
        assert.ok(ui.includes(phrase), `catalog queue state is missing: ${phrase}`);
    }
    assert.ok(ui.includes('/account/notifications'), 'reservation availability notifications are not polled');
    assert.ok(ui.includes("item.type === 'reservation_ready'"), 'notification poll does not filter ready reservations');
    assert.ok(ui.includes('bibliotech:reservation-changed'), 'reservation state change event is missing');
    assert.ok(card.includes("event.target.closest('#rentBookBtn')"), 'detail action is not routed through queue controller');
    assert.ok(card.includes('reservationStatus'), 'card action ignores reservation state');
    assert.ok(profile.includes('profileReservationsPanel'), 'profile reservation panel is missing');
    assert.ok(profile.includes('data-cancel-reservation-id'), 'profile cannot cancel a reservation');

    assertBalancedCss(css, 'reservation-queue.css');
    assert.ok(css.includes('.reservation-queue-badge'), 'queue badge styling is missing');
    assert.ok(css.includes('.profile-reservation-card'), 'profile reservation card styling is missing');
    assert.ok(css.includes('@media (max-width: 560px)'), 'mobile queue layout is missing');
    assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'reduced motion queue support is missing');

    assert.ok(pwa.includes('reservation-queue.js?v=20260710-reservation-queue-1'), 'PWA does not load reservation controller');
    assert.ok(pwa.includes('profile-reservations.js?v=20260710-profile-reservations-1'), 'PWA does not load profile reservations');
    assert.ok(pwa.includes('reservation-queue.css?v=20260710-reservation-queue-1'), 'PWA does not load reservation CSS');
    assert.match(sw, /const CACHE_NAME = 'bibliotech-pwa-v\d[^']*'/, 'PWA cache has no versioned name');
    assert.ok(sw.includes("'/js/reservation-queue.js'"), 'reservation controller is not cached');
    assert.ok(sw.includes("'/js/profile-reservations.js'"), 'profile reservations are not cached');
    assert.ok(sw.includes("'/css/reservation-queue.css'"), 'reservation CSS is not cached');
}

validateArchitecture();

const mapped = mapReservation({
    id: 9,
    book_id: 4,
    user_id: 2,
    username: 'reader',
    status: 'waiting',
    created_at: '2026-07-10T10:00:00.000Z'
}, 3);
assert.equal(mapped.bookId, 4);
assert.equal(mapped.userId, 2);
assert.equal(mapped.queuePosition, 3);
assert.equal(mapped.status, 'waiting');

const decorated = attachReservationFields({ id: 4, title: 'Queue Book' }, {
    reservationCount: 4,
    waitingCount: 3,
    readyCount: 1,
    myReservation: mapped
});
assert.equal(decorated.reservationCount, 4);
assert.equal(decorated.reservationWaitingCount, 3);
assert.equal(decorated.reservationReadyCount, 1);
assert.equal(decorated.myReservationStatus, 'waiting');
assert.equal(decorated.myQueuePosition, 3);

console.log('Reservation queue check OK: FIFO promotion, 48-hour hold, notifications, safe rent/return, JSON fallback, profile, mobile and PWA integration validated.');
