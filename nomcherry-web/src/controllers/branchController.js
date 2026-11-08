/**
 * Branch Controller for NomCherry Café
 */

const db = require('../database/db');

function serverError(res, err, context) {
    console.error(`[branchController] ${context}:`, err.message);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' });
}

exports.getAll = (req, res) => {
    try {
        const branches = db.query('SELECT * FROM cabang ORDER BY id_cabang ASC');
        return res.json({ success: true, data: branches });
    } catch (err) {
        return serverError(res, err, 'getAll');
    }
};

exports.update = (req, res) => {
    try {
        const { id } = req.params;
        const { nama_cabang, alamat, no_telp } = req.body || {};

        if (!nama_cabang || !alamat || !no_telp) {
            return res.status(400).json({ success: false, message: 'Data cabang tidak lengkap' });
        }

        const existing = db.get('SELECT id_cabang FROM cabang WHERE id_cabang = ?', [id]);
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Cabang tidak ditemukan' });
        }

        db.run(
            'UPDATE cabang SET nama_cabang = ?, alamat = ?, no_telp = ? WHERE id_cabang = ?',
            [String(nama_cabang).trim(), String(alamat).trim(), String(no_telp).trim(), id]
        );

        return res.json({ success: true, message: 'Data cabang berhasil diperbarui' });
    } catch (err) {
        return serverError(res, err, 'update');
    }
};
