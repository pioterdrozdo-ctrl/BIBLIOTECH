'use strict';

const express = require('express');
const crypto = require('crypto');
const pool = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');
const localPasskeys = require('../services/localPasskeyStore');
const sessionAuth = require('./sessionAuth');

const router = express.Router();
let simpleWebAuthnPromise;

function simpleWebAuthn() {
    if (!simpleWebAuthnPromise) simpleWebAuthnPromise = import('@simplewebauthn/server');
    return simpleWebAuthnPromise;
}

async function ensureSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS passkey_credentials (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            credential_id TEXT UNIQUE NOT NULL,
            public_key BYTEA NOT NULL,
            webauthn_user_id TEXT NOT NULL,
            counter BIGINT NOT NULL DEFAULT 0,
            transports JSONB NOT NULL DEFAULT '[]'::jsonb,
            device_type VARCHAR(32),
            backed_up BOOLEAN NOT NULL DEFAULT FALSE,
            name VARCHAR(100) NOT NULL DEFAULT 'Passkey',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_used_at TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS passkey_challenges (
            flow_id VARCHAR(80) PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            purpose VARCHAR(20) NOT NULL,
            challenge TEXT NOT NULL,
            webauthn_user_id TEXT,
            origin TEXT NOT NULL,
            rp_id VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_passkey_credentials_user ON passkey_credentials(user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_passkey_challenges_expiry ON passkey_challenges(expires_at);
        DELETE FROM passkey_challenges WHERE expires_at <= CURRENT_TIMESTAMP;
    `);
}

function passkeyConfig(req) {
    const requestOrigin = String(req.get('origin') || '').replace(/\/$/, '');
    const serverOrigin = `${req.protocol}://${req.get('host')}`.replace(/\/$/, '');
    let origin = String(process.env.PASSKEY_ORIGIN || requestOrigin || serverOrigin).replace(/\/$/, '');
    try {
        if (!process.env.PASSKEY_ORIGIN && new URL(origin).host !== req.get('host')) origin = serverOrigin;
    } catch {
        origin = serverOrigin;
    }
    const rpId = String(process.env.PASSKEY_RP_ID || new URL(origin).hostname).trim();
    return { origin, rpId, rpName: 'BIBLIOTECH' };
}

function stableWebAuthnUserId(userId) {
    return new Uint8Array(crypto.createHash('sha256').update(`bibliotech-passkey-user:${userId}`).digest().subarray(0, 32));
}

function mapCredential(row = {}) {
    return {
        id: Number(row.id),
        credentialId: row.credential_id,
        name: row.name || 'Passkey',
        deviceType: row.device_type || 'singleDevice',
        backedUp: Boolean(row.backed_up),
        transports: Array.isArray(row.transports) ? row.transports : [],
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at || null
    };
}

function rawPublicKey(row = {}) {
    if (Buffer.isBuffer(row.public_key)) return new Uint8Array(row.public_key);
    return new Uint8Array(Buffer.from(String(row.public_key || ''), 'base64url'));
}

async function getUserById(userId) {
    try {
        const result = await pool.query(`
            SELECT id, username, email, role, banned_until, ban_reason,
                   remember_session_enabled, COALESCE(session_version, 1) AS session_version
            FROM users WHERE id = $1
        `, [userId]);
        return result.rows[0] || null;
    } catch (error) {
        if (pool.isConfigured) throw error;
        return localPasskeys.getUserById(userId);
    }
}

async function getUserByUsername(username) {
    try {
        const result = await pool.query(`
            SELECT id, username, email, role, banned_until, ban_reason,
                   remember_session_enabled, COALESCE(session_version, 1) AS session_version
            FROM users WHERE LOWER(username) = LOWER($1)
        `, [username]);
        return result.rows[0] || null;
    } catch (error) {
        if (pool.isConfigured) throw error;
        return localPasskeys.getUserByUsername(username);
    }
}

async function listUserCredentials(userId) {
    try {
        await ensureSchema();
        const result = await pool.query('SELECT * FROM passkey_credentials WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
        return result.rows;
    } catch (error) {
        if (pool.isConfigured) throw error;
        return localPasskeys.listCredentials(userId);
    }
}

async function findCredential(credentialId, userId = null) {
    try {
        await ensureSchema();
        const result = await pool.query(`
            SELECT * FROM passkey_credentials
            WHERE credential_id = $1 AND ($2::integer IS NULL OR user_id = $2)
            LIMIT 1
        `, [credentialId, userId || null]);
        return result.rows[0] || null;
    } catch (error) {
        if (pool.isConfigured) throw error;
        return localPasskeys.findCredential(credentialId, userId);
    }
}

async function saveChallenge(data) {
    try {
        await ensureSchema();
        await pool.query(`
            INSERT INTO passkey_challenges
                (flow_id, user_id, purpose, challenge, webauthn_user_id, origin, rp_id, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP + INTERVAL '5 minutes')
        `, [data.flowId, data.userId || null, data.purpose, data.challenge, data.webauthnUserId || null, data.origin, data.rpId]);
    } catch (error) {
        if (pool.isConfigured) throw error;
        localPasskeys.saveChallenge(data);
    }
}

async function consumeChallenge(flowId, purpose) {
    try {
        await ensureSchema();
        const result = await pool.query(`
            DELETE FROM passkey_challenges
            WHERE flow_id = $1 AND purpose = $2 AND expires_at > CURRENT_TIMESTAMP
            RETURNING *
        `, [flowId, purpose]);
        return result.rows[0] || null;
    } catch (error) {
        if (pool.isConfigured) throw error;
        return localPasskeys.consumeChallenge(flowId, purpose);
    }
}

async function storeCredential(data) {
    try {
        await ensureSchema();
        const result = await pool.query(`
            INSERT INTO passkey_credentials
                (user_id, credential_id, public_key, webauthn_user_id, counter, transports, device_type, backed_up, name)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
            RETURNING *
        `, [data.userId, data.credentialId, Buffer.from(data.publicKey), data.webauthnUserId,
            data.counter, JSON.stringify(data.transports || []), data.deviceType, data.backedUp, data.name]);
        return result.rows[0];
    } catch (error) {
        if (pool.isConfigured || error.code === '23505') throw error;
        return localPasskeys.saveCredential({
            ...data,
            publicKey: Buffer.from(data.publicKey).toString('base64url')
        });
    }
}

async function updateCredentialCounter(credentialId, counter) {
    try {
        await pool.query(`
            UPDATE passkey_credentials
            SET counter = $2, last_used_at = CURRENT_TIMESTAMP
            WHERE credential_id = $1
        `, [credentialId, counter]);
    } catch (error) {
        if (pool.isConfigured) throw error;
        localPasskeys.updateCounter(credentialId, counter);
    }
}

router.get('/passkeys', authMiddleware, async (req, res) => {
    try {
        const credentials = await listUserCredentials(req.user.id);
        res.json({ supported: true, passkeys: credentials.map(mapCredential) });
    } catch (error) {
        console.error('[PASSKEY] list:', error);
        res.status(500).json({ error: 'Не удалось загрузить passkey' });
    }
});

router.post('/passkeys/register/options', authMiddleware, async (req, res) => {
    try {
        const user = await getUserById(req.user.id);
        if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
        const credentials = await listUserCredentials(user.id);
        const { generateRegistrationOptions } = await simpleWebAuthn();
        const config = passkeyConfig(req);
        const options = await generateRegistrationOptions({
            rpName: config.rpName,
            rpID: config.rpId,
            userID: stableWebAuthnUserId(user.id),
            userName: user.username,
            userDisplayName: user.username,
            attestationType: 'none',
            supportedAlgorithmIDs: [-7, -257],
            excludeCredentials: credentials.map(credential => ({
                id: credential.credential_id,
                transports: Array.isArray(credential.transports) ? credential.transports : []
            })),
            authenticatorSelection: {
                residentKey: 'required',
                userVerification: 'required',
                authenticatorAttachment: 'platform'
            }
        });
        const flowId = crypto.randomUUID();
        await saveChallenge({
            flowId,
            userId: user.id,
            purpose: 'register',
            challenge: options.challenge,
            webauthnUserId: options.user.id,
            origin: config.origin,
            rpId: config.rpId
        });
        res.json({ flowId, options });
    } catch (error) {
        console.error('[PASSKEY] registration options:', error);
        res.status(500).json({ error: 'Не удалось начать регистрацию passkey' });
    }
});

router.post('/passkeys/register/verify', authMiddleware, async (req, res) => {
    try {
        const flow = await consumeChallenge(String(req.body.flowId || ''), 'register');
        if (!flow || Number(flow.user_id) !== Number(req.user.id)) return res.status(400).json({ error: 'Запрос passkey истёк. Начните заново.' });
        const { verifyRegistrationResponse } = await simpleWebAuthn();
        const verification = await verifyRegistrationResponse({
            response: req.body.credential,
            expectedChallenge: flow.challenge,
            expectedOrigin: flow.origin,
            expectedRPID: flow.rp_id,
            requireUserVerification: true
        });
        if (!verification.verified || !verification.registrationInfo) return res.status(400).json({ error: 'Passkey не подтверждён' });
        const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
        const stored = await storeCredential({
            userId: req.user.id,
            credentialId: credential.id,
            publicKey: credential.publicKey,
            webauthnUserId: flow.webauthn_user_id,
            counter: credential.counter,
            transports: credential.transports || req.body.credential?.response?.transports || [],
            deviceType: credentialDeviceType,
            backedUp: credentialBackedUp,
            name: String(req.body.name || 'Это устройство').trim().slice(0, 100)
        });
        res.status(201).json({ verified: true, passkey: mapCredential(stored) });
    } catch (error) {
        console.error('[PASSKEY] registration verify:', error);
        const duplicate = error.code === '23505' || error.code === 'DUPLICATE_PASSKEY';
        res.status(duplicate ? 409 : 400).json({ error: duplicate ? 'Этот passkey уже зарегистрирован' : 'Не удалось подтвердить passkey' });
    }
});

router.delete('/passkeys/:id', authMiddleware, async (req, res) => {
    try {
        let deleted;
        try {
            await ensureSchema();
            const result = await pool.query('DELETE FROM passkey_credentials WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);
            deleted = Boolean(result.rows.length);
        } catch (error) {
            if (pool.isConfigured) throw error;
            deleted = localPasskeys.deleteCredential(req.user.id, req.params.id);
        }
        if (!deleted) return res.status(404).json({ error: 'Passkey не найден' });
        res.json({ deleted: true });
    } catch (error) {
        res.status(500).json({ error: 'Не удалось удалить passkey' });
    }
});

router.post('/passkeys/authenticate/options', async (req, res) => {
    try {
        const username = String(req.body.username || '').trim();
        const user = username ? await getUserByUsername(username) : null;
        if (username && !user) return res.status(404).json({ error: 'Для этого аккаунта passkey не найден' });
        const credentials = user ? await listUserCredentials(user.id) : [];
        if (username && !credentials.length) return res.status(404).json({ error: 'Для этого аккаунта passkey не найден' });
        const { generateAuthenticationOptions } = await simpleWebAuthn();
        const config = passkeyConfig(req);
        const options = await generateAuthenticationOptions({
            rpID: config.rpId,
            userVerification: 'required',
            allowCredentials: credentials.map(credential => ({
                id: credential.credential_id,
                transports: Array.isArray(credential.transports) ? credential.transports : []
            }))
        });
        const flowId = crypto.randomUUID();
        await saveChallenge({
            flowId,
            userId: user?.id || null,
            purpose: 'authenticate',
            challenge: options.challenge,
            origin: config.origin,
            rpId: config.rpId
        });
        res.json({ flowId, options });
    } catch (error) {
        console.error('[PASSKEY] authentication options:', error);
        res.status(500).json({ error: 'Не удалось начать вход по passkey' });
    }
});

router.post('/passkeys/authenticate/verify', async (req, res) => {
    try {
        const flow = await consumeChallenge(String(req.body.flowId || ''), 'authenticate');
        if (!flow) return res.status(400).json({ error: 'Запрос входа истёк. Попробуйте снова.' });
        const credentialId = String(req.body.credential?.id || '');
        const credential = await findCredential(credentialId, flow.user_id || null);
        if (!credential) return res.status(401).json({ error: 'Passkey не распознан' });
        const { verifyAuthenticationResponse } = await simpleWebAuthn();
        const verification = await verifyAuthenticationResponse({
            response: req.body.credential,
            expectedChallenge: flow.challenge,
            expectedOrigin: flow.origin,
            expectedRPID: flow.rp_id,
            requireUserVerification: true,
            credential: {
                id: credential.credential_id,
                publicKey: rawPublicKey(credential),
                counter: Number(credential.counter || 0),
                transports: Array.isArray(credential.transports) ? credential.transports : []
            }
        });
        if (!verification.verified) return res.status(401).json({ error: 'Passkey не подтверждён' });
        const user = await getUserById(credential.user_id);
        if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
        if (sessionAuth.isFrozen(user)) {
            return res.status(403).json({
                error: 'Account frozen',
                message: 'Аккаунт временно заморожен',
                banned_until: user.banned_until,
                ban_reason: user.ban_reason || null
            });
        }
        await updateCredentialCounter(credential.credential_id, verification.authenticationInfo.newCounter);
        await sessionAuth.recordLogin(user, req).catch(error => console.warn('[PASSKEY] login audit failed:', error.message));
        res.json({
            verified: true,
            token: sessionAuth.issueToken(user, user.remember_session_enabled !== false),
            user: sessionAuth.publicUser(user)
        });
    } catch (error) {
        console.error('[PASSKEY] authentication verify:', error);
        res.status(401).json({ error: 'Не удалось выполнить вход по passkey' });
    }
});

module.exports = router;
