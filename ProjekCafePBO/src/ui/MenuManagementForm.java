/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package ui;

/**
 *
 * @author Daffa Danendra
 */
import service.MenuService;
import model.Menu;
import javax.swing.*;
import javax.swing.table.DefaultTableModel;
import java.awt.*;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;
import java.util.List;

public class MenuManagementForm extends JFrame {

    private MenuService menuService;
    private JTable tableMenu;
    private DefaultTableModel tableModel;
    private JTextField txtCari;

    public MenuManagementForm(MenuService menuService) {
        this.menuService = menuService;
        initUI();
        loadDataMenu();
    }

    private void initUI() {
        setTitle("Kelola Menu - Cafe Management System");
        setDefaultCloseOperation(JFrame.DISPOSE_ON_CLOSE);
        setSize(900, 600); // Diperbesar untuk kolom tambahan
        setLocationRelativeTo(null);

        // Main panel
        JPanel mainPanel = new JPanel(new BorderLayout());
        mainPanel.setBorder(BorderFactory.createEmptyBorder(10, 10, 10, 10));

        // Title
        JLabel lblTitle = new JLabel("🍽️ KELOLA MENU", JLabel.CENTER);
        lblTitle.setFont(new Font("Arial", Font.BOLD, 18));
        lblTitle.setBorder(BorderFactory.createEmptyBorder(10, 0, 10, 0));
        mainPanel.add(lblTitle, BorderLayout.NORTH);

        // Panel untuk pencarian dan tombol
        JPanel topPanel = new JPanel(new BorderLayout(10, 10));

        // Panel pencarian
        JPanel searchPanel = new JPanel(new FlowLayout(FlowLayout.LEFT));
        searchPanel.add(new JLabel("Cari:"));
        txtCari = new JTextField(20);
        searchPanel.add(txtCari);

        JButton btnCari = new JButton("🔍 Cari");
        btnCari.addActionListener(e -> cariMenu());
        searchPanel.add(btnCari);

        // Panel tombol aksi
        JPanel buttonPanel = new JPanel(new FlowLayout(FlowLayout.RIGHT));

        JButton btnTambah = new JButton("➕ Tambah Menu");
        btnTambah.setBackground(new Color(60, 179, 113));
        btnTambah.setForeground(Color.WHITE);
        btnTambah.addActionListener(e -> tambahMenu());

        JButton btnEdit = new JButton("✏️ Edit Menu");
        btnEdit.setBackground(new Color(255, 140, 0));
        btnEdit.setForeground(Color.WHITE);
        btnEdit.addActionListener(e -> editMenu());

        JButton btnHapus = new JButton("❌ Hapus Menu");
        btnHapus.setBackground(new Color(220, 20, 60));
        btnHapus.setForeground(Color.WHITE);
        btnHapus.addActionListener(e -> hapusMenu());

        JButton btnRefresh = new JButton("🔄 Refresh");
        btnRefresh.addActionListener(e -> loadDataMenu());

        JButton btnTutup = new JButton("Tutup");
        btnTutup.addActionListener(e -> dispose());

        buttonPanel.add(btnTambah);
        buttonPanel.add(btnEdit);
        buttonPanel.add(btnHapus);
        buttonPanel.add(btnRefresh);
        buttonPanel.add(btnTutup);

        topPanel.add(searchPanel, BorderLayout.WEST);
        topPanel.add(buttonPanel, BorderLayout.EAST);

        mainPanel.add(topPanel, BorderLayout.NORTH);

        // Table untuk menu - TAMBAH KOLOM STOK
        String[] columnNames = {"ID", "Nama Menu", "Harga", "Kategori", "Stok", "Status Stok"};
        tableModel = new DefaultTableModel(columnNames, 0) {
            @Override
            public boolean isCellEditable(int row, int column) {
                return false; // Table tidak bisa diedit langsung
            }

            @Override
            public Class<?> getColumnClass(int column) {
                if (column == 4) {
                    return Integer.class; // Kolom stok sebagai Integer
                }
                return String.class;
            }
        };

        tableMenu = new JTable(tableModel);
        tableMenu.setSelectionMode(ListSelectionModel.SINGLE_SELECTION);
        tableMenu.setRowHeight(25);
        tableMenu.getTableHeader().setFont(new Font("Arial", Font.BOLD, 12));

        // Set column widths
        tableMenu.getColumnModel().getColumn(0).setPreferredWidth(80);  // ID
        tableMenu.getColumnModel().getColumn(1).setPreferredWidth(200); // Nama Menu
        tableMenu.getColumnModel().getColumn(2).setPreferredWidth(100); // Harga
        tableMenu.getColumnModel().getColumn(3).setPreferredWidth(150); // Kategori
        tableMenu.getColumnModel().getColumn(4).setPreferredWidth(80);  // Stok
        tableMenu.getColumnModel().getColumn(5).setPreferredWidth(100); // Status Stok

        JScrollPane scrollPane = new JScrollPane(tableMenu);
        mainPanel.add(scrollPane, BorderLayout.CENTER);

        // Panel info
        JPanel infoPanel = new JPanel(new FlowLayout(FlowLayout.LEFT));
        JLabel lblInfo = new JLabel("Total menu: 0 | Stok Habis: 0 | Stok Sedikit: 0");
        lblInfo.setFont(new Font("Arial", Font.PLAIN, 12));
        infoPanel.add(lblInfo);
        mainPanel.add(infoPanel, BorderLayout.SOUTH);

        add(mainPanel);
    }

    private void loadDataMenu() {
        tableModel.setRowCount(0);
        List<Menu> menuList = menuService.getAllMenu();

        int stokHabis = 0;
        int stokSedikit = 0;

        for (Menu menu : menuList) {
            String statusStok = getStatusStok(menu.getStok());
            if (statusStok.equals("HABIS")) {
                stokHabis++;
            }
            if (statusStok.equals("SEDIKIT")) {
                stokSedikit++;
            }

            Object[] rowData = {
                menu.getIdMenu(),
                menu.getNamaMenu(),
                menuService.formatHarga(menu.getHarga()), 
                menu.getKategori(),
                menu.getStok(),
                getStatusStok(menu.getStok())
            };
            tableModel.addRow(rowData);
        }

        // Update info
        updateInfoLabel(menuList.size(), stokHabis, stokSedikit);

        System.out.println("✅ Loaded " + menuList.size() + " menu items");
    }

    private String getStatusStok(int stok) {
        if (stok == 0) {
            return "HABIS";
        }
        if (stok <= 10) {
            return "SEDIKIT";
        }
        if (stok <= 20) {
            return "CUKUP";
        }
        return "BAIK";
    }

    private void updateInfoLabel(int totalMenu, int stokHabis, int stokSedikit) {
        Component[] components = ((JPanel) getContentPane().getComponent(0)).getComponents();
        for (Component comp : components) {
            if (comp instanceof JPanel) {
                JPanel panel = (JPanel) comp;
                if (panel.getComponentCount() > 0 && panel.getComponent(0) instanceof JLabel) {
                    JLabel label = (JLabel) panel.getComponent(0);
                    label.setText("Total menu: " + totalMenu + " | Stok Habis: " + stokHabis + " | Stok Sedikit: " + stokSedikit);
                    break;
                }
            }
        }
    }

    private void cariMenu() {
        String keyword = txtCari.getText().trim();
        if (keyword.isEmpty()) {
            loadDataMenu();
            return;
        }

        tableModel.setRowCount(0);
        List<Menu> hasilPencarian = menuService.cariMenu(keyword);

        int stokHabis = 0;
        int stokSedikit = 0;

        for (Menu menu : hasilPencarian) {
            String statusStok = getStatusStok(menu.getStok());
            if (statusStok.equals("HABIS")) {
                stokHabis++;
            }
            if (statusStok.equals("SEDIKIT")) {
                stokSedikit++;
            }

            Object[] rowData = {
                menu.getIdMenu(),
                menu.getNamaMenu(),
                "Rp " + String.format("%,.0f", menu.getHarga()),
                menu.getKategori(),
                menu.getStok(),
                statusStok
            };
            tableModel.addRow(rowData);
        }

        updateInfoLabel(hasilPencarian.size(), stokHabis, stokSedikit);
        System.out.println("🔍 Found " + hasilPencarian.size() + " menu matching: " + keyword);
    }

    private void tambahMenu() {
        // Form untuk tambah menu baru
        JPanel panel = new JPanel(new GridLayout(0, 2, 10, 10));

        JTextField txtNama = new JTextField();
        JTextField txtHarga = new JTextField();
        JTextField txtKategori = new JTextField();
        JTextField txtStok = new JTextField("0"); // DEFAULT STOK 0

        panel.add(new JLabel("Nama Menu:"));
        panel.add(txtNama);
        panel.add(new JLabel("Harga:"));
        panel.add(txtHarga);
        panel.add(new JLabel("Kategori:"));
        panel.add(txtKategori);
        panel.add(new JLabel("Stok Awal:"));
        panel.add(txtStok);

        // Contoh kategori dan stok
        panel.add(new JLabel("Contoh kategori:"));
        panel.add(new JLabel("Makanan, Minuman, Snack, Dessert"));
        panel.add(new JLabel("Contoh stok:"));
        panel.add(new JLabel("0 (habis), 10 (sedikit), 50 (baik)"));

        int result = JOptionPane.showConfirmDialog(
                this,
                panel,
                "Tambah Menu Baru",
                JOptionPane.OK_CANCEL_OPTION,
                JOptionPane.PLAIN_MESSAGE
        );

        if (result == JOptionPane.OK_OPTION) {
            String nama = txtNama.getText().trim();
            String hargaText = txtHarga.getText().trim();
            String kategori = txtKategori.getText().trim();
            String stokText = txtStok.getText().trim();

            // Validasi input
            if (nama.isEmpty() || hargaText.isEmpty() || kategori.isEmpty() || stokText.isEmpty()) {
                JOptionPane.showMessageDialog(this,
                        "Semua field harus diisi!", "Error", JOptionPane.ERROR_MESSAGE);
                return;
            }

            try {
                double harga = Double.parseDouble(hargaText);
                int stok = Integer.parseInt(stokText);

                if (harga <= 0) {
                    JOptionPane.showMessageDialog(this,
                            "Harga harus lebih dari 0!", "Error", JOptionPane.ERROR_MESSAGE);
                    return;
                }

                if (stok < 0) {
                    JOptionPane.showMessageDialog(this,
                            "Stok tidak boleh negatif!", "Error", JOptionPane.ERROR_MESSAGE);
                    return;
                }

                boolean success = menuService.tambahMenu(nama, harga, kategori, stok);
                if (success) {
                    JOptionPane.showMessageDialog(this,
                            "Menu '" + nama + "' berhasil ditambahkan!\nStok: " + stok,
                            "Success", JOptionPane.INFORMATION_MESSAGE);
                    loadDataMenu(); // Refresh table
                } else {
                    JOptionPane.showMessageDialog(this,
                            "Gagal menambahkan menu!", "Error", JOptionPane.ERROR_MESSAGE);
                }

            } catch (NumberFormatException e) {
                JOptionPane.showMessageDialog(this,
                        "Harga dan stok harus berupa angka!", "Error", JOptionPane.ERROR_MESSAGE);
            }
        }
    }

    private void editMenu() {
        int selectedRow = tableMenu.getSelectedRow();
        if (selectedRow == -1) {
            JOptionPane.showMessageDialog(this, "Pilih menu yang akan diedit!", "Peringatan", JOptionPane.WARNING_MESSAGE);
            return;
        }

        String idMenu = (String) tableModel.getValueAt(selectedRow, 0);
        String namaMenu = (String) tableModel.getValueAt(selectedRow, 1);
        String hargaText = ((String) tableModel.getValueAt(selectedRow, 2)).replace("Rp ", "").replace(",", "");
        String kategori = (String) tableModel.getValueAt(selectedRow, 3);
        int stok = (Integer) tableModel.getValueAt(selectedRow, 4);

        // Form untuk edit menu
        JPanel panel = new JPanel(new GridLayout(0, 2, 10, 10));

        JTextField txtNama = new JTextField(namaMenu);
        JTextField txtHarga = new JTextField(hargaText);
        JTextField txtKategori = new JTextField(kategori);
        JTextField txtStok = new JTextField(String.valueOf(stok));

        panel.add(new JLabel("Nama Menu:"));
        panel.add(txtNama);
        panel.add(new JLabel("Harga:"));
        panel.add(txtHarga);
        panel.add(new JLabel("Kategori:"));
        panel.add(txtKategori);
        panel.add(new JLabel("Stok:"));
        panel.add(txtStok);

        int result = JOptionPane.showConfirmDialog(
                this,
                panel,
                "Edit Menu: " + namaMenu,
                JOptionPane.OK_CANCEL_OPTION,
                JOptionPane.PLAIN_MESSAGE
        );

        if (result == JOptionPane.OK_OPTION) {
            String namaBaru = txtNama.getText().trim();
            String hargaTextBaru = txtHarga.getText().trim();
            String kategoriBaru = txtKategori.getText().trim();
            String stokTextBaru = txtStok.getText().trim();

            // Validasi
            if (namaBaru.isEmpty() || hargaTextBaru.isEmpty() || kategoriBaru.isEmpty() || stokTextBaru.isEmpty()) {
                JOptionPane.showMessageDialog(this, "Semua field harus diisi!", "Error", JOptionPane.ERROR_MESSAGE);
                return;
            }

            try {
                double hargaBaru = Double.parseDouble(hargaTextBaru);
                int stokBaru = Integer.parseInt(stokTextBaru);

                if (hargaBaru <= 0) {
                    JOptionPane.showMessageDialog(this, "Harga harus lebih dari 0!", "Error", JOptionPane.ERROR_MESSAGE);
                    return;
                }

                if (stokBaru < 0) {
                    JOptionPane.showMessageDialog(this, "Stok tidak boleh negatif!", "Error", JOptionPane.ERROR_MESSAGE);
                    return;
                }

                System.out.println("🎯 MENU MANAGEMENT FORM: Memanggil updateMenuData...");

                // ✅ Untuk edit data menu, panggil updateMenuData
                boolean success = menuService.updateMenuData(idMenu, namaBaru, hargaBaru, kategoriBaru);

                if (success) {
                    // ✅ Untuk update stok, panggil updateStok secara terpisah
                    boolean successStok = menuService.updateStok(idMenu, stokBaru);

                    if (successStok) {
                        JOptionPane.showMessageDialog(this,
                                "✅ Menu '" + namaBaru + "' berhasil diupdate!\nStok: " + stokBaru,
                                "Success", JOptionPane.INFORMATION_MESSAGE);
                        loadDataMenu();
                    } else {
                        JOptionPane.showMessageDialog(this,
                                "⚠️ Data menu berhasil diupdate, tapi gagal update stok!",
                                "Warning", JOptionPane.WARNING_MESSAGE);
                        loadDataMenu();
                    }
                } else {
                    JOptionPane.showMessageDialog(this, "❌ Gagal mengupdate menu!", "Error", JOptionPane.ERROR_MESSAGE);
                }

            } catch (NumberFormatException e) {
                JOptionPane.showMessageDialog(this, "Harga dan stok harus berupa angka!", "Error", JOptionPane.ERROR_MESSAGE);
            }
        }
    }

    private void hapusMenu() {
        int selectedRow = tableMenu.getSelectedRow();
        if (selectedRow == -1) {
            JOptionPane.showMessageDialog(this,
                    "Pilih menu yang akan dihapus!", "Peringatan", JOptionPane.WARNING_MESSAGE);
            return;
        }

        String idMenu = (String) tableModel.getValueAt(selectedRow, 0);
        String namaMenu = (String) tableModel.getValueAt(selectedRow, 1);

        int confirm = JOptionPane.showConfirmDialog(
                this,
                "Yakin ingin menghapus menu '" + namaMenu + "'?",
                "Konfirmasi Hapus",
                JOptionPane.YES_NO_OPTION,
                JOptionPane.WARNING_MESSAGE
        );

        if (confirm == JOptionPane.YES_OPTION) {
            boolean success = menuService.deleteMenu(idMenu);
            if (success) {
                JOptionPane.showMessageDialog(this,
                        "Menu '" + namaMenu + "' berhasil dihapus!",
                        "Success", JOptionPane.INFORMATION_MESSAGE);
                loadDataMenu(); // Refresh table
            } else {
                JOptionPane.showMessageDialog(this,
                        "Gagal menghapus menu! Menu mungkin sedang digunakan dalam transaksi.",
                        "Error", JOptionPane.ERROR_MESSAGE);
            }
        }
    }

    // TEST METHOD
    public static void main(String[] args) {
        SwingUtilities.invokeLater(() -> {
            MenuService menuService = new MenuService();
            new MenuManagementForm(menuService).setVisible(true);
        });
    }
}
