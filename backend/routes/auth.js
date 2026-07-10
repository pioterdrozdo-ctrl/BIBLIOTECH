const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const localStore = require('../services/localStore');
const { hashPassword, verifyPassword } = require('../utils/passwords');
const { authMiddleware, isAdmin } = require('../middleware/auth');
const router = express.Router();

const FREEZE_UNITS = {
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
    weeks: 7 * 24 * 60 * 60 * 1000
};

function normalizeEmail(email = '') {
    return String(email).trim().toLowerCase();
}

function isValidEmail(email = '') {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

function publicUser(user) {
    return { id: user.id, username: user.username, email: user.email || null, role: user.role };
}

function getClientIp(req) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const candidates = [
        req.headers['cf-connecting-ip'],
        req.headers['x-real-ip'],
        forwarded,
        req.ip,
        req.socket?.remoteAddress
    ].filter(Boolean);
    const value = String(candidates[0] || '').replace(/^::ffff:/, '').trim();
    return value || 'unknown';
}

function parseUserAgent(userAgent = '') {
    const ua = String(userAgent || '');
    let os = 'Unknown OS';
    let device = 'Desktop';
    let platform = 'Desktop';
    let browser = 'Unknown browser';

    if (/android/i.test(ua)) {
        os = 'Android';
        device = 'Android';
        platform = /mobile/i.test(ua) ? 'Mobile' : 'Tablet';
    } else if (/iphone|ipad|ipod/i.test(ua)) {
        os = 'iOS';
        device = /ipad/i.test(ua) ? 'iPad' : 'iPhone';
        platform = /ipad/i.test(ua) ? 'Tablet' : 'Mobile';
    } else if (/windows nt/i.test(ua)) {
        os = 'Windows';
    } else if (/mac os x|macintosh/i.test(ua)) {
        os = 'macOS';
    } else if (/linux/i.test(ua)) {
        os = 'Linux';
    }

    if (/edg\//i.test(ua)) browser = 'Microsoft Edge';
    else if (/opr\//i.test(ua) || /opera/i.test(ua)) browser = 'Opera';
    else if (/firefox\//i.test(ua)) browser = 'Firefox';
    else if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) browser = 'Chrome';
    else if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) browser = 'Safari';

    return { os, device, platform, browser };
}

function getRequestMeta(req) {
    const userAgent = String(req.headers['user-agent'] || 'unknown');
    return {
        ip: getClientIp(req),
        userAgent,
        ...parseUserAgent(userAgent)
    };
}

function isFrozen(user = {}) {
    if (!user.banned_until) return false;
    const bannedUntil = new Date(user.banned_until);
    return !Number.isNaN(bannedUntil.getTime()) && bannedUntil > new Date();
}

function parseFreezeUntil(body = {}) {
    const unit = String(body.durationUnit || body.duration_unit || 'hours');
    const value = Math.max(1, Math.min(365, Number(body.durationValue || body.duration_value || 1)));
    const multiplier = FREEZE_UNITS[unit] || FREEZE_UNITS.hours;
    return new Date(Date.now() + value * multiplier);
}

async function ensureAuthSchema() {
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255)');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(80)');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_user_agent TEXT');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_device VARCHAR(80)');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_os VARCHAR(80)');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_browser VARCHAR(80)');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_until TIMESTAMP');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMP');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_by INTEGER REFERENCES users(id) ON DELETE SET NULL');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER DEFAULT 1');
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users (LOWER(email)) WHERE email IS NOT NULL');
    await pool.query(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            code_hash VARCHAR(255) NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            used_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await pool.query(`
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
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_user_login_events_user_id ON user_login_events(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_user_login_events_created_at ON user_login_events(created_at)');
}

async function recordLoginEvent(user, req) {
    const meta = getRequestMeta(req);
    await pool.query(`
        INSERT INTO user_login_events (user_id, ip_address, user_agent, device, os, browser, platform)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [user.id, meta.ip, meta.userAgent, meta.device, meta.os, meta.browser, meta.platform]);
    await pool.query(`
        UPDATE users
        SET last_login_at = CURRENT_TIMESTAMP,
            last_login_ip = $2,
            last_login_user_agent = $3,
            last_login_device = $4,
            last_login_os = $5,
            last_login_browser = $6
        WHERE id = $1
    `, [user.id, meta.ip, meta.userAgent, meta.device, meta.os, meta.browser]);
}

async function tryRecordLoginEvent(user, req) {
    try {
        await recordLoginEvent(user, req);
    } catch (error) {
        console.warn('[AUTH] login audit failed:', error.message);
    }
}

function signToken(user) {
    return jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        process.env.JWT_SECRET || 'bibliotech-dev-secret-change-me',
        { expiresIn: '7d' }
    );
}

// Регистрация
router.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const email = normalizeEmail(req.body.email);

    if (!username || !email || !isValidEmail(email) || !password || password.length < 4) {
        return res.status(400).json({ error: 'Invalid username, email or password' });
    }

    try {
        await ensureAuthSchema();
        const hashedPassword = hashPassword(password);

        const result = await pool.query(
            'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role',
            [username, email, hashedPassword, 'user']
        );

        const user = result.rows[0];
        await tryRecordLoginEvent(user, req);
        const token = signToken(user);

        res.json({ token, user: publicUser(user) });
    } catch (error) {
        if (error.code === '23505') {
            res.status(400).json({ error: 'User already exists' });
        } else {
            try {
                const user = localStore.createUser(username, password, email);
                res.json({ token: signToken(user), user });
            } catch (fallbackError) {
                const duplicate = fallbackError.code === 'DUPLICATE_USER' || fallbackError.code === 'DUPLICATE_EMAIL';
                res.status(duplicate ? 400 : 500).json({
                    error: duplicate ? 'User already exists' : 'Registration failed'
                });
            }
        }
    }
});

// Логин
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
        await ensureAuthSchema();
        const result = await pool.query(
            'SELECT id, username, email, password_hash, role, banned_until, ban_reason FROM users WHERE username = $1',
            [username]
        );

        const user = result.rows[0];
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const validPassword = verifyPassword(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (isFrozen(user)) {
            return res.status(403).json({
                error: 'Account frozen',
                message: 'Аккаунт временно заморожен',
                banned_until: user.banned_until,
                ban_reason: user.ban_reason || null
            });
        }

        await tryRecordLoginEvent(user, req);
        const token = signToken(user);

        res.json({ token, user: publicUser(user) });
    } catch (error) {
        const user = localStore.authenticateUser(username, password);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        res.json({ token: signToken(user), user });
    }
});

router.get('/users', authMiddleware, isAdmin, async (req, res) => {
    try {
        await ensureAuthSchema();
        const result = await pool.query(`
            SELECT u.id,
                   u.username,
                   u.email,
                   u.role,
                   u.created_at,
                   u.updated_at,
                   u.password_hash IS NOT NULL AS password_set,
                   u.last_login_at,
                   u.last_login_ip,
                   u.last_login_device,
                   u.last_login_os,
                   u.last_login_browser,
                   u.banned_until,
                   u.ban_reason,
                   COUNT(e.id)::integer AS login_count
            FROM users u
            LEFT JOIN user_login_events e ON e.user_id = u.id
            GROUP BY u.id
            ORDER BY u.id ASC
        `);
        const users = result.rows.map(user => ({
            id: user.id,
            username: user.username,
            email: user.email || null,
            role: user.role,
            created_at: user.created_at,
            updated_at: user.updated_at,
            password_set: Boolean(user.password_set),
            password_status: 'hidden_hash',
            last_login_at: user.last_login_at || null,
            last_login_ip: user.last_login_ip || null,
            last_login_device: user.last_login_device || null,
            last_login_os: user.last_login_os || null,
            last_login_browser: user.last_login_browser || null,
            banned_until: user.banned_until || null,
            ban_reason: user.ban_reason || null,
            frozen: isFrozen(user),
            login_count: Number(user.login_count || 0)
        }));
        res.json({ users });
    } catch (error) {
        res.json({ users: localStore.listUsersForAdmin() });
    }
});

router.get('/users/:id/detail', authMiddleware, isAdmin, async (req, res) => {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId) || userId <= 0) {
        return res.status(400).json({ error: 'Invalid user id' });
    }

    try {
        await ensureAuthSchema();
        const userResult = await pool.query(`
            SELECT id, username, email, role, created_at, updated_at,
                   last_login_at, last_login_ip, last_login_device,
                   last_login_os, last_login_browser, last_login_user_agent,
                   banned_until, ban_reason, banned_at, banned_by,
                   password_hash IS NOT NULL AS password_set
            FROM users
            WHERE id = $1
        `, [userId]);
        const user = userResult.rows[0];
        if (!user) return res.status(404).json({ error: 'User not found' });

        const loginsResult = await pool.query(`
            SELECT id, ip_address, user_agent, device, os, browser, platform, created_at
            FROM user_login_events
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 30
        `, [userId]);

        const rentalsResult = await pool.query(`
            SELECT r.id,
                   r.book_id,
                   COALESCE(b.title, 'Книга удалена') AS book_title,
                   r.rented_at,
                   r.returned_at,
                   CASE WHEN r.returned_at IS NULL THEN 'active' ELSE 'returned' END AS status
            FROM book_rentals r
            LEFT JOIN books b ON b.id = r.book_id
            WHERE r.user_id = $1
            ORDER BY r.rented_at DESC
            LIMIT 20
        `, [userId]);

        const commentsResult = await pool.query(`
            SELECT c.id,
                   c.text,
                   c.created_at,
                   c.book_id,
                   COALESCE(b.title, 'Книга удалена') AS book_title
            FROM comments c
            LEFT JOIN books b ON b.id = c.book_id
            WHERE c.user_id = $1
            ORDER BY c.created_at DESC
            LIMIT 20
        `, [userId]);

        res.json({
            user: {
                id: user.id,
                username: user.username,
                email: user.email || null,
                role: user.role,
                created_at: user.created_at,
                updated_at: user.updated_at,
                password_set: Boolean(user.password_set),
                password_status: 'hidden_hash',
                last_login_at: user.last_login_at || null,
                last_login_ip: user.last_login_ip || null,
                last_login_device: user.last_login_device || null,
                last_login_os: user.last_login_os || null,
                last_login_browser: user.last_login_browser || null,
                last_login_user_agent: user.last_login_user_agent || null,
                banned_until: user.banned_until || null,
                ban_reason: user.ban_reason || null,
                banned_at: user.banned_at || null,
                banned_by: user.banned_by || null,
                frozen: isFrozen(user)
            },
            logins: loginsResult.rows,
            rentals: rentalsResult.rows,
            comments: commentsResult.rows
        });
    } catch (error) {
        const user = localStore.listUsersForAdmin().find(item => Number(item.id) === userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ user, logins: [], rentals: [], comments: [] });
    }
});

router.post('/users/:id/freeze', authMiddleware, isAdmin, async (req, res) => {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId) || userId <= 0) return res.status(400).json({ error: 'Invalid user id' });
    if (Number(req.user.id) === userId) return res.status(400).json({ error: 'Cannot freeze yourself' });

    try {
        await ensureAuthSchema();
        const bannedUntil = parseFreezeUntil(req.body);
        const reason = String(req.body.reason || 'Заморожен администратором').trim().slice(0, 500);
        const result = await pool.query(`
            UPDATE users
            SET banned_until = $1,
                ban_reason = $2,
                banned_at = CURRENT_TIMESTAMP,
                banned_by = $3
            WHERE id = $4
            RETURNING id, username, banned_until, ban_reason, banned_at, banned_by
        `, [bannedUntil, reason, req.user.id, userId]);
        const user = result.rows[0];
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ user, message: 'User frozen' });
    } catch (error) {
        res.status(500).json({ error: 'Freeze failed' });
    }
});

router.post('/users/:id/unfreeze', authMiddleware, isAdmin, async (req, res) => {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId) || userId <= 0) return res.status(400).json({ error: 'Invalid user id' });

    try {
        await ensureAuthSchema();
        const result = await pool.query(`
            UPDATE users
            SET banned_until = NULL,
                ban_reason = NULL,
                banned_at = NULL,
                banned_by = NULL
            WHERE id = $1
            RETURNING id, username
        `, [userId]);
        const user = result.rows[0];
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ user, message: 'User unfrozen' });
    } catch (error) {
        res.status(500).json({ error: 'Unfreeze failed' });
    }
});

router.delete('/users/:id', authMiddleware, isAdmin, async (req, res) => {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId) || userId <= 0) return res.status(400).json({ error: 'Invalid user id' });
    if (Number(req.user.id) === userId) return res.status(400).json({ error: 'Cannot delete yourself' });

    try {
        await ensureAuthSchema();
        const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id, username', [userId]);
        const user = result.rows[0];
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ user, message: 'User deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Delete failed' });
    }
});

router.post('/password-reset/confirm', async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const code = String(req.body.code || '').trim();
    const password = String(req.body.password || '');
    if (!email || !isValidEmail(email) || !code || password.length < 4) {
        return res.status(400).json({ error: 'Invalid reset data' });
    }

    try {
        await ensureAuthSchema();
        const result = await pool.query(`
            SELECT t.id, t.code_hash, u.id AS user_id, u.username, u.email, u.role
            FROM password_reset_tokens t
            JOIN users u ON u.id = t.user_id
            WHERE LOWER(u.email) = LOWER($1)
              AND t.used_at IS NULL
              AND t.expires_at > CURRENT_TIMESTAMP
            ORDER BY t.created_at DESC
            LIMIT 1
        `, [email]);
        const token = result.rows[0];
        if (!token || !verifyPassword(code, token.code_hash)) {
            return res.status(400).json({ error: 'Invalid or expired code' });
        }

        await pool.query(`
            UPDATE users
            SET password_hash = $1,
                session_version = COALESCE(session_version, 1) + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
        `, [hashPassword(password), token.user_id]);
        await pool.query('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1', [token.id]);
        res.json({ message: 'Password updated' });
    } catch (error) {
        try {
            localStore.resetPasswordWithCode(email, code, password);
            res.json({ message: 'Password updated' });
        } catch (fallbackError) {
            res.status(400).json({ error: 'Invalid or expired code' });
        }
    }
});

module.exports = router;
