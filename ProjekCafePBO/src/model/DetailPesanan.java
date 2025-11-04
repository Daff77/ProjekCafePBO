/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package model;

/**
 *
 * @author Daffa Danendra
 */
public class DetailPesanan {
    private String idDetail;
    private String idPesanan;
    private String idMenu;
    private int jumlah;
    private double subtotal;
    private Menu menu;
    
    public DetailPesanan() {}
    
    public DetailPesanan(String idPesanan, String idMenu, int jumlah, double subtotal) {
        this.idPesanan = idPesanan;
        this.idMenu = idMenu;
        this.jumlah = jumlah;
        this.subtotal = subtotal;
    }
    
    // Getters
    public String getIdDetail() { return idDetail; }
    public String getIdPesanan() { return idPesanan; }
    public String getIdMenu() { return idMenu; }
    public int getJumlah() { return jumlah; }
    public double getSubtotal() { return subtotal; }
    public Menu getMenu() { return menu; }
    
    // Setters
    public void setIdDetail(String idDetail) { this.idDetail = idDetail; }
    public void setIdPesanan(String idPesanan) { this.idPesanan = idPesanan; }
    public void setIdMenu(String idMenu) { this.idMenu = idMenu; }
    public void setJumlah(int jumlah) { this.jumlah = jumlah; }
    public void setSubtotal(double subtotal) { this.subtotal = subtotal; }
    public void setMenu(Menu menu) { this.menu = menu; }
}