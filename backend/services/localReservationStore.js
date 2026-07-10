'use strict';

const fs = require('fs');
const path = require('path');
const localStore = require('./localStore');

const STORE_FILE = localStore.STORE_FILE;
const READY_HOLD_HOURS = 48;

function now() {
    return new Date().toISOString();
}

function readStore() {
    const store = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    if (!store.counters) store.counters = {};
    if (!Array.isArray(store.reservations)) store.reservations = [];
    if (!Array.isArray(store.rentals)) store.rentals = [];
    if (!Array.isArray(store.account_notifications)) store.account_notifications = [];
    if (!Array.isArray(store.users)) store.users = [];
    if (!Array.isArray(store.books)) store.books = [];
    store.counters.reservations = Math.max(
        Number(store.counters.reservations || 0),
        ...store.reservations.map(item => Number(item.id || 0))
    );
    store.counters.account_notifications = Math.max(
        Number(store.counters.account_notifications || 0),
        ...store.account_notifications.map(item => Number(item.id || 0))
    );
    return store;
}

function writeStoreAtomic(store) {
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    const temporary = path.join(path.dirname(STORE_FILE), `.reservation-store-${process.pid}-${Date.now()}.json`);
    fs.writeFileSync(temporary, JSON.stringify(store, null, 2));
    fs.renameSync(temporary, STORE_FILE);
}

function nextId(store, key) {
    store.counters[key] = Number(store.counters[key] || 0) + 1;
    return store.counters[key];
}

function error(message, code) {
    const value = new Error(message);
    value.code = code;
    return value;
}

function activeReservations(store, bookId) {
    return store.reservations
        .filter(item => Number(item.book_id) === Number(bookId) && ['waiting', 'ready'].includes(item.status))
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || Number(a.id) - Number(b.id));
}

function addNotification(store, reservation, type, title, message) {
    const user = store.users.find(item => Number(item.id) === Number(reservation.user_id));
    if (type === 'reservation_ready' && user?.notification_available_enabled === false) return;
    const uniqueKey = `${type}:${reservation.id}`;
    if (store.account_notifications.some(item => Number(item.user_id) === Number(reservation.user_id) && item.unique_key === uniqueKey)) return;
    store.account_notifications.push({
        id: nextId(store, 'account_notifications'),
        user_id: Number(reservation.user_id),
        type,
        unique_key: uniqueKey,
        title,
        message,
        book_id: Number(reservation.book_id),
        read_at: null,
        created_at: now()
    });
}

function expireReady(store, bookId = null) {
    const expired = [];
    const current = Date.now();
    for (const reservation of store.reservations) {
        if (reservation.status !== 'ready') continue;
        if (bookId !== null && Number(reservation.book_id) !== Number(bookId)) continue;
        if (!reservation.expires_at || new Date(reservation.expires_at).getTime() > current) continue;
        reservation.status = 'expired';
        reservation.expired_at = now();
        expired.push(reservation);
        const book = store.books.find(item => Number(item.id) === Number(reservation.book_id));
        addNotification(
            store,
            reservation,
            'reservation_expired',
            'Срок бронирования истёк',
            `Бронь на книгу «${book?.title || 'Без названия'}» истекла. При необходимости встаньте в очередь снова.`
        );
    }
    return expired;
}

function syncAvailability(store, bookId) {
    const book = store.books.find(item => Number(item.id) === Number(bookId));
    if (!book) return null;
    const readyCount = activeReservations(store, bookId).filter(item => item.status === 'ready').length;
    book.available = Math.max(0, Number(book.copies || 0) - readyCount) > 0;
    book.updated_at = now();
    return book;
}

function promote(store, bookId) {
    const expired = expireReady(store, bookId);
    const book = store.books.find(item => Number(item.id) === Number(bookId));
    if (!book) return { promoted: [], expired };
    const active = activeReservations(store, bookId);
    const readyCount = active.filter(item => item.status === 'ready').length;
    const slots = Math.max(0, Number(book.copies || 0) - readyCount);
    const waiting = active.filter(item => item.status === 'waiting').slice(0, slots);
    const promoted = [];
    for (const reservation of waiting) {
        reservation.status = 'ready';
        reservation.ready_at = now();
        reservation.expires_at = new Date(Date.now() + READY_HOLD_HOURS * 3600000).toISOString();
        promoted.push(reservation);
        addNotification(
            store,
            reservation,
            'reservation_ready',
            'Забронированная книга доступна',
            `Книга «${book.title || 'Без названия'}» вернулась. Она закреплена за вами на ${READY_HOLD_HOURS} часов.`
        );
    }
    syncAvailability(store, bookId);
    return { promoted, expired };
}

function reservationPosition(store, reservation) {
    if (!reservation) return null;
    if (reservation.status === 'ready') return 1;
    const waiting = activeReservations(store, reservation.book_id).filter(item => item.status === 'waiting');
    const index = waiting.findIndex(item => Number(item.id) === Number(reservation.id));
    return index >= 0 ? index + 1 : null;
}

function mapReservation(store, reservation) {
    if (!reservation) return null;
    const book = store.books.find(item => Number(item.id) === Number(reservation.book_id));
    return {
        ...reservation,
        bookId: reservation.book_id,
        userId: reservation.user_id,
        queue_position: reservationPosition(store, reservation),
        queuePosition: reservationPosition(store, reservation),
        readyAt: reservation.ready_at || null,
        expiresAt: reservation.expires_at || null,
        book_title: book?.title || 'Книга удалена',
        book_author: book?.author || '',
        book_cover_data_url: book?.coverDataURL || book?.cover_data_url || null
    };
}

function decorateBook(book, store, user = null) {
    if (!book) return null;
    const active = activeReservations(store, book.id);
    const mine = user ? active.find(item => Number(item.user_id) === Number(user.id)) : null;
    const mapped = mapReservation(store, mine);
    return {
        ...book,
        reservation_count: active.length,
        reservationCount: active.length,
        reservation_waiting_count: active.filter(item => item.status === 'waiting').length,
        reservationWaitingCount: active.filter(item => item.status === 'waiting').length,
        reservation_ready_count: active.filter(item => item.status === 'ready').length,
        reservationReadyCount: active.filter(item => item.status === 'ready').length,
        my_reservation_id: mine?.id || null,
        myReservationId: mine?.id || null,
        my_reservation_status: mine?.status || null,
        myReservationStatus: mine?.status || null,
        my_queue_position: mapped?.queuePosition || null,
        myQueuePosition: mapped?.queuePosition || null,
        reservation_ready_expires_at: mine?.expires_at || null,
        reservationReadyExpiresAt: mine?.expires_at || null,
        reservation: mapped
    };
}

function reconcileStore(store, bookId = null) {
    const expired = expireReady(store, bookId);
    const ids = bookId !== null
        ? [Number(bookId)]
        : [...new Set(store.reservations.filter(item => ['waiting', 'ready'].includes(item.status)).map(item => Number(item.book_id)))];
    const promoted = [];
    ids.forEach(id => promoted.push(...promote(store, id).promoted));
    return { promoted, expired };
}

function reserveBook(bookId, user) {
    const store = readStore();
    reconcileStore(store, bookId);
    const book = store.books.find(item => Number(item.id) === Number(bookId));
    if (!book) throw error('Книга не найдена.', 'NOT_FOUND');
    const activeRental = store.rentals.find(item => Number(item.book_id) === Number(bookId) && Number(item.user_id) === Number(user.id) && !item.returned_at);
    if (activeRental) throw error('Книга уже находится у вас.', 'ALREADY_RENTED');
    const existing = activeReservations(store, bookId).find(item => Number(item.user_id) === Number(user.id));
    if (existing) throw error('Вы уже находитесь в очереди на эту книгу.', 'ALREADY_RESERVED');
    const readyCount = activeReservations(store, bookId).filter(item => item.status === 'ready').length;
    if (Number(book.copies || 0) - readyCount > 0) throw error('Книга доступна — её можно взять без бронирования.', 'BOOK_AVAILABLE');

    const reservation = {
        id: nextId(store, 'reservations'),
        book_id: Number(bookId),
        user_id: Number(user.id),
        username: user.username,
        status: 'waiting',
        created_at: now(),
        ready_at: null,
        expires_at: null,
        fulfilled_at: null,
        cancelled_at: null,
        expired_at: null
    };
    store.reservations.push(reservation);
    syncAvailability(store, bookId);
    writeStoreAtomic(store);
    const hydrated = localStore.getBook(bookId, user);
    return { reservation: mapReservation(store, reservation), book: decorateBook(hydrated, store, user) };
}

function cancelReservation(bookId, user) {
    const store = readStore();
    reconcileStore(store, bookId);
    const reservation = activeReservations(store, bookId).find(item => Number(item.user_id) === Number(user.id));
    if (!reservation) throw error('Активная бронь не найдена.', 'RESERVATION_NOT_FOUND');
    reservation.status = 'cancelled';
    reservation.cancelled_at = now();
    const result = promote(store, bookId);
    writeStoreAtomic(store);
    const hydrated = localStore.getBook(bookId, user);
    return {
        reservation: mapReservation(store, reservation),
        promoted: result.promoted.map(item => mapReservation(store, item)),
        book: decorateBook(hydrated, store, user)
    };
}

function rentBookWithQueue(bookId, user) {
    const store = readStore();
    reconcileStore(store, bookId);
    const book = store.books.find(item => Number(item.id) === Number(bookId));
    if (!book) throw error('Книга не найдена.', 'NOT_FOUND');
    const activeRental = store.rentals.find(item => Number(item.book_id) === Number(bookId) && Number(item.user_id) === Number(user.id) && !item.returned_at);
    if (activeRental) throw error('Книга уже находится у вас.', 'ALREADY_RENTED');

    const active = activeReservations(store, bookId);
    const mine = active.find(item => Number(item.user_id) === Number(user.id));
    if (mine?.status === 'waiting') throw error(`Сейчас вы ${reservationPosition(store, mine)}-й в очереди.`, 'WAITING_IN_QUEUE');
    if (active.length && mine?.status !== 'ready') throw error('Свободный экземпляр закреплён за читателем из очереди.', 'RESERVED_FOR_QUEUE');
    if (Number(book.copies || 0) <= 0) throw error('Свободных экземпляров нет.', 'NO_COPIES');

    book.copies = Math.max(0, Number(book.copies || 0) - 1);
    book.updated_at = now();
    const rental = {
        id: nextId(store, 'rentals'),
        book_id: Number(bookId),
        user_id: Number(user.id),
        username: user.username,
        rented_at: now(),
        due_at: new Date(Date.now() + 14 * 86400000).toISOString(),
        returned_at: null
    };
    store.rentals.push(rental);
    if (mine?.status === 'ready') {
        mine.status = 'fulfilled';
        mine.fulfilled_at = now();
    }
    promote(store, bookId);
    writeStoreAtomic(store);
    const hydrated = localStore.getBook(bookId, user);
    return { rental, book: decorateBook(hydrated, store, user) };
}

function returnBookWithQueue(bookId, user, rentalId = null) {
    const store = readStore();
    reconcileStore(store, bookId);
    const book = store.books.find(item => Number(item.id) === Number(bookId));
    if (!book) throw error('Книга не найдена.', 'NOT_FOUND');
    const rental = store.rentals.find(item =>
        Number(item.book_id) === Number(bookId)
        && !item.returned_at
        && (rentalId ? Number(item.id) === Number(rentalId) : (user.role === 'admin' || Number(item.user_id) === Number(user.id)))
    );
    if (!rental) throw error('Активная аренда не найдена.', 'RENTAL_NOT_FOUND');

    rental.returned_at = now();
    book.copies = Math.max(0, Number(book.copies || 0)) + 1;
    book.updated_at = now();
    const queue = promote(store, bookId);
    writeStoreAtomic(store);
    const hydrated = localStore.getBook(bookId, user);
    return {
        rental,
        promoted: queue.promoted.map(item => mapReservation(store, item)),
        book: decorateBook(hydrated, store, user)
    };
}

function getReservationState(bookId, user) {
    const store = readStore();
    reconcileStore(store, bookId);
    writeStoreAtomic(store);
    const hydrated = localStore.getBook(bookId, user);
    return decorateBook(hydrated, store, user);
}

function listReservationsForUser(userId) {
    const store = readStore();
    reconcileStore(store);
    writeStoreAtomic(store);
    return store.reservations
        .filter(item => Number(item.user_id) === Number(userId) && ['waiting', 'ready'].includes(item.status))
        .sort((a, b) => (a.status === 'ready' ? -1 : 1) - (b.status === 'ready' ? -1 : 1) || new Date(a.created_at) - new Date(b.created_at))
        .map(item => mapReservation(store, item));
}

function decorateBooks(books, user = null) {
    const store = readStore();
    reconcileStore(store);
    writeStoreAtomic(store);
    return books.map(book => decorateBook(book, store, user));
}

function removeBookReservations(bookId) {
    const store = readStore();
    store.reservations = store.reservations.filter(item => Number(item.book_id) !== Number(bookId));
    writeStoreAtomic(store);
}

function removeUserReservations(userId) {
    const store = readStore();
    store.reservations = store.reservations.filter(item => Number(item.user_id) !== Number(userId));
    writeStoreAtomic(store);
}

module.exports = {
    READY_HOLD_HOURS,
    reserveBook,
    cancelReservation,
    rentBookWithQueue,
    returnBookWithQueue,
    getReservationState,
    listReservationsForUser,
    decorateBooks,
    decorateBook,
    removeBookReservations,
    removeUserReservations
};
