/**
 * Sales Report & Analytics Module for NomCherry Café
 * Implements Test Cases 7.1, 7.2, 7.3, 7.4
 */

const ReportsModule = {
    reportData: null,

    async load() {
        const todayStr = new Date().toISOString().slice(0, 10);
        const startInput = document.getElementById('report-date-start');
        const endInput = document.getElementById('report-date-end');
        const branchSelect = document.getElementById('report-branch-select');

        if (startInput && !startInput.value) startInput.value = todayStr;
        if (endInput && !endInput.value) endInput.value = todayStr;
        if (branchSelect) branchSelect.value = App.currentCabang;

        await this.generateReport();
    },

    // Test Case 7.1, 7.2, 7.3: Generate report with filters
    async generateReport() {
        const dateStart = document.getElementById('report-date-start').value;
        const dateEnd = document.getElementById('report-date-end').value;
        const cabang = document.getElementById('report-branch-select').value;

        try {
            const res = await API.getSalesReport({
                date_start: dateStart,
                date_end: dateEnd,
                cabang: cabang
            });

            if (res.success) {
                this.reportData = res.data;
                this.renderReport(res.data);
            }
        } catch (err) {
            App.showToast('Gagal memuat laporan: ' + err.message, 'error');
        }
    },

    renderReport(data) {
        const summary = data.summary;

        // KPI Metrics
        const revEl = document.getElementById('report-total-revenue');
        const countEl = document.getElementById('report-total-transactions');
        const avgEl = document.getElementById('report-avg-transaction');
        const taxEl = document.getElementById('report-total-tax');

        if (revEl) revEl.textContent = App.formatRupiah(summary.total_pendapatan);
        if (countEl) countEl.textContent = `${summary.total_transaksi} Transaksi`;
        if (avgEl) avgEl.textContent = App.formatRupiah(summary.rata_rata_transaksi);
        if (taxEl) taxEl.textContent = App.formatRupiah(summary.total_pajak);

        // Payment Methods Breakdown
        const methodContainer = document.getElementById('report-payment-breakdown');
        if (methodContainer && summary.metode_pembayaran) {
            methodContainer.innerHTML = Object.entries(summary.metode_pembayaran).map(([method, total]) => `
                <div style="flex:1;background:var(--surface-2);padding:10px 14px;border-radius:12px;border:1px solid var(--line);min-width:140px;">
                    <div style="font-size:0.75rem;font-weight:700;color:var(--ink-3);">${method.toUpperCase()}</div>
                    <div style="font-size:1rem;font-weight:800;color:var(--ink);">${App.formatRupiah(total)}</div>
                </div>
            `).join('');
        }

        // Transactions Table
        const tbody = document.getElementById('report-table-body');
        if (!tbody) return;

        if (data.transaksi.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--ink-muted);">Tidak ada transaksi pada filter periode dan cabang ini.</td></tr>';
            return;
        }

        tbody.innerHTML = data.transaksi.map(t => `
            <tr>
                <td style="font-weight:700;color:var(--c-cherry);">${t.id_pesanan}</td>
                <td>${t.nomor_struk || '-'}</td>
                <td>${App.formatDateTime(t.tanggal_pesanan)}</td>
                <td style="font-weight:600;">${t.nama_cabang}</td>
                <td>${t.nama_pelanggan || 'Pelanggan Umum'}</td>
                <td><span class="status-pill is-success">${t.metode || 'Cash'}</span></td>
                <td>${t.nama_kasir || '-'}</td>
                <td style="font-weight:800;color:var(--ink);text-align:right;">${App.formatRupiah(t.total)}</td>
            </tr>
        `).join('');
    },

    // Test Case 7.4: Ekspor Laporan (CSV download & Print)
    exportCSV() {
        const dateStart = document.getElementById('report-date-start').value;
        const dateEnd = document.getElementById('report-date-end').value;
        const cabang = document.getElementById('report-branch-select').value;

        const url = `/api/reports/sales?date_start=${dateStart}&date_end=${dateEnd}&cabang=${cabang}&format=csv`;
        window.open(url, '_blank');
        App.showToast('Laporan penjualan CSV berhasil diunduh', 'success');
    },

    printReport() {
        window.print();
    }
};

window.ReportsModule = ReportsModule;

