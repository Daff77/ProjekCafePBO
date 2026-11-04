/**
 * Branch Controller for NomCherry Café
 */

const db = require('../database/db');

exports.getAll = (req, res) => {
    try {
        const branches = db.query('SELECT * FROM cabang ORDER BY id_cabang ASC');
        return res.json({ success: true, data: branches });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

exports.update = (req, res) => {
    try {
        const { id } = req.params;
        const { nama_cabang, alamat, no_telp } = req.body;

        db.run(
            'UPDATE cabang SET nama_cabang = ?, alamat = ?, no_telp = ? WHERE id_cabang = ?',
            [nama_cabang, alamat, no_telp, id]
        );

        return res.json({ success: true, message: 'Data cabang berhasil diperbarui' });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

