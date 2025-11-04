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
import javax.swing.*;
import java.awt.*;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;

public class LoginForm extends JFrame {

    private JTextField txtUsername;
    private JPasswordField txtPassword;
    private AuthService authService;

    public LoginForm() {
        this.authService = new AuthService();
        initUI();
    }

    private void initUI() {
        setTitle("Login - Cafe Management System");
        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        setResizable(false);

        // Panel utama
        JPanel mainPanel = new JPanel(new GridBagLayout());
        mainPanel.setBorder(BorderFactory.createEmptyBorder(20, 20, 20, 20));
        mainPanel.setBackground(Color.WHITE);

        GridBagConstraints gbc = new GridBagConstraints();
        gbc.insets = new Insets(10, 10, 10, 10);
        gbc.fill = GridBagConstraints.HORIZONTAL;

        // Title
        gbc.gridx = 0;
        gbc.gridy = 0;
        gbc.gridwidth = 2;
        JLabel lblTitle = new JLabel("CAFE MANAGEMENT SYSTEM", JLabel.CENTER);
        lblTitle.setFont(new Font("Arial", Font.BOLD, 18));
        lblTitle.setForeground(new Color(0, 100, 0));
        mainPanel.add(lblTitle, gbc);

        // Subtitle
        gbc.gridx = 0;
        gbc.gridy = 1;
        gbc.gridwidth = 2;
        JLabel lblSubtitle = new JLabel("Silakan login untuk melanjutkan", JLabel.CENTER);
        lblSubtitle.setFont(new Font("Arial", Font.PLAIN, 12));
        lblSubtitle.setForeground(Color.GRAY);
        mainPanel.add(lblSubtitle, gbc);

        // Spacer
        gbc.gridx = 0;
        gbc.gridy = 2;
        gbc.gridwidth = 2;
        mainPanel.add(Box.createVerticalStrut(20), gbc);

        // Username
        gbc.gridx = 0;
        gbc.gridy = 3;
        gbc.gridwidth = 1;
        JLabel lblUsername = new JLabel("Username:");
        lblUsername.setFont(new Font("Arial", Font.BOLD, 12));
        mainPanel.add(lblUsername, gbc);

        gbc.gridx = 1;
        gbc.gridy = 3;
        txtUsername = new JTextField(20);
        mainPanel.add(txtUsername, gbc);

        // Password
        gbc.gridx = 0;
        gbc.gridy = 4;
        JLabel lblPassword = new JLabel("Password:");
        lblPassword.setFont(new Font("Arial", Font.BOLD, 12));
        mainPanel.add(lblPassword, gbc);

        gbc.gridx = 1;
        gbc.gridy = 4;
        txtPassword = new JPasswordField(20);
        mainPanel.add(txtPassword, gbc);

        // Login Button
        gbc.gridx = 0;
        gbc.gridy = 5;
        gbc.gridwidth = 2;
        gbc.insets = new Insets(20, 10, 10, 10);
        JButton btnLogin = new JButton("Login");
        btnLogin.setBackground(new Color(0, 100, 0));
        btnLogin.setForeground(Color.WHITE);
        btnLogin.setFont(new Font("Arial", Font.BOLD, 14));
        btnLogin.setFocusPainted(false);
        mainPanel.add(btnLogin, gbc);


        // Event handler untuk login
        btnLogin.addActionListener(new ActionListener() {
            @Override
            public void actionPerformed(ActionEvent e) {
                prosesLogin();
            }
        });

        // Enter key untuk login
        txtPassword.addActionListener(new ActionListener() {
            @Override
            public void actionPerformed(ActionEvent e) {
                prosesLogin();
            }
        });

        add(mainPanel);
        pack();
        setLocationRelativeTo(null); // Center window
    }

    private void prosesLogin() {
        String username = txtUsername.getText().trim();
        String password = new String(txtPassword.getPassword());

        if (username.isEmpty() || password.isEmpty()) {
            JOptionPane.showMessageDialog(this,
                    "Username dan password harus diisi!",
                    "Peringatan",
                    JOptionPane.WARNING_MESSAGE);
            return;
        }

        // Coba login
        boolean loginBerhasil = authService.login(username, password);

        if (loginBerhasil) {
            JOptionPane.showMessageDialog(this,
                    "Login berhasil!\nSelamat datang, " + authService.getUserLoggedIn().getNamaPengguna(),
                    "Success",
                    JOptionPane.INFORMATION_MESSAGE);

            // Buka main form - INI YANG DIPERBAIKI
            MainForm mainForm = new MainForm(authService);
            mainForm.setVisible(true);
            this.dispose(); // Tutup form login
        } else {
            JOptionPane.showMessageDialog(this,
                    "Username atau password salah!",
                    "Login Gagal",
                    JOptionPane.ERROR_MESSAGE);
            txtPassword.setText("");
            txtUsername.requestFocus();
        }
    }

    public static void main(String[] args) {
        // VERSI SIMPLE - tanpa setLookAndFeel
        SwingUtilities.invokeLater(new Runnable() {
            @Override
            public void run() {
                new LoginForm().setVisible(true);
            }
        });
    }
}
