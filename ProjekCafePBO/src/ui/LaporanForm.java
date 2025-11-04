/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package ui;

/**
 *
 * @author Daffa Danendra
 */

import service.LaporanService;
import javax.swing.*;
import javax.swing.table.DefaultTableModel;
import java.awt.*;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

public class LaporanForm extends JFrame {

    private LaporanService laporanService;
    private JTable tableLaporan;
    private DefaultTableModel tableModel;
    private JTextField txtStartDate, txtEndDate;
    private JComboBox<String> comboJenisLaporan;
    private JLabel lblSummary;

    public LaporanForm() {
        this.laporanService = new LaporanService();
        initUI();
        setAutoDates(); // Auto-set tanggal berdasarkan data
        loadLaporanHarian(); // Default report
    }

    private void initUI() {
        setTitle("📊 Laporan Penjualan - Cafe Management System");
        setDefaultCloseOperation(JFrame.DISPOSE_ON_CLOSE);
        setSize(1200, 700);
        setLocationRelativeTo(null);

        // Main panel
        JPanel mainPanel = new JPanel(new BorderLayout());
        mainPanel.setBorder(BorderFactory.createEmptyBorder(10, 10, 10, 10));

        // Title
        JLabel lblTitle = new JLabel("📊 LAPORAN PENJUALAN", JLabel.CENTER);
        lblTitle.setFont(new Font("Arial", Font.BOLD, 18));
        lblTitle.setBorder(BorderFactory.createEmptyBorder(10, 0, 10, 0));
        mainPanel.add(lblTitle, BorderLayout.NORTH);

        // Control Panel
        JPanel controlPanel = new JPanel(new FlowLayout(FlowLayout.LEFT, 10, 10));
        controlPanel.setBorder(BorderFactory.createTitledBorder("Filter Laporan"));

        // Jenis Laporan
        controlPanel.add(new JLabel("Jenis Laporan:"));
        String[] jenisLaporan = {
            "Pendapatan Harian", 
            "Menu Terlaris", 
            "Transaksi per Kasir", 
            "Kategori Terlaris"
        };
        comboJenisLaporan = new JComboBox<>(jenisLaporan);
        comboJenisLaporan.addActionListener(e -> updateLaporan());
        controlPanel.add(comboJenisLaporan);

        // Date Range
        controlPanel.add(new JLabel("Dari:"));
        txtStartDate = new JTextField(10);
        txtStartDate.setToolTipText("Format: YYYY-MM-DD (Contoh: 2024-01-15)");
        controlPanel.add(txtStartDate);

        controlPanel.add(new JLabel("Sampai:"));
        txtEndDate = new JTextField(10);
        txtEndDate.setToolTipText("Format: YYYY-MM-DD (Contoh: 2024-01-20)");
        controlPanel.add(txtEndDate);

        // Buttons
        JButton btnFilter = new JButton("🔍 Terapkan Filter");
        btnFilter.setBackground(new Color(70, 130, 180));
        btnFilter.setForeground(Color.WHITE);
        btnFilter.addActionListener(e -> updateLaporan());
        controlPanel.add(btnFilter);

        JButton btnHariIni = new JButton("📅 Hari Ini");
        btnHariIni.addActionListener(e -> setDateToday());
        controlPanel.add(btnHariIni);

        JButton btn7Hari = new JButton("🗓️ 7 Hari Terakhir");
        btn7Hari.addActionListener(e -> setDateLast7Days());
        controlPanel.add(btn7Hari);

        JButton btnBulanIni = new JButton("📆 Bulan Ini");
        btnBulanIni.addActionListener(e -> setDateThisMonth());
        controlPanel.add(btnBulanIni);
        
        // Debug Button
        JButton btnDebug = new JButton("🐛 Debug Data");
        btnDebug.setBackground(new Color(255, 165, 0));
        btnDebug.setForeground(Color.WHITE);
        btnDebug.addActionListener(e -> debugData());
        controlPanel.add(btnDebug);

        // Button Export
        JButton btnExport = new JButton("💾 Export ke CSV");
        btnExport.setBackground(new Color(60, 179, 113));
        btnExport.setForeground(Color.WHITE);
        btnExport.addActionListener(e -> exportToCSV());
        controlPanel.add(btnExport);

        mainPanel.add(controlPanel, BorderLayout.NORTH);

        // Table for reports
        tableModel = new DefaultTableModel();
        tableLaporan = new JTable(tableModel);
        tableLaporan.setRowHeight(25);
        tableLaporan.getTableHeader().setFont(new Font("Arial", Font.BOLD, 12));

        JScrollPane scrollPane = new JScrollPane(tableLaporan);
        mainPanel.add(scrollPane, BorderLayout.CENTER);

        // Summary Panel
        JPanel summaryPanel = new JPanel(new FlowLayout(FlowLayout.LEFT));
        summaryPanel.setBorder(BorderFactory.createTitledBorder("Summary"));
        lblSummary = new JLabel("Pilih filter dan klik 'Terapkan Filter'");
        lblSummary.setFont(new Font("Arial", Font.BOLD, 12));
        summaryPanel.add(lblSummary);
        mainPanel.add(summaryPanel, BorderLayout.SOUTH);

        add(mainPanel);
    }
    
    private void setAutoDates() {
        LocalDate[] dates = laporanService.getAutoDateRange();
        txtStartDate.setText(dates[0].toString());
        txtEndDate.setText(dates[1].toString());
        System.out.println("📅 Auto-set dates: " + dates[0] + " to " + dates[1]);
    }

    private void setDateToday() {
        LocalDate today = LocalDate.now();
        txtStartDate.setText(today.toString());
        txtEndDate.setText(today.toString());
        updateLaporan();
    }

    private void setDateLast7Days() {
        LocalDate endDate = LocalDate.now();
        LocalDate startDate = endDate.minusDays(6);
        txtStartDate.setText(startDate.toString());
        txtEndDate.setText(endDate.toString());
        updateLaporan();
    }

    private void setDateThisMonth() {
        LocalDate now = LocalDate.now();
        LocalDate startDate = LocalDate.of(now.getYear(), now.getMonth(), 1);
        LocalDate endDate = now;
        txtStartDate.setText(startDate.toString());
        txtEndDate.setText(endDate.toString());
        updateLaporan();
    }
    
    private void debugData() {
        try {
            LocalDate startDate = LocalDate.parse(txtStartDate.getText());
            LocalDate endDate = LocalDate.parse(txtEndDate.getText());
            
            Map<String, Object> debugInfo = laporanService.getDebugInfo(startDate, endDate);
            
            StringBuilder debug = new StringBuilder();
            debug.append("🔍 DEBUG INFO - LAPORAN\n");
            debug.append("=======================\n");
            debug.append("Periode: ").append(startDate).append(" to ").append(endDate).append("\n\n");
            debug.append("📊 DATA TRANSAKSI:\n");
            debug.append("Total Pesanan: ").append(debugInfo.get("total_pesanan")).append("\n");
            debug.append("Total Pendapatan: Rp ").append(String.format("%,.0f", debugInfo.get("total_pendapatan"))).append("\n");
            debug.append("Tanggal Awal: ").append(debugInfo.get("tanggal_awal")).append("\n");
            debug.append("Tanggal Akhir: ").append(debugInfo.get("tanggal_akhir")).append("\n");
            debug.append("Status yang ada: ").append(debugInfo.get("status_list")).append("\n\n");
            debug.append("💡 Tips: Jika data tidak muncul, coba:\n");
            debug.append("- Perlebar range tanggal\n");
            debug.append("- Cek status transaksi di database\n");
            debug.append("- Gunakan tombol '7 Hari Terakhir'\n");
            
            JOptionPane.showMessageDialog(this, debug.toString(), "Debug Info", 
                JOptionPane.INFORMATION_MESSAGE);
            
        } catch (Exception ex) {
            JOptionPane.showMessageDialog(this, 
                "Error debug: " + ex.getMessage() + "\nPastikan format tanggal: YYYY-MM-DD", 
                "Debug Error", JOptionPane.ERROR_MESSAGE);
        }
    }

    private void updateLaporan() {
        try {
            LocalDate startDate = LocalDate.parse(txtStartDate.getText());
            LocalDate endDate = LocalDate.parse(txtEndDate.getText());

            if (startDate.isAfter(endDate)) {
                JOptionPane.showMessageDialog(this, 
                    "❌ Tanggal mulai tidak boleh setelah tanggal akhir!", 
                    "Error", JOptionPane.ERROR_MESSAGE);
                return;
            }

            String jenisLaporan = (String) comboJenisLaporan.getSelectedItem();
            switch (jenisLaporan) {
                case "Pendapatan Harian":
                    loadLaporanHarian(startDate, endDate);
                    break;
                case "Menu Terlaris":
                    loadMenuTerlaris(startDate, endDate);
                    break;
                case "Transaksi per Kasir":
                    loadTransaksiPerKasir(startDate, endDate);
                    break;
                case "Kategori Terlaris":
                    loadKategoriTerlaris(startDate, endDate);
                    break;
            }

        } catch (Exception e) {
            JOptionPane.showMessageDialog(this, 
                "❌ Format tanggal tidak valid!\n\nGunakan format: YYYY-MM-DD\nContoh: 2024-01-15\n\n" +
                "Tips: Gunakan tombol 'Hari Ini', '7 Hari', atau 'Bulan Ini' untuk input otomatis.",
                "Error Format Tanggal", JOptionPane.ERROR_MESSAGE);
        }
    }

    private void loadLaporanHarian() {
        LocalDate startDate = LocalDate.parse(txtStartDate.getText());
        LocalDate endDate = LocalDate.parse(txtEndDate.getText());
        loadLaporanHarian(startDate, endDate);
    }

    private void loadLaporanHarian(LocalDate startDate, LocalDate endDate) {
        Map<LocalDate, Double> data = laporanService.getPendapatanHarian(startDate, endDate);

        // Setup table
        String[] columns = {"Tanggal", "Pendapatan"};
        tableModel.setColumnIdentifiers(columns);
        tableModel.setRowCount(0);

        double totalSemua = 0;
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("dd/MM/yyyy");

        for (Map.Entry<LocalDate, Double> entry : data.entrySet()) {
            String tanggal = entry.getKey().format(formatter);
            double pendapatan = entry.getValue();
            totalSemua += pendapatan;

            Object[] row = {
                tanggal,
                laporanService.formatCurrency(pendapatan)
            };
            tableModel.addRow(row);
        }

        // Update summary
        lblSummary.setText(String.format(
            "📈 Laporan Pendapatan Harian | Periode: %s - %s | Total: %s | %d hari",
            startDate.format(formatter), endDate.format(formatter), 
            laporanService.formatCurrency(totalSemua), data.size()
        ));
    }

    private void loadMenuTerlaris(LocalDate startDate, LocalDate endDate) {
        List<Map<String, Object>> data = laporanService.getMenuTerlaris(startDate, endDate);

        String[] columns = {"Nama Menu", "Kategori", "Terjual (pcs)", "Total Pendapatan"};
        tableModel.setColumnIdentifiers(columns);
        tableModel.setRowCount(0);

        double totalPendapatan = 0;
        int totalTerjual = 0;

        for (Map<String, Object> menu : data) {
            int terjual = (Integer) menu.get("total_terjual");
            double pendapatan = (Double) menu.get("total_pendapatan");
            
            totalTerjual += terjual;
            totalPendapatan += pendapatan;

            Object[] row = {
                menu.get("nama_menu"),
                menu.get("kategori"),
                String.format("%,d", terjual),
                laporanService.formatCurrency(pendapatan)
            };
            tableModel.addRow(row);
        }

        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("dd/MM/yyyy");
        lblSummary.setText(String.format(
            "🍽️ Menu Terlaris | Periode: %s - %s | Total Terjual: %,d pcs | Total Pendapatan: %s",
            startDate.format(formatter), endDate.format(formatter), 
            totalTerjual, laporanService.formatCurrency(totalPendapatan)
        ));
    }

    private void loadTransaksiPerKasir(LocalDate startDate, LocalDate endDate) {
        List<Map<String, Object>> data = laporanService.getTransaksiPerKasir(startDate, endDate);

        String[] columns = {"Nama Kasir", "Total Transaksi", "Total Pendapatan"};
        tableModel.setColumnIdentifiers(columns);
        tableModel.setRowCount(0);

        int totalAllTransaksi = 0;
        double totalAllPendapatan = 0;

        for (Map<String, Object> kasir : data) {
            int transaksi = (Integer) kasir.get("total_transaksi");
            double pendapatan = (Double) kasir.get("total_pendapatan");
            
            totalAllTransaksi += transaksi;
            totalAllPendapatan += pendapatan;

            Object[] row = {
                kasir.get("nama_pengguna"),
                String.format("%,d transaksi", transaksi),
                laporanService.formatCurrency(pendapatan)
            };
            tableModel.addRow(row);
        }

        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("dd/MM/yyyy");
        lblSummary.setText(String.format(
            "👥 Performa Kasir | Periode: %s - %s | Total Semua Transaksi: %,d | Total Pendapatan: %s",
            startDate.format(formatter), endDate.format(formatter), 
            totalAllTransaksi, laporanService.formatCurrency(totalAllPendapatan)
        ));
    }

    private void loadKategoriTerlaris(LocalDate startDate, LocalDate endDate) {
        List<Map<String, Object>> data = laporanService.getKategoriTerlaris(startDate, endDate);

        String[] columns = {"Kategori", "Terjual (pcs)", "Total Pendapatan"};
        tableModel.setColumnIdentifiers(columns);
        tableModel.setRowCount(0);

        int totalTerjual = 0;
        double totalPendapatan = 0;

        for (Map<String, Object> kategori : data) {
            int terjual = (Integer) kategori.get("total_terjual");
            double pendapatan = (Double) kategori.get("total_pendapatan");
            
            totalTerjual += terjual;
            totalPendapatan += pendapatan;

            Object[] row = {
                kategori.get("kategori"),
                String.format("%,d pcs", terjual),
                laporanService.formatCurrency(pendapatan)
            };
            tableModel.addRow(row);
        }

        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("dd/MM/yyyy");
        lblSummary.setText(String.format(
            "📦 Kategori Terlaris | Periode: %s - %s | Total Terjual: %,d pcs | Total Pendapatan: %s",
            startDate.format(formatter), endDate.format(formatter), 
            totalTerjual, laporanService.formatCurrency(totalPendapatan)
        ));
    }

    private void exportToCSV() {
        JFileChooser fileChooser = new JFileChooser();
        fileChooser.setDialogTitle("Simpan Laporan sebagai CSV");
        fileChooser.setSelectedFile(new java.io.File("laporan_cafe.csv"));
        
        if (fileChooser.showSaveDialog(this) == JFileChooser.APPROVE_OPTION) {
            try {
                java.io.File file = fileChooser.getSelectedFile();
                if (!file.getName().toLowerCase().endsWith(".csv")) {
                    file = new java.io.File(file.getAbsolutePath() + ".csv");
                }
                
                java.io.PrintWriter writer = new java.io.PrintWriter(file);
                
                // Write header
                int colCount = tableModel.getColumnCount();
                for (int i = 0; i < colCount; i++) {
                    writer.print(tableModel.getColumnName(i));
                    if (i < colCount - 1) writer.print(",");
                }
                writer.println();
                
                // Write data
                int rowCount = tableModel.getRowCount();
                for (int i = 0; i < rowCount; i++) {
                    for (int j = 0; j < colCount; j++) {
                        String value = tableModel.getValueAt(i, j).toString();
                        writer.print(value);
                        if (j < colCount - 1) writer.print(",");
                    }
                    writer.println();
                }
                
                writer.close();
                JOptionPane.showMessageDialog(this, 
                    "✅ Laporan berhasil diexport ke: " + file.getAbsolutePath(),
                    "Export Berhasil", JOptionPane.INFORMATION_MESSAGE);
                    
            } catch (Exception e) {
                JOptionPane.showMessageDialog(this,
                    "❌ Gagal export: " + e.getMessage(),
                    "Error Export", JOptionPane.ERROR_MESSAGE);
            }
        }
    }

    // TEST METHOD
    public static void main(String[] args) {
        SwingUtilities.invokeLater(() -> {
            new LaporanForm().setVisible(true);
        });
    }
}