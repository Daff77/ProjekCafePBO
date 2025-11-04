/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package dao;

/**
 *
 * @author Daffa Danendra
 */
import model.Pesanan;
import model.DetailPesanan;
import model.Menu;
import util.DatabaseConnection;
import java.sql.*;
import java.util.ArrayList;
import java.util.List;

public class PesananDAO {

    public PesananDAO() {
        checkStatusConstraint(); // Cek constraint saat startup
        checkAllowedStatus();    // Cek status yang ada
    }

    // Method untuk cek constraint
    public void checkStatusConstraint() {
        try (Connection conn = DatabaseConnection.getConnection(); Statement stmt = conn.createStatement()) {

            // Cek constraint untuk tabel pesanan
            ResultSet rs = stmt.executeQuery(
                    "SELECT conname, pg_get_constraintdef(oid) "
                    + "FROM pg_constraint "
                    + "WHERE conrelid = 'pesanan'::regclass AND contype = 'c'"
            );

            System.out.println("🔍 PESANAN TABLE CONSTRAINTS:");
            while (rs.next()) {
                System.out.println("Constraint: " + rs.getString(1));
                System.out.println("Definition: " + rs.getString(2));
            }
            rs.close();

        } catch (SQLException e) {
            System.out.println("❌ Error check constraint: " + e.getMessage());
        }
    }

    // Cek status yang ada di database
    public void checkAllowedStatus() {
        try (Connection conn = DatabaseConnection.getConnection(); Statement stmt = conn.createStatement(); ResultSet rs = stmt.executeQuery("SELECT DISTINCT status FROM pesanan")) {

            System.out.println("🔍 EXISTING STATUS VALUES IN PESANAN:");
            while (rs.next()) {
                System.out.println("Status: '" + rs.getString("status") + "'");
            }

        } catch (SQLException e) {
            System.out.println("❌ Error check allowed status: " + e.getMessage());
        }
    }

    // Method untuk generate ID manual
    private String generatePesananId() {
        String sql = "SELECT COALESCE(MAX(CAST(SUBSTRING(id_pesanan FROM 4) AS INTEGER)), 0) + 1 as next_id FROM pesanan";

        try (Connection conn = DatabaseConnection.getConnection(); Statement stmt = conn.createStatement(); ResultSet rs = stmt.executeQuery(sql)) {

            if (rs.next()) {
                int nextId = rs.getInt("next_id");
                return "PSN" + String.format("%03d", nextId);
            }

        } catch (SQLException e) {
            System.out.println("❌ Error generate pesanan ID: " + e.getMessage());
        }

        return "PSN001";
    }

    private String generateDetailId() {
        String sql = "SELECT COALESCE(MAX(CAST(SUBSTRING(id_detail FROM 4) AS INTEGER)), 0) + 1 as next_id FROM detail_pesanan";

        try (Connection conn = DatabaseConnection.getConnection(); Statement stmt = conn.createStatement(); ResultSet rs = stmt.executeQuery(sql)) {

            if (rs.next()) {
                int nextId = rs.getInt("next_id");
                return "DET" + String.format("%03d", nextId);
            }

        } catch (SQLException e) {
            System.out.println("❌ Error generate detail ID: " + e.getMessage());
        }

        return "DET001";
    }

    public boolean createPesanan(Pesanan pesanan) {
        String sqlPesanan = "INSERT INTO pesanan (id_pesanan, id_pengguna, tanggal_pesanan, total, status) VALUES (?, ?, ?, ?, ?)";
        String sqlDetail = "INSERT INTO detail_pesanan (id_detail, id_pesanan, id_menu, jumlah, subtotal) VALUES (?, ?, ?, ?, ?)";

        Connection conn = null;

        try {
            conn = DatabaseConnection.getConnection();
            conn.setAutoCommit(false);

            // Generate manual ID
            String pesananId = generatePesananId();
            pesanan.setIdPesanan(pesananId);

            System.out.println("🔧 Creating pesanan with ID: " + pesananId);

            PreparedStatement pstmtPesanan = conn.prepareStatement(sqlPesanan);
            pstmtPesanan.setString(1, pesananId);
            pstmtPesanan.setString(2, pesanan.getIdPengguna());
            pstmtPesanan.setTimestamp(3, Timestamp.valueOf(pesanan.getTanggalPesanan()));
            pstmtPesanan.setDouble(4, pesanan.getTotal());

            String status = getValidStatus();
            pstmtPesanan.setString(5, status);

            System.out.println("🔧 Using status: '" + status + "'");

            int affectedRows = pstmtPesanan.executeUpdate();
            pstmtPesanan.close();

            if (affectedRows == 0) {
                throw new SQLException("❌ Creating pesanan failed.");
            }

            System.out.println("✅ Pesanan created with status: '" + status + "'");

            // STEP 2: Insert detail pesanan
            PreparedStatement pstmtDetail = conn.prepareStatement(sqlDetail);
            int detailCount = 0;

            for (DetailPesanan detail : pesanan.getDetailPesananList()) {
                String detailId = generateDetailId();
                pstmtDetail.setString(1, detailId);
                pstmtDetail.setString(2, pesananId);
                pstmtDetail.setString(3, detail.getIdMenu());
                pstmtDetail.setInt(4, detail.getJumlah());
                pstmtDetail.setDouble(5, detail.getSubtotal());
                pstmtDetail.addBatch();
                detailCount++;
            }

            pstmtDetail.executeBatch();
            pstmtDetail.close();
            System.out.println("✅ Detail pesanan inserted: " + detailCount + " items");

            // STEP 3: Update stok menu
            updateStokMenu(pesanan.getDetailPesananList(), conn);

            conn.commit();
            System.out.println("🎉 TRANSACTION SUCCESSFUL! Pesanan ID: " + pesananId);
            return true;

        } catch (SQLException e) {
            System.out.println("❌ Transaction failed: " + e.getMessage());

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
    }

    // Method untuk mencari status yang valid
    private String getValidStatus() {
        // Coba beberapa kemungkinan status berdasarkan constraint umum
        String[] possibleStatuses = {
            "completed", "selesai", "done", "success", "paid",
            "finished", "closed", "successful", "complete"
        };

        // Coba cek di database mana yang valid
        String checkSql = "SELECT 1 FROM pg_enum WHERE enumlabel = ?";

        try (Connection conn = DatabaseConnection.getConnection(); PreparedStatement pstmt = conn.prepareStatement(checkSql)) {

            for (String status : possibleStatuses) {
                pstmt.setString(1, status);
                ResultSet rs = pstmt.executeQuery();
                if (rs.next()) {
                    System.out.println("🔍 Found valid status: " + status);
                    return status;
                }
                rs.close();
            }

        } catch (SQLException e) {
            System.out.println("❌ Error checking valid status: " + e.getMessage());
        }

        return "completed";
    }

    // Method untuk update stok menu
    private void updateStokMenu(List<DetailPesanan> details, Connection conn) throws SQLException {
        String sql = "UPDATE menu SET stok = stok - ? WHERE id_menu = ?";

        try (PreparedStatement pstmt = conn.prepareStatement(sql)) {
            for (DetailPesanan detail : details) {
                pstmt.setInt(1, detail.getJumlah());
                pstmt.setString(2, detail.getIdMenu());
                pstmt.addBatch();
            }
            pstmt.executeBatch();
            System.out.println("🔧 Stok menu updated for " + details.size() + " items");
        }
    }
}
