/**
 * Stock & Inventory Management Module for NomCherry Café
 * Implements Test Cases 6.1, 6.2, 6.3, 6.4
 */

const StockModule = {
    stockList: [],
    logs: [],

    async load() {
        await Promise.all([this.loadStock(), this.loadLogs()]);
    },

    async loadStock() {
        try {
            const res = await API.getStock({ cabang: App.currentCabang });
            if (res.success) {
                this.stockList = res.data;
                this.renderStockTable();
            }
        } catch (err) {
            console.error('Failed to load stock list:', err);
        }
    },

    async loadLogs() {
        try {
            const res = await API.getStockLogs({ cabang: App.currentCabang });
            if (res.success) {
                this.logs = res.data;
                this.renderLogsTable();
            }
        } catch (err) {
            console.error('Failed to load stock logs:', err);
        }
    },

    renderStockTable() {
        const tbody = document.getElementById('stock-table-body');
        if (!tbody) return;

        if (this.stockList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--ink-muted);">Belum ada data stok.</td></tr>';
            return;
        }

        tbody.innerHTML = this.stockList.map(s => {
            // Test Case 6.3: Stok expired detection
            let expBadge = '<span style="color:var(--ink-muted);font-size:0.75rem;">-</span>';
            if (s.is_expired) {
                expBadge = `<span class="status-pill is-danger" title="Kadaluarsa: ${s.tanggal_kadaluarsa}">⚠️ EXPIRED (${s.tanggal_kadaluarsa})</span>`;
            } else if (s.is_near_expiry) {
                expBadge = `<span class="status-pill is-warning" title="Segera Kadaluarsa: ${s.tanggal_kadaluarsa}">Mendekati Exp (${s.tanggal_kadaluarsa})</span>`;
            } else if (s.tanggal_kadaluarsa) {
                expBadge = `<span style="font-size:0.75rem;color:var(--good);">${s.tanggal_kadaluarsa}</span>`;
            }

            let statusPill = `<span class="status-pill is-success">Aman</span>`;
            if (s.stok <= 0) {
                statusPill = `<span class="status-pill is-danger">Habis</span>`;
            } else if (s.stok <= 5) {
                statusPill = `<span class="status-pill is-warning">Menipis</span>`;
            }

            return `
                <tr>
                    <td style="font-weight:700;color:var(--c-cherry);">${s.id_menu}</td>
                    <td>
                        <div style="font-weight:700;color:var(--ink);">${s.nama_menu}</div>
                        <div style="font-size:0.75rem;color:var(--ink-3);">${s.kategori}</div>
                    </td>
                    <td style="font-weight:800;font-size:1.1rem;color:${s.stok <= 0 ? 'var(--bad)' : 'var(--ink)'};">
                        ${s.stok}
                    </td>
                    <td>${statusPill}</td>
                    <td>${expBadge}</td>
                    <td>${s.nama_cabang || 'Pusat (Jemur)'}</td>
                    <td>
                        <button class="btn-secondary" style="padding:4px 10px;font-size:0.75rem;" onclick="StockModule.openAdjustModal('${s.id_menu}', '${s.nama_menu}', ${s.stok})">
                            ± Sesuaikan Stok
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    },

    renderLogsTable() {
        const tbody = document.getElementById('stock-logs-table-body');
        if (!tbody) return;

        if (this.logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--ink-muted);">Belum ada riwayat mutasi stok.</td></tr>';
            return;
        }

        tbody.innerHTML = this.logs.slice(0, 15).map(l => {
            const isPlus = l.perubahan > 0;
            const changePill = isPlus
                ? `<span style="font-weight:700;color:var(--good);">+${l.perubahan}</span>`
                : `<span style="font-weight:700;color:var(--bad);">${l.perubahan}</span>`;

            return `
                <tr>
                    <td>${App.formatDateTime(l.tanggal)}</td>
                    <td style="font-weight:600;">${l.nama_menu}</td>
                    <td><span class="chip" style="font-size:0.72rem;">${l.jenis}</span></td>
                    <td>${changePill}</td>
                    <td style="font-weight:700;">${l.stok_sisa}</td>
                    <td style="font-size:0.78rem;color:var(--ink-2);">${l.keterangan || '-'}</td>
                </tr>
            `;
        }).join('');
    },

    openAdjustModal(idMenu, namaMenu, stokSekarang) {
        document.getElementById('adjust-menu-id').value = idMenu;
        document.getElementById('adjust-menu-name').textContent = namaMenu;
        document.getElementById('adjust-current-stock').textContent = `${stokSekarang} Porsi/Unit`;
        document.getElementById('adjust-qty-input').value = '5';
        document.getElementById('adjust-type-select').value = 'MASUK';
        document.getElementById('adjust-notes-input').value = 'Restock barang masuk';

        const futureDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
        document.getElementById('adjust-expiry-input').value = futureDate;

        document.getElementById('modal-stock-adjust').classList.add('is-open');
    },

    // Test Case 6.1 & 6.2: Save Stock Adjustment
    async saveStockAdjustment() {
        const idMenu = document.getElementById('adjust-menu-id').value;
        const jenis = document.getElementById('adjust-type-select').value;
        const qty = parseInt(document.getElementById('adjust-qty-input').value, 10);
        const expiry = document.getElementById('adjust-expiry-input').value;
        const notes = document.getElementById('adjust-notes-input').value.trim();

        if (isNaN(qty) || qty <= 0) {
            App.showToast('Jumlah stok harus berupa angka positif!', 'error');
            return;
        }

        const payload = {
            id_menu: idMenu,
            id_cabang: App.currentCabang,
            id_pengguna: App.currentUser.id_pengguna,
            jenis: jenis,
            jumlah: qty,
            tanggal_kadaluarsa: expiry || null,
            keterangan: notes
        };

        try {
            const res = await API.adjustStock(payload);
            if (res.success) {
                App.showToast(`Stok berhasil diperbarui: Sisa ${res.data.stok_baru}`, 'success');
                document.getElementById('modal-stock-adjust').classList.remove('is-open');
                await this.load();
            }
        } catch (err) {
            App.showToast(err.message, 'error');
        }
    }
};

window.StockModule = StockModule;

