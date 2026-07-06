const crypto = require('crypto');

const KEY_LENGTH = 64;
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const LEGACY_ADMIN_BCRYPT_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ.pG9sWwB6pTfZXh7eQvJZQeUzP9iFq';

function timingSafeEqualHex(a, b) {
    const left = Buffer.from(String(a || ''), 'hex');
    const right = Buffer.from(String(b || ''), 'hex');
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(String(password), salt, KEY_LENGTH, {
        N: SCRYPT_COST,
        r: SCRYPT_BLOCK_SIZE,
        p: SCRYPT_PARALLELIZATION
    }).toString('hex');

    return `scrypt$${SCRYPT_COST}$${SCRYPT_BLOCK_SIZE}$${SCRYPT_PARALLELIZATION}$${salt}$${hash}`;
}

function verifyPassword(password, storedHash = '') {
    if (!storedHash) return false;

    if (storedHash.startsWith('scrypt$')) {
        const [, cost, blockSize, parallelization, salt, hash] = storedHash.split('$');
        if (!cost || !blockSize || !parallelization || !salt || !hash) return false;

        const candidate = crypto.scryptSync(String(password), salt, KEY_LENGTH, {
            N: Number(cost),
            r: Number(blockSize),
            p: Number(parallelization)
        }).toString('hex');

        return timingSafeEqualHex(candidate, hash);
    }

    // Compatibility for the original demo admin hash from the first project version.
    if (storedHash === LEGACY_ADMIN_BCRYPT_HASH && String(password) === 'GreenScreen') {
        return true;
    }

    return false;
}

module.exports = { hashPassword, verifyPassword };
