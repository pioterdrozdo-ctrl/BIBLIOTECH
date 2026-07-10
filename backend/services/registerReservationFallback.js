'use strict';

const localStore = require('./localStore');
const reservationStore = require('./localReservationStore');

if (!localStore.__reservationFallbackRegistered) {
    const originalGetBooks = localStore.getBooks.bind(localStore);
    const originalGetBook = localStore.getBook.bind(localStore);
    const originalDeleteBook = localStore.deleteBook.bind(localStore);
    const originalDeleteOwnAccount = typeof localStore.deleteOwnAccount === 'function'
        ? localStore.deleteOwnAccount.bind(localStore)
        : null;

    localStore.getBooks = function getBooksWithReservations(query = {}, user = null) {
        return reservationStore.decorateBooks(originalGetBooks(query, user), user);
    };

    localStore.getBook = function getBookWithReservation(id, user = null) {
        const book = originalGetBook(id, user);
        return reservationStore.decorateBooks(book ? [book] : [], user)[0] || null;
    };

    localStore.deleteBook = function deleteBookWithReservations(id, user) {
        const deleted = originalDeleteBook(id, user);
        if (deleted) reservationStore.removeBookReservations(id);
        return deleted;
    };

    if (originalDeleteOwnAccount) {
        localStore.deleteOwnAccount = function deleteAccountWithReservations(userId, password) {
            const result = originalDeleteOwnAccount(userId, password);
            reservationStore.removeUserReservations(userId);
            return result;
        };
    }

    Object.assign(localStore, {
        reserveBook: reservationStore.reserveBook,
        cancelReservation: reservationStore.cancelReservation,
        rentBookWithQueue: reservationStore.rentBookWithQueue,
        returnBookWithQueue: reservationStore.returnBookWithQueue,
        getReservationState: reservationStore.getReservationState,
        listReservationsForUser: reservationStore.listReservationsForUser
    });

    localStore.__reservationFallbackRegistered = true;
}

module.exports = localStore;
