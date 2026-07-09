const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const localStore = require('../services/localStore');
const { verifyPassword } = require('../utils/passwords');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const ISSUER = 'BIBLIOTECH';

function signToken(user, rememberSession = true) {
    return jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        process.env.JWT_SECRET || 'bibliotech-dev-secret-change-me',
        { expiresIn: rememberSession ? '30d' : '7d' }
    );
}

function publicUser(user) {
    return { id: user.id, username: user.username, email: user.email || null, role: user.role };
}

function isFrozen(user = {}) {
    if (!user.banned_until) return false;
    const bannedUntil = new Date(user.banned_until);
    return !Number.isNaN(bannedUntil.getTime()) && bannedUntil > new Date();
}

function encodeBase32(buffer) {
    let bits = '';
    for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
    let output = '';
    for (let i = 0; i < bits.length; i += 5) {
        const chunk = bits.slice(i, i + 5).padEnd(5, '0');
        output += BASE32_ALPHABET[parseInt(chunk, 2)];
    }
    return output;
}

function decodeBase32(secret = '') {
    const clean = String(secret).toUpperCase().replace(/[^A-Z2-7]/g, '');
    let bits = '';
    for (const char of clean) {
        const index = BASE32_ALPHABET.indexOf(char);
        if (index >= 0) bits += index.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
        bytes.push(parseInt(bits.slice(i, i + 8), 2));
    }
    return Buffer.from(bytes);
}

function generateTotp(secret, time = Date.now(), step = 30, digits = 6) {
    const counter = Math.floor(time / 1000 / step);
    const buffer = Buffer.alloc(8);
    buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    buffer.writeUInt32BE(counter >>> 0, 4);
    const hmac = crypto.createHmac('sha1', decodeBase32(secret)).update(buffer).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const code = ((hmac[offset] & 0x7f) << 24)
        | ((hmac[offset + 1] & 0xff) << 16)
        | ((hmac[offset + 2] & 0xff) << 8)
        | (hmac[offset + 3] & 0xff);
    return String(code % (10 ** digits)).padStart(digits, '0');
}

function verifyTotp(secret, code) {
    const normalized = String(code || '').replace(/\s+/g, '');
    if (!/^\d{6}$/.test(normalized) || !secret) return false;
    const now = Date.now();
    return [-1, 0, 1].some(offset => generateTotp(secret, now + offset * 30000) === normalized);
}

function buildOtpAuthUrl(user, secret) {
    const label = `${ISSUER}:${user.username || user.email || user.id}`;
    const params = new URLSearchParams({
        secret,
        issuer: ISSUER,
        algorithm: 'SHA1',
        digits: '6',
        period: '30'
    });
    return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

function getClientIp(req) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return String(req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || forwarded || req.ip || req.socket?.remoteAddress || 'unknown').replace(/^::ffff:/, '').trim();
}

function parseUserAgent(userAgent = '') {
    const ua = String(userAgent || '');
    let os = 'Unknown OS';
    let device = 'Desktop';
    let platform = 'Desktop';
    let browser = 'Unknown browser';
    if (/android/i.test(ua)) { os = 'Android'; device = 'Android'; platform = /mobile/i.test(ua) ? 'Mobile' : 'Tablet'; }
    else if (/iphone|ipad|ipod/i.test(ua)) { os = 'iOS'; device = /ipad/i.test(ua) ? 'iPad' : 'iPhone'; platform = /ipad/i.test(ua) ? 'Tablet' : 'Mobile'; }
    else if (/windows nt/i.test(ua)) os = 'Windows';
    else if (/mac os x|macintosh/i.test(ua)) os = 'macOS';
    else if (/linux/i.test(ua)) os = 'Linux';
    if (/edg\//i.test(ua)) browser = 'Microsoft Edge';
    else if (/opr\//i.test(ua) || /opera/i.test(ua)) browser = 'Opera';
    else if (/firefox\//i.test(ua)) browser = 'Firefox';
    else if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) browser = 'Chrome';
    else if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) browser = 'Safari';
    return { os, device, platform, browser };
}

async function ensureSecuritySchema() {
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret VARCHAR(120)');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS login_alerts_enabled BOOLEAN DEFAULT FALSE');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_private_enabled BOOLEAN DEFAULT FALSE');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS remember_session_enabled BOOLEAN DEFAULT TRUE');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(80)');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_user_agent TEXT');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_device VARCHAR(80)');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_os VARCHAR(80)');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_browser VARCHAR(80)');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_until TIMESTAMP');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT');
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
}

async function recordLoginEvent(user, req) {
    const userAgent = String(req.headers['user-agent'] || 'unknown');
    const meta = { ip: getClientIp(req), userAgent, ...parseUserAgent(userAgent) };
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

function mapSecurity(row = {}) {
    return {
        twoFactorEnabled: Boolean(row.two_factor_enabled),
        loginAlertsEnabled: Boolean(row.login_alerts_enabled),
        profilePrivateEnabled: Boolean(row.profile_private_enabled),
        rememberSessionEnabled: row.remember_session_enabled !== false
    };
}

router.post('/login', async (req, res, next) => {
    const { username, password } = req.body;
    const twoFactorCode = String(req.body.twoFactorCode || req.body.two_factor_code || '').trim();
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

    try {
        await ensureSecuritySchema();
        const result = await pool.query(`
            SELECT id, username, email, password_hash, role, banned_until, ban_reason,
                   two_factor_enabled, two_factor_secret, remember_session_enabled
            FROM users
            WHERE username = $1
        `, [username]);
        const user = result.rows[0];
        if (!user || !verifyPassword(password, user.password_hash)) {
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
        if (user.two_factor_enabled) {
            if (!twoFactorCode) {
                return res.status(401).json({ error: 'Two-factor code required', twoFactorRequired: true });
            }
            if (!verifyTotp(user.two_factor_secret, twoFactorCode)) {
                return res.status(401).json({ error: 'Invalid two-factor code', twoFactorRequired: true });
            }
        }
        await recordLoginEvent(user, req).catch(error => console.warn('[SECURITY] login audit failed:', error.message));
        res.json({ token: signToken(user, user.remember_session_enabled !== false), user: publicUser(user) });
    } catch (error) {
        if (pool.isConfigured) return next(error);
        const user = localStore.authenticateUser(username, password);
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        res.json({ token: signToken(user), user });
    }
});

router.get('/security', authMiddleware, async (req, res) => {
    try {
        await ensureSecuritySchema();
        const result = await pool.query(`
            SELECT two_factor_enabled, login_alerts_enabled, profile_private_enabled, remember_session_enabled
            FROM users WHERE id = $1
        `, [req.user.id]);
        res.json({ settings: mapSecurity(result.rows[0]) });
    } catch (error) {
        res.json({ settings: mapSecurity({}) });
    }
});

router.post('/security/options', authMiddleware, async (req, res) => {
    const loginAlerts = Boolean(req.body.loginAlertsEnabled ?? req.body.login_alerts_enabled);
    const privateProfile = Boolean(req.body.profilePrivateEnabled ?? req.body.profile_private_enabled);
    const rememberSession = req.body.rememberSessionEnabled ?? req.body.remember_session_enabled;
    try {
        await ensureSecuritySchema();
        const result = await pool.query(`
            UPDATE users
            SET login_alerts_enabled = $1,
                profile_private_enabled = $2,
                remember_session_enabled = $3
            WHERE id = $4
            RETURNING two_factor_enabled, login_alerts_enabled, profile_private_enabled, remember_session_enabled
        `, [loginAlerts, privateProfile, rememberSession !== false, req.user.id]);
        res.json({ settings: mapSecurity(result.rows[0]) });
    } catch (error) {
        res.status(500).json({ error: 'Security settings update failed' });
    }
});

router.post('/security/2fa/setup', authMiddleware, async (req, res) => {
    try {
        await ensureSecuritySchema();
        const userResult = await pool.query('SELECT id, username, email FROM users WHERE id = $1', [req.user.id]);
        const user = userResult.rows[0];
        if (!user) return res.status(404).json({ error: 'User not found' });
        const secret = encodeBase32(crypto.randomBytes(20));
        await pool.query('UPDATE users SET two_factor_secret = $1 WHERE id = $2', [secret, req.user.id]);
        res.json({ secret, otpauthUrl: buildOtpAuthUrl(user, secret) });
    } catch (error) {
        res.status(500).json({ error: 'Two-factor setup failed' });
    }
});

router.post('/security/2fa/enable', authMiddleware, async (req, res) => {
    const code = String(req.body.code || '').trim();
    try {
        await ensureSecuritySchema();
        const result = await pool.query('SELECT two_factor_secret FROM users WHERE id = $1', [req.user.id]);
        const secret = result.rows[0]?.two_factor_secret;
        if (!secret || !verifyTotp(secret, code)) {
            return res.status(400).json({ error: 'Неверный код двухфакторной аутентификации' });
        }
        const updated = await pool.query(`
            UPDATE users SET two_factor_enabled = TRUE
            WHERE id = $1
            RETURNING two_factor_enabled, login_alerts_enabled, profile_private_enabled, remember_session_enabled
        `, [req.user.id]);
        res.json({ settings: mapSecurity(updated.rows[0]) });
    } catch (error) {
        res.status(500).json({ error: 'Two-factor enable failed' });
    }
});

router.post('/security/2fa/disable', authMiddleware, async (req, res) => {
    const code = String(req.body.code || '').trim();
    try {
        await ensureSecuritySchema();
        const result = await pool.query('SELECT two_factor_enabled, two_factor_secret FROM users WHERE id = $1', [req.user.id]);
        const user = result.rows[0];
        if (user?.two_factor_enabled && !verifyTotp(user.two_factor_secret, code)) {
            return res.status(400).json({ error: 'Введите текущий код 2FA, чтобы отключить защиту' });
        }
        const updated = await pool.query(`
            UPDATE users SET two_factor_enabled = FALSE, two_factor_secret = NULL
            WHERE id = $1
            RETURNING two_factor_enabled, login_alerts_enabled, profile_private_enabled, remember_session_enabled
        `, [req.user.id]);
        res.json({ settings: mapSecurity(updated.rows[0]) });
    } catch (error) {
        res.status(500).json({ error: 'Two-factor disable failed' });
    }
});

module.exports = router;
