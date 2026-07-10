const fs = require('fs');
const path = require('path');
const localStore = require('./localStore');
const { hashPassword, verifyPassword } = require('../utils/passwords');

const STORE_FILE = localStore.STORE_FILE;

function now() {
    return new Date().toISOString();
}

function read() {
    const store = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    if (!store.counters) store.counters = {};
    if (!Array.isArray(store.account_notifications)) store.account_notifications = [];
    if (!Array.isArray(store.user_book_lists)) store.user_book_lists = [];
    if (!Array.isArray(store.user_login_events)) store.user_login_events = [];
    store.users = (store.users || []).map(user => ({
        session_version: 1,
        remember_session_enabled: true,
        notification_due_enabled: true,
        notification_overdue_enabled: true,
        notification_available_enabled: true,
        login_alerts_enabled: false,
        profile_private_enabled: false,
        reading_history_private_enabled: false,
        comments_profile_enabled: true,
        ...user
    }));
    return store;
}

function write(store) {
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

function nextId(store, key) {
    store.counters[key] = Number(store.counters[key] || 0) + 1;
    return store.counters[key];
}

function findUser(store, userId) {
    return store.users.find(user => Number(user.id) === Number(userId));
}

function publicUser(user) {
    return {
        id: user.id,
        username: user.username,
        email: user.email || null,
        role: user.role,
        session_version: Number(user.session_version || 1),
        remember_session_enabled: user.remember_session_enabled !== false,
        created_at: user.created_at || null
    };
}

function mapPreferences(user = {}) {
    return {
        notifications: {
            due: user.notification_due_enabled !== false,
            overdue: user.notification_overdue_enabled !== false,
            available: user.notification_available_enabled !== false,
            login: Boolean(user.login_alerts_enabled)
        },
        privacy: {
            privateProfile: Boolean(user.profile_private_enabled),
            privateHistory: Boolean(user.reading_history_private_enabled),
            showComments: user.comments_profile_enabled !== false
        }
    };
}

function getAuthState(userId) {
    const store = read();
    const user = findUser(store, userId);
    return user ? publicUser(user) : null;
}

function getAccountSettings(userId) {
    const store = read();
    const user = findUser(store, userId);
    if (!user) return null;
    return { user: publicUser(user), ...mapPreferences(user) };
}

function changeAccountPassword(userId, currentPassword, newPassword) {
    const store = read();
    const user = findUser(store, userId);
    if (!user || !verifyPassword(currentPassword, user.password_hash)) {
        throw new Error('Текущий пароль указан неверно.');
    }
    user.password_hash = hashPassword(newPassword);
    user.session_version = Number(user.session_version || 1) + 1;
    user.updated_at = now();
    write(store);
    return publicUser(user);
}

function bumpAccountSession(userId) {
    const store = read();
    const user = findUser(store, userId);
    if (!user) throw new Error('Account not found');
    user.session_version = Number(user.session_version || 1) + 1;
    user.updated_at = now();
    write(store);
    return publicUser(user);
}

function listAccountDevices(userId, currentAgent = '') {
    const store = read();
    const user = findUser(store, userId);
    if (!user) return [];
    let events = store.user_login_events.filter(item => Number(item.user_id) === Number(userId));
    if (!events.length) {
        const event = {
            id: nextId(store, 'user_login_events'),
            user_id: Number(userId),
            ip_address: 'local',
            device: /mobile|android|iphone/i.test(currentAgent) ? 'Mobile' : 'Desktop',
            os: /android/i.test(currentAgent) ? 'Android' : /iphone|ipad/i.test(currentAgent) ? 'iOS' : 'Unknown OS',
            browser: 'Browser',
            platform: /mobile|android|iphone/i.test(currentAgent) ? 'Mobile' : 'Desktop',
            user_agent: currentAgent,
            created_at: now()
        };
        store.user_login_events.push(event);
        write(store);
        events = [event];
    }
    let currentMarked = false;
    return events
        .slice()
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 30)
        .map(event => {
            const current = !currentMarked && (!currentAgent || event.user_agent === currentAgent);
            if (current) currentMarked = true;
            return { ...event, current };
        });
}

function notificationExists(store, userId, uniqueKey) {
    return store.account_notifications.some(item => Number(item.user_id) === Number(userId) && item.unique_key === uniqueKey);
}

function addNotification(store, userId, data) {
    if (notificationExists(store, userId, data.unique_key)) return;
    store.account_notifications.push({
        id: nextId(store, 'account_notifications'),
        user_id: Number(userId),
        type: data.type,
        unique_key: data.unique_key,
        title: data.title,
        message: data.message,
        book_id: data.book_id || null,
        read_at: null,
        created_at: now()
    });
}

function refreshNotifications(store, user) {
    const userId = Number(user.id);
    const books = new Map((store.books || []).map(book => [Number(book.id), book]));
    const todayKey = now().slice(0, 10);

    for (const rental of store.rentals || []) {
        if (Number(rental.user_id) !== userId || rental.returned_at) continue;
        const rentedAt = new Date(rental.rented_at || now());
        const dueAt = rental.due_at ? new Date(rental.due_at) : new Date(rentedAt.getTime() + 14 * 86400000);
        rental.due_at = dueAt.toISOString();
        const remaining = dueAt.getTime() - Date.now();
        const book = books.get(Number(rental.book_id));
        if (remaining < 0 && user.notification_overdue_enabled !== false) {
            addNotification(store, userId, {
                type: 'overdue',
                unique_key: `overdue:${rental.id}`,
                title: 'Аренда просрочена',
                message: `Верните книгу «${book?.title || 'Без названия'}». Срок истёк ${dueAt.toLocaleDateString('ru-RU')}.`,
                book_id: rental.book_id
            });
        } else if (remaining <= 3 * 86400000 && user.notification_due_enabled !== false) {
            addNotification(store, userId, {
                type: 'due',
                unique_key: `due:${rental.id}`,
                title: 'Срок аренды скоро закончится',
                message: `Книгу «${book?.title || 'Без названия'}» нужно вернуть до ${dueAt.toLocaleDateString('ru-RU')}.`,
                book_id: rental.book_id
            });
        }
    }

    for (const item of store.user_book_lists || []) {
        if (Number(item.user_id) !== userId || !item.wishlist) continue;
        const book = books.get(Number(item.book_id));
        if (book && Number(book.copies || 0) > 0 && user.notification_available_enabled !== false) {
            addNotification(store, userId, {
                type: 'available',
                unique_key: `available:${item.book_id}:${todayKey}`,
                title: 'Книга снова доступна',
                message: `«${book.title}» появилась в наличии.`,
                book_id: item.book_id
            });
        }
    }

    if (user.login_alerts_enabled) {
        const latest = (store.user_login_events || [])
            .filter(item => Number(item.user_id) === userId)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        if (latest) {
            addNotification(store, userId, {
                type: 'login',
                unique_key: `login:${latest.id}`,
                title: 'Вход в аккаунт',
                message: `${latest.browser || 'Браузер'} · ${latest.os || 'Неизвестная ОС'} · IP ${latest.ip_address || 'не определён'}`
            });
        }
    }
}

function getAccountNotifications(userId) {
    const store = read();
    const user = findUser(store, userId);
    if (!user) return [];
    refreshNotifications(store, user);
    write(store);
    return store.account_notifications
        .filter(item => Number(item.user_id) === Number(userId))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 100);
}

function updateNotificationPreferences(userId, prefs) {
    const store = read();
    const user = findUser(store, userId);
    if (!user) throw new Error('Account not found');
    user.notification_due_enabled = prefs.due !== false;
    user.notification_overdue_enabled = prefs.overdue !== false;
    user.notification_available_enabled = prefs.available !== false;
    user.login_alerts_enabled = Boolean(prefs.login);
    write(store);
    return mapPreferences(user).notifications;
}

function markAccountNotificationRead(userId, notificationId) {
    const store = read();
    const item = store.account_notifications.find(entry => Number(entry.id) === Number(notificationId) && Number(entry.user_id) === Number(userId));
    if (item) item.read_at = now();
    write(store);
}

function markAllAccountNotificationsRead(userId) {
    const store = read();
    for (const item of store.account_notifications) {
        if (Number(item.user_id) === Number(userId) && !item.read_at) item.read_at = now();
    }
    write(store);
}

function updatePrivacyPreferences(userId, prefs) {
    const store = read();
    const user = findUser(store, userId);
    if (!user) throw new Error('Account not found');
    user.profile_private_enabled = Boolean(prefs.privateProfile);
    user.reading_history_private_enabled = Boolean(prefs.privateHistory);
    user.comments_profile_enabled = prefs.showComments !== false;
    write(store);
    return mapPreferences(user).privacy;
}

function getAccountLibrary(userId) {
    const store = read();
    const books = new Map((store.books || []).map(book => [Number(book.id), book]));
    return store.user_book_lists
        .filter(item => Number(item.user_id) === Number(userId))
        .map(item => ({ ...item, ...(books.get(Number(item.book_id)) || {}) }))
        .filter(item => item.title)
        .sort((a, b) => new Date(b.viewed_at || b.updated_at || 0) - new Date(a.viewed_at || a.updated_at || 0));
}

function updateAccountLibrary(userId, bookId, values) {
    const store = read();
    const book = (store.books || []).find(item => Number(item.id) === Number(bookId));
    if (!book) throw new Error('Book not found');
    let item = store.user_book_lists.find(entry => Number(entry.user_id) === Number(userId) && Number(entry.book_id) === Number(bookId));
    if (!item) {
        item = { user_id: Number(userId), book_id: Number(bookId), favorite: false, wishlist: false, viewed_at: null, updated_at: now() };
        store.user_book_lists.push(item);
    }
    item.favorite = Boolean(values.favorite);
    item.wishlist = Boolean(values.wishlist);
    item.updated_at = now();
    write(store);
    return { ...item, ...book };
}

function recordAccountBookView(userId, bookId) {
    const store = read();
    const book = (store.books || []).find(item => Number(item.id) === Number(bookId));
    if (!book) return;
    let item = store.user_book_lists.find(entry => Number(entry.user_id) === Number(userId) && Number(entry.book_id) === Number(bookId));
    if (!item) {
        item = { user_id: Number(userId), book_id: Number(bookId), favorite: false, wishlist: false, viewed_at: null, updated_at: now() };
        store.user_book_lists.push(item);
    }
    item.viewed_at = now();
    item.updated_at = now();
    write(store);
}

function exportAccountData(userId) {
    const store = read();
    const user = findUser(store, userId);
    if (!user) throw new Error('Account not found');
    return {
        exportedAt: now(),
        user: publicUser(user),
        rentals: (store.rentals || []).filter(item => Number(item.user_id) === Number(userId)),
        comments: (store.comments || []).filter(item => Number(item.user_id) === Number(userId)),
        library: getAccountLibrary(userId),
        notifications: (store.account_notifications || []).filter(item => Number(item.user_id) === Number(userId)),
        loginHistory: (store.user_login_events || []).filter(item => Number(item.user_id) === Number(userId))
    };
}

function deleteOwnAccount(userId, password) {
    const store = read();
    const index = store.users.findIndex(user => Number(user.id) === Number(userId));
    const user = store.users[index];
    if (!user || !verifyPassword(password, user.password_hash)) throw new Error('Пароль указан неверно.');
    if (user.role === 'admin' && store.users.filter(item => item.role === 'admin').length <= 1) {
        const error = new Error('Нельзя удалить единственного администратора.');
        error.code = 'LAST_ADMIN';
        throw error;
    }
    store.users.splice(index, 1);
    store.rentals = (store.rentals || []).filter(item => Number(item.user_id) !== Number(userId));
    store.user_book_lists = store.user_book_lists.filter(item => Number(item.user_id) !== Number(userId));
    store.account_notifications = store.account_notifications.filter(item => Number(item.user_id) !== Number(userId));
    store.user_login_events = store.user_login_events.filter(item => Number(item.user_id) !== Number(userId));
    for (const comment of store.comments || []) {
        if (Number(comment.user_id) === Number(userId)) {
            comment.user_id = null;
            comment.username = 'Удалённый пользователь';
        }
    }
    for (const book of store.books || []) {
        if (Number(book.user_id) === Number(userId)) book.user_id = null;
    }
    write(store);
}

function getPublicAccountProfile(username) {
    const store = read();
    const user = store.users.find(item => String(item.username).toLowerCase() === String(username).toLowerCase());
    if (!user || user.profile_private_enabled) return null;
    const response = { user: { username: user.username, role: user.role, created_at: user.created_at || null } };
    if (!user.reading_history_private_enabled) response.library = getAccountLibrary(user.id).slice(0, 30);
    if (user.comments_profile_enabled !== false) {
        const books = new Map((store.books || []).map(book => [Number(book.id), book]));
        response.comments = (store.comments || [])
            .filter(comment => Number(comment.user_id) === Number(user.id))
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 20)
            .map(comment => ({ ...comment, book_title: books.get(Number(comment.book_id))?.title || 'Книга удалена' }));
    }
    return response;
}

module.exports = {
    getAuthState,
    getAccountSettings,
    changeAccountPassword,
    bumpAccountSession,
    listAccountDevices,
    getAccountNotifications,
    updateNotificationPreferences,
    markAccountNotificationRead,
    markAllAccountNotificationsRead,
    updatePrivacyPreferences,
    getAccountLibrary,
    updateAccountLibrary,
    recordAccountBookView,
    exportAccountData,
    deleteOwnAccount,
    getPublicAccountProfile
};
