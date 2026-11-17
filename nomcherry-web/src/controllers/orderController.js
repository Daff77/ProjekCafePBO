/**
 * Order & POS Checkout Controller for NomCherry Café
 * Features:
 * - Atomic idempotent checkout (order_idempotency) with payload conflict detection (409)
 * - Server-side expired stock blocking using business date (dateService)
 * - Branch-specific stock & receipt snapshot persistence (historical tax & branch identity)
 * - Paginated order listing separated from full-dataset SQL summary aggregates
 */

const crypto = require('crypto');
const db = require('../database/db');
const dateService = require('../services/dateService');
const settingsService = require('../services/settingsService');
const { resolveAuthorizedBranch } = require('../services/authService');

const MAX_QTY_PER_ITEM = 10000;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;
const ORDER_TYPES = ['Dine-In', 'Takeaway', 'Delivery'];
const PAYMENT_METHODS = ['Cash', 'QRIS', 'Debit', 'Transfer'];

function serverError(res, err, context) {
    console.error(`[orderController] ${context}:`, err.message);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' });
}

function normalizeOrderType(rawType, rawMeja) {
    if (typeof rawType === 'string' && rawType.trim() !== '') {
        const cleaned = rawType.trim();
        const lower = cleaned.toLowerCase();
        if (lower === 'dine-in' || lower === 'dine in' || lower === 'dinein') return 'Dine-In';
        if (lower === 'takeaway' || lower === 'take away' || lower === 'take-away') return 'Takeaway';
        if (lower === 'delivery') return 'Delivery';
        return null;
    }

    const mejaStr = typeof rawMeja === 'string' ? rawMeja.trim() : '';
    if (!mejaStr || mejaStr === '-') return 'Takeaway';
    const lowerMeja = mejaStr.toLowerCase();
    if (lowerMeja === 'takeaway' || lowerMeja === 'take away') return 'Takeaway';
    if (lowerMeja === 'delivery') return 'Delivery';
    return 'Dine-In';
}

function normalizePaymentMethod(rawMethod) {
    if (typeof rawMethod !== 'string' || rawMethod.trim() === '') return 'Cash';
    const cleaned = rawMethod.trim();
    if (cleaned === 'Card' || cleaned === 'EDC' || cleaned === 'Kartu EDC') return 'Debit';
    return PAYMENT_METHODS.includes(cleaned) ? cleaned : null;
}

function computeRequestHash(payload) {
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function deriveHistoricalTaxRate(order) {
    if (order.tarif_pajak !== null && order.tarif_pajak !== undefined && Number.isFinite(Number(order.tarif_pajak))) {
        return Number(order.tarif_pajak);
    }
    const base = Math.max(0, Number(order.subtotal || 0) - Number(order.diskon || 0));
    if (base > 0 && Number.isFinite(Number(order.pajak))) {
        return Math.round((Number(order.pajak) / base) * 1000) / 10;
    }
    return 0;
}

function buildOrderReceiptSnapshot(order, fallbackSettings) {
    return {
        nama_kafe: order.nama_kafe_snapshot || fallbackSettings.cafe_name || 'NomCherry Café & Roastery',
        nama_cabang: order.nama_cabang_snapshot || order.nama_cabang || order.id_cabang || 'NomCherry Café',
        alamat_cabang: order.alamat_cabang_snapshot || order.alamat_cabang || fallbackSettings.cafe_address || '-',
        no_telp_cabang: order.telepon_cabang_snapshot || order.no_telp_cabang || fallbackSettings.cafe_phone || '-',
        footer_struk: order.footer_struk_snapshot || fallbackSettings.receipt_footer || 'Terima kasih atas kunjungan Anda!',
        nama_kasir: order.nama_kasir_snapshot || order.nama_pengguna || 'Kasir NomCherry',
        tarif_pajak: deriveHistoricalTaxRate(order)
    };
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

        const headers = (req && req.headers) || {};
        const rawIdemKey = headers['idempotency-key']
            || headers['x-idempotency-key']
            || body.idempotency_key;
        let idempotencyKey = null;
        if (rawIdemKey !== undefined && rawIdemKey !== null && String(rawIdemKey).trim() !== '') {
            const trimmedKey = String(rawIdemKey).trim();
            if (trimmedKey.length > 128 || !/^[\x21-\x7E]+$/.test(trimmedKey)) {
                return res.status(400).json({
                    success: false,
                    message: 'Format Idempotency-Key tidak valid (maksimal 128 karakter ASCII tanpa spasi)'
                });
            }
            idempotencyKey = trimmedKey;
        }

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Keranjang kosong! Pilih minimal 1 menu untuk checkout.'
            });
        }

        const finalOrderType = normalizeOrderType(jenis_pesanan, nomor_meja);
        if (!finalOrderType || !ORDER_TYPES.includes(finalOrderType)) {
            return res.status(400).json({
                success: false,
                message: 'Jenis pesanan tidak valid. Pilih Dine-In, Takeaway, atau Delivery.'
            });
        }

        let finalTableNum = '-';
        if (finalOrderType === 'Dine-In') {
            const rawTable = typeof nomor_meja === 'string' ? nomor_meja.trim() : '';
            const invalidLabels = ['-', 'takeaway', 'take away', 'delivery'];
            if (!rawTable || invalidLabels.includes(rawTable.toLowerCase())) {
                return res.status(400).json({
                    success: false,
                    message: 'Nomor meja wajib diisi untuk pesanan Dine-In'
                });
            }
            if (rawTable.length > 40) {
                return res.status(400).json({
                    success: false,
                    message: 'Nomor meja terlalu panjang (maksimal 40 karakter)'
                });
            }
            finalTableNum = rawTable;
        }

        const paymentMethod = normalizePaymentMethod(metode_pembayaran);
        if (!paymentMethod) {
            return res.status(400).json({ success: false, message: 'Metode pembayaran tidak valid' });
        }

        const resolvedBranch = resolveAuthorizedBranch(req, id_cabang);
        if (resolvedBranch.errorStatus) {
            return res.status(resolvedBranch.errorStatus).json({
                success: false,
                message: resolvedBranch.errorMessage
            });
        }
        const activeCabangId = resolvedBranch.branchId;
        const activeUserId = (req.user && req.user.id_pengguna) || id_pengguna || 'USR001';

        if (!db.get('SELECT id_pengguna FROM pengguna WHERE id_pengguna = ?', [activeUserId])) {
            return res.status(400).json({ success: false, message: 'Pengguna tidak ditemukan' });
        }

        const finalPelanggan = nama_pelanggan && String(nama_pelanggan).trim()
            ? String(nama_pelanggan).trim().slice(0, 100)
            : 'Pelanggan Umum';
        const finalCatatan = (typeof catatan === 'string' && catatan.trim())
            ? catatan.trim().slice(0, 250)
            : (finalOrderType === 'Delivery' ? 'Pesanan Delivery' : 'Order POS');
        const customRef = typeof referensi === 'string' ? referensi.trim().slice(0, 80) : '';
        const requestedDiscount = Math.max(0, Math.floor(parseFloat(diskon) || 0));

        const canonicalItemsForHash = [];
        for (const item of items) {
            if (!item || typeof item.id_menu !== 'string' || item.id_menu.trim() === '') {
                return res.status(400).json({ success: false, message: 'Item pesanan tidak valid' });
            }
            const requestedQty = Number(item.jumlah ?? item.qty ?? 1);
            if (!Number.isInteger(requestedQty) || requestedQty <= 0 || requestedQty > MAX_QTY_PER_ITEM) {
                return res.status(400).json({
                    success: false,
                    message: `Jumlah pesanan untuk ${item.id_menu} tidak valid`
                });
            }
            canonicalItemsForHash.push({ id_menu: item.id_menu.trim(), jumlah: requestedQty });
        }

        const requestHash = idempotencyKey
            ? computeRequestHash({
                id_cabang: activeCabangId,
                nama_pelanggan: finalPelanggan,
                jenis_pesanan: finalOrderType,
                nomor_meja: finalTableNum,
                catatan: finalCatatan,
                metode: paymentMethod,
                diskon: requestedDiscount,
                nominal_diterima: paymentMethod === 'Cash'
                    ? (nominal_diterima === undefined || nominal_diterima === null || String(nominal_diterima).trim() === '' ? null : Number(nominal_diterima))
                    : null,
                qris_confirmed: paymentMethod === 'QRIS'
                    ? Boolean(qris_confirmed === true || qris_confirmed === 'true' || qris_confirmed === 1)
                    : null,
                referensi: customRef,
                items: canonicalItemsForHash
            })
            : null;

        // Fast-path idempotency check before item/stock validation (so retries after stock dropped to 0 still replay original success!)
        if (idempotencyKey) {
            const existingIdem = db.get('SELECT * FROM order_idempotency WHERE idempotency_key = ?', [idempotencyKey]);
            if (existingIdem) {
                if (
                    existingIdem.request_hash !== requestHash ||
                    existingIdem.id_cabang !== activeCabangId ||
                    existingIdem.id_pengguna !== activeUserId
                ) {
                    return res.status(409).json({
                        success: false,
                        code: 'IDEMPOTENCY_CONFLICT',
                        message: 'Idempotency key sudah pernah digunakan untuk data pesanan yang berbeda.'
                    });
                }
                return res.json({
                    success: true,
                    idempotent_replay: true,
                    message: 'Transaksi sudah tercatat sebelumnya',
                    data: JSON.parse(existingIdem.response_json)
                });
            }
        }

        const businessToday = dateService.today();
        let calculatedSubtotal = 0;
        const validatedItems = [];
        const cumulativeQtyByMenu = new Map();

        for (const item of canonicalItemsForHash) {
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

            const branchStock = db.syncBranchStockRow(activeCabangId, menu.id_menu);
            const availableStock = branchStock ? branchStock.stok : menu.stok;
            const expInfo = dateService.evaluateExpiry(
                branchStock ? branchStock.tanggal_kadaluarsa : null,
                businessToday
            );

            if (expInfo.is_expired) {
                return res.status(400).json({
                    success: false,
                    code: 'STOCK_EXPIRED',
                    message: `Stok menu ${menu.nama_menu} telah kedaluwarsa (${expInfo.tanggal_kadaluarsa}) dan tidak dapat dijual.`
                });
            }

            const totalRequestedForMenu = (cumulativeQtyByMenu.get(menu.id_menu) || 0) + item.jumlah;

            if (availableStock <= 0) {
                return res.status(400).json({
                    success: false,
                    code: 'OUT_OF_STOCK',
                    message: `Stok habis untuk menu ${menu.nama_menu}`
                });
            }

            if (totalRequestedForMenu > availableStock) {
                return res.status(400).json({
                    success: false,
                    code: 'INSUFFICIENT_STOCK',
                    message: `Stok tidak cukup untuk menu ${menu.nama_menu} (Sisa stok cabang: ${availableStock})`
                });
            }

            cumulativeQtyByMenu.set(menu.id_menu, totalRequestedForMenu);

            const itemSubtotal = Math.round(menu.harga * item.jumlah);
            calculatedSubtotal += itemSubtotal;

            validatedItems.push({
                id_menu: menu.id_menu,
                nama_menu: menu.nama_menu,
                harga: menu.harga,
                jumlah: item.jumlah,
                subtotal: itemSubtotal
            });
        }

        const identity = settingsService.getReceiptIdentity(activeCabangId);
        const taxRate = identity.tax_rate;
        const diskonNominal = Math.min(requestedDiscount, calculatedSubtotal);
        const taxableAmount = Math.max(0, calculatedSubtotal - diskonNominal);
        const pajak = Math.round(taxableAmount * (taxRate / 100));
        const grandTotal = taxableAmount + pajak;

        let received = grandTotal;
        let kembalian = 0;

        if (paymentMethod === 'Cash') {
            const rawCash = nominal_diterima;
            const parsedReceived = (rawCash === undefined || rawCash === null || String(rawCash).trim() === '')
                ? NaN
                : Math.round(Number(rawCash));

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
                    message: 'Pembayaran QRIS belum dikonfirmasi. Centang konfirmasi penerimaan QRIS terlebih dahulu.'
                });
            }
            received = grandTotal;
            kembalian = 0;
        } else {
            received = grandTotal;
            kembalian = 0;
        }

        const userInfo = db.get('SELECT nama_pengguna FROM pengguna WHERE id_pengguna = ?', [activeUserId]) || {
            nama_pengguna: 'Kasir NomCherry'
        };

        const txResult = db.transaction(() => {
            if (idempotencyKey) {
                const insideExisting = db.get('SELECT * FROM order_idempotency WHERE idempotency_key = ?', [idempotencyKey]);
                if (insideExisting) {
                    if (
                        insideExisting.request_hash !== requestHash ||
                        insideExisting.id_cabang !== activeCabangId ||
                        insideExisting.id_pengguna !== activeUserId
                    ) {
                        const conflictErr = new Error('IDEMPOTENCY_CONFLICT');
                        conflictErr.code = 'IDEMPOTENCY_CONFLICT';
                        throw conflictErr;
                    }
                    return {
                        replayed: true,
                        data: JSON.parse(insideExisting.response_json)
                    };
                }
            }

            const nowIso = dateService.nowIso();
            const currentBizToday = dateService.today();
            const dateCode = currentBizToday.replace(/-/g, '');

            const allOrders = db.query('SELECT id_pesanan FROM pesanan');
            let maxOrderNum = 0;
            allOrders.forEach(o => {
                const num = parseInt(o.id_pesanan.replace('PSN', ''), 10);
                if (!isNaN(num) && num > maxOrderNum) maxOrderNum = num;
            });
            const nextNum = maxOrderNum + 1;
            const orderId = 'PSN' + String(nextNum).padStart(3, '0');
            const pmbId = 'BYR' + String(nextNum).padStart(3, '0');
            const strId = 'STR' + String(nextNum).padStart(3, '0');
            const nomorStruk = `NC-${dateCode}-${String(nextNum).padStart(3, '0')}`;

            let paymentRef = customRef || '';
            if (!paymentRef) {
                if (paymentMethod === 'QRIS') paymentRef = 'QRIS-' + orderId;
                else if (paymentMethod === 'Debit') paymentRef = 'EDC-' + orderId;
                else if (paymentMethod === 'Transfer') paymentRef = 'TRF-' + orderId;
            }

            db.run(
                `INSERT INTO pesanan (id_pesanan, id_pengguna, id_cabang, nama_pelanggan, jenis_pesanan, nomor_meja, tanggal_pesanan, subtotal, pajak, tarif_pajak, diskon, total, status, status_dapur, catatan)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', 'pending', ?)`,
                [
                    orderId,
                    activeUserId,
                    activeCabangId,
                    finalPelanggan,
                    finalOrderType,
                    finalTableNum,
                    nowIso,
                    calculatedSubtotal,
                    pajak,
                    taxRate,
                    diskonNominal,
                    grandTotal,
                    finalCatatan
                ]
            );

            validatedItems.forEach((it, idx) => {
                const branchRowBefore = db.syncBranchStockRow(activeCabangId, it.id_menu);
                const expInside = dateService.evaluateExpiry(
                    branchRowBefore ? branchRowBefore.tanggal_kadaluarsa : null,
                    currentBizToday
                );
                if (expInside.is_expired) {
                    const expErr = new Error(`STOCK_EXPIRED:${it.nama_menu}:${expInside.tanggal_kadaluarsa}`);
                    expErr.code = 'STOCK_EXPIRED';
                    throw expErr;
                }

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

                const menuMeta = db.get("SELECT stok, COALESCE(id_cabang, 'CBG001') AS id_cabang FROM menu WHERE id_menu = ?", [it.id_menu]);
                const currentBranchStock = db.get(
                    'SELECT stok FROM stok_cabang WHERE id_cabang = ? AND id_menu = ?',
                    [activeCabangId, it.id_menu]
                ).stok;
                const nextMenuStok = Math.max(0, menuMeta.stok - it.jumlah);

                db.run('UPDATE menu SET stok = ? WHERE id_menu = ?', [nextMenuStok, it.id_menu]);
                db.run('UPDATE stok_cabang SET menu_stok_snapshot = ? WHERE id_menu = ?', [nextMenuStok, it.id_menu]);

                const detId = `DET${String(nextNum * 100 + idx + 1).padStart(3, '0')}`;
                db.run(
                    `INSERT INTO detail_pesanan (id_detail, id_pesanan, id_menu, nama_menu, harga_satuan, jumlah, subtotal)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [detId, orderId, it.id_menu, it.nama_menu, it.harga, it.jumlah, it.subtotal]
                );

                const stkLogId = 'STK' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + idx;
                db.run(
                    `INSERT INTO stok (id_stok, id_menu, id_cabang, id_pengguna, tanggal, jenis, stok_awal, perubahan, stok_sisa, tanggal_kadaluarsa, keterangan)
                     VALUES (?, ?, ?, ?, ?, 'PENJUALAN', ?, ?, ?, ?, ?)`,
                    [
                        stkLogId,
                        it.id_menu,
                        activeCabangId,
                        activeUserId,
                        nowIso,
                        stokAwal,
                        -it.jumlah,
                        currentBranchStock,
                        branchRowBefore ? branchRowBefore.tanggal_kadaluarsa : null,
                        `Penjualan kasir #${orderId}`
                    ]
                );
            });

            db.run(
                `INSERT INTO pembayaran (id_pembayaran, id_pesanan, metode, total_bayar, nominal_diterima, kembalian, tanggal_bayar, referensi)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [pmbId, orderId, paymentMethod, grandTotal, received, kembalian, nowIso, paymentRef]
            );

            db.run(
                `INSERT INTO struk (
                    id_struk, id_pembayaran, id_pesanan, nomor_struk, tanggal_cetak,
                    nama_kafe_snapshot, nama_cabang_snapshot, alamat_cabang_snapshot,
                    telepon_cabang_snapshot, footer_struk_snapshot, nama_kasir_snapshot
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    strId,
                    pmbId,
                    orderId,
                    nomorStruk,
                    nowIso,
                    identity.cafe_name,
                    identity.nama_cabang,
                    identity.alamat_cabang,
                    identity.no_telp_cabang,
                    identity.receipt_footer,
                    userInfo.nama_pengguna
                ]
            );

            const responseData = {
                id_pesanan: orderId,
                id_cabang: activeCabangId,
                nomor_struk: nomorStruk,
                tanggal: nowIso,
                cabang: {
                    id_cabang: identity.id_cabang,
                    nama_cabang: identity.nama_cabang,
                    alamat: identity.alamat_cabang,
                    no_telp: identity.no_telp_cabang
                },
                receipt: {
                    nama_kafe: identity.cafe_name,
                    nama_cabang: identity.nama_cabang,
                    alamat_cabang: identity.alamat_cabang,
                    no_telp_cabang: identity.no_telp_cabang,
                    footer_struk: identity.receipt_footer,
                    nama_kasir: userInfo.nama_pengguna,
                    tarif_pajak: taxRate
                },
                kasir: userInfo.nama_pengguna,
                pelanggan: finalPelanggan,
                jenis_pesanan: finalOrderType,
                nomor_meja: finalTableNum,
                catatan: finalCatatan,
                items: validatedItems,
                subtotal: calculatedSubtotal,
                pajak: pajak,
                tarif_pajak: taxRate,
                diskon: diskonNominal,
                total: grandTotal,
                metode: paymentMethod,
                nominal_diterima: received,
                kembalian: kembalian,
                referensi: paymentRef,
                status_dapur: 'pending'
            };

            if (idempotencyKey) {
                db.run(
                    `INSERT INTO order_idempotency (idempotency_key, id_pengguna, id_cabang, request_hash, id_pesanan, response_json, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        idempotencyKey,
                        activeUserId,
                        activeCabangId,
                        requestHash,
                        orderId,
                        JSON.stringify(responseData),
                        nowIso
                    ]
                );
            }

            return { replayed: false, data: responseData };
        });

        return res.json({
            success: true,
            idempotent_replay: txResult.replayed,
            message: txResult.replayed ? 'Transaksi sudah tercatat sebelumnya' : 'Transaksi berhasil',
            data: txResult.data
        });
    } catch (err) {
        if (err && err.code === 'IDEMPOTENCY_CONFLICT') {
            return res.status(409).json({
                success: false,
                code: 'IDEMPOTENCY_CONFLICT',
                message: 'Idempotency key sudah pernah digunakan untuk data pesanan yang berbeda.'
            });
        }
        if (err && err.code === 'STOCK_CHANGED') {
            return res.status(409).json({
                success: false,
                code: 'STOCK_CHANGED',
                message: `Stok untuk menu ${err.message.replace('STOCK_CHANGED:', '')} baru saja berubah di terminal lain. Periksa kembali keranjang.`
            });
        }
        if (err && err.code === 'STOCK_EXPIRED') {
            const [, menuName, exp] = err.message.split(':');
            return res.status(400).json({
                success: false,
                code: 'STOCK_EXPIRED',
                message: `Stok menu ${menuName} telah kedaluwarsa (${exp}) dan tidak dapat dijual.`
            });
        }
        return serverError(res, err, 'createOrder');
    }
};

exports.getAll = (req, res) => {
    const query = req.query || {};
    try {
        const { date, date_start, date_end, status, status_dapur, metode, search } = query;
        const resolved = resolveAuthorizedBranch(req, query.cabang, { allowAll: true });
        if (resolved.errorStatus) {
            return res.status(resolved.errorStatus).json({ success: false, message: resolved.errorMessage });
        }

        const dCheck = dateService.validateDateParam(date, 'Tanggal pesanan');
        if (!dCheck.valid) return res.status(400).json({ success: false, message: dCheck.message });
        const dsCheck = dateService.validateDateParam(date_start, 'Tanggal awal');
        if (!dsCheck.valid) return res.status(400).json({ success: false, message: dsCheck.message });
        const deCheck = dateService.validateDateParam(date_end, 'Tanggal akhir');
        if (!deCheck.valid) return res.status(400).json({ success: false, message: deCheck.message });

        const rawLimit = parseInt(query.limit, 10);
        const limit = Number.isInteger(rawLimit)
            ? Math.min(MAX_PAGE_SIZE, Math.max(1, rawLimit))
            : DEFAULT_PAGE_SIZE;
        const offset = Math.max(0, parseInt(query.offset, 10) || 0);

        let whereClause = 'WHERE 1=1';
        const filterParams = [];

        if (resolved.branchId && resolved.branchId !== 'all') {
            whereClause += ' AND p.id_cabang = ?';
            filterParams.push(resolved.branchId);
        }

        if (dCheck.value) {
            whereClause += ' AND date(p.tanggal_pesanan, ?) = ?';
            filterParams.push(dateService.sqlModifier(), dCheck.value);
        }

        if (dsCheck.value) {
            whereClause += ' AND date(p.tanggal_pesanan, ?) >= ?';
            filterParams.push(dateService.sqlModifier(), dsCheck.value);
        }

        if (deCheck.value) {
            whereClause += ' AND date(p.tanggal_pesanan, ?) <= ?';
            filterParams.push(dateService.sqlModifier(), deCheck.value);
        }

        if (status && status !== 'all') {
            whereClause += ' AND p.status = ?';
            filterParams.push(status);
        }

        if (status_dapur && status_dapur !== 'all') {
            whereClause += ' AND COALESCE(p.status_dapur, \'served\') = ?';
            filterParams.push(status_dapur);
        }

        if (metode && metode !== 'all') {
            const normMethod = normalizePaymentMethod(metode);
            if (!normMethod) {
                return res.status(400).json({ success: false, message: 'Filter metode pembayaran tidak valid' });
            }
            whereClause += ' AND pb.metode = ?';
            filterParams.push(normMethod);
        }

        if (search && search.trim() !== '') {
            whereClause += ' AND (p.id_pesanan LIKE ? OR s.nomor_struk LIKE ? OR p.nama_pelanggan LIKE ?)';
            const t = `%${search.trim()}%`;
            filterParams.push(t, t, t);
        }

        const baseFrom = `
            FROM pesanan p
            LEFT JOIN pengguna pg ON p.id_pengguna = pg.id_pengguna
            LEFT JOIN cabang c ON p.id_cabang = c.id_cabang
            LEFT JOIN pembayaran pb ON p.id_pesanan = pb.id_pesanan
            LEFT JOIN struk s ON p.id_pesanan = s.id_pesanan
            ${whereClause}
        `;

        // Full-dataset server-side summary (ignores pagination limit/offset)
        const summaryRow = db.get(`
            SELECT COUNT(*) AS total_orders,
                   SUM(CASE WHEN COALESCE(p.status_dapur, 'served') = 'pending' THEN 1 ELSE 0 END) AS pending_kitchen,
                   SUM(CASE WHEN COALESCE(p.status_dapur, 'served') = 'served' THEN 1 ELSE 0 END) AS served_kitchen,
                   COALESCE(SUM(CASE WHEN p.status = 'completed' THEN p.total ELSE 0 END), 0) AS gross_total,
                   COALESCE(SUM(CASE WHEN p.status = 'completed' THEN (p.subtotal - p.diskon) ELSE 0 END), 0) AS nett_total,
                   COALESCE(SUM(CASE WHEN p.status = 'completed' THEN p.pajak ELSE 0 END), 0) AS tax_total,
                   COALESCE(SUM(CASE WHEN p.status = 'completed' THEN p.diskon ELSE 0 END), 0) AS discount_total
            ${baseFrom}
        `, filterParams);

        const orders = db.query(`
            SELECT p.*, pg.nama_pengguna,
                   c.nama_cabang, c.alamat AS alamat_cabang, c.no_telp AS no_telp_cabang,
                   pb.metode, pb.kembalian, pb.nominal_diterima, pb.referensi,
                   s.nomor_struk, s.nama_kafe_snapshot, s.nama_cabang_snapshot,
                   s.alamat_cabang_snapshot, s.telepon_cabang_snapshot,
                   s.footer_struk_snapshot, s.nama_kasir_snapshot
            ${baseFrom}
            ORDER BY p.tanggal_pesanan DESC, p.id_pesanan DESC
            LIMIT ? OFFSET ?
        `, [...filterParams, limit, offset]);

        // Also fetch active kitchen queue for the branch so barista queue never misses orders on older pages
        const queueParams = [];
        let queueBranchClause = '';
        if (resolved.branchId && resolved.branchId !== 'all') {
            queueBranchClause = ' AND p.id_cabang = ?';
            queueParams.push(resolved.branchId);
        }
        const kitchenQueueOrders = db.query(`
            SELECT p.*, pg.nama_pengguna,
                   c.nama_cabang, c.alamat AS alamat_cabang, c.no_telp AS no_telp_cabang,
                   pb.metode, pb.kembalian, pb.nominal_diterima, pb.referensi,
                   s.nomor_struk, s.nama_kafe_snapshot, s.nama_cabang_snapshot,
                   s.alamat_cabang_snapshot, s.telepon_cabang_snapshot,
                   s.footer_struk_snapshot, s.nama_kasir_snapshot
            FROM pesanan p
            LEFT JOIN pengguna pg ON p.id_pengguna = pg.id_pengguna
            LEFT JOIN cabang c ON p.id_cabang = c.id_cabang
            LEFT JOIN pembayaran pb ON p.id_pesanan = pb.id_pesanan
            LEFT JOIN struk s ON p.id_pesanan = s.id_pesanan
            WHERE p.status = 'completed' AND COALESCE(p.status_dapur, 'served') = 'pending' ${queueBranchClause}
            ORDER BY p.tanggal_pesanan ASC
            LIMIT 50
        `, queueParams);

        const allNeededIds = Array.from(new Set([
            ...orders.map(o => o.id_pesanan),
            ...kitchenQueueOrders.map(o => o.id_pesanan)
        ]));
        const detailsByOrder = new Map();

        if (allNeededIds.length > 0) {
            const placeholders = allNeededIds.map(() => '?').join(',');
            const details = db.query(
                `SELECT * FROM detail_pesanan WHERE id_pesanan IN (${placeholders})`,
                allNeededIds
            );
            details.forEach(detail => {
                if (!detailsByOrder.has(detail.id_pesanan)) {
                    detailsByOrder.set(detail.id_pesanan, []);
                }
                detailsByOrder.get(detail.id_pesanan).push(detail);
            });
        }

        const globalSettings = settingsService.getAll();
        const attachOrderMeta = (o) => ({
            ...o,
            tarif_pajak: deriveHistoricalTaxRate(o),
            receipt: buildOrderReceiptSnapshot(o, globalSettings),
            items: detailsByOrder.get(o.id_pesanan) || []
        });

        const totalRows = Number(summaryRow.total_orders || 0);
        const totalPages = Math.max(1, Math.ceil(totalRows / limit));
        const currentPage = Math.floor(offset / limit) + 1;

        return res.json({
            success: true,
            data: orders.map(attachOrderMeta),
            kitchen_queue: kitchenQueueOrders.map(attachOrderMeta),
            summary: {
                total_orders: totalRows,
                pending_kitchen: Number(summaryRow.pending_kitchen || 0),
                served_kitchen: Number(summaryRow.served_kitchen || 0),
                gross_total: Number(summaryRow.gross_total || 0),
                nett_total: Number(summaryRow.nett_total || 0),
                tax_total: Number(summaryRow.tax_total || 0),
                discount_total: Number(summaryRow.discount_total || 0)
            },
            pagination: {
                total: totalRows,
                limit,
                offset,
                page: currentPage,
                total_pages: totalPages,
                has_prev: offset > 0,
                has_next: offset + orders.length < totalRows
            }
        });
    } catch (err) {
        return serverError(res, err, 'getAll');
    }
};

exports.getById = (req, res) => {
    try {
        const { id } = req.params;
        const order = db.get(`
            SELECT p.*, pg.nama_pengguna,
                   c.nama_cabang, c.alamat AS alamat_cabang, c.no_telp AS no_telp_cabang,
                   pb.metode, pb.nominal_diterima, pb.kembalian, pb.referensi,
                   s.nomor_struk, s.nama_kafe_snapshot, s.nama_cabang_snapshot,
                   s.alamat_cabang_snapshot, s.telepon_cabang_snapshot,
                   s.footer_struk_snapshot, s.nama_kasir_snapshot
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

        const globalSettings = settingsService.getAll();
        const receipt = buildOrderReceiptSnapshot(order, globalSettings);
        const items = db.query('SELECT * FROM detail_pesanan WHERE id_pesanan = ?', [id]);

        return res.json({
            success: true,
            data: {
                ...order,
                nama_cabang: receipt.nama_cabang,
                alamat_cabang: receipt.alamat_cabang,
                no_telp_cabang: receipt.no_telp_cabang,
                nama_pengguna: receipt.nama_kasir,
                tarif_pajak: receipt.tarif_pajak,
                receipt,
                items
            }
        });
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
