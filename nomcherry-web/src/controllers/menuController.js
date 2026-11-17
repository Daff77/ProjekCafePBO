/**
 * Menu Controller for NomCherry Café
 * Global catalog with per-branch isolated stock allocation and business-date expiry flags.
 */

const db = require('../database/db');
const dateService = require('../services/dateService');
const { resolveAuthorizedBranch } = require('../services/authService');

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
        const resolved = resolveAuthorizedBranch(req, cabang);
        if (resolved.errorStatus) {
            return res.status(resolved.errorStatus).json({ success: false, message: resolved.errorMessage });
        }
        const activeBranchId = resolved.branchId;

        let sql = 'SELECT * FROM menu WHERE 1=1';
        const params = [];

        if (include_inactive !== '1' && include_inactive !== 'true') {
            sql += ' AND COALESCE(is_available, 1) = 1';
        }

        if (kategori && kategori !== 'Semua' && kategori !== 'all') {
            sql += ' AND kategori = ?';
            params.push(kategori);
        }

        if (search && search.trim() !== '') {
            sql += ' AND (nama_menu LIKE ? OR deskripsi LIKE ?)';
            const term = `%${search.trim()}%`;
            params.push(term, term);
        }

        sql += ' ORDER BY kategori ASC, nama_menu ASC';
        const businessToday = dateService.today();
        const menuList = db.query(sql, params).map(item => {
            const branchStock = db.syncBranchStockRow(activeBranchId, item.id_menu);
            const expInfo = dateService.evaluateExpiry(
                branchStock ? branchStock.tanggal_kadaluarsa : null,
                businessToday
            );
            return {
                ...item,
                stok: branchStock ? branchStock.stok : item.stok,
                min_stok: branchStock ? branchStock.min_stok : (item.min_stok ?? 5),
                tanggal_kadaluarsa: expInfo.tanggal_kadaluarsa,
                days_until_expiry: expInfo.days_until_expiry,
                is_expired: expInfo.is_expired,
                is_near_expiry: expInfo.is_near_expiry,
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
        const resolved = resolveAuthorizedBranch(req, req.query && req.query.cabang);
        if (resolved.errorStatus) {
            return res.status(resolved.errorStatus).json({ success: false, message: resolved.errorMessage });
        }

        const item = db.get('SELECT * FROM menu WHERE id_menu = ?', [id]);
        if (!item) {
            return res.status(404).json({ success: false, message: 'Menu tidak ditemukan' });
        }

        const branchStock = db.syncBranchStockRow(resolved.branchId, item.id_menu);
        const expInfo = dateService.evaluateExpiry(branchStock ? branchStock.tanggal_kadaluarsa : null);

        return res.json({
            success: true,
            data: {
                ...item,
                stok: branchStock ? branchStock.stok : item.stok,
                min_stok: branchStock ? branchStock.min_stok : (item.min_stok ?? 5),
                tanggal_kadaluarsa: expInfo.tanggal_kadaluarsa,
                days_until_expiry: expInfo.days_until_expiry,
                is_expired: expInfo.is_expired,
                is_near_expiry: expInfo.is_near_expiry,
                id_cabang_aktif: resolved.branchId
            }
        });
    } catch (err) {
        return serverError(res, err, 'getById');
    }
};

exports.create = (req, res) => {
    try {
        const {
            nama_menu,
            harga,
            stok,
            min_stok,
            kategori,
            deskripsi,
            gambar,
            id_cabang,
            tanggal_kadaluarsa,
            alokasi_cabang
        } = req.body || {};

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

        const expValidation = dateService.validateDateParam(tanggal_kadaluarsa, 'Tanggal kedaluwarsa');
        if (!expValidation.valid) {
            return res.status(400).json({ success: false, message: expValidation.message });
        }

        const branchId = id_cabang || (req.user && req.user.id_cabang) || 'CBG001';
        if (!db.get('SELECT id_cabang FROM cabang WHERE id_cabang = ?', [branchId])) {
            return res.status(400).json({ success: false, message: 'Cabang tidak ditemukan' });
        }

        const branches = db.query('SELECT id_cabang FROM cabang');
        const branchIds = new Set(branches.map(b => b.id_cabang));
        const allocationMap = new Map();

        if (alokasi_cabang && typeof alokasi_cabang === 'object' && !Array.isArray(alokasi_cabang)) {
            for (const [bId, qtyVal] of Object.entries(alokasi_cabang)) {
                if (!branchIds.has(bId)) {
                    return res.status(400).json({ success: false, message: `Cabang pada alokasi tidak ditemukan: ${bId}` });
                }
                const parsedQty = parseStock(qtyVal);
                if (parsedQty === null) {
                    return res.status(400).json({ success: false, message: `Jumlah alokasi stok untuk cabang ${bId} tidak valid` });
                }
                allocationMap.set(bId, parsedQty);
            }
        } else {
            // Default policy: initial stock is allocated ONLY to the target branch; all other branches start at 0.
            allocationMap.set(branchId, stock);
        }

        const primaryBranchStock = allocationMap.has(branchId) ? allocationMap.get(branchId) : 0;
        const newId = nextMenuId();
        const defaultIcon = 'assets/logo.png';
        const activeUserId = (req.user && req.user.id_pengguna) || 'USR001';
        const expDate = expValidation.value;

        db.transaction(() => {
            const nowIso = dateService.nowIso();
            db.run(
                `INSERT INTO menu (id_menu, nama_menu, harga, stok, min_stok, kategori, deskripsi, gambar, id_cabang, is_available)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                [
                    newId,
                    name,
                    price,
                    primaryBranchStock,
                    minStock,
                    category,
                    typeof deskripsi === 'string' ? deskripsi.trim() : '',
                    gambar || defaultIcon,
                    branchId
                ]
            );

            branches.forEach((b, idx) => {
                const branchQty = allocationMap.has(b.id_cabang) ? allocationMap.get(b.id_cabang) : 0;
                const branchExp = branchQty > 0 ? expDate : null;
                db.run(
                    `INSERT OR REPLACE INTO stok_cabang (id_cabang, id_menu, stok, min_stok, tanggal_kadaluarsa, menu_stok_snapshot, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [b.id_cabang, newId, branchQty, minStock, branchExp, primaryBranchStock, nowIso]
                );

                if (branchQty > 0) {
                    const stkId = 'STK' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + idx;
                    db.run(
                        `INSERT INTO stok (id_stok, id_menu, id_cabang, id_pengguna, tanggal, jenis, stok_awal, perubahan, stok_sisa, tanggal_kadaluarsa, keterangan)
                         VALUES (?, ?, ?, ?, ?, 'MASUK', 0, ?, ?, ?, ?)`,
                        [
                            stkId,
                            newId,
                            b.id_cabang,
                            activeUserId,
                            nowIso,
                            branchQty,
                            branchQty,
                            branchExp,
                            `Stok awal menu baru (${b.id_cabang})`
                        ]
                    );
                }
            });
        });

        return res.json({
            success: true,
            message: 'Menu berhasil ditambahkan',
            data: {
                id_menu: newId,
                nama_menu: name,
                harga: price,
                stok: primaryBranchStock,
                min_stok: minStock,
                kategori: category,
                id_cabang: branchId
            }
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

        if (tanggal_kadaluarsa !== undefined && tanggal_kadaluarsa !== null && String(tanggal_kadaluarsa).trim() !== '') {
            const expCheck = dateService.validateDateParam(tanggal_kadaluarsa, 'Tanggal kedaluwarsa');
            if (!expCheck.valid) {
                return res.status(400).json({ success: false, message: expCheck.message });
            }
        }

        const activeBranchId = id_cabang || (req.user && req.user.id_cabang) || existing.id_cabang || 'CBG001';
        if (!db.get('SELECT id_cabang FROM cabang WHERE id_cabang = ?', [activeBranchId])) {
            return res.status(400).json({ success: false, message: 'Cabang tidak ditemukan' });
        }

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
        const nowIso = dateService.nowIso();

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
