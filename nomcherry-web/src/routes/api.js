/**
 * Main API Routes for NomCherry Café
 */

const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const menuController = require('../controllers/menuController');
const orderController = require('../controllers/orderController');
const stockController = require('../controllers/stockController');
const reportController = require('../controllers/reportController');
const branchController = require('../controllers/branchController');

// 1. Authentication & Users
router.post('/auth/login', authController.login);
router.get('/users', authController.getUsers);
router.post('/users', authController.createUser);
router.delete('/users/:id', authController.deleteUser);

// 2. Menu Management
router.get('/menu', menuController.getAll);
router.get('/menu/:id', menuController.getById);
router.post('/menu', menuController.create);
router.put('/menu/:id', menuController.update);
router.delete('/menu/:id', menuController.delete);

// 3. Orders & POS Checkout
router.post('/orders', orderController.createOrder);
router.get('/orders', orderController.getAll);
router.get('/orders/:id', orderController.getById);

// 4. Stock & Inventory
router.get('/stock', stockController.getStockList);
router.post('/stock/adjust', stockController.adjustStock);
router.get('/stock/logs', stockController.getMutationLogs);

// 5. Reports & Dashboard Analytics
router.get('/reports/dashboard', reportController.getDashboardMetrics);
router.get('/reports/sales', reportController.getSalesReport);

// 6. Branches
router.get('/branches', branchController.getAll);
router.put('/branches/:id', branchController.update);

module.exports = router;

