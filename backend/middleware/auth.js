const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret && process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET is required in production');
    }
    return secret || 'bibliotech-dev-secret-change-me';
}

function isFrozen(user = {}) {
    if (!user.banned_until) return false;
    const bannedUntil = new Date(user.banned_until);
    return !Number.isNaN(bannedUntil.getTime()) && bannedUntil > new Date();
}

async function readAccountAccess(userId) {
    const result = await pool.query(
        'SELECT id, role, banned_until, ban_reason FROM users WHERE id = $1',
        [userId]
    );
    return result.rows[0] || null;
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
            if (!account) {
                return res.status(403).json({ error: 'Account not found' });
            }
            if (isFrozen(account)) {
                return res.status(403).json({
                    error: 'Account frozen',
                    message: 'Аккаунт временно заморожен',
                    banned_until: account.banned_until,
                    ban_reason: account.ban_reason || null
                });
            }
            req.user.role = account.role || req.user.role;
        } catch (dbError) {
            console.warn('[AUTH] account access check failed:', dbError.message);
            if (pool.isConfigured) {
                return res.status(503).json({ error: 'Account access check unavailable' });
            }
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
            if (!account || isFrozen(account)) req.user = null;
            else req.user.role = account.role || req.user.role;
        } catch (dbError) {
            console.warn('[AUTH] optional account access check failed:', dbError.message);
            if (pool.isConfigured) req.user = null;
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