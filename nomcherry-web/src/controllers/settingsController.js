/**
 * Settings Controller for NomCherry Café
 */

const db = require('../database/db');
const settingsService = require('../services/settingsService');
const { resolveAuthorizedBranch } = require('../services/authService');

function serverError(res, err, context) {
    console.error(`[settingsController] ${context}:`, err.message);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' });
}

exports.getSettings = (req, res) => {
    try {
        const resolved = resolveAuthorizedBranch(req, req.query && req.query.cabang);
        if (resolved.errorStatus) {
            return res.status(resolved.errorStatus).json({ success: false, message: resolved.errorMessage });
        }

        const globalSettings = settingsService.getAll();
        const branch = db.get('SELECT id_cabang, nama_cabang, alamat, no_telp FROM cabang WHERE id_cabang = ?', [resolved.branchId]) || null;
        const role = req.user ? req.user.peran : 'kasir';

        return res.json({
            success: true,
            data: {
                ...globalSettings,
                branch,
                permissions: {
                    can_edit_business: role === 'admin' || role === 'manager',
                    can_edit_branch: role === 'admin'
                }
            }
        });
    } catch (err) {
        return serverError(res, err, 'getSettings');
    }
};

exports.updateSettings = (req, res) => {
    try {
        const body = req.body || {};
        const { id_cabang, branch_name, branch_address, branch_phone, ...globalPayload } = body;

        const hasBranchFields = branch_name !== undefined || branch_address !== undefined || branch_phone !== undefined;
        if (hasBranchFields) {
            if (!req.user || req.user.peran !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Hanya Admin yang berwenang mengubah nama, alamat, atau telepon cabang'
                });
            }
            const targetBranchId = id_cabang || req.user.id_cabang || 'CBG001';
            const existingBranch = db.get('SELECT * FROM cabang WHERE id_cabang = ?', [targetBranchId]);
            if (!existingBranch) {
                return res.status(404).json({ success: false, message: 'Cabang tidak ditemukan' });
            }
            const nextName = branch_name !== undefined ? String(branch_name).trim() : existingBranch.nama_cabang;
            const nextAddr = branch_address !== undefined ? String(branch_address).trim() : existingBranch.alamat;
            const nextPhone = branch_phone !== undefined ? String(branch_phone).trim() : existingBranch.no_telp;
            if (!nextName || !nextAddr || !nextPhone) {
                return res.status(400).json({ success: false, message: 'Nama, alamat, dan telepon cabang tidak boleh kosong' });
            }
            db.run(
                'UPDATE cabang SET nama_cabang = ?, alamat = ?, no_telp = ? WHERE id_cabang = ?',
                [nextName, nextAddr, nextPhone, targetBranchId]
            );
        }

        const result = settingsService.update(globalPayload);
        if (result.error) {
            return res.status(400).json({ success: false, message: result.error });
        }

        const activeBranchId = id_cabang || (req.user && req.user.id_cabang) || 'CBG001';
        const branch = db.get('SELECT id_cabang, nama_cabang, alamat, no_telp FROM cabang WHERE id_cabang = ?', [activeBranchId]) || null;

        return res.json({
            success: true,
            message: 'Konfigurasi berhasil disimpan',
            data: {
                ...result.settings,
                branch
            }
        });
    } catch (err) {
        return serverError(res, err, 'updateSettings');
    }
};
