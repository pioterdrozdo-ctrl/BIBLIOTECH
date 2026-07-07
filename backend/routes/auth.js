const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const localStore = require('../services/localStore');
const { hashPassword, verifyPassword } = require('../utils/passwords');
const { authMiddleware, isAdmin } = require('../middleware/auth');
const router = express.Router();

const RESET_CODE_TTL_MS = 15 * 60 * 1000;

function normalizeEmail(email = '') {
    return String(email).trim().toLowerCase();
}

function isValidEmail(email = '') {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

function publicUser(user) {
    return { id: user.id, username: user.username, email: user.email || null, role: user.role };
}

async function ensureAuthSchema() {
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255)');
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
}

function createResetCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendPasswordResetEmail(email, username, code) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!apiKey || !from) return false;

    const text = `BIBLIOTECH\n\nКод восстановления для ${username}: ${code}\nКод действует 15 минут.`;
    const html = `<div style="font-family:Arial,sans-serif;line-height:1.5">
        <h2>BIBLIOTECH</h2>
        <p>Код восстановления для <b>${username}</b>:</p>
        <p style="font-size:26px;font-weight:800;letter-spacing:4px">${code}</p>
        <p>Код действует 15 минут.</p>
    </div>`;

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from,
            to: [email],
            subject: 'Код восстановления BIBLIOTECH',
            text,
            html
        })
    });

    return response.ok;
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
            'SELECT id, username, email, password_hash, role FROM users WHERE username = $1',
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
            SELECT id, username, email, role, created_at, updated_at, password_hash IS NOT NULL AS password_set
            FROM users
            ORDER BY id ASC
        `);
        const users = result.rows.map(user => ({
            id: user.id,
            username: user.username,
            email: user.email || null,
            role: user.role,
            created_at: user.created_at,
            updated_at: user.updated_at,
            password_set: Boolean(user.password_set),
            password_status: 'hidden_hash'
        }));
        res.json({ users });
    } catch (error) {
        res.json({ users: localStore.listUsersForAdmin() });
    }
});

router.post('/password-reset/request', async (req, res) => {
    const email = normalizeEmail(req.body.email);
    if (!email || !isValidEmail(email)) {
        return res.status(400).json({ error: 'Valid email is required' });
    }

    try {
        await ensureAuthSchema();
        const result = await pool.query('SELECT id, username, email FROM users WHERE LOWER(email) = LOWER($1)', [email]);
        const user = result.rows[0];
        if (!user) {
            return res.json({ message: 'If email exists, reset code was sent' });
        }

        const code = createResetCode();
        const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MS);
        await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL', [user.id]);
        await pool.query(
            'INSERT INTO password_reset_tokens (user_id, code_hash, expires_at) VALUES ($1, $2, $3)',
            [user.id, hashPassword(code), expiresAt]
        );

        const emailSent = await sendPasswordResetEmail(user.email, user.username, code);
        res.json({
            message: emailSent ? 'Reset code sent' : 'Reset code created',
            emailSent,
            devCode: process.env.NODE_ENV === 'production' || emailSent ? undefined : code
        });
    } catch (error) {
        try {
            const result = localStore.createPasswordReset(email);
            res.json({
                message: result ? 'Reset code created' : 'If email exists, reset code was sent',
                emailSent: false,
                devCode: result && process.env.NODE_ENV !== 'production' ? result.code : undefined
            });
        } catch (fallbackError) {
            res.status(500).json({ error: 'Password reset request failed' });
        }
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

        await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashPassword(password), token.user_id]);
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
