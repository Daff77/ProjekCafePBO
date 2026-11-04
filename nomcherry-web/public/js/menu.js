/**
 * Menu Management Module for NomCherry Café
 * Implements Test Cases 2.1, 2.2, 2.3
 */

const MenuModule = {
    menuList: [],
    editingMenuId: null,

    async load() {
        try {
            const res = await API.getMenu({ cabang: App.currentCabang });
            if (res.success) {
                this.menuList = res.data;
                this.renderTable();
            }
        } catch (err) {
            console.error('Failed to load menu:', err);
        }
    },

    renderTable() {
        const tbody = document.getElementById('menu-table-body');
        if (!tbody) return;

        if (this.menuList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--ink-muted);">Belum ada data menu.</td></tr>';
            return;
        }

        tbody.innerHTML = this.menuList.map(m => {
            const isLow = m.stok > 0 && m.stok <= 5;
            const isEmpty = m.stok <= 0;
            const stockBadge = isEmpty
                ? '<span class="status-pill is-danger">Habis</span>'
                : (isLow ? `<span class="status-pill is-warning">Sisa ${m.stok}</span>` : `<span class="status-pill is-success">${m.stok} Ready</span>`);

            const isImageUrl = m.gambar && (m.gambar.startsWith('http') || m.gambar.startsWith('assets/'));
            const thumbHtml = isImageUrl
                ? `<img src="${m.gambar}" style="width:42px;height:42px;border-radius:10px;object-fit:cover;box-shadow:0 1px 3px rgba(0,0,0,0.1);" alt="${m.nama_menu}" onerror="this.onerror=null;this.src='assets/logo.png'">`
                : `<span style="font-size:1.4rem;">${m.gambar || '☕'}</span>`;

            return `
                <tr>
                    <td style="font-weight:700;color:var(--c-cherry);">${m.id_menu}</td>
                    <td style="text-align:center;width:48px;">${thumbHtml}</td>
                    <td>
                        <div style="font-weight:700;color:var(--ink);">${m.nama_menu}</div>
                        <div style="font-size:0.75rem;color:var(--ink-3);">${m.deskripsi || '-'}</div>
                    </td>
                    <td><span class="chip" style="background:var(--surface-2);color:var(--ink-2);">${m.kategori}</span></td>
                    <td style="font-weight:700;color:var(--ink);">${App.formatRupiah(m.harga)}</td>
                    <td>${stockBadge}</td>
                    <td>
                        <div style="display:flex;gap:6px;">
                            <button class="btn-icon" title="Edit Menu" onclick="MenuModule.openEditModal('${m.id_menu}')">
                                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                            </button>
                            <button class="btn-icon is-delete" title="Hapus Menu" onclick="MenuModule.confirmDelete('${m.id_menu}', '${m.nama_menu}')">
                                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    },

    // Test Case 2.1: Open modal create
    openCreateModal() {
        this.editingMenuId = null;
        document.getElementById('menu-modal-title').textContent = 'Tambah Menu Baru';
        document.getElementById('form-menu-id').value = '';
        document.getElementById('form-menu-name').value = '';
        document.getElementById('form-menu-price').value = '';
        document.getElementById('form-menu-stock').value = '10';
        document.getElementById('form-menu-category').value = 'Minuman';
        document.getElementById('form-menu-icon').value = '☕';
        document.getElementById('form-menu-desc').value = '';

        document.getElementById('modal-menu-form').classList.add('is-open');
    },

    // Test Case 2.2: Open modal edit
    openEditModal(id) {
        const item = this.menuList.find(m => m.id_menu === id);
        if (!item) return;

        this.editingMenuId = id;
        document.getElementById('menu-modal-title').textContent = `Edit Menu: ${item.nama_menu}`;
        document.getElementById('form-menu-id').value = item.id_menu;
        document.getElementById('form-menu-name').value = item.nama_menu;
        document.getElementById('form-menu-price').value = item.harga;
        document.getElementById('form-menu-stock').value = item.stok;
        document.getElementById('form-menu-category').value = item.kategori;
        document.getElementById('form-menu-icon').value = item.gambar || '☕';
        document.getElementById('form-menu-desc').value = item.deskripsi || '';

        document.getElementById('modal-menu-form').classList.add('is-open');
    },

    async saveMenu() {
        const nama = document.getElementById('form-menu-name').value.trim();
        const harga = parseFloat(document.getElementById('form-menu-price').value);
        const stok = parseInt(document.getElementById('form-menu-stock').value, 10);
        const kategori = document.getElementById('form-menu-category').value;
        const gambar = document.getElementById('form-menu-icon').value.trim();
        const deskripsi = document.getElementById('form-menu-desc').value.trim();

        if (!nama || isNaN(harga) || harga < 0) {
            App.showToast('Nama menu dan harga harus valid!', 'error');
            return;
        }

        const payload = {
            nama_menu: nama,
            harga: harga,
            stok: isNaN(stok) ? 0 : stok,
            kategori: kategori,
            gambar: gambar || '☕',
            deskripsi: deskripsi,
            id_cabang: App.currentCabang
        };

        try {
            if (this.editingMenuId) {
                // Test Case 2.2: Edit menu
                const res = await API.updateMenu(this.editingMenuId, payload);
                if (res.success) {
                    App.showToast('Perubahan menu berhasil disimpan', 'success');
                }
            } else {
                // Test Case 2.1: Tambah menu baru
                const res = await API.createMenu(payload);
                if (res.success) {
                    App.showToast('Menu baru berhasil ditambahkan', 'success');
                }
            }

            document.getElementById('modal-menu-form').classList.remove('is-open');
            await this.load();
        } catch (err) {
            App.showToast(err.message, 'error');
        }
    },

    // Test Case 2.3: Hapus menu
    confirmDelete(id, nama) {
        if (confirm(`Yakin ingin menghapus menu "${nama}"? Data yang sudah dihapus tidak dapat dikembalikan.`)) {
            API.deleteMenu(id)
                .then(res => {
                    if (res.success) {
                        App.showToast('Menu berhasil terhapus', 'success');
                        this.load();
                    }
                })
                .catch(err => App.showToast(err.message, 'error'));
        }
    }
};

window.MenuModule = MenuModule;

