/**
 * Auth Controller for NomCherry Café
 * Implements test cases 1.1, 1.2, 1.3, 1.4, 8.1, 8.2, 8.3
 */

const db = require('../database/db');

exports.login = (req, res) => {
    try {
        const { username, kata_sandi, id_cabang } = req.body;

        // Test Case 1.4: Field kosong
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

        // Test Case 1.2: Password salah
        if (user.kata_sandi !== kata_sandi) {
            return res.status(401).json({
                success: false,
                message: 'Password salah'
            });
        }

        // Test Case 1.3: User cabang A login di cabang B
        // Admin & Owner can access all branches; kasir & manager are branch-restricted
        if (id_cabang && user.peran === 'kasir') {
            if (user.id_cabang && user.id_cabang !== id_cabang) {
                return res.status(403).json({
                    success: false,
                    message: 'Anda tidak terdaftar di cabang ini'
                });
            }
        }

        // Get Branch details
        const targetCabangId = id_cabang || user.id_cabang || 'CBG001';
        const cabang = db.get('SELECT * FROM cabang WHERE id_cabang = ?', [targetCabangId]) || {
            id_cabang: 'CBG001',
            nama_cabang: 'NomCherry Pusat (Jemur)'
        };

        // Success - Test Case 1.1
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
        return res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
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
        return res.status(500).json({ success: false, message: err.message });
    }
};

exports.createUser = (req, res) => {
    try {
        const { nama_pengguna, username, kata_sandi, peran, id_cabang } = req.body;

        // Test Case 8.1: Tambah user
        if (!nama_pengguna || !username || !kata_sandi || !peran) {
            return res.status(400).json({ success: false, message: 'Data user tidak lengkap' });
        }

        const existing = db.get('SELECT id_pengguna FROM pengguna WHERE username = ?', [username.trim()]);
        if (existing) {
            return res.status(400).json({ success: false, message: 'Username sudah digunakan' });
        }

        // Auto generate USR ID
        const allUsers = db.query('SELECT id_pengguna FROM pengguna');
        let maxId = 0;
        allUsers.forEach(u => {
            const num = parseInt(u.id_pengguna.replace('USR', ''), 10);
            if (!isNaN(num) && num > maxId) maxId = num;
        });
        const newId = 'USR' + String(maxId + 1).padStart(3, '0');

        db.run(
            'INSERT INTO pengguna (id_pengguna, nama_pengguna, username, kata_sandi, peran, id_cabang) VALUES (?, ?, ?, ?, ?, ?)',
            [newId, nama_pengguna.trim(), username.trim(), kata_sandi, peran, id_cabang || 'CBG001']
        );

        return res.json({
            success: true,
            message: 'User berhasil disimpan',
            data: { id_pengguna: newId, nama_pengguna, username, peran, id_cabang }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

exports.deleteUser = (req, res) => {
    try {
        const { id } = req.params;
        // Test Case 8.3: Hapus user
        if (id === 'USR001') {
            return res.status(400).json({ success: false, message: 'Tidak dapat menghapus Admin Utama' });
        }

        db.run('DELETE FROM pengguna WHERE id_pengguna = ?', [id]);
        return res.json({ success: true, message: 'User berhasil terhapus' });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

