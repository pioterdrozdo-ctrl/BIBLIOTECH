-- Таблица пользователей
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    avatar TEXT,
    role VARCHAR(20) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    code_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица книг
CREATE TABLE IF NOT EXISTS storage_locations (
    id SERIAL PRIMARY KEY,
    shelf_code VARCHAR(80) NOT NULL,
    place_code VARCHAR(80) NOT NULL,
    note VARCHAR(160),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (shelf_code, place_code, note)
);

CREATE TABLE IF NOT EXISTS books (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    author VARCHAR(255) NOT NULL,
    description TEXT,
    cover_data_url TEXT,
    copies INTEGER DEFAULT 1,
    available BOOLEAN DEFAULT true,
    qr_code VARCHAR(32) UNIQUE,
    location_id INTEGER REFERENCES storage_locations(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- Таблица комментариев
CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    text TEXT NOT NULL,
    book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    username VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Миграции для баз, созданных ранними версиями проекта
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE books ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE books ADD COLUMN IF NOT EXISTS cover_data_url TEXT;
ALTER TABLE books ADD COLUMN IF NOT EXISTS copies INTEGER DEFAULT 1;
ALTER TABLE books ADD COLUMN IF NOT EXISTS available BOOLEAN DEFAULT true;
ALTER TABLE books ADD COLUMN IF NOT EXISTS qr_code VARCHAR(32);
ALTER TABLE books ADD COLUMN IF NOT EXISTS location_id INTEGER REFERENCES storage_locations(id) ON DELETE SET NULL;
ALTER TABLE books ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE books ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE comments ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS username VARCHAR(50);

CREATE TABLE IF NOT EXISTS book_rentals (
    id SERIAL PRIMARY KEY,
    book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    username VARCHAR(50),
    rented_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    returned_at TIMESTAMP
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);
CREATE INDEX IF NOT EXISTS idx_books_author ON books(author);
CREATE INDEX IF NOT EXISTS idx_books_available ON books(available);
CREATE INDEX IF NOT EXISTS idx_books_qr_code ON books(qr_code);
CREATE INDEX IF NOT EXISTS idx_books_location_id ON books(location_id);
CREATE INDEX IF NOT EXISTS idx_comments_book_id ON comments(book_id);
CREATE INDEX IF NOT EXISTS idx_book_rentals_book_id ON book_rentals(book_id);
CREATE INDEX IF NOT EXISTS idx_book_rentals_user_id ON book_rentals(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users (LOWER(email)) WHERE email IS NOT NULL;

-- Триггер для updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_books_updated_at ON books;
CREATE TRIGGER update_books_updated_at BEFORE UPDATE ON books
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Добавление администратора (пароль: GreenScreen, правильный хэш)
INSERT INTO users (username, email, password_hash, role)
VALUES ('admin', 'admin@bibliotech.local', '$2b$10$CwTycUXWue0Thq9StjUM0uJ.pG9sWwB6pTfZXh7eQvJZQeUzP9iFq', 'admin')
ON CONFLICT (username) DO NOTHING;

INSERT INTO storage_locations (shelf_code, place_code, note) VALUES
('ИКТ-ФВ 13', '09', 'Надставка'),
('ИКТ-ФВ 13', '12', 'Надставка')
ON CONFLICT DO NOTHING;

-- Удаление старых демо-книг из ранних версий проекта.
DELETE FROM books
WHERE user_id IS NULL
  AND (title, author) IN (
    VALUES
      ('Мастер и Маргарита', 'Михаил Булгаков'),
      ('Преступление и наказание', 'Фёдор Достоевский'),
      ('1984', 'Джордж Оруэлл'),
      ('Алхимик', 'Пауло Коэльо'),
      ('Маленький принц', 'Антуан де Сент-Экзюпери'),
      ('Война и мир', 'Лев Толстой')
  );

-- QR-коды для существующих книг
UPDATE books SET qr_code = 'BT' || LPAD(id::text, 6, '0') WHERE qr_code IS NULL;
UPDATE books SET location_id = CASE WHEN id % 2 = 0 THEN 2 ELSE 1 END WHERE location_id IS NULL;