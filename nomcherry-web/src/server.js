/**
 * Server Entry Point for NomCherry Café
 * Clean Architecture Web Application
 */

require('./config/env');

const express = require('express');
const path = require('path');
const apiRoutes = require('./routes/api');
const db = require('./database/db');
const { getSessionUser } = require('./services/authService');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';

app.disable('x-powered-by');

// Structured request logging (disable with LOG_REQUESTS=false)
app.use((req, res, next) => {
    if (process.env.LOG_REQUESTS === 'false') return next();
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
        console.log(JSON.stringify({
            ts: new Date().toISOString(),
            level: 'info',
            method: req.method,
            path: req.originalUrl,
            status: res.statusCode,
            duration_ms: Math.round(durationMs),
            ip: req.ip
        }));
    });
    return next();
});

// Security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://images.unsplash.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    );
    next();
});

// Body Parsers
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: true, limit: '200kb' }));

// 1. Login page (public)
app.get(['/', '/login', '/masuk', '/login.html'], (req, res) => {
    res.sendFile(path.join(__dirname, '../public/login.html'));
});

// 2. Protected application pages
function pageGuard(req, res, next) {
    const user = getSessionUser(req);
    if (!user) {
        return res.redirect('/login');
    }
    req.user = user;
    return next();
}

app.get(['/app', '/dashboard', '/pos', '/index.html'], pageGuard, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 3. Static assets (index disabled so '/' serves login.html)
app.use(express.static(path.join(__dirname, '../public'), { index: false }));

// 4. API routes
app.get('/api/health', (req, res) => {
    try {
        db.get('SELECT 1 AS ok');
        res.json({
            success: true,
            status: 'ok',
            uptime_seconds: Math.round(process.uptime()),
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error('[server] health check failed:', err.message);
        res.status(503).json({ success: false, status: 'database_unavailable' });
    }
});
app.use('/api', apiRoutes);

// 5. Fallback middleware
app.use((req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, '../public/login.html'));
    } else {
        res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan' });
    }
});

// 6. Global error handler
app.use((err, req, res, next) => {
    console.error('[server] unhandled error:', err.message);
    if (res.headersSent) {
        return next(err);
    }
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' });
});

function startServer(port = PORT, host = HOST) {
    return app.listen(port, host, () => {
        console.log(`NomCherry Café web system running at http://${host}:${port}`);
        console.log('Authentication: HttpOnly signed session cookies');
        console.log('Database: SQLite via node:sqlite');
    });
}

if (require.main === module) {
    const server = startServer();
    const shutdown = () => {
        server.close(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

module.exports = app;
module.exports.startServer = startServer;
