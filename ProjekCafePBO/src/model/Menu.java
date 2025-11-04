/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package model;

/**
 *
 * @author Daffa Danendra
 */
public class Menu {
    private String idMenu;
    private String namaMenu;
    private double harga;
    private String kategori;
    private int stok;  // TAMBAH INI
    
    public Menu() {}
    
    public Menu(String idMenu, String namaMenu, double harga, String kategori) {
        this.idMenu = idMenu;
        this.namaMenu = namaMenu;
        this.harga = harga;
        this.kategori = kategori;
        this.stok = 0; // Default stok
    }
    
    public Menu(String idMenu, String namaMenu, double harga, String kategori, int stok) {
        this.idMenu = idMenu;
        this.namaMenu = namaMenu;
        this.harga = harga;
        this.kategori = kategori;
        this.stok = stok;
    }
    
    public Menu(String namaMenu, double harga, String kategori) {
        this.namaMenu = namaMenu;
        this.harga = harga;
        this.kategori = kategori;
        this.stok = 0; // Default stok
    }
    
    public Menu(String namaMenu, double harga, String kategori, int stok) {
        this.namaMenu = namaMenu;
        this.harga = harga;
        this.kategori = kategori;
        this.stok = stok;
    }
    
    // Getters
    public String getIdMenu() { return idMenu; }
    public String getNamaMenu() { return namaMenu; }
    public double getHarga() { return harga; }
    public String getKategori() { return kategori; }
    public int getStok() { return stok; }  // TAMBAH GETTER
    
    // Setters
    public void setIdMenu(String idMenu) { this.idMenu = idMenu; }
    public void setNamaMenu(String namaMenu) { this.namaMenu = namaMenu; }
    public void setHarga(double harga) { this.harga = harga; }
    public void setKategori(String kategori) { this.kategori = kategori; }
    public void setStok(int stok) { this.stok = stok; }  // TAMBAH SETTER
    
    @Override
    public String toString() {
        return namaMenu + " - Rp " + harga + " (Stok: " + stok + ")";
    }
}