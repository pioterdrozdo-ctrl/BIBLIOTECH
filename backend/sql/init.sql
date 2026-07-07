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
CREATE TABLE IF NOT EXISTS books (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    author VARCHAR(255) NOT NULL,
    description TEXT,
    cover_data_url TEXT,
    copies INTEGER DEFAULT 1,
    available BOOLEAN DEFAULT true,
    qr_code VARCHAR(32) UNIQUE,
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

-- Индексы
CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);
CREATE INDEX IF NOT EXISTS idx_books_author ON books(author);
CREATE INDEX IF NOT EXISTS idx_books_available ON books(available);
CREATE INDEX IF NOT EXISTS idx_books_qr_code ON books(qr_code);
CREATE INDEX IF NOT EXISTS idx_comments_book_id ON comments(book_id);
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

-- Добавление демо-книг
INSERT INTO books (title, author, description, copies, available) VALUES
('Мастер и Маргарита', 'Михаил Булгаков', 'Роман о любви, мистике, свободе творчества и вечном споре добра со злом.', 3, true),
('Преступление и наказание', 'Фёдор Достоевский', 'Психологический роман о выборе, совести и последствиях поступков.', 2, true),
('1984', 'Джордж Оруэлл', 'Антиутопия о контроле, пропаганде и потере личной свободы.', 0, false),
('Алхимик', 'Пауло Коэльо', 'Притча о мечте, пути и вере в собственную цель.', 5, true),
('Маленький принц', 'Антуан де Сент-Экзюпери', 'Философская сказка о дружбе, взрослении и ответственности.', 4, true),
('Война и мир', 'Лев Толстой', 'Эпический роман о семье, истории, войне и человеческом выборе.', 1, true)
ON CONFLICT (id) DO NOTHING;

-- QR-коды для демо-книг
UPDATE books SET qr_code = 'BT' || LPAD(id::text, 6, '0') WHERE qr_code IS NULL;
