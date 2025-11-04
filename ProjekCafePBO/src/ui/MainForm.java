/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package ui;

/**
 *
 * @author Daffa Danendra
 */
import service.AuthService;
import service.MenuService;
import javax.swing.*;
import java.awt.*;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;

public class MainForm extends JFrame {

    private AuthService authService;
    private MenuService menuService;

    public MainForm(AuthService authService) {
        this.authService = authService;
        this.menuService = new MenuService();
        initUI();
    }

    private void initUI() {
        setTitle("Cafe Management System - Main Menu");
        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        setSize(800, 600);
        setLocationRelativeTo(null);

        // Main panel
        JPanel mainPanel = new JPanel(new BorderLayout());
        mainPanel.setBorder(BorderFactory.createEmptyBorder(20, 20, 20, 20));
        mainPanel.setBackground(Color.WHITE);

        // Header panel
        JPanel headerPanel = createHeaderPanel();
        mainPanel.add(headerPanel, BorderLayout.NORTH);

        // Menu panel
        JPanel menuPanel = createMenuPanel();
        mainPanel.add(menuPanel, BorderLayout.CENTER);

        // Logout panel
        JPanel logoutPanel = createLogoutPanel();
        mainPanel.add(logoutPanel, BorderLayout.SOUTH);

        add(mainPanel);
    }

    private JPanel createHeaderPanel() {
        JPanel headerPanel = new JPanel(new BorderLayout());
        headerPanel.setBackground(new Color(240, 240, 240));
        headerPanel.setBorder(BorderFactory.createEmptyBorder(15, 20, 15, 20));

        String welcomeName = authService.getUserLoggedIn().getNamaPengguna();
        String role = authService.getUserLoggedIn().getPeran();

        JLabel lblWelcome = new JLabel("Selamat Datang, " + welcomeName);
        lblWelcome.setFont(new Font("Arial", Font.BOLD, 18));
        lblWelcome.setForeground(new Color(0, 100, 0));

        JLabel lblRole = new JLabel("Role: " + role.toUpperCase());
        lblRole.setFont(new Font("Arial", Font.BOLD, 14));
        lblRole.setForeground(Color.DARK_GRAY);

        JLabel lblAccessInfo = new JLabel(getAccessInfo());
        lblAccessInfo.setFont(new Font("Arial", Font.PLAIN, 12));
        lblAccessInfo.setForeground(Color.GRAY);

        JPanel rightPanel = new JPanel(new GridLayout(2, 1));
        rightPanel.setBackground(new Color(240, 240, 240));
        rightPanel.add(lblRole);
        rightPanel.add(lblAccessInfo);

        headerPanel.add(lblWelcome, BorderLayout.WEST);
        headerPanel.add(rightPanel, BorderLayout.EAST);

        return headerPanel;
    }

    private String getAccessInfo() {
        if (authService.isKasir()) {
            return "Akses: Transaksi & Lihat Menu";
        } else if (authService.isManager()) {
            return "Akses: Transaksi, Menu, Stok & Laporan";
        } else if (authService.isAdmin() || authService.isOwner()) {
            return "Akses: Full System";
        }
        return "Akses: Terbatas";
    }

    private JPanel createMenuPanel() {
        JPanel menuPanel = new JPanel(new GridLayout(0, 2, 15, 15));
        menuPanel.setBorder(BorderFactory.createTitledBorder("📋 Menu Utama"));
        menuPanel.setBackground(Color.WHITE);

        System.out.println("🔐 User Role: " + authService.getUserRole());
        System.out.println("🔍 Access Rights - " +
                "ManageUsers: " + authService.canManageUsers() + ", " +
                "ManageMenu: " + authService.canManageMenu() + ", " +
                "ManageStok: " + authService.canManageStok() + ", " +
                "ViewReports: " + authService.canViewReports());

        // ==================== TOMBOL UNTUK SEMUA ROLE ====================
        JButton btnTransaksi = createMenuButton("💵 Transaksi", "Kelola transaksi penjualan", new Color(70, 130, 180));
        btnTransaksi.addActionListener(e -> bukaTransaksiForm());

        JButton btnLihatMenu = createMenuButton("📋 Lihat Menu", "Lihat daftar menu tersedia", new Color(60, 179, 113));
        btnLihatMenu.addActionListener(e -> {
            boolean canEdit = authService.canManageMenu();
            new MenuForm(menuService, canEdit).setVisible(true);
        });

        menuPanel.add(btnTransaksi);
        menuPanel.add(btnLihatMenu);

        // ==================== TOMBOL UNTUK MANAGER, ADMIN, OWNER ====================
        if (authService.canManageStok()) {
            JButton btnKelolaStok = createMenuButton("📦 Kelola Stok", "Kelola stok menu", new Color(147, 112, 219));
            btnKelolaStok.addActionListener(e -> new StokManagementForm(menuService).setVisible(true));
            menuPanel.add(btnKelolaStok);
        }

        if (authService.canViewReports()) {
            JButton btnLaporan = createMenuButton("📊 Laporan", "Lihat laporan penjualan", new Color(220, 20, 60));
            btnLaporan.addActionListener(e -> new LaporanForm().setVisible(true));
            menuPanel.add(btnLaporan);
        }

        // ==================== TOMBOL UNTUK ADMIN & OWNER SAJA ====================
        if (authService.canManageMenu()) {
            JButton btnKelolaMenu = createMenuButton("⚙️ Kelola Menu", "Tambah/edit/hapus menu", new Color(255, 140, 0));
            btnKelolaMenu.addActionListener(e -> new MenuManagementForm(menuService).setVisible(true));
            menuPanel.add(btnKelolaMenu);
        }

        if (authService.canManageUsers()) {
            JButton btnKelolaUser = createMenuButton("👥 Kelola User", "Kelola data pengguna", new Color(70, 130, 180));
            btnKelolaUser.addActionListener(e -> new UserManagementForm(authService).setVisible(true));
            menuPanel.add(btnKelolaUser);
        }

        // ==================== ROLE SPECIFIC INFO ====================
        if (authService.isKasir()) {
            System.out.println("👤 Kasir access: Basic features only");
        } else if (authService.isManager()) {
            System.out.println("👔 Manager access: + Stok & Laporan");
        } else if (authService.isAdmin()) {
            System.out.println("🛠️ Admin access: Full system access");
        } else if (authService.isOwner()) {
            System.out.println("👑 Owner access: Full system access");
        }

        return menuPanel;
    }

    private JPanel createLogoutPanel() {
        JPanel logoutPanel = new JPanel(new FlowLayout());
        logoutPanel.setBackground(Color.WHITE);

        JButton btnLogout = new JButton("🚪 Logout");
        btnLogout.setBackground(new Color(220, 20, 60));
        btnLogout.setForeground(Color.WHITE);
        btnLogout.setFont(new Font("Arial", Font.BOLD, 14));
        btnLogout.setFocusPainted(false);
        btnLogout.addActionListener(e -> logout());

        logoutPanel.add(btnLogout);

        return logoutPanel;
    }

    private JButton createMenuButton(String title, String description, Color color) {
        JButton button = new JButton("<html><center><b>" + title + "</b><br><small>" + description + "</small></center></html>");
        button.setBackground(color);
        button.setForeground(Color.WHITE);
        button.setFont(new Font("Arial", Font.BOLD, 14));
        button.setFocusPainted(false);
        button.setBorder(BorderFactory.createEmptyBorder(20, 15, 20, 15));
        button.setCursor(new Cursor(Cursor.HAND_CURSOR));
        return button;
    }

    private void bukaTransaksiForm() {
        if (!authService.isLoggedIn()) {
            JOptionPane.showMessageDialog(this,
                    "Anda harus login terlebih dahulu!",
                    "Error",
                    JOptionPane.ERROR_MESSAGE);
            return;
        }

        // Semua role boleh akses transaksi
        TransaksiForm transaksiForm = new TransaksiForm(authService);
        transaksiForm.setVisible(true);

        System.out.println("✅ Membuka TransaksiForm untuk: " + authService.getUserLoggedIn().getNamaPengguna());
    }

    private void logout() {
        int confirm = JOptionPane.showConfirmDialog(
                this,
                "Yakin ingin logout?",
                "Konfirmasi Logout",
                JOptionPane.YES_NO_OPTION
        );

        if (confirm == JOptionPane.YES_OPTION) {
            authService.logout();
            new LoginForm().setVisible(true);
            dispose();
        }
    }

    // TEST METHOD
    public static void main(String[] args) {
        SwingUtilities.invokeLater(new Runnable() {
            @Override
            public void run() {
                // Test dengan auth service
                AuthService authService = new AuthService();
                
                // Test dengan role berbeda:
                // authService.login("kasir1", "kasir123");     // Kasir
                // authService.login("manager1", "manager123"); // Manager  
                authService.login("admin", "admin123");       // Admin
                // authService.login("owner1", "owner123");     // Owner
                
                new MainForm(authService).setVisible(true);
            }
        });
    }
}