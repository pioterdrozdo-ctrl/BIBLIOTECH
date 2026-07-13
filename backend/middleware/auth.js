const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const localAccountStore = require('../services/localAccountStore');

let missingJwtWarningShown = false;

function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret && process.env.NODE_ENV === 'production' && !missingJwtWarningShown) {
        missingJwtWarningShown = true;
        console.warn('[AUTH] JWT_SECRET is not set. Using fallback secret temporarily; set JWT_SECRET in Render as soon as possible.');
    }
    return secret || 'bibliotech-dev-secret-change-me';
}

function isFrozen(user = {}) {
    if (!user.banned_until) return false;
    const bannedUntil = new Date(user.banned_until);
    return !Number.isNaN(bannedUntil.getTime()) && bannedUntil > new Date();
}

function sessionMatches(decoded, account = {}) {
    const tokenVersion = Number(decoded.ver || 1);
    const accountVersion = Number(account.session_version || 1);
    return tokenVersion === accountVersion;
}

async function readAccountAccess(userId) {
    if (!pool.isConfigured) return localAccountStore.getAuthState(userId);

    const query = 'SELECT id, role, banned_until, ban_reason, COALESCE(session_version, 1) AS session_version FROM users WHERE id = $1';
    try {
        const result = await pool.query(query, [userId]);
        return result.rows[0] || null;
    } catch (error) {
        if (error.code !== '42703') throw error;
        await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER DEFAULT 1');
        const result = await pool.query(query, [userId]);
        return result.rows[0] || null;
    }
}

function sessionExpired(res) {
    return res.status(403).json({
        error: 'Session expired',
        code: 'SESSION_EXPIRED',
        message: 'Сеанс завершён. Войдите в аккаунт снова.'
    });
}

const authMiddleware = async (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, getJwtSecret());
        req.user = decoded;

        try {
            const account = await readAccountAccess(decoded.id);
            if (!account) return res.status(403).json({ error: 'Account not found' });
            if (!sessionMatches(decoded, account)) return sessionExpired(res);
            if (isFrozen(account)) {
                return res.status(403).json({
                    error: 'Account frozen',
                    message: 'Аккаунт временно заморожен',
                    banned_until: account.banned_until,
                    ban_reason: account.ban_reason || null
                });
            }
            req.user.role = account.role || req.user.role;
            req.user.ver = Number(account.session_version || 1);
        } catch (dbError) {
            console.warn('[AUTH] account access check failed:', dbError.message);
            if (pool.isConfigured) return res.status(503).json({ error: 'Account access check unavailable' });
            const account = localAccountStore.getAuthState(decoded.id);
            if (!account) return res.status(403).json({ error: 'Account not found' });
            if (!sessionMatches(decoded, account)) return sessionExpired(res);
            req.user.role = account.role || req.user.role;
            req.user.ver = Number(account.session_version || 1);
        }

        next();
    } catch (error) {
        return res.status(403).json({ error: 'Invalid token' });
    }
};

const optionalAuthMiddleware = async (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return next();

    try {
        const decoded = jwt.verify(token, getJwtSecret());
        req.user = decoded;
        try {
            const account = await readAccountAccess(decoded.id);
            if (!account || isFrozen(account) || !sessionMatches(decoded, account)) req.user = null;
            else {
                req.user.role = account.role || req.user.role;
                req.user.ver = Number(account.session_version || 1);
            }
        } catch (dbError) {
            console.warn('[AUTH] optional account access check failed:', dbError.message);
            if (pool.isConfigured) req.user = null;
            else {
                const account = localAccountStore.getAuthState(decoded.id);
                if (!account || !sessionMatches(decoded, account)) req.user = null;
                else {
                    req.user.role = account.role || req.user.role;
                    req.user.ver = Number(account.session_version || 1);
                }
            }
        }
    } catch (error) {
        req.user = null;
    }
    next();
};

const isAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

module.exports = { authMiddleware, optionalAuthMiddleware, isAdmin };
