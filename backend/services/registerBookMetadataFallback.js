'use strict';

const localStore = require('./localStore');
const { normalizeIsbn, isbn13To10, validateIsbn } = require('./isbnMetadata');

if (!localStore.__bookMetadataFallbackRegistered) {
    const originalGetBooks = localStore.getBooks.bind(localStore);

    localStore.getBooks = function getBooksWithMetadataSearch(query = {}, user = null) {
        const search = String(query.search || '').trim().toLowerCase();
        const books = originalGetBooks(search ? { ...query, search: '' } : query, user)
            .map(book => ({ ...book, isbn: normalizeIsbn(book.isbn) || null }));
        if (!search) return books;

        const canonicalSearch = validateIsbn(search) ? normalizeIsbn(search) : '';
        const legacySearch = canonicalSearch ? isbn13To10(canonicalSearch) : '';
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
        ].join(' ').toLowerCase().includes(search)
            || (canonicalSearch && normalizeIsbn(book.isbn) === canonicalSearch)
            || (legacySearch && isbn13To10(book.isbn) === legacySearch));
    };

    localStore.__bookMetadataFallbackRegistered = true;
}

module.exports = localStore;
