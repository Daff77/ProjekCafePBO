/**
 * Stock & Inventory Controller for NomCherry Café
 * Implements multi-branch stock management, movement history, configurable low-stock alerts,
 * stock opname (physical vs system reconciliation), expiration management, and controlled restock.
 */

const db = require('../database/db');

const VALID_MOVEMENT_TYPES = ['MASUK', 'KELUAR', 'PENYESUAIAN', 'OPNAME', 'RUSAK', 'KADALUARSA'];

function serverError(res, err, context) {
    console.error(`[stockController] ${context}:`, err.message);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' });
}

function getDefaultMinStock() {
    const row = db.get("SELECT value FROM app_settings WHERE key = 'low_stock_threshold'");
    const parsed = row ? parseInt(row.value, 10) : 5;
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : 5;
}

function resolveBranchId(req, requestedCabang) {
    if (req.user && req.user.peran === 'kasir' && req.user.id_cabang) {
        return req.user.id_cabang;
    }
    if (requestedCabang && requestedCabang !== 'all' && requestedCabang !== 'Semua') {
        return requestedCabang;
    }
    return (req.user && req.user.id_cabang) || 'CBG001';
}

exports.getStockList = (req, res) => {
    try {
        const { cabang, kategori, search, status } = req.query || {};
        const activeBranchId = resolveBranchId(req, cabang);
        const branchRow = db.get('SELECT id_cabang, nama_cabang FROM cabang WHERE id_cabang = ?', [activeBranchId]) || {
            id_cabang: activeBranchId,
            nama_cabang: activeBranchId === 'CBG002' ? 'NomCherry Cabang Timur (Rungkut)' : 'NomCherry Pusat (Jemur)'
        };

        let sql = `
            SELECT m.id_menu, m.nama_menu, m.harga, m.stok AS menu_stok,
                   COALESCE(m.min_stok, 5) AS menu_min_stok,
                   m.kategori, m.gambar, m.id_cabang AS menu_cabang
            FROM menu m
            WHERE COALESCE(m.is_available, 1) = 1
        `;
        const params = [];

        if (kategori && kategori !== 'Semua' && kategori !== 'all') {
            sql += ' AND m.kategori = ?';
            params.push(kategori);
        }

        if (search && search.trim() !== '') {
            sql += ' AND (m.nama_menu LIKE ? OR m.id_menu LIKE ?)';
            const term = `%${search.trim()}%`;
            params.push(term, term);
        }

        const rawItems = db.query(sql, params);
        const todayStr = new Date().toISOString().slice(0, 10);
        const defaultMin = getDefaultMinStock();

        let enhanced = rawItems.map(item => {
            const branchStock = db.syncBranchStockRow(activeBranchId, item.id_menu);
            const stok = branchStock ? branchStock.stok : item.menu_stok;
            const minStok = branchStock && Number.isInteger(branchStock.min_stok)
                ? branchStock.min_stok
                : (Number.isInteger(item.menu_min_stok) ? item.menu_min_stok : defaultMin);

            let expDate = branchStock ? branchStock.tanggal_kadaluarsa : null;
            if (!expDate) {
                const latestExp = db.get(
                    `SELECT tanggal_kadaluarsa FROM stok
                     WHERE id_menu = ? AND (id_cabang = ? OR id_cabang IS NULL) AND tanggal_kadaluarsa IS NOT NULL
                     ORDER BY tanggal DESC LIMIT 1`,
                    [item.id_menu, activeBranchId]
                );
                expDate = latestExp ? latestExp.tanggal_kadaluarsa : null;
            }

            const daysUntilExpiry = expDate
                ? Math.round((new Date(expDate + 'T00:00:00Z') - new Date(todayStr + 'T00:00:00Z')) / 86400000)
                : null;
            const isExpired = daysUntilExpiry !== null ? daysUntilExpiry < 0 : false;
            const isNearExpiry = daysUntilExpiry !== null ? (!isExpired && daysUntilExpiry <= 7) : false;

            let statusStok = 'Aman';
            if (stok <= 0) {
                statusStok = 'Habis';
            } else if (stok <= minStok) {
                statusStok = 'Menipis';
            }

            return {
                id_menu: item.id_menu,
                nama_menu: item.nama_menu,
                harga: item.harga,
                stok,
                min_stok: minStok,
                kategori: item.kategori,
                gambar: item.gambar,
                id_cabang: branchRow.id_cabang,
                nama_cabang: branchRow.nama_cabang,
                tanggal_kadaluarsa: expDate,
                days_until_expiry: daysUntilExpiry,
                is_expired: isExpired,
                is_near_expiry: isNearExpiry,
                status_stok: statusStok
            };
        });

        enhanced.sort((a, b) => a.stok - b.stok || a.nama_menu.localeCompare(b.nama_menu));

        const summary = {
            id_cabang: branchRow.id_cabang,
            nama_cabang: branchRow.nama_cabang,
            total_items: enhanced.length,
            safe_count: enhanced.filter(i => i.status_stok === 'Aman' && !i.is_expired).length,
            low_stock_count: enhanced.filter(i => i.status_stok === 'Menipis').length,
            out_of_stock_count: enhanced.filter(i => i.status_stok === 'Habis').length,
            expired_count: enhanced.filter(i => i.is_expired).length,
            near_expiry_count: enhanced.filter(i => i.is_near_expiry).length
        };

        if (status && status !== 'all' && status !== 'Semua') {
            if (status === 'Expired') {
                enhanced = enhanced.filter(i => i.is_expired || i.is_near_expiry);
            } else {
                enhanced = enhanced.filter(i => i.status_stok === status);
            }
        }

        return res.json({ success: true, data: enhanced, summary });
    } catch (err) {
        return serverError(res, err, 'getStockList');
    }
};

exports.adjustStock = (req, res) => {
    try {
        const body = req.body || {};
        const {
            id_menu,
            id_cabang,
            id_pengguna,
            jenis,
            jumlah,
            min_stok,
            tanggal_kadaluarsa,
            keterangan
        } = body;

        if (!id_menu || jumlah === undefined || jumlah === null || String(jumlah).trim() === '') {
            return res.status(400).json({ success: false, message: 'Data penyesuaian stok tidak valid' });
        }

        const movementType = String(jenis || 'PENYESUAIAN').toUpperCase();
        if (!VALID_MOVEMENT_TYPES.includes(movementType)) {
            return res.status(400).json({ success: false, message: 'Jenis mutasi stok tidak valid' });
        }

        const qty = Number(jumlah);
        const allowZeroQty = movementType === 'PENYESUAIAN' || movementType === 'OPNAME';
        if (!Number.isInteger(qty) || (allowZeroQty ? qty < 0 : qty <= 0) || qty > 100000) {
            return res.status(400).json({
                success: false,
                message: allowZeroQty
                    ? 'Jumlah stok harus berupa angka bulat 0 atau lebih'
                    : 'Jumlah perubahan stok harus berupa angka bulat positif'
            });
        }

        if (min_stok !== undefined && min_stok !== null && String(min_stok).trim() !== '') {
            const parsedMin = Number(min_stok);
            if (!Number.isInteger(parsedMin) || parsedMin < 0 || parsedMin > 10000) {
                return res.status(400).json({ success: false, message: 'Batas minimum stok harus berupa angka bulat >= 0' });
            }
        }

        const menu = db.get('SELECT * FROM menu WHERE id_menu = ?', [id_menu]);
        if (!menu) {
            return res.status(404).json({ success: false, message: 'Menu tidak ditemukan' });
        }

        const activeCabangId = resolveBranchId(req, id_cabang || menu.id_cabang || 'CBG001');
        if (!db.get('SELECT id_cabang FROM cabang WHERE id_cabang = ?', [activeCabangId])) {
            return res.status(400).json({ success: false, message: 'Cabang tidak ditemukan' });
        }

        const activeUserId = (req.user && req.user.id_pengguna) || id_pengguna || 'USR001';

        let insufficientStockError = null;
        const result = db.transaction(() => {
            const branchRow = db.syncBranchStockRow(activeCabangId, id_menu);
            const stokSebelum = branchRow ? branchRow.stok : menu.stok;
            let stokBaru = stokSebelum;

            if (movementType === 'MASUK') {
                stokBaru = stokSebelum + qty;
            } else if (movementType === 'KELUAR' || movementType === 'RUSAK' || movementType === 'KADALUARSA') {
                if (qty > stokSebelum) {
                    insufficientStockError = `Stok saat ini (${stokSebelum}) tidak mencukupi untuk pengurangan ${qty}`;
                    return null;
                }
                stokBaru = stokSebelum - qty;
            } else {
                // PENYESUAIAN or OPNAME sets the target stock directly
                stokBaru = qty;
            }

            const expToStore = tanggal_kadaluarsa !== undefined
                ? (tanggal_kadaluarsa ? String(tanggal_kadaluarsa).trim() : null)
                : (movementType === 'KADALUARSA' && stokBaru === 0 ? null : undefined);

            const updated = db.applyBranchStockChange({
                id_cabang: activeCabangId,
                id_menu,
                stokBaru,
                minStok: min_stok !== undefined && String(min_stok).trim() !== '' ? Number(min_stok) : undefined,
                tanggalKadaluarsa: expToStore
            });

            const nowIso = new Date().toISOString();
            const stkId = 'STK' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            const selisih = stokBaru - stokSebelum;

            const defaultLabels = {
                MASUK: `Restock barang masuk (+${qty})`,
                KELUAR: `Pengurangan stok manual (-${qty})`,
                RUSAK: `Stok rusak / waste (-${qty})`,
                KADALUARSA: `Pemusnahan stok kedaluwarsa (-${qty})`,
                PENYESUAIAN: `Penyesuaian stok manual (${stokSebelum} -> ${stokBaru})`,
                OPNAME: `Stock Opname (${stokSebelum} -> ${stokBaru})`
            };
            const finalNote = (typeof keterangan === 'string' && keterangan.trim() !== '')
                ? keterangan.trim()
                : (defaultLabels[movementType] || `Mutasi stok (${movementType})`);

            db.run(
                `INSERT INTO stok (id_stok, id_menu, id_cabang, id_pengguna, tanggal, jenis, stok_awal, perubahan, stok_sisa, tanggal_kadaluarsa, keterangan)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    stkId,
                    id_menu,
                    activeCabangId,
                    activeUserId,
                    nowIso,
                    movementType,
                    stokSebelum,
                    selisih,
                    stokBaru,
                    tanggal_kadaluarsa || (branchRow ? branchRow.tanggal_kadaluarsa : null),
                    finalNote
                ]
            );

            return {
                id_stok: stkId,
                id_cabang: activeCabangId,
                jenis: movementType,
                stok_sebelum: stokSebelum,
                stok_baru: stokBaru,
                selisih,
                min_stok: updated.min_stok,
                tanggal_kadaluarsa: updated.tanggal_kadaluarsa,
                keterangan: finalNote
            };
        });

        if (insufficientStockError) {
            return res.status(400).json({ success: false, message: insufficientStockError });
        }

        return res.json({
            success: true,
            message: 'Perubahan stok berhasil disimpan',
            data: { id_menu, nama_menu: menu.nama_menu, ...result }
        });
    } catch (err) {
        return serverError(res, err, 'adjustStock');
    }
};

exports.performStockOpname = (req, res) => {
    try {
        const body = req.body || {};
        const { id_cabang, catatan, items } = body;

        const opnameItems = Array.isArray(items)
            ? items
            : (body.id_menu ? [{ id_menu: body.id_menu, stok_fisik: body.stok_fisik, keterangan: body.keterangan }] : []);

        if (opnameItems.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Daftar item Stock Opname tidak boleh kosong'
            });
        }

        const activeCabangId = resolveBranchId(req, id_cabang || 'CBG001');
        if (!db.get('SELECT id_cabang FROM cabang WHERE id_cabang = ?', [activeCabangId])) {
            return res.status(400).json({ success: false, message: 'Cabang tidak ditemukan' });
        }

        const activeUserId = (req.user && req.user.id_pengguna) || body.id_pengguna || 'USR001';

        for (const entry of opnameItems) {
            if (!entry || !entry.id_menu) {
                return res.status(400).json({ success: false, message: 'ID menu pada Stock Opname wajib diisi' });
            }
            const fisik = Number(entry.stok_fisik);
            if (!Number.isInteger(fisik) || fisik < 0 || fisik > 100000) {
                return res.status(400).json({
                    success: false,
                    message: `Stok fisik untuk ${entry.id_menu} harus berupa angka bulat >= 0`
                });
            }
            const exists = db.get('SELECT id_menu FROM menu WHERE id_menu = ?', [entry.id_menu]);
            if (!exists) {
                return res.status(404).json({
                    success: false,
                    message: `Menu dengan ID ${entry.id_menu} tidak ditemukan`
                });
            }
        }

        const nowIso = new Date().toISOString();
        const generalNote = typeof catatan === 'string' && catatan.trim() !== ''
            ? catatan.trim()
            : 'Pencocokan stok fisik (Stock Opname)';

        const opnameResults = db.transaction(() => {
            const results = [];

            opnameItems.forEach((entry, idx) => {
                const menu = db.get('SELECT id_menu, nama_menu, stok FROM menu WHERE id_menu = ?', [entry.id_menu]);
                const branchRow = db.syncBranchStockRow(activeCabangId, entry.id_menu);
                const stokSistem = branchRow ? branchRow.stok : menu.stok;
                const stokFisik = Number(entry.stok_fisik);
                const selisih = stokFisik - stokSistem;

                db.applyBranchStockChange({
                    id_cabang: activeCabangId,
                    id_menu: entry.id_menu,
                    stokBaru: stokFisik
                });

                const itemReason = typeof entry.keterangan === 'string' && entry.keterangan.trim() !== ''
                    ? entry.keterangan.trim()
                    : generalNote;
                const fullNote = `[Stock Opname] Sistem: ${stokSistem}, Fisik: ${stokFisik}, Selisih: ${selisih >= 0 ? '+' + selisih : selisih} — ${itemReason}`;

                const stkId = 'STK' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + idx;
                db.run(
                    `INSERT INTO stok (id_stok, id_menu, id_cabang, id_pengguna, tanggal, jenis, stok_awal, perubahan, stok_sisa, tanggal_kadaluarsa, keterangan)
                     VALUES (?, ?, ?, ?, ?, 'OPNAME', ?, ?, ?, ?, ?)`,
                    [
                        stkId,
                        entry.id_menu,
                        activeCabangId,
                        activeUserId,
                        nowIso,
                        stokSistem,
                        selisih,
                        stokFisik,
                        branchRow ? branchRow.tanggal_kadaluarsa : null,
                        fullNote
                    ]
                );

                results.push({
                    id_stok: stkId,
                    id_menu: entry.id_menu,
                    nama_menu: menu.nama_menu,
                    stok_sistem: stokSistem,
                    stok_fisik: stokFisik,
                    selisih,
                    status_opname: selisih === 0 ? 'Sesuai' : (selisih > 0 ? 'Surplus' : 'Defisit'),
                    keterangan: fullNote
                });
            });

            return results;
        });

        const discrepancyCount = opnameResults.filter(r => r.selisih !== 0).length;

        return res.json({
            success: true,
            message: `Stock Opname berhasil disimpan (${opnameResults.length} item diperiksa, ${discrepancyCount} selisih tercatat)`,
            data: {
                id_cabang: activeCabangId,
                tanggal: nowIso,
                total_checked: opnameResults.length,
                discrepancy_count: discrepancyCount,
                items: opnameResults
            }
        });
    } catch (err) {
        return serverError(res, err, 'performStockOpname');
    }
};

exports.getMutationLogs = (req, res) => {
    try {
        const { id_menu, cabang, jenis, search } = req.query || {};
        const rawLimit = parseInt(req.query.limit, 10);
        const limit = Number.isInteger(rawLimit) ? Math.min(500, Math.max(1, rawLimit)) : 50;

        let sql = `
            SELECT s.id_stok, s.id_menu, s.id_cabang, s.id_pengguna, s.tanggal, s.jenis,
                   COALESCE(s.stok_awal, s.stok_sisa - s.perubahan) AS stok_awal,
                   s.perubahan, s.stok_sisa, s.tanggal_kadaluarsa, s.keterangan,
                   m.nama_menu, m.kategori, p.nama_pengguna, c.nama_cabang
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

        if (jenis && jenis !== 'all' && jenis !== 'Semua') {
            sql += ' AND s.jenis = ?';
            params.push(String(jenis).toUpperCase());
        }

        if (search && search.trim() !== '') {
            sql += ' AND (m.nama_menu LIKE ? OR s.keterangan LIKE ? OR p.nama_pengguna LIKE ?)';
            const term = `%${search.trim()}%`;
            params.push(term, term, term);
        }

        sql += ' ORDER BY s.tanggal DESC, s.id_stok DESC LIMIT ?';
        params.push(limit);

        const logs = db.query(sql, params);
        return res.json({ success: true, data: logs });
    } catch (err) {
        return serverError(res, err, 'getMutationLogs');
    }
};

exports.restockAll = (req, res) => {
    try {
        const body = req.body || {};
        const requested = Number(body.jumlah ?? 10);
        if (!Number.isInteger(requested) || requested <= 0 || requested > 1000) {
            return res.status(400).json({ success: false, message: 'Jumlah restock harus berupa angka bulat antara 1 dan 1000' });
        }

        const activeCabangId = resolveBranchId(req, body.id_cabang || 'CBG001');
        if (!db.get('SELECT id_cabang FROM cabang WHERE id_cabang = ?', [activeCabangId])) {
            return res.status(400).json({ success: false, message: 'Cabang tidak ditemukan' });
        }

        const onlyLowStock = body.only_low_stock === true || body.only_low_stock === 'true' || body.only_low_stock === 1;
        const expiryDate = typeof body.tanggal_kadaluarsa === 'string' && body.tanggal_kadaluarsa.trim() !== ''
            ? body.tanggal_kadaluarsa.trim()
            : undefined;
        const customNote = typeof body.keterangan === 'string' && body.keterangan.trim() !== ''
            ? body.keterangan.trim()
            : `Restock terkontrol (+${requested})`;

        const menus = db.query('SELECT id_menu, nama_menu, stok FROM menu WHERE COALESCE(is_available, 1) = 1');
        const activeUserId = (req.user && req.user.id_pengguna) || 'USR001';

        const updatedCount = db.transaction(() => {
            const nowIso = new Date().toISOString();
            let count = 0;

            menus.forEach((menu, idx) => {
                const branchRow = db.syncBranchStockRow(activeCabangId, menu.id_menu);
                const currentStock = branchRow ? branchRow.stok : menu.stok;
                const minStock = branchRow ? branchRow.min_stok : 5;

                if (onlyLowStock && currentStock > minStock) {
                    return;
                }

                const newStock = currentStock + requested;
                const updated = db.applyBranchStockChange({
                    id_cabang: activeCabangId,
                    id_menu: menu.id_menu,
                    stokBaru: newStock,
                    tanggalKadaluarsa: expiryDate
                });

                const stkId = 'STK' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + idx;
                db.run(
                    `INSERT INTO stok (id_stok, id_menu, id_cabang, id_pengguna, tanggal, jenis, stok_awal, perubahan, stok_sisa, tanggal_kadaluarsa, keterangan)
                     VALUES (?, ?, ?, ?, ?, 'MASUK', ?, ?, ?, ?, ?)`,
                    [
                        stkId,
                        menu.id_menu,
                        activeCabangId,
                        activeUserId,
                        nowIso,
                        currentStock,
                        requested,
                        newStock,
                        updated.tanggal_kadaluarsa,
                        customNote
                    ]
                );
                count += 1;
            });

            return count;
        });

        return res.json({
            success: true,
            message: updatedCount > 0
                ? `Restock +${requested} berhasil diterapkan ke ${updatedCount} menu pada cabang ${activeCabangId}`
                : 'Tidak ada item yang memerlukan restock sesuai filter',
            data: { id_cabang: activeCabangId, menu_count: updatedCount, jumlah: requested }
        });
    } catch (err) {
        return serverError(res, err, 'restockAll');
    }
};
