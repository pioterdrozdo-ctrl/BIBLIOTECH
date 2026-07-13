'use strict';

const pool = require('../db/pool');
const { normalizeIsbn, validateIsbn } = require('./isbnMetadata');

let legacyIsbnNormalizationComplete = false;

async function normalizeLegacyIsbns(client) {
    if (legacyIsbnNormalizationComplete) return;
    const result = await client.query(`
        SELECT id, isbn
        FROM books
        WHERE isbn IS NOT NULL
          AND char_length(isbn) = 10
    `);
    for (const book of result.rows || []) {
        if (!validateIsbn(book.isbn)) continue;
        const canonicalIsbn = normalizeIsbn(book.isbn);
        if (!canonicalIsbn || canonicalIsbn === book.isbn) continue;
        await client.query(`
            UPDATE books
            SET isbn = $1
            WHERE id = $2
              AND NOT EXISTS (
                  SELECT 1
                  FROM books AS duplicate
                  WHERE duplicate.id <> $2
                    AND duplicate.isbn = $1
              )
        `, [canonicalIsbn, book.id]);
    }
    legacyIsbnNormalizationComplete = true;
}

async function ensureBookMetadataSchema(client = pool) {
    await client.query(`
        ALTER TABLE books ADD COLUMN IF NOT EXISTS isbn VARCHAR(13);
        ALTER TABLE books ADD COLUMN IF NOT EXISTS publication_year INTEGER;
        ALTER TABLE books ADD COLUMN IF NOT EXISTS publisher VARCHAR(255);
        ALTER TABLE books ADD COLUMN IF NOT EXISTS genre VARCHAR(160);
        ALTER TABLE books ADD COLUMN IF NOT EXISTS language VARCHAR(80);
        ALTER TABLE books ADD COLUMN IF NOT EXISTS metadata_source VARCHAR(40);
        ALTER TABLE books ADD COLUMN IF NOT EXISTS metadata_source_url TEXT;
        ALTER TABLE books ADD COLUMN IF NOT EXISTS metadata_updated_at TIMESTAMP;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_books_isbn_unique
            ON books(isbn)
            WHERE isbn IS NOT NULL AND isbn <> '';
        CREATE INDEX IF NOT EXISTS idx_books_publication_year ON books(publication_year);
        CREATE INDEX IF NOT EXISTS idx_books_publisher ON books(publisher);
        CREATE INDEX IF NOT EXISTS idx_books_genre ON books(genre);
        CREATE INDEX IF NOT EXISTS idx_books_language ON books(language);
    `);
    await normalizeLegacyIsbns(client);
}

module.exports = { ensureBookMetadataSchema, normalizeLegacyIsbns };
