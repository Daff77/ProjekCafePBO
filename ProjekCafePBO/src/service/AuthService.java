/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package service;

/**
 *
 * @author Daffa Danendra
 */
import dao.PenggunaDAO;
import model.Pengguna;

public class AuthService {
    private PenggunaDAO penggunaDAO;
    private Pengguna userLoggedIn;
    
    public AuthService() {
        this.penggunaDAO = new PenggunaDAO();
        this.userLoggedIn = null;
    }
    
    public boolean login(String username, String password) {
        Pengguna user = penggunaDAO.login(username, password);
        if (user != null) {
            this.userLoggedIn = user;
            System.out.println("✅ Login berhasil: " + user.getNamaPengguna() + " | Role: " + user.getPeran());
            return true;
        }
        return false;
    }
    
    public void logout() {
        System.out.println("✅ Logout berhasil: " + (userLoggedIn != null ? userLoggedIn.getNamaPengguna() : "Unknown"));
        this.userLoggedIn = null;
    }
    
    public Pengguna getUserLoggedIn() {
        return userLoggedIn;
    }
    
    public boolean isAdmin() {
        return userLoggedIn != null && "admin".equalsIgnoreCase(userLoggedIn.getPeran());
    }
    
    public boolean isKasir() {
        return userLoggedIn != null && "kasir".equalsIgnoreCase(userLoggedIn.getPeran());
    }
    
    public boolean isManager() {
        return userLoggedIn != null && "manager".equalsIgnoreCase(userLoggedIn.getPeran());
    }
    
    public boolean isOwner() {
        return userLoggedIn != null && "owner".equalsIgnoreCase(userLoggedIn.getPeran());
    }
    
    public boolean isLoggedIn() {
        return userLoggedIn != null;
    }
    
    public String getUserRole() {
        return userLoggedIn != null ? userLoggedIn.getPeran() : "unknown";
    }
    
    public boolean canManageUsers() {
        return isAdmin() || isOwner();
    }
    
    public boolean canManageMenu() {
        return isAdmin() || isOwner();
    }
    
    public boolean canManageStok() {
        return isAdmin() || isOwner() || isManager();
    }
    
    public boolean canViewReports() {
        return isAdmin() || isOwner() || isManager();
    }
}