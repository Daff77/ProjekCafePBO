/**
 * Menu Controller for NomCherry Café
 * Implements test cases 2.1, 2.2, 2.3
 */

const db = require('../database/db');

const VALID_CATEGORIES = ['Makanan', 'Minuman', 'Dessert', 'Snack'];

function serverError(res, err, context) {
    console.error(`[menuController] ${context}:`, err.message);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' });
}

function parsePrice(value) {
    const price = Number(value);
    return Number.isFinite(price) && price >= 0 ? price : null;
}

function parseStock(value) {
    const stock = Number(value);
    return Number.isInteger(stock) && stock >= 0 ? stock : null;
}

function nextMenuId() {
    const allMenus = db.query('SELECT id_menu FROM menu');
    let maxId = 0;
    allMenus.forEach(m => {
        const num = parseInt(m.id_menu.replace('MNU', ''), 10);
        if (!isNaN(num) && num > maxId) maxId = num;
    });
    return 'MNU' + String(maxId + 1).padStart(3, '0');
}

exports.getAll = (req, res) => {
    try {
        const { kategori, search, cabang, include_inactive } = req.query || {};
        const activeBranchId = (req.user && req.user.peran === 'kasir' && req.user.id_cabang)
            ? req.user.id_cabang
            : ((cabang && cabang !== 'all' && cabang !== 'Semua') ? cabang : ((req.user && req.user.id_cabang) || 'CBG001'));

        let sql = 'SELECT * FROM menu WHERE 1=1';
        const params = [];

        if (include_inactive !== '1' && include_inactive !== 'true') {
            sql += ' AND COALESCE(is_available, 1) = 1';
        }

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
        const menuList = db.query(sql, params).map(item => {
            const branchStock = db.syncBranchStockRow(activeBranchId, item.id_menu);
            return {
                ...item,
                stok: branchStock ? branchStock.stok : item.stok,
                min_stok: branchStock ? branchStock.min_stok : (item.min_stok ?? 5),
                tanggal_kadaluarsa: branchStock ? branchStock.tanggal_kadaluarsa : null,
                id_cabang_aktif: activeBranchId
            };
        });

        return res.json({ success: true, data: menuList });
    } catch (err) {
        return serverError(res, err, 'getAll');
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
        return serverError(res, err, 'getById');
    }
};

exports.create = (req, res) => {
    try {
        const { nama_menu, harga, stok, min_stok, kategori, deskripsi, gambar, id_cabang, tanggal_kadaluarsa } = req.body || {};

        const name = typeof nama_menu === 'string' ? nama_menu.trim() : '';
        const price = parsePrice(harga);
        const stock = stok === undefined || stok === null ? 0 : parseStock(stok);
        const minStock = min_stok === undefined || min_stok === null ? 5 : parseStock(min_stok);
        const category = kategori || 'Minuman';

        if (!name || price === null || stock === null || minStock === null) {
            return res.status(400).json({ success: false, message: 'Nama menu, harga, dan stok harus valid' });
        }

        if (!VALID_CATEGORIES.includes(category)) {
            return res.status(400).json({ success: false, message: 'Kategori menu tidak valid' });
        }

        const branchId = id_cabang || (req.user && req.user.id_cabang) || 'CBG001';
        if (!db.get('SELECT id_cabang FROM cabang WHERE id_cabang = ?', [branchId])) {
            return res.status(400).json({ success: false, message: 'Cabang tidak ditemukan' });
        }

        const newId = nextMenuId();
        const defaultIcon = category === 'Makanan' ? '🍜' : (category === 'Dessert' ? '🍰' : (category === 'Snack' ? '🍟' : '☕'));
        const activeUserId = (req.user && req.user.id_pengguna) || 'USR001';
        const expDate = typeof tanggal_kadaluarsa === 'string' && tanggal_kadaluarsa.trim() !== ''
            ? tanggal_kadaluarsa.trim()
            : null;

        db.transaction(() => {
            const nowIso = new Date().toISOString();
            db.run(
                `INSERT INTO menu (id_menu, nama_menu, harga, stok, min_stok, kategori, deskripsi, gambar, id_cabang, is_available)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                [
                    newId,
                    name,
                    price,
                    stock,
                    minStock,
                    category,
                    typeof deskripsi === 'string' ? deskripsi.trim() : '',
                    gambar || defaultIcon,
                    branchId
                ]
            );

            const branches = db.query('SELECT id_cabang FROM cabang');
            for (const b of branches) {
                db.run(
                    `INSERT OR REPLACE INTO stok_cabang (id_cabang, id_menu, stok, min_stok, tanggal_kadaluarsa, menu_stok_snapshot, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [b.id_cabang, newId, stock, minStock, expDate, stock, nowIso]
                );
            }

            if (stock > 0) {
                const stkId = 'STK' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
                db.run(
                    `INSERT INTO stok (id_stok, id_menu, id_cabang, id_pengguna, tanggal, jenis, stok_awal, perubahan, stok_sisa, tanggal_kadaluarsa, keterangan)
                     VALUES (?, ?, ?, ?, ?, 'MASUK', 0, ?, ?, ?, 'Stok awal menu baru')`,
                    [stkId, newId, branchId, activeUserId, nowIso, stock, stock, expDate]
                );
            }
        });

        return res.json({
            success: true,
            message: 'Menu berhasil ditambahkan',
            data: { id_menu: newId, nama_menu: name, harga: price, stok: stock, min_stok: minStock, kategori: category }
        });
    } catch (err) {
        return serverError(res, err, 'create');
    }
};

exports.update = (req, res) => {
    try {
        const { id } = req.params;
        const body = req.body || {};
        const { nama_menu, harga, stok, min_stok, kategori, deskripsi, gambar, is_available, id_cabang, tanggal_kadaluarsa } = body;

        const existing = db.get('SELECT * FROM menu WHERE id_menu = ?', [id]);
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Menu tidak ditemukan' });
        }

        const activeBranchId = id_cabang || (req.user && req.user.id_cabang) || existing.id_cabang || 'CBG001';
        const branchStock = db.syncBranchStockRow(activeBranchId, id);
        const existingBranchStok = branchStock ? branchStock.stok : existing.stok;
        const existingMinStok = branchStock ? branchStock.min_stok : (existing.min_stok ?? 5);

        const newNama = nama_menu !== undefined
            ? (typeof nama_menu === 'string' ? nama_menu.trim() : '')
            : existing.nama_menu;
        const newHarga = harga !== undefined ? parsePrice(harga) : existing.harga;
        const newStok = stok !== undefined ? parseStock(stok) : existingBranchStok;
        const newMinStok = min_stok !== undefined ? parseStock(min_stok) : existingMinStok;
        const newKategori = kategori !== undefined ? kategori : existing.kategori;
        const newDeskripsi = deskripsi !== undefined ? String(deskripsi) : existing.deskripsi;
        const newGambar = gambar !== undefined ? gambar : existing.gambar;
        const newAvail = is_available !== undefined
            ? (is_available === true || is_available === 1 || is_available === '1' ? 1 : 0)
            : existing.is_available;

        if (!newNama || newHarga === null || newStok === null || newMinStok === null) {
            return res.status(400).json({ success: false, message: 'Nama menu, harga, dan stok harus valid' });
        }

        if (!VALID_CATEGORIES.includes(newKategori)) {
            return res.status(400).json({ success: false, message: 'Kategori menu tidak valid' });
        }

        const activeUserId = (req.user && req.user.id_pengguna) || 'USR001';
        const nowIso = new Date().toISOString();

        db.transaction(() => {
            db.run(
                `UPDATE menu
                 SET nama_menu = ?, harga = ?, min_stok = ?, kategori = ?, deskripsi = ?, gambar = ?, is_available = ?
                 WHERE id_menu = ?`,
                [newNama, newHarga, newMinStok, newKategori, newDeskripsi, newGambar, newAvail, id]
            );

            db.applyBranchStockChange({
                id_cabang: activeBranchId,
                id_menu: id,
                stokBaru: newStok,
                minStok: newMinStok,
                tanggalKadaluarsa: tanggal_kadaluarsa !== undefined
                    ? (tanggal_kadaluarsa ? String(tanggal_kadaluarsa).trim() : null)
                    : undefined
            });

            if (newStok !== existingBranchStok) {
                const stkId = 'STK' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
                db.run(
                    `INSERT INTO stok (id_stok, id_menu, id_cabang, id_pengguna, tanggal, jenis, stok_awal, perubahan, stok_sisa, keterangan)
                     VALUES (?, ?, ?, ?, ?, 'PENYESUAIAN', ?, ?, ?, ?)`,
                    [
                        stkId,
                        id,
                        activeBranchId,
                        activeUserId,
                        nowIso,
                        existingBranchStok,
                        newStok - existingBranchStok,
                        newStok,
                        'Penyesuaian stok melalui editor menu'
                    ]
                );
            }
        });

        return res.json({
            success: true,
            message: 'Perubahan berhasil disimpan',
            data: { id_menu: id, nama_menu: newNama, harga: newHarga, stok: newStok, min_stok: newMinStok, kategori: newKategori }
        });
    } catch (err) {
        return serverError(res, err, 'update');
    }
};

exports.delete = (req, res) => {
    try {
        const { id } = req.params;
        const existing = db.get('SELECT * FROM menu WHERE id_menu = ?', [id]);
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Menu tidak ditemukan' });
        }

        const references = db.get(`
            SELECT
                (SELECT COUNT(*) FROM detail_pesanan WHERE id_menu = ?) AS order_refs,
                (SELECT COUNT(*) FROM stok WHERE id_menu = ?) AS stock_refs
        `, [id, id]);

        if (references.order_refs > 0 || references.stock_refs > 0) {
            db.run('UPDATE menu SET is_available = 0 WHERE id_menu = ?', [id]);
            return res.json({
                success: true,
                message: 'Menu memiliki riwayat transaksi; menu dinonaktifkan, bukan dihapus',
                data: { id_menu: id, deactivated: true }
            });
        }

        db.run('DELETE FROM menu WHERE id_menu = ?', [id]);
        return res.json({ success: true, message: 'Menu terhapus' });
    } catch (err) {
        return serverError(res, err, 'delete');
    }
};
