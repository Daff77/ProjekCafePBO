/**
 * Session and authentication helpers for NomCherry Café.
 * Signed, HttpOnly cookie sessions using Node's built-in crypto.
 */

const crypto = require('crypto');
const db = require('../database/db');

const COOKIE_NAME = 'nc_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60;

let warnedAboutSecret = false;

function getSessionSecret() {
    if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim() !== '') {
        return process.env.SESSION_SECRET;
    }

    if (!warnedAboutSecret) {
        warnedAboutSecret = true;
        console.warn('[auth] SESSION_SECRET is not set. Using an ephemeral secret; sessions will expire on restart.');
    }

    if (!global.__nomcherryEphemeralSecret) {
        global.__nomcherryEphemeralSecret = crypto.randomBytes(32).toString('hex');
    }
    return global.__nomcherryEphemeralSecret;
}

function base64UrlEncode(value) {
    return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value) {
    return Buffer.from(value, 'base64url').toString('utf8');
}

function signPayload(payload) {
    return crypto
        .createHmac('sha256', getSessionSecret())
        .update(payload)
        .digest('base64url');
}

function createSessionToken(user, req) {
    const now = Date.now();
    const sessionId = crypto.randomUUID();
    const createdAt = new Date(now).toISOString();
    const expiresAt = new Date(now + SESSION_TTL_SECONDS * 1000).toISOString();
    const userAgent = req && req.headers ? String(req.headers['user-agent'] || '').slice(0, 250) : '';
    const ip = req && req.ip ? String(req.ip).slice(0, 64) : '';

    db.run('DELETE FROM sessions WHERE expires_at < ?', [new Date(now).toISOString()]);
    db.run(
        `INSERT INTO sessions (session_id, id_pengguna, created_at, expires_at, revoked_at, user_agent, ip)
         VALUES (?, ?, ?, ?, NULL, ?, ?)`,
        [sessionId, user.id_pengguna, createdAt, expiresAt, userAgent, ip]
    );

    const payload = base64UrlEncode(JSON.stringify({
        sid: sessionId,
        sub: user.id_pengguna,
        exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS
    }));
    return `${payload}.${signPayload(payload)}`;
}

function readToken(req) {
    const header = req && req.headers ? req.headers.cookie : '';
    if (!header) return null;

    for (const part of header.split(';')) {
        const index = part.indexOf('=');
        if (index === -1) continue;
        const name = part.slice(0, index).trim();
        if (name === COOKIE_NAME) {
            return part.slice(index + 1).trim();
        }
    }
    return null;
}

function parseSessionToken(token) {
    if (!token || typeof token !== 'string') return null;

    const separator = token.lastIndexOf('.');
    if (separator <= 0) return null;

    const payload = token.slice(0, separator);
    const signature = token.slice(separator + 1);
    const expected = signPayload(payload);

    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return null;
    }

    try {
        const decoded = JSON.parse(base64UrlDecode(payload));
        if (!decoded || typeof decoded.sub !== 'string' || typeof decoded.sid !== 'string') return null;
        if (typeof decoded.exp !== 'number' || decoded.exp < Math.floor(Date.now() / 1000)) {
            return null;
        }
        return decoded;
    } catch (err) {
        return null;
    }
}

function getSessionUser(req) {
    const token = readToken(req);
    const session = parseSessionToken(token);
    if (!session) return null;

    const user = db.get(
        `SELECT p.id_pengguna, p.nama_pengguna, p.username, p.peran, p.id_cabang,
                c.nama_cabang, c.alamat AS alamat_cabang, c.no_telp AS no_telp_cabang,
                s.expires_at, s.revoked_at
         FROM sessions s
         JOIN pengguna p ON s.id_pengguna = p.id_pengguna
         LEFT JOIN cabang c ON p.id_cabang = c.id_cabang
         WHERE s.session_id = ?`,
        [session.sid]
    );

    if (!user) return null;
    if (user.revoked_at) return null;
    if (new Date(user.expires_at).getTime() <= Date.now()) return null;

    delete user.expires_at;
    delete user.revoked_at;
    return user;
}

function revokeSession(req) {
    const token = readToken(req);
    const session = parseSessionToken(token);
    if (!session) return false;
    db.run(
        'UPDATE sessions SET revoked_at = ? WHERE session_id = ? AND revoked_at IS NULL',
        [new Date().toISOString(), session.sid]
    );
    return true;
}

function cookieOptions() {
    const parts = [
        `Path=/`,
        `HttpOnly`,
        `SameSite=Strict`,
        `Max-Age=${SESSION_TTL_SECONDS}`
    ];
    if (process.env.NODE_ENV === 'production') {
        parts.push('Secure');
    }
    return parts.join('; ');
}

function setSessionCookie(res, token) {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; ${cookieOptions()}`);
}

function clearSessionCookie(res) {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

function requireAuth(req, res, next) {
    const user = getSessionUser(req);
    if (!user) {
        return res.status(401).json({ success: false, message: 'Sesi tidak valid atau telah berakhir' });
    }
    req.user = user;
    return next();
}

function requireRoles(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Sesi tidak valid atau telah berakhir' });
        }
        if (!roles.includes(req.user.peran)) {
            return res.status(403).json({ success: false, message: 'Akses ditolak untuk peran ini' });
        }
        return next();
    };
}

module.exports = {
    COOKIE_NAME,
    createSessionToken,
    getSessionUser,
    revokeSession,
    setSessionCookie,
    clearSessionCookie,
    requireAuth,
    requireRoles
};
