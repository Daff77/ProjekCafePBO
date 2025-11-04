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
import java.util.List;

public class MenuForm extends JFrame {

    private MenuService menuService;
    private boolean isAdmin;
    private JTable tableMenu;
    private DefaultTableModel tableModel;

    // CONSTRUCTOR BARU yang menerima parameter
    public MenuForm(MenuService menuService, boolean isAdmin) {
        this.menuService = menuService;
        this.isAdmin = isAdmin;
        initUI();
        loadDataMenu();
    }

    // CONSTRUCTOR LAMA (default)
    public MenuForm() {
        this.menuService = new MenuService();
        this.isAdmin = false; // Default bukan admin
        initUI();
        loadDataMenu();
    }

    private void initUI() {
        setTitle("Daftar Menu - Cafe Management System");
        setDefaultCloseOperation(JFrame.DISPOSE_ON_CLOSE);
        setSize(700, 500);
        setLocationRelativeTo(null);

        // Main panel
        JPanel mainPanel = new JPanel(new BorderLayout());
        mainPanel.setBorder(BorderFactory.createEmptyBorder(10, 10, 10, 10));

        // Title dengan info role
        String roleInfo = isAdmin ? " (Admin Mode)" : " (Kasir Mode)";
        JLabel lblTitle = new JLabel("📋 DAFTAR MENU" + roleInfo, JLabel.CENTER);
        lblTitle.setFont(new Font("Arial", Font.BOLD, 18));
        lblTitle.setBorder(BorderFactory.createEmptyBorder(10, 0, 10, 0));
        mainPanel.add(lblTitle, BorderLayout.NORTH);

        // Table untuk menu
        String[] columnNames = {"ID Menu", "Nama Menu", "Harga", "Kategori"};
        tableModel = new DefaultTableModel(columnNames, 0) {
            @Override
            public boolean isCellEditable(int row, int column) {
                return false; // Table tidak bisa diedit
            }
        };

        tableMenu = new JTable(tableModel);
        tableMenu.setFont(new Font("Arial", Font.PLAIN, 12));
        tableMenu.setRowHeight(25);
        tableMenu.getTableHeader().setFont(new Font("Arial", Font.BOLD, 12));

        // Set column widths
        tableMenu.getColumnModel().getColumn(0).setPreferredWidth(100); // ID
        tableMenu.getColumnModel().getColumn(1).setPreferredWidth(200); // Nama
        tableMenu.getColumnModel().getColumn(2).setPreferredWidth(100); // Harga
        tableMenu.getColumnModel().getColumn(3).setPreferredWidth(150); // Kategori

        JScrollPane scrollPane = new JScrollPane(tableMenu);
        mainPanel.add(scrollPane, BorderLayout.CENTER);

        // Button panel
        JPanel buttonPanel = new JPanel(new FlowLayout());

        JButton btnRefresh = new JButton("Refresh");
        btnRefresh.addActionListener(e -> loadDataMenu());

        JButton btnTutup = new JButton("Tutup");
        btnTutup.addActionListener(e -> dispose());

        buttonPanel.add(btnRefresh);
        buttonPanel.add(btnTutup);

        // Tombol tambah menu hanya untuk admin
        if (isAdmin) {
            JButton btnTambah = new JButton("Tambah Menu");
            btnTambah.setBackground(new Color(60, 179, 113));
            btnTambah.setForeground(Color.WHITE);
            btnTambah.addActionListener(e -> tambahMenu());
            buttonPanel.add(btnTambah);
        }

        mainPanel.add(buttonPanel, BorderLayout.SOUTH);

        add(mainPanel);
    }

    private void loadDataMenu() {
        // Clear existing data
        tableModel.setRowCount(0);

        // Load data dari service
        List<Menu> menuList = menuService.getAllMenu();

        // Populate table
        for (Menu menu : menuList) {
            Object[] rowData = {
                menu.getIdMenu(),
                menu.getNamaMenu(),
                menuService.formatHarga(menu.getHarga()), 
                menu.getKategori()
            };
            tableModel.addRow(rowData);
        }

        // Update title dengan jumlah menu
        String roleInfo = isAdmin ? " (Admin Mode)" : " (Kasir Mode)";
        setTitle("Daftar Menu - " + menuList.size() + " items" + roleInfo);

        // Show summary
        System.out.println("✅ Loaded " + menuList.size() + " menu items");
    }

    private void tambahMenu() {
        // Form yang lebih baik dengan validasi
        JPanel panel = new JPanel(new GridLayout(0, 2, 10, 10));

        JTextField txtNama = new JTextField(20);
        JTextField txtHarga = new JTextField(10);
        JTextField txtKategori = new JTextField(15);

        panel.add(new JLabel("Nama Menu:"));
        panel.add(txtNama);
        panel.add(new JLabel("Harga:"));
        panel.add(txtHarga);
        panel.add(new JLabel("Kategori:"));
        panel.add(txtKategori);

        // Contoh kategori
        panel.add(new JLabel("Contoh kategori:"));
        panel.add(new JLabel("Makanan, Minuman, Snack"));

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

            // Validasi input
            if (nama.isEmpty()) {
                JOptionPane.showMessageDialog(this, "Nama menu harus diisi!", "Error", JOptionPane.ERROR_MESSAGE);
                return;
            }

            if (hargaText.isEmpty()) {
                JOptionPane.showMessageDialog(this, "Harga harus diisi!", "Error", JOptionPane.ERROR_MESSAGE);
                return;
            }

            if (kategori.isEmpty()) {
                JOptionPane.showMessageDialog(this, "Kategori harus diisi!", "Error", JOptionPane.ERROR_MESSAGE);
                return;
            }

            try {
                double harga = Double.parseDouble(hargaText);
                if (harga <= 0) {
                    JOptionPane.showMessageDialog(this, "Harga harus lebih dari 0!", "Error", JOptionPane.ERROR_MESSAGE);
                    return;
                }

                System.out.println("🔧 Mencoba menambah menu...");
                boolean success = menuService.tambahMenu(nama, harga, kategori);

                if (success) {
                    JOptionPane.showMessageDialog(this,
                            "Menu '" + nama + "' berhasil ditambahkan!",
                            "Sukses",
                            JOptionPane.INFORMATION_MESSAGE);
                    loadDataMenu(); // Refresh table
                } else {
                    JOptionPane.showMessageDialog(this,
                            "Gagal menambahkan menu. Cek console untuk detail error.",
                            "Error",
                            JOptionPane.ERROR_MESSAGE);
                }

            } catch (NumberFormatException e) {
                JOptionPane.showMessageDialog(this,
                        "Harga harus berupa angka!\nContoh: 10000",
                        "Error",
                        JOptionPane.ERROR_MESSAGE);
            }
        }
    }

    // TEST METHOD
    public static void main(String[] args) {
        SwingUtilities.invokeLater(new Runnable() {
            @Override
            public void run() {
                // Test sebagai admin
                MenuService menuService = new MenuService();
                new MenuForm(menuService, true).setVisible(true);
            }
        });
    }
}
