'use strict';

const localStore = require('./localStore');

if (!localStore.__bookMetadataFallbackRegistered) {
    const originalGetBooks = localStore.getBooks.bind(localStore);

    localStore.getBooks = function getBooksWithMetadataSearch(query = {}, user = null) {
        const search = String(query.search || '').trim().toLowerCase();
        if (!search) return originalGetBooks(query, user);

        const books = originalGetBooks({ ...query, search: '' }, user);
        return books.filter(book => [
            book.title,
            book.author,
            book.description,
            book.qrCode,
            book.qr_code,
            book.isbn,
            book.publicationYear,
            book.publication_year,
            book.publisher,
            book.genre,
            book.language,
            book.location?.shelf_code,
            book.location?.place_code,
            book.location?.note,
            ...(book.comments || []).map(comment => comment.text)
        ].join(' ').toLowerCase().includes(search));
    };

    localStore.__bookMetadataFallbackRegistered = true;
}

module.exports = localStore;
