const assert = require('node:assert');
const db = require('../src/database/db');
const authController = require('../src/controllers/authController');
const menuController = require('../src/controllers/menuController');
const orderController = require('../src/controllers/orderController');
const stockController = require('../src/controllers/stockController');
const reportController = require('../src/controllers/reportController');

function mockRes() {
    return {
        statusCode: 200,
        data: null,
        headers: {},
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.data = payload; return this; },
        setHeader(name, val) { this.headers[name] = val; },
        attachment() {},
        send(payload) { this.data = payload; return this; }
    };
}

console.log('🧪 Starting NomCherry Café System Verification Suite...\n');

// 1. Database Seeding Verification
console.log('1. Database Seeding Verification:');
const branchCount = db.get("SELECT COUNT(*) as cnt FROM cabang").cnt;
assert(branchCount >= 2, 'Must have at least 2 branches');
console.log(`   ✓ Found ${branchCount} branches configured`);

const userCount = db.get("SELECT COUNT(*) as cnt FROM pengguna").cnt;
assert(userCount >= 5, 'Must have at least 5 default users');
console.log(`   ✓ Found ${userCount} users configured (Admin, Kasir 1, Kasir 2, Manager, Owner)`);

const menuCount = db.get("SELECT COUNT(*) as cnt FROM menu").cnt;
assert(menuCount >= 5, 'Must have initial menu items');
console.log(`   ✓ Found ${menuCount} menu items pre-seeded`);

// 2. Black Box Test 1.1 - 1.4: Login
console.log('\n2. Testing Authentication (Black Box Table 5.1.2):');
let res = mockRes();
authController.login({ body: { username: 'admin', kata_sandi: 'admin123', id_cabang: 'CBG001' } }, res);
assert.strictEqual(res.data.success, true);
assert.strictEqual(res.data.data.peran, 'admin');
console.log('   ✓ Test 1.1: Login Valid Admin PASSED');

// Test 1.2: Password Salah
res = mockRes();
authController.login({ body: { username: 'admin', kata_sandi: 'passwordsalah', id_cabang: 'CBG001' } }, res);
assert.strictEqual(res.data.success, false);
console.log('   ✓ Test 1.2: Login Password Salah rejected gracefully PASSED');

// Test 1.3: Kasir Cabang Restriction
res = mockRes();
authController.login({ body: { username: 'daps', kata_sandi: '135', id_cabang: 'CBG002' } }, res);
assert.strictEqual(res.data.success, false);
console.log('   ✓ Test 1.3: Kasir branch restriction enforced PASSED');

// Test 1.4: Field Kosong
res = mockRes();
authController.login({ body: { username: '', kata_sandi: '' } }, res);
assert.strictEqual(res.data.success, false);
console.log('   ✓ Test 1.4: Empty credentials rejected PASSED');

// 3. Menu Management
console.log('\n3. Testing Menu Management (Black Box Table 5.1.2 - Menu):');
res = mockRes();
menuController.getAll({ query: {} }, res);
assert.strictEqual(res.data.success, true);
assert(res.data.data.length >= 5);
console.log(`   ✓ Retrieved ${res.data.data.length} active menus`);

// 4. POS Cart Checkout & Stock Auto-Decrement
console.log('\n4. Testing POS Order & Inventory Auto-Decrement:');
const firstMenu = db.get("SELECT * FROM menu WHERE stok >= 2 LIMIT 1");
const initialStock = firstMenu.stok;

res = mockRes();
const checkoutBody = {
    id_cabang: 'CBG001',
    id_pengguna: 'USR001',
    nomor_meja: 'Meja 05',
    metode_pembayaran: 'Cash',
    nominal_diterima: 50000,
    items: [
        { id_menu: firstMenu.id_menu, qty: 2, harga: firstMenu.harga, nama_menu: firstMenu.nama_menu }
    ]
};
orderController.createOrder({ body: checkoutBody }, res);
assert.strictEqual(res.data.success, true);
assert(res.data.data.id_pesanan);
const newOrderId = res.data.data.id_pesanan;
console.log(`   ✓ Order ${newOrderId} created successfully`);

const updatedMenu = db.get("SELECT stok FROM menu WHERE id_menu = ?", [firstMenu.id_menu]);
assert.strictEqual(updatedMenu.stok, initialStock - 2);
console.log(`   ✓ Stock auto-decremented: ${initialStock} -> ${updatedMenu.stok}`);

// Test Order Detail & Thermal Receipt Retrieval
res = mockRes();
orderController.getById({ params: { id: newOrderId } }, res);
assert.strictEqual(res.data.success, true);
assert(res.data.data.nomor_struk);
assert(res.data.data.items.length > 0);
console.log(`   ✓ Thermal receipt retrieved for ${res.data.data.nomor_struk} with ${res.data.data.items.length} items`);

// 5. Stock Logs & Expiry
console.log('\n5. Testing Stock Mutation & Expiry Tracking:');
res = mockRes();
stockController.getStockList({ query: { cabang: 'CBG001' } }, res);
assert.strictEqual(res.data.success, true);
assert(res.data.data.length >= 5);
console.log(`   ✓ Stock list loaded with status flags (${res.data.data.length} items)`);

// 6. Dashboard Financial KPIs
console.log('\n6. Testing Dashboard KPIs & Parley Metrics:');
res = mockRes();
reportController.getDashboardMetrics({ query: { cabang: 'CBG001' } }, res);
assert.strictEqual(res.data.success, true);
assert(res.data.data.monthly_chart.length > 0);
console.log(`   ✓ Revenue Today: Rp ${res.data.data.total_revenue_today.toLocaleString('id-ID')}`);
console.log(`   ✓ Monthly trend contains ${res.data.data.monthly_chart.length} Parley bar chart data points`);

// 7. CSV Report Export
console.log('\n7. Testing CSV Report Generation:');
res = mockRes();
reportController.getSalesReport({ query: { cabang: 'CBG001', format: 'csv' } }, res);
assert(typeof res.data === 'string' && res.data.includes('ID Pesanan,Nomor Struk'));
console.log('   ✓ CSV data exported successfully with headers');

console.log('\n🎉 ALL 12 VERIFICATION & TEST SUITE CHECKS PASSED WITH 100% SUCCESS!\n');
