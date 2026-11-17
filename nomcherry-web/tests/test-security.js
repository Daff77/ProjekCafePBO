const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomcherry-security-'));
process.env.NOMCHERRY_DB = path.join(tempDir, 'security.db');
process.env.SESSION_SECRET = 'test-session-secret';
process.env.LOG_REQUESTS = 'false';
process.env.SEED_DEMO_DATA = 'true';

const app = require('../src/server');
const db = require('../src/database/db');

let server;
let baseUrl;

function cookieFrom(response) {
    if (typeof response.headers.getSetCookie !== 'function') {
        return null;
    }
    const cookies = response.headers.getSetCookie();
    return cookies && cookies.length > 0 ? cookies[0].split(';')[0] : null;
}

async function request(pathname, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.cookie) headers.Cookie = options.cookie;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetch(`${baseUrl}${pathname}`, {
        method: options.method || 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        redirect: options.redirect || 'follow'
    });

    const text = await response.text();
    let json = null;
    try {
        json = JSON.parse(text);
    } catch (err) {
        json = null;
    }

    return { response, json, text, cookie: cookieFrom(response) };
}

async function login(username, password) {
    const result = await request('/api/auth/login', {
        method: 'POST',
        body: { username, kata_sandi: password }
    });
    return result;
}

(async () => {
    server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    // 1. Unauthenticated API access is rejected and security headers are present.
    let result = await request('/api/users');
    assert.strictEqual(result.response.status, 401, 'user list must require a session');
    assert.strictEqual(result.response.headers.get('x-content-type-options'), 'nosniff');
    assert.strictEqual(result.response.headers.get('x-frame-options'), 'DENY');
    const csp = result.response.headers.get('content-security-policy') || '';
    assert(csp, 'CSP header expected');
    assert(!/script-src[^;]*'unsafe-inline'/.test(csp), 'script-src must not allow unsafe-inline');

    // 2. Application page is protected.
    result = await request('/index.html', { redirect: 'manual' });
    assert.strictEqual(result.response.status, 302, 'protected page must redirect');
    assert.strictEqual(result.response.headers.get('location'), '/login');

    // 3. Kasir Cabang 2 can log in without specifying a branch.
    const kasirLogin = await login('kasir', '123');
    assert.strictEqual(kasirLogin.response.status, 200);
    assert.strictEqual(kasirLogin.json.data.id_cabang, 'CBG002');
    assert(kasirLogin.cookie && kasirLogin.cookie.startsWith('nc_session='), 'session cookie expected');
    const kasirCookie = kasirLogin.cookie;

    // 4. Kasir cannot access admin endpoints or mutate menus.
    result = await request('/api/users', { cookie: kasirCookie });
    assert.strictEqual(result.response.status, 403);

    result = await request('/api/menu', {
        method: 'POST',
        cookie: kasirCookie,
        body: { nama_menu: 'Unauthorized', harga: 10000, stok: 1, kategori: 'Minuman' }
    });
    assert.strictEqual(result.response.status, 403);

    // 5. Kasir order listing is constrained to their own branch.
    result = await request('/api/orders', { cookie: kasirCookie });
    assert.strictEqual(result.response.status, 200);
    result.json.data.forEach(order => {
        assert.strictEqual(order.id_cabang, 'CBG002');
    });

    // 6. Admin login and user listing never exposes password fields.
    const adminLogin = await login('admin', 'admin123');
    assert.strictEqual(adminLogin.response.status, 200);
    assert(adminLogin.cookie && adminLogin.cookie.startsWith('nc_session='));
    const adminCookie = adminLogin.cookie;

    result = await request('/api/users', { cookie: adminCookie });
    assert.strictEqual(result.response.status, 200);
    result.json.data.forEach(user => {
        assert.strictEqual(Object.prototype.hasOwnProperty.call(user, 'kata_sandi'), false);
    });

    // 7. New users are stored hashed and can authenticate.
    result = await request('/api/users', {
        method: 'POST',
        cookie: adminCookie,
        body: {
            nama_pengguna: 'Integration Tester',
            username: 'tester_integration',
            kata_sandi: 'secret-pass',
            peran: 'kasir',
            id_cabang: 'CBG001'
        }
    });
    assert.strictEqual(result.response.status, 200);
    const createdUser = db.get(
        'SELECT kata_sandi FROM pengguna WHERE username = ?',
        ['tester_integration']
    );
    assert(createdUser.kata_sandi.startsWith('scrypt$'), 'password must be hashed');

    const testerLogin = await login('tester_integration', 'secret-pass');
    assert.strictEqual(testerLogin.response.status, 200);

    // 8. Negative quantity is rejected and stock is untouched.
    const menu = db.get('SELECT * FROM menu WHERE stok >= 2 LIMIT 1');
    const stockBefore = menu.stok;

    result = await request('/api/orders', {
        method: 'POST',
        cookie: kasirCookie,
        body: {
            items: [{ id_menu: menu.id_menu, jumlah: -2 }],
            metode_pembayaran: 'Cash',
            nominal_diterima: 100000
        }
    });
    assert.strictEqual(result.response.status, 400);
    assert.strictEqual(db.get('SELECT stok FROM menu WHERE id_menu = ?', [menu.id_menu]).stok, stockBefore);

    // 9. "Card" is normalized to Debit and the whole checkout commits.
    result = await request('/api/orders', {
        method: 'POST',
        cookie: kasirCookie,
        body: {
            items: [{ id_menu: menu.id_menu, jumlah: 1 }],
            metode_pembayaran: 'Card',
            nominal_diterima: 100000
        }
    });
    assert.strictEqual(result.response.status, 200, result.text);
    assert.strictEqual(result.json.data.metode, 'Debit');
    assert.strictEqual(result.json.data.kembalian, 0, 'Card/Debit must not compute cash change');
    assert.strictEqual(
        db.get('SELECT stok FROM menu WHERE id_menu = ?', [menu.id_menu]).stok,
        stockBefore - 1
    );
    const payment = db.get('SELECT metode, nominal_diterima, kembalian FROM pembayaran WHERE id_pesanan = ?', [result.json.data.id_pesanan]);
    assert.strictEqual(payment.metode, 'Debit');
    assert.strictEqual(payment.kembalian, 0);
    assert.strictEqual(payment.nominal_diterima, result.json.data.total);

    // 9b. Order Type & Payment Method Matrix Validation (9 combinations + negative validation)
    // Negative 1: Dine-In without nomor_meja is rejected (400)
    let negRes = await request('/api/orders', {
        method: 'POST',
        cookie: adminCookie,
        body: {
            jenis_pesanan: 'Dine-In',
            nomor_meja: '',
            metode_pembayaran: 'Cash',
            nominal_diterima: 100000,
            items: [{ id_menu: menu.id_menu, jumlah: 1 }]
        }
    });
    assert.strictEqual(negRes.response.status, 400, 'Dine-In without table must be rejected');

    // Negative 2: QRIS without qris_confirmed is rejected (400)
    negRes = await request('/api/orders', {
        method: 'POST',
        cookie: adminCookie,
        body: {
            jenis_pesanan: 'Dine-In',
            nomor_meja: 'Meja 02',
            metode_pembayaran: 'QRIS',
            items: [{ id_menu: menu.id_menu, jumlah: 1 }]
        }
    });
    assert.strictEqual(negRes.response.status, 400, 'QRIS without confirmation must be rejected');

    // Negative 3: Cash with insufficient nominal_diterima is rejected (400)
    negRes = await request('/api/orders', {
        method: 'POST',
        cookie: adminCookie,
        body: {
            jenis_pesanan: 'Dine-In',
            nomor_meja: 'Meja 02',
            metode_pembayaran: 'Cash',
            nominal_diterima: 1000,
            items: [{ id_menu: menu.id_menu, jumlah: 1 }]
        }
    });
    assert.strictEqual(negRes.response.status, 400, 'Cash with insufficient amount must be rejected');

    // Restock menu before running all 9 combinations
    db.run('UPDATE menu SET stok = stok + 20 WHERE id_menu = ?', [menu.id_menu]);

    const orderTypes = [
        { type: 'Dine-In', meja: 'Meja 10', expectedMeja: 'Meja 10', catatan: '' },
        { type: 'Takeaway', meja: 'Takeaway', expectedMeja: '-', catatan: '' },
        { type: 'Delivery', meja: 'Delivery', expectedMeja: '-', catatan: 'Jl. Darmo No. 15' }
    ];
    const payMethods = [
        { method: 'QRIS', expectedDbMethod: 'QRIS', extra: { qris_confirmed: true } },
        { method: 'Cash', expectedDbMethod: 'Cash', extra: { nominal_diterima: 100000 } },
        { method: 'Debit', expectedDbMethod: 'Debit', extra: { referensi: 'EDC-TEST-01' } }
    ];

    for (const ot of orderTypes) {
        for (const pm of payMethods) {
            const stockPre = db.get('SELECT stok FROM menu WHERE id_menu = ?', [menu.id_menu]).stok;
            const comboRes = await request('/api/orders', {
                method: 'POST',
                cookie: adminCookie,
                body: {
                    jenis_pesanan: ot.type,
                    nomor_meja: ot.meja,
                    catatan: ot.catatan,
                    metode_pembayaran: pm.method,
                    items: [{ id_menu: menu.id_menu, jumlah: 1 }],
                    ...pm.extra
                }
            });
            assert.strictEqual(comboRes.response.status, 200, `Combo ${ot.type} + ${pm.method} failed: ${comboRes.text}`);
            const d = comboRes.json.data;
            assert.strictEqual(d.jenis_pesanan, ot.type);
            assert.strictEqual(d.nomor_meja, ot.expectedMeja, `${ot.type} must store nomor_meja as '${ot.expectedMeja}'`);
            assert.strictEqual(d.metode, pm.expectedDbMethod);

            const dbOrder = db.get('SELECT jenis_pesanan, nomor_meja, catatan FROM pesanan WHERE id_pesanan = ?', [d.id_pesanan]);
            assert.strictEqual(dbOrder.jenis_pesanan, ot.type);
            assert.strictEqual(dbOrder.nomor_meja, ot.expectedMeja);

            const dbPay = db.get('SELECT metode, nominal_diterima, kembalian, referensi FROM pembayaran WHERE id_pesanan = ?', [d.id_pesanan]);
            assert.strictEqual(dbPay.metode, pm.expectedDbMethod);
            if (pm.expectedDbMethod === 'Cash') {
                assert.strictEqual(dbPay.nominal_diterima, 100000);
                assert.strictEqual(dbPay.kembalian, 100000 - d.total);
            } else {
                assert.strictEqual(dbPay.nominal_diterima, d.total);
                assert.strictEqual(dbPay.kembalian, 0);
            }

            const stockPost = db.get('SELECT stok FROM menu WHERE id_menu = ?', [menu.id_menu]).stok;
            assert.strictEqual(stockPost, stockPre - 1, `Stock must decrement by 1 for ${ot.type} + ${pm.method}`);
        }
    }

    // 10. Kitchen status is persisted and tenant-scoped.
    const createdOrderId = result.json.data.id_pesanan;
    result = await request(`/api/orders/${createdOrderId}/status`, {
        method: 'PATCH',
        cookie: kasirCookie,
        body: { status_dapur: 'served' }
    });
    assert.strictEqual(result.response.status, 200, result.text);
    assert.strictEqual(
        db.get('SELECT status_dapur FROM pesanan WHERE id_pesanan = ?', [createdOrderId]).status_dapur,
        'served'
    );

    // 11. Analytics endpoint returns real aggregated data including tax & cups summary.
    result = await request('/api/reports/analytics?cabang=CBG001', { cookie: adminCookie });
    assert.strictEqual(result.response.status, 200);
    assert(Array.isArray(result.json.data.category_breakdown));
    assert(Array.isArray(result.json.data.heatmap));
    assert(Array.isArray(result.json.data.monthly));
    assert(typeof result.json.data.summary.total_pajak === 'number');
    assert(typeof result.json.data.summary.total_porsi === 'number');

    // 11b. Soft-deactivated menu (referenced by orders/stock) is hidden from active GET /api/menu and GET /api/stock.
    result = await request(`/api/menu/${menu.id_menu}`, {
        method: 'DELETE',
        cookie: adminCookie
    });
    assert.strictEqual(result.response.status, 200, result.text);
    const activeMenuList = await request('/api/menu', { cookie: adminCookie });
    assert(!activeMenuList.json.data.some(m => m.id_menu === menu.id_menu), 'soft-deactivated menu must not appear in active GET /api/menu');
    const activeStockList = await request('/api/stock', { cookie: adminCookie });
    assert(!activeStockList.json.data.some(s => s.id_menu === menu.id_menu), 'soft-deactivated menu must not appear in active GET /api/stock');
    db.run('UPDATE menu SET is_available = 1 WHERE id_menu = ?', [menu.id_menu]);

    // 12. Settings are persisted and validated.
    result = await request('/api/settings', {
        method: 'PUT',
        cookie: adminCookie,
        body: { cafe_name: 'Security Test Café', tax_rate: 11 }
    });
    assert.strictEqual(result.response.status, 200, result.text);
    result = await request('/api/settings', { cookie: adminCookie });
    assert.strictEqual(result.json.data.cafe_name, 'Security Test Café');
    assert.strictEqual(result.json.data.tax_rate, '11');

    // 13. Comprehensive Inventory & Stock Management Suite
    // 13a. Multi-branch isolation: adjusting stock in CBG001 does not alter CBG002 stock
    const cbg2StockPreRes = await request('/api/stock?cabang=CBG002', { cookie: adminCookie });
    assert.strictEqual(cbg2StockPreRes.response.status, 200);
    const cbg2ItemPre = cbg2StockPreRes.json.data.find(i => i.id_menu === 'MNU002');
    assert(cbg2ItemPre, 'CBG002 must have MNU002 in its branch inventory');

    // Adjust MNU002 in CBG001 using PENYESUAIAN to 12 with min_stok = 15 (triggers Low Stock Alert) and near-expiry date
    const nearExpDate = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    result = await request('/api/stock/adjust', {
        method: 'POST',
        cookie: adminCookie,
        body: {
            id_menu: 'MNU002',
            id_cabang: 'CBG001',
            jenis: 'PENYESUAIAN',
            jumlah: 12,
            min_stok: 15,
            tanggal_kadaluarsa: nearExpDate,
            keterangan: 'Set stok awal dan batas minimum baru'
        }
    });
    assert.strictEqual(result.response.status, 200, result.text);
    assert.strictEqual(result.json.data.stok_baru, 12);
    assert.strictEqual(result.json.data.min_stok, 15);

    const cbg1StockPostRes = await request('/api/stock?cabang=CBG001', { cookie: adminCookie });
    const cbg1ItemPost = cbg1StockPostRes.json.data.find(i => i.id_menu === 'MNU002');
    assert.strictEqual(cbg1ItemPost.stok, 12);
    assert.strictEqual(cbg1ItemPost.min_stok, 15);
    assert.strictEqual(cbg1ItemPost.status_stok, 'Menipis', 'stok (12) <= min_stok (15) must trigger Menipis');
    assert.strictEqual(cbg1ItemPost.is_near_expiry, true, '2 days until expiry must trigger is_near_expiry');

    const cbg2StockPostRes = await request('/api/stock?cabang=CBG002', { cookie: adminCookie });
    const cbg2ItemPost = cbg2StockPostRes.json.data.find(i => i.id_menu === 'MNU002');
    assert.strictEqual(cbg2ItemPost.stok, cbg2ItemPre.stok, 'CBG002 stock must remain isolated from CBG001 adjustment');

    // 13b. Waste (RUSAK), Expired Write-off (KADALUARSA), and Over-deduction prevention
    result = await request('/api/stock/adjust', {
        method: 'POST',
        cookie: adminCookie,
        body: {
            id_menu: 'MNU002',
            id_cabang: 'CBG001',
            jenis: 'RUSAK',
            jumlah: 2,
            keterangan: 'Gelas pecah saat penyajian'
        }
    });
    assert.strictEqual(result.response.status, 200, result.text);
    assert.strictEqual(result.json.data.stok_sebelum, 12);
    assert.strictEqual(result.json.data.stok_baru, 10);
    assert.strictEqual(result.json.data.selisih, -2);

    // Reject KELUAR/RUSAK when jumlah > current stock
    result = await request('/api/stock/adjust', {
        method: 'POST',
        cookie: adminCookie,
        body: {
            id_menu: 'MNU002',
            id_cabang: 'CBG001',
            jenis: 'KELUAR',
            jumlah: 999,
            keterangan: 'Melebihi sisa stok'
        }
    });
    assert.strictEqual(result.response.status, 400, 'deducting more than available stock must be rejected');

    // 13c. Stock Opname (Physical vs System Reconciliation)
    result = await request('/api/stock/opname', {
        method: 'POST',
        cookie: adminCookie,
        body: {
            id_cabang: 'CBG001',
            catatan: 'Opname Tutup Shift',
            items: [
                { id_menu: 'MNU002', stok_fisik: 8, keterangan: 'Selisih 2 cup saat hitung fisik' },
                { id_menu: 'MNU003', stok_fisik: 20, keterangan: 'Sesuai / Surplus' }
            ]
        }
    });
    assert.strictEqual(result.response.status, 200, result.text);
    assert.strictEqual(result.json.data.total_checked, 2);
    const opnameMnu2 = result.json.data.items.find(i => i.id_menu === 'MNU002');
    assert.strictEqual(opnameMnu2.stok_sistem, 10);
    assert.strictEqual(opnameMnu2.stok_fisik, 8);
    assert.strictEqual(opnameMnu2.selisih, -2);
    assert.strictEqual(opnameMnu2.status_opname, 'Defisit');

    // 13d. Stock Movement History Logs (verify stok_awal, perubahan, stok_sisa, jenis, pengguna, alasan)
    const logsRes = await request('/api/stock/logs?cabang=CBG001&id_menu=MNU002', { cookie: adminCookie });
    assert.strictEqual(logsRes.response.status, 200);
    const recordedTypes = logsRes.json.data.map(l => l.jenis);
    assert(recordedTypes.includes('OPNAME'), 'OPNAME movement must be recorded');
    assert(recordedTypes.includes('RUSAK'), 'RUSAK movement must be recorded');
    assert(recordedTypes.includes('PENYESUAIAN'), 'PENYESUAIAN movement must be recorded');
    const latestOpnameLog = logsRes.json.data.find(l => l.jenis === 'OPNAME');
    assert.strictEqual(latestOpnameLog.stok_awal, 10);
    assert.strictEqual(latestOpnameLog.perubahan, -2);
    assert.strictEqual(latestOpnameLog.stok_sisa, 8);
    assert(latestOpnameLog.keterangan.includes('Selisih: -2'));

    // 13e. Duplicate cart line anti-overselling protection in POS checkout
    const dupOrderRes = await request('/api/orders', {
        method: 'POST',
        cookie: adminCookie,
        body: {
            id_cabang: 'CBG001',
            jenis_pesanan: 'Takeaway',
            metode_pembayaran: 'Cash',
            nominal_diterima: 500000,
            items: [
                { id_menu: 'MNU002', jumlah: 5 },
                { id_menu: 'MNU002', jumlah: 5 }
            ]
        }
    });
    assert.strictEqual(dupOrderRes.response.status, 400, 'duplicate cart lines exceeding total stock (8) must be rejected');

    // 13f. Controlled Bulk Restock persists.
    result = await request('/api/stock/restock-all', {
        method: 'POST',
        cookie: adminCookie,
        body: { id_cabang: 'CBG001', jumlah: 5, only_low_stock: true, keterangan: 'Restock item menipis' }
    });
    assert.strictEqual(result.response.status, 200, result.text);

    // 14. Logout revokes the server-side session and clears the cookie.
    result = await request('/api/auth/logout', { method: 'POST', cookie: adminCookie });
    assert.strictEqual(result.response.status, 200);
    assert(/Max-Age=0/i.test(result.response.headers.get('set-cookie') || ''));

    result = await request('/api/users', { cookie: adminCookie });
    assert.strictEqual(result.response.status, 401, 'revoked session must be rejected');

    console.log('All security and integration tests passed.');
})().catch(err => {
    console.error('Security test failed:', err.message);
    process.exitCode = 1;
}).finally(() => {
    if (server) server.close();
    try { db.db.close(); } catch (err) { /* already closed */ }
    fs.rmSync(tempDir, { recursive: true, force: true });
});
