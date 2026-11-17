package service;

import dao.PesananDAO;
import dao.MenuDAO;
import model.Pesanan;
import model.DetailPesanan;
import model.Menu;
import javax.swing.JOptionPane;
import java.util.ArrayList;
import java.util.List;

public class TransaksiService {

    private final PesananDAO pesananDAO;
    private final MenuDAO menuDAO;
    private final List<DetailPesanan> keranjang;

    public TransaksiService() {
        this.pesananDAO = new PesananDAO();
        this.menuDAO = new MenuDAO();
        this.keranjang = new ArrayList<>();
    }

    public boolean tambahKeKeranjang(String idMenu, int jumlah) {
        if (jumlah <= 0) {
            JOptionPane.showMessageDialog(null, "Jumlah harus lebih dari 0!", "Validasi", JOptionPane.WARNING_MESSAGE);
            return false;
        }

        Menu menu = menuDAO.getMenuById(idMenu);
        if (menu == null) {
            JOptionPane.showMessageDialog(null, "Menu tidak ditemukan!", "Error", JOptionPane.ERROR_MESSAGE);
            return false;
        }

        int existingQty = 0;
        DetailPesanan existingDetail = null;
        for (DetailPesanan detail : keranjang) {
            if (detail.getIdMenu().equals(idMenu)) {
                existingQty = detail.getJumlah();
                existingDetail = detail;
                break;
            }
        }

        int totalRequested = existingQty + jumlah;
        if (menu.getStok() < totalRequested) {
            JOptionPane.showMessageDialog(null,
                    "Stok " + menu.getNamaMenu() + " tidak cukup!\nStok tersedia: " + menu.getStok()
                            + ", total diminta di keranjang: " + totalRequested,
                    "Stok Tidak Cukup", JOptionPane.WARNING_MESSAGE);
            return false;
        }

        if (existingDetail != null) {
            existingDetail.setJumlah(totalRequested);
            existingDetail.setSubtotal(menu.getHarga() * totalRequested);
            return true;
        }

        DetailPesanan detail = new DetailPesanan();
        detail.setIdMenu(idMenu);
        detail.setMenu(menu);
        detail.setJumlah(jumlah);
        detail.setSubtotal(menu.getHarga() * jumlah);
        keranjang.add(detail);
        return true;
    }

    public boolean hapusDariKeranjang(String idMenu) {
        return keranjang.removeIf(detail -> detail.getIdMenu().equals(idMenu));
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
    }

    public boolean checkout(String idPengguna) {
        if (keranjang.isEmpty()) {
            JOptionPane.showMessageDialog(null, "Keranjang kosong!", "Error", JOptionPane.ERROR_MESSAGE);
            return false;
        }

        if (!cekStokTersedia()) {
            JOptionPane.showMessageDialog(null,
                    "Stok salah satu menu tidak mencukupi. Periksa kembali keranjang!",
                    "Stok Tidak Cukup", JOptionPane.WARNING_MESSAGE);
            return false;
        }

        try {
            Pesanan pesanan = new Pesanan();
            pesanan.setIdPengguna(idPengguna);
            pesanan.setTotal(getTotalKeranjang());
            pesanan.setStatusPesanan("completed");
            pesanan.setTanggalPesanan(java.time.LocalDateTime.now());

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

            boolean success = pesananDAO.createPesanan(pesanan);
            if (success) {
                tampilkanStruk(pesanan, detailsForPesanan);
                kosongkanKeranjang();
                return true;
            } else {
                JOptionPane.showMessageDialog(null, "Gagal memproses transaksi (stok berubah atau koneksi gagal)!", "Error", JOptionPane.ERROR_MESSAGE);
                return false;
            }
        } catch (Exception e) {
            JOptionPane.showMessageDialog(null, "Error: " + e.getMessage(), "Error", JOptionPane.ERROR_MESSAGE);
            return false;
        }
    }

    private boolean cekStokTersedia() {
        for (DetailPesanan detail : keranjang) {
            Menu menu = menuDAO.getMenuById(detail.getIdMenu());
            if (menu == null || detail.getJumlah() <= 0 || menu.getStok() < detail.getJumlah()) {
                return false;
            }
        }
        return true;
    }

    private void tampilkanStruk(Pesanan pesanan, List<DetailPesanan> details) {
        StringBuilder struk = new StringBuilder();
        struk.append("TRANSAKSI BERHASIL!\n");
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
        struk.append("Terima kasih atas kunjungannya!\n");

        JOptionPane.showMessageDialog(null, struk.toString(), "Struk Pembayaran", JOptionPane.INFORMATION_MESSAGE);
    }

    public boolean updateJumlahKeranjang(String idMenu, int jumlahBaru) {
        for (DetailPesanan detail : keranjang) {
            if (detail.getIdMenu().equals(idMenu)) {
                if (jumlahBaru <= 0) {
                    return hapusDariKeranjang(idMenu);
                }

                Menu menu = menuDAO.getMenuById(idMenu);
                if (menu == null || menu.getStok() < jumlahBaru) {
                    JOptionPane.showMessageDialog(null,
                            "Stok tidak cukup!\nStok tersedia: " + (menu != null ? menu.getStok() : 0),
                            "Stok Tidak Cukup", JOptionPane.WARNING_MESSAGE);
                    return false;
                }

                detail.setJumlah(jumlahBaru);
                detail.setSubtotal(menu.getHarga() * jumlahBaru);
                return true;
            }
        }
        return false;
    }

    public int getJumlahItemKeranjang() {
        return keranjang.size();
    }
}
