/**
 * SQLite Backup & Rollback Utility for NomCherry Café
 * Usage:
 *   node src/scripts/db-backup.js backup [custom-backup-path]
 *   node src/scripts/db-backup.js rollback <backup-file-path>
 */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const defaultDbPath = process.env.NOMCHERRY_DB || path.join(__dirname, '../database/nomcherry.db');
const backupRoot = path.join(__dirname, '../../../backups');

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function createBackup(targetDbPath = defaultDbPath, explicitOutPath = null) {
    if (!fs.existsSync(targetDbPath)) {
        throw new Error(`File database tidak ditemukan: ${targetDbPath}`);
    }

    ensureDir(backupRoot);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outPath = explicitOutPath
        ? path.resolve(explicitOutPath)
        : path.join(backupRoot, `nomcherry-backup-${stamp}.db`);

    ensureDir(path.dirname(outPath));
    if (fs.existsSync(outPath)) {
        fs.unlinkSync(outPath);
    }

    const srcDb = new DatabaseSync(targetDbPath);
    try {
        const escaped = outPath.replace(/'/g, "''");
        srcDb.exec(`VACUUM INTO '${escaped}'`);
    } finally {
        srcDb.close();
    }

    return outPath;
}

function rollbackDatabase(backupFilePath, targetDbPath = defaultDbPath) {
    const resolvedBackup = path.resolve(backupFilePath);
    if (!fs.existsSync(resolvedBackup)) {
        throw new Error(`File backup tidak ditemukan: ${resolvedBackup}`);
    }

    // Verify backup integrity before overwriting target
    const checkDb = new DatabaseSync(resolvedBackup);
    try {
        const row = checkDb.prepare('PRAGMA integrity_check').get();
        if (!row || row.integrity_check !== 'ok') {
            throw new Error(`Integritas file backup gagal: ${JSON.stringify(row)}`);
        }
    } finally {
        checkDb.close();
    }

    ensureDir(path.dirname(targetDbPath));
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
        const candidate = `${targetDbPath}${suffix}`;
        if (fs.existsSync(candidate)) {
            fs.unlinkSync(candidate);
        }
    }

    fs.copyFileSync(resolvedBackup, targetDbPath);
    return targetDbPath;
}

if (require.main === module) {
    const [, , action, arg] = process.argv;
    try {
        if (action === 'backup') {
            const saved = createBackup(defaultDbPath, arg || null);
            console.log(`Backup database berhasil dibuat: ${saved}`);
        } else if (action === 'rollback') {
            if (!arg) {
                console.error('Gunakan: node src/scripts/db-backup.js rollback <path-file-backup>');
                process.exit(1);
            }
            const restored = rollbackDatabase(arg, defaultDbPath);
            console.log(`Database berhasil dipulihkan ke: ${restored}`);
        } else {
            console.log('Perintah tersedia: backup [output] | rollback <backup-file>');
            process.exit(1);
        }
    } catch (err) {
        console.error(`[db-backup] Gagal: ${err.message}`);
        process.exit(1);
    }
}

module.exports = {
    createBackup,
    rollbackDatabase
};
