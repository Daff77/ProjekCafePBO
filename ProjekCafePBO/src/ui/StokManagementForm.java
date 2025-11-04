package ui;

/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
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

public class StokManagementForm extends JFrame {

    private MenuService menuService;
    private JTable tableMenu;
    private DefaultTableModel tableModel;

    public StokManagementForm(MenuService menuService) {
        this.menuService = menuService;
        initUI();
        loadDataMenu();
    }

    private void initUI() {
        setTitle("Kelola Stok Menu - Cafe Management System");
        setDefaultCloseOperation(JFrame.DISPOSE_ON_CLOSE);
        setSize(900, 600);
        setLocationRelativeTo(null);

        // Main panel
        JPanel mainPanel = new JPanel(new BorderLayout());
        mainPanel.setBorder(BorderFactory.createEmptyBorder(10, 10, 10, 10));

        // Title
        JLabel lblTitle = new JLabel("📦 KELOLA STOK MENU", JLabel.CENTER);
        lblTitle.setFont(new Font("Arial", Font.BOLD, 18));
        lblTitle.setBorder(BorderFactory.createEmptyBorder(10, 0, 10, 0));
        mainPanel.add(lblTitle, BorderLayout.NORTH);

        // Panel tombol aksi
        JPanel buttonPanel = new JPanel(new FlowLayout());

        JButton btnTambahStok = new JButton("📥 Tambah Stok");
        btnTambahStok.setBackground(new Color(60, 179, 113));
        btnTambahStok.setForeground(Color.WHITE);
        btnTambahStok.addActionListener(e -> tambahStok());

        JButton btnKurangiStok = new JButton("📤 Kurangi Stok");
        btnKurangiStok.setBackground(new Color(255, 140, 0));
        btnKurangiStok.setForeground(Color.WHITE);
        btnKurangiStok.addActionListener(e -> kurangiStok());

        JButton btnSetStok = new JButton("⚙️ Set Stok Manual");
        btnSetStok.setBackground(new Color(70, 130, 180));
        btnSetStok.setForeground(Color.WHITE);
        btnSetStok.addActionListener(e -> setStokManual());

        JButton btnRefresh = new JButton("🔄 Refresh");
        btnRefresh.addActionListener(e -> loadDataMenu());

        JButton btnTutup = new JButton("Tutup");
        btnTutup.addActionListener(e -> dispose());

        buttonPanel.add(btnTambahStok);
        buttonPanel.add(btnKurangiStok);
        buttonPanel.add(btnSetStok);
        buttonPanel.add(btnRefresh);
        buttonPanel.add(btnTutup);

        mainPanel.add(buttonPanel, BorderLayout.NORTH);

        // Table untuk menu dengan stok
        String[] columnNames = {"ID", "Nama Menu", "Harga", "Kategori", "Stok", "Status"};
        tableModel = new DefaultTableModel(columnNames, 0) {
            @Override
            public boolean isCellEditable(int row, int column) {
                return false;
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
        tableMenu.getColumnModel().getColumn(5).setPreferredWidth(100); // Status

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
        String status = getStatusStok(menu.getStok());
        if (status.equals("HABIS")) stokHabis++;
        if (status.equals("SEDIKIT")) stokSedikit++;

        Object[] rowData = {
            menu.getIdMenu(),
            menu.getNamaMenu(),
            menuService.formatHarga(menu.getHarga()), // ✅ PAKAI FORMAT HARGA
            menu.getKategori(),
            menu.getStok(),
            status
        };
        tableModel.addRow(rowData);
    }

    // Update info
    updateInfoLabel(menuList.size(), stokHabis, stokSedikit);
    System.out.println("✅ Loaded " + menuList.size() + " menu items for stok management");
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

    private void tambahStok() {
        int selectedRow = tableMenu.getSelectedRow();
        if (selectedRow == -1) {
            JOptionPane.showMessageDialog(this, "Pilih menu yang akan ditambah stok!");
            return;
        }

        String idMenu = (String) tableModel.getValueAt(selectedRow, 0);
        String namaMenu = (String) tableModel.getValueAt(selectedRow, 1);
        int stokSekarang = (Integer) tableModel.getValueAt(selectedRow, 4);

        String input = JOptionPane.showInputDialog(this,
                "Tambah stok untuk: " + namaMenu + "\nStok sekarang: " + stokSekarang + "\nJumlah tambahan:", "0");

        if (input != null && !input.trim().isEmpty()) {
            try {
                int tambahan = Integer.parseInt(input.trim());
                if (tambahan <= 0) {
                    JOptionPane.showMessageDialog(this, "Jumlah tambahan harus lebih dari 0!");
                    return;
                }

                int stokBaru = stokSekarang + tambahan;

                System.out.println("🎯 STOK FORM: Memanggil updateStok...");
                System.out.println("   ID: " + idMenu);
                System.out.println("   Stok Baru: " + stokBaru);

                // ✅ PASTIKAN panggil updateStok, BUKAN updateMenu
                boolean success = menuService.updateStok(idMenu, stokBaru);

                if (success) {
                    JOptionPane.showMessageDialog(this,
                            "✅ Stok " + namaMenu + " berhasil ditambah!\nStok sekarang: " + stokBaru);
                    loadDataMenu();
                } else {
                    JOptionPane.showMessageDialog(this, "❌ Gagal menambah stok!");
                }

            } catch (NumberFormatException e) {
                JOptionPane.showMessageDialog(this, "Jumlah harus angka!");
            }
        }
    }

    private void kurangiStok() {
        int selectedRow = tableMenu.getSelectedRow();
        if (selectedRow == -1) {
            JOptionPane.showMessageDialog(this, "Pilih menu yang akan dikurangi stok!");
            return;
        }

        String idMenu = (String) tableModel.getValueAt(selectedRow, 0);
        String namaMenu = (String) tableModel.getValueAt(selectedRow, 1);
        int stokSekarang = (Integer) tableModel.getValueAt(selectedRow, 4);

        String input = JOptionPane.showInputDialog(this,
                "Kurangi stok untuk: " + namaMenu + "\nStok sekarang: " + stokSekarang + "\nJumlah pengurangan:", "0");

        if (input != null && !input.trim().isEmpty()) {
            try {
                int pengurangan = Integer.parseInt(input.trim());
                if (pengurangan <= 0) {
                    JOptionPane.showMessageDialog(this, "Jumlah pengurangan harus lebih dari 0!");
                    return;
                }

                if (pengurangan > stokSekarang) {
                    JOptionPane.showMessageDialog(this,
                            "Pengurangan tidak boleh melebihi stok yang ada!\nStok sekarang: " + stokSekarang);
                    return;
                }

                int stokBaru = stokSekarang - pengurangan;
                boolean success = menuService.updateStok(idMenu, stokBaru);

                if (success) {
                    JOptionPane.showMessageDialog(this,
                            "Stok " + namaMenu + " berhasil dikurangi!\nStok sekarang: " + stokBaru);
                    loadDataMenu();
                } else {
                    JOptionPane.showMessageDialog(this, "Gagal mengurangi stok!");
                }

            } catch (NumberFormatException e) {
                JOptionPane.showMessageDialog(this, "Jumlah harus angka!");
            }
        }
    }

    private void setStokManual() {
        int selectedRow = tableMenu.getSelectedRow();
        if (selectedRow == -1) {
            JOptionPane.showMessageDialog(this, "Pilih menu yang akan di-set stok!");
            return;
        }

        String idMenu = (String) tableModel.getValueAt(selectedRow, 0);
        String namaMenu = (String) tableModel.getValueAt(selectedRow, 1);
        int stokSekarang = (Integer) tableModel.getValueAt(selectedRow, 4);

        String input = JOptionPane.showInputDialog(this,
                "Set stok manual untuk: " + namaMenu + "\nStok sekarang: " + stokSekarang + "\nStok baru:", String.valueOf(stokSekarang));

        if (input != null && !input.trim().isEmpty()) {
            try {
                int stokBaru = Integer.parseInt(input.trim());
                if (stokBaru < 0) {
                    JOptionPane.showMessageDialog(this, "Stok tidak boleh negatif!");
                    return;
                }

                // PERBAIKAN: Pastikan panggil updateStok, bukan updateMenu
                boolean success = menuService.updateStok(idMenu, stokBaru);

                if (success) {
                    JOptionPane.showMessageDialog(this,
                            "Stok " + namaMenu + " berhasil di-set!\nStok baru: " + stokBaru);
                    loadDataMenu();
                } else {
                    JOptionPane.showMessageDialog(this, "Gagal meng-set stok!");
                }

            } catch (NumberFormatException e) {
                JOptionPane.showMessageDialog(this, "Stok harus angka!");
            }
        }
    }

    // TEST METHOD
    public static void main(String[] args) {
        SwingUtilities.invokeLater(() -> {
            MenuService menuService = new MenuService();
            new StokManagementForm(menuService).setVisible(true);
        });
    }
}
