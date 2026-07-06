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
        counters: { users: 1, books: 6, comments: 1 },
        users: [
            {
                id: 1,
                username: 'admin',
                password_hash: hashPassword('GreenScreen'),
                role: 'admin',
                created_at: now(),
                updated_at: now()
            }
        ],
        books: seedBooks(),
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
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
}

function writeStore(store) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

function publicUser(user) {
    return { id: user.id, username: user.username, role: user.role };
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

function createUser(username, password) {
    const store = readStore();
    const exists = store.users.some(user => user.username.toLowerCase() === String(username).toLowerCase());
    if (exists) {
        const error = new Error('User already exists');
        error.code = 'DUPLICATE_USER';
        throw error;
    }

    const user = {
        id: nextId(store, 'users'),
        username,
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
