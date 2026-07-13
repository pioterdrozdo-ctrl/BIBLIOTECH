'use strict';

const fs = require('fs');
const path = require('path');
const localStore = require('./localStore');

const STORE_FILE = localStore.STORE_FILE;

function now() {
    return new Date().toISOString();
}

function read() {
    const store = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    if (!store.counters) store.counters = {};
    if (!Array.isArray(store.passkey_credentials)) store.passkey_credentials = [];
    if (!Array.isArray(store.passkey_challenges)) store.passkey_challenges = [];
    if (!Array.isArray(store.users)) store.users = [];
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

function publicUser(user) {
    if (!user) return null;
    return {
        id: Number(user.id),
        username: user.username,
        email: user.email || null,
        role: user.role || 'user',
        banned_until: user.banned_until || null,
        ban_reason: user.ban_reason || null,
        remember_session_enabled: user.remember_session_enabled !== false,
        session_version: Number(user.session_version || 1)
    };
}

function getUserById(userId) {
    const store = read();
    return publicUser(store.users.find(user => Number(user.id) === Number(userId)));
}

function getUserByUsername(username) {
    const normalized = String(username || '').trim().toLowerCase();
    const store = read();
    return publicUser(store.users.find(user => String(user.username || '').toLowerCase() === normalized));
}

function cleanChallenges(store) {
    const timestamp = Date.now();
    store.passkey_challenges = store.passkey_challenges.filter(item => new Date(item.expires_at).getTime() > timestamp);
}

function saveChallenge(data) {
    const store = read();
    cleanChallenges(store);
    store.passkey_challenges = store.passkey_challenges.filter(item => item.flow_id !== data.flowId);
    store.passkey_challenges.push({
        flow_id: data.flowId,
        user_id: data.userId || null,
        purpose: data.purpose,
        challenge: data.challenge,
        webauthn_user_id: data.webauthnUserId || null,
        origin: data.origin,
        rp_id: data.rpId,
        created_at: now(),
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
    });
    write(store);
}

function consumeChallenge(flowId, purpose) {
    const store = read();
    cleanChallenges(store);
    const index = store.passkey_challenges.findIndex(item => item.flow_id === flowId && item.purpose === purpose);
    if (index < 0) {
        write(store);
        return null;
    }
    const [challenge] = store.passkey_challenges.splice(index, 1);
    write(store);
    return challenge;
}

function listCredentials(userId) {
    const store = read();
    return store.passkey_credentials
        .filter(item => Number(item.user_id) === Number(userId))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function findCredential(credentialId, userId = null) {
    const store = read();
    return store.passkey_credentials.find(item =>
        item.credential_id === credentialId
        && (!userId || Number(item.user_id) === Number(userId))
    ) || null;
}

function saveCredential(data) {
    const store = read();
    if (store.passkey_credentials.some(item => item.credential_id === data.credentialId)) {
        const error = new Error('Этот passkey уже зарегистрирован');
        error.code = 'DUPLICATE_PASSKEY';
        throw error;
    }
    const credential = {
        id: nextId(store, 'passkey_credentials'),
        user_id: Number(data.userId),
        credential_id: data.credentialId,
        public_key: data.publicKey,
        webauthn_user_id: data.webauthnUserId,
        counter: Number(data.counter || 0),
        transports: data.transports || [],
        device_type: data.deviceType || 'singleDevice',
        backed_up: Boolean(data.backedUp),
        name: String(data.name || 'Passkey').trim().slice(0, 100),
        created_at: now(),
        last_used_at: null
    };
    store.passkey_credentials.push(credential);
    write(store);
    return credential;
}

function updateCounter(credentialId, counter) {
    const store = read();
    const credential = store.passkey_credentials.find(item => item.credential_id === credentialId);
    if (!credential) return null;
    credential.counter = Number(counter || 0);
    credential.last_used_at = now();
    write(store);
    return credential;
}

function deleteCredential(userId, credentialRowId) {
    const store = read();
    const index = store.passkey_credentials.findIndex(item =>
        Number(item.id) === Number(credentialRowId)
        && Number(item.user_id) === Number(userId)
    );
    if (index < 0) return false;
    store.passkey_credentials.splice(index, 1);
    write(store);
    return true;
}

module.exports = {
    getUserById,
    getUserByUsername,
    saveChallenge,
    consumeChallenge,
    listCredentials,
    findCredential,
    saveCredential,
    updateCounter,
    deleteCredential
};
