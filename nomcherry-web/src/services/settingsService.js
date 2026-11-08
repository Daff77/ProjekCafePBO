/**
 * Application settings service.
 * Values are stored in app_settings and used by receipts and tax calculation.
 */

const db = require('../database/db');

const SETTING_KEYS = ['cafe_name', 'cafe_address', 'cafe_phone', 'tax_rate', 'receipt_footer'];
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
    update
};
