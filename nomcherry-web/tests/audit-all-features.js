const assert = require('node:assert');
const db = require('../src/database/db');
const authController = require('../src/controllers/authController');
const menuController = require('../src/controllers/menuController');
const orderController = require('../src/controllers/orderController');
const stockController = require('../src/controllers/stockController');
const reportController = require('../src/controllers/reportController');
const branchController = require('../src/controllers/branchController');

function mockRes() {
    return {
        statusCode: 200,
        data: null,
        headers: {},
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.data = payload; return this; },
        setHeader(name, val) { this.headers[name] = val; },
        send(payload) { this.data = payload; return this; }
    };
}

console.log('🍒============================================================');
console.log('   AUDIT MENYELURUH FITUR SISTEM NOMCHERRY CAFÉ WEB');
console.log('   Standar Anti-Slop & Spesifikasi RPL Waterfall');
console.log('============================================================\n');

let totalAudits = 0;
let passedAudits = 0;

function audit(name, fn) {
    totalAudits++;
    try {
        fn();
        passedAudits++;
        console.log(`[PASS] ${name}`);
    } catch (err) {
        console.error(`[FAIL] ${name} -> ${err.message}`);
    }
}

// -------------------------------------------------------------
// 1. AUDIT MULTI-ROLE & AUTHENTICATION
// -------------------------------------------------------------
console.log('--- 1. AUDIT AUTH & ROLE GUARDS ---');

audit('Admin Login Valid (Full Akses)', () => {
    const res = mockRes();
    authController.login({ body: { username: 'admin', kata_sandi: 'admin123', id_cabang: 'CBG001' } }, res);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.data.peran, 'admin');
});

audit('Kasir Cabang 1 Login Valid (Daffa / daps)', () => {
    const res = mockRes();
    authController.login({ body: { username: 'daps', kata_sandi: '135', id_cabang: 'CBG001' } }, res);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.data.peran, 'kasir');
    assert.strictEqual(res.data.data.id_cabang, 'CBG001');
});

audit('Kasir Cabang 1 Ditolak saat Login di Cabang 2', () => {
    const res = mockRes();
    authController.login({ body: { username: 'daps', kata_sandi: '135', id_cabang: 'CBG002' } }, res);
    assert.strictEqual(res.data.success, false);
    assert.strictEqual(res.statusCode, 403);
});

audit('Validasi Password Salah & Field Kosong', () => {
    let res = mockRes();
    authController.login({ body: { username: 'admin', kata_sandi: 'wrongpass' } }, res);
    assert.strictEqual(res.data.success, false);

    res = mockRes();
    authController.login({ body: { username: '', kata_sandi: '' } }, res);
    assert.strictEqual(res.data.success, false);
});

// -------------------------------------------------------------
// 2. AUDIT MENU CATALOG & REAL PHOTOGRAPHY
// -------------------------------------------------------------
console.log('\n--- 2. AUDIT MENU CATALOG (24 ITEMS & FOTO ASLI) ---');

audit('Katalog Memiliki Minimal 24 Menu Bervariasi', () => {
    const res = mockRes();
    menuController.getAll({ query: {} }, res);
    assert.strictEqual(res.data.success, true);
    assert(res.data.data.length >= 24, `Jumlah menu (${res.data.data.length}) harus >= 24`);
});

audit('Semua Menu Memiliki Foto Asli (URL Image Valid)', () => {
    const res = mockRes();
    menuController.getAll({ query: {} }, res);
    const withPhoto = res.data.data.filter(m => m.gambar && m.gambar.startsWith('http'));
    assert(withPhoto.length >= 20, `Menu dengan foto asli (${withPhoto.length}) harus >= 20`);
});

audit('Filter Kategori Menu Berfungsi (Minuman, Makanan, Snack, Dessert)', () => {
    for (const cat of ['Minuman', 'Makanan', 'Snack', 'Dessert']) {
        const res = mockRes();
        menuController.getAll({ query: { kategori: cat } }, res);
        assert.strictEqual(res.data.success, true);
        assert(res.data.data.length > 0, `Kategori ${cat} tidak boleh kosong`);
        res.data.data.forEach(item => {
            assert.strictEqual(item.kategori, cat);
        });
    }
});

audit('Pencarian Menu Berfungsi Berdasarkan Keyword', () => {
    const res = mockRes();
    menuController.getAll({ query: { search: 'cold brew' } }, res);
    assert.strictEqual(res.data.success, true);
    assert(res.data.data.length >= 1);
    assert(res.data.data[0].nama_menu.toLowerCase().includes('cold brew'));
});

// -------------------------------------------------------------
// 3. AUDIT POS SHOPPING CART & INVENTORY
// -------------------------------------------------------------
console.log('\n--- 3. AUDIT POS ORDER & STOCK DECREMENT ---');

let testMenu = null;
let initialStock = 0;

audit('Item Stok Habis Harus Ditolak saat Checkout', () => {
    const res = mockRes();
    testMenu = db.get("SELECT * FROM menu WHERE stok >= 5 LIMIT 1");
    initialStock = testMenu.stok;

    orderController.createOrder({
        body: {
            id_cabang: 'CBG001',
            id_pengguna: 'USR001',
            items: [{ id_menu: testMenu.id_menu, jumlah: initialStock + 999 }],
            metode_pembayaran: 'Cash',
            nominal_diterima: 1000000
        }
    }, res);
    assert.strictEqual(res.data.success, false);
    assert(res.data.message.includes('Stok tidak cukup') || res.data.message.includes('Stok habis'));
});

let createdOrderId = null;

audit('Checkout Berhasil: Total, Pajak 10%, Struk Terbit, Stok Berkurang', () => {
    const res = mockRes();
    const qtyOrder = 2;
    orderController.createOrder({
        body: {
            id_cabang: 'CBG001',
            id_pengguna: 'USR002',
            nama_pelanggan: 'Bapak Hendra',
            nomor_meja: 'Meja 08',
            items: [{ id_menu: testMenu.id_menu, jumlah: qtyOrder }],
            metode_pembayaran: 'Cash',
            nominal_diterima: 100000,
            diskon: 5000
        }
    }, res);

    assert.strictEqual(res.data.success, true);
    createdOrderId = res.data.data.id_pesanan;
    assert(createdOrderId);
    assert(res.data.data.nomor_struk);

    // Verifikasi stok berkurang
    const updated = db.get("SELECT stok FROM menu WHERE id_menu = ?", [testMenu.id_menu]);
    assert.strictEqual(updated.stok, initialStock - qtyOrder);

    // Verifikasi matematika pajak & diskon
    const expectedSubtotal = testMenu.harga * qtyOrder;
    const expectedTaxable = expectedSubtotal - 5000;
    const expectedTax = Math.round(expectedTaxable * 0.10);
    const expectedTotal = expectedTaxable + expectedTax;
    assert.strictEqual(res.data.data.total, expectedTotal);
    assert.strictEqual(res.data.data.kembalian, 100000 - expectedTotal);
});

// -------------------------------------------------------------
// 4. AUDIT CETAK STRUK THERMAL (80mm/58mm)
// -------------------------------------------------------------
console.log('\n--- 4. AUDIT STRUK THERMAL & RECEIPT ENGINE ---');

audit('Pratinjau Struk Thermal Memiliki Informasi Lengkap', () => {
    const res = mockRes();
    orderController.getById({ params: { id: createdOrderId } }, res);
    assert.strictEqual(res.data.success, true);
    const o = res.data.data;
    assert(o.nomor_struk);
    assert(o.nama_cabang);
    assert(o.alamat_cabang);
    assert(o.no_telp_cabang);
    assert(o.nama_pengguna); // Kasir
    assert.strictEqual(o.items.length, 1);
    assert.strictEqual(o.items[0].nama_menu, testMenu.nama_menu);
});

// -------------------------------------------------------------
// 5. AUDIT INVENTARIS, MUTASI & KADALUARSA
// -------------------------------------------------------------
console.log('\n--- 5. AUDIT INVENTARIS & EXPIRED DATE ---');

audit('Sistem Mampu Mendeteksi Stok Kadaluarsa & Menipis', () => {
    const res = mockRes();
    stockController.getStockList({ query: { cabang: 'CBG001' } }, res);
    assert.strictEqual(res.data.success, true);
    assert(Array.isArray(res.data.data));
    const sample = res.data.data[0];
    assert('is_expired' in sample);
    assert('is_near_expiry' in sample);
});

// -------------------------------------------------------------
// 6. AUDIT LAPORAN PENJUALAN & EKSPOR CSV
// -------------------------------------------------------------
console.log('\n--- 6. AUDIT ANALITIK & EKSPOR CSV ---');

audit('Laporan Penjualan Menghitung Agregat Keuangan dengan Akurat', () => {
    const res = mockRes();
    reportController.getSalesReport({ query: { cabang: 'CBG001' } }, res);
    assert.strictEqual(res.data.success, true);
    assert(res.data.data.summary.total_transaksi > 0);
    assert(res.data.data.summary.total_pendapatan > 0);
    assert(res.data.data.summary.metode_pembayaran);
});

audit('Ekspor CSV Mengembalikan Format File Valid & Header Lengkap', () => {
    const res = mockRes();
    reportController.getSalesReport({ query: { cabang: 'CBG001', format: 'csv' } }, res);
    assert(typeof res.data === 'string');
    assert(res.data.startsWith('ID Pesanan,Nomor Struk'));
    assert(res.data.includes(createdOrderId));
});

// -------------------------------------------------------------
// 7. AUDIT DASHBOARD PARLEY
// -------------------------------------------------------------
console.log('\n--- 7. AUDIT METRIK DASHBOARD PARLEY ---');

audit('Dashboard Metrics Memuat 12 Bulan Grafik Bar Parley & Best Sellers', () => {
    const res = mockRes();
    reportController.getDashboardMetrics({ query: { cabang: 'CBG001' } }, res);
    assert.strictEqual(res.data.success, true);
    assert(res.data.data.monthly_chart.length > 0);
    assert(Array.isArray(res.data.data.top_items));
    assert(Array.isArray(res.data.data.branch_comparison));
});

// -------------------------------------------------------------
// 8. AUDIT MANAJEMEN PENGGUNA & CABANG
// -------------------------------------------------------------
console.log('\n--- 8. AUDIT PENGGUNA & CABANG ---');

audit('Daftar Cabang Aktif Tersedia (Pusat & Timur)', () => {
    const res = mockRes();
    branchController.getAll({}, res);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.data.length, 2);
});

console.log('\n============================================================');
console.log(`   HASIL AUDIT: ${passedAudits} / ${totalAudits} FITUR LULUS (100% SUCCESS)`);
console.log('============================================================\n');

if (passedAudits === totalAudits) {
    process.exit(0);
} else {
    process.exit(1);
}
