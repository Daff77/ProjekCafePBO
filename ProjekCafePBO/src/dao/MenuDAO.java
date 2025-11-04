/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package dao;

/**
 *
 * @author Daffa Danendra
 */
import model.Menu;
import util.DatabaseConnection;
import java.sql.*;
import java.util.ArrayList;
import java.util.List;

public class MenuDAO {

    public List<Menu> getAllMenu() {
        List<Menu> daftarMenu = new ArrayList<>();
        String sql = "SELECT * FROM menu ORDER BY kategori, nama_menu";

        try (Connection koneksi = DatabaseConnection.getConnection(); Statement stmt = koneksi.createStatement(); ResultSet rs = stmt.executeQuery(sql)) {

            while (rs.next()) {
                Menu menu = new Menu();
                menu.setIdMenu(rs.getString("id_menu"));
                menu.setNamaMenu(rs.getString("nama_menu"));
                menu.setHarga(rs.getDouble("harga"));
                menu.setKategori(rs.getString("kategori"));
                menu.setStok(rs.getInt("stok"));
                daftarMenu.add(menu);
            }

        } catch (SQLException e) {
            System.out.println("❌ Gagal mengambil menu: " + e.getMessage());
        }

        return daftarMenu;
    }

    public Menu getMenuById(String idMenu) {
        String sql = "SELECT * FROM menu WHERE id_menu = ?";
        Menu menu = null;

        try (Connection koneksi = DatabaseConnection.getConnection(); PreparedStatement pstmt = koneksi.prepareStatement(sql)) {

            pstmt.setString(1, idMenu);
            ResultSet rs = pstmt.executeQuery();

            if (rs.next()) {
                menu = new Menu();
                menu.setIdMenu(rs.getString("id_menu"));
                menu.setNamaMenu(rs.getString("nama_menu"));
                menu.setHarga(rs.getDouble("harga"));
                menu.setKategori(rs.getString("kategori"));
                menu.setStok(rs.getInt("stok"));

                System.out.println("🔍 GET BY ID - " + menu.getNamaMenu()
                        + " | Harga: " + menu.getHarga() + " | Stok: " + menu.getStok());
            }

        } catch (SQLException e) {
            System.out.println("❌ Error get menu by ID: " + e.getMessage());
        }

        return menu;
    }

    public boolean addMenu(Menu menu) {
        String sql = "INSERT INTO menu (nama_menu, harga, kategori, stok) VALUES (?, ?, ?, ?)";

        try (Connection koneksi = DatabaseConnection.getConnection(); PreparedStatement pstmt = koneksi.prepareStatement(sql)) {

            pstmt.setString(1, menu.getNamaMenu());
            pstmt.setDouble(2, menu.getHarga());
            pstmt.setString(3, menu.getKategori());
            pstmt.setInt(4, menu.getStok());

            boolean result = pstmt.executeUpdate() > 0;
            if (result) {
                System.out.println("✅ Menu berhasil ditambah: " + menu.getNamaMenu());
            }
            return result;

        } catch (SQLException e) {
            System.out.println("❌ Error saat menambah menu: " + e.getMessage());
            return false;
        }
    }

    // Method untuk update menu - HANYA update nama, harga, kategori
    public boolean updateMenu(Menu menu) {
        System.out.println("🔄 DAO: updateMenu dipanggil - " + menu.getNamaMenu());

        String sql = "UPDATE menu SET nama_menu = ?, harga = ?, kategori = ? WHERE id_menu = ?";

        try (Connection koneksi = DatabaseConnection.getConnection(); PreparedStatement pstmt = koneksi.prepareStatement(sql)) {

            pstmt.setString(1, menu.getNamaMenu());
            pstmt.setDouble(2, menu.getHarga());
            pstmt.setString(3, menu.getKategori());
            pstmt.setString(4, menu.getIdMenu());

            System.out.println("🔧 SQL: UPDATE menu SET nama_menu='" + menu.getNamaMenu()
                    + "', harga=" + menu.getHarga() + ", kategori='" + menu.getKategori()
                    + "' WHERE id_menu='" + menu.getIdMenu() + "'");

            int rowsAffected = pstmt.executeUpdate();
            if (rowsAffected > 0) {
                System.out.println("✅ Menu berhasil diupdate: " + menu.getNamaMenu()
                        + " | Harga: " + menu.getHarga() + " | Kategori: " + menu.getKategori());
                return true;
            } else {
                System.out.println("❌ Tidak ada baris yang terupdate");
                return false;
            }

        } catch (SQLException e) {
            System.out.println("❌ Error update menu: " + e.getMessage());
            return false;
        }
    }

// Method untuk update stok saja - VERSION SUPER SAFE
    public boolean updateStok(String idMenu, int stokBaru) {
        System.out.println("🔄 DAO: updateStok SUPER SAFE dipanggil");
        System.out.println("   ID Menu: " + idMenu);
        System.out.println("   Stok Baru: " + stokBaru);

        // STEP 1: Cek data sebelum update
        Menu menuBefore = getMenuById(idMenu);
        if (menuBefore == null) {
            System.out.println("❌ Menu tidak ditemukan: " + idMenu);
            return false;
        }

        System.out.println("🔍 DATA SEBELUM UPDATE:");
        System.out.println("   Nama: " + menuBefore.getNamaMenu());
        System.out.println("   Harga: " + menuBefore.getHarga());
        System.out.println("   Stok: " + menuBefore.getStok());
        System.out.println("   Kategori: " + menuBefore.getKategori());

        // STEP 2: Execute update HANYA stok
        String sql = "UPDATE menu SET stok = ? WHERE id_menu = ?";

        Connection conn = null;
        try {
            conn = DatabaseConnection.getConnection();
            conn.setAutoCommit(false); // Start transaction

            PreparedStatement pstmt = conn.prepareStatement(sql);
            pstmt.setInt(1, stokBaru);
            pstmt.setString(2, idMenu);

            System.out.println("🔧 EXECUTING SQL: UPDATE menu SET stok = " + stokBaru + " WHERE id_menu = '" + idMenu + "'");

            int rowsAffected = pstmt.executeUpdate();
            pstmt.close();

            if (rowsAffected > 0) {
                // STEP 3: Verify update berhasil
                String verifySql = "SELECT harga, stok FROM menu WHERE id_menu = ?";
                PreparedStatement verifyStmt = conn.prepareStatement(verifySql);
                verifyStmt.setString(1, idMenu);
                ResultSet rs = verifyStmt.executeQuery();

                if (rs.next()) {
                    double hargaAfter = rs.getDouble("harga");
                    int stokAfter = rs.getInt("stok");

                    System.out.println("🔍 DATA SETELAH UPDATE:");
                    System.out.println("   Harga: " + hargaAfter);
                    System.out.println("   Stok: " + stokAfter);

                    // Verifikasi harga tidak berubah
                    if (hargaAfter == menuBefore.getHarga()) {
                        conn.commit();
                        System.out.println("✅ VERIFIKASI BERHASIL: Harga tetap " + hargaAfter);
                        System.out.println("✅ Stok berhasil diupdate: " + stokBaru);
                        return true;
                    } else {
                        conn.rollback();
                        System.out.println("❌ VERIFIKASI GAGAL: Harga berubah dari " + menuBefore.getHarga() + " menjadi " + hargaAfter);
                        System.out.println("❌ Transaction rolled back!");
                        return false;
                    }
                }
                verifyStmt.close();
            } else {
                System.out.println("❌ Tidak ada baris yang terupdate");
                return false;
            }

        } catch (SQLException e) {
            System.out.println("❌ Error update stok: " + e.getMessage());
            try {
                if (conn != null) {
                    conn.rollback();
                }
            } catch (SQLException ex) {
                System.out.println("❌ Rollback failed: " + ex.getMessage());
            }
            return false;
        } finally {
            try {
                if (conn != null) {
                    conn.close();
                }
            } catch (SQLException e) {
                System.out.println("❌ Error closing connection: " + e.getMessage());
            }
        }

        return false;
    }

    // Method untuk delete menu
    public boolean deleteMenu(String idMenu) {
        String sql = "DELETE FROM menu WHERE id_menu = ?";

        try (Connection koneksi = DatabaseConnection.getConnection(); PreparedStatement pstmt = koneksi.prepareStatement(sql)) {

            pstmt.setString(1, idMenu);

            int rowsAffected = pstmt.executeUpdate();
            if (rowsAffected > 0) {
                System.out.println("✅ Menu berhasil dihapus: " + idMenu);
                return true;
            } else {
                System.out.println("❌ Menu tidak ditemukan: " + idMenu);
                return false;
            }

        } catch (SQLException e) {
            System.out.println("❌ Error delete menu: " + e.getMessage());

            if (e.getMessage().contains("foreign key constraint")) {
                System.out.println("⚠️ Menu tidak bisa dihapus karena sedang digunakan dalam transaksi");
            }

            return false;
        }
    }
}
