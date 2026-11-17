# Laporan Remediasi Audit Sistem & UI NomCherry Café

- **Tanggal Remediasi**: 2026-11-18
- **Acuan Audit**: `C:\DaffaP\Project df\ProjectCafe\audit\AUDIT-2026-11-18.md` (dipertahankan utuh tanpa modifikasi)
- **Sumber Kode Utama (Canonical Source)**: `C:\DaffaP\Project df\ProjectCafe\ProjekCafePBO\nomcherry-web` (di bawah kontrol versi Git `ProjekCafePBO/`)
- **Status Pengujian Akhir**: Seluruh suite otomatis lulus (`npm run test:all` — unit, audit fitur, keamanan HTTP, regresi remediasi 10 bagian, dan 14 skenario E2E Playwright Chrome desktop/tablet/mobile; `impeccable detect --json` menghasilkan `[]`).

---

## 1. Penetapan Sumber Kode Tunggal & Keamanan Data

1. **Verifikasi Salinan Identik**: Pemeriksaan hash SHA-256 pada baseline membuktikan ke-36 berkas kode di `ProjectCafe\nomcherry-web` dan `ProjectCafe\ProjekCafePBO\nomcherry-web` identik 100%.
2. **Konsolidasi ke Git**:
   - Salinan tidak terversi di root diarsipkan ke `ProjectCafe\archive\nomcherry-web-root-pre-consolidation`.
   - `ProjectCafe\nomcherry-web` dihubungkan melalui *NTFS Directory Junction* ke `ProjectCafe\ProjekCafePBO\nomcherry-web`, sehingga `ProjectCafe\start-web.bat`, `ProjekCafePBO\start-web.bat`, dan Git mengacu ke satu direktori fisik yang sama.
3. **Pencadangan Database Sebelum Perubahan**:
   - Cadangan awal disimpan di `ProjectCafe\archive\db-backups-2026-11-18\` dan snapshot terverifikasi `VACUUM INTO` disimpan di `ProjekCafePBO\backups\nomcherry-backup-2026-11-17T17-38-07-045Z.db`.
   - Seluruh pengujian otomatis dijalankan terhadap database sementara di `os.tmpdir()` dan tidak menyentuh database operasional `nomcherry.db`.

---

## 2. Tabel Penyelesaian 19 Temuan Audit

| Nomor temuan | Status | Perubahan | Bukti pengujian | Sisa keterbatasan |
| :--- | :--- | :--- | :--- | :--- |
| **#1 [P1]** Pemilih cabang (`#branch-selector`) tidak mengubah cabang aktif | **SELESAI** | Memisahkan `hydrateSessionOnce()` dari `renderHeaderAndSessionUi()` di `public/js/index-app.js`; memisahkan `assignedBranch` dari `activeBranch` (`sessionStorage`); mengunci kasir di UI & `resolveAuthorizedBranch()` (`403` di seluruh controller); menambahkan dialog konfirmasi reset keranjang saat pindah cabang; menambahkan `AbortController` + nomor urut `syncSeq` untuk membuang respons usang. | `tests/test-audit-remediation.js` [2/10] (`403` lintas cabang kasir) & `tests/e2e/e2e.test.js` Skenario 9 (`CBG001 -> CBG002 -> CBG001`, batal/setuju dialog keranjang) + Skenario 14 (`#branch-selector` kasir `disabled`). | Pilihan cabang aktif admin disimpan per tab sesi (`sessionStorage`) agar dua tab admin dapat memantau cabang berbeda tanpa saling menimpa. |
| **#2 [P1]** Grafik utama & sebagian KPI menampilkan angka statis / ID DOM tidak cocok | **SELESAI** | Menghapus objek statis `RANGE_DATA` dan seluruh angka fiktif (`142 Struk`, `Rp 6.840.000`, `64.2%`, `Rp 8.000.000`, `Rp 500.000`, MDR BI palsu); menyelaraskan ID DOM (`#ov-kpi-orders`, `#ov-kpi-aov`, `#ov-kpi-items`, `#rep-kpi-*`); merender kurva SVG, sumbu Y/X, komposisi kategori, jenis pesanan, dan kartu pembayaran murni dari respons `GET /api/reports/dashboard` & `GET /api/reports/analytics`, lengkap dengan garis datar & pesan kosong saat transaksi `0`. | `tests/e2e/e2e.test.js` Skenario 5 (verifikasi nilai dinamis `today`/`7d` dan laporan) + tangkapan visual `02-overview-desktop-light.png` & `03-overview-desktop-dark.png`. | Target shift & kas awal laci ditampilkan jujur sebagai `Belum dikonfigurasi` karena modul pembukaan/penutupan shift kasir belum diimplementasikan. |
| **#3 [P1]** Checkout tidak memiliki proteksi duplikasi / idempotency | **SELESAI** | Mengunci tombol `#checkout-btn` (`disabled`, `aria-busy`) selama request; menambahkan tabel `order_idempotency` dan validasi atomik di dalam `db.transaction` (`BEGIN IMMEDIATE`) pada `orderController.createOrder`; mengembalikan pesanan asli (`idempotent_replay: true`) saat retry dengan key & payload sama, menolak `409 Conflict` bila payload berbeda, serta mempertahankan key & keranjang saat jaringan terputus. | `tests/test-audit-remediation.js` [4/10]: `Promise.all` paralel + retry menghasilkan tepat 1 pesanan, 1 pembayaran, 1 struk, 1 pemotongan stok; payload berbeda menghasilkan `409`. | Rekaman `order_idempotency` disimpan permanen di SQLite tanpa jadwal pembersihan otomatis (ukuran baris sangat kecil untuk skala kafe). |
| **#4 [P1]** Stok kedaluwarsa masih dapat dijual melalui POS | **SELESAI** | Menetapkan kebijakan eksplisit berbasis tanggal bisnis WIB (`dateService.evaluateExpiry`): `tanggal_kadaluarsa < today` ditolak server (`400 STOCK_EXPIRED`) dan dikunci pada katalog POS (`.is-out`, badge `Kedaluwarsa`), sedangkan `tanggal_kadaluarsa == today` (H-0) masih valid hingga akhir hari operasional dengan peringatan `Near-Expiry`. | `tests/test-audit-remediation.js` [5/10] (`400` tanpa partial write untuk H-1; `200` + `is_near_expiry: true` untuk H-0). | Skema inventori menyimpan **satu tanggal kedaluwarsa aktif per menu per cabang**, belum mendukung pelacakan multi-lot/batch FEFO terpisah. |
| **#5 [P1]** Cakupan waktu metrik tidak konsisten & terpotong batas 500 pesanan | **SELESAI** | Memindahkan seluruh agregasi omzet, jumlah struk, item terjual, kategori, jenis pesanan, dan metode pembayaran ke SQL server-side tanpa `LIMIT 500` untuk cabang & periode yang sama persis (`today`, `7d`, `30d`); memisahkan paginasi daftar pesanan (`limit`/`offset`/`pagination`) dari objek `summary` dataset penuh dan `kitchen_queue` aktif di `GET /api/orders`. | `tests/test-audit-remediation.js` [8/10] dengan injeksi **525 pesanan**: halaman 1 memuat 25 baris, sementara `summary` dan `dashboard` menghitung akurat seluruh 525 pesanan serta mengecualikan tanggal di luar periode. | Grafik heatmap & tren bulanan di halaman Laporan menggunakan cakupan cabang aktif (6 bulan untuk bar bulanan, rentang filter untuk kategori/heatmap/top menu). |
| **#6 [P1]** Pajak laporan dihitung ulang dari tarif saat ini, bukan pajak tersimpan | **SELESAI** | Menambahkan kolom migrasi idempotent `pesanan.tarif_pajak`; menyimpan `tarif_pajak` dan `pajak` aktual pada setiap transaksi baru; mengubah seluruh query laporan (`dashboard`, `analytics`, `sales`, `orders`) dan kartu `.ov-safe` agar menjumlahkan kolom `subtotal`, `diskon`, `pajak`, dan `total` tersimpan tanpa membagi ulang dengan `tax_rate` pengaturan aktif. | `tests/test-audit-remediation.js` [6/10]: membuat transaksi pada pajak `10%`, mengubah `tax_rate` ke `12%`, dan membuktikan total pajak historis serta struk lama tetap `10%`. | Untuk transaksi lama sebelum migrasi yang belum memiliki `tarif_pajak`, persentase pada label struk diturunkan dari rasio `pajak / (subtotal - diskon)` tersimpan. |
| **#7 [P1]** Overflow horizontal pada tablet & ponsel di beberapa halaman | **SELESAI** | Merombak struktur `.top` menjadi dua baris fleksibel, menghapus `min-width` kaku pada toolbar/select/input, menambahkan `.bars-scroll` dan `.heat-scroll` lokal untuk grafik lebar, serta menyesuaikan grid responsif tanpa menyembunyikan masalah menggunakan `overflow-x: hidden` global pada `html`/`body`. | `tests/e2e/e2e.test.js` Skenario 1 & 11: pemeriksaan terprogram `scrollWidth <= innerWidth` lulus pada lebar **320, 390, 768, 1024, dan 1440 px** di ke-8 tampilan aplikasi + `/login`. | Tabel heatmap mingguan (7 kolom hari) menggunakan scroll horizontal lokal di dalam kartunya sendiri pada layar ponsel sempit agar angka tetap terbaca. |
| **#8 [P1]** Pembuatan menu menggandakan stok awal ke semua cabang | **SELESAI** | Mengubah `menuController.create` dan `db.js` agar stok awal menu baru dialokasikan **hanya** ke cabang target (`0` porsi untuk cabang lain kecuali `alokasi_cabang` diberikan eksplisit), mencatat log `MASUK` awal per cabang secara akurat, dan menyediakan audit baca-saja `GET /api/stock/reconciliation`. | `tests/test-audit-remediation.js` [3/10] & `tests/e2e/e2e.test.js` Skenario 9 (`CBG001 = 25` / `7`, `CBG002 = 0`; mutasi satu cabang tidak memengaruhi cabang lain). | Rekonsiliasi stok bersifat baca-saja sesuai aturan keselamatan data; koreksi fisik tetap dilakukan manual melalui fitur Stock Opname. |
| **#9 [P1]** Akun demo berpassword bawaan dibuat otomatis di semua lingkungan | **SELESAI** | Membatasi seeding akun/pesanan demo hanya saat `SEED_DEMO_DATA=true`; menyediakan bootstrap admin aman via env (`BOOTSTRAP_ADMIN_USERNAME`/`BOOTSTRAP_ADMIN_PASSWORD`) atau CLI `npm run bootstrap:admin` dengan hash `scrypt` tanpa mencetak rahasia ke log; menyembunyikan tombol login cepat demo di `login.html` saat `demo_mode=false`; menambahkan `POST /api/auth/change-password` & `POST /api/users/:id/reset-password` dengan pencabutan sesi aktif. | `tests/test-audit-remediation.js` [1/10] (DB kosong produksi memiliki `0` user demo; CLI membuat admin ter-hash `scrypt`) & [9/10] (ubah/reset sandi mencabut sesi perangkat lain). | Manajemen daftar pengguna penuh via UI belum memiliki halaman khusus; reset sandi staf tersedia melalui API admin (`POST /api/users/:id/reset-password`). |
| **#10 [P2]** Keranjang POS mobile berada di bawah 24 produk tanpa akses cepat | **SELESAI** | Menambahkan bilah ringkasan keranjang tetap (`#mobile-cart-bar`) di atas `.tabbar` yang menampilkan jumlah item & total tagihan secara langsung, serta *bottom sheet* keranjang (`#pos-cart-aside` dengan `#open-mobile-cart-btn` & `#close-mobile-cart-btn`) pada layar `< 1024px`. | `tests/e2e/e2e.test.js` Skenario 12 (alur penuh POS `390×844` dari pilih menu -> buka sheet -> pilih metode bayar -> checkout -> struk) + tangkapan `05` & `06`. | Diuji pada emulasi viewport Chrome headless (`390×844` & `320×844`), belum diuji pada perangkat layar sentuh fisik. |
| **#11 [P2]** Fokus keyboard dapat keluar dari modal ke elemen latar | **SELESAI** | Membangun pengelola dialog/drawer terpusat (`OverlayManager`) di `index-app.js` dan `login.js`: menjebak siklus `Tab`/`Shift+Tab`, menerapkan atribut `inert` & `aria-hidden="true"` pada latar belakang, mendukung penutupan `Escape` & klik backdrop, serta mengembalikan fokus ke tombol pemicu. | `tests/e2e/e2e.test.js` Skenario 8: `20× Tab` dan `4× Shift+Tab` tetap di dalam modal, `#app-shell.inert === true`, `Escape` menutup modal dan mengembalikan fokus ke `#add-menu-btn`. | — |
| **#12 [P2]** Kasir & Owner melihat form Pengaturan aktif padahal API menolak `403` | **SELESAI** | Memisahkan kartu preferensi tampilan/printer lokal & ubah kata sandi (aktif untuk semua peran) dari form konfigurasi bisnis (`admin`/`manager`) dan identitas cabang (`admin`). Untuk `kasir` & `owner`, field bisnis tampil `disabled`/`readOnly` dengan penjelas peran dan tombol Simpan disembunyikan. | `tests/test-audit-remediation.js` [9/10] & `tests/e2e/e2e.test.js` Skenario 14 + tangkapan `07-settings-cashier-readonly.png`. | — |
| **#13 [P2]** Tanggal UTC dan tanggal bisnis lokal (WIB) belum seragam & minim validasi | **SELESAI** | Menyeragamkan seluruh perhitungan hari bisnis, kode struk, batas kedaluwarsa, filter pesanan, dashboard, dan laporan melalui `src/services/dateService.js` (`UTC+7` / `APP_TZ_OFFSET_MINUTES`), serta menambahkan validasi tanggal kalender ketat (`isValidDateString` menolak tanggal mustahil seperti `2026-02-30` dengan `400`). | `tests/test-audit-remediation.js` [7/10]: verifikasi transaksi pukul `23:55 WIB`, `00:05 WIB`, `06:30 WIB`, `07:30 WIB` dan penolakan `400` untuk `2026-02-30`, `2026-13-01`, `2026-04-31`, `invalid-date`. | Zona waktu menggunakan offset menit tetap (`420` menit = WIB/UTC+7), sesuai wilayah Indonesia yang tidak menerapkan DST. |
| **#14 [P2]** Struk memakai pengaturan global & input DOM yang belum disimpan | **SELESAI** | Menambahkan kolom snapshot pada tabel `struk` (`nama_kafe_snapshot`, `nama_cabang_snapshot`, `alamat_cabang_snapshot`, `telepon_cabang_snapshot`, `footer_struk_snapshot`, `nama_kasir_snapshot`) dari tabel `cabang` per cabang; memperbarui `openReceiptModal()` agar **hanya** merender snapshot server dan tidak pernah membaca `#set-*` di DOM. | `tests/test-audit-remediation.js` [6/10] (perbedaan identitas struk `CBG001` vs `CBG002` & imutabilitas struk lama) + `tests/e2e/e2e.test.js` Skenario 7 (edit DOM belum disimpan tidak masuk ke struk). | Pencetakan menggunakan dialog cetak browser standar (`window.print()`), belum terhubung langsung ke driver ESC/POS USB/Bluetooth mentah. |
| **#15 [P2]** Klaim real-time multi-kasir tanpa sinkronisasi otomatis & klaim shift belum akurat | **SELESAI** | Menambahkan mekanisme *polling* latar terkendali (`10 detik`, dijeda saat tab tersembunyi, bebas request tumpang tindih), indikator status koneksi & jam sinkronisasi aktual di `#live-clock-chip`, penanganan event `online`/`offline`, serta mengganti seluruh teks klaim real-time/shift/MDR berlebihan dengan teks operasional yang jujur. | `tests/e2e/e2e.test.js` Skenario 10: dua browser context terpisah menyinkronkan pesanan baru ke antrean barista secara otomatis tanpa muat ulang halaman manual. | Sinkronisasi menggunakan HTTP polling periodik (bukan WebSocket/SSE instan sub-detik). |
| **#16 [P2]** Modul Member Loyalitas belum diimplementasikan namun tampil seolah aktif | **SELESAI** | Memberi penanda eksplisit `Nonaktif` / `Belum Aktif` pada navigasi, kartu ringkasan, dan halaman Member; menonaktifkan `#add-member-btn` (`disabled aria-disabled="true"`); serta mengganti istilah diskon di POS menjadi `Potongan Promo Manual`. | Inspeksi DOM & pengujian overflow/navigasi pada `tests/e2e/e2e.test.js` Skenario 11. | Fitur registrasi pelanggan, poin, dan tier tetap dinonaktifkan menunggu spesifikasi bisnis. |
| **#17 [P2]** Semua toast memakai ikon centang sukses termasuk saat gagal | **SELESAI** | Mengimplementasikan `showToast(msg, type)` bertipe `success`, `error`, `warning`, dan `info` dengan ikon SVG berbeda, warna semantik kontras tinggi, peran ARIA (`role="alert"` vs `role="status"`), tombol tutup manual, durasi lebih panjang untuk error, serta banner error persisten `#pos-checkout-alert` di dekat tombol bayar. | `tests/e2e/e2e.test.js` Skenario 3a (memastikan `#pos-checkout-alert` tampil dan `.toast--error` tidak memuat tanda centang `✓`). | — |
| **#18 [P2]** Aplikasi Java Swing lama memiliki password plaintext, kredensial DB bawaan & stok negatif | **SELESAI (DIARSIPKAN + DIPERKERAS STATIS)** | Memindahkan kode Java Swing keluar dari jalur aktif ke `ProjekCafePBO/archive/legacy-java-swing/` dengan `ARCHIVE_STATUS.md`, menghapus artefak `build/`, serta memperkeras source statis (`DatabaseConnection.java` via env var, `PasswordUtil.java` PBKDF2-HMAC-SHA256, `PenggunaDAO.java`, `PesananDAO.java` guard `stok >= ?`, dan `TransaksiService.java` validasi stok sebelum simpan). | Audit kode statis pada `ProjekCafePBO/archive/legacy-java-swing/`. | Runtime aplikasi Java Swing terhadap server PostgreSQL **tidak dijalankan/diuji** karena aplikasi tersebut sudah diarsipkan dan bukan sistem aktif. |
| **#19 [P3]** Duplikasi salinan web, modul JS tak terpakai, dan ketidakcocokan dokumentasi | **SELESAI** | Mengonsolidasikan proyek ke `ProjekCafePBO/nomcherry-web`, memperbarui kedua `start-web.bat` & `.gitignore`, memindahkan 8 file JS mati ke `ProjekCafePBO/archive/legacy-frontend-js/`, memperbarui `ProjekCafePBO/README.md` dan `.env.example`, serta menyusun laporan remediasi terpisah ini tanpa menyentuh `audit/AUDIT-2026-11-18.md`. | Verifikasi struktur Git (`git status`), eksekusi `npm run test:all` dari repositori utama, dan `impeccable detect` (`[]`). | Salinan arsip pra-konsolidasi disimpan aman di luar pohon Git (`ProjectCafe/archive/`) agar mudah ditinjau pengguna sebelum dihapus manual bila sudah tidak diperlukan. |

---

## 3. Sumber Kode Utama & Cara Menjalankan

###Lokasi Kanonis
- **Aplikasi Web**: `C:\DaffaP\Project df\ProjectCafe\ProjekCafePBO\nomcherry-web`
- **Launcher**: `C:\DaffaP\Project df\ProjectCafe\start-web.bat` atau `C:\DaffaP\Project df\ProjectCafe\ProjekCafePBO\start-web.bat`

### Menjalankan Server
```powershell
cd "C:\DaffaP\Project df\ProjectCafe\ProjekCafePBO\nomcherry-web"

# Mode produksi/operasional standar (tanpa akun demo otomatis):
npm start

# Bootstrap akun admin pertama kali pada database kosong:
$env:BOOTSTRAP_ADMIN_USERNAME="admin_utama"
$env:BOOTSTRAP_ADMIN_PASSWORD="PasswordKuatMinimal8Karakter"
npm run bootstrap:admin

# Mode demo/evaluasi lokal eksplisit:
npm run start:demo
```

### Backup & Rollback Database
```powershell
cd "C:\DaffaP\Project df\ProjectCafe\ProjekCafePBO\nomcherry-web"
npm run db:backup
npm run db:rollback -- "..\..\backups\<nama-file-backup>.db"
```

### Menjalankan Seluruh Pengujian
```powershell
cd "C:\DaffaP\Project df\ProjectCafe\ProjekCafePBO\nomcherry-web"
npm run test:all
```

---

## 4. Daftar Berkas Utama yang Diubah / Ditambahkan

### Backend & Skrip Database (`ProjekCafePBO/nomcherry-web/`)
- `src/services/dateService.js` — perhitungan tanggal operasional WIB (`UTC+7`), validasi tanggal kalender ketat, evaluasi kedaluwarsa, dan test clock.
- `src/database/db.js` — migrasi skema idempotent (`pesanan.tarif_pajak`, `struk.*_snapshot`, `pengguna.must_change_password`, `order_idempotency`), pemisahan `SEED_DEMO_DATA=true` dari mode produksi, dan isolasi stok awal per cabang.
- `src/services/authService.js` & `src/controllers/authController.js` — `resolveAuthorizedBranch()`, `GET /api/auth/config`, `POST /api/auth/change-password`, `POST /api/users/:id/reset-password`, dan pencabutan sesi.
- `src/services/settingsService.js` & `src/controllers/settingsController.js` — pemisahan pengaturan bisnis global vs identitas per cabang dan matriks izin peran.
- `src/controllers/orderController.js` — idempotency transaksi atomik, pemblokiran stok kedaluwarsa, snapshot pajak & struk per cabang, serta paginasi + ringkasan penuh `GET /api/orders`.
- `src/controllers/reportController.js` — agregasi SQL dataset penuh (`>500` baris), keselarasan periode `today`/`7d`/`30d`, dan penjumlahan pajak historis tersimpan.
- `src/controllers/menuController.js` & `src/controllers/stockController.js` — alokasi stok cabang tunggal saat buat menu, validasi tanggal ketat, dan endpoint `GET /api/stock/reconciliation`.
- `src/routes/api.js` — pendaftaran rute autentikasi publik/privat, reset sandi, dan rekonsiliasi stok.
- `src/scripts/bootstrap-admin.js` & `src/scripts/db-backup.js` — utilitas bootstrap admin produksi dan backup/rollback SQLite `VACUUM INTO`.

### Frontend & Desain (`ProjekCafePBO/nomcherry-web/public/`)
- `index.html` — penyelarasan ID KPI, penghapusan angka demo statis, bilah keranjang mobile & *bottom sheet*, kontrol paginasi pesanan, pemisahan kartu pengaturan & ubah sandi, serta penanda modul loyalitas nonaktif.
- `login.html` & `js/login.js` — penyembunyian kredensial demo di mode produksi, banner bootstrap, serta jebakan fokus modal bantuan.
- `css/cofra-theme.css` — tata letak responsif bebas overflow `320px–1440px`, kontras tombol/chip WCAG AA pada seluruh state hover/aktif, *bottom sheet* POS mobile, dan variasi toast semantik.
- `js/index-app.js` — pemisahan sesi vs cabang aktif, pembatalan request usang, grafik SVG dinamis, checkout idempotent, struk murni dari snapshot server, `OverlayManager` (focus trap + `inert`), RBAC form pengaturan, dan *polling* sinkronisasi terkendali.

### Pengujian, Konfigurasi & Arsip
- `tests/test-audit-remediation.js` — suite regresi komprehensif 10 bagian untuk seluruh invarian audit.
- `tests/e2e/e2e.test.js` — diperluas menjadi 14 skenario E2E Playwright mencakup desktop, tablet, dan mobile.
- `tests/test-nomcherry.js`, `tests/audit-all-features.js`, `tests/test-security.js` — penyesuaian `SEED_DEMO_DATA='true'` pada DB uji sementara.
- `package.json`, `.env.example`, `ProjekCafePBO/README.md`, `ProjekCafePBO/.gitignore`, `start-web.bat` (root & repo).
- `ProjekCafePBO/archive/legacy-frontend-js/` & `ProjekCafePBO/archive/legacy-java-swing/` — pengarsipan modul JS mati dan aplikasi Java Swing lama.
- `audit/remediation-screenshots/` — bukti tangkapan visual desktop terang/gelap, tablet, POS mobile, keranjang *bottom sheet*, dan pengaturan baca-saja kasir.

---

## 5. Batas Verifikasi Eksplisit

1. **Java Swing & PostgreSQL**: Kode Java Swing lama telah diarsipkan dan diperkeras secara statis, tetapi tidak dikompilasi ulang atau dijalankan terhadap instance PostgreSQL aktif karena bukan bagian dari aplikasi operasional.
2. **Aksesibilitas**: Kontras teks/hover, ukuran target klik (`>= 24px`), jebakan fokus keyboard, `inert`, dan peran ARIA telah diuji otomatis dan melalui inspeksi visual Chrome headless, namun audit pembaca layar penuh (NVDA/JAWS/VoiceOver) untuk sertifikasi formal WCAG 2.1 AA belum dilakukan.
3. **Perangkat Keras Kasir & Pembayaran**: Pembayaran QRIS dan Kartu EDC beroperasi melalui pencatatan/konfirmasi kasir tanpa webhook settlement bank otomatis; pencetakan struk menggunakan dialog cetak browser standar (`@media print`), belum diuji pada printer thermal fisik atau layar sentuh fisik.
4. **Model Kedaluwarsa**: Inventori melacak satu tanggal kedaluwarsa aktif per item menu di tiap cabang, belum memisahkan stok ke dalam beberapa nomor lot/batch berbeda secara bersamaan.
