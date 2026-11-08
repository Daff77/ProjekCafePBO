/**
 * Password hashing utilities for NomCherry Café.
 * Uses Node's built-in scrypt; no external dependencies.
 */

const crypto = require('crypto');

const KEY_LENGTH = 64;
const PREFIX = 'scrypt';

function hashPassword(plainPassword) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = crypto.scryptSync(String(plainPassword), salt, KEY_LENGTH).toString('hex');
    return `${PREFIX}$${salt}$${derived}`;
}

function verifyPassword(plainPassword, storedPassword) {
    if (typeof storedPassword !== 'string' || storedPassword.length === 0) {
        return false;
    }

    if (!storedPassword.startsWith(`${PREFIX}$`)) {
        return storedPassword === String(plainPassword);
    }

    const parts = storedPassword.split('$');
    if (parts.length !== 3) {
        return false;
    }

    const [, salt, expectedHex] = parts;
    const expected = Buffer.from(expectedHex, 'hex');
    const actual = crypto.scryptSync(String(plainPassword), salt, expected.length);

    if (expected.length !== actual.length) {
        return false;
    }

    return crypto.timingSafeEqual(expected, actual);
}

function needsRehash(storedPassword) {
    return typeof storedPassword !== 'string' || !storedPassword.startsWith(`${PREFIX}$`);
}

module.exports = {
    hashPassword,
    verifyPassword,
    needsRehash
};
