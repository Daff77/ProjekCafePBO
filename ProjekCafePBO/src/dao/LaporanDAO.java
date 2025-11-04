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
import java.sql.*;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class LaporanDAO {

    // Laporan Harian - Pendapatan per hari
    public Map<LocalDate, Double> getPendapatanHarian(LocalDate startDate, LocalDate endDate) {
        Map<LocalDate, Double> result = new HashMap<>();
        
        System.out.println("🔍 LAPORANDAO - Get Pendapatan Harian:");
        System.out.println("   Periode: " + startDate + " sampai " + endDate);
        
        String sql = "SELECT DATE(tanggal_pesanan) as tanggal, SUM(total) as total_harian " +
                     "FROM pesanan " +
                     "WHERE DATE(tanggal_pesanan) BETWEEN ? AND ? " +
                     "AND (status ILIKE '%selesai%' OR status ILIKE '%completed%' OR status ILIKE '%success%' OR status = 'selesai') " +
                     "GROUP BY DATE(tanggal_pesanan) " +
                     "ORDER BY tanggal";

        try (Connection conn = DatabaseConnection.getConnection();
             PreparedStatement pstmt = conn.prepareStatement(sql)) {

            pstmt.setDate(1, Date.valueOf(startDate));
            pstmt.setDate(2, Date.valueOf(endDate));

            ResultSet rs = pstmt.executeQuery();
            
            int count = 0;
            while (rs.next()) {
                LocalDate tanggal = rs.getDate("tanggal").toLocalDate();
                double total = rs.getDouble("total_harian");
                result.put(tanggal, total);
                count++;
                System.out.println("   📅 " + tanggal + ": Rp " + total);
            }
            
            System.out.println("   ✅ Found " + count + " days with data");

        } catch (SQLException e) {
            System.out.println("❌ Error get pendapatan harian: " + e.getMessage());
        }

        return result;
    }

    // Laporan Menu Terlaris
    public List<Map<String, Object>> getMenuTerlaris(LocalDate startDate, LocalDate endDate) {
        List<Map<String, Object>> result = new ArrayList<>();
        
        System.out.println("🔍 LAPORANDAO - Get Menu Terlaris:");
        System.out.println("   Periode: " + startDate + " sampai " + endDate);
        
        String sql = "SELECT m.nama_menu, m.kategori, SUM(dp.jumlah) as total_terjual, " +
                     "SUM(dp.subtotal) as total_pendapatan " +
                     "FROM detail_pesanan dp " +
                     "JOIN menu m ON dp.id_menu = m.id_menu " +
                     "JOIN pesanan p ON dp.id_pesanan = p.id_pesanan " +
                     "WHERE DATE(p.tanggal_pesanan) BETWEEN ? AND ? " +
                     "AND (p.status ILIKE '%selesai%' OR p.status ILIKE '%completed%' OR p.status ILIKE '%success%' OR p.status = 'selesai') " +
                     "GROUP BY m.id_menu, m.nama_menu, m.kategori " +
                     "ORDER BY total_terjual DESC";

        try (Connection conn = DatabaseConnection.getConnection();
             PreparedStatement pstmt = conn.prepareStatement(sql)) {

            pstmt.setDate(1, Date.valueOf(startDate));
            pstmt.setDate(2, Date.valueOf(endDate));

            ResultSet rs = pstmt.executeQuery();
            
            int count = 0;
            while (rs.next()) {
                Map<String, Object> menu = new HashMap<>();
                menu.put("nama_menu", rs.getString("nama_menu"));
                menu.put("kategori", rs.getString("kategori"));
                menu.put("total_terjual", rs.getInt("total_terjual"));
                menu.put("total_pendapatan", rs.getDouble("total_pendapatan"));
                result.add(menu);
                count++;
                
                System.out.println("   🍽️ " + rs.getString("nama_menu") + 
                                 " x" + rs.getInt("total_terjual") + 
                                 " = Rp " + rs.getDouble("total_pendapatan"));
            }
            
            System.out.println("   ✅ Found " + count + " menu items");

        } catch (SQLException e) {
            System.out.println("❌ Error get menu terlaris: " + e.getMessage());
        }

        return result;
    }

    // Laporan Transaksi per Kasir
    public List<Map<String, Object>> getTransaksiPerKasir(LocalDate startDate, LocalDate endDate) {
        List<Map<String, Object>> result = new ArrayList<>();
        
        System.out.println("🔍 LAPORANDAO - Get Transaksi per Kasir:");
        System.out.println("   Periode: " + startDate + " sampai " + endDate);
        
        String sql = "SELECT pg.nama_pengguna, COUNT(p.id_pesanan) as total_transaksi, " +
                     "SUM(p.total) as total_pendapatan " +
                     "FROM pesanan p " +
                     "JOIN pengguna pg ON p.id_pengguna = pg.id_pengguna " +
                     "WHERE DATE(p.tanggal_pesanan) BETWEEN ? AND ? " +
                     "AND (p.status ILIKE '%selesai%' OR p.status ILIKE '%completed%' OR p.status ILIKE '%success%' OR p.status = 'selesai') " +
                     "GROUP BY pg.id_pengguna, pg.nama_pengguna " +
                     "ORDER BY total_pendapatan DESC";

        try (Connection conn = DatabaseConnection.getConnection();
             PreparedStatement pstmt = conn.prepareStatement(sql)) {

            pstmt.setDate(1, Date.valueOf(startDate));
            pstmt.setDate(2, Date.valueOf(endDate));

            ResultSet rs = pstmt.executeQuery();
            
            int count = 0;
            while (rs.next()) {
                Map<String, Object> kasir = new HashMap<>();
                kasir.put("nama_pengguna", rs.getString("nama_pengguna"));
                kasir.put("total_transaksi", rs.getInt("total_transaksi"));
                kasir.put("total_pendapatan", rs.getDouble("total_pendapatan"));
                result.add(kasir);
                count++;
                
                System.out.println("   👤 " + rs.getString("nama_pengguna") + 
                                 " - " + rs.getInt("total_transaksi") + " transaksi = Rp " + 
                                 rs.getDouble("total_pendapatan"));
            }
            
            System.out.println("   ✅ Found " + count + " kasir");

        } catch (SQLException e) {
            System.out.println("❌ Error get transaksi per kasir: " + e.getMessage());
        }

        return result;
    }

    // Statistik Summary
    public Map<String, Object> getSummary(LocalDate startDate, LocalDate endDate) {
        Map<String, Object> summary = new HashMap<>();
        
        System.out.println("🔍 LAPORANDAO - Get Summary:");
        System.out.println("   Periode: " + startDate + " sampai " + endDate);
        
        String sql = "SELECT " +
                     "COUNT(*) as total_transaksi, " +
                     "SUM(total) as total_pendapatan, " +
                     "AVG(total) as rata_rata_transaksi, " +
                     "MIN(total) as transaksi_terkecil, " +
                     "MAX(total) as transaksi_terbesar " +
                     "FROM pesanan " +
                     "WHERE DATE(tanggal_pesanan) BETWEEN ? AND ? " +
                     "AND (status ILIKE '%selesai%' OR status ILIKE '%completed%' OR status ILIKE '%success%' OR status = 'selesai')";

        try (Connection conn = DatabaseConnection.getConnection();
             PreparedStatement pstmt = conn.prepareStatement(sql)) {

            pstmt.setDate(1, Date.valueOf(startDate));
            pstmt.setDate(2, Date.valueOf(endDate));

            ResultSet rs = pstmt.executeQuery();
            if (rs.next()) {
                summary.put("total_transaksi", rs.getInt("total_transaksi"));
                summary.put("total_pendapatan", rs.getDouble("total_pendapatan"));
                summary.put("rata_rata_transaksi", rs.getDouble("rata_rata_transaksi"));
                summary.put("transaksi_terkecil", rs.getDouble("transaksi_terkecil"));
                summary.put("transaksi_terbesar", rs.getDouble("transaksi_terbesar"));
                
                System.out.println("   📊 Summary: " + rs.getInt("total_transaksi") + " transaksi, Rp " + 
                                 rs.getDouble("total_pendapatan") + " total");
            }

        } catch (SQLException e) {
            System.out.println("❌ Error get summary: " + e.getMessage());
        }

        return summary;
    }

    // Laporan Kategori Terlaris
    public List<Map<String, Object>> getKategoriTerlaris(LocalDate startDate, LocalDate endDate) {
        List<Map<String, Object>> result = new ArrayList<>();
        
        System.out.println("🔍 LAPORANDAO - Get Kategori Terlaris:");
        System.out.println("   Periode: " + startDate + " sampai " + endDate);
        
        String sql = "SELECT m.kategori, SUM(dp.jumlah) as total_terjual, " +
                     "SUM(dp.subtotal) as total_pendapatan " +
                     "FROM detail_pesanan dp " +
                     "JOIN menu m ON dp.id_menu = m.id_menu " +
                     "JOIN pesanan p ON dp.id_pesanan = p.id_pesanan " +
                     "WHERE DATE(p.tanggal_pesanan) BETWEEN ? AND ? " +
                     "AND (p.status ILIKE '%selesai%' OR p.status ILIKE '%completed%' OR p.status ILIKE '%success%' OR p.status = 'selesai') " +
                     "GROUP BY m.kategori " +
                     "ORDER BY total_terjual DESC";

        try (Connection conn = DatabaseConnection.getConnection();
             PreparedStatement pstmt = conn.prepareStatement(sql)) {

            pstmt.setDate(1, Date.valueOf(startDate));
            pstmt.setDate(2, Date.valueOf(endDate));

            ResultSet rs = pstmt.executeQuery();
            
            int count = 0;
            while (rs.next()) {
                Map<String, Object> kategori = new HashMap<>();
                kategori.put("kategori", rs.getString("kategori"));
                kategori.put("total_terjual", rs.getInt("total_terjual"));
                kategori.put("total_pendapatan", rs.getDouble("total_pendapatan"));
                result.add(kategori);
                count++;
                
                System.out.println("   📦 " + rs.getString("kategori") + 
                                 " - " + rs.getInt("total_terjual") + " pcs = Rp " + 
                                 rs.getDouble("total_pendapatan"));
            }
            
            System.out.println("   ✅ Found " + count + " categories");

        } catch (SQLException e) {
            System.out.println("❌ Error get kategori terlaris: " + e.getMessage());
        }

        return result;
    }
    
    // Method untuk cek data transaksi
    public Map<String, Object> getDebugInfo(LocalDate startDate, LocalDate endDate) {
        Map<String, Object> debugInfo = new HashMap<>();
        
        String sql = "SELECT " +
                     "COUNT(*) as total_pesanan, " +
                     "SUM(total) as total_pendapatan, " +
                     "MIN(tanggal_pesanan) as tanggal_awal, " +
                     "MAX(tanggal_pesanan) as tanggal_akhir, " +
                     "STRING_AGG(DISTINCT status, ', ') as status_list " +
                     "FROM pesanan " +
                     "WHERE DATE(tanggal_pesanan) BETWEEN ? AND ?";
        
        try (Connection conn = DatabaseConnection.getConnection();
             PreparedStatement pstmt = conn.prepareStatement(sql)) {
            
            pstmt.setDate(1, Date.valueOf(startDate));
            pstmt.setDate(2, Date.valueOf(endDate));
            
            ResultSet rs = pstmt.executeQuery();
            if (rs.next()) {
                debugInfo.put("total_pesanan", rs.getInt("total_pesanan"));
                debugInfo.put("total_pendapatan", rs.getDouble("total_pendapatan"));
                debugInfo.put("tanggal_awal", rs.getDate("tanggal_awal"));
                debugInfo.put("tanggal_akhir", rs.getDate("tanggal_akhir"));
                debugInfo.put("status_list", rs.getString("status_list"));
            }
            
        } catch (SQLException e) {
            System.out.println("❌ Error get debug info: " + e.getMessage());
        }
        
        return debugInfo;
    }
}