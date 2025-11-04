/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package service;

/**
 *
 * @author Daffa Danendra
 */
import dao.PesananDAO;
import dao.MenuDAO;
import model.Pesanan;
import model.DetailPesanan;
import model.Menu;
import javax.swing.JOptionPane;
import java.util.ArrayList;
import java.util.List;

public class TransaksiService {

    private PesananDAO pesananDAO;
    private MenuDAO menuDAO;
    private List<DetailPesanan> keranjang;

    public TransaksiService() {
        this.pesananDAO = new PesananDAO();
        this.menuDAO = new MenuDAO();
        this.keranjang = new ArrayList<>();
    }

    public boolean tambahKeKeranjang(String idMenu, int jumlah) {
        System.out.println("🔧 TRANSAKSI SERVICE: Tambah ke keranjang - ID: " + idMenu + ", Jumlah: " + jumlah);

        Menu menu = menuDAO.getMenuById(idMenu);
        if (menu == null) {
            System.out.println("❌ TRANSAKSI SERVICE: Menu tidak ditemukan");
            JOptionPane.showMessageDialog(null, "Menu tidak ditemukan!", "Error", JOptionPane.ERROR_MESSAGE);
            return false;
        }

        // Cek stok
        if (menu.getStok() < jumlah) {
            System.out.println("❌ TRANSAKSI SERVICE: Stok tidak cukup");
            JOptionPane.showMessageDialog(null,
                    "Stok " + menu.getNamaMenu() + " tidak cukup!\nStok tersedia: " + menu.getStok(),
                    "Stok Habis", JOptionPane.WARNING_MESSAGE);
            return false;
        }

        System.out.println("🔧 TRANSAKSI SERVICE: Menu ditemukan - " + menu.getNamaMenu());

        // Cek apakah menu sudah ada di keranjang
        for (DetailPesanan detail : keranjang) {
            if (detail.getIdMenu().equals(idMenu)) {
                // Update jumlah dan subtotal
                int newJumlah = detail.getJumlah() + jumlah;
                detail.setJumlah(newJumlah);
                detail.setSubtotal(menu.getHarga() * newJumlah);
                System.out.println("✅ TRANSAKSI SERVICE: Update existing item, jumlah sekarang: " + newJumlah);
                return true;
            }
        }

        // Jika belum ada, tambah baru
        DetailPesanan detail = new DetailPesanan();
        detail.setIdMenu(idMenu);
        detail.setMenu(menu);
        detail.setJumlah(jumlah);
        detail.setSubtotal(menu.getHarga() * jumlah);
        keranjang.add(detail);

        System.out.println("✅ TRANSAKSI SERVICE: Item baru ditambahkan ke keranjang");
        System.out.println("🔧 TRANSAKSI SERVICE: Jumlah item di keranjang: " + keranjang.size());

        return true;
    }

    public boolean hapusDariKeranjang(String idMenu) {
        boolean removed = keranjang.removeIf(detail -> detail.getIdMenu().equals(idMenu));
        if (removed) {
            System.out.println("✅ Item dihapus dari keranjang: " + idMenu);
        }
        return removed;
    }

    public double getTotalKeranjang() {
        return keranjang.stream()
                .mapToDouble(DetailPesanan::getSubtotal)
                .sum();
    }

    public List<DetailPesanan> getKeranjang() {
        return new ArrayList<>(keranjang);
    }

    public void kosongkanKeranjang() {
        keranjang.clear();
        System.out.println("✅ Keranjang dikosongkan");
    }

    public boolean checkout(String idPengguna) {
    if (keranjang.isEmpty()) {
        JOptionPane.showMessageDialog(null, "Keranjang kosong!", "Error", JOptionPane.ERROR_MESSAGE);
        return false;
    }

    try {
        // Buat object pesanan
        Pesanan pesanan = new Pesanan();
        pesanan.setIdPengguna(idPengguna);
        pesanan.setTotal(getTotalKeranjang());
        pesanan.setStatusPesanan("selesai"); // Default status
        pesanan.setTanggalPesanan(java.time.LocalDateTime.now());
        
        // Convert keranjang ke detail pesanan
        List<DetailPesanan> detailsForPesanan = new ArrayList<>();
        for (DetailPesanan keranjangDetail : keranjang) {
            DetailPesanan pesananDetail = new DetailPesanan();
            pesananDetail.setIdMenu(keranjangDetail.getIdMenu());
            pesananDetail.setJumlah(keranjangDetail.getJumlah());
            pesananDetail.setSubtotal(keranjangDetail.getSubtotal());
            pesananDetail.setMenu(keranjangDetail.getMenu());
            detailsForPesanan.add(pesananDetail);
        }
        pesanan.setDetailPesananList(detailsForPesanan);

        System.out.println("🔧 Processing checkout with " + detailsForPesanan.size() + " items...");

        // Langsung pakai method createPesanan (tanpa fallback)
        boolean success = pesananDAO.createPesanan(pesanan);

        if (success) {
            tampilkanStruk(pesanan, detailsForPesanan);
            kosongkanKeranjang();
            return true;
        } else {
            JOptionPane.showMessageDialog(null, "Gagal memproses transaksi!", "Error", JOptionPane.ERROR_MESSAGE);
            return false;
        }

    } catch (Exception e) {
        JOptionPane.showMessageDialog(null, "Error: " + e.getMessage(), "Error", JOptionPane.ERROR_MESSAGE);
        return false;
    }
}

    // Method untuk cek stok
    private boolean cekStokTersedia() {
        for (DetailPesanan detail : keranjang) {
            Menu menu = menuDAO.getMenuById(detail.getIdMenu());
            if (menu == null || menu.getStok() < detail.getJumlah()) {
                System.out.println("❌ Stok tidak cukup: " + detail.getMenu().getNamaMenu()
                        + " (Stok: " + (menu != null ? menu.getStok() : "null") + ", Butuh: " + detail.getJumlah() + ")");
                return false;
            }
        }
        return true;
    }

    // Method untuk tampilkan struk
    private void tampilkanStruk(Pesanan pesanan, List<DetailPesanan> details) {
        StringBuilder struk = new StringBuilder();
        struk.append("✅ TRANSAKSI BERHASIL!\n");
        struk.append("=================================\n");
        struk.append("ID Pesanan: ").append(pesanan.getIdPesanan()).append("\n");
        struk.append("Tanggal: ").append(java.time.LocalDateTime.now()).append("\n");
        struk.append("Total: Rp ").append(String.format("%,.0f", pesanan.getTotal())).append("\n");
        struk.append("---------------------------------\n");
        struk.append("Detail Pesanan:\n");

        for (DetailPesanan detail : details) {
            struk.append(String.format("- %s x%d = Rp %,.0f\n",
                    detail.getMenu().getNamaMenu(),
                    detail.getJumlah(),
                    detail.getSubtotal()));
        }

        struk.append("---------------------------------\n");
        struk.append(String.format("TOTAL: Rp %,.0f\n", pesanan.getTotal()));
        struk.append("=================================\n");
        struk.append("Terima kasih atas kunjungannya! 🎉\n");
        struk.append("Pesanan akan segera diproses.");

        JOptionPane.showMessageDialog(null, struk.toString(), "Struk Pembayaran", JOptionPane.INFORMATION_MESSAGE);
    }

    public boolean updateJumlahKeranjang(String idMenu, int jumlahBaru) {
        for (DetailPesanan detail : keranjang) {
            if (detail.getIdMenu().equals(idMenu)) {
                if (jumlahBaru <= 0) {
                    return hapusDariKeranjang(idMenu);
                }

                // Cek stok untuk jumlah baru
                Menu menu = menuDAO.getMenuById(idMenu);
                if (menu != null && menu.getStok() < jumlahBaru) {
                    JOptionPane.showMessageDialog(null,
                            "Stok tidak cukup!\nStok tersedia: " + menu.getStok(),
                            "Stok Habis", JOptionPane.WARNING_MESSAGE);
                    return false;
                }

                detail.setJumlah(jumlahBaru);
                detail.setSubtotal(detail.getMenu().getHarga() * jumlahBaru);
                return true;
            }
        }
        return false;
    }

    public int getJumlahItemKeranjang() {
        return keranjang.size();
    }
}
