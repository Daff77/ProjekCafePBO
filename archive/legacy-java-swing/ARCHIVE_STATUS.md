# Status Arsip: Aplikasi Desktop Java Swing Lama (`ProjekCafePBO`)

> **PERINGATAN OPERASIONAL**: Proyek Java Swing NetBeans di direktori ini berstatus **DIARSIPKAN (DEPRECATED / UNSUPPORTED)** dan **telah digantikan sepenuhnya** oleh aplikasi web utama di `../../nomcherry-web/`. Jangan menjalankan aplikasi desktop ini untuk operasional kafe.

## 1. Keputusan Status
- **Jalur Operasional Resmi**: `ProjekCafePBO/nomcherry-web` (Node.js + Express + SQLite `node:sqlite`), dijalankan melalui `start-web.bat` atau `npm start`.
- **Status Aplikasi Java**: Disimpan semata-mata sebagai arsip historis tugas mata kuliah Pemrograman Berorientasi Objek (PBO) sebelum migrasi ke arsitektur web. Tidak dipanggil oleh launcher mana pun.

## 2. Perbaikan Keamanan Statis yang Diterapkan pada Arsip
Sebagai langkah pertahanan berlapis (*defense-in-depth*) apabila kode arsip ini pernah dipelajari atau dijalankan di lingkungan akademik:
1. **`src/util/DatabaseConnection.java`**: Menambahkan `getRequiredConnection()` yang melempar `SQLException` eksplisit ketika variabel lingkungan `NOMCHERRY_DB_PASSWORD` kosong atau driver PostgreSQL gagal terhubung, mencegah `NullPointerException` diam-diam pada DAO.
2. **`src/util/PasswordUtil.java` & `src/dao/PenggunaDAO.java`**: Menghapus perbandingan `kata_sandi = ?` secara *plaintext* di SQL. Password kini diverifikasi dan disimpan menggunakan `PBKDF2WithHmacSHA256` (`pbkdf2$...`) dengan perbandingan waktu-konstan (`MessageDigest.isEqual`) serta migrasi otomatis saat login jika hash lama masih *plaintext*.
3. **`src/service/TransaksiService.java` & `src/dao/PesananDAO.java`**:
   - Memvalidasi akumulasi jumlah item di keranjang (`detail.getJumlah() + jumlah > menu.getStok()`) saat menambah item berulang.
   - Memanggil `cekStokTersedia()` sebelum eksekusi `checkout()`.
   - Mengubah query pengurangan stok menjadi kondisional (`UPDATE menu SET stok = stok - ? WHERE id_menu = ? AND stok >= ?`) di dalam transaksi database dan membatalkan transaksi (`rollback`) apabila baris yang terbarui kurang dari 1, sehingga stok tidak dapat menjadi negatif.

## 3. Batasan Verifikasi (Kejujuran Teknis)
- Lingkungan kerja saat ini tidak menyediakan server PostgreSQL aktif maupun toolchain kompilasi NetBeans/Ant untuk aplikasi Swing ini.
- Oleh karena itu, perbaikan pada kode Java di atas **merupakan remediasi kode statis dan BELUM dikompilasi ulang atau diuji runtime terhadap PostgreSQL**. Gunakan `nomcherry-web` untuk seluruh operasional dan pengujian terotomasi.
