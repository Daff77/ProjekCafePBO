/**
 * Main API Routes for NomCherry Café
 * Authentication is required for every endpoint except public auth config, login, and logout.
 */

const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const menuController = require('../controllers/menuController');
const orderController = require('../controllers/orderController');
const stockController = require('../controllers/stockController');
const reportController = require('../controllers/reportController');
const branchController = require('../controllers/branchController');
const settingsController = require('../controllers/settingsController');
const { requireAuth, requireRoles } = require('../services/authService');

// Basic in-memory login rate limiting (per process)
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 30;
const limiterCleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of loginAttempts.entries()) {
        if (now - record.startedAt > LOGIN_WINDOW_MS) {
            loginAttempts.delete(key);
        }
    }
}, LOGIN_WINDOW_MS);
if (typeof limiterCleanup.unref === 'function') limiterCleanup.unref();

function loginRateLimiter(req, res, next) {
    const now = Date.now();
    const key = req.ip || 'unknown';
    const record = loginAttempts.get(key);

    if (!record || now - record.startedAt > LOGIN_WINDOW_MS) {
        loginAttempts.set(key, { count: 1, startedAt: now });
        return next();
    }

    if (record.count >= LOGIN_MAX_ATTEMPTS) {
        const retryAfterSeconds = Math.max(1, Math.ceil((LOGIN_WINDOW_MS - (now - record.startedAt)) / 1000));
        res.setHeader('Retry-After', String(retryAfterSeconds));
        return res.status(429).json({
            success: false,
            message: 'Terlalu banyak percobaan login. Silakan coba lagi nanti.'
        });
    }

    record.count += 1;
    return next();
}

// Public Authentication Routes
router.get('/auth/config', authController.getPublicConfig);
router.post('/auth/login', loginRateLimiter, authController.login);
router.post('/auth/logout', authController.logout);

// Everything below requires a valid session
router.use(requireAuth);

router.get('/auth/session', authController.session);
router.post('/auth/change-password', authController.changePassword);

// 1. Users (admin only)
router.get('/users', requireRoles('admin'), authController.getUsers);
router.post('/users', requireRoles('admin'), authController.createUser);
router.post('/users/:id/reset-password', requireRoles('admin'), authController.resetUserPassword);
router.delete('/users/:id', requireRoles('admin'), authController.deleteUser);

// 2. Menu Management (all authenticated users can read)
router.get('/menu', menuController.getAll);
router.get('/menu/:id', menuController.getById);
router.post('/menu', requireRoles('admin', 'manager'), menuController.create);
router.put('/menu/:id', requireRoles('admin', 'manager'), menuController.update);
router.delete('/menu/:id', requireRoles('admin', 'manager'), menuController.delete);

// 3. Orders & POS Checkout
router.post('/orders', requireRoles('admin', 'kasir'), orderController.createOrder);
router.get('/orders', orderController.getAll);
router.get('/orders/:id', orderController.getById);
router.patch('/orders/:id/status', requireRoles('admin', 'kasir', 'manager'), orderController.updateKitchenStatus);

// 4. Stock & Inventory
router.get('/stock', requireRoles('admin', 'manager', 'owner'), stockController.getStockList);
router.get('/stock/reconciliation', requireRoles('admin', 'manager', 'owner'), stockController.getReconciliation);
router.post('/stock/adjust', requireRoles('admin', 'manager'), stockController.adjustStock);
router.post('/stock/opname', requireRoles('admin', 'manager'), stockController.performStockOpname);
router.post('/stock/restock-all', requireRoles('admin', 'manager'), stockController.restockAll);
router.get('/stock/logs', requireRoles('admin', 'manager', 'owner'), stockController.getMutationLogs);

// 5. Reports & Dashboard Analytics
router.get('/reports/dashboard', reportController.getDashboardMetrics);
router.get('/reports/analytics', requireRoles('admin', 'manager', 'owner'), reportController.getAnalytics);
router.get('/reports/sales', requireRoles('admin', 'manager', 'owner'), reportController.getSalesReport);

// 6. Branches
router.get('/branches', branchController.getAll);
router.put('/branches/:id', requireRoles('admin'), branchController.update);

// 7. Application settings
router.get('/settings', settingsController.getSettings);
router.put('/settings', requireRoles('admin', 'manager'), settingsController.updateSettings);

module.exports = router;
