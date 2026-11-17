/**
 * Application settings service.
 * Global settings live in app_settings; per-branch address & phone live in cabang.
 */

const db = require('../database/db');

const SETTING_KEYS = [
    'cafe_name',
    'cafe_address',
    'cafe_phone',
    'tax_rate',
    'receipt_footer',
    'low_stock_threshold'
];
const MAX_STRING_LENGTH = 250;

function getAll() {
    const rows = db.query('SELECT key, value FROM app_settings');
    const settings = {};
    rows.forEach(row => {
        settings[row.key] = row.value;
    });
    return settings;
}

function getTaxRate() {
    const row = db.get("SELECT value FROM app_settings WHERE key = 'tax_rate'");
    const rate = row ? Number(row.value) : 10;
    return Number.isFinite(rate) && rate >= 0 && rate <= 25 ? rate : 10;
}

function getReceiptIdentity(branchId) {
    const settings = getAll();
    const branch = db.get('SELECT * FROM cabang WHERE id_cabang = ?', [branchId || 'CBG001']) || {
        id_cabang: branchId || 'CBG001',
        nama_cabang: 'NomCherry Café',
        alamat: settings.cafe_address || 'Jl. Jemur Andayani No. 12, Surabaya',
        no_telp: settings.cafe_phone || '0812-3456-7890'
    };

    return {
        cafe_name: settings.cafe_name || 'NomCherry Café & Roastery',
        receipt_footer: settings.receipt_footer || 'Terima kasih telah menikmati kopi & hidangan NomCherry!',
        tax_rate: getTaxRate(),
        id_cabang: branch.id_cabang,
        nama_cabang: branch.nama_cabang,
        alamat_cabang: branch.alamat,
        no_telp_cabang: branch.no_telp
    };
}

function validate(settings) {
    const validated = {};

    for (const [key, value] of Object.entries(settings)) {
        if (!SETTING_KEYS.includes(key)) {
            return { error: `Pengaturan tidak dikenal: ${key}` };
        }

        if (key === 'tax_rate') {
            const rate = Number(value);
            if (!Number.isFinite(rate) || rate < 0 || rate > 25) {
                return { error: 'Tarif pajak harus berupa angka antara 0 dan 25' };
            }
            validated[key] = String(rate);
            continue;
        }

        if (key === 'low_stock_threshold') {
            const minVal = Number(value);
            if (!Number.isInteger(minVal) || minVal < 0 || minVal > 1000) {
                return { error: 'Batas minimum stok default harus berupa angka bulat 0–1000' };
            }
            validated[key] = String(minVal);
            continue;
        }

        const text = String(value === null || value === undefined ? '' : value).trim();
        if (text.length > MAX_STRING_LENGTH) {
            return { error: `Nilai ${key} terlalu panjang` };
        }
        validated[key] = text;
    }

    return { validated };
}

function update(settings) {
    const { error, validated } = validate(settings || {});
    if (error) {
        return { error };
    }

    db.transaction(() => {
        const statement = db.db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)');
        for (const [key, value] of Object.entries(validated)) {
            statement.run(key, value);
        }
    });

    return { settings: getAll() };
}

module.exports = {
    SETTING_KEYS,
    getAll,
    getTaxRate,
    getReceiptIdentity,
    update
};
