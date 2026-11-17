/**
 * Comprehensive Audit Remediation Regression Suite (AUDIT-2026-11-18)
 * Tests backend invariants, concurrency/idempotency, >500-row aggregation,
 * historical tax snapshots, branch isolation, expiry enforcement, WIB boundaries,
 * production zero-demo bootstrap, RBAC, receipt snapshots, and DB backup/rollback.
 *
 * Uses isolated temporary SQLite files in os.tmpdir() — never touches operational DB.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomcherry-audit-rem-'));
const mainDbPath = path.join(tempDir, 'remediation.db');

process.env.NOMCHERRY_DB = mainDbPath;
process.env.SESSION_SECRET = 'audit-remediation-test-secret-32chars!';
process.env.LOG_REQUESTS = 'false';
process.env.NODE_ENV = 'test';
process.env.SEED_DEMO_DATA = 'true';

const app = require('../src/server');
const db = require('../src/database/db');
const dateService = require('../src/services/dateService');
const { createBackup, rollbackDatabase } = require('../src/scripts/db-backup');

async function createClient(baseUrl) {
    let cookie = '';
    return {
        getCookie: () => cookie,
        async request(method, urlPath, body, extraHeaders = {}) {
            const headers = { ...extraHeaders };
            if (cookie) headers.Cookie = cookie;
            if (body !== undefined) headers['Content-Type'] = 'application/json';

            const response = await fetch(`${baseUrl}${urlPath}`, {
                method,
                headers,
                body: body !== undefined ? JSON.stringify(body) : undefined
            });

            const setCookies = typeof response.headers.getSetCookie === 'function'
                ? response.headers.getSetCookie()
                : [response.headers.get('set-cookie')].filter(Boolean);
            if (setCookies.length > 0) {
                cookie = setCookies.map(item => item.split(';')[0]).join('; ');
            }

            const text = await response.text();
            let json = null;
            try { json = JSON.parse(text); } catch (e) { /* CSV or plain text */ }
            return { status: response.status, headers: response.headers, text, json };
        }
    };
}

let server;

(async () => {
    console.log('============================================================');
    console.log('  NOMCHERRY AUDIT REMEDIATION REGRESSION SUITE');
    console.log('============================================================');

    // ------------------------------------------------------------------
    // 1. PRODUCTION ZERO-DEMO BOOTSTRAP TEST (Subprocess with empty DB)
    // ------------------------------------------------------------------
    {
        const prodDbPath = path.join(tempDir, 'prod-empty.db');
        const bootstrapOut = execFileSync(
            process.execPath,
            [
                '-e',
                `
                delete process.env.SEED_DEMO_DATA;
                process.env.NODE_ENV = 'production';
                process.env.NOMCHERRY_DB = process.argv[1];
                const db = require('./src/database/db');
                const users = db.query('SELECT username, peran FROM pengguna');
                const orders = db.query('SELECT id_pesanan FROM pesanan');
                console.log(JSON.stringify({ demo: db.isDemoMode(), users: users.length, orders: orders.length }));
                db.db.close();
                `,
                prodDbPath
            ],
            { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }
        ).trim();

        const parsedEmpty = JSON.parse(bootstrapOut.split('\n').pop());
        assert.strictEqual(parsedEmpty.demo, false, 'Production mode must disable demo seed');
        assert.strictEqual(parsedEmpty.users, 0, 'Empty production DB must NOT create demo accounts');
        assert.strictEqual(parsedEmpty.orders, 0, 'Empty production DB must NOT create demo orders');

        // Bootstrap admin via CLI script on the empty production DB
        execFileSync(
            process.execPath,
            ['src/scripts/bootstrap-admin.js'],
            {
                cwd: path.resolve(__dirname, '..'),
                env: {
                    ...process.env,
                    SEED_DEMO_DATA: 'false',
                    NODE_ENV: 'production',
                    NOMCHERRY_DB: prodDbPath,
                    BOOTSTRAP_ADMIN_USERNAME: 'prod_admin',
                    BOOTSTRAP_ADMIN_PASSWORD: 'StrongProdPassword#2026'
                },
                stdio: 'pipe'
            }
        );

        const verifyAdminOut = execFileSync(
            process.execPath,
            [
                '-e',
                `
                delete process.env.SEED_DEMO_DATA;
                process.env.NOMCHERRY_DB = process.argv[1];
                const db = require('./src/database/db');
                const u = db.get('SELECT username, peran, kata_sandi FROM pengguna WHERE username = ?', ['prod_admin']);
                console.log(JSON.stringify({ exists: Boolean(u), role: u && u.peran, hashed: Boolean(u && u.kata_sandi.startsWith('scrypt$')) }));
                db.db.close();
                `,
                prodDbPath
            ],
            { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }
        ).trim();

        const parsedAdmin = JSON.parse(verifyAdminOut.split('\n').pop());
        assert.strictEqual(parsedAdmin.exists, true, 'Bootstrap CLI must create prod_admin');
        assert.strictEqual(parsedAdmin.role, 'admin', 'Bootstrap user must have admin role');
        assert.strictEqual(parsedAdmin.hashed, true, 'Bootstrap password must be PBKDF2 hashed');
        console.log('✓ [1/10] Production zero-demo bootstrap & secure CLI admin creation verified');
    }

    // Start HTTP server against isolated test DB
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const admin = await createClient(baseUrl);
    const manager = await createClient(baseUrl);
    const owner = await createClient(baseUrl);
    const kasir1 = await createClient(baseUrl);

    assert.strictEqual((await admin.request('POST', '/api/auth/login', { username: 'admin', kata_sandi: 'admin123' })).status, 200);
    assert.strictEqual((await manager.request('POST', '/api/auth/login', { username: 'manager1', kata_sandi: '123' })).status, 200);
    assert.strictEqual((await owner.request('POST', '/api/auth/login', { username: 'owner1', kata_sandi: '123' })).status, 200);
    assert.strictEqual((await kasir1.request('POST', '/api/auth/login', { username: 'daps', kata_sandi: '135' })).status, 200);

    // ------------------------------------------------------------------
    // 2. BRANCH ISOLATION & CASHIER CROSS-BRANCH ENFORCEMENT
    // ------------------------------------------------------------------
    {
        assert.strictEqual((await kasir1.request('GET', '/api/menu?cabang=CBG002')).status, 403, 'Cashier must be blocked from CBG002 menu');
        assert.strictEqual((await kasir1.request('GET', '/api/orders?cabang=CBG002')).status, 403, 'Cashier must be blocked from CBG002 orders');
        assert.strictEqual((await kasir1.request('GET', '/api/reports/dashboard?cabang=CBG002')).status, 403, 'Cashier must be blocked from CBG002 dashboard');
        assert.strictEqual((await kasir1.request('GET', '/api/settings?cabang=CBG002')).status, 403, 'Cashier must be blocked from CBG002 settings');
        assert.strictEqual((await kasir1.request('POST', '/api/orders', {
            id_cabang: 'CBG002',
            jenis_pesanan: 'Takeaway',
            metode_pembayaran: 'QRIS',
            qris_confirmed: true,
            items: [{ id_menu: 'MNU001', jumlah: 1 }]
        })).status, 403, 'Cashier must be blocked from creating orders in CBG002');

        // Admin can query both branches cleanly
        assert.strictEqual((await admin.request('GET', '/api/menu?cabang=CBG001')).status, 200);
        assert.strictEqual((await admin.request('GET', '/api/menu?cabang=CBG002')).status, 200);
        console.log('✓ [2/10] Branch authorization & cashier cross-branch 403 enforcement verified');
    }

    // ------------------------------------------------------------------
    // 3. MENU CREATION SINGLE-BRANCH STOCK + RECONCILIATION
    // ------------------------------------------------------------------
    let isolatedMenuId;
    {
        const createMenu = await admin.request('POST', '/api/menu', {
            id_cabang: 'CBG001',
            nama_menu: 'Single Origin Kayumas',
            kategori: 'Minuman',
            harga: 30000,
            stok: 25,
            min_stok: 5,
            deskripsi: 'Filter coffee uji isolasi stok cabang'
        });
        assert.strictEqual(createMenu.status, 200, 'Admin menu creation should succeed');
        isolatedMenuId = createMenu.json.data.id_menu;

        const mCbg1 = await admin.request('GET', `/api/menu/${isolatedMenuId}?cabang=CBG001`);
        const mCbg2 = await admin.request('GET', `/api/menu/${isolatedMenuId}?cabang=CBG002`);
        assert.strictEqual(mCbg1.json.data.stok, 25, 'Target branch CBG001 must receive 25 initial stock');
        assert.strictEqual(mCbg2.json.data.stok, 0, 'Other branch CBG002 must receive 0 initial stock (no duplication)');

        // Adjusting CBG002 stock does not touch CBG001
        const adj2 = await admin.request('POST', '/api/stock/adjust', {
            id_menu: isolatedMenuId,
            id_cabang: 'CBG002',
            jenis: 'MASUK',
            jumlah: 9,
            keterangan: 'Alokasi awal cabang timur'
        });
        assert.strictEqual(adj2.status, 200);
        assert.strictEqual((await admin.request('GET', `/api/menu/${isolatedMenuId}?cabang=CBG001`)).json.data.stok, 25);
        assert.strictEqual((await admin.request('GET', `/api/menu/${isolatedMenuId}?cabang=CBG002`)).json.data.stok, 9);

        // Read-only stock reconciliation endpoint works without mutating stock
        const recon = await admin.request('GET', '/api/stock/reconciliation?cabang=CBG001');
        assert.strictEqual(recon.status, 200);
        assert(recon.json.data.total_checked >= 25, 'Reconciliation should inspect branch stock');
        assert.strictEqual((await admin.request('GET', `/api/menu/${isolatedMenuId}?cabang=CBG001`)).json.data.stok, 25);
        console.log('✓ [3/10] Single-branch menu stock allocation, isolation & read-only reconciliation verified');
    }

    // ------------------------------------------------------------------
    // 4. IDEMPOTENT CHECKOUT (CONCURRENT + RETRY + 409 CONFLICT)
    // ------------------------------------------------------------------
    {
        dateService.setClock('2026-11-18T03:00:00.000Z'); // 10:00 WIB
        const beforeStock = (await admin.request('GET', `/api/menu/${isolatedMenuId}?cabang=CBG001`)).json.data.stok;
        const beforeOrders = db.get('SELECT COUNT(*) AS c FROM pesanan').c;
        const beforePay = db.get('SELECT COUNT(*) AS c FROM pembayaran').c;
        const beforeReceipts = db.get('SELECT COUNT(*) AS c FROM struk').c;

        const idemKey = 'idem-concurrent-test-001';
        const orderBody = {
            id_cabang: 'CBG001',
            nama_pelanggan: 'Pelanggan Idempoten',
            jenis_pesanan: 'Takeaway',
            metode_pembayaran: 'QRIS',
            qris_confirmed: true,
            items: [{ id_menu: isolatedMenuId, jumlah: 2 }]
        };

        // Fire two simultaneous requests with identical Idempotency-Key
        const [r1, r2] = await Promise.all([
            kasir1.request('POST', '/api/orders', orderBody, { 'Idempotency-Key': idemKey }),
            kasir1.request('POST', '/api/orders', orderBody, { 'Idempotency-Key': idemKey })
        ]);

        assert.strictEqual(r1.status, 200);
        assert.strictEqual(r2.status, 200);
        assert.strictEqual(r1.json.data.id_pesanan, r2.json.data.id_pesanan, 'Both concurrent requests must return the exact same order ID');

        // Retry after simulated lost response
        const r3 = await kasir1.request('POST', '/api/orders', orderBody, { 'Idempotency-Key': idemKey });
        assert.strictEqual(r3.status, 200);
        assert.strictEqual(r3.json.idempotent_replay, true, 'Retry with same key must be marked idempotent_replay');
        assert.strictEqual(r3.json.data.id_pesanan, r1.json.data.id_pesanan);

        const afterStock = (await admin.request('GET', `/api/menu/${isolatedMenuId}?cabang=CBG001`)).json.data.stok;
        assert.strictEqual(afterStock, beforeStock - 2, 'Stock must decrement ONLY ONCE across 3 requests with same Idempotency-Key');
        assert.strictEqual(db.get('SELECT COUNT(*) AS c FROM pesanan').c, beforeOrders + 1, 'Exactly 1 pesanan row created');
        assert.strictEqual(db.get('SELECT COUNT(*) AS c FROM pembayaran').c, beforePay + 1, 'Exactly 1 pembayaran row created');
        assert.strictEqual(db.get('SELECT COUNT(*) AS c FROM struk').c, beforeReceipts + 1, 'Exactly 1 struk row created');

        // Same key + different payload -> 409 Conflict
        const rConflict = await kasir1.request('POST', '/api/orders', {
            ...orderBody,
            items: [{ id_menu: isolatedMenuId, jumlah: 3 }]
        }, { 'Idempotency-Key': idemKey });
        assert.strictEqual(rConflict.status, 409, 'Reusing Idempotency-Key with different payload must return 409 Conflict');
        console.log('✓ [4/10] Atomic checkout idempotency (parallel, retry replay, 409 conflict) verified');
    }

    // ------------------------------------------------------------------
    // 5. EXPIRED STOCK REJECTION vs H-0 NEAR-EXPIRY POLICY
    // ------------------------------------------------------------------
    {
        dateService.setClock('2026-11-18T04:00:00.000Z'); // 2026-11-18 WIB
        // Set expiry to yesterday (2026-11-17) on CBG001
        await admin.request('POST', '/api/stock/adjust', {
            id_menu: isolatedMenuId,
            id_cabang: 'CBG001',
            jenis: 'PENYESUAIAN',
            jumlah: 20,
            tanggal_kadaluarsa: '2026-11-17',
            keterangan: 'Set tanggal kedaluwarsa kemarin'
        });

        const menuCheckExp = await kasir1.request('GET', `/api/menu/${isolatedMenuId}?cabang=CBG001`);
        assert.strictEqual(menuCheckExp.json.data.is_expired, true, 'Menu API must flag yesterday expiry as is_expired=true');

        const ordersBeforeReject = db.get('SELECT COUNT(*) AS c FROM pesanan').c;
        const rejectExpired = await kasir1.request('POST', '/api/orders', {
            id_cabang: 'CBG001',
            jenis_pesanan: 'Takeaway',
            metode_pembayaran: 'Cash',
            nominal_diterima: 50000,
            items: [{ id_menu: isolatedMenuId, jumlah: 1 }]
        });
        assert.strictEqual(rejectExpired.status, 400, 'Expired stock must be rejected at checkout with 400');
        assert.strictEqual(rejectExpired.json.code, 'STOCK_EXPIRED');
        assert.strictEqual(db.get('SELECT COUNT(*) AS c FROM pesanan').c, ordersBeforeReject, 'No partial order written on expired rejection');
        assert.strictEqual((await admin.request('GET', `/api/menu/${isolatedMenuId}?cabang=CBG001`)).json.data.stok, 20, 'Stock untouched after expired rejection');

        // H-0 policy: expiry == today (2026-11-18) is valid until end of day with is_near_expiry=true
        await admin.request('POST', '/api/stock/adjust', {
            id_menu: isolatedMenuId,
            id_cabang: 'CBG001',
            jenis: 'PENYESUAIAN',
            jumlah: 20,
            tanggal_kadaluarsa: '2026-11-18',
            keterangan: 'Set kedaluwarsa hari ini (H-0)'
        });
        const menuCheckH0 = await kasir1.request('GET', `/api/menu/${isolatedMenuId}?cabang=CBG001`);
        assert.strictEqual(menuCheckH0.json.data.is_expired, false, 'H-0 expiry must not be marked expired yet');
        assert.strictEqual(menuCheckH0.json.data.is_near_expiry, true, 'H-0 expiry must be marked near expiry');

        const allowH0 = await kasir1.request('POST', '/api/orders', {
            id_cabang: 'CBG001',
            jenis_pesanan: 'Takeaway',
            metode_pembayaran: 'Cash',
            nominal_diterima: 50000,
            items: [{ id_menu: isolatedMenuId, jumlah: 1 }]
        });
        assert.strictEqual(allowH0.status, 200, 'H-0 item should still be sellable until end of business day');

        // Clear expiry back to future for subsequent tests
        await admin.request('POST', '/api/stock/adjust', {
            id_menu: isolatedMenuId,
            id_cabang: 'CBG001',
            jenis: 'PENYESUAIAN',
            jumlah: 100,
            tanggal_kadaluarsa: '2027-06-01',
            keterangan: 'Batch baru'
        });
        console.log('✓ [5/10] Expired stock blocking (< today) & H-0 near-expiry policy verified');
    }

    // ------------------------------------------------------------------
    // 6. HISTORICAL TAX INVARIANCE & RECEIPT SNAPSHOT ISOLATION
    // ------------------------------------------------------------------
    {
        dateService.setClock('2026-11-18T05:00:00.000Z');
        // Ensure tax_rate is 10% and set known branch identities
        await admin.request('PUT', '/api/settings', {
            cafe_name: 'NomCherry Brand Awal',
            tax_rate: 10,
            receipt_footer: 'Footer Versi 1',
            id_cabang: 'CBG001',
            branch_name: 'NomCherry Pusat Tunjungan',
            branch_address: 'Jl. Tunjungan No. 88',
            branch_phone: '031-111111'
        });
        await admin.request('PUT', '/api/branches/CBG002', {
            nama_cabang: 'NomCherry Timur Darmo',
            alamat: 'Jl. Darmo Permai No. 12',
            no_telp: '031-222222'
        });

        // Create 1 order on CBG001 (Rp 30.000 + 10% tax = Rp 33.000) and 1 order on CBG002
        const ordCbg1 = await admin.request('POST', '/api/orders', {
            id_cabang: 'CBG001',
            nama_pelanggan: 'Tamu Pajak 10%',
            jenis_pesanan: 'Takeaway',
            metode_pembayaran: 'QRIS',
            qris_confirmed: true,
            items: [{ id_menu: isolatedMenuId, jumlah: 1 }]
        });
        assert.strictEqual(ordCbg1.status, 200);
        assert.strictEqual(ordCbg1.json.data.pajak, 3000);
        assert.strictEqual(ordCbg1.json.data.tarif_pajak, 10);

        const ordCbg2 = await admin.request('POST', '/api/orders', {
            id_cabang: 'CBG002',
            nama_pelanggan: 'Tamu Cabang Timur',
            jenis_pesanan: 'Takeaway',
            metode_pembayaran: 'QRIS',
            qris_confirmed: true,
            items: [{ id_menu: isolatedMenuId, jumlah: 1 }]
        });
        assert.strictEqual(ordCbg2.status, 200);
        assert.strictEqual(ordCbg2.json.data.receipt.nama_cabang, 'NomCherry Timur Darmo');
        assert.strictEqual(ordCbg2.json.data.receipt.alamat_cabang, 'Jl. Darmo Permai No. 12');

        const dashBeforeTaxChange = await admin.request('GET', '/api/reports/dashboard?cabang=CBG001&range=today');
        const storedTaxBefore = dashBeforeTaxChange.json.data.totals.tax_sum;

        // Now change global tax_rate to 12%, cafe_name, footer, AND branch address!
        const updateSet = await admin.request('PUT', '/api/settings', {
            cafe_name: 'NomCherry Brand Baru 2027',
            tax_rate: 12,
            receipt_footer: 'Footer Baru 2027',
            id_cabang: 'CBG001',
            branch_name: 'Cabang Pusat Pindah',
            branch_address: 'Jl. Pemuda No. 999',
            branch_phone: '031-999999'
        });
        assert.strictEqual(updateSet.status, 200);

        // Historical tax sum MUST NOT change!
        const dashAfterTaxChange = await admin.request('GET', '/api/reports/dashboard?cabang=CBG001&range=today');
        assert.strictEqual(
            dashAfterTaxChange.json.data.totals.tax_sum,
            storedTaxBefore,
            'Changing tax_rate to 12% must NOT alter historical tax sum'
        );

        // Historical receipt reprint MUST retain original snapshot!
        const reprint1 = await admin.request('GET', `/api/orders/${ordCbg1.json.data.id_pesanan}`);
        assert.strictEqual(reprint1.json.data.receipt.nama_kafe, 'NomCherry Brand Awal');
        assert.strictEqual(reprint1.json.data.receipt.nama_cabang, 'NomCherry Pusat Tunjungan');
        assert.strictEqual(reprint1.json.data.receipt.alamat_cabang, 'Jl. Tunjungan No. 88');
        assert.strictEqual(reprint1.json.data.receipt.footer_struk, 'Footer Versi 1');
        assert.strictEqual(reprint1.json.data.receipt.tarif_pajak, 10);

        // Restore tax_rate to 10%
        await admin.request('PUT', '/api/settings', { tax_rate: 10 });
        console.log('✓ [6/10] Historical tax invariance & per-branch receipt snapshot immutability verified');
    }

    // ------------------------------------------------------------------
    // 7. WIB BUSINESS-DAY BOUNDARIES & STRICT DATE VALIDATION
    // ------------------------------------------------------------------
    {
        // Clean dedicated branch test or check exact date boundaries in WIB (UTC+7):
        // 2026-11-19 23:55 WIB == 2026-11-19T16:55:00.000Z (belongs to 2026-11-19 WIB)
        // 2026-11-20 00:05 WIB == 2026-11-19T17:05:00.000Z (belongs to 2026-11-20 WIB, even though UTC date is still Nov 19!)
        // 2026-11-20 06:30 WIB == 2026-11-19T23:30:00.000Z (belongs to 2026-11-20 WIB)
        // 2026-11-20 07:30 WIB == 2026-11-20T00:30:00.000Z (belongs to 2026-11-20 WIB)
        await admin.request('POST', '/api/stock/adjust', {
            id_menu: isolatedMenuId,
            id_cabang: 'CBG002',
            jenis: 'PENYESUAIAN',
            jumlah: 50,
            keterangan: 'Stok uji batas zona waktu WIB'
        });

        dateService.setClock('2026-11-19T16:55:00.000Z'); // 23:55 WIB Nov 19
        const o2355 = await admin.request('POST', '/api/orders', {
            id_cabang: 'CBG002',
            jenis_pesanan: 'Takeaway',
            metode_pembayaran: 'Cash',
            nominal_diterima: 40000,
            items: [{ id_menu: isolatedMenuId, jumlah: 1 }]
        });
        assert(o2355.json.data.nomor_struk.startsWith('NC-20261119-'), '23:55 WIB must get Nov 19 receipt date code');

        dateService.setClock('2026-11-19T17:05:00.000Z'); // 00:05 WIB Nov 20
        const o0005 = await admin.request('POST', '/api/orders', {
            id_cabang: 'CBG002',
            jenis_pesanan: 'Takeaway',
            metode_pembayaran: 'QRIS',
            qris_confirmed: true,
            items: [{ id_menu: isolatedMenuId, jumlah: 1 }]
        });
        assert(o0005.json.data.nomor_struk.startsWith('NC-20261120-'), '00:05 WIB must get Nov 20 receipt date code');

        dateService.setClock('2026-11-19T23:30:00.000Z'); // 06:30 WIB Nov 20
        await admin.request('POST', '/api/orders', {
            id_cabang: 'CBG002',
            jenis_pesanan: 'Takeaway',
            metode_pembayaran: 'Debit',
            items: [{ id_menu: isolatedMenuId, jumlah: 1 }]
        });

        dateService.setClock('2026-11-20T00:30:00.000Z'); // 07:30 WIB Nov 20
        await admin.request('POST', '/api/orders', {
            id_cabang: 'CBG002',
            jenis_pesanan: 'Takeaway',
            metode_pembayaran: 'QRIS',
            qris_confirmed: true,
            items: [{ id_menu: isolatedMenuId, jumlah: 1 }]
        });

        // Query today (2026-11-20 WIB): must include 00:05, 06:30, 07:30 (3 orders) and exclude 23:55 Nov 19!
        const dashNov20 = await admin.request('GET', '/api/reports/dashboard?cabang=CBG002&range=today');
        assert.strictEqual(dashNov20.json.data.totals.order_count, 3, 'Nov 20 WIB today dashboard must contain exactly the 3 Nov 20 WIB orders');

        const pb = dashNov20.json.data.payment_breakdown;
        const sumMethods = pb.QRIS.total + pb.Cash.total + pb.Debit.total + pb.Transfer.total;
        assert.strictEqual(sumMethods, dashNov20.json.data.totals.gross_total, 'Payment breakdown sum must equal period gross_total');

        // Strict invalid calendar date rejection (400)
        for (const badDate of ['2026-02-30', '2026-13-01', '2026-04-31', 'invalid-date']) {
            assert.strictEqual((await admin.request('GET', `/api/orders?date=${badDate}`)).status, 400, `Orders filter must reject ${badDate}`);
            assert.strictEqual((await admin.request('GET', `/api/reports/analytics?date_start=${badDate}`)).status, 400, `Analytics must reject ${badDate}`);
            assert.strictEqual((await admin.request('GET', `/api/reports/sales?date_end=${badDate}`)).status, 400, `Sales report must reject ${badDate}`);
        }
        console.log('✓ [7/10] WIB timezone boundaries (23:55/00:05 & 06:30/07:30) & 400 invalid date validation verified');
    }

    // ------------------------------------------------------------------
    // 8. FULL-DATASET AGGREGATION (>500 ORDERS) vs PAGINATED LISTING
    // ------------------------------------------------------------------
    {
        dateService.setClock('2026-11-25T05:00:00.000Z'); // 2026-11-25 12:00 WIB
        const bulkCount = 525;
        const unitSubtotal = 20000;
        const unitTax = 2000;
        const unitTotal = 22000;

        db.transaction(() => {
            for (let i = 1; i <= bulkCount; i++) {
                const id = `PSNBULK${String(i).padStart(4, '0')}`;
                const byrId = `BYRBULK${String(i).padStart(4, '0')}`;
                const strId = `STRBULK${String(i).padStart(4, '0')}`;
                const metode = i % 3 === 0 ? 'Debit' : (i % 2 === 0 ? 'Cash' : 'QRIS');
                const iso = '2026-11-25T04:00:00.000Z';
                db.run(
                    `INSERT INTO pesanan (id_pesanan, id_pengguna, id_cabang, nama_pelanggan, jenis_pesanan, nomor_meja, tanggal_pesanan, subtotal, pajak, tarif_pajak, diskon, total, status, status_dapur)
                     VALUES (?, 'USR001', 'CBG001', 'Bulk Customer', 'Takeaway', '-', ?, ?, ?, 10, 0, ?, 'completed', 'served')`,
                    [id, iso, unitSubtotal, unitTax, unitTotal]
                );
                db.run(
                    `INSERT INTO detail_pesanan (id_detail, id_pesanan, id_menu, nama_menu, harga_satuan, jumlah, subtotal)
                     VALUES (?, ?, 'MNU001', 'Caffe Americano', ?, 1, ?)`,
                    [`DETBULK${i}`, id, unitSubtotal, unitSubtotal]
                );
                db.run(
                    `INSERT INTO pembayaran (id_pembayaran, id_pesanan, metode, total_bayar, nominal_diterima, kembalian, tanggal_bayar, referensi)
                     VALUES (?, ?, ?, ?, ?, 0, ?, '')`,
                    [byrId, id, metode, unitTotal, unitTotal, iso]
                );
                db.run(
                    `INSERT INTO struk (id_struk, id_pembayaran, id_pesanan, nomor_struk, tanggal_cetak)
                     VALUES (?, ?, ?, ?, ?)`,
                    [strId, byrId, id, `NC-20261125-B${i}`, iso]
                );
            }
        });

        // Paginated /api/orders returns 25 rows per page, while summary reflects ALL 525 orders on 2026-11-25!
        const ordPage1 = await admin.request('GET', '/api/orders?cabang=CBG001&date=2026-11-25&limit=25&offset=0');
        assert.strictEqual(ordPage1.status, 200);
        assert.strictEqual(ordPage1.json.data.length, 25, 'Page 1 must contain 25 rows');
        assert.strictEqual(ordPage1.json.summary.total_orders, bulkCount, 'Summary must aggregate all 525 orders without 500-row truncation');
        assert.strictEqual(ordPage1.json.summary.gross_total, bulkCount * unitTotal);
        assert.strictEqual(ordPage1.json.pagination.total_pages, Math.ceil(bulkCount / 25));
        assert.strictEqual(ordPage1.json.pagination.has_next, true);

        // Dashboard for today (2026-11-25) aggregates all 525 orders and excludes Nov 18-20 orders!
        const dashBulk = await admin.request('GET', '/api/reports/dashboard?cabang=CBG001&range=today');
        assert.strictEqual(dashBulk.json.data.totals.order_count, bulkCount, 'Dashboard today must aggregate all 525 orders');
        assert.strictEqual(dashBulk.json.data.totals.gross_total, bulkCount * unitTotal);
        assert.strictEqual(dashBulk.json.data.totals.tax_sum, bulkCount * unitTax);
        assert.strictEqual(
            dashBulk.json.data.payment_breakdown.QRIS.total +
            dashBulk.json.data.payment_breakdown.Cash.total +
            dashBulk.json.data.payment_breakdown.Debit.total,
            bulkCount * unitTotal,
            'Payment breakdown must match full 525-order gross total'
        );

        // Analytics for 2026-11-25 also aggregates all 525 orders
        const anBulk = await admin.request('GET', '/api/reports/analytics?cabang=CBG001&date_start=2026-11-25&date_end=2026-11-25');
        assert.strictEqual(anBulk.json.data.summary.total_transaksi, bulkCount);
        assert.strictEqual(anBulk.json.data.summary.total_pendapatan, bulkCount * unitTotal);
        console.log('✓ [8/10] Full-dataset SQL aggregation (>500 rows) & period boundary exclusion verified');
    }

    // ------------------------------------------------------------------
    // 9. SETTINGS RBAC + PASSWORD CHANGE & SESSION REVOCATION
    // ------------------------------------------------------------------
    {
        // Cashier & Owner get read-only permissions and 403 on PUT /api/settings
        const kasirSet = await kasir1.request('GET', '/api/settings');
        assert.strictEqual(kasirSet.json.data.permissions.can_edit_business, false);
        assert.strictEqual(kasirSet.json.data.permissions.can_edit_branch, false);
        assert.strictEqual((await kasir1.request('PUT', '/api/settings', { cafe_name: 'Hack' })).status, 403);
        assert.strictEqual((await owner.request('PUT', '/api/settings', { cafe_name: 'Hack' })).status, 403);

        // Manager can edit global business settings, but gets 403 on branch identity fields
        const mgrSet = await manager.request('GET', '/api/settings');
        assert.strictEqual(mgrSet.json.data.permissions.can_edit_business, true);
        assert.strictEqual(mgrSet.json.data.permissions.can_edit_branch, false);
        assert.strictEqual((await manager.request('PUT', '/api/settings', { receipt_footer: 'Footer oleh Manager' })).status, 200);
        assert.strictEqual((await manager.request('PUT', '/api/settings', { branch_address: 'Alamat Ilegal Manager' })).status, 403);

        // Password change revokes other active sessions of the same user
        const kasirSecondDevice = await createClient(baseUrl);
        assert.strictEqual((await kasirSecondDevice.request('POST', '/api/auth/login', { username: 'daps', kata_sandi: '135' })).status, 200);

        const pwdChange = await kasir1.request('POST', '/api/auth/change-password', {
            kata_sandi_lama: '135',
            kata_sandi_baru: 'KasirAman#2026'
        });
        assert.strictEqual(pwdChange.status, 200, 'Cashier should be able to change own password');
        assert.strictEqual((await kasir1.request('GET', '/api/auth/session')).status, 200, 'Current device session remains valid');
        assert.strictEqual((await kasirSecondDevice.request('GET', '/api/auth/session')).status, 401, 'Other device session must be revoked');

        // Admin reset-password revokes all target user sessions
        const adminReset = await admin.request('POST', '/api/users/USR002/reset-password', {
            kata_sandi_baru: 'ResetOlehAdmin#99'
        });
        assert.strictEqual(adminReset.status, 200);
        assert.strictEqual((await kasir1.request('GET', '/api/auth/session')).status, 401, 'Resetting user password must revoke active sessions');

        dateService.resetClock();
        console.log('✓ [9/10] Settings RBAC matrix & password change/reset session revocation verified');
    }

    // ------------------------------------------------------------------
    // 10. DATABASE BACKUP & ROLLBACK ROUND-TRIP
    // ------------------------------------------------------------------
    {
        server.close();
        try { db.db.close(); } catch (e) {}

        const backupFile = path.join(tempDir, 'backups', 'roundtrip-backup.db');
        const savedBackupPath = createBackup(mainDbPath, backupFile);
        assert(fs.existsSync(savedBackupPath), 'Backup file must exist');
        assert(fs.statSync(savedBackupPath).size > 0, 'Backup file must be non-empty');

        // Mutate mainDbPath after backup
        const { DatabaseSync } = require('node:sqlite');
        const mutatedConn = new DatabaseSync(mainDbPath);
        const countBeforeMutate = mutatedConn.prepare('SELECT COUNT(*) AS c FROM menu').get().c;
        mutatedConn.prepare("INSERT INTO menu (id_menu, nama_menu, kategori, harga, stok) VALUES ('MNUTMP999', 'Temp Mutated', 'Snack', 10000, 1)").run();
        assert.strictEqual(mutatedConn.prepare('SELECT COUNT(*) AS c FROM menu').get().c, countBeforeMutate + 1);
        mutatedConn.close();

        // Restore from backup
        const restoredPath = rollbackDatabase(savedBackupPath, mainDbPath);
        assert.strictEqual(restoredPath, mainDbPath, 'Rollback must target main DB path');

        const verifyConn = new DatabaseSync(mainDbPath, { readOnly: true });
        const countAfterRestore = verifyConn.prepare('SELECT COUNT(*) AS c FROM menu').get().c;
        verifyConn.close();
        assert.strictEqual(countAfterRestore, countBeforeMutate, 'Rollback must restore exact pre-mutation state');
        console.log('✓ [10/10] SQLite VACUUM INTO backup & rollback round-trip verified');
    }

    console.log('============================================================');
    console.log('  ALL 10 AUDIT REMEDIATION BACKEND SUITES PASSED (100%)');
    console.log('============================================================');
})().catch(err => {
    console.error('Audit remediation test failed:', err);
    process.exitCode = 1;
}).finally(() => {
    dateService.resetClock();
    if (server) {
        try { server.close(); } catch (e) {}
    }
    try { db.db.close(); } catch (e) {}
    fs.rmSync(tempDir, { recursive: true, force: true });
});
