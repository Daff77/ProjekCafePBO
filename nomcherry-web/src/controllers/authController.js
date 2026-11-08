/**
 * Auth Controller for NomCherry Café
 * Implements test cases 1.1, 1.2, 1.3, 1.4, 8.1, 8.2, 8.3
 * Passwords are hashed with scrypt and sessions use signed HttpOnly cookies.
 */

const db = require('../database/db');
const passwordService = require('../services/passwordService');
const authService = require('../services/authService');

const VALID_ROLES = ['admin', 'kasir', 'manager', 'owner'];

function serverError(res, err, context) {
    console.error(`[authController] ${context}:`, err.message);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' });
}

exports.login = (req, res) => {
    try {
        const { username, kata_sandi, id_cabang } = req.body || {};

        if (!username || !kata_sandi || username.trim() === '' || kata_sandi.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Field tidak boleh kosong'
            });
        }

        const user = db.get('SELECT * FROM pengguna WHERE username = ?', [username.trim()]);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Username tidak ditemukan'
            });
        }

        if (!passwordService.verifyPassword(kata_sandi, user.kata_sandi)) {
            return res.status(401).json({
                success: false,
                message: 'Password salah'
            });
        }

        // Opportunistic migration from legacy plaintext passwords.
        if (passwordService.needsRehash(user.kata_sandi)) {
            db.run('UPDATE pengguna SET kata_sandi = ? WHERE id_pengguna = ?', [
                passwordService.hashPassword(kata_sandi),
                user.id_pengguna
            ]);
        }

        if (id_cabang && user.peran === 'kasir') {
            if (user.id_cabang && user.id_cabang !== id_cabang) {
                return res.status(403).json({
                    success: false,
                    message: 'Anda tidak terdaftar di cabang ini'
                });
            }
        }

        const targetCabangId = id_cabang || user.id_cabang || 'CBG001';
        const cabang = db.get('SELECT * FROM cabang WHERE id_cabang = ?', [targetCabangId]);
        if (!cabang) {
            return res.status(400).json({ success: false, message: 'Cabang tidak ditemukan' });
        }

        authService.setSessionCookie(res, authService.createSessionToken(user, req));

        return res.json({
            success: true,
            message: 'Berhasil login ke sistem',
            data: {
                id_pengguna: user.id_pengguna,
                nama_pengguna: user.nama_pengguna,
                username: user.username,
                peran: user.peran,
                id_cabang: targetCabangId,
                nama_cabang: cabang.nama_cabang,
                alamat_cabang: cabang.alamat,
                no_telp_cabang: cabang.no_telp
            }
        });
    } catch (err) {
        return serverError(res, err, 'login');
    }
};

exports.logout = (req, res) => {
    authService.revokeSession(req);
    authService.clearSessionCookie(res);
    return res.json({ success: true, message: 'Berhasil keluar dari sistem' });
};

exports.session = (req, res) => {
    return res.json({
        success: true,
        data: {
            id_pengguna: req.user.id_pengguna,
            nama_pengguna: req.user.nama_pengguna,
            username: req.user.username,
            peran: req.user.peran,
            id_cabang: req.user.id_cabang,
            nama_cabang: req.user.nama_cabang,
            alamat_cabang: req.user.alamat_cabang,
            no_telp_cabang: req.user.no_telp_cabang
        }
    });
};

exports.getUsers = (req, res) => {
    try {
        const users = db.query(`
            SELECT p.id_pengguna, p.nama_pengguna, p.username, p.peran, p.id_cabang, c.nama_cabang
            FROM pengguna p
            LEFT JOIN cabang c ON p.id_cabang = c.id_cabang
            ORDER BY p.id_pengguna ASC
        `);
        return res.json({ success: true, data: users });
    } catch (err) {
        return serverError(res, err, 'getUsers');
    }
};

exports.createUser = (req, res) => {
    try {
        const { nama_pengguna, username, kata_sandi, peran, id_cabang } = req.body || {};

        if (!nama_pengguna || !username || !kata_sandi || !peran) {
            return res.status(400).json({ success: false, message: 'Data user tidak lengkap' });
        }

        if (!VALID_ROLES.includes(peran)) {
            return res.status(400).json({ success: false, message: 'Peran pengguna tidak valid' });
        }

        const branchId = id_cabang || 'CBG001';
        const branch = db.get('SELECT id_cabang FROM cabang WHERE id_cabang = ?', [branchId]);
        if (!branch) {
            return res.status(400).json({ success: false, message: 'Cabang tidak ditemukan' });
        }

        const existing = db.get('SELECT id_pengguna FROM pengguna WHERE username = ?', [username.trim()]);
        if (existing) {
            return res.status(400).json({ success: false, message: 'Username sudah digunakan' });
        }

        const allUsers = db.query('SELECT id_pengguna FROM pengguna');
        let maxId = 0;
        allUsers.forEach(u => {
            const num = parseInt(u.id_pengguna.replace('USR', ''), 10);
            if (!isNaN(num) && num > maxId) maxId = num;
        });
        const newId = 'USR' + String(maxId + 1).padStart(3, '0');

        db.run(
            'INSERT INTO pengguna (id_pengguna, nama_pengguna, username, kata_sandi, peran, id_cabang) VALUES (?, ?, ?, ?, ?, ?)',
            [
                newId,
                nama_pengguna.trim(),
                username.trim(),
                passwordService.hashPassword(kata_sandi),
                peran,
                branchId
            ]
        );

        return res.json({
            success: true,
            message: 'User berhasil disimpan',
            data: { id_pengguna: newId, nama_pengguna, username, peran, id_cabang: branchId }
        });
    } catch (err) {
        return serverError(res, err, 'createUser');
    }
};

exports.deleteUser = (req, res) => {
    try {
        const { id } = req.params;

        if (id === 'USR001') {
            return res.status(400).json({ success: false, message: 'Tidak dapat menghapus Admin Utama' });
        }

        if (req.user && req.user.id_pengguna === id) {
            return res.status(400).json({ success: false, message: 'Tidak dapat menghapus akun sendiri' });
        }

        const existing = db.get('SELECT id_pengguna FROM pengguna WHERE id_pengguna = ?', [id]);
        if (!existing) {
            return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
        }

        try {
            db.run('DELETE FROM pengguna WHERE id_pengguna = ?', [id]);
        } catch (err) {
            if (/FOREIGN KEY/i.test(err.message)) {
                return res.status(409).json({
                    success: false,
                    message: 'User memiliki riwayat transaksi dan tidak dapat dihapus'
                });
            }
            throw err;
        }

        return res.json({ success: true, message: 'User berhasil terhapus' });
    } catch (err) {
        return serverError(res, err, 'deleteUser');
    }
};
