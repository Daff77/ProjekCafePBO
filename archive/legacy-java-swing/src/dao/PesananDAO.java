package dao;

import model.Pesanan;
import model.DetailPesanan;
import util.DatabaseConnection;
import java.sql.*;
import java.util.List;

public class PesananDAO {

    private String generatePesananId(Connection conn) throws SQLException {
        String sql = "SELECT COALESCE(MAX(CAST(SUBSTRING(id_pesanan FROM 4) AS INTEGER)), 0) + 1 AS next_id FROM pesanan";
        try (Statement stmt = conn.createStatement(); ResultSet rs = stmt.executeQuery(sql)) {
            if (rs.next()) {
                return "PSN" + String.format("%03d", rs.getInt("next_id"));
            }
        }
        return "PSN001";
    }

    private int nextDetailSeq(Connection conn) throws SQLException {
        String sql = "SELECT COALESCE(MAX(CAST(SUBSTRING(id_detail FROM 4) AS INTEGER)), 0) + 1 AS next_id FROM detail_pesanan";
        try (Statement stmt = conn.createStatement(); ResultSet rs = stmt.executeQuery(sql)) {
            if (rs.next()) {
                return rs.getInt("next_id");
            }
        }
        return 1;
    }

    public boolean createPesanan(Pesanan pesanan) {
        String sqlPesanan = "INSERT INTO pesanan (id_pesanan, id_pengguna, tanggal_pesanan, total, status) VALUES (?, ?, ?, ?, ?)";
        String sqlDetail = "INSERT INTO detail_pesanan (id_detail, id_pesanan, id_menu, jumlah, subtotal) VALUES (?, ?, ?, ?, ?)";

        Connection conn = null;
        try {
            conn = DatabaseConnection.getRequiredConnection();
            conn.setAutoCommit(false);

            String pesananId = generatePesananId(conn);
            pesanan.setIdPesanan(pesananId);

            try (PreparedStatement pstmtPesanan = conn.prepareStatement(sqlPesanan)) {
                pstmtPesanan.setString(1, pesananId);
                pstmtPesanan.setString(2, pesanan.getIdPengguna());
                pstmtPesanan.setTimestamp(3, Timestamp.valueOf(pesanan.getTanggalPesanan()));
                pstmtPesanan.setDouble(4, pesanan.getTotal());
                pstmtPesanan.setString(5, "completed");
                if (pstmtPesanan.executeUpdate() == 0) {
                    throw new SQLException("Gagal membuat header pesanan.");
                }
            }

            // Deduct stock conditionally BEFORE committing details; rolls back if any stock < requested
            updateStokMenu(pesanan.getDetailPesananList(), conn);

            int detailSeq = nextDetailSeq(conn);
            try (PreparedStatement pstmtDetail = conn.prepareStatement(sqlDetail)) {
                for (DetailPesanan detail : pesanan.getDetailPesananList()) {
                    String detailId = "DET" + String.format("%03d", detailSeq++);
                    pstmtDetail.setString(1, detailId);
                    pstmtDetail.setString(2, pesananId);
                    pstmtDetail.setString(3, detail.getIdMenu());
                    pstmtDetail.setInt(4, detail.getJumlah());
                    pstmtDetail.setDouble(5, detail.getSubtotal());
                    pstmtDetail.addBatch();
                }
                pstmtDetail.executeBatch();
            }

            conn.commit();
            return true;
        } catch (SQLException e) {
            System.err.println("Transaksi gagal, melakukan rollback: " + e.getMessage());
            if (conn != null) {
                try {
                    conn.rollback();
                } catch (SQLException ex) {
                    System.err.println("Rollback gagal: " + ex.getMessage());
                }
            }
            return false;
        } finally {
            if (conn != null) {
                try {
                    conn.close();
                } catch (SQLException e) {
                    System.err.println("Gagal menutup koneksi: " + e.getMessage());
                }
            }
        }
    }

    private void updateStokMenu(List<DetailPesanan> details, Connection conn) throws SQLException {
        String sql = "UPDATE menu SET stok = stok - ? WHERE id_menu = ? AND stok >= ?";
        try (PreparedStatement pstmt = conn.prepareStatement(sql)) {
            for (DetailPesanan detail : details) {
                if (detail.getJumlah() <= 0) {
                    throw new SQLException("Jumlah pesanan tidak valid untuk menu: " + detail.getIdMenu());
                }
                pstmt.setInt(1, detail.getJumlah());
                pstmt.setString(2, detail.getIdMenu());
                pstmt.setInt(3, detail.getJumlah());
                int updated = pstmt.executeUpdate();
                if (updated != 1) {
                    throw new SQLException("Stok tidak mencukupi untuk menu: " + detail.getIdMenu());
                }
            }
        }
    }
}
