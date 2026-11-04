/**
 * Database Module for NomCherry Café
 * Utilizes Node.js native DatabaseSync (SQLite 3.53) for fast, zero-dependency, turnkey persistence.
 * Compatible with the PostgreSQL schema and seeds from db_kafe.sql.
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'nomcherry.db');
const db = new DatabaseSync(dbPath);

// Enable WAL mode and foreign keys for high performance and integrity
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

function initDatabase() {
    // 1. Cabang Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS cabang (
            id_cabang TEXT PRIMARY KEY,
            nama_cabang TEXT NOT NULL,
            alamat TEXT NOT NULL,
            no_telp TEXT NOT NULL,
            is_active INTEGER DEFAULT 1
        );
    `);

    // 2. Pengguna Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS pengguna (
            id_pengguna TEXT PRIMARY KEY,
            nama_pengguna TEXT NOT NULL,
            username TEXT UNIQUE NOT NULL,
            kata_sandi TEXT NOT NULL,
            peran TEXT NOT NULL CHECK(peran IN ('admin', 'kasir', 'manager', 'owner')),
            id_cabang TEXT,
            FOREIGN KEY (id_cabang) REFERENCES cabang(id_cabang)
        );
    `);

    // 3. Menu Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS menu (
            id_menu TEXT PRIMARY KEY,
            nama_menu TEXT NOT NULL,
            harga REAL NOT NULL,
            stok INTEGER DEFAULT 0,
            kategori TEXT NOT NULL CHECK(kategori IN ('Makanan', 'Minuman', 'Dessert', 'Snack')),
            deskripsi TEXT,
            gambar TEXT,
            id_cabang TEXT,
            is_available INTEGER DEFAULT 1,
            FOREIGN KEY (id_cabang) REFERENCES cabang(id_cabang)
        );
    `);

    // 4. Pesanan Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS pesanan (
            id_pesanan TEXT PRIMARY KEY,
            id_pengguna TEXT,
            id_cabang TEXT,
            nama_pelanggan TEXT DEFAULT 'Pelanggan Umum',
            nomor_meja TEXT DEFAULT 'Take Away',
            tanggal_pesanan TEXT NOT NULL,
            subtotal REAL NOT NULL,
            pajak REAL DEFAULT 0,
            diskon REAL DEFAULT 0,
            total REAL NOT NULL,
            status TEXT DEFAULT 'completed' CHECK(status IN ('completed', 'pending', 'dibatalkan')),
            catatan TEXT,
            FOREIGN KEY (id_pengguna) REFERENCES pengguna(id_pengguna),
            FOREIGN KEY (id_cabang) REFERENCES cabang(id_cabang)
        );
    `);

    // 5. Detail Pesanan Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS detail_pesanan (
            id_detail TEXT PRIMARY KEY,
            id_pesanan TEXT NOT NULL,
            id_menu TEXT NOT NULL,
            nama_menu TEXT NOT NULL,
            harga_satuan REAL NOT NULL,
            jumlah INTEGER NOT NULL,
            subtotal REAL NOT NULL,
            FOREIGN KEY (id_pesanan) REFERENCES pesanan(id_pesanan) ON DELETE CASCADE,
            FOREIGN KEY (id_menu) REFERENCES menu(id_menu)
        );
    `);

    // 6. Pembayaran Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS pembayaran (
            id_pembayaran TEXT PRIMARY KEY,
            id_pesanan TEXT NOT NULL,
            metode TEXT NOT NULL CHECK(metode IN ('Cash', 'QRIS', 'Debit', 'Transfer')),
            total_bayar REAL NOT NULL,
            nominal_diterima REAL NOT NULL,
            kembalian REAL DEFAULT 0,
            tanggal_bayar TEXT NOT NULL,
            referensi TEXT,
            FOREIGN KEY (id_pesanan) REFERENCES pesanan(id_pesanan) ON DELETE CASCADE
        );
    `);

    // 7. Struk Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS struk (
            id_struk TEXT PRIMARY KEY,
            id_pembayaran TEXT,
            id_pesanan TEXT NOT NULL,
            nomor_struk TEXT NOT NULL UNIQUE,
            tanggal_cetak TEXT NOT NULL,
            FOREIGN KEY (id_pesanan) REFERENCES pesanan(id_pesanan)
        );
    `);

    // 8. Stok Table & Mutasi
    db.exec(`
        CREATE TABLE IF NOT EXISTS stok (
            id_stok TEXT PRIMARY KEY,
            id_menu TEXT NOT NULL,
            id_cabang TEXT,
            id_pengguna TEXT,
            tanggal TEXT NOT NULL,
            jenis TEXT DEFAULT 'PENYESUAIAN' CHECK(jenis IN ('MASUK', 'KELUAR', 'PENYESUAIAN', 'PENJUALAN')),
            perubahan INTEGER NOT NULL,
            stok_sisa INTEGER NOT NULL,
            tanggal_kadaluarsa TEXT,
            keterangan TEXT,
            FOREIGN KEY (id_menu) REFERENCES menu(id_menu),
            FOREIGN KEY (id_cabang) REFERENCES cabang(id_cabang),
            FOREIGN KEY (id_pengguna) REFERENCES pengguna(id_pengguna)
        );
    `);

    // 9. Laporan Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS laporan (
            id_laporan TEXT PRIMARY KEY,
            id_cabang TEXT,
            periode TEXT NOT NULL,
            total_transaksi INTEGER DEFAULT 0,
            pendapatan REAL DEFAULT 0,
            dibuat_pada TEXT NOT NULL,
            FOREIGN KEY (id_cabang) REFERENCES cabang(id_cabang)
        );
    `);

    seedInitialData();
}

function seedInitialData() {
    // Check if cabang exists
    const checkCabang = db.prepare('SELECT COUNT(*) AS count FROM cabang').get();
    if (checkCabang.count === 0) {
        console.log('Seeding initial branches...');
        const insertCabang = db.prepare('INSERT INTO cabang (id_cabang, nama_cabang, alamat, no_telp, is_active) VALUES (?, ?, ?, ?, ?)');
        insertCabang.run('CBG001', 'NomCherry Pusat (Jemur)', 'Jl. Jemur Andayani No. 12, Wonocolo, Surabaya', '0812-3456-7890', 1);
        insertCabang.run('CBG002', 'NomCherry Cabang Timur (Rungkut)', 'Jl. Rungkut Madya No. 45, Rungkut, Surabaya', '0812-9876-5432', 1);
    }

    // Check if pengguna exists (from db_kafe.sql)
    const checkPengguna = db.prepare('SELECT COUNT(*) AS count FROM pengguna').get();
    if (checkPengguna.count === 0) {
        console.log('Seeding initial users from db_kafe.sql...');
        const insertUser = db.prepare('INSERT INTO pengguna (id_pengguna, nama_pengguna, username, kata_sandi, peran, id_cabang) VALUES (?, ?, ?, ?, ?, ?)');
        insertUser.run('USR001', 'Admin Utama', 'admin', 'admin123', 'admin', 'CBG001');
        insertUser.run('USR002', 'Daffa Danendra (Kasir Cabang 1)', 'daps', '135', 'kasir', 'CBG001');
        insertUser.run('USR003', 'Saman (Kasir Cabang 2)', 'kasir', '123', 'kasir', 'CBG002');
        insertUser.run('USR004', 'Hai Admin 2 (Admin Cabang 2)', 'admin2', '123', 'admin', 'CBG002');
        insertUser.run('USR005', 'Clarissa (Manager Operasional)', 'manager1', '123', 'manager', 'CBG001');
        insertUser.run('USR006', 'Dapp Owner (Pemilik)', 'owner1', '123', 'owner', 'CBG001');
    }

    // Check if menu exists (from db_kafe.sql)
    const checkMenu = db.prepare('SELECT COUNT(*) AS count FROM menu').get();
    if (checkMenu.count === 0) {
        console.log('Seeding initial menu from db_kafe.sql...');
        const insertMenu = db.prepare('INSERT INTO menu (id_menu, nama_menu, harga, stok, kategori, deskripsi, gambar, id_cabang, is_available) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        insertMenu.run('MNU001', 'Kopi Hitam Nusantara', 15000.0, 18, 'Minuman', 'Kopi hitam arabika robusta blend dengan aroma pekat dan rasa khas.', '☕', 'CBG001', 1);
        insertMenu.run('MNU002', 'Teh Manis Melati', 5000.0, 25, 'Minuman', 'Teh seduh wangi melati dengan pemanis gula tebu asli.', '🍵', 'CBG001', 1);
        insertMenu.run('MNU003', 'Matcha Latte Signature', 22000.0, 12, 'Minuman', 'Matcha Jepang premium dengan susu creamy dan foam halus.', '🧋', 'CBG001', 1);
        insertMenu.run('MNU004', 'Mie Goreng Spesial Kafe', 18000.0, 20, 'Makanan', 'Mie goreng gurih dengan telur, sosis, bakso, dan sayuran segar.', '🍜', 'CBG001', 1);
        insertMenu.run('MNU005', 'Es Teh Lemon Mint', 8000.0, 15, 'Minuman', 'Es teh segar dengan perasan lemon asli dan daun mint.', '🍹', 'CBG001', 1);
        insertMenu.run('MNU006', 'Cheese Cake Cherry', 25000.0, 14, 'Dessert', 'Kue keju lembut khas NomCherry dengan selai cherry manis asam.', '🍰', 'CBG001', 1);
        insertMenu.run('MNU007', 'French Fries Crispy', 15000.0, 22, 'Snack', 'Kentang goreng renyah disajikan dengan saus keju dan sambal.', '🍟', 'CBG001', 1);
        insertMenu.run('MNU008', 'Croissant Butter Warm', 20000.0, 10, 'Dessert', 'Pastry mentega renyah berlapis dengan aroma butter wangi.', '🥐', 'CBG001', 1);
    }

    // Check if initial orders exist
    const checkPesanan = db.prepare('SELECT COUNT(*) AS count FROM pesanan').get();
    if (checkPesanan.count === 0) {
        console.log('Seeding sample completed orders from db_kafe.sql...');
        const now = new Date();
        const formatDate = (daysAgo, hours, minutes) => {
            const d = new Date(now.getTime() - daysAgo * 86400000);
            d.setHours(hours, minutes, 0, 0);
            return d.toISOString();
        };

        const sampleOrders = [
            { id: 'PSN001', user: 'USR002', cabang: 'CBG001', customer: 'Budi Santoso', meja: 'Meja 01', date: formatDate(2, 10, 15), subtotal: 35000, tax: 3500, discount: 0, total: 38500, method: 'Cash', received: 50000, change: 11500, items: [{ id: 'MNU001', qty: 1, price: 15000 }, { id: 'MNU008', qty: 1, price: 20000 }] },
            { id: 'PSN002', user: 'USR002', cabang: 'CBG001', customer: 'Siti Rahma', meja: 'Meja 03', date: formatDate(1, 14, 30), subtotal: 40000, tax: 4000, discount: 0, total: 44000, method: 'QRIS', received: 44000, change: 0, items: [{ id: 'MNU004', qty: 1, price: 18000 }, { id: 'MNU003', qty: 1, price: 22000 }] },
            { id: 'PSN003', user: 'USR003', cabang: 'CBG002', customer: 'Ahmad Faisal', meja: 'Take Away', date: formatDate(1, 16, 45), subtotal: 33000, tax: 3300, discount: 0, total: 36300, method: 'Cash', received: 40000, change: 3700, items: [{ id: 'MNU006', qty: 1, price: 25000 }, { id: 'MNU005', qty: 1, price: 8000 }] },
            { id: 'PSN004', user: 'USR002', cabang: 'CBG001', customer: 'Dewi Lestari', meja: 'Meja 05', date: formatDate(0, 11, 20), subtotal: 55000, tax: 5500, discount: 5000, total: 55500, method: 'Transfer', received: 55500, change: 0, items: [{ id: 'MNU001', qty: 2, price: 15000 }, { id: 'MNU006', qty: 1, price: 25000 }] },
            { id: 'PSN005', user: 'USR003', cabang: 'CBG002', customer: 'Reza Pratama', meja: 'Meja 02', date: formatDate(0, 13, 10), subtotal: 23000, tax: 2300, discount: 0, total: 25300, method: 'Cash', received: 30000, change: 4700, items: [{ id: 'MNU004', qty: 1, price: 18000 }, { id: 'MNU002', qty: 1, price: 5000 }] },
            { id: 'PSN006', user: 'USR002', cabang: 'CBG001', customer: 'Nadia Putri', meja: 'Meja 07', date: formatDate(0, 15, 40), subtotal: 47000, tax: 4700, discount: 0, total: 51700, method: 'QRIS', received: 51700, change: 0, items: [{ id: 'MNU003', qty: 1, price: 22000 }, { id: 'MNU006', qty: 1, price: 25000 }] }
        ];

        const insertPsn = db.prepare(`
            INSERT INTO pesanan (id_pesanan, id_pengguna, id_cabang, nama_pelanggan, nomor_meja, tanggal_pesanan, subtotal, pajak, diskon, total, status, catatan)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', 'Order selesai')
        `);
        const insertDet = db.prepare(`
            INSERT INTO detail_pesanan (id_detail, id_pesanan, id_menu, nama_menu, harga_satuan, jumlah, subtotal)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const insertPmb = db.prepare(`
            INSERT INTO pembayaran (id_pembayaran, id_pesanan, metode, total_bayar, nominal_diterima, kembalian, tanggal_bayar, referensi)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const insertStr = db.prepare(`
            INSERT INTO struk (id_struk, id_pembayaran, id_pesanan, nomor_struk, tanggal_cetak)
            VALUES (?, ?, ?, ?, ?)
        `);

        sampleOrders.forEach((o, idx) => {
            insertPsn.run(o.id, o.user, o.cabang, o.customer, o.meja, o.date, o.subtotal, o.tax, o.discount, o.total);

            o.items.forEach((it, iIdx) => {
                const menuItem = db.prepare('SELECT nama_menu FROM menu WHERE id_menu = ?').get(it.id);
                const menuName = menuItem ? menuItem.nama_menu : 'Item Menu';
                const detId = `DET${String(idx * 10 + iIdx + 1).padStart(3, '0')}`;
                insertDet.run(detId, o.id, it.id, menuName, it.price, it.qty, it.price * it.qty);
            });

            const pmbId = `BYR${String(idx + 1).padStart(3, '0')}`;
            insertPmb.run(pmbId, o.id, o.method, o.total, o.received, o.change, o.date, o.method === 'QRIS' ? 'QRIS-' + o.id : '');

            const strId = `STR${String(idx + 1).padStart(3, '0')}`;
            const strNo = `NC-${o.date.slice(0, 10).replace(/-/g, '')}-${String(idx + 1).padStart(3, '0')}`;
            insertStr.run(strId, pmbId, o.id, strNo, o.date);
        });
    }

    // Check if initial stock history exists
    const checkStok = db.prepare('SELECT COUNT(*) AS count FROM stok').get();
    if (checkStok.count === 0) {
        console.log('Seeding initial stock logs...');
        const insertStk = db.prepare(`
            INSERT INTO stok (id_stok, id_menu, id_cabang, id_pengguna, tanggal, jenis, perubahan, stok_sisa, tanggal_kadaluarsa, keterangan)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const nowIso = new Date().toISOString();
        const expiryFuture = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
        const expiryNear = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

        insertStk.run('STK001', 'MNU001', 'CBG001', 'USR001', nowIso, 'MASUK', 20, 18, expiryFuture, 'Stok awal Kopi Arabika');
        insertStk.run('STK002', 'MNU006', 'CBG001', 'USR001', nowIso, 'MASUK', 15, 14, expiryNear, 'Stok kue keju fresh');
        insertStk.run('STK003', 'MNU004', 'CBG001', 'USR001', nowIso, 'MASUK', 25, 20, expiryFuture, 'Stok mie telur kering');
    }

    // Upgrade & Synchronize Rich Varied Menu Catalog with Authentic Photography
    upgradeMenuCatalog();
}

function upgradeMenuCatalog() {
    const VARIED_MENUS = [
        // 1. Minuman - Kopi (Coffee)
        {
            id: 'MNU001',
            nama: 'Kopi Hitam Nusantara',
            harga: 18000,
            stok: 25,
            kategori: 'Minuman',
            desc: 'Americano klasik blend robusta Dampit dan arabika Gayo dengan aroma cokelat nutty yang pekat.',
            gambar: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 'MNU002',
            nama: 'NomCherry Signature Cold Brew',
            harga: 28000,
            stok: 20,
            kategori: 'Minuman',
            desc: 'Kopi seduh dingin 18 jam dengan sentuhan sirup cherry murni, cold foam lembut dan aroma buah segar.',
            gambar: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 'MNU003',
            nama: 'Caramel Macchiato Velvet',
            harga: 26000,
            stok: 18,
            kategori: 'Minuman',
            desc: 'Double shot espresso dengan sirup vanilla Madagaskar, susu segar berbusa halus dan saus salted caramel leleh.',
            gambar: 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 'MNU004',
            nama: 'Spanish Latte Sweet Cream',
            harga: 25000,
            stok: 22,
            kategori: 'Minuman',
            desc: 'Paduan kaya espresso pekat dengan condensed milk creamy khas Spanyol dan taburan kayu manis.',
            gambar: 'https://images.unsplash.com/photo-1534778101976-62847782c213?auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 'MNU005',
            nama: 'Cappuccino Creamy Oat Milk',
            harga: 27000,
            stok: 15,
            kategori: 'Minuman',
            desc: 'Espresso robusta aromatik dipadukan dengan susu oat lembut bebas laktosa dan taburan bubuk cokelat Belgia.',
            gambar: 'https://images.unsplash.com/photo-1577968897966-3d4325b36b61?auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 'MNU006',
            nama: 'Affogato Al Caffe Vanilla',
            harga: 24000,
            stok: 16,
            kategori: 'Minuman',
            desc: 'Dua scoop gelato vanila artisan yang disiram espresso single origin panas yang kaya crema.',
            gambar: 'https://images.unsplash.com/photo-1592663527359-cf6642f54cff?auto=format&fit=crop&w=600&q=80'
        },

        // 2. Minuman - Non Kopi & Teh (Non-Coffee & Artisan Tea)
        {
            id: 'MNU007',
            nama: 'Artisan Uji Matcha Latte',
            harga: 26000,
            stok: 20,
            kategori: 'Minuman',
            desc: 'Matcha grade seremonial asli Uji, Kyoto yang di-whisk dengan susu segar dingin dan aroma umami khas.',
            gambar: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 'MNU008',
            nama: 'NomCherry Berry Sparkler',
            harga: 22000,
            stok: 25,
            kategori: 'Minuman',
            desc: 'Minuman soda mocktail menyegarkan dengan puree cherry segar, buah berry merah, lemon dan daun mint dingin.',
            gambar: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 'MNU009',
            nama: 'Taro Velvet Frappe',
            harga: 24000,
            stok: 17,
            kategori: 'Minuman',
            desc: 'Minuman taro ungu pekat yang di-blend dengan es krim vanila, keju mascarpone foam dan remah biskuit.',
            gambar: 'https://images.unsplash.com/photo-1577805947697-89e18249d767?auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 'MNU010',
            nama: 'Earl Grey Milk Tea with Boba',
            harga: 23000,
            stok: 24,
            kategori: 'Minuman',
            desc: 'Teh hitam bergamot aromatik diseduh dengan susu segar dan topping boba tapioka gula aren kenyal.',
            gambar: 'https://images.unsplash.com/photo-1558857563-b37cf5a5b5dc?auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 'MNU011',
            nama: 'Belgian Dark Chocolate Hazelnut',
            harga: 25000,
            stok: 19,
            kategori: 'Minuman',
            desc: 'Cokelat hitam Belgia 70% cair kental dengan pasta hazelnut panggang dan taburan sea salt flakes.',
            gambar: 'https://images.unsplash.com/photo-1542990253-0d0f5be5f0ed?auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 'MNU012',
            nama: 'Teh Manis Melati Heritage',
            harga: 8000,
            stok: 40,
            kategori: 'Minuman',
            desc: 'Teh seduh daun melati tradisional khas Jawa Timur dengan gula tebu murni, disajikan dingin atau panas.',
            gambar: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 'MNU013',
            nama: 'Es Teh Lemon Mint Fresh',
            harga: 12000,
            stok: 30,
            kategori: 'Minuman',
            desc: 'Es teh melati segar dengan perasan jeruk lemon asli, madu hutan alami dan remasan daun mint segar.',
            gambar: 'https://images.unsplash.com/photo-1556881286-fc6915169721?auto=format&fit=crop&w=600&q=80'
        },

        // 3. Makanan Utama (Main Courses)
        {
            id: 'MNU014',
            nama: 'Spaghetti Aglio Olio Smoked Beef',
            harga: 34000,
            stok: 18,
            kategori: 'Makanan',
            desc: 'Pasta spaghetti al dente ditumis dengan extra virgin olive oil, bawang putih cincang, chili flakes, dan irisan daging asap gurih.',
            gambar: 'https://images.unsplash.com/photo-1621996346565-e3d5d628178d?auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 'MNU015',
            nama: 'Japanese Chicken Katsu Curry',
            harga: 38000,
            stok: 15,
            kategori: 'Makanan',
            desc: 'Fillet dada ayam goreng tepung roti super renyah disajikan dengan saus kari Jepang kental harum, wortel, kentang dan nasi hangat.',
            gambar: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 'MNU016',
            nama: 'NomCherry Beef Truffle Burger',
            harga: 42000,
            stok: 12,
            kategori: 'Makanan',
            desc: 'Patty daging sapi panggang juicy 150g dengan lelehan keju cheddar merah, saus truffle aioli, dan caramelized onion dalam brioche bun lembut.',
            gambar: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 'MNU017',
            nama: 'Chicken Teriyaki Rice Bowl',
            harga: 32000,
            stok: 20,
            kategori: 'Makanan',
            desc: 'Potongan ayam panggang saus teriyaki manis gurih disajikan di atas mangkuk nasi Jepang dengan tamagoyaki dan taburan biji wijen sangrai.',
            gambar: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 'MNU018',
            nama: 'Mie Goreng Spesial Kafe',
            harga: 24000,
            stok: 25,
            kategori: 'Makanan',
            desc: 'Mie telur kenyal dimasak bumbu rempah gurih khas kafe dengan suwiran ayam, bakso sapi, sosis, telur mata sapi dan kerupuk renyah.',
            gambar: 'https://images.unsplash.com/photo-1612927601601-6638404737ce?auto=format&fit=crop&w=600&q=80'
        },

        // 4. Snack
        {
            id: 'MNU019',
            nama: 'Truffle Parmesan French Fries',
            harga: 22000,
            stok: 25,
            kategori: 'Snack',
            desc: 'Kentang goreng impor potong tebal digoreng emas renyah, dibalur minyak truffle wangi dan parutan keju parmesan melimpah.',
            gambar: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 'MNU020',
            nama: 'Golden Crispy Chicken Popcorn',
            harga: 25000,
            stok: 20,
            kategori: 'Snack',
            desc: 'Bite-sized daging ayam renyah berbumbu garlic pepper gurih, disajikan dengan saus spicy mayo creamy buatan kafe.',
            gambar: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=600&q=80'
        },

        // 5. Dessert
        {
            id: 'MNU021',
            nama: 'NomCherry Basque Burnt Cheesecake',
            harga: 32000,
            stok: 14,
            kategori: 'Dessert',
            desc: 'Cheesecake panggang khas Basque yang karamel gosong di luar dengan lelehan krim keju lembut di dalam serta compote buah cherry asam manis.',
            gambar: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 'MNU022',
            nama: 'Butter Croissant with Berry Compote',
            harga: 26000,
            stok: 16,
            kategori: 'Dessert',
            desc: 'Pastry mentega Prancis dengan puluhan lapisan renyah garing beraroma butter kaya, disajikan hangat dengan selai buah berry.',
            gambar: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 'MNU023',
            nama: 'Japanese Fluffy Souffle Pancake',
            harga: 30000,
            stok: 12,
            kategori: 'Dessert',
            desc: 'Dua susun pancake Jepang super empuk dan bergoyang lembut seperti awan, disajikan dengan sirup maple murni dan salted butter.',
            gambar: 'https://images.unsplash.com/photo-1528207776546-365bb710ee93?auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 'MNU024',
            nama: 'Classic Belgian Waffle with Ice Cream',
            harga: 28000,
            stok: 15,
            kategori: 'Dessert',
            desc: 'Wafel Belgia garing di luar dan lembut di dalam dengan taburan pearl sugar, disajikan dengan satu scoop es krim vanila dan saus cokelat.',
            gambar: 'https://images.unsplash.com/photo-1562376552-0d160a2f238d?auto=format&fit=crop&w=600&q=80'
        }
    ];

    const checkStmt = db.prepare('SELECT id_menu FROM menu WHERE id_menu = ?');
    const updateStmt = db.prepare(`
        UPDATE menu
        SET nama_menu = ?, harga = ?, kategori = ?, deskripsi = ?, gambar = ?, id_cabang = 'CBG001', is_available = 1
        WHERE id_menu = ?
    `);
    const insertStmt = db.prepare(`
        INSERT INTO menu (id_menu, nama_menu, harga, stok, kategori, deskripsi, gambar, id_cabang, is_available)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'CBG001', 1)
    `);

    for (const item of VARIED_MENUS) {
        const existing = checkStmt.get(item.id);
        if (existing) {
            updateStmt.run(item.nama, item.harga, item.kategori, item.desc, item.gambar, item.id);
        } else {
            insertStmt.run(item.id, item.nama, item.harga, item.stok, item.kategori, item.desc, item.gambar);
        }
    }
}

// Initialize on module load
initDatabase();

module.exports = {
    db,
    query(sql, params = []) {
        return db.prepare(sql).all(...params);
    },
    get(sql, params = []) {
        return db.prepare(sql).get(...params);
    },
    run(sql, params = []) {
        return db.prepare(sql).run(...params);
    },
    exec(sql) {
        return db.exec(sql);
    }
};

