/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package ui;

/**
 *
 * @author Daffa Danendra
 */
import service.TransaksiService;
import service.MenuService;
import service.AuthService;
import model.Menu;
import model.DetailPesanan;
import javax.swing.*;
import javax.swing.table.DefaultTableModel;
import java.awt.*;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;

public class TransaksiForm extends JFrame {

    private TransaksiService transaksiService;
    private MenuService menuService;
    private AuthService authService;

    private JTable tableMenu;
    private JTable tableKeranjang;
    private DefaultTableModel modelMenu;
    private DefaultTableModel modelKeranjang;
    private JLabel lblTotal;
    private JLabel lblJumlahItem;

    public TransaksiForm(AuthService authService) {
        this.authService = authService;
        this.transaksiService = new TransaksiService();
        this.menuService = new MenuService();
        initUI();
        loadDataMenu();
        updateKeranjangDisplay();
    }

    private void initUI() {
        setTitle("Transaksi Penjualan - Cafe Management System");
        setDefaultCloseOperation(JFrame.DISPOSE_ON_CLOSE);
        setSize(1000, 700);
        setLocationRelativeTo(null);

        // Main panel dengan split pane
        JSplitPane splitPane = new JSplitPane(JSplitPane.HORIZONTAL_SPLIT);
        splitPane.setDividerLocation(600);
        splitPane.setResizeWeight(0.6);

        // Panel kiri - Daftar Menu
        JPanel leftPanel = new JPanel(new BorderLayout());
        leftPanel.setBorder(BorderFactory.createTitledBorder("📋 Daftar Menu"));

        // Table menu - SIMPLE VERSION tanpa button column
        String[] menuColumns = {"ID", "Nama Menu", "Harga", "Kategori"};
        modelMenu = new DefaultTableModel(menuColumns, 0) {
            @Override
            public boolean isCellEditable(int row, int column) {
                return false; // Table tidak bisa diedit
            }
        };

        tableMenu = new JTable(modelMenu);
        tableMenu.setRowHeight(30);
        tableMenu.getTableHeader().setFont(new Font("Arial", Font.BOLD, 12));

        // Panel untuk tombol tambah
        JPanel panelTambah = new JPanel(new FlowLayout());
        JButton btnTambah = new JButton("➕ Tambah ke Keranjang");
        btnTambah.setBackground(new Color(70, 130, 180));
        btnTambah.setForeground(Color.WHITE);
        btnTambah.setFont(new Font("Arial", Font.BOLD, 12));
        btnTambah.setFocusPainted(false);

        panelTambah.add(btnTambah);

        JScrollPane scrollMenu = new JScrollPane(tableMenu);
        leftPanel.add(scrollMenu, BorderLayout.CENTER);
        leftPanel.add(panelTambah, BorderLayout.SOUTH);

        // Panel kanan - Keranjang
        JPanel rightPanel = new JPanel(new BorderLayout());
        rightPanel.setBorder(BorderFactory.createTitledBorder("🛒 Keranjang Belanja"));

        // Table keranjang
        String[] keranjangColumns = {"Menu", "Harga", "Jumlah", "Subtotal"};
        modelKeranjang = new DefaultTableModel(keranjangColumns, 0) {
            @Override
            public boolean isCellEditable(int row, int column) {
                return false; // Table tidak bisa diedit
            }
        };

        tableKeranjang = new JTable(modelKeranjang);
        tableKeranjang.setRowHeight(30);
        tableKeranjang.getTableHeader().setFont(new Font("Arial", Font.BOLD, 12));
        JScrollPane scrollKeranjang = new JScrollPane(tableKeranjang);
        rightPanel.add(scrollKeranjang, BorderLayout.CENTER);

        // Panel info keranjang
        JPanel infoPanel = new JPanel(new GridLayout(2, 2, 10, 5));
        infoPanel.setBorder(BorderFactory.createEmptyBorder(10, 10, 10, 10));

        lblJumlahItem = new JLabel("0 item");
        lblJumlahItem.setFont(new Font("Arial", Font.BOLD, 12));

        lblTotal = new JLabel("Rp 0");
        lblTotal.setFont(new Font("Arial", Font.BOLD, 14));
        lblTotal.setForeground(new Color(0, 100, 0));

        infoPanel.add(new JLabel("Jumlah Item:"));
        infoPanel.add(lblJumlahItem);
        infoPanel.add(new JLabel("Total:"));
        infoPanel.add(lblTotal);

        rightPanel.add(infoPanel, BorderLayout.NORTH);

        // Panel tombol aksi
        JPanel actionPanel = new JPanel(new FlowLayout());

        JButton btnCheckout = new JButton("💳 Checkout");
        btnCheckout.setBackground(new Color(60, 179, 113));
        btnCheckout.setForeground(Color.WHITE);
        btnCheckout.setFont(new Font("Arial", Font.BOLD, 14));
        btnCheckout.setFocusPainted(false);

        JButton btnKosongkan = new JButton("🗑️ Kosongkan");
        btnKosongkan.setBackground(new Color(220, 20, 60));
        btnKosongkan.setForeground(Color.WHITE);
        btnKosongkan.setFocusPainted(false);

        JButton btnHapusItem = new JButton("❌ Hapus Item Terpilih");
        btnHapusItem.setBackground(new Color(255, 140, 0));
        btnHapusItem.setForeground(Color.WHITE);
        btnHapusItem.setFocusPainted(false);

        JButton btnTutup = new JButton("Tutup");
        btnTutup.setFocusPainted(false);

        actionPanel.add(btnTambah); // Tombol tambah juga di sini
        actionPanel.add(btnHapusItem);
        actionPanel.add(btnKosongkan);
        actionPanel.add(btnCheckout);
        actionPanel.add(btnTutup);

        rightPanel.add(actionPanel, BorderLayout.SOUTH);

        // Setup split pane
        splitPane.setLeftComponent(leftPanel);
        splitPane.setRightComponent(rightPanel);

        add(splitPane);

        // Event handlers - SIMPLE VERSION
        setupEventHandlers(btnTambah, btnHapusItem, btnKosongkan, btnCheckout, btnTutup);
    }

    private void setupEventHandlers(JButton btnTambah, JButton btnHapusItem, JButton btnKosongkan, JButton btnCheckout, JButton btnTutup) {
        // Tombol tambah ke keranjang
        btnTambah.addActionListener(new ActionListener() {
            @Override
            public void actionPerformed(ActionEvent e) {
                System.out.println("🔧 DEBUG: Tombol Tambah diklik");
                tambahKeKeranjang();
            }
        });

        // Tombol hapus item terpilih
        btnHapusItem.addActionListener(new ActionListener() {
            @Override
            public void actionPerformed(ActionEvent e) {
                hapusItemTerpilih();
            }
        });

        // Tombol kosongkan
        btnKosongkan.addActionListener(new ActionListener() {
            @Override
            public void actionPerformed(ActionEvent e) {
                int confirm = JOptionPane.showConfirmDialog(
                        TransaksiForm.this,
                        "Kosongkan semua item di keranjang?",
                        "Konfirmasi",
                        JOptionPane.YES_NO_OPTION
                );
                if (confirm == JOptionPane.YES_OPTION) {
                    transaksiService.kosongkanKeranjang();
                    updateKeranjangDisplay();
                }
            }
        });

        // Tombol checkout
        btnCheckout.addActionListener(new ActionListener() {
            @Override
            public void actionPerformed(ActionEvent e) {
                checkout();
            }
        });

        // Tombol tutup
        btnTutup.addActionListener(new ActionListener() {
            @Override
            public void actionPerformed(ActionEvent e) {
                dispose();
            }
        });

        // Double click pada table menu untuk tambah ke keranjang
        tableMenu.addMouseListener(new MouseAdapter() {
            public void mouseClicked(MouseEvent evt) {
                if (evt.getClickCount() == 2) {
                    System.out.println("🔧 DEBUG: Double click pada table menu");
                    tambahKeKeranjang();
                }
            }
        });
    }

    private void loadDataMenu() {
        modelMenu.setRowCount(0);
        java.util.List<Menu> menuList = menuService.getAllMenu();

        System.out.println("🔧 DEBUG: Load " + menuList.size() + " menu items");

        for (Menu menu : menuList) {
            Object[] rowData = {
                menu.getIdMenu(),
                menu.getNamaMenu(),
                menuService.formatHarga(menu.getHarga()), // ✅ PAKAI FORMAT HARGA
                menu.getKategori()
            };
            modelMenu.addRow(rowData);
        }
    }

    private void tambahKeKeranjang() {
        int selectedRow = tableMenu.getSelectedRow();
        System.out.println("🔧 DEBUG: Selected row: " + selectedRow);

        if (selectedRow == -1) {
            JOptionPane.showMessageDialog(this, "Pilih menu terlebih dahulu!");
            return;
        }

        String idMenu = (String) modelMenu.getValueAt(selectedRow, 0);
        String namaMenu = (String) modelMenu.getValueAt(selectedRow, 1);

        System.out.println("🔧 DEBUG: ID Menu: " + idMenu + ", Nama: " + namaMenu);

        String input = JOptionPane.showInputDialog(this,
                "Jumlah " + namaMenu + ":", "1");

        if (input != null && !input.trim().isEmpty()) {
            try {
                int jumlah = Integer.parseInt(input.trim());
                System.out.println("🔧 DEBUG: Jumlah input: " + jumlah);

                if (jumlah <= 0) {
                    JOptionPane.showMessageDialog(this, "Jumlah harus lebih dari 0!");
                    return;
                }

                boolean success = transaksiService.tambahKeKeranjang(idMenu, jumlah);
                System.out.println("🔧 DEBUG: Result tambah ke keranjang: " + success);

                if (success) {
                    updateKeranjangDisplay();
                    JOptionPane.showMessageDialog(this,
                            namaMenu + " x" + jumlah + " ditambahkan ke keranjang!");
                } else {
                    JOptionPane.showMessageDialog(this, "Gagal menambah ke keranjang!");
                }

            } catch (NumberFormatException e) {
                JOptionPane.showMessageDialog(this, "Jumlah harus angka!");
            }
        } else {
            System.out.println("🔧 DEBUG: Input dibatalkan atau kosong");
        }
    }

    private void hapusItemTerpilih() {
        int selectedRow = tableKeranjang.getSelectedRow();
        if (selectedRow == -1) {
            JOptionPane.showMessageDialog(this, "Pilih item di keranjang terlebih dahulu!");
            return;
        }

        java.util.List<DetailPesanan> keranjang = transaksiService.getKeranjang();
        if (selectedRow < keranjang.size()) {
            String idMenu = keranjang.get(selectedRow).getIdMenu();
            String namaMenu = keranjang.get(selectedRow).getMenu().getNamaMenu();

            int confirm = JOptionPane.showConfirmDialog(this,
                    "Hapus " + namaMenu + " dari keranjang?", "Konfirmasi", JOptionPane.YES_NO_OPTION);

            if (confirm == JOptionPane.YES_OPTION) {
                transaksiService.hapusDariKeranjang(idMenu);
                updateKeranjangDisplay();
            }
        }
    }

    private void updateKeranjangDisplay() {
        modelKeranjang.setRowCount(0);
        java.util.List<DetailPesanan> keranjang = transaksiService.getKeranjang();

        System.out.println("🔧 DEBUG: Update keranjang display, jumlah item: " + keranjang.size());

        for (DetailPesanan detail : keranjang) {
            Object[] rowData = {
                detail.getMenu().getNamaMenu(),
                "Rp " + String.format("%,.0f", detail.getMenu().getHarga()),
                detail.getJumlah(),
                "Rp " + String.format("%,.0f", detail.getSubtotal())
            };
            modelKeranjang.addRow(rowData);
        }

        // Update info
        int jumlahItem = transaksiService.getJumlahItemKeranjang();
        double total = transaksiService.getTotalKeranjang();

        lblJumlahItem.setText(jumlahItem + " item");
        lblTotal.setText("Rp " + String.format("%,.0f", total));

        System.out.println("🔧 DEBUG: Jumlah item: " + jumlahItem + ", Total: " + total);
    }

    private void checkout() {
        if (transaksiService.getKeranjang().isEmpty()) {
            JOptionPane.showMessageDialog(this, "Keranjang masih kosong!");
            return;
        }

        // Tampilkan detail keranjang sebelum checkout
        StringBuilder detailPesanan = new StringBuilder();
        detailPesanan.append("Detail Pesanan:\n");
        detailPesanan.append("────────────────────\n");

        java.util.List<DetailPesanan> keranjang = transaksiService.getKeranjang();
        for (DetailPesanan detail : keranjang) {
            detailPesanan.append(String.format("- %s x%d = Rp %,.0f\n",
                    detail.getMenu().getNamaMenu(),
                    detail.getJumlah(),
                    detail.getSubtotal()));
        }

        detailPesanan.append("────────────────────\n");
        detailPesanan.append(String.format("TOTAL: Rp %,.0f", transaksiService.getTotalKeranjang()));

        int confirm = JOptionPane.showConfirmDialog(
                this,
                detailPesanan.toString() + "\n\nProses transaksi?",
                "Konfirmasi Checkout",
                JOptionPane.YES_NO_OPTION,
                JOptionPane.QUESTION_MESSAGE
        );

        if (confirm == JOptionPane.YES_OPTION) {
            String idPengguna = authService.getUserLoggedIn().getIdPengguna();
            System.out.println("🔧 TRANSACTION FORM: Checkout dengan ID Pengguna: " + idPengguna);

            // Show loading
            JOptionPane.showMessageDialog(this,
                    "Memproses transaksi...",
                    "Processing",
                    JOptionPane.INFORMATION_MESSAGE);

            boolean success = transaksiService.checkout(idPengguna);

            if (success) {
                // Tampilkan struk sukses
                StringBuilder struk = new StringBuilder();
                struk.append("✅ TRANSAKSI BERHASIL!\n");
                struk.append("────────────────────\n");
                struk.append("Terima kasih atas pembeliannya!\n\n");
                struk.append("Silakan ambil pesanan Anda di counter.\n");
                struk.append("Pesanan akan segera diproses.");

                JOptionPane.showMessageDialog(this,
                        struk.toString(),
                        "Transaksi Berhasil",
                        JOptionPane.INFORMATION_MESSAGE);

                updateKeranjangDisplay();
            } else {
                JOptionPane.showMessageDialog(this,
                        "❌ Transaksi gagal!\nSilakan coba lagi atau hubungi administrator.",
                        "Error",
                        JOptionPane.ERROR_MESSAGE);
            }
        }
    }

    // TEST METHOD
    public static void main(String[] args) {
        SwingUtilities.invokeLater(() -> {
            // Test dengan auth service
            AuthService authService = new AuthService();
            // Simulasikan login
            boolean loginSuccess = authService.login("kasir1", "kasir123");
            System.out.println("🔧 DEBUG: Login success: " + loginSuccess);

            if (loginSuccess) {
                new TransaksiForm(authService).setVisible(true);
            } else {
                System.out.println("❌ DEBUG: Login gagal");
            }
        });
    }
}
