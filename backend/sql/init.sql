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
    isbn VARCHAR(13),
    publication_year INTEGER,
    publisher VARCHAR(255),
    genre VARCHAR(160),
    language VARCHAR(80),
    metadata_source VARCHAR(40),
    metadata_source_url TEXT,
    metadata_updated_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- Редактируемая навигационная схема физического фонда.
CREATE TABLE IF NOT EXISTS library_map_objects (
    id SERIAL PRIMARY KEY,
    code VARCHAR(80) UNIQUE NOT NULL,
    label VARCHAR(160) NOT NULL,
    object_type VARCHAR(30) NOT NULL,
    room_code VARCHAR(30) NOT NULL DEFAULT '125',
    x NUMERIC NOT NULL DEFAULT 0,
    y NUMERIC NOT NULL DEFAULT 0,
    z NUMERIC NOT NULL DEFAULT 0,
    width NUMERIC NOT NULL DEFAULT 1,
    height NUMERIC NOT NULL DEFAULT 1,
    depth NUMERIC NOT NULL DEFAULT 1,
    rotation_y NUMERIC NOT NULL DEFAULT 0,
    storage_location_id INTEGER REFERENCES storage_locations(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_available_enabled BOOLEAN DEFAULT TRUE;

ALTER TABLE books ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE books ADD COLUMN IF NOT EXISTS cover_data_url TEXT;
ALTER TABLE books ADD COLUMN IF NOT EXISTS copies INTEGER DEFAULT 1;
ALTER TABLE books ADD COLUMN IF NOT EXISTS available BOOLEAN DEFAULT true;
ALTER TABLE books ADD COLUMN IF NOT EXISTS qr_code VARCHAR(32);
ALTER TABLE books ADD COLUMN IF NOT EXISTS location_id INTEGER REFERENCES storage_locations(id) ON DELETE SET NULL;
ALTER TABLE books ADD COLUMN IF NOT EXISTS isbn VARCHAR(13);
ALTER TABLE books ADD COLUMN IF NOT EXISTS publication_year INTEGER;
ALTER TABLE books ADD COLUMN IF NOT EXISTS publisher VARCHAR(255);
ALTER TABLE books ADD COLUMN IF NOT EXISTS genre VARCHAR(160);
ALTER TABLE books ADD COLUMN IF NOT EXISTS language VARCHAR(80);
ALTER TABLE books ADD COLUMN IF NOT EXISTS metadata_source VARCHAR(40);
ALTER TABLE books ADD COLUMN IF NOT EXISTS metadata_source_url TEXT;
ALTER TABLE books ADD COLUMN IF NOT EXISTS metadata_updated_at TIMESTAMP;
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
    returned_at TIMESTAMP,
    due_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '14 days')
);
ALTER TABLE book_rentals ADD COLUMN IF NOT EXISTS due_at TIMESTAMP;
ALTER TABLE book_rentals ALTER COLUMN due_at SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '14 days');
UPDATE book_rentals SET due_at = rented_at + INTERVAL '14 days' WHERE due_at IS NULL AND returned_at IS NULL;

CREATE TABLE IF NOT EXISTS book_reservations (
    id SERIAL PRIMARY KEY,
    book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    username VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'waiting',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ready_at TIMESTAMP,
    expires_at TIMESTAMP,
    fulfilled_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    expired_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS account_notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(40) NOT NULL,
    unique_key VARCHAR(120) NOT NULL,
    title VARCHAR(180) NOT NULL,
    message TEXT NOT NULL,
    book_id INTEGER REFERENCES books(id) ON DELETE SET NULL,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, unique_key)
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);
CREATE INDEX IF NOT EXISTS idx_books_author ON books(author);
CREATE INDEX IF NOT EXISTS idx_books_available ON books(available);
CREATE INDEX IF NOT EXISTS idx_books_qr_code ON books(qr_code);
CREATE INDEX IF NOT EXISTS idx_books_location_id ON books(location_id);
CREATE INDEX IF NOT EXISTS idx_library_map_objects_room_code ON library_map_objects(room_code);
CREATE INDEX IF NOT EXISTS idx_library_map_objects_object_type ON library_map_objects(object_type);
CREATE INDEX IF NOT EXISTS idx_library_map_objects_storage_location_id ON library_map_objects(storage_location_id);
CREATE INDEX IF NOT EXISTS idx_books_publication_year ON books(publication_year);
CREATE INDEX IF NOT EXISTS idx_books_publisher ON books(publisher);
CREATE INDEX IF NOT EXISTS idx_books_genre ON books(genre);
CREATE INDEX IF NOT EXISTS idx_books_language ON books(language);
CREATE UNIQUE INDEX IF NOT EXISTS idx_books_isbn_unique ON books(isbn) WHERE isbn IS NOT NULL AND isbn <> '';
CREATE INDEX IF NOT EXISTS idx_comments_book_id ON comments(book_id);
CREATE INDEX IF NOT EXISTS idx_book_rentals_book_id ON book_rentals(book_id);
CREATE INDEX IF NOT EXISTS idx_book_rentals_user_id ON book_rentals(user_id);
CREATE INDEX IF NOT EXISTS idx_book_reservations_book_queue ON book_reservations(book_id, status, created_at, id);
CREATE INDEX IF NOT EXISTS idx_book_reservations_user ON book_reservations(user_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_book_reservations_active_user_book
    ON book_reservations(book_id, user_id)
    WHERE status IN ('waiting', 'ready');
CREATE INDEX IF NOT EXISTS idx_account_notifications_user ON account_notifications(user_id, created_at DESC);
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

DROP TRIGGER IF EXISTS update_library_map_objects_updated_at ON library_map_objects;
CREATE TRIGGER update_library_map_objects_updated_at BEFORE UPDATE ON library_map_objects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Добавление администратора (пароль: GreenScreen, правильный хэш)
INSERT INTO users (username, email, password_hash, role)
VALUES ('admin', 'admin@bibliotech.local', '$2b$10$CwTycUXWue0Thq9StjUM0uJ.pG9sWwB6pTfZXh7eQvJZQeUzP9iFq', 'admin')
ON CONFLICT (username) DO NOTHING;

INSERT INTO storage_locations (shelf_code, place_code, note) VALUES
('ИКТ-ФВ 13', '09', 'Надставка'),
('ИКТ-ФВ 13', '12', 'Надставка')
ON CONFLICT DO NOTHING;

-- Базовая навигационная схема, а не архитектурный обмер помещения.
INSERT INTO library_map_objects
    (code, label, object_type, room_code, x, y, z, width, height, depth, rotation_y, storage_location_id)
SELECT seed.*
FROM (VALUES
    ('ROOM_125_FLOOR', 'Пол кабинета 125', 'floor', '125', 0, -0.1, 0, 10, 0.2, 7, 0, NULL::integer),
    ('ROOM_125_WALL_NORTH', 'Северная условная стена', 'wall', '125', 0, 1.25, -3.45, 10, 2.5, 0.12, 0, NULL::integer),
    ('ROOM_125_WALL_SOUTH', 'Южная условная стена', 'wall', '125', 0, 1.25, 3.45, 10, 2.5, 0.12, 0, NULL::integer),
    ('ROOM_125_WALL_EAST', 'Восточная условная стена', 'wall', '125', 4.95, 1.25, 0, 0.12, 2.5, 7, 0, NULL::integer),
    ('ROOM_125_WALL_WEST', 'Западная условная стена', 'wall', '125', -4.95, 1.25, -1.35, 0.12, 2.5, 4.3, 0, NULL::integer),
    ('ROOM_125_ENTRANCE', 'Вход в кабинет 125', 'entrance', '125', -4.85, 0.05, 2.1, 0.3, 0.1, 1.35, 0, NULL::integer),
    ('ROOM_125_AISLE', 'Основной проход', 'aisle', '125', -0.3, 0.015, 0.65, 7.6, 0.03, 1.15, 0, NULL::integer)
) AS seed(code, label, object_type, room_code, x, y, z, width, height, depth, rotation_y, storage_location_id)
WHERE NOT EXISTS (SELECT 1 FROM library_map_objects WHERE room_code = '125')
ON CONFLICT (code) DO NOTHING;

INSERT INTO library_map_objects
    (code, label, object_type, room_code, x, y, z, width, height, depth, rotation_y, storage_location_id)
SELECT 'STORAGE_IKT_FV_13_09', 'ИКТ-ФВ 13 · место 09 · Надставка', 'storage', '125', 1.8, 0.85, -1.65, 2.5, 1.7, 0.8, 0, location.id
FROM storage_locations AS location
WHERE UPPER(REGEXP_REPLACE(REPLACE(location.shelf_code, '_', ' '), '\s+', ' ', 'g')) = 'ИКТ-ФВ 13'
  AND LPAD(TRIM(location.place_code), 2, '0') = '09'
  AND UPPER(TRIM(COALESCE(location.note, ''))) = 'НАДСТАВКА'
ORDER BY location.id LIMIT 1
ON CONFLICT (code) DO NOTHING;

INSERT INTO library_map_objects
    (code, label, object_type, room_code, x, y, z, width, height, depth, rotation_y, storage_location_id)
SELECT 'STORAGE_IKT_FV_13_12', 'ИКТ-ФВ 13 · место 12 · Надставка', 'storage', '125', 1.8, 0.85, 1.8, 2.5, 1.7, 0.8, 0, location.id
FROM storage_locations AS location
WHERE UPPER(REGEXP_REPLACE(REPLACE(location.shelf_code, '_', ' '), '\s+', ' ', 'g')) = 'ИКТ-ФВ 13'
  AND LPAD(TRIM(location.place_code), 2, '0') = '12'
  AND UPPER(TRIM(COALESCE(location.note, ''))) = 'НАДСТАВКА'
ORDER BY location.id LIMIT 1
ON CONFLICT (code) DO NOTHING;

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
