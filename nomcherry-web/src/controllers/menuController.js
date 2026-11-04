/**
 * Menu Controller for NomCherry Café
 * Implements test cases 2.1, 2.2, 2.3
 */

const db = require('../database/db');

exports.getAll = (req, res) => {
    try {
        const { kategori, search, cabang } = req.query;
        let sql = 'SELECT * FROM menu WHERE 1=1';
        const params = [];

        if (kategori && kategori !== 'Semua') {
            sql += ' AND kategori = ?';
            params.push(kategori);
        }

        if (search && search.trim() !== '') {
            sql += ' AND (nama_menu LIKE ? OR deskripsi LIKE ?)';
            const term = `%${search.trim()}%`;
            params.push(term, term);
        }

        sql += ' ORDER BY kategori ASC, nama_menu ASC';
        const menuList = db.query(sql, params);

        return res.json({ success: true, data: menuList });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

exports.getById = (req, res) => {
    try {
        const { id } = req.params;
        const item = db.get('SELECT * FROM menu WHERE id_menu = ?', [id]);
        if (!item) {
            return res.status(404).json({ success: false, message: 'Menu tidak ditemukan' });
        }
        return res.json({ success: true, data: item });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

exports.create = (req, res) => {
    try {
        const { nama_menu, harga, stok, kategori, deskripsi, gambar, id_cabang } = req.body;

        // Test Case 2.1: Validasi input & tambah menu baru
        if (!nama_menu || harga === undefined || harga === null || harga < 0) {
            return res.status(400).json({ success: false, message: 'Nama menu dan harga harus valid' });
        }

        // Auto generate Menu ID: MNUxxx
        const allMenus = db.query('SELECT id_menu FROM menu');
        let maxId = 0;
        allMenus.forEach(m => {
            const num = parseInt(m.id_menu.replace('MNU', ''), 10);
            if (!isNaN(num) && num > maxId) maxId = num;
        });
        const newId = 'MNU' + String(maxId + 1).padStart(3, '0');

        const defaultIcon = kategori === 'Makanan' ? '🍜' : (kategori === 'Dessert' ? '🍰' : (kategori === 'Snack' ? '🍟' : '☕'));

        db.run(
            `INSERT INTO menu (id_menu, nama_menu, harga, stok, kategori, deskripsi, gambar, id_cabang, is_available)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [
                newId,
                nama_menu.trim(),
                parseFloat(harga),
                parseInt(stok || 0, 10),
                kategori || 'Minuman',
                deskripsi || '',
                gambar || defaultIcon,
                id_cabang || 'CBG001'
            ]
        );

        // Record initial stock in mutation table if stock > 0
        if (stok && parseInt(stok, 10) > 0) {
            const nowIso = new Date().toISOString();
            const stkId = 'STK' + Date.now().toString().slice(-6);
            db.run(
                `INSERT INTO stok (id_stok, id_menu, id_cabang, id_pengguna, tanggal, jenis, perubahan, stok_sisa, keterangan)
                 VALUES (?, ?, ?, ?, ?, 'MASUK', ?, ?, 'Stok awal menu baru')`,
                [stkId, newId, id_cabang || 'CBG001', 'USR001', nowIso, parseInt(stok, 10), parseInt(stok, 10)]
            );
        }

        return res.json({
            success: true,
            message: 'Menu berhasil ditambahkan',
            data: { id_menu: newId, nama_menu, harga, stok, kategori }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

exports.update = (req, res) => {
    try {
        const { id } = req.params;
        const { nama_menu, harga, stok, kategori, deskripsi, gambar, is_available } = req.body;

        const existing = db.get('SELECT * FROM menu WHERE id_menu = ?', [id]);
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Menu tidak ditemukan' });
        }

        // Test Case 2.2: Edit menu
        const newNama = nama_menu !== undefined ? nama_menu.trim() : existing.nama_menu;
        const newHarga = harga !== undefined ? parseFloat(harga) : existing.harga;
        const newStok = stok !== undefined ? parseInt(stok, 10) : existing.stok;
        const newKategori = kategori !== undefined ? kategori : existing.kategori;
        const newDeskripsi = deskripsi !== undefined ? deskripsi : existing.deskripsi;
        const newGambar = gambar !== undefined ? gambar : existing.gambar;
        const newAvail = is_available !== undefined ? (is_available ? 1 : 0) : existing.is_available;

        db.run(
            `UPDATE menu
             SET nama_menu = ?, harga = ?, stok = ?, kategori = ?, deskripsi = ?, gambar = ?, is_available = ?
             WHERE id_menu = ?`,
            [newNama, newHarga, newStok, newKategori, newDeskripsi, newGambar, newAvail, id]
        );

        return res.json({
            success: true,
            message: 'Perubahan berhasil disimpan',
            data: { id_menu: id, nama_menu: newNama, harga: newHarga, stok: newStok, kategori: newKategori }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

exports.delete = (req, res) => {
    try {
        const { id } = req.params;
        // Test Case 2.3: Hapus menu
        const existing = db.get('SELECT * FROM menu WHERE id_menu = ?', [id]);
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Menu tidak ditemukan' });
        }

        db.run('DELETE FROM menu WHERE id_menu = ?', [id]);
        return res.json({ success: true, message: 'Menu terhapus' });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

