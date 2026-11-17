/**
 * CLI Production Admin Bootstrap for NomCherry Café
 * Safely creates the initial admin user without storing or logging plaintext secrets.
 *
 * Usage:
 *   BOOTSTRAP_ADMIN_USERNAME=admin BOOTSTRAP_ADMIN_PASSWORD=<min-8-chars> node src/scripts/bootstrap-admin.js
 */

require('../config/env');
const db = require('../database/db');
const passwordService = require('../services/passwordService');

function run() {
    const existingCount = db.get('SELECT COUNT(*) AS count FROM pengguna').count;
    if (existingCount > 0) {
        console.log('[bootstrap:admin] Tabel pengguna sudah memiliki akun. Gunakan menu Pengaturan atau endpoint reset password admin.');
        return;
    }

    const username = (process.env.BOOTSTRAP_ADMIN_USERNAME || process.argv[2] || '').trim();
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';
    const displayName = (process.env.BOOTSTRAP_ADMIN_NAME || 'Administrator Utama').trim();
    const branchId = (process.env.BOOTSTRAP_ADMIN_BRANCH || 'CBG001').trim();

    if (!username || !password) {
        console.error('Gunakan environment BOOTSTRAP_ADMIN_USERNAME dan BOOTSTRAP_ADMIN_PASSWORD (minimal 8 karakter).');
        process.exit(1);
    }

    if (password.length < 8) {
        console.error('Kata sandi bootstrap harus minimal 8 karakter.');
        process.exit(1);
    }

    const branch = db.get('SELECT id_cabang FROM cabang WHERE id_cabang = ?', [branchId]);
    if (!branch) {
        console.error(`Cabang ${branchId} tidak ditemukan.`);
        process.exit(1);
    }

    db.run(
        `INSERT INTO pengguna (id_pengguna, nama_pengguna, username, kata_sandi, peran, id_cabang, must_change_password)
         VALUES ('USR001', ?, ?, ?, 'admin', ?, 1)`,
        [displayName, username, passwordService.hashPassword(password), branchId]
    );

    console.log(`[bootstrap:admin] Akun admin '${username}' berhasil dibuat untuk cabang ${branchId}.`);
}

if (require.main === module) {
    run();
}

module.exports = { run };
