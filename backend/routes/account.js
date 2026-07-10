const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const localStore = require('../services/registerAccountFallback');
const { authMiddleware } = require('../middleware/auth');
const { hashPassword, verifyPassword } = require('../utils/passwords');

const router = express.Router();

function jwtSecret() {
    return process.env.JWT_SECRET || 'bibliotech-dev-secret-change-me';
}

function issueToken(user, remember = true) {
    return jwt.sign({
        id: user.id,
        username: user.username,
        role: user.role,
        ver: Number(user.session_version || 1)
    }, jwtSecret(), { expiresIn: remember ? '30d' : '7d' });
}

function passwordIsStrong(password = '') {
    return String(password).length >= 8
        && /[a-zа-я]/i.test(password)
        && /\d/.test(password);
}

async function ensureAccountSchema() {
    await pool.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER DEFAULT 1;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_due_enabled BOOLEAN DEFAULT TRUE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_overdue_enabled BOOLEAN DEFAULT TRUE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_available_enabled BOOLEAN DEFAULT TRUE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS login_alerts_enabled BOOLEAN DEFAULT FALSE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_private_enabled BOOLEAN DEFAULT FALSE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS reading_history_private_enabled BOOLEAN DEFAULT FALSE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS comments_profile_enabled BOOLEAN DEFAULT TRUE;

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
        UPDATE book_rentals
        SET due_at = rented_at + INTERVAL '14 days'
        WHERE due_at IS NULL AND returned_at IS NULL;

        CREATE TABLE IF NOT EXISTS user_book_lists (
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
            favorite BOOLEAN DEFAULT FALSE,
            wishlist BOOLEAN DEFAULT FALSE,
            viewed_at TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, book_id)
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

        CREATE TABLE IF NOT EXISTS user_login_events (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            ip_address VARCHAR(80),
            user_agent TEXT,
            device VARCHAR(80),
            os VARCHAR(80),
            browser VARCHAR(80),
            platform VARCHAR(80),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_user_book_lists_user ON user_book_lists(user_id);
        CREATE INDEX IF NOT EXISTS idx_account_notifications_user ON account_notifications(user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_user_login_events_user_id ON user_login_events(user_id);
    `);
}

function mapPreferences(row = {}) {
    return {
        notifications: {
            due: row.notification_due_enabled !== false,
            overdue: row.notification_overdue_enabled !== false,
            available: row.notification_available_enabled !== false,
            login: Boolean(row.login_alerts_enabled)
        },
        privacy: {
            privateProfile: Boolean(row.profile_private_enabled),
            privateHistory: Boolean(row.reading_history_private_enabled),
            showComments: row.comments_profile_enabled !== false
        }
    };
}

async function refreshNotifications(userId) {
    const params = [userId];

    await pool.query(`
        INSERT INTO account_notifications (user_id, type, unique_key, title, message, book_id)
        SELECT r.user_id,
               'due',
               'due:' || r.id,
               'Срок аренды скоро закончится',
               'Книгу «' || COALESCE(b.title, 'Без названия') || '» нужно вернуть до ' || TO_CHAR(r.due_at, 'DD.MM.YYYY') || '.',
               r.book_id
        FROM book_rentals r
        JOIN users u ON u.id = r.user_id
        LEFT JOIN books b ON b.id = r.book_id
        WHERE r.user_id = $1
          AND r.returned_at IS NULL
          AND r.due_at BETWEEN CURRENT_TIMESTAMP AND CURRENT_TIMESTAMP + INTERVAL '3 days'
          AND u.notification_due_enabled = TRUE
        ON CONFLICT (user_id, unique_key) DO NOTHING
    `, params);

    await pool.query(`
        INSERT INTO account_notifications (user_id, type, unique_key, title, message, book_id)
        SELECT r.user_id,
               'overdue',
               'overdue:' || r.id,
               'Аренда просрочена',
               'Верните книгу «' || COALESCE(b.title, 'Без названия') || '». Срок истёк ' || TO_CHAR(r.due_at, 'DD.MM.YYYY') || '.',
               r.book_id
        FROM book_rentals r
        JOIN users u ON u.id = r.user_id
        LEFT JOIN books b ON b.id = r.book_id
        WHERE r.user_id = $1
          AND r.returned_at IS NULL
          AND r.due_at < CURRENT_TIMESTAMP
          AND u.notification_overdue_enabled = TRUE
        ON CONFLICT (user_id, unique_key) DO NOTHING
    `, params);

    await pool.query(`
        INSERT INTO account_notifications (user_id, type, unique_key, title, message, book_id)
        SELECT l.user_id,
               'available',
               'available:' || l.book_id || ':' || TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD'),
               'Книга снова доступна',
               '«' || COALESCE(b.title, 'Без названия') || '» появилась в наличии.',
               l.book_id
        FROM user_book_lists l
        JOIN users u ON u.id = l.user_id
        JOIN books b ON b.id = l.book_id
        WHERE l.user_id = $1
          AND l.wishlist = TRUE
          AND b.copies > 0
          AND u.notification_available_enabled = TRUE
        ON CONFLICT (user_id, unique_key) DO NOTHING
    `, params);

    await pool.query(`
        INSERT INTO account_notifications (user_id, type, unique_key, title, message)
        SELECT e.user_id,
               'login',
               'login:' || e.id,
               'Вход в аккаунт',
               COALESCE(e.browser, 'Браузер') || ' · ' || COALESCE(e.os, 'Неизвестная ОС') || ' · IP ' || COALESCE(e.ip_address, 'не определён')
        FROM user_login_events e
        JOIN users u ON u.id = e.user_id
        WHERE e.user_id = $1 AND u.login_alerts_enabled = TRUE
        ORDER BY e.created_at DESC
        LIMIT 5
        ON CONFLICT (user_id, unique_key) DO NOTHING
    `, params);
}

router.get('/', authMiddleware, async (req, res) => {
    try {
        await ensureAccountSchema();
        const result = await pool.query(`
            SELECT id, username, email, role, created_at,
                   notification_due_enabled, notification_overdue_enabled,
                   notification_available_enabled, login_alerts_enabled,
                   profile_private_enabled, reading_history_private_enabled,
                   comments_profile_enabled
            FROM users WHERE id = $1
        `, [req.user.id]);
        const user = result.rows[0];
        if (!user) return res.status(404).json({ error: 'Account not found' });
        res.json({
            user: { id: user.id, username: user.username, email: user.email || null, role: user.role, created_at: user.created_at },
            ...mapPreferences(user)
        });
    } catch (error) {
        const data = localStore.getAccountSettings(req.user.id);
        if (!data) return res.status(404).json({ error: 'Account not found' });
        res.json(data);
    }
});

router.post('/password', authMiddleware, async (req, res) => {
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');
    if (!currentPassword || !passwordIsStrong(newPassword)) {
        return res.status(400).json({ error: 'Новый пароль должен содержать минимум 8 символов и цифру.' });
    }

    try {
        await ensureAccountSchema();
        const result = await pool.query('SELECT id, username, role, password_hash, session_version, remember_session_enabled FROM users WHERE id = $1', [req.user.id]);
        const user = result.rows[0];
        if (!user || !verifyPassword(currentPassword, user.password_hash)) {
            return res.status(400).json({ error: 'Текущий пароль указан неверно.' });
        }
        const updated = await pool.query(`
            UPDATE users
            SET password_hash = $1,
                session_version = COALESCE(session_version, 1) + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING id, username, role, session_version, remember_session_enabled
        `, [hashPassword(newPassword), req.user.id]);
        const account = updated.rows[0];
        res.json({ message: 'Пароль изменён. Остальные сеансы завершены.', token: issueToken(account, account.remember_session_enabled !== false) });
    } catch (error) {
        try {
            const account = localStore.changeAccountPassword(req.user.id, currentPassword, newPassword);
            res.json({ message: 'Пароль изменён. Остальные сеансы завершены.', token: issueToken(account, account.remember_session_enabled !== false) });
        } catch (fallbackError) {
            res.status(400).json({ error: fallbackError.message || 'Не удалось изменить пароль.' });
        }
    }
});

router.get('/devices', authMiddleware, async (req, res) => {
    try {
        await ensureAccountSchema();
        const result = await pool.query(`
            SELECT id, ip_address, device, os, browser, platform, user_agent, created_at
            FROM user_login_events
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 30
        `, [req.user.id]);
        const currentAgent = String(req.headers['user-agent'] || '');
        let currentMarked = false;
        const devices = result.rows.map(row => {
            const current = !currentMarked && currentAgent && row.user_agent === currentAgent;
            if (current) currentMarked = true;
            return { ...row, current };
        });
        res.json({ devices });
    } catch (error) {
        res.json({ devices: localStore.listAccountDevices(req.user.id, String(req.headers['user-agent'] || '')) });
    }
});

router.post('/devices/logout-others', authMiddleware, async (req, res) => {
    try {
        await ensureAccountSchema();
        const result = await pool.query(`
            UPDATE users
            SET session_version = COALESCE(session_version, 1) + 1
            WHERE id = $1
            RETURNING id, username, role, session_version, remember_session_enabled
        `, [req.user.id]);
        const user = result.rows[0];
        res.json({ message: 'Другие устройства отключены.', token: issueToken(user, user.remember_session_enabled !== false) });
    } catch (error) {
        const user = localStore.bumpAccountSession(req.user.id);
        res.json({ message: 'Другие устройства отключены.', token: issueToken(user, user.remember_session_enabled !== false) });
    }
});

router.get('/notifications', authMiddleware, async (req, res) => {
    try {
        await ensureAccountSchema();
        await refreshNotifications(req.user.id);
        const result = await pool.query(`
            SELECT id, type, title, message, book_id, read_at, created_at
            FROM account_notifications
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 100
        `, [req.user.id]);
        res.json({ notifications: result.rows, unread: result.rows.filter(item => !item.read_at).length });
    } catch (error) {
        const notifications = localStore.getAccountNotifications(req.user.id);
        res.json({ notifications, unread: notifications.filter(item => !item.read_at).length });
    }
});

router.post('/notifications/preferences', authMiddleware, async (req, res) => {
    const due = req.body.due !== false;
    const overdue = req.body.overdue !== false;
    const available = req.body.available !== false;
    const login = Boolean(req.body.login);
    try {
        await ensureAccountSchema();
        const result = await pool.query(`
            UPDATE users
            SET notification_due_enabled = $1,
                notification_overdue_enabled = $2,
                notification_available_enabled = $3,
                login_alerts_enabled = $4
            WHERE id = $5
            RETURNING *
        `, [due, overdue, available, login, req.user.id]);
        res.json(mapPreferences(result.rows[0]).notifications);
    } catch (error) {
        res.json(localStore.updateNotificationPreferences(req.user.id, { due, overdue, available, login }));
    }
});

router.post('/notifications/:id/read', authMiddleware, async (req, res) => {
    try {
        await ensureAccountSchema();
        await pool.query('UPDATE account_notifications SET read_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        res.json({ ok: true });
    } catch (error) {
        localStore.markAccountNotificationRead(req.user.id, req.params.id);
        res.json({ ok: true });
    }
});

router.post('/notifications/read-all', authMiddleware, async (req, res) => {
    try {
        await ensureAccountSchema();
        await pool.query('UPDATE account_notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND read_at IS NULL', [req.user.id]);
        res.json({ ok: true });
    } catch (error) {
        localStore.markAllAccountNotificationsRead(req.user.id);
        res.json({ ok: true });
    }
});

router.post('/privacy', authMiddleware, async (req, res) => {
    const privateProfile = Boolean(req.body.privateProfile);
    const privateHistory = Boolean(req.body.privateHistory);
    const showComments = req.body.showComments !== false;
    try {
        await ensureAccountSchema();
        const result = await pool.query(`
            UPDATE users
            SET profile_private_enabled = $1,
                reading_history_private_enabled = $2,
                comments_profile_enabled = $3
            WHERE id = $4
            RETURNING *
        `, [privateProfile, privateHistory, showComments, req.user.id]);
        res.json(mapPreferences(result.rows[0]).privacy);
    } catch (error) {
        res.json(localStore.updatePrivacyPreferences(req.user.id, { privateProfile, privateHistory, showComments }));
    }
});

router.get('/library', authMiddleware, async (req, res) => {
    try {
        await ensureAccountSchema();
        const result = await pool.query(`
            SELECT l.book_id, l.favorite, l.wishlist, l.viewed_at, l.updated_at,
                   b.title, b.author, b.cover_data_url, b.copies, b.available
            FROM user_book_lists l
            JOIN books b ON b.id = l.book_id
            WHERE l.user_id = $1
            ORDER BY COALESCE(l.viewed_at, l.updated_at) DESC
        `, [req.user.id]);
        res.json({ items: result.rows });
    } catch (error) {
        res.json({ items: localStore.getAccountLibrary(req.user.id) });
    }
});

router.put('/library/:bookId', authMiddleware, async (req, res) => {
    const favorite = Boolean(req.body.favorite);
    const wishlist = Boolean(req.body.wishlist);
    try {
        await ensureAccountSchema();
        const result = await pool.query(`
            INSERT INTO user_book_lists (user_id, book_id, favorite, wishlist, updated_at)
            SELECT $1, b.id, $3, $4, CURRENT_TIMESTAMP
            FROM books b WHERE b.id = $2
            ON CONFLICT (user_id, book_id)
            DO UPDATE SET favorite = EXCLUDED.favorite,
                          wishlist = EXCLUDED.wishlist,
                          updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `, [req.user.id, req.params.bookId, favorite, wishlist]);
        if (!result.rows.length) return res.status(404).json({ error: 'Book not found' });
        res.json({ item: result.rows[0] });
    } catch (error) {
        try {
            res.json({ item: localStore.updateAccountLibrary(req.user.id, req.params.bookId, { favorite, wishlist }) });
        } catch (fallbackError) {
            res.status(404).json({ error: 'Book not found' });
        }
    }
});

router.post('/library/:bookId/viewed', authMiddleware, async (req, res) => {
    try {
        await ensureAccountSchema();
        const result = await pool.query(`
            INSERT INTO user_book_lists (user_id, book_id, viewed_at, updated_at)
            SELECT $1, b.id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            FROM books b WHERE b.id = $2
            ON CONFLICT (user_id, book_id)
            DO UPDATE SET viewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            RETURNING book_id
        `, [req.user.id, req.params.bookId]);
        if (!result.rows.length) return res.status(404).json({ error: 'Book not found' });
        res.json({ ok: true });
    } catch (error) {
        localStore.recordAccountBookView(req.user.id, req.params.bookId);
        res.json({ ok: true });
    }
});

router.get('/export', authMiddleware, async (req, res) => {
    try {
        await ensureAccountSchema();
        const [user, rentals, comments, library, notifications, logins] = await Promise.all([
            pool.query('SELECT id, username, email, role, created_at, updated_at FROM users WHERE id = $1', [req.user.id]),
            pool.query('SELECT * FROM book_rentals WHERE user_id = $1 ORDER BY rented_at DESC', [req.user.id]),
            pool.query('SELECT id, text, book_id, created_at FROM comments WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]),
            pool.query('SELECT * FROM user_book_lists WHERE user_id = $1 ORDER BY updated_at DESC', [req.user.id]),
            pool.query('SELECT type, title, message, book_id, read_at, created_at FROM account_notifications WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]),
            pool.query('SELECT ip_address, device, os, browser, platform, created_at FROM user_login_events WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id])
        ]);
        res.json({ exportedAt: new Date().toISOString(), user: user.rows[0], rentals: rentals.rows, comments: comments.rows, library: library.rows, notifications: notifications.rows, loginHistory: logins.rows });
    } catch (error) {
        res.json(localStore.exportAccountData(req.user.id));
    }
});

router.delete('/', authMiddleware, async (req, res) => {
    const password = String(req.body.password || '');
    if (!password) return res.status(400).json({ error: 'Введите пароль.' });
    try {
        await ensureAccountSchema();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await client.query('SELECT id, role, password_hash FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
            const user = result.rows[0];
            if (!user || !verifyPassword(password, user.password_hash)) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Пароль указан неверно.' });
            }
            if (user.role === 'admin') {
                const admins = await client.query("SELECT COUNT(*)::integer AS count FROM users WHERE role = 'admin'");
                if (Number(admins.rows[0].count) <= 1) {
                    await client.query('ROLLBACK');
                    return res.status(409).json({ error: 'Нельзя удалить единственного администратора.' });
                }
            }
            await client.query('UPDATE books SET user_id = NULL WHERE user_id = $1', [req.user.id]).catch(() => null);
            await client.query("UPDATE comments SET user_id = NULL, username = 'Удалённый пользователь' WHERE user_id = $1", [req.user.id]).catch(() => null);
            await client.query('DELETE FROM users WHERE id = $1', [req.user.id]);
            await client.query('COMMIT');
            res.json({ ok: true });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        try {
            localStore.deleteOwnAccount(req.user.id, password);
            res.json({ ok: true });
        } catch (fallbackError) {
            res.status(fallbackError.code === 'LAST_ADMIN' ? 409 : 400).json({ error: fallbackError.message || 'Не удалось удалить аккаунт.' });
        }
    }
});

router.get('/public/:username', async (req, res) => {
    try {
        await ensureAccountSchema();
        const result = await pool.query(`
            SELECT id, username, role, created_at, profile_private_enabled,
                   reading_history_private_enabled, comments_profile_enabled
            FROM users WHERE LOWER(username) = LOWER($1)
        `, [req.params.username]);
        const user = result.rows[0];
        if (!user || user.profile_private_enabled) return res.status(404).json({ error: 'Profile not available' });
        const response = { user: { username: user.username, role: user.role, created_at: user.created_at } };
        if (!user.reading_history_private_enabled) {
            const books = await pool.query(`
                SELECT b.id, b.title, b.author, l.favorite, l.wishlist, l.viewed_at
                FROM user_book_lists l JOIN books b ON b.id = l.book_id
                WHERE l.user_id = $1 AND (l.favorite = TRUE OR l.wishlist = TRUE OR l.viewed_at IS NOT NULL)
                ORDER BY COALESCE(l.viewed_at, l.updated_at) DESC LIMIT 30
            `, [user.id]);
            response.library = books.rows;
        }
        if (user.comments_profile_enabled) {
            const comments = await pool.query(`
                SELECT c.text, c.created_at, b.id AS book_id, b.title AS book_title
                FROM comments c LEFT JOIN books b ON b.id = c.book_id
                WHERE c.user_id = $1 ORDER BY c.created_at DESC LIMIT 20
            `, [user.id]);
            response.comments = comments.rows;
        }
        res.json(response);
    } catch (error) {
        const profile = localStore.getPublicAccountProfile(req.params.username);
        if (!profile) return res.status(404).json({ error: 'Profile not available' });
        res.json(profile);
    }
});

module.exports = router;
