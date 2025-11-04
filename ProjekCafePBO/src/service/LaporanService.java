/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package service;

/**
 *
 * @author Daffa Danendra
 */
import dao.LaporanDAO;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public class LaporanService {

    private LaporanDAO laporanDAO;

    public LaporanService() {
        this.laporanDAO = new LaporanDAO();
    }

    // Laporan Pendapatan Harian
    public Map<LocalDate, Double> getPendapatanHarian(LocalDate startDate, LocalDate endDate) {
        return laporanDAO.getPendapatanHarian(startDate, endDate);
    }

    // Laporan Menu Terlaris
    public List<Map<String, Object>> getMenuTerlaris(LocalDate startDate, LocalDate endDate) {
        return laporanDAO.getMenuTerlaris(startDate, endDate);
    }

    // Laporan Transaksi per Kasir
    public List<Map<String, Object>> getTransaksiPerKasir(LocalDate startDate, LocalDate endDate) {
        return laporanDAO.getTransaksiPerKasir(startDate, endDate);
    }

    // Summary Statistik
    public Map<String, Object> getSummary(LocalDate startDate, LocalDate endDate) {
        return laporanDAO.getSummary(startDate, endDate);
    }

    // Laporan Kategori Terlaris
    public List<Map<String, Object>> getKategoriTerlaris(LocalDate startDate, LocalDate endDate) {
        return laporanDAO.getKategoriTerlaris(startDate, endDate);
    }

    // Format currency helper
    public String formatCurrency(double amount) {
        return "Rp " + String.format("%,.0f", amount);
    }

    // Get default date range (last 30 days untuk lebih aman)
    public LocalDate getDefaultStartDate() {
        return LocalDate.now().minusDays(30);
    }

    public LocalDate getDefaultEndDate() {
        return LocalDate.now();
    }

    // Get auto date range based on data
    public LocalDate[] getAutoDateRange() {
        LocalDate endDate = LocalDate.now();
        LocalDate startDate = endDate.minusDays(7); // Default 7 hari
        
        // Coba cari tanggal terakhir ada transaksi
        Map<String, Object> debugInfo = laporanDAO.getDebugInfo(
            LocalDate.of(2020, 1, 1), // Start dari sangat awal
            endDate
        );
        
        if (debugInfo.get("tanggal_akhir") != null) {
            LocalDate lastTransactionDate = ((java.sql.Date) debugInfo.get("tanggal_akhir")).toLocalDate();
            startDate = lastTransactionDate.minusDays(6); // 7 hari termasuk hari terakhir
            endDate = lastTransactionDate;
        }
        
        return new LocalDate[]{startDate, endDate};
    }
    
    // Debug info
    public Map<String, Object> getDebugInfo(LocalDate startDate, LocalDate endDate) {
        return laporanDAO.getDebugInfo(startDate, endDate);
    }
}