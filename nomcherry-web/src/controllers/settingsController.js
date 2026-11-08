/**
 * Settings Controller for NomCherry Café
 */

const settingsService = require('../services/settingsService');

function serverError(res, err, context) {
    console.error(`[settingsController] ${context}:`, err.message);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' });
}

exports.getSettings = (req, res) => {
    try {
        return res.json({ success: true, data: settingsService.getAll() });
    } catch (err) {
        return serverError(res, err, 'getSettings');
    }
};

exports.updateSettings = (req, res) => {
    try {
        const result = settingsService.update(req.body || {});
        if (result.error) {
            return res.status(400).json({ success: false, message: result.error });
        }
        return res.json({ success: true, message: 'Konfigurasi berhasil disimpan', data: result.settings });
    } catch (err) {
        return serverError(res, err, 'updateSettings');
    }
};
