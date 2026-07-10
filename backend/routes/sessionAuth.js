const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const localStore = require('../services/registerAccountFallback');
const { verifyPassword } = require('../utils/passwords');

const router = express.Router();
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

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

function publicUser(user) {
    return { id: user.id, username: user.username, email: user.email || null, role: user.role };
}

function isFrozen(user = {}) {
    if (!user.banned_until) return false;
    const until = new Date(user.banned_until);
    return !Number.isNaN(until.getTime()) && until > new Date();
}

function decodeBase32(secret = '') {
    const clean = String(secret).toUpperCase().replace(/[^A-Z2-7]/g, '');
    let bits = '';
    for (const char of clean) {
        const index = BASE32_ALPHABET.indexOf(char);
        if (index >= 0) bits += index.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
    return Buffer.from(bytes);
}

function generateTotp(secret, time = Date.now()) {
    const counter = Math.floor(time / 1000 / 30);
    const buffer = Buffer.alloc(8);
    buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    buffer.writeUInt32BE(counter >>> 0, 4);
    const hmac = crypto.createHmac('sha1', decodeBase32(secret)).update(buffer).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const code = ((hmac[offset] & 0x7f) << 24)
        | ((hmac[offset + 1] & 0xff) << 16)
        | ((hmac[offset + 2] & 0xff) << 8)
        | (hmac[offset + 3] & 0xff);
    return String(code % 1000000).padStart(6, '0');
}

function verifyTotp(secret, code) {
    const normalized = String(code || '').replace(/\s+/g, '');
    if (!/^\d{6}$/.test(normalized) || !secret) return false;
    return [-1, 0, 1].some(offset => generateTotp(secret, Date.now() + offset * 30000) === normalized);
}

function getClientIp(req) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return String(req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || forwarded || req.ip || req.socket?.remoteAddress || 'unknown')
        .replace(/^::ffff:/, '').trim();
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

async function ensureSchema() {
    await pool.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER DEFAULT 1;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret VARCHAR(120);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS remember_session_enabled BOOLEAN DEFAULT TRUE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_until TIMESTAMP;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT;
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
    `);
}

async function recordLogin(user, req) {
    const userAgent = String(req.headers['user-agent'] || 'unknown');
    const meta = { ip: getClientIp(req), userAgent, ...parseUserAgent(userAgent) };
    await pool.query(`
        INSERT INTO user_login_events (user_id, ip_address, user_agent, device, os, browser, platform)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [user.id, meta.ip, meta.userAgent, meta.device, meta.os, meta.browser, meta.platform]);
}

router.post('/login', async (req, res) => {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const twoFactorCode = String(req.body.twoFactorCode || req.body.two_factor_code || '').trim();
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

    try {
        await ensureSchema();
        const result = await pool.query(`
            SELECT id, username, email, password_hash, role, banned_until, ban_reason,
                   two_factor_enabled, two_factor_secret, remember_session_enabled,
                   COALESCE(session_version, 1) AS session_version
            FROM users WHERE username = $1
        `, [username]);
        const user = result.rows[0];
        if (!user || !verifyPassword(password, user.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
        if (isFrozen(user)) {
            return res.status(403).json({
                error: 'Account frozen',
                message: 'Аккаунт временно заморожен',
                banned_until: user.banned_until,
                ban_reason: user.ban_reason || null
            });
        }
        if (user.two_factor_enabled) {
            if (!twoFactorCode) return res.status(401).json({ error: 'Two-factor code required', twoFactorRequired: true });
            if (!verifyTotp(user.two_factor_secret, twoFactorCode)) {
                return res.status(401).json({ error: 'Invalid two-factor code', twoFactorRequired: true });
            }
        }
        await recordLogin(user, req).catch(error => console.warn('[AUTH] login audit failed:', error.message));
        res.json({ token: issueToken(user, user.remember_session_enabled !== false), user: publicUser(user) });
    } catch (error) {
        if (pool.isConfigured) {
            console.error('[AUTH] PostgreSQL login failed:', error.message);
            return res.status(503).json({ error: 'Authentication storage unavailable' });
        }
        const authenticated = localStore.authenticateUser(username, password);
        if (!authenticated) return res.status(401).json({ error: 'Invalid credentials' });
        const account = localStore.getAuthState(authenticated.id) || { ...authenticated, session_version: 1, remember_session_enabled: true };
        res.json({ token: issueToken(account, account.remember_session_enabled !== false), user: publicUser(account) });
    }
});

module.exports = router;
