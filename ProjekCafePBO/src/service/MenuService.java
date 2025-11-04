/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package service;

/**
 *
 * @author Daffa Danendra
 */
import dao.MenuDAO;
import model.Menu;
import java.util.List;

public class MenuService {

    private MenuDAO menuDAO;

    public MenuService() {
        this.menuDAO = new MenuDAO();
    }

    public List<Menu> getAllMenu() {
        return menuDAO.getAllMenu();
    }

    public Menu getMenuById(String idMenu) {
        return menuDAO.getMenuById(idMenu);
    }

    public boolean tambahMenu(String namaMenu, double harga, String kategori, int stok) {
        Menu menu = new Menu(namaMenu, harga, kategori, stok);
        return menuDAO.addMenu(menu);
    }

    public boolean tambahMenu(String namaMenu, double harga, String kategori) {
        return tambahMenu(namaMenu, harga, kategori, 0);
    }

    // Update menu - hanya untuk edit data menu (nama, harga, kategori)
    public boolean updateMenu(Menu menu) {
        System.out.println("🔧 SERVICE: Update Menu - " + menu.getNamaMenu()
                + " | Harga: " + menu.getHarga() + " | Kategori: " + menu.getKategori());
        return menuDAO.updateMenu(menu);
    }

    public boolean updateStok(String idMenu, int stokBaru) {
        System.out.println("🎯 SERVICE: updateStok dipanggil - ID: " + idMenu + " | Stok: " + stokBaru);
        return menuDAO.updateStok(idMenu, stokBaru);
    }
    
    public String formatHarga(double harga) {
    if (harga == (int) harga) {
        return String.format("Rp %,d", (int) harga);
    } else {
        return String.format("Rp %,.0f", harga);
    }
}

    public boolean updateMenuData(String idMenu, String namaMenu, double harga, String kategori) {
        System.out.println("🎯 SERVICE: updateMenuData dipanggil - " + namaMenu + " | Harga: " + harga);
        Menu menu = new Menu(idMenu, namaMenu, harga, kategori);
        return menuDAO.updateMenu(menu);
    }
    

    public boolean deleteMenu(String idMenu) {
        return menuDAO.deleteMenu(idMenu);
    }

    public List<Menu> cariMenu(String keyword) {
        List<Menu> allMenu = menuDAO.getAllMenu();
        return allMenu.stream()
                .filter(menu -> menu.getNamaMenu().toLowerCase().contains(keyword.toLowerCase())
                || menu.getKategori().toLowerCase().contains(keyword.toLowerCase()))
                .toList();
    }

    public List<Menu> getMenuByKategori(String kategori) {
        List<Menu> allMenu = menuDAO.getAllMenu();
        return allMenu.stream()
                .filter(menu -> menu.getKategori().equalsIgnoreCase(kategori))
                .toList();
    }
}
