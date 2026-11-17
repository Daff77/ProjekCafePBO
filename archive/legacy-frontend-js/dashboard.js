/**
 * Parley Dashboard View Module for NomCherry Café
 */

const DashboardModule = {
    async load() {
        try {
            const res = await API.getDashboard({ cabang: App.currentCabang });
            if (res.success) {
                this.render(res.data);
            }
        } catch (err) {
            console.error('Failed to load dashboard:', err);
        }
    },

    render(data) {
        // 1. Hero Revenue
        const revEl = document.getElementById('dash-hero-revenue');
        if (revEl) {
            revEl.textContent = App.formatRupiah(data.total_revenue_today);
        }

        const orderCountEl = document.getElementById('dash-hero-orders');
        if (orderCountEl) {
            orderCountEl.textContent = `${data.total_order_today} pesanan hari ini`;
        }

        // 2. Bar Chart Wells (Parley Style)
        const chartContainer = document.getElementById('dash-chart');
        if (chartContainer && data.monthly_chart) {
            chartContainer.innerHTML = data.monthly_chart.map(m => `
                <div class="hbar" title="${m.label}: ${App.formatRupiah(m.val)}">
                    <div class="hbar__well">
                        <div class="hbar__bar" style="--h: ${m.percentage}%;">
                            <span class="sr-only">${m.label}: ${App.formatRupiah(m.val)}</span>
                        </div>
                    </div>
                    <span class="hbar__lab">${m.label}</span>
                </div>
            `).join('');
        }

        // 3. Stat Cards
        const allRevEl = document.getElementById('dash-stat-allrevenue');
        if (allRevEl) allRevEl.textContent = App.formatRupiah(data.all_time_revenue);

        const allOrdersEl = document.getElementById('dash-stat-allorders');
        if (allOrdersEl) allOrdersEl.textContent = `${data.all_time_orders} Transaksi`;

        const lowStockEl = document.getElementById('dash-stat-lowstock');
        if (lowStockEl) {
            lowStockEl.textContent = `${data.low_stock_count} Menu`;
            lowStockEl.style.color = data.low_stock_count > 0 ? 'var(--warn)' : 'var(--good)';
        }

        // 4. Branch Comparison (Cabang 1 vs Cabang 2)
        const branchCompEl = document.getElementById('dash-branch-comparison');
        if (branchCompEl && data.branch_comparison) {
            branchCompEl.innerHTML = data.branch_comparison.map(c => `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--surface-2);border-radius:12px;border:1px solid var(--line);margin-bottom:8px;">
                    <div>
                        <div style="font-weight:700;font-size:0.88rem;color:var(--ink);">${c.nama_cabang}</div>
                        <div style="font-size:0.75rem;color:var(--ink-3);">${c.order_count} Transaksi tercatat</div>
                    </div>
                    <div style="font-weight:800;font-size:0.95rem;color:var(--c-cherry);">${App.formatRupiah(c.revenue)}</div>
                </div>
            `).join('');
        }

        // 5. Top 5 Menu
        const topMenuEl = document.getElementById('dash-top-menu');
        if (topMenuEl && data.top_items) {
            topMenuEl.innerHTML = data.top_items.length > 0 ? data.top_items.map((item, idx) => `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--line);">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span style="font-weight:800;color:var(--c-cherry);font-size:0.9rem;width:20px;">#${idx + 1}</span>
                        <div>
                            <div style="font-weight:600;font-size:0.86rem;color:var(--ink);">${item.nama_menu}</div>
                            <div style="font-size:0.75rem;color:var(--ink-3);">${item.total_qty} porsi terjual</div>
                        </div>
                    </div>
                    <div style="font-weight:700;font-size:0.85rem;color:var(--ink);">${App.formatRupiah(item.total_sales)}</div>
                </div>
            `).join('') : '<div style="color:var(--ink-muted);padding:10px;text-align:center;">Belum ada data penjualan</div>';
        }

        // 6. Recent Orders Feed
        const recentOrdersEl = document.getElementById('dash-recent-orders');
        if (recentOrdersEl && data.recent_orders) {
            recentOrdersEl.innerHTML = data.recent_orders.length > 0 ? data.recent_orders.map(o => `
                <tr>
                    <td style="font-weight:700;color:var(--c-cherry);">${o.id_pesanan}</td>
                    <td>${App.formatDateTime(o.tanggal_pesanan)}</td>
                    <td style="font-weight:600;">${o.nama_pelanggan || 'Pelanggan Umum'}</td>
                    <td><span class="status-pill is-success">${o.metode || 'Cash'}</span></td>
                    <td style="font-weight:700;">${App.formatRupiah(o.total)}</td>
                    <td>
                        <button class="btn-icon" title="Cetak Ulang Struk" onclick="PosModule.showReceipt('${o.id_pesanan}')">
                            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
                        </button>
                    </td>
                </tr>
            `).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--ink-muted);">Belum ada transaksi</td></tr>';
        }
    }
};

window.DashboardModule = DashboardModule;

