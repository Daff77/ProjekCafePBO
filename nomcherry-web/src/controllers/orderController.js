/**
 * Order & Checkout Controller for NomCherry Café
 * Implements test cases 3.1 - 3.4, 4.1 - 4.5, 5.1 - 5.3
 */

const db = require('../database/db');
const { getTaxRate } = require('../services/settingsService');
const dateService = require('../services/dateService');

const ORDER_TYPES = {
    'dine-in': 'Dine-In',
    'dine in': 'Dine-In',
    'dinein': 'Dine-In',
    'takeaway': 'Takeaway',
    'take away': 'Takeaway',
    'delivery': 'Delivery'
};

const PAYMENT_METHODS = {
    cash: 'Cash',
    tunai: 'Cash',
    qris: 'QRIS',
    debit: 'Debit',
    edc: 'Debit',
    'kartu edc': 'Debit',
    card: 'Debit',
    transfer: 'Transfer'
};

const MAX_ITEMS_PER_ORDER = 100;
const MAX_QTY_PER_ITEM = 10000;
const MAX_PAGE_SIZE = 500;

function normalizeOrderType(type) {
    if (typeof type !== 'string') return null;
    return ORDER_TYPES[type.trim().toLowerCase()] || null;
}

function normalizePaymentMethod(method) {
    if (method === undefined || method === null || String(method).trim() === '') return null;
    return PAYMENT_METHODS[String(method).trim().toLowerCase()] || null;
}

function serverError(res, err, context) {
    console.error(`[orderController] ${context}:`, err.message);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' });
}

exports.createOrder = (req, res) => {
    try {
        const body = req.body || {};
        const {
            id_pengguna,
            id_cabang,
            nama_pelanggan,
            jenis_pesanan,
            nomor_meja,
            items,
            metode_pembayaran,
            nominal_diterima,
            qris_confirmed,
            referensi,
            diskon = 0,
            catatan = ''
        } = body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Keranjang kosong'
            });
        }

        if (items.length > MAX_ITEMS_PER_ORDER) {
            return res.status(400).json({
                success: false,
                message: `Jumlah item dalam satu pesanan maksimal ${MAX_ITEMS_PER_ORDER}`
            });
        }

        let finalOrderType;
        let finalTableNum;
        const rawMeja = typeof nomor_meja === 'string' ? nomor_meja.trim() : '';

        if (jenis_pesanan !== undefined && jenis_pesanan !== null && String(jenis_pesanan).trim() !== '') {
            finalOrderType = normalizeOrderType(String(jenis_pesanan));
            if (!finalOrderType) {
                return res.status(400).json({
                    success: false,
                    message: 'Jenis pesanan tidak valid (pilih Dine-In, Takeaway, atau Delivery)'
                });
            }
            if (finalOrderType === 'Dine-In') {
                if (!rawMeja || ['-', 'takeaway', 'take away', 'delivery'].includes(rawMeja.toLowerCase())) {
                    return res.status(400).json({
                        success: false,
                        message: 'Nomor meja wajib diisi untuk pesanan Dine-In'
                    });
                }
                finalTableNum = rawMeja;
            } else {
                finalTableNum = '-';
            }
        } else {
            const inferredFromMeja = normalizeOrderType(rawMeja);
            if (inferredFromMeja === 'Takeaway' || inferredFromMeja === 'Delivery') {
                finalOrderType = inferredFromMeja;
                finalTableNum = '-';
            } else if (rawMeja && rawMeja !== '-') {
                finalOrderType = 'Dine-In';
                finalTableNum = rawMeja;
            } else {
                finalOrderType = 'Takeaway';
                finalTableNum = '-';
            }
        }

        const rawMethod = metode_pembayaran !== undefined ? metode_pembayaran : 'Cash';
        const paymentMethod = normalizePaymentMethod(rawMethod);
        if (!paymentMethod) {
            return res.status(400).json({ success: false, message: 'Metode pembayaran tidak valid' });
        }

        const activeCabangId = req.user && req.user.peran === 'kasir'
            ? req.user.id_cabang
            : (id_cabang || (req.user && req.user.id_cabang) || 'CBG001');
        const activeUserId = (req.user && req.user.id_pengguna) || id_pengguna || 'USR001';

        if (!db.get('SELECT id_cabang FROM cabang WHERE id_cabang = ?', [activeCabangId])) {
            return res.status(400).json({ success: false, message: 'Cabang tidak ditemukan' });
        }
        if (!db.get('SELECT id_pengguna FROM pengguna WHERE id_pengguna = ?', [activeUserId])) {
            return res.status(400).json({ success: false, message: 'Pengguna tidak ditemukan' });
        }

        let calculatedSubtotal = 0;
        const validatedItems = [];
        const cumulativeQtyByMenu = new Map();

        for (const item of items) {
            if (!item || typeof item.id_menu !== 'string' || item.id_menu.trim() === '') {
                return res.status(400).json({ success: false, message: 'Item pesanan tidak valid' });
            }

            const menu = db.get('SELECT * FROM menu WHERE id_menu = ?', [item.id_menu]);
            if (!menu) {
                return res.status(404).json({
                    success: false,
                    message: `Menu dengan ID ${item.id_menu} tidak ditemukan`
                });
            }

            if (!menu.is_available) {
                return res.status(400).json({
                    success: false,
                    message: `Menu ${menu.nama_menu} sedang tidak tersedia`
                });
            }

            const requestedQty = Number(item.jumlah ?? item.qty ?? 1);

            if (!Number.isInteger(requestedQty) || requestedQty <= 0 || requestedQty > MAX_QTY_PER_ITEM) {
                return res.status(400).json({
                    success: false,
                    message: `Jumlah pesanan untuk ${menu.nama_menu} tidak valid`
                });
            }

            const branchStock = db.syncBranchStockRow(activeCabangId, menu.id_menu);
            const availableStock = branchStock ? branchStock.stok : menu.stok;
            const totalRequestedForMenu = (cumulativeQtyByMenu.get(menu.id_menu) || 0) + requestedQty;

            if (availableStock <= 0) {
                return res.status(400).json({
                    success: false,
                    message: `Stok habis untuk menu ${menu.nama_menu}`
                });
            }

            if (totalRequestedForMenu > availableStock) {
                return res.status(400).json({
                    success: false,
                    message: `Stok tidak cukup untuk menu ${menu.nama_menu} (Sisa stok: ${availableStock})`
                });
            }

            cumulativeQtyByMenu.set(menu.id_menu, totalRequestedForMenu);

            const itemSubtotal = menu.harga * requestedQty;
            calculatedSubtotal += itemSubtotal;

            validatedItems.push({
                id_menu: menu.id_menu,
                nama_menu: menu.nama_menu,
                harga: menu.harga,
                jumlah: requestedQty,
                subtotal: itemSubtotal
            });
        }

        const requestedDiscount = Math.max(0, Math.floor(parseFloat(diskon) || 0));
        const diskonNominal = Math.min(requestedDiscount, calculatedSubtotal);
        const taxableAmount = Math.max(0, calculatedSubtotal - diskonNominal);
        const taxRate = getTaxRate();
        const pajak = Math.round(taxableAmount * (taxRate / 100));
        const grandTotal = taxableAmount + pajak;

        let received = grandTotal;
        let kembalian = 0;

        if (paymentMethod === 'Cash') {
            const rawCash = nominal_diterima;
            const parsedReceived = (rawCash === undefined || rawCash === null || String(rawCash).trim() === '')
                ? NaN
                : Number(rawCash);

            if (!Number.isFinite(parsedReceived)) {
                return res.status(400).json({
                    success: false,
                    message: 'Nominal uang diterima wajib diisi untuk pembayaran Tunai (Cash)'
                });
            }

            if (parsedReceived < grandTotal) {
                return res.status(400).json({
                    success: false,
                    message: `Nominal uang tunai kurang. Total: Rp ${grandTotal.toLocaleString('id-ID')}, Diterima: Rp ${parsedReceived.toLocaleString('id-ID')}`
                });
            }

            received = parsedReceived;
            kembalian = received - grandTotal;
        } else if (paymentMethod === 'QRIS') {
            const isConfirmed = qris_confirmed === true || qris_confirmed === 'true' || qris_confirmed === 1;
            if (!isConfirmed) {
                return res.status(400).json({
                    success: false,
                    message: 'Pembayaran QRIS belum dikonfirmasi. Silakan konfirmasi pembayaran QRIS terlebih dahulu.'
                });
            }
            received = grandTotal;
            kembalian = 0;
        } else {
            received = grandTotal;
            kembalian = 0;
        }

        let paymentRef = '';
        const finalCatatan = (typeof catatan === 'string' && catatan.trim())
            ? catatan.trim()
            : (finalOrderType === 'Delivery' ? 'Pesanan Delivery' : 'Order POS');

        const now = new Date();
        const nowIso = now.toISOString();
        const dateCode = dateService.today().replace(/-/g, '');

        let orderId;
        let pmbId;
        let strId;
        let nomorStruk;

        db.transaction(() => {
            const allOrders = db.query('SELECT id_pesanan FROM pesanan');
            let maxOrderNum = 0;
            allOrders.forEach(o => {
                const num = parseInt(o.id_pesanan.replace('PSN', ''), 10);
                if (!isNaN(num) && num > maxOrderNum) maxOrderNum = num;
            });
            orderId = 'PSN' + String(maxOrderNum + 1).padStart(3, '0');
            pmbId = 'BYR' + String(maxOrderNum + 1).padStart(3, '0');
            strId = 'STR' + String(maxOrderNum + 1).padStart(3, '0');
            nomorStruk = `NC-${dateCode}-${String(maxOrderNum + 1).padStart(3, '0')}`;

            const customRef = typeof referensi === 'string' ? referensi.trim() : '';
            if (paymentMethod === 'QRIS') {
                paymentRef = customRef || ('QRIS-' + orderId);
            } else if (paymentMethod === 'Debit') {
                paymentRef = customRef || ('EDC-' + orderId);
            } else if (paymentMethod === 'Transfer') {
                paymentRef = customRef || ('TRF-' + orderId);
            } else {
                paymentRef = customRef || '';
            }

            db.run(
                `INSERT INTO pesanan (id_pesanan, id_pengguna, id_cabang, nama_pelanggan, jenis_pesanan, nomor_meja, tanggal_pesanan, subtotal, pajak, diskon, total, status, status_dapur, catatan)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', 'pending', ?)`,
                [
                    orderId,
                    activeUserId,
                    activeCabangId,
                    nama_pelanggan ? String(nama_pelanggan).trim() : 'Pelanggan Umum',
                    finalOrderType,
                    finalTableNum,
                    nowIso,
                    calculatedSubtotal,
                    pajak,
                    diskonNominal,
                    grandTotal,
                    finalCatatan
                ]
            );

            validatedItems.forEach((it, idx) => {
                const branchRowBefore = db.syncBranchStockRow(activeCabangId, it.id_menu);
                const stokAwal = branchRowBefore ? branchRowBefore.stok : 0;

                const branchStockUpdate = db.run(
                    'UPDATE stok_cabang SET stok = stok - ?, updated_at = ? WHERE id_cabang = ? AND id_menu = ? AND stok >= ?',
                    [it.jumlah, nowIso, activeCabangId, it.id_menu, it.jumlah]
                );

                if (branchStockUpdate.changes !== 1) {
                    const error = new Error(`STOCK_CHANGED:${it.nama_menu}`);
                    error.code = 'STOCK_CHANGED';
                    throw error;
                }

                db.run(
                    'UPDATE menu SET stok = MAX(0, stok - ?) WHERE id_menu = ?',
                    [it.jumlah, it.id_menu]
                );
                const updatedMenuStok = db.get('SELECT stok FROM menu WHERE id_menu = ?', [it.id_menu]).stok;
                db.run(
                    'UPDATE stok_cabang SET menu_stok_snapshot = ? WHERE id_menu = ?',
                    [updatedMenuStok, it.id_menu]
                );

                const detId = `DET${String(maxOrderNum * 100 + idx + 1).padStart(3, '0')}`;
                db.run(
                    `INSERT INTO detail_pesanan (id_detail, id_pesanan, id_menu, nama_menu, harga_satuan, jumlah, subtotal)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [detId, orderId, it.id_menu, it.nama_menu, it.harga, it.jumlah, it.subtotal]
                );

                const currentBranchStock = db.get(
                    'SELECT stok FROM stok_cabang WHERE id_cabang = ? AND id_menu = ?',
                    [activeCabangId, it.id_menu]
                ).stok;
                const stkLogId = 'STK' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + idx;
                db.run(
                    `INSERT INTO stok (id_stok, id_menu, id_cabang, id_pengguna, tanggal, jenis, stok_awal, perubahan, stok_sisa, keterangan)
                     VALUES (?, ?, ?, ?, ?, 'PENJUALAN', ?, ?, ?, ?)`,
                    [stkLogId, it.id_menu, activeCabangId, activeUserId, nowIso, stokAwal, -it.jumlah, currentBranchStock, `Penjualan kasir #${orderId}`]
                );
            });

            db.run(
                `INSERT INTO pembayaran (id_pembayaran, id_pesanan, metode, total_bayar, nominal_diterima, kembalian, tanggal_bayar, referensi)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [pmbId, orderId, paymentMethod, grandTotal, received, kembalian, nowIso, paymentRef]
            );

            db.run(
                `INSERT INTO struk (id_struk, id_pembayaran, id_pesanan, nomor_struk, tanggal_cetak)
                 VALUES (?, ?, ?, ?, ?)`,
                [strId, pmbId, orderId, nomorStruk, nowIso]
            );
        });

        const branchInfo = db.get('SELECT * FROM cabang WHERE id_cabang = ?', [activeCabangId]) || {
            nama_cabang: 'NomCherry Café',
            alamat: 'Jl. Jemur Andayani No. 12, Surabaya',
            no_telp: '0812-3456-7890'
        };
        const userInfo = db.get('SELECT nama_pengguna FROM pengguna WHERE id_pengguna = ?', [activeUserId]) || {
            nama_pengguna: 'Kasir NomCherry'
        };

        return res.json({
            success: true,
            message: 'Transaksi berhasil',
            data: {
                id_pesanan: orderId,
                nomor_struk: nomorStruk,
                tanggal: nowIso,
                cabang: branchInfo,
                kasir: userInfo.nama_pengguna,
                pelanggan: nama_pelanggan ? String(nama_pelanggan).trim() : 'Pelanggan Umum',
                jenis_pesanan: finalOrderType,
                nomor_meja: finalTableNum,
                catatan: finalCatatan,
                items: validatedItems,
                subtotal: calculatedSubtotal,
                pajak: pajak,
                diskon: diskonNominal,
                total: grandTotal,
                metode: paymentMethod,
                nominal_diterima: received,
                kembalian: kembalian,
                referensi: paymentRef,
                status_dapur: 'pending'
            }
        });
    } catch (err) {
        if (err && err.code === 'STOCK_CHANGED') {
            return res.status(400).json({
                success: false,
                message: `Stok tidak cukup untuk menu ${err.message.replace('STOCK_CHANGED:', '')}`
            });
        }
        return serverError(res, err, 'createOrder');
    }
};

exports.getAll = (req, res) => {
    const query = req.query || {};
    try {
        const { date, status, search } = query;
        const branch = req.user && req.user.peran === 'kasir'
            ? req.user.id_cabang
            : query.cabang;

        const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(query.limit, 10) || MAX_PAGE_SIZE));
        const offset = Math.max(0, parseInt(query.offset, 10) || 0);

        let sql = `
            SELECT p.*, pg.nama_pengguna, c.nama_cabang, pb.metode, pb.kembalian, pb.nominal_diterima, pb.referensi, s.nomor_struk
            FROM pesanan p
            LEFT JOIN pengguna pg ON p.id_pengguna = pg.id_pengguna
            LEFT JOIN cabang c ON p.id_cabang = c.id_cabang
            LEFT JOIN pembayaran pb ON p.id_pesanan = pb.id_pesanan
            LEFT JOIN struk s ON p.id_pesanan = s.id_pesanan
            WHERE 1=1
        `;
        const params = [];

        if (branch && branch !== 'all' && branch !== 'Semua') {
            sql += ' AND p.id_cabang = ?';
            params.push(branch);
        }

        if (date && date.trim() !== '') {
            sql += ' AND date(p.tanggal_pesanan, ?) = date(?)';
            params.push(dateService.sqlModifier(), date);
        }

        if (status && status !== 'all') {
            sql += ' AND p.status = ?';
            params.push(status);
        }

        if (search && search.trim() !== '') {
            sql += ' AND (p.id_pesanan LIKE ? OR s.nomor_struk LIKE ? OR p.nama_pelanggan LIKE ?)';
            const t = `%${search.trim()}%`;
            params.push(t, t, t);
        }

        sql += ' ORDER BY p.tanggal_pesanan DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const orders = db.query(sql, params);
        const orderIds = orders.map(o => o.id_pesanan);
        const detailsByOrder = new Map();

        if (orderIds.length > 0) {
            const placeholders = orderIds.map(() => '?').join(',');
            const details = db.query(
                `SELECT * FROM detail_pesanan WHERE id_pesanan IN (${placeholders})`,
                orderIds
            );
            details.forEach(detail => {
                if (!detailsByOrder.has(detail.id_pesanan)) {
                    detailsByOrder.set(detail.id_pesanan, []);
                }
                detailsByOrder.get(detail.id_pesanan).push(detail);
            });
        }

        const ordersWithDetails = orders.map(o => ({
            ...o,
            items: detailsByOrder.get(o.id_pesanan) || []
        }));

        return res.json({ success: true, data: ordersWithDetails });
    } catch (err) {
        return serverError(res, err, 'getAll');
    }
};

exports.getById = (req, res) => {
    try {
        const { id } = req.params;
        const order = db.get(`
            SELECT p.*, pg.nama_pengguna, c.nama_cabang, c.alamat AS alamat_cabang, c.no_telp AS no_telp_cabang,
                   pb.metode, pb.nominal_diterima, pb.kembalian, pb.referensi, s.nomor_struk
            FROM pesanan p
            LEFT JOIN pengguna pg ON p.id_pengguna = pg.id_pengguna
            LEFT JOIN cabang c ON p.id_cabang = c.id_cabang
            LEFT JOIN pembayaran pb ON p.id_pesanan = pb.id_pesanan
            LEFT JOIN struk s ON p.id_pesanan = s.id_pesanan
            WHERE p.id_pesanan = ?
        `, [id]);

        if (!order) {
            return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan' });
        }

        if (req.user && req.user.peran === 'kasir' && order.id_cabang !== req.user.id_cabang) {
            return res.status(403).json({ success: false, message: 'Akses ditolak untuk cabang ini' });
        }

        const items = db.query('SELECT * FROM detail_pesanan WHERE id_pesanan = ?', [id]);
        return res.json({ success: true, data: { ...order, items } });
    } catch (err) {
        return serverError(res, err, 'getById');
    }
};

exports.updateKitchenStatus = (req, res) => {
    try {
        const { id } = req.params;
        const { status_dapur } = req.body || {};

        if (!['pending', 'served'].includes(status_dapur)) {
            return res.status(400).json({ success: false, message: 'Status dapur tidak valid' });
        }

        const order = db.get('SELECT id_pesanan, id_cabang FROM pesanan WHERE id_pesanan = ?', [id]);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan' });
        }

        if (req.user && req.user.peran === 'kasir' && order.id_cabang !== req.user.id_cabang) {
            return res.status(403).json({ success: false, message: 'Akses ditolak untuk cabang ini' });
        }

        db.run('UPDATE pesanan SET status_dapur = ? WHERE id_pesanan = ?', [status_dapur, id]);
        return res.json({
            success: true,
            message: status_dapur === 'served' ? 'Pesanan ditandai selesai disajikan' : 'Pesanan dikembalikan ke antrean',
            data: { id_pesanan: id, status_dapur }
        });
    } catch (err) {
        return serverError(res, err, 'updateKitchenStatus');
    }
};
