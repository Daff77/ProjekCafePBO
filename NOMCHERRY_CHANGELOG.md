# NOMCHERRY CHANGELOG

Dokumen ini merangkum seluruh perubahan aktual yang telah diimplementasikan pada proses **Deep Audit** dan **Remediation** proyek NomCherry Café.

- **Aplikasi aktif:** `nomcherry-web/` (implementasi Cofra di root project)
- **Tanggal pembaruan:** 8 November 2026
- **Status:** hasil implementasi aktual, bukan rencana
- **Catatan:** tidak ada commit, rewrite Git history, atau operasi destruktif yang dilakukan

---

## 1. Ringkasan

Remediation berfokus pada empat area:

1. **Keamanan:** autentikasi server-side, RBAC, hashing password, sesi yang dapat dicabut, CSP, dan hardening API.
2. **Integritas data:** checkout transaksional, validasi stok/kuantitas, migrasi katalog yang tidak menimpa data, dan audit log stok.
3. **Eliminasi prototipe:** inventori, laporan/analitik, pengaturan, restock massal, dan status dapur sekarang memakai data/API nyata.
4. **Operasional & pengujian:** logging terstruktur, health check, timezone policy, E2E browser, dan isolasi database pengujian.

Modul **member loyalty** sengaja tidak diisi dengan data atau aturan rekaan. Modul tersebut sekarang menampilkan empty state yang jujur dan menunggu keputusan aturan bisnis.

---

## 2. Security Improvements

### 2.1 Autentikasi dan otorisasi

- Seluruh endpoint API (kecuali login, logout, dan health) dilindungi middleware autentikasi.
- RBAC diterapkan di server, bukan hanya di UI:
  - `admin`: akses penuh.
  - `manager`: menu, stok, laporan, pengaturan.
  - `owner`: dashboard, laporan, monitoring.
  - `kasir`: POS, checkout, riwayat pesanan cabang sendiri.
- Halaman aplikasi (`/app`, `/pos`, `/dashboard`, `/index.html`) diarahkan ke login bila belum memiliki sesi.
- Akses langsung ke `/index.html` tanpa login tidak lagi mungkin.

### 2.2 Password

- Password disimpan menggunakan **scrypt** dengan salt acak.
- Password plaintext lama dimigrasikan otomatis saat startup.
- Login juga memiliki jalur rehash opportunistik untuk baris plaintext yang belum termigrasi.
- Password tidak lagi ditampilkan pada banner startup.

### 2.3 Sesi

- Sesi disimpan di tabel `sessions` (database-backed).
- Token sesi ditandatangani HMAC dan dikirim melalui cookie `HttpOnly`, `SameSite=Strict`, serta `Secure` pada `NODE_ENV=production`.
- Logout mencabut sesi di server, bukan hanya menghapus cookie.
- Sesi kedaluwarsa dan dibersihkan otomatis.
- Percobaan login dibatasi (rate limit) dengan `Retry-After` dan pembersihan berkala.

### 2.4 Content Security Policy

- Inline JavaScript diekstrak ke:
  - `public/js/index-app.js`
  - `public/js/login.js`
- Inline event handler (`onerror`) dihapus dan diganti listener eksternal.
- CSP sekarang menggunakan `script-src 'self'` tanpa `unsafe-inline`.
- `style-src 'unsafe-inline'` masih dipertahankan karena UI masih memakai atribut `style` inline.

### 2.5 Hardening lainnya

- Security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP.
- Server default bind ke `127.0.0.1`; dapat diubah melalui `HOST`.
- Error 500 dikembalikan generik; detail hanya dicatat di server.
- Escaping output untuk data menu, pesanan, pelanggan, struk, dan atribut HTML pada UI aktif.
- CSV export diamankan dari formula injection dan quoting yang salah.
- Kredensial database Java dipindahkan ke environment variable.
- Password plaintext pada SQL dump legacy di-redact.
- `.gitignore` diperbarui untuk `*.db` dan `*.class`.

---

## 3. Fitur yang Diperbaiki

| Fitur | Sebelumnya | Sekarang |
|---|---|---|
| Inventori | Data persentase hardcoded | Data nyata dari `/api/stock`; menampilkan stok, kategori, cabang, tanggal kadaluarsa, status, dan empty state |
| Restock item | Hanya mengubah state lokal | Memanggil `/api/stock/adjust` dan memperbarui database |
| Restock All | Ilusi UI | Memanggil `/api/stock/restock-all` secara transaksional (+10 per menu) |
| Laporan & analitik | Grafik/heatmap hardcoded | Data nyata dari `/api/reports/analytics`: tren bulanan, kategori, heatmap, top items, ringkasan |
| Pengaturan | Toast tanpa penyimpanan | Tersimpan di `app_settings`; dimuat ulang saat boot; tarif pajak dipakai backend dan frontend |
| Status dapur “Sajikan” | Hanya state lokal | Kolom `status_dapur` + `PATCH /api/orders/:id/status`; persisten dan dibatasi cabang |
| Riwayat pesanan | Data mock | Diambil dari `/api/orders` dan diperbarui setelah checkout |
| Menu CRUD | ID lokal/divergen dan kegagalan senyap | ID dari server, respons divalidasi, stok tercatat di audit log, dan sinkronisasi ulang |
| Checkout | Sukses palsu saat API gagal | Transaksional, gagal dengan pesan jelas, dan struk memakai total dari server |
| Login Kasir Cabang 2 | Gagal karena cabang di-hardcode | Cabang ditentukan dari user atau pilihan yang valid |
| Role navigation | Semua menu terlihat | Menu disembunyikan sesuai peran; server tetap menjadi penentu akhir |

---

## 4. Bug Fixes

- **Metode pembayaran `Card`** dinormalisasi menjadi `Debit`, sesuai constraint database.
- **Kuantitas negatif/nol** ditolak; kuantitas harus bilangan bulat positif.
- **Checkout tidak lagi parsial**: order, detail, stok, pembayaran, dan struk berada dalam satu transaksi.
- **Stok tidak bisa oversell**: update stok memakai guard `stok >= jumlah`.
- **Seeder tidak lagi menimpa katalog** pada setiap startup; update hanya terjadi pada database baru.
- **Hapus menu** tidak lagi gagal karena foreign key; menu yang memiliki riwayat dinonaktifkan.
- **Edit stok melalui menu** sekarang membuat log mutasi stok.
- **Login bypass offline** (login tanpa validasi password saat fetch gagal) dihapus.
- **Sesi palsu di localStorage** tidak lagi menjadi sumber otoritas; identitas diambil dari sesi server.
- **Login Cabang 2** tidak lagi dipaksa ke `CBG001`.
- **Frontend tidak lagi melaporkan sukses** ketika API gagal.
- **N+1 query** detail pesanan dihapus; detail diambil dalam satu query.
- **Dependency mismatch** Express 4 vs 5 diperbaiki.
- **Node version** diselaraskan ke `>=22.5.0` karena `node:sqlite`.
- **Timezone** dashboard/laporan tidak lagi memakai UTC mentah; memakai offset bisnis yang dapat dikonfigurasi.
- **ID race** dikurangi dengan memindahkan pembuatan ID pesanan ke dalam transaksi `BEGIN IMMEDIATE`.

---

## 5. Perubahan Backend

### 5.1 Service baru

| File | Fungsi |
|---|---|
| `src/services/authService.js` | Sesi HMAC, lookup sesi database, revocation, middleware auth/RBAC |
| `src/services/passwordService.js` | Hash/verify/rehash scrypt |
| `src/services/settingsService.js` | Baca/validasi/update `app_settings`, tarif pajak |
| `src/services/dateService.js` | Kebijakan UTC + offset zona waktu bisnis |
| `src/config/env.js` | Loader `.env` tanpa dependency eksternal |

### 5.2 Controller dan route

- `authController`: login, logout dengan revocation, session endpoint, user CRUD dengan hashing dan validasi.
- `orderController`: checkout transaksional, validasi pembayaran/kuantitas, status dapur, pagination, branch scoping, timezone filter.
- `stockController`: adjustment transaksional, restock massal, optimasi query expiry.
- `reportController`: dashboard real, analytics baru, CSV escaping, filter cabang, timezone.
- `menuController`: validasi kategori/harga/stok, audit log stok, soft-deactivation.
- `settingsController`: GET/PUT pengaturan.
- `branchController`: validasi dan pengecekan keberadaan cabang.
- `routes/api.js`: semua route dilindungi auth + role guard.

### 5.3 Endpoint baru/perubahan

| Endpoint | Keterangan |
|---|---|
| `GET /api/health` | Health check + status database (publik) |
| `POST /api/auth/logout` | Mencabut sesi server-side |
| `GET /api/auth/session` | Profil sesi aktif |
| `PATCH /api/orders/:id/status` | Status dapur `pending`/`served` |
| `GET /api/reports/analytics` | Analitik nyata untuk laporan |
| `POST /api/stock/restock-all` | Restock massal transaksional |
| `GET /api/settings` | Baca pengaturan |
| `PUT /api/settings` | Simpan pengaturan (admin/manager) |

Endpoint lama tetap dipertahankan; seluruhnya kini memerlukan sesi kecuali login/logout/health.

### 5.4 Observability

- Structured request log JSON: timestamp, method, path, status, durasi, IP.
- Dapat dinonaktifkan dengan `LOG_REQUESTS=false`.
- Global error handler dan graceful shutdown ditambahkan.

---

## 6. Perubahan Frontend

- Script inline dipindahkan ke file eksternal (`index-app.js`, `login.js`) agar kompatibel dengan CSP ketat.
- Semua rendering data dinamis memakai escaping (`esc()`), termasuk menu, pesanan, pelanggan, struk, member, dan atribut HTML.
- Toast tidak lagi menggunakan `innerHTML` untuk pesan dinamis.
- Navigasi berbasis peran:
  - kasir: overview, POS, orders, members, settings
  - manager: overview, orders, katalog, inventori, laporan, members, settings
  - owner: overview, orders, laporan, members, settings
  - admin: semua
- Verifikasi sesi saat boot; redirect ke login bila sesi tidak valid.
- Branch selector dinonaktifkan untuk kasir.
- Keranjang tidak lagi terisi item contoh saat halaman dibuka.
- Inventori, laporan, pengaturan, dan status dapur memakai data server.
- Empty/error state ditambahkan untuk inventori, laporan, dan member.
- Aksesibilitas:
  - kartu produk dapat diaktifkan dengan keyboard (Enter/Space)
  - Escape menutup modal
  - fokus awal saat modal dibuka
  - dukungan `prefers-reduced-motion`

---

## 7. Perubahan Database

Migrasi berjalan otomatis dan idempoten saat startup. Database utama tidak diubah selama proses pengembangan/pengujian.

| Perubahan | Sifat |
|---|---|
| Tabel `sessions` + index user/expiry | Additive |
| Tabel `app_settings` + nilai default | Additive |
| Kolom `pesanan.status_dapur` (`pending`/`served`) | Additive + migrasi data lama menjadi `served` |
| Index query (menu, pesanan, detail, pembayaran, struk, stok, sesi) | Additive |
| Migrasi password plaintext → scrypt | Update data |
| Pencegahan overwrite katalog saat startup | Perubahan perilaku seeder |
| Log mutasi stok untuk edit menu | Perubahan perilaku |
| Soft-deactivation menu yang memiliki riwayat | Perubahan perilaku |

**Belum diterapkan:** migrasi multi-cabang dan konversi uang ke integer. Keduanya memerlukan keputusan bisnis/backup dan dijelaskan pada bagian issue terbuka.

---

## 8. File yang Dimodifikasi

### Baru

- `nomcherry-web/src/services/authService.js`
- `nomcherry-web/src/services/passwordService.js`
- `nomcherry-web/src/services/settingsService.js`
- `nomcherry-web/src/services/dateService.js`
- `nomcherry-web/src/config/env.js`
- `nomcherry-web/src/controllers/settingsController.js`
- `nomcherry-web/public/js/index-app.js`
- `nomcherry-web/public/js/login.js`
- `nomcherry-web/tests/e2e/e2e.test.js`
- `nomcherry-web/.env.example`

### Dimodifikasi

- `nomcherry-web/src/server.js`
- `nomcherry-web/src/routes/api.js`
- `nomcherry-web/src/database/db.js`
- `nomcherry-web/src/controllers/authController.js`
- `nomcherry-web/src/controllers/orderController.js`
- `nomcherry-web/src/controllers/menuController.js`
- `nomcherry-web/src/controllers/stockController.js`
- `nomcherry-web/src/controllers/reportController.js`
- `nomcherry-web/src/controllers/branchController.js`
- `nomcherry-web/public/index.html`
- `nomcherry-web/public/login.html`
- `nomcherry-web/public/css/cofra-theme.css`
- `nomcherry-web/public/js/app.js`
- `nomcherry-web/tests/test-nomcherry.js`
- `nomcherry-web/tests/audit-all-features.js`
- `nomcherry-web/tests/test-security.js`
- `nomcherry-web/package.json`
- `nomcherry-web/package-lock.json`
- `README.md`
- `ProjekCafePBO/.gitignore`
- `ProjekCafePBO/ProjekCafePBO/src/util/DatabaseConnection.java`
- `ProjekCafePBO/db_kafe.sql`

Catatan: perbaikan web berada di root `nomcherry-web/`. Copy Git-tracked di `ProjekCafePBO/nomcherry-web/` **belum** diselaraskan.

---

## 9. Hasil Testing

Semua pengujian menggunakan database sementara; database aplikasi utama tidak dimutasi.

| Pengujian | Perintah | Hasil aktual |
|---|---|---|
| Verification suite | `npm test` | **12/12 lolos** |
| Feature audit | `npm test` | **16/16 lolos** |
| Security/integration | `npm test` | **Seluruh assertion lolos** |
| E2E browser | `npm run test:e2e` | **10/10 skenario lolos** |
| Semua suite | `npm run test:all` | **Lolos** |
| Syntax check | `node --check` | Semua file yang diubah lolos |
| Dependency tree | `npm ls --depth=0` | Valid: `express@5.3.0`, `playwright-core@1.65.0` |
| Reproducible install | `npm ci --dry-run` | Up to date |
| Vulnerability scan | `npm audit` | 0 low/moderate/high/critical |
| Legacy DB compatibility | Salinan DB asli | Login berhasil, katalog tidak tertimpa, password di-rehash |
| Integritas DB asli | Pemeriksaan file | Tidak berubah |

E2E yang dijalankan mencakup: login, logout, otorisasi admin/kasir, pembuatan menu, inventori, keranjang POS, checkout, pengurangan stok, struk, riwayat pesanan, laporan, dan branch lock.

Tidak dilakukan: load testing, audit aksesibilitas formal, kompilasi Java, dan pipeline CI.

---

## 10. Konfigurasi Lingkungan

| Variabel | Default | Keterangan |
|---|---|---|
| `PORT` | `3000` | Port HTTP |
| `HOST` | `127.0.0.1` | Bind address; set `0.0.0.0` untuk LAN |
| `NODE_ENV` | `development` | `production` mengaktifkan cookie `Secure` |
| `SESSION_SECRET` | sementara | Wajib di produksi |
| `NOMCHERRY_DB` | `src/database/nomcherry.db` | Lokasi SQLite |
| `APP_TZ_OFFSET_MINUTES` | `420` | Offset zona waktu bisnis (UTC+7) |
| `LOG_REQUESTS` | `true` | `false` untuk menonaktifkan request log |

`.env` dimuat otomatis tanpa dependency tambahan. Referensi tersedia di `nomcherry-web/.env.example`.

---

## 11. Kompatibilitas dan Catatan Operasional

- Database lama dimigrasikan otomatis saat startup.
- Pesanan lama diberi `status_dapur='served'` agar tidak muncul sebagai antrean baru.
- Katalog yang sudah diedit tidak lagi ditimpa saat restart.
- Login lama dengan password plaintext tetap berfungsi, lalu otomatis di-hash.
- Sesi lama (sebelum migrasi) tidak berlaku; pengguna perlu login ulang.
- Server berjalan default di `127.0.0.1`; gunakan `HOST=0.0.0.0` bila perlu akses LAN.
- Backup database tetap diperlukan sebelum migrasi besar di masa depan.

---

## 12. Issue yang Belum Terselesaikan

| Issue | Status | Alasan |
|---|---|---|
| Model stok/katalog per cabang | Belum diimplementasikan | Memerlukan migrasi `menu_cabang` dan keputusan stok awal CBG002 |
| Modul member loyalty | Ditahan | Aturan tier/poin/kunjungan belum disetujui; data rekaan dihapus |
| Uang disimpan sebagai `REAL` | Belum dimigrasikan | Perlu migrasi integer rupiah + backup/rollback |
| Aset lokal | Belum | Font Google dan gambar Unsplash masih remote; perlu aset/lisensi |
| `style-src 'unsafe-inline'` | Masih ada | UI masih memakai atribut style inline |
| Rate limiter | In-memory | Belum shared antar proses/multi-instance |
| Git history | Belum dibersihkan | Berisi DB, `.class`, dan secret lama; butuh approval |
| Duplikasi implementasi | Belum dikonsolidasikan | `ProjekCafePBO/nomcherry-web` masih versi Parley lama dan tidak aman |
| CI/CD | Belum | Belum ada pipeline otomatis |
| Audit aksesibilitas formal | Belum | Perbaikan dasar sudah ada, audit WCAG penuh belum |
| Load testing | Belum | Belum ada profiling beban nyata |

**Penting:** `ProjekCafePBO/nomcherry-web` belum menerima perbaikan keamanan ini. Jangan deploy copy tersebut.

---

## 13. Cara Verifikasi

```bash
cd nomcherry-web

# Unit/controller, audit fitur, dan security HTTP
npm test

# E2E browser (memerlukan Chrome/Edge terpasang)
npm run test:e2e

# Semua pengujian
npm run test:all

# Dependency
npm ls --depth=0
npm audit
```

---

## 14. Penutup

Remediation ini meningkatkan keamanan, integritas data, dan kesiapan operasional NomCherry secara signifikan. Aplikasi belum dinyatakan sepenuhnya production-ready sampai model multi-cabang, aturan member, pembersihan Git history, dan konsolidasi implementasi diselesaikan.

Tidak ada commit, force push, rewrite history, penghapusan repositori, atau perubahan database produksi yang dilakukan dalam proses ini.
