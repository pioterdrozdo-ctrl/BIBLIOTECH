'use strict';

const fs = require('fs');
const path = require('path');
const localStore = require('./localStore');
const { normalizeBookMetadataInput } = require('./isbnMetadata');

function readStore() {
    return JSON.parse(fs.readFileSync(localStore.STORE_FILE, 'utf8'));
}

function writeStoreAtomic(store) {
    const directory = path.dirname(localStore.STORE_FILE);
    const temporary = path.join(directory, `.store-metadata-${process.pid}-${Date.now()}.json`);
    fs.writeFileSync(temporary, JSON.stringify(store, null, 2));
    fs.renameSync(temporary, localStore.STORE_FILE);
}

function ensureUniqueIsbn(store, isbn, excludedBookId = null) {
    if (!isbn) return;
    const duplicate = (store.books || []).find(book =>
        String(book.isbn || '') === isbn
        && Number(book.id) !== Number(excludedBookId)
    );
    if (duplicate) {
        const error = new Error('Книга с таким ISBN уже есть в каталоге.');
        error.code = 'DUPLICATE_ISBN';
        error.bookId = duplicate.id;
        throw error;
    }
}

function applyMetadata(book, metadata, { partial = false } = {}) {
    const mapping = {
        isbn: 'isbn',
        publicationYear: 'publication_year',
        publisher: 'publisher',
        genre: 'genre',
        language: 'language',
        metadataSource: 'metadata_source',
        metadataSourceUrl: 'metadata_source_url'
    };
    Object.entries(mapping).forEach(([source, target]) => {
        if (!partial || Object.prototype.hasOwnProperty.call(metadata, source)) {
            book[target] = metadata[source] ?? null;
        }
    });
    if (Object.keys(metadata).length) book.metadata_updated_at = new Date().toISOString();
}

function addBook(user, data) {
    const metadata = normalizeBookMetadataInput(data);
    const before = readStore();
    ensureUniqueIsbn(before, metadata.isbn);

    const created = localStore.addBook(user, data);
    const store = readStore();
    const book = (store.books || []).find(item => Number(item.id) === Number(created.id));
    if (!book) throw new Error('Created fallback book was not found.');
    applyMetadata(book, metadata);
    writeStoreAtomic(store);
    return localStore.getBook(book.id, user);
}

function updateBook(id, data, user = null) {
    const metadata = normalizeBookMetadataInput(data, { partial: true });
    const storeBefore = readStore();
    if (Object.prototype.hasOwnProperty.call(metadata, 'isbn')) {
        ensureUniqueIsbn(storeBefore, metadata.isbn, id);
    }

    const updated = localStore.updateBook(id, data);
    if (!updated) return null;
    const store = readStore();
    const book = (store.books || []).find(item => Number(item.id) === Number(id));
    if (!book) return null;
    applyMetadata(book, metadata, { partial: true });
    writeStoreAtomic(store);
    return localStore.getBook(id, user);
}

module.exports = { addBook, updateBook };
