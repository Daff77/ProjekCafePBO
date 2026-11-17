package dao;

import util.DatabaseConnection;
import util.PasswordUtil;
import model.Pengguna;
import java.sql.*;
import java.util.ArrayList;
import java.util.List;

public class PenggunaDAO {

    public Pengguna login(String username, String password) {
        String sql = "SELECT id_pengguna, nama_pengguna, username, kata_sandi, peran "
                + "FROM pengguna WHERE username = ?";
        Pengguna user = null;

        try (Connection conn = DatabaseConnection.getRequiredConnection();
             PreparedStatement pstmt = conn.prepareStatement(sql)) {

            pstmt.setString(1, username);
            try (ResultSet rs = pstmt.executeQuery()) {
                if (rs.next()) {
                    String storedHash = rs.getString("kata_sandi");
                    if (PasswordUtil.verifyPassword(password, storedHash)) {
                        String userId = rs.getString("id_pengguna");
                        user = new Pengguna(
                                userId,
                                rs.getString("nama_pengguna"),
                                rs.getString("username"),
                                rs.getString("peran")
                        );
                        if (PasswordUtil.needsRehash(storedHash)) {
                            try (PreparedStatement up = conn.prepareStatement(
                                    "UPDATE pengguna SET kata_sandi = ? WHERE id_pengguna = ?")) {
                                up.setString(1, PasswordUtil.hashPassword(password));
                                up.setString(2, userId);
                                up.executeUpdate();
                            }
                        }
                    }
                }
            }
        } catch (SQLException e) {
            System.err.println("Error saat login: " + e.getMessage());
        }

        return user;
    }

    public List<Pengguna> getAllUsers() {
        List<Pengguna> users = new ArrayList<>();
        String sql = "SELECT id_pengguna, nama_pengguna, username, peran FROM pengguna ORDER BY peran, username";

        try (Connection conn = DatabaseConnection.getRequiredConnection();
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery(sql)) {

            while (rs.next()) {
                Pengguna user = new Pengguna(
                        rs.getString("id_pengguna"),
                        rs.getString("nama_pengguna"),
                        rs.getString("username"),
                        rs.getString("peran")
                );
                users.add(user);
            }
        } catch (SQLException e) {
            System.err.println("Error get all users: " + e.getMessage());
        }

        return users;
    }

    public boolean addUser(Pengguna user) {
        if (!isValidRole(user.getPeran())) {
            return false;
        }
        String rawPassword = user.getKataSandi();
        if (rawPassword == null || rawPassword.trim().isEmpty()) {
            return false;
        }
        String hashed = PasswordUtil.needsRehash(rawPassword)
                ? PasswordUtil.hashPassword(rawPassword)
                : rawPassword;

        String sql = "INSERT INTO pengguna (nama_pengguna, username, kata_sandi, peran) VALUES (?, ?, ?, ?)";

        try (Connection conn = DatabaseConnection.getRequiredConnection();
             PreparedStatement pstmt = conn.prepareStatement(sql)) {

            pstmt.setString(1, user.getNamaPengguna());
            pstmt.setString(2, user.getUsername());
            pstmt.setString(3, hashed);
            pstmt.setString(4, user.getPeran().toLowerCase());
            return pstmt.executeUpdate() > 0;
        } catch (SQLException e) {
            System.err.println("Error add user: " + e.getMessage());
            return false;
        }
    }

    public boolean updateUser(Pengguna user) {
        if (!isValidRole(user.getPeran())) {
            return false;
        }
        boolean updatePassword = user.getKataSandi() != null && !user.getKataSandi().trim().isEmpty();
        String sql = updatePassword
                ? "UPDATE pengguna SET nama_pengguna = ?, username = ?, kata_sandi = ?, peran = ? WHERE id_pengguna = ?"
                : "UPDATE pengguna SET nama_pengguna = ?, username = ?, peran = ? WHERE id_pengguna = ?";

        try (Connection conn = DatabaseConnection.getRequiredConnection();
             PreparedStatement pstmt = conn.prepareStatement(sql)) {

            pstmt.setString(1, user.getNamaPengguna());
            pstmt.setString(2, user.getUsername());
            if (updatePassword) {
                String raw = user.getKataSandi();
                String hashed = PasswordUtil.needsRehash(raw) ? PasswordUtil.hashPassword(raw) : raw;
                pstmt.setString(3, hashed);
                pstmt.setString(4, user.getPeran().toLowerCase());
                pstmt.setString(5, user.getIdPengguna());
            } else {
                pstmt.setString(3, user.getPeran().toLowerCase());
                pstmt.setString(4, user.getIdPengguna());
            }
            return pstmt.executeUpdate() > 0;
        } catch (SQLException e) {
            System.err.println("Error update user: " + e.getMessage());
            return false;
        }
    }

    public boolean deleteUser(String idPengguna) {
        String checkSql = "SELECT COUNT(*) FROM pesanan WHERE id_pengguna = ?";
        String deleteSql = "DELETE FROM pengguna WHERE id_pengguna = ?";

        try (Connection conn = DatabaseConnection.getRequiredConnection();
             PreparedStatement checkStmt = conn.prepareStatement(checkSql);
             PreparedStatement deleteStmt = conn.prepareStatement(deleteSql)) {

            checkStmt.setString(1, idPengguna);
            try (ResultSet rs = checkStmt.executeQuery()) {
                if (rs.next() && rs.getInt(1) > 0) {
                    return false;
                }
            }
            deleteStmt.setString(1, idPengguna);
            return deleteStmt.executeUpdate() > 0;
        } catch (SQLException e) {
            System.err.println("Error delete user: " + e.getMessage());
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

        try (Connection conn = DatabaseConnection.getRequiredConnection();
             PreparedStatement pstmt = conn.prepareStatement(sql)) {

            pstmt.setString(1, username);
            pstmt.setString(2, excludeUserId != null ? excludeUserId : "");
            try (ResultSet rs = pstmt.executeQuery()) {
                if (rs.next()) {
                    return rs.getInt(1) > 0;
                }
            }
            return false;
        } catch (SQLException e) {
            System.err.println("Error check username: " + e.getMessage());
            return false;
        }
    }
}
