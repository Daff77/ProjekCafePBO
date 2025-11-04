/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package ui;

/**
 *
 * @author Daffa Danendra
 */
import dao.PenggunaDAO;
import model.Pengguna;
import service.AuthService;

import javax.swing.*;
import javax.swing.table.DefaultTableModel;
import java.awt.*;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;
import java.util.List;

public class UserManagementForm extends JFrame {

    private PenggunaDAO penggunaDAO;
    private AuthService authService;
    private JTable tableUsers;
    private DefaultTableModel tableModel;
    private JTextField txtCari;

    public UserManagementForm(AuthService authService) {
        this.authService = authService;
        this.penggunaDAO = new PenggunaDAO();
        initUI();
        loadDataUsers();
    }

    private void initUI() {
        setTitle("👥 Kelola Pengguna - Cafe Management System");
        setDefaultCloseOperation(JFrame.DISPOSE_ON_CLOSE);
        setSize(900, 600);
        setLocationRelativeTo(null);

        // Main panel
        JPanel mainPanel = new JPanel(new BorderLayout());
        mainPanel.setBorder(BorderFactory.createEmptyBorder(10, 10, 10, 10));

        // Title
        JLabel lblTitle = new JLabel("👥 KELOLA PENGGUNA", JLabel.CENTER);
        lblTitle.setFont(new Font("Arial", Font.BOLD, 18));
        lblTitle.setBorder(BorderFactory.createEmptyBorder(10, 0, 10, 0));
        mainPanel.add(lblTitle, BorderLayout.NORTH);

        // Top panel untuk pencarian dan tombol
        JPanel topPanel = new JPanel(new BorderLayout(10, 10));

        // Panel pencarian
        JPanel searchPanel = new JPanel(new FlowLayout(FlowLayout.LEFT));
        searchPanel.add(new JLabel("Cari:"));
        txtCari = new JTextField(20);
        searchPanel.add(txtCari);

        JButton btnCari = new JButton("🔍 Cari");
        btnCari.addActionListener(e -> cariUser());
        searchPanel.add(btnCari);

        // Panel tombol aksi
        JPanel buttonPanel = new JPanel(new FlowLayout(FlowLayout.RIGHT));

        JButton btnTambah = new JButton("➕ Tambah User");
        btnTambah.setBackground(new Color(60, 179, 113));
        btnTambah.setForeground(Color.WHITE);
        btnTambah.addActionListener(e -> tambahUser());

        JButton btnEdit = new JButton("✏️ Edit User");
        btnEdit.setBackground(new Color(255, 140, 0));
        btnEdit.setForeground(Color.WHITE);
        btnEdit.addActionListener(e -> editUser());

        JButton btnHapus = new JButton("❌ Hapus User");
        btnHapus.setBackground(new Color(220, 20, 60));
        btnHapus.setForeground(Color.WHITE);
        btnHapus.addActionListener(e -> hapusUser());

        JButton btnRefresh = new JButton("🔄 Refresh");
        btnRefresh.addActionListener(e -> loadDataUsers());

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

        // Table untuk users
        String[] columnNames = {"ID", "Nama Lengkap", "Username", "Role", "Password"};
        tableModel = new DefaultTableModel(columnNames, 0) {
            @Override
            public boolean isCellEditable(int row, int column) {
                return false;
            }
        };

        tableUsers = new JTable(tableModel);
        tableUsers.setSelectionMode(ListSelectionModel.SINGLE_SELECTION);
        tableUsers.setRowHeight(25);
        tableUsers.getTableHeader().setFont(new Font("Arial", Font.BOLD, 12));

        // Set column widths
        tableUsers.getColumnModel().getColumn(0).setPreferredWidth(80);   // ID
        tableUsers.getColumnModel().getColumn(1).setPreferredWidth(200);  // Nama
        tableUsers.getColumnModel().getColumn(2).setPreferredWidth(150);  // Username
        tableUsers.getColumnModel().getColumn(3).setPreferredWidth(100);  // Role
        tableUsers.getColumnModel().getColumn(4).setPreferredWidth(150);  // Password

        JScrollPane scrollPane = new JScrollPane(tableUsers);
        mainPanel.add(scrollPane, BorderLayout.CENTER);

        // Panel info
        JPanel infoPanel = new JPanel(new FlowLayout(FlowLayout.LEFT));
        JLabel lblInfo = new JLabel("Total users: 0 | Admin: 0 | Kasir: 0");
        lblInfo.setFont(new Font("Arial", Font.PLAIN, 12));
        infoPanel.add(lblInfo);
        mainPanel.add(infoPanel, BorderLayout.SOUTH);

        add(mainPanel);
    }

    private void loadDataUsers() {
        tableModel.setRowCount(0);
        List<Pengguna> users = penggunaDAO.getAllUsers();

        int adminCount = 0;
        int kasirCount = 0;

        for (Pengguna user : users) {
            // Hitung role
            if ("admin".equals(user.getPeran())) {
                adminCount++;
            }
            if ("kasir".equals(user.getPeran())) {
                kasirCount++;
            }

            // Password disembunyikan
            String hiddenPassword = "••••••••";

            Object[] rowData = {
                user.getIdPengguna(),
                user.getNamaPengguna(),
                user.getUsername(),
                user.getPeran(),
                hiddenPassword
            };
            tableModel.addRow(rowData);
        }

        // Update info label
        updateInfoLabel(users.size(), adminCount, kasirCount);
        System.out.println("✅ Loaded " + users.size() + " users");
    }

    private void updateInfoLabel(int totalUsers, int adminCount, int kasirCount) {
        Component[] components = ((JPanel) getContentPane().getComponent(0)).getComponents();
        for (Component comp : components) {
            if (comp instanceof JPanel) {
                JPanel panel = (JPanel) comp;
                if (panel.getComponentCount() > 0 && panel.getComponent(0) instanceof JLabel) {
                    JLabel label = (JLabel) panel.getComponent(0);
                    label.setText("Total users: " + totalUsers + " | Admin: " + adminCount + " | Kasir: " + kasirCount);
                    break;
                }
            }
        }
    }

    private void cariUser() {
        String keyword = txtCari.getText().trim();
        if (keyword.isEmpty()) {
            loadDataUsers();
            return;
        }

        tableModel.setRowCount(0);
        List<Pengguna> allUsers = penggunaDAO.getAllUsers();
        List<Pengguna> filteredUsers = allUsers.stream()
                .filter(user -> user.getNamaPengguna().toLowerCase().contains(keyword.toLowerCase())
                || user.getUsername().toLowerCase().contains(keyword.toLowerCase())
                || user.getPeran().toLowerCase().contains(keyword.toLowerCase()))
                .toList();

        int adminCount = 0;
        int kasirCount = 0;

        for (Pengguna user : filteredUsers) {
            if ("admin".equals(user.getPeran())) {
                adminCount++;
            }
            if ("kasir".equals(user.getPeran())) {
                kasirCount++;
            }

            String hiddenPassword = "••••••••";
            Object[] rowData = {
                user.getIdPengguna(),
                user.getNamaPengguna(),
                user.getUsername(),
                user.getPeran(),
                hiddenPassword
            };
            tableModel.addRow(rowData);
        }

        updateInfoLabel(filteredUsers.size(), adminCount, kasirCount);
        System.out.println("🔍 Found " + filteredUsers.size() + " users matching: " + keyword);
    }

    private void tambahUser() {
        JPanel panel = new JPanel(new GridLayout(0, 2, 10, 10));

        JTextField txtNama = new JTextField();
        JTextField txtUsername = new JTextField();
        JPasswordField txtPassword = new JPasswordField();

        // ✅ UPDATE: Tambahkan owner dan manager
        JComboBox<String> comboRole = new JComboBox<>(new String[]{
            "kasir", "admin", "manager", "owner"
        });

        panel.add(new JLabel("Nama Lengkap:"));
        panel.add(txtNama);
        panel.add(new JLabel("Username:"));
        panel.add(txtUsername);
        panel.add(new JLabel("Password:"));
        panel.add(txtPassword);
        panel.add(new JLabel("Role:"));
        panel.add(comboRole);

        // Contoh
        panel.add(new JLabel("Contoh Role:"));
        panel.add(new JLabel("admin, kasir, manager, owner"));

        int result = JOptionPane.showConfirmDialog(
                this,
                panel,
                "Tambah User Baru",
                JOptionPane.OK_CANCEL_OPTION,
                JOptionPane.PLAIN_MESSAGE
        );

        if (result == JOptionPane.OK_OPTION) {
            String nama = txtNama.getText().trim();
            String username = txtUsername.getText().trim();
            String password = new String(txtPassword.getPassword());
            String role = (String) comboRole.getSelectedItem();

            // Validasi
            if (nama.isEmpty() || username.isEmpty() || password.isEmpty()) {
                JOptionPane.showMessageDialog(this, "Semua field harus diisi!", "Error", JOptionPane.ERROR_MESSAGE);
                return;
            }

            if (password.length() < 3) {
                JOptionPane.showMessageDialog(this, "Password minimal 3 karakter!", "Error", JOptionPane.ERROR_MESSAGE);
                return;
            }

            // Cek username sudah ada
            if (penggunaDAO.isUsernameExists(username, null)) {
                JOptionPane.showMessageDialog(this, "Username sudah digunakan!", "Error", JOptionPane.ERROR_MESSAGE);
                return;
            }

            // Buat user baru
            Pengguna newUser = new Pengguna();
            newUser.setNamaPengguna(nama);
            newUser.setUsername(username);
            newUser.setKataSandi(password);
            newUser.setPeran(role);

            boolean success = penggunaDAO.addUser(newUser);
            if (success) {
                JOptionPane.showMessageDialog(this,
                        "✅ User '" + nama + "' berhasil ditambahkan!\nRole: " + role,
                        "Success", JOptionPane.INFORMATION_MESSAGE);
                loadDataUsers();
            } else {
                JOptionPane.showMessageDialog(this,
                        "❌ Gagal menambah user! Cek console untuk detail error.",
                        "Error", JOptionPane.ERROR_MESSAGE);
            }
        }
    }

    private void editUser() {
        int selectedRow = tableUsers.getSelectedRow();
        if (selectedRow == -1) {
            JOptionPane.showMessageDialog(this, "Pilih user yang akan diedit!", "Peringatan", JOptionPane.WARNING_MESSAGE);
            return;
        }

        String idUser = (String) tableModel.getValueAt(selectedRow, 0);
        String namaLengkap = (String) tableModel.getValueAt(selectedRow, 1);
        String username = (String) tableModel.getValueAt(selectedRow, 2);
        String role = (String) tableModel.getValueAt(selectedRow, 3);

        // Ambil data asli dari database
        List<Pengguna> allUsers = penggunaDAO.getAllUsers();
        Pengguna userToEdit = allUsers.stream()
                .filter(user -> user.getIdPengguna().equals(idUser))
                .findFirst()
                .orElse(null);

        if (userToEdit == null) {
            JOptionPane.showMessageDialog(this, "User tidak ditemukan!", "Error", JOptionPane.ERROR_MESSAGE);
            return;
        }

        JPanel panel = new JPanel(new GridLayout(0, 2, 10, 10));

        JTextField txtNama = new JTextField(userToEdit.getNamaPengguna());
        JTextField txtUsername = new JTextField(userToEdit.getUsername());
        JPasswordField txtPassword = new JPasswordField();
        JComboBox<String> comboRole = new JComboBox<>(new String[]{"kasir", "admin", "manager", "owner"});
        comboRole.setSelectedItem(userToEdit.getPeran());
        comboRole.setSelectedItem(userToEdit.getPeran());

        panel.add(new JLabel("Nama Lengkap:"));
        panel.add(txtNama);
        panel.add(new JLabel("Username:"));
        panel.add(txtUsername);
        panel.add(new JLabel("Password (kosongkan jika tidak diubah):"));
        panel.add(txtPassword);
        panel.add(new JLabel("Role:"));
        panel.add(comboRole);

        int result = JOptionPane.showConfirmDialog(
                this,
                panel,
                "Edit User: " + namaLengkap,
                JOptionPane.OK_CANCEL_OPTION,
                JOptionPane.PLAIN_MESSAGE
        );

        if (result == JOptionPane.OK_OPTION) {
            String namaBaru = txtNama.getText().trim();
            String usernameBaru = txtUsername.getText().trim();
            String passwordBaru = new String(txtPassword.getPassword());
            String roleBaru = (String) comboRole.getSelectedItem();

            // Validasi
            if (namaBaru.isEmpty() || usernameBaru.isEmpty()) {
                JOptionPane.showMessageDialog(this, "Nama dan username harus diisi!", "Error", JOptionPane.ERROR_MESSAGE);
                return;
            }

            // Cek username sudah ada (kecuali untuk user ini)
            if (penggunaDAO.isUsernameExists(usernameBaru, idUser)) {
                JOptionPane.showMessageDialog(this, "Username sudah digunakan!", "Error", JOptionPane.ERROR_MESSAGE);
                return;
            }

            // Update user
            userToEdit.setNamaPengguna(namaBaru);
            userToEdit.setUsername(usernameBaru);
            userToEdit.setPeran(roleBaru);

            // Jika password diisi, update password
            if (!passwordBaru.isEmpty()) {
                if (passwordBaru.length() < 3) {
                    JOptionPane.showMessageDialog(this, "Password minimal 3 karakter!", "Error", JOptionPane.ERROR_MESSAGE);
                    return;
                }
                userToEdit.setKataSandi(passwordBaru);
            }

            boolean success = penggunaDAO.updateUser(userToEdit);
            if (success) {
                JOptionPane.showMessageDialog(this,
                        "User '" + namaBaru + "' berhasil diupdate!",
                        "Success", JOptionPane.INFORMATION_MESSAGE);
                loadDataUsers();
            } else {
                JOptionPane.showMessageDialog(this, "Gagal mengupdate user!", "Error", JOptionPane.ERROR_MESSAGE);
            }
        }
    }

    private void hapusUser() {
        int selectedRow = tableUsers.getSelectedRow();
        if (selectedRow == -1) {
            JOptionPane.showMessageDialog(this, "Pilih user yang akan dihapus!", "Peringatan", JOptionPane.WARNING_MESSAGE);
            return;
        }

        String idUser = (String) tableModel.getValueAt(selectedRow, 0);
        String namaUser = (String) tableModel.getValueAt(selectedRow, 1);

        // Cek apakah menghapus diri sendiri
        Pengguna currentUser = authService.getUserLoggedIn();
        if (currentUser != null && currentUser.getIdPengguna().equals(idUser)) {
            JOptionPane.showMessageDialog(this,
                    "Tidak bisa menghapus akun sendiri!", "Error", JOptionPane.ERROR_MESSAGE);
            return;
        }

        int confirm = JOptionPane.showConfirmDialog(
                this,
                "Yakin ingin menghapus user '" + namaUser + "'?",
                "Konfirmasi Hapus",
                JOptionPane.YES_NO_OPTION,
                JOptionPane.WARNING_MESSAGE
        );

        if (confirm == JOptionPane.YES_OPTION) {
            boolean success = penggunaDAO.deleteUser(idUser);
            if (success) {
                JOptionPane.showMessageDialog(this,
                        "User '" + namaUser + "' berhasil dihapus!",
                        "Success", JOptionPane.INFORMATION_MESSAGE);
                loadDataUsers();
            } else {
                JOptionPane.showMessageDialog(this,
                        "Gagal menghapus user! User mungkin memiliki transaksi.",
                        "Error", JOptionPane.ERROR_MESSAGE);
            }
        }
    }

    // TEST METHOD
    public static void main(String[] args) {
        SwingUtilities.invokeLater(() -> {
            AuthService authService = new AuthService();
            // Login sebagai admin untuk testing
            authService.login("admin", "admin123");
            new UserManagementForm(authService).setVisible(true);
        });
    }
}
