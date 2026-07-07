const fs = require('fs');
const path = require('path');
const { hashPassword, verifyPassword } = require('../utils/passwords');
const { buildBookQrCode, buildBookQrPayload, normalizeBookQrFields } = require('../utils/bookQr');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

function now() {
    return new Date().toISOString();
}

function withQrFields(book) {
    const qrFields = normalizeBookQrFields(book);
    return { ...book, ...qrFields };
}

function seedBooks() {
    const created = now();
    return [
        {
            id: 1,
            title: 'Мастер и Маргарита',
            author: 'Михаил Булгаков',
            description: 'Роман о любви, мистике, свободе творчества и вечном споре добра со злом.',
            coverDataURL: null,
            copies: 3,
            available: true,
            user_id: 1,
            created_at: created,
            updated_at: created
        },
        {
            id: 2,
            title: 'Преступление и наказание',
            author: 'Федор Достоевский',
            description: 'Психологический роман о выборе, совести и последствиях поступков.',
            coverDataURL: null,
            copies: 2,
            available: true,
            user_id: 1,
            created_at: created,
            updated_at: created
        },
        {
            id: 3,
            title: '1984',
            author: 'Джордж Оруэлл',
            description: 'Антиутопия о контроле, пропаганде и потере личной свободы.',
            coverDataURL: null,
            copies: 0,
            available: false,
            user_id: 1,
            created_at: created,
            updated_at: created
        },
        {
            id: 4,
            title: 'Алхимик',
            author: 'Пауло Коэльо',
            description: 'Притча о мечте, пути и вере в собственную цель.',
            coverDataURL: null,
            copies: 5,
            available: true,
            user_id: 1,
            created_at: created,
            updated_at: created
        },
        {
            id: 5,
            title: 'Маленький принц',
            author: 'Антуан де Сент-Экзюпери',
            description: 'Философская сказка о дружбе, взрослении и ответственности.',
            coverDataURL: null,
            copies: 4,
            available: true,
            user_id: 1,
            created_at: created,
            updated_at: created
        },
        {
            id: 6,
            title: 'Война и мир',
            author: 'Лев Толстой',
            description: 'Эпический роман о семье, истории, войне и человеческом выборе.',
            coverDataURL: null,
            copies: 1,
            available: true,
            user_id: 1,
            created_at: created,
            updated_at: created
        }
    ].map(withQrFields);
}

function createInitialStore() {
    return {
        counters: { users: 1, books: 6, comments: 1, password_resets: 0 },
        users: [
            {
                id: 1,
                username: 'admin',
                email: 'admin@bibliotech.local',
                password_hash: hashPassword('GreenScreen'),
                role: 'admin',
                created_at: now(),
                updated_at: now()
            }
        ],
        books: seedBooks(),
        password_resets: [],
        comments: [
            {
                id: 1,
                text: 'Сильная книга, легко обсуждать на защите проекта.',
                book_id: 1,
                user_id: 1,
                username: 'admin',
                created_at: now()
            }
        ]
    };
}

function ensureStore() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(STORE_FILE)) {
        writeStore(createInitialStore());
    }
}

function readStore() {
    ensureStore();
    const store = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    if (!store.counters) store.counters = {};
    if (!Array.isArray(store.password_resets)) store.password_resets = [];
    store.users = (store.users || []).map(user => ({ email: null, ...user }));
    return store;
}

function writeStore(store) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

function publicUser(user) {
    return { id: user.id, username: user.username, email: user.email || null, role: user.role };
}

function nextId(store, key) {
    store.counters[key] = Number(store.counters[key] || 0) + 1;
    return store.counters[key];
}

function normalizeBook(book, comments = []) {
    const qrFields = normalizeBookQrFields(book);
    return {
        ...book,
        ...qrFields,
        coverDataURL: book.coverDataURL || book.cover_data_url || null,
        cover_data_url: book.coverDataURL || book.cover_data_url || null,
        comments: comments.map(comment => ({
            id: comment.id,
            text: comment.text,
            date: comment.created_at,
            created_at: comment.created_at,
            username: comment.username,
            user_id: comment.user_id
        }))
    };
}

function getBooks({ filter, sort, search, minCopies } = {}) {
    const store = readStore();
    const query = String(search || '').trim().toLowerCase();
    const min = Math.max(0, Number(minCopies || 0));

    let books = store.books.map(book => {
        const comments = store.comments.filter(comment => Number(comment.book_id) === Number(book.id));
        return normalizeBook(book, comments);
    });

    if (query) {
        books = books.filter(book => {
            const haystack = [
                book.title,
                book.author,
                book.description,
                book.qrCode,
                book.qr_code,
                ...(book.comments || []).map(comment => comment.text)
            ].join(' ').toLowerCase();
            return haystack.includes(query);
        });
    }

    if (filter === 'available') books = books.filter(book => book.available);
    if (filter === 'unavailable') books = books.filter(book => !book.available);
    if (min > 0) books = books.filter(book => Number(book.copies || 0) >= min);

    const byText = (field, dir = 1) => (a, b) => String(a[field] || '').localeCompare(String(b[field] || ''), 'ru') * dir;
    const byDate = (dir = 1) => (a, b) => (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;

    switch (sort) {
        case 'title-asc': books.sort(byText('title')); break;
        case 'title-desc': books.sort(byText('title', -1)); break;
        case 'author-asc': books.sort(byText('author')); break;
        case 'date-oldest': books.sort(byDate()); break;
        case 'copies-desc': books.sort((a, b) => Number(b.copies || 0) - Number(a.copies || 0)); break;
        case 'copies-asc': books.sort((a, b) => Number(a.copies || 0) - Number(b.copies || 0)); break;
        case 'available-first': books.sort((a, b) => Number(b.available) - Number(a.available) || byText('title')(a, b)); break;
        case 'date-newest':
        default: books.sort(byDate(-1)); break;
    }

    return books;
}

function getBook(id) {
    const store = readStore();
    const book = store.books.find(item => Number(item.id) === Number(id));
    if (!book) return null;
    return normalizeBook(book, store.comments.filter(comment => Number(comment.book_id) === Number(book.id)));
}

function createUser(username, password, email) {
    const store = readStore();
    const exists = store.users.some(user => user.username.toLowerCase() === String(username).toLowerCase());
    if (exists) {
        const error = new Error('User already exists');
        error.code = 'DUPLICATE_USER';
        throw error;
    }
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const emailExists = store.users.some(user => user.email && user.email.toLowerCase() === normalizedEmail);
    if (emailExists) {
        const error = new Error('Email already exists');
        error.code = 'DUPLICATE_EMAIL';
        throw error;
    }

    const user = {
        id: nextId(store, 'users'),
        username,
        email: normalizedEmail,
        password_hash: hashPassword(password),
        role: 'user',
        created_at: now(),
        updated_at: now()
    };

    store.users.push(user);
    writeStore(store);
    return publicUser(user);
}

function authenticateUser(username, password) {
    const store = readStore();
    const user = store.users.find(item => item.username.toLowerCase() === String(username).toLowerCase());
    if (!user || !verifyPassword(password, user.password_hash)) return null;
    return publicUser(user);
}

function listUsersForAdmin() {
    const store = readStore();
    return store.users
        .slice()
        .sort((a, b) => Number(a.id) - Number(b.id))
        .map(user => ({
            id: user.id,
            username: user.username,
            email: user.email || null,
            role: user.role,
            created_at: user.created_at,
            updated_at: user.updated_at,
            password_set: Boolean(user.password_hash),
            password_status: 'hidden_hash'
        }));
}

function createPasswordReset(email) {
    const store = readStore();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const user = store.users.find(item => item.email && item.email.toLowerCase() === normalizedEmail);
    if (!user) return null;

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    store.password_resets = store.password_resets.filter(token => Number(token.user_id) !== Number(user.id) || token.used_at);
    store.password_resets.push({
        id: nextId(store, 'password_resets'),
        user_id: user.id,
        code_hash: hashPassword(code),
        expires_at: expiresAt,
        used_at: null,
        created_at: now()
    });
    writeStore(store);
    return { user: publicUser(user), code };
}

function resetPasswordWithCode(email, code, password) {
    const store = readStore();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const user = store.users.find(item => item.email && item.email.toLowerCase() === normalizedEmail);
    if (!user) {
        const error = new Error('Invalid reset');
        error.code = 'INVALID_RESET';
        throw error;
    }

    const token = store.password_resets
        .filter(item => Number(item.user_id) === Number(user.id) && !item.used_at && new Date(item.expires_at) > new Date())
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    if (!token || !verifyPassword(String(code || '').trim(), token.code_hash)) {
        const error = new Error('Invalid reset');
        error.code = 'INVALID_RESET';
        throw error;
    }

    user.password_hash = hashPassword(password);
    user.updated_at = now();
    token.used_at = now();
    writeStore(store);
    return publicUser(user);
}

function addBook(user, data) {
    const store = readStore();
    const copies = Math.max(0, Number(data.copies ?? 1));
    const bookId = nextId(store, 'books');
    const book = withQrFields({
        id: bookId,
        title: String(data.title || '').trim(),
        author: String(data.author || '').trim(),
        description: String(data.description || '').trim(),
        coverDataURL: data.coverDataURL || data.cover_data_url || null,
        copies,
        available: data.available !== false && copies > 0,
        user_id: user.id,
        created_at: now(),
        updated_at: now()
    });
    store.books.unshift(book);
    writeStore(store);
    return normalizeBook(book, []);
}

function updateBook(id, data) {
    const store = readStore();
    const book = store.books.find(item => Number(item.id) === Number(id));
    if (!book) return null;

    ['title', 'author', 'description'].forEach(field => {
        if (data[field] !== undefined) book[field] = String(data[field]);
    });
    if (data.coverDataURL !== undefined || data.cover_data_url !== undefined) {
        book.coverDataURL = data.coverDataURL || data.cover_data_url || null;
    }
    if (data.copies !== undefined) book.copies = Math.max(0, Number(data.copies || 0));
    if (data.available !== undefined) book.available = Boolean(data.available);
    if (book.copies <= 0) book.available = false;
    book.updated_at = now();

    writeStore(store);
    return normalizeBook(book, store.comments.filter(comment => Number(comment.book_id) === Number(book.id)));
}

function deleteBook(id, user) {
    const store = readStore();
    const index = store.books.findIndex(item => Number(item.id) === Number(id));
    if (index === -1) return false;

    store.books.splice(index, 1);
    store.comments = store.comments.filter(comment => Number(comment.book_id) !== Number(id));
    writeStore(store);
    return true;
}

function addComment(user, bookId, text) {
    const store = readStore();
    const exists = store.books.some(book => Number(book.id) === Number(bookId));
    if (!exists) return null;

    const comment = {
        id: nextId(store, 'comments'),
        text: String(text).trim(),
        book_id: Number(bookId),
        user_id: user.id,
        username: user.username,
        created_at: now()
    };
    store.comments.unshift(comment);
    writeStore(store);
    return { ...comment, date: comment.created_at };
}

function deleteComment(id, user) {
    const store = readStore();
    const index = store.comments.findIndex(comment => Number(comment.id) === Number(id));
    if (index === -1) return false;
    const comment = store.comments[index];
    if (Number(comment.user_id) !== Number(user.id) && user.role !== 'admin') {
        const error = new Error('Forbidden');
        error.code = 'FORBIDDEN';
        throw error;
    }
    store.comments.splice(index, 1);
    writeStore(store);
    return true;
}

function getComments(bookId) {
    const store = readStore();
    return store.comments
        .filter(comment => Number(comment.book_id) === Number(bookId))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .map(comment => ({ ...comment, date: comment.created_at }));
}

function getStats() {
    const store = readStore();
    const totalBooks = store.books.length;
    const availableBooks = store.books.filter(book => book.available).length;
    const totalCopies = store.books.reduce((sum, book) => sum + Number(book.copies || 0), 0);
    const totalComments = store.comments.length;
    const authorCounts = store.books.reduce((acc, book) => {
        const author = book.author || 'Автор не указан';
        acc[author] = (acc[author] || 0) + 1;
        return acc;
    }, {});

    return {
        totalBooks,
        availableBooks,
        totalCopies,
        totalComments,
        availablePercent: totalBooks ? Math.round((availableBooks / totalBooks) * 100) : 0,
        topAuthors: Object.entries(authorCounts)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'))
            .slice(0, 5)
            .map(([author, count]) => ({ author, count }))
    };
}

module.exports = {
    STORE_FILE,
    createUser,
    authenticateUser,
    listUsersForAdmin,
    createPasswordReset,
    resetPasswordWithCode,
    getBooks,
    getBook,
    addBook,
    updateBook,
    deleteBook,
    addComment,
    deleteComment,
    getComments,
    getStats
};
