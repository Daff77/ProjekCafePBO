/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package model;

/**
 *
 * @author Daffa Danendra
 */
import java.time.LocalDateTime;
import java.util.List;

public class Pesanan {
    private String idPesanan;
    private String idPengguna;
    private LocalDateTime tanggalPesanan;
    private double total;
    private String statusPesanan;
    private List<DetailPesanan> detailPesananList;
    
    public Pesanan() {}
    
    public Pesanan(String idPengguna, double total, String statusPesanan) {
        this.idPengguna = idPengguna;
        this.total = total;
        this.statusPesanan = statusPesanan;
        this.tanggalPesanan = LocalDateTime.now();
    }
    
    // Getters
    public String getIdPesanan() { return idPesanan; }
    public String getIdPengguna() { return idPengguna; }
    public LocalDateTime getTanggalPesanan() { return tanggalPesanan; }
    public double getTotal() { return total; }
    public String getStatusPesanan() { return statusPesanan; }
    public List<DetailPesanan> getDetailPesananList() { return detailPesananList; }
    
    // Setters
    public void setIdPesanan(String idPesanan) { this.idPesanan = idPesanan; }
    public void setIdPengguna(String idPengguna) { this.idPengguna = idPengguna; }
    public void setTanggalPesanan(LocalDateTime tanggalPesanan) { this.tanggalPesanan = tanggalPesanan; }
    public void setTotal(double total) { this.total = total; }
    public void setStatusPesanan(String statusPesanan) { this.statusPesanan = statusPesanan; }
    public void setDetailPesananList(List<DetailPesanan> detailPesananList) { this.detailPesananList = detailPesananList; }
}