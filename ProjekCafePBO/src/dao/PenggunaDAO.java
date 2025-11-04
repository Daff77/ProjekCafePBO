/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package dao;

/**
 *
 * @author Daffa Danendra
 */
import util.DatabaseConnection;
import model.Pengguna;
import java.sql.*;
import java.util.ArrayList;
import java.util.List;

public class PenggunaDAO {

    public Pengguna login(String username, String password) {
        String sql = "SELECT id_pengguna, nama_pengguna, username, peran "
                + "FROM pengguna WHERE username = ? AND kata_sandi = ?";
        Pengguna user = null;

        try (Connection conn = DatabaseConnection.getConnection(); PreparedStatement pstmt = conn.prepareStatement(sql)) {

            pstmt.setString(1, username);
            pstmt.setString(2, password);

            ResultSet rs = pstmt.executeQuery();

            if (rs.next()) {
                user = new Pengguna(
                        rs.getString("id_pengguna"),
                        rs.getString("nama_pengguna"),
                        rs.getString("username"),
                        rs.getString("peran")
                );
                System.out.println("✅ Login berhasil: " + user.getNamaPengguna());
            }

        } catch (SQLException e) {
            System.out.println("❌ Error saat login: " + e.getMessage());
        }

        return user;
    }

    public List<Pengguna> getAllUsers() {
        List<Pengguna> users = new ArrayList<>();
        String sql = "SELECT * FROM pengguna ORDER BY peran, username";

        try (Connection conn = DatabaseConnection.getConnection(); Statement stmt = conn.createStatement(); ResultSet rs = stmt.executeQuery(sql)) {

            while (rs.next()) {
                Pengguna user = new Pengguna(
                        rs.getString("id_pengguna"),
                        rs.getString("nama_pengguna"),
                        rs.getString("username"),
                        rs.getString("kata_sandi"),
                        rs.getString("peran")
                );
                users.add(user);
            }

        } catch (SQLException e) {
            System.out.println("❌ Error get all users: " + e.getMessage());
        }

        return users;
    }

// Di method addUser(), update dengan validasi yang better:
    public boolean addUser(Pengguna user) {
        // Validasi role
        if (!isValidRole(user.getPeran())) {
            System.out.println("❌ Role tidak valid: " + user.getPeran());
            System.out.println("✅ Role yang diperbolehkan: admin, kasir, manager, owner");
            return false;
        }

        String sql = "INSERT INTO pengguna (nama_pengguna, username, kata_sandi, peran) VALUES (?, ?, ?, ?)";

        try (Connection conn = DatabaseConnection.getConnection(); PreparedStatement pstmt = conn.prepareStatement(sql)) {

            pstmt.setString(1, user.getNamaPengguna());
            pstmt.setString(2, user.getUsername());
            pstmt.setString(3, user.getKataSandi());
            pstmt.setString(4, user.getPeran().toLowerCase()); // Convert to lowercase

            boolean result = pstmt.executeUpdate() > 0;
            if (result) {
                System.out.println("✅ User berhasil ditambah: " + user.getNamaPengguna() + " | Role: " + user.getPeran());
            }
            return result;

        } catch (SQLException e) {
            System.out.println("❌ Error add user: " + e.getMessage());

            // Cek jika error karena constraint
            if (e.getMessage().contains("check constraint")) {
                System.out.println("⚠️ Error: Role '" + user.getPeran() + "' tidak diperbolehkan di database");
                System.out.println("💡 Solusi: Jalankan SQL ini di database:");
                System.out.println("   ALTER TABLE pengguna DROP CONSTRAINT IF EXISTS pengguna_peran_check;");
                System.out.println("   ALTER TABLE pengguna ADD CONSTRAINT pengguna_peran_check CHECK (peran IN ('admin', 'kasir', 'manager', 'owner'));");
            }

            return false;
        }
    }
// Method validasi role


    public boolean updateUser(Pengguna user) {
        String sql = "UPDATE pengguna SET nama_pengguna = ?, username = ?, kata_sandi = ?, peran = ? WHERE id_pengguna = ?";

        try (Connection conn = DatabaseConnection.getConnection(); PreparedStatement pstmt = conn.prepareStatement(sql)) {

            pstmt.setString(1, user.getNamaPengguna());
            pstmt.setString(2, user.getUsername());
            pstmt.setString(3, user.getKataSandi());
            pstmt.setString(4, user.getPeran());
            pstmt.setString(5, user.getIdPengguna());

            int affectedRows = pstmt.executeUpdate();
            if (affectedRows > 0) {
                System.out.println("✅ User berhasil diupdate: " + user.getUsername());
                return true;
            }
            return false;

        } catch (SQLException e) {
            System.out.println("❌ Error update user: " + e.getMessage());
            return false;
        }
    }

    public boolean deleteUser(String idPengguna) {
        // Cek apakah user sedang digunakan di transaksi
        String checkSql = "SELECT COUNT(*) FROM pesanan WHERE id_pengguna = ?";
        String deleteSql = "DELETE FROM pengguna WHERE id_pengguna = ?";

        try (Connection conn = DatabaseConnection.getConnection(); PreparedStatement checkStmt = conn.prepareStatement(checkSql); PreparedStatement deleteStmt = conn.prepareStatement(deleteSql)) {

            // Cek apakah user ada di transaksi
            checkStmt.setString(1, idPengguna);
            ResultSet rs = checkStmt.executeQuery();

            if (rs.next() && rs.getInt(1) > 0) {
                System.out.println("❌ User tidak bisa dihapus karena memiliki transaksi: " + idPengguna);
                return false;
            }

            // Hapus user
            deleteStmt.setString(1, idPengguna);
            int affectedRows = deleteStmt.executeUpdate();

            if (affectedRows > 0) {
                System.out.println("✅ User berhasil dihapus: " + idPengguna);
                return true;
            } else {
                System.out.println("❌ User tidak ditemukan: " + idPengguna);
                return false;
            }

        } catch (SQLException e) {
            System.out.println("❌ Error delete user: " + e.getMessage());
            return false;
        }
    }

    private boolean isValidRole(String role) {
        if (role == null) {
            return false;
        }

        String lowerRole = role.toLowerCase();
        return lowerRole.equals("admin")
                || lowerRole.equals("kasir")
                || lowerRole.equals("manager")
                || lowerRole.equals("owner");
    }

    public boolean isUsernameExists(String username, String excludeUserId) {
        String sql = "SELECT COUNT(*) FROM pengguna WHERE username = ? AND id_pengguna != ?";

        try (Connection conn = DatabaseConnection.getConnection(); PreparedStatement pstmt = conn.prepareStatement(sql)) {

            pstmt.setString(1, username);
            pstmt.setString(2, excludeUserId != null ? excludeUserId : "");
            ResultSet rs = pstmt.executeQuery();

            if (rs.next()) {
                return rs.getInt(1) > 0;
            }
            return false;

        } catch (SQLException e) {
            System.out.println("❌ Error check username: " + e.getMessage());
            return false;
        }
    }
}
