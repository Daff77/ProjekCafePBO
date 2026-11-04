/**
 * Stock & Inventory Controller for NomCherry Café
 * Implements test cases 6.1, 6.2, 6.3, 6.4
 */

const db = require('../database/db');

exports.getStockList = (req, res) => {
    try {
        const { cabang, kategori, search } = req.query;
        let sql = `
            SELECT m.id_menu, m.nama_menu, m.harga, m.stok, m.kategori, m.gambar, m.id_cabang, c.nama_cabang
            FROM menu m
            LEFT JOIN cabang c ON m.id_cabang = c.id_cabang
            WHERE 1=1
        `;
        const params = [];

        if (cabang && cabang !== 'all' && cabang !== 'Semua') {
            sql += ' AND (m.id_cabang = ? OR m.id_cabang IS NULL)';
            params.push(cabang);
        }

        if (kategori && kategori !== 'Semua') {
            sql += ' AND m.kategori = ?';
            params.push(kategori);
        }

        if (search && search.trim() !== '') {
            sql += ' AND m.nama_menu LIKE ?';
            params.push(`%${search.trim()}%`);
        }

        sql += ' ORDER BY m.stok ASC, m.nama_menu ASC';
        const stockItems = db.query(sql, params);

        // Enhance with latest expiry date and status
        const todayStr = new Date().toISOString().slice(0, 10);

        const enhanced = stockItems.map(item => {
            // Find latest expiry date from stock logs
            const latestLog = db.get(
                'SELECT tanggal_kadaluarsa FROM stok WHERE id_menu = ? AND tanggal_kadaluarsa IS NOT NULL ORDER BY tanggal DESC LIMIT 1',
                [item.id_menu]
            );

            const expDate = latestLog ? latestLog.tanggal_kadaluarsa : null;
            // Test Case 6.3: Stok expired (Tanggal < hari ini)
            const isExpired = expDate ? (expDate < todayStr) : false;
            const isNearExpiry = expDate ? (!isExpired && (new Date(expDate) - new Date(todayStr)) / 86400000 <= 3) : false;

            let statusStok = 'Aman';
            if (item.stok <= 0) {
                statusStok = 'Habis';
            } else if (item.stok <= 5) {
                statusStok = 'Menipis';
            }

            return {
                ...item,
                tanggal_kadaluarsa: expDate,
                is_expired: isExpired,
                is_near_expiry: isNearExpiry,
                status_stok: statusStok
            };
        });

        return res.json({ success: true, data: enhanced });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

exports.adjustStock = (req, res) => {
    try {
        const { id_menu, id_cabang, id_pengguna, jenis, jumlah, tanggal_kadaluarsa, keterangan } = req.body;

        // Validations
        if (!id_menu || jumlah === undefined || isNaN(jumlah)) {
            return res.status(400).json({ success: false, message: 'Data penyesuaian stok tidak valid' });
        }

        const menu = db.get('SELECT * FROM menu WHERE id_menu = ?', [id_menu]);
        if (!menu) {
            return res.status(404).json({ success: false, message: 'Menu tidak ditemukan' });
        }

        const qty = parseInt(jumlah, 10);
        let stokBaru = menu.stok;

        // Test Case 6.1: Tambah stok cabang
        // Test Case 6.2: Edit stok
        if (jenis === 'MASUK') {
            stokBaru = menu.stok + Math.abs(qty);
        } else if (jenis === 'KELUAR') {
            stokBaru = Math.max(0, menu.stok - Math.abs(qty));
        } else if (jenis === 'PENYESUAIAN') {
            stokBaru = Math.max(0, qty);
        }

        // Test Case 6.4: Update stock on specific menu
        db.run('UPDATE menu SET stok = ? WHERE id_menu = ?', [stokBaru, id_menu]);

        // Insert log
        const nowIso = new Date().toISOString();
        const stkId = 'STK' + Date.now().toString().slice(-6);
        const selisih = jenis === 'PENYESUAIAN' ? (stokBaru - menu.stok) : (jenis === 'MASUK' ? qty : -qty);

        db.run(
            `INSERT INTO stok (id_stok, id_menu, id_cabang, id_pengguna, tanggal, jenis, perubahan, stok_sisa, tanggal_kadaluarsa, keterangan)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                stkId,
                id_menu,
                id_cabang || menu.id_cabang || 'CBG001',
                id_pengguna || 'USR001',
                nowIso,
                jenis || 'PENYESUAIAN',
                selisih,
                stokBaru,
                tanggal_kadaluarsa || null,
                keterangan || `Penyesuaian stok (${jenis})`
            ]
        );

        return res.json({
            success: true,
            message: 'Perubahan stok berhasil disimpan',
            data: { id_menu, stok_sebelum: menu.stok, stok_baru: stokBaru, selisih }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

exports.getMutationLogs = (req, res) => {
    try {
        const { id_menu, cabang, limit = 50 } = req.query;
        let sql = `
            SELECT s.*, m.nama_menu, m.kategori, p.nama_pengguna, c.nama_cabang
            FROM stok s
            LEFT JOIN menu m ON s.id_menu = m.id_menu
            LEFT JOIN pengguna p ON s.id_pengguna = p.id_pengguna
            LEFT JOIN cabang c ON s.id_cabang = c.id_cabang
            WHERE 1=1
        `;
        const params = [];

        if (id_menu) {
            sql += ' AND s.id_menu = ?';
            params.push(id_menu);
        }

        if (cabang && cabang !== 'all' && cabang !== 'Semua') {
            sql += ' AND s.id_cabang = ?';
            params.push(cabang);
        }

        sql += ' ORDER BY s.tanggal DESC LIMIT ?';
        params.push(parseInt(limit, 10));

        const logs = db.query(sql, params);
        return res.json({ success: true, data: logs });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

