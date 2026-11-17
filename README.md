# NomCherry Café — Sistem POS, Inventori Multi-Cabang & Analitik Web

[![Node.js](https://img.shields.io/badge/Node.js-v22.5%2B%20%7C%20v26-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Framework-Express%20v5-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Database](https://img.shields.io/badge/Database-SQLite%20(node%3Asqlite)-003B57?logo=sqlite&logoColor=white)](https://nodejs.org/api/sqlite.html)

**NomCherry Café** adalah aplikasi web *Point of Sale* (POS), manajemen inventori stok per cabang, antrean dapur barista, dan pelaporan keuangan untuk operasional kafe multi-cabang.

---

## Sumber Kode Utama (Canonical Repository)

Satu-satunya sumber kode aktif yang berada di bawah kontrol versi Git adalah:

- **Direktori Aplikasi Web Aktif**: `ProjekCafePBO/nomcherry-web`
- **Repository Git**: `ProjekCafePBO/`
- **Kompatibilitas Workspace Root**: Direktori `ProjectCafe/nomcherry-web` diarahkan melalui *NTFS Directory Junction* ke `ProjekCafePBO/nomcherry-web` agar seluruh launcher (`ProjectCafe/start-web.bat` dan `ProjekCafePBO/start-web.bat`) selalu menjalankan kode yang sama.
- **Arsip Kode Lama**:
  - `ProjekCafePBO/archive/legacy-java-swing/` — aplikasi desktop Java Swing lama (diarsipkan, bukan bagian runtime aktif).
  - `ProjekCafePBO/archive/legacy-frontend-js/` — modul JS frontend generasi awal yang sudah tidak dimuat oleh halaman aktif.

---

## Fitur Operasional Utama

### 1. Kasir Point of Sale (POS) & Checkout Idempotent
- Mendukung tiga jenis pesanan: **Dine-In** (wajib nomor meja), **Takeaway** (tanpa meja), dan **Delivery** (dengan catatan/alamat pengiriman).
- Mendukung tiga metode pencatatan pembayaran kasir:
  - **QRIS**: konfirmasi pemeriksaan bukti bayar oleh kasir (tanpa perhitungan kembalian tunai; tidak terhubung otomatis ke payment gateway eksternal).
  - **Tunai (Cash)**: validasi uang diterima dan perhitungan kembalian otomatis.
  - **Kartu EDC (Debit)**: pencatatan pembayaran pas beserta nomor referensi/approval opsional.
- **Idempotency Server-Side**: setiap checkout dilindungi header `Idempotency-Key` dan tabel `order_idempotency` di dalam transaksi `BEGIN IMMEDIATE`, mencegah pesanan/pembayaran/pemotongan stok ganda saat jaringan melambat atau klik berulang.
- **Adaptasi Mobile & Tablet**: dilengkapi bilah ringkasan keranjang bawah (`#mobile-cart-bar`) dan *bottom sheet* keranjang interaktif pada layar `< 1024px`.

### 2. Multi-Cabang & Kontrol Akses Berbasis Peran (RBAC)
- Mendukung peran **Admin**, **Manager**, **Owner**, dan **Kasir**.
- Pemilih cabang aktif (`#branch-selector`) mengisolasi stok, pesanan, antrean dapur, dan laporan untuk `CBG001` (Surabaya Pusat) maupun `CBG002` (Surabaya Timur).
- Kasir dikunci secara ketat ke cabang tugasnya baik di antarmuka maupun di seluruh endpoint API (`403 Forbidden` bila mengakses cabang lain).
- Pengaturan dipisahkan sesuai wewenang: semua peran dapat mengatur preferensi tampilan/ukuran kertas lokal dan mengganti kata sandi sendiri; konfigurasi bisnis global khusus `Admin`/`Manager`; identitas nama/alamat/telepon cabang khusus `Admin`.

### 3. Inventori Multi-Cabang & Kebijakan Kedaluwarsa
- Stok disimpan terpisah per cabang pada tabel `stok_cabang` dengan buku besar audit mutasi pada tabel `stok` (`MASUK`, `PENJUALAN`, `OPNAME`, `PENYESUAIAN`, `RUSAK`, `KADALUARSA`, `KELUAR`).
- Pembuatan menu baru mengalokasikan stok awal hanya ke cabang target (cabang lain dimulai dari `0` porsi tanpa duplikasi).
- **Kebijakan Tanggal Kedaluwarsa (WIB / UTC+7)**:
  - Sistem menyimpan **satu tanggal kedaluwarsa aktif per item menu per cabang** (bukan multi-batch FEFO per lot).
  - `tanggal_kadaluarsa < tanggal_operasional_hari_ini` berstatus **Kedaluwarsa** dan diblokir otomatis dari penjualan POS (UI & API `400`).
  - `tanggal_kadaluarsa == tanggal_operasional_hari_ini` (H-0) masih berlaku hingga akhir hari operasional dengan peringatan *Near-Expiry*.
- Tersedia endpoint audit rekonsiliasi stok baca-saja (`GET /api/stock/reconciliation`) untuk membandingkan `stok_cabang` terhadap akumulasi buku besar `stok`.

### 4. Laporan Keuangan, Pajak Historis & Snapshot Struk
- Seluruh agregasi dashboard (`GET /api/reports/dashboard`), daftar pesanan (`GET /api/orders`), dan laporan analitik (`GET /api/reports/analytics`) dihitung menggunakan SQL server-side atas **seluruh dataset** tanpa batas pemotongan 500 baris, dipisahkan dari paginasi tabel riwayat pesanan.
- Tarif dan nominal pajak disimpan per transaksi (`pesanan.pajak`, `pesanan.tarif_pajak`), sehingga perubahan tarif pajak di Pengaturan hanya berlaku untuk pesanan baru dan tidak pernah mengubah laporan historis.
- Identitas kafe, nama/alamat/telepon cabang, kasir, dan footer struk disimpan sebagai **snapshot** pada tabel `struk` saat transaksi selesai; cetak ulang struk historis maupun perubahan input form pengaturan yang belum disimpan tidak akan memengaruhi isi struk.

### 5. Sinkronisasi Multi-Terminal
- Menggunakan mekanisme *polling* terkendali setiap 10 detik saat tab aktif (tanpa koneksi tumpang tindih), dilengkapi indikator status koneksi & waktu sinkronisasi nyata pada header.
- Modul **Member Loyalitas** ditandai secara eksplisit sebagai **Belum Aktif** hingga aturan poin/tier ditetapkan; kasir dapat menggunakan fitur **Potongan Promo Manual** pada POS.

---

## Panduan Menjalankan Aplikasi

### Prasyarat
- **Node.js** `>= 22.5.0` (menggunakan modul bawaan `node:sqlite`)
- Google Chrome / Microsoft Edge (diperlukan hanya saat menjalankan pengujian E2E Playwright)

### 1. Mode Produksi / Operasional Standar (Tanpa Data Demo Otomatis)
Secara default (`SEED_DEMO_DATA` tidak diaktifkan), aplikasi **tidak** membuat akun demo berpassword bawaan pada database kosong.

```bash
cd ProjekCafePBO/nomcherry-web
npm install

# Salin .env.example ke .env lalu atur SESSION_SECRET serta kredensial admin awal:
# BOOTSTRAP_ADMIN_USERNAME=admin_kafe
# BOOTSTRAP_ADMIN_PASSWORD=PasswordKuatMinimal8Karakter
npm run bootstrap:admin

# Jalankan server
npm start
```

### 2. Mode Demo / Evaluasi Lokal (Eksplisit)
Untuk mengisi 24 menu contoh, akun demo pengujian, dan sampel transaksi secara eksplisit:

```bash
cd ProjekCafePBO/nomcherry-web
npm run start:demo
```
Atau melalui launcher Windows:
```bat
start-web.bat --demo
```

Akun yang hanya tersedia saat `SEED_DEMO_DATA=true`:
| Peran | Username | Password | Cabang Tugas |
| :--- | :--- | :--- | :--- |
| Admin | `admin` | `admin123` | `CBG001` (Akses Semua Cabang) |
| Kasir Cabang 1 | `daps` | `135` | `CBG001` |
| Kasir Cabang 2 | `kasir` | `123` | `CBG002` |
| Manager | `manager1` | `123` | `CBG001` (Akses Semua Cabang) |
| Owner | `owner1` | `123` | `CBG001` (Akses Semua Cabang) |

---

## Backup & Rollback Database SQLite

Sebelum pemeliharaan atau pembaruan skema, buat cadangan konsisten menggunakan `VACUUM INTO`:

```bash
cd ProjekCafePBO/nomcherry-web

# Membuat snapshot backup ke ProjekCafePBO/backups/
npm run db:backup

# Memulihkan database dari file backup terverifikasi
npm run db:rollback -- ../../backups/<nama-file-backup>.db
```

---

## Pengujian Otomatis

Seluruh pengujian membuat database sementara di direktori `TEMP` sistem operasi dan **tidak pernah mengubah** database operasional `src/database/nomcherry.db`.

```bash
cd ProjekCafePBO/nomcherry-web

# Unit, fitur, keamanan HTTP, idempotensi, >500 baris agregasi, zona waktu WIB, RBAC & backup
npm test

# Pengujian browser end-to-end (Playwright + Headless Chrome, desktop & mobile 320px–1440px)
npm run test:e2e

# Menjalankan seluruh suite pengujian
npm run test:all
```

---

## Variabel Lingkungan (`.env`)

| Variabel | Default | Keterangan |
| :--- | :--- | :--- |
| `PORT` | `3000` | Port HTTP server |
| `HOST` | `127.0.0.1` | Alamat bind (`0.0.0.0` jika perlu diakses di jaringan lokal) |
| `NODE_ENV` | `development` | Gunakan `production` di lingkungan produksi (mengaktifkan cookie `Secure`) |
| `SESSION_SECRET` | *(acak sementara)* | Kunci HMAC sesi; wajib diisi nilai tetap yang kuat di produksi |
| `NOMCHERRY_DB` | `./src/database/nomcherry.db` | Lokasi file database SQLite |
| `APP_TZ_OFFSET_MINUTES` | `420` | Offset zona waktu bisnis dalam menit (`420` = WIB / UTC+7) |
| `SEED_DEMO_DATA` | `false` | Set `true` hanya untuk lingkungan demo/pengujian lokal |
| `BOOTSTRAP_ADMIN_USERNAME` | *(kosong)* | Username admin awal saat inisialisasi database kosong |
| `BOOTSTRAP_ADMIN_PASSWORD` | *(kosong)* | Kata sandi admin awal (minimal 8 karakter, disimpan dengan hash `scrypt`) |
| `LOG_REQUESTS` | `true` | Set `false` untuk menonaktifkan log request JSON |
