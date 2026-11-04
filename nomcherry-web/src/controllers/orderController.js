/**
 * Order & Checkout Controller for NomCherry Café
 * Implements test cases 3.1 - 3.4, 4.1 - 4.5, 5.1 - 5.3
 */

const db = require('../database/db');

exports.createOrder = (req, res) => {
    try {
        const {
            id_pengguna,
            id_cabang,
            nama_pelanggan,
            nomor_meja,
            items,
            metode_pembayaran,
            nominal_diterima,
            diskon = 0,
            catatan = ''
        } = req.body;

        // Test Case 4.2: Checkout dengan keranjang kosong
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Keranjang kosong'
            });
        }

        // Test Case 3.2 & 3.3: Stock Validation for every item in cart
        let calculatedSubtotal = 0;
        const validatedItems = [];

        for (const item of items) {
            const menu = db.get('SELECT * FROM menu WHERE id_menu = ?', [item.id_menu]);
            if (!menu) {
                return res.status(404).json({
                    success: false,
                    message: `Menu dengan ID ${item.id_menu} tidak ditemukan`
                });
            }

            const requestedQty = parseInt(item.jumlah || item.qty || 1, 10);

            // Test Case 3.2: Item stok 0 -> "Stok habis"
            if (menu.stok <= 0) {
                return res.status(400).json({
                    success: false,
                    message: `Stok habis untuk menu ${menu.nama_menu}`
                });
            }

            // Test Case 3.3: Qty > stok -> "Stok tidak cukup"
            if (requestedQty > menu.stok) {
                return res.status(400).json({
                    success: false,
                    message: `Stok tidak cukup untuk menu ${menu.nama_menu} (Sisa stok: ${menu.stok})`
                });
            }

            const itemSubtotal = menu.harga * requestedQty;
            calculatedSubtotal += itemSubtotal;

            validatedItems.push({
                id_menu: menu.id_menu,
                nama_menu: menu.nama_menu,
                harga: menu.harga,
                jumlah: requestedQty,
                subtotal: itemSubtotal,
                stok_sebelum: menu.stok
            });
        }

        // Calculate Tax (PB1 10%) & Total
        const diskonNominal = Math.max(0, parseFloat(diskon) || 0);
        const taxableAmount = Math.max(0, calculatedSubtotal - diskonNominal);
        const pajak = Math.round(taxableAmount * 0.10); // 10% PB1 Cafe
        const grandTotal = taxableAmount + pajak;

        // Validate Payment
        const paymentMethod = metode_pembayaran || 'Cash';
        const received = parseFloat(nominal_diterima) || grandTotal;

        if (paymentMethod === 'Cash' && received < grandTotal) {
            return res.status(400).json({
                success: false,
                message: `Nominal uang tunai kurang. Total: Rp ${grandTotal.toLocaleString('id-ID')}, Diterima: Rp ${received.toLocaleString('id-ID')}`
            });
        }

        const kembalian = paymentMethod === 'Cash' ? (received - grandTotal) : 0;

        // Generate IDs
        const now = new Date();
        const nowIso = now.toISOString();
        const dateCode = now.toISOString().slice(0, 10).replace(/-/g, '');

        // Auto generate PSN ID
        const allOrders = db.query('SELECT id_pesanan FROM pesanan');
        let maxOrderNum = 0;
        allOrders.forEach(o => {
            const num = parseInt(o.id_pesanan.replace('PSN', ''), 10);
            if (!isNaN(num) && num > maxOrderNum) maxOrderNum = num;
        });
        const orderId = 'PSN' + String(maxOrderNum + 1).padStart(3, '0');

        // Payment ID & Struk ID
        const pmbId = 'BYR' + String(maxOrderNum + 1).padStart(3, '0');
        const strId = 'STR' + String(maxOrderNum + 1).padStart(3, '0');
        const nomorStruk = `NC-${dateCode}-${String(maxOrderNum + 1).padStart(3, '0')}`;

        const activeCabangId = id_cabang || 'CBG001';
        const activeUserId = id_pengguna || 'USR001';

        // 1. Insert Pesanan - Test Case 4.4 & 4.5: Transaction bound to active branch
        db.run(
            `INSERT INTO pesanan (id_pesanan, id_pengguna, id_cabang, nama_pelanggan, nomor_meja, tanggal_pesanan, subtotal, pajak, diskon, total, status, catatan)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)`,
            [
                orderId,
                activeUserId,
                activeCabangId,
                nama_pelanggan ? nama_pelanggan.trim() : 'Pelanggan Umum',
                nomor_meja ? nomor_meja.trim() : 'Take Away',
                nowIso,
                calculatedSubtotal,
                pajak,
                diskonNominal,
                grandTotal,
                catatan || 'Order POS'
            ]
        );

        // 2. Insert Detail Pesanan & Update Stok (Test Case 4.3: Stok berkurang otomatis)
        validatedItems.forEach((it, idx) => {
            const detId = `DET${String(maxOrderNum * 10 + idx + 1).padStart(3, '0')}`;
            db.run(
                `INSERT INTO detail_pesanan (id_detail, id_pesanan, id_menu, nama_menu, harga_satuan, jumlah, subtotal)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [detId, orderId, it.id_menu, it.nama_menu, it.harga, it.jumlah, it.subtotal]
            );

            // Deduct Menu Stock
            const stokBaru = it.stok_sebelum - it.jumlah;
            db.run('UPDATE menu SET stok = ? WHERE id_menu = ?', [stokBaru, it.id_menu]);

            // Insert stock log
            const stkLogId = 'STK' + Date.now().toString().slice(-6) + idx;
            db.run(
                `INSERT INTO stok (id_stok, id_menu, id_cabang, id_pengguna, tanggal, jenis, perubahan, stok_sisa, keterangan)
                 VALUES (?, ?, ?, ?, ?, 'PENJUALAN', ?, ?, ?)`,
                [stkLogId, it.id_menu, activeCabangId, activeUserId, nowIso, -it.jumlah, stokBaru, `Penjualan kasir #${orderId}`]
            );
        });

        // 3. Insert Pembayaran
        db.run(
            `INSERT INTO pembayaran (id_pembayaran, id_pesanan, metode, total_bayar, nominal_diterima, kembalian, tanggal_bayar, referensi)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [pmbId, orderId, paymentMethod, grandTotal, received, kembalian, nowIso, paymentMethod === 'QRIS' ? 'QRIS-' + orderId : '']
        );

        // 4. Insert Struk
        db.run(
            `INSERT INTO struk (id_struk, id_pembayaran, id_pesanan, nomor_struk, tanggal_cetak)
             VALUES (?, ?, ?, ?, ?)`,
            [strId, pmbId, orderId, nomorStruk, nowIso]
        );

        // Fetch Branch & User Info for thermal receipt
        const branchInfo = db.get('SELECT * FROM cabang WHERE id_cabang = ?', [activeCabangId]) || {
            nama_cabang: 'NomCherry Café',
            alamat: 'Jl. Jemur Andayani No. 12, Surabaya',
            no_telp: '0812-3456-7890'
        };
        const userInfo = db.get('SELECT nama_pengguna FROM pengguna WHERE id_pengguna = ?', [activeUserId]) || {
            nama_pengguna: 'Kasir NomCherry'
        };

        // Test Case 4.1, 5.1, 5.2, 5.3: Return receipt payload with exact calculations
        return res.json({
            success: true,
            message: 'Transaksi berhasil',
            data: {
                id_pesanan: orderId,
                nomor_struk: nomorStruk,
                tanggal: nowIso,
                cabang: branchInfo,
                kasir: userInfo.nama_pengguna,
                pelanggan: nama_pelanggan || 'Pelanggan Umum',
                nomor_meja: nomor_meja || 'Take Away',
                items: validatedItems,
                subtotal: calculatedSubtotal,
                pajak: pajak,
                diskon: diskonNominal,
                total: grandTotal,
                metode: paymentMethod,
                nominal_diterima: received,
                kembalian: kembalian
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Gagal memproses transaksi: ' + err.message });
    }
};

exports.getAll = (req, res) => {
    try {
        const { cabang, date, status, search } = req.query;
        let sql = `
            SELECT p.*, pg.nama_pengguna, c.nama_cabang, pb.metode, pb.kembalian, pb.nominal_diterima, s.nomor_struk
            FROM pesanan p
            LEFT JOIN pengguna pg ON p.id_pengguna = pg.id_pengguna
            LEFT JOIN cabang c ON p.id_cabang = c.id_cabang
            LEFT JOIN pembayaran pb ON p.id_pesanan = pb.id_pesanan
            LEFT JOIN struk s ON p.id_pesanan = s.id_pesanan
            WHERE 1=1
        `;
        const params = [];

        if (cabang && cabang !== 'all' && cabang !== 'Semua') {
            sql += ' AND p.id_cabang = ?';
            params.push(cabang);
        }

        if (date && date.trim() !== '') {
            sql += ' AND date(p.tanggal_pesanan) = date(?)';
            params.push(date);
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

        sql += ' ORDER BY p.tanggal_pesanan DESC';

        const orders = db.query(sql, params);

        // Fetch detail items for each order
        const ordersWithDetails = orders.map(o => {
            const details = db.query('SELECT * FROM detail_pesanan WHERE id_pesanan = ?', [o.id_pesanan]);
            return { ...o, items: details };
        });

        return res.json({ success: true, data: ordersWithDetails });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

exports.getById = (req, res) => {
    try {
        const { id } = req.params;
        const order = db.get(`
            SELECT p.*, pg.nama_pengguna, c.nama_cabang, c.alamat AS alamat_cabang, c.no_telp AS no_telp_cabang,
                   pb.metode, pb.nominal_diterima, pb.kembalian, s.nomor_struk
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

        const items = db.query('SELECT * FROM detail_pesanan WHERE id_pesanan = ?', [id]);
        return res.json({ success: true, data: { ...order, items } });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
