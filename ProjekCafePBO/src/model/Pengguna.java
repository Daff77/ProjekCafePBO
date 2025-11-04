/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package model;

/**
 *
 * @author Daffa Danendra
 */

public class Pengguna {
    private String idPengguna;
    private String namaPengguna;
    private String username;
    private String kataSandi;
    private String peran;
    
    // Constructor 1: Default
    public Pengguna() {
        this.idPengguna = "";
        this.namaPengguna = "";
        this.username = "";
        this.kataSandi = "";
        this.peran = "";
    }
    
    // Constructor 2: Untuk login (4 parameters - TANPA kataSandi)
    public Pengguna(String idPengguna, String namaPengguna, String username, String peran) {
        this.idPengguna = idPengguna;
        this.namaPengguna = namaPengguna;
        this.username = username;
        this.peran = peran;
        this.kataSandi = ""; // Default value
    }
    
    // Constructor 3: Lengkap (5 parameters)  
    public Pengguna(String idPengguna, String namaPengguna, String username, String kataSandi, String peran) {
        this.idPengguna = idPengguna;
        this.namaPengguna = namaPengguna;
        this.username = username;
        this.kataSandi = kataSandi;
        this.peran = peran;
    }
    
    // Getters
    public String getIdPengguna() { return idPengguna; }
    public String getNamaPengguna() { return namaPengguna; }
    public String getUsername() { return username; }
    public String getKataSandi() { return kataSandi; }
    public String getPeran() { return peran; }
    
    // Setters
    public void setIdPengguna(String idPengguna) { this.idPengguna = idPengguna; }
    public void setNamaPengguna(String namaPengguna) { this.namaPengguna = namaPengguna; }
    public void setUsername(String username) { this.username = username; }
    public void setKataSandi(String kataSandi) { this.kataSandi = kataSandi; }
    public void setPeran(String peran) { this.peran = peran; }
    
    @Override
    public String toString() {
        return namaPengguna + " (" + peran + ")";
    }
}