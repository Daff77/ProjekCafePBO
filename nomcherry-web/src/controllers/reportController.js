/**
 * Report & Analytics Controller for NomCherry Café
 * Implements test cases 7.1, 7.2, 7.3, 7.4
 */

const db = require('../database/db');
const dateService = require('../services/dateService');

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function serverError(res, err, context) {
    console.error(`[reportController] ${context}:`, err.message);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' });
}

function csvCell(value) {
    let text = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(text)) {
        text = `'${text}`;
    }
    return `"${text.replace(/"/g, '""')}"`;
}

exports.getDashboardMetrics = (req, res) => {
    try {
        const requestedBranch = req.query.cabang;
        const branch = req.user && req.user.peran === 'kasir'
            ? req.user.id_cabang
            : requestedBranch;

        let cabangFilter = '';
        const params = [];

        if (branch && branch !== 'all' && branch !== 'Semua') {
            cabangFilter = ' AND p.id_cabang = ?';
            params.push(branch);
        }

        const todayStats = db.get(`
            SELECT COUNT(*) AS total_order_today, COALESCE(SUM(p.total), 0) AS total_revenue_today
            FROM pesanan p
            WHERE date(p.tanggal_pesanan, ?) = ? ${cabangFilter}
        `, [dateService.sqlModifier(), dateService.today(), ...params]);

        const allTimeStats = db.get(`
            SELECT COUNT(*) AS total_orders, COALESCE(SUM(p.total), 0) AS total_revenue
            FROM pesanan p
            WHERE 1=1 ${cabangFilter}
        `, params);

        const lowStockStats = db.get(`
            SELECT COUNT(*) AS count
            FROM menu
            WHERE stok <= 5 ${branch && branch !== 'all' && branch !== 'Semua' ? 'AND (id_cabang = ? OR id_cabang IS NULL)' : ''}
        `, branch && branch !== 'all' && branch !== 'Semua' ? [branch] : []);

        // Real monthly trend from completed orders (last 8 months)
        const monthlyRows = db.query(`
            SELECT strftime('%Y-%m', p.tanggal_pesanan, ?) AS ym,
                   COALESCE(SUM(p.total), 0) AS total
            FROM pesanan p
            WHERE p.status = 'completed' ${cabangFilter}
            GROUP BY ym
            ORDER BY ym DESC
            LIMIT 8
        `, [dateService.sqlModifier(), ...params]);

        const maxMonthly = Math.max(1, ...monthlyRows.map(row => row.total));
        const monthlyData = monthlyRows
            .slice()
            .reverse()
            .map(row => {
                const monthIndex = parseInt(String(row.ym).slice(5, 7), 10) - 1;
                return {
                    label: MONTH_LABELS[monthIndex] || String(row.ym),
                    val: row.total,
                    percentage: Math.round((row.total / maxMonthly) * 100)
                };
            });

        const topItems = db.query(`
            SELECT dp.nama_menu, SUM(dp.jumlah) AS total_qty, SUM(dp.subtotal) AS total_sales
            FROM detail_pesanan dp
            JOIN pesanan p ON dp.id_pesanan = p.id_pesanan
            WHERE 1=1 ${cabangFilter}
            GROUP BY dp.nama_menu
            ORDER BY total_qty DESC
            LIMIT 5
        `, params);

        const branchComp = db.query(`
            SELECT c.id_cabang, c.nama_cabang,
                   COUNT(p.id_pesanan) AS order_count,
                   COALESCE(SUM(p.total), 0) AS revenue
            FROM cabang c
            LEFT JOIN pesanan p ON c.id_cabang = p.id_cabang
            GROUP BY c.id_cabang, c.nama_cabang
        `);

        const recentOrders = db.query(`
            SELECT p.id_pesanan, p.nama_pelanggan, p.total, p.tanggal_pesanan, p.status, pb.metode, c.nama_cabang
            FROM pesanan p
            LEFT JOIN pembayaran pb ON p.id_pesanan = pb.id_pesanan
            LEFT JOIN cabang c ON p.id_cabang = c.id_cabang
            WHERE 1=1 ${cabangFilter}
            ORDER BY p.tanggal_pesanan DESC
            LIMIT 6
        `, params);

        return res.json({
            success: true,
            data: {
                total_revenue_today: todayStats.total_revenue_today,
                total_order_today: todayStats.total_order_today,
                all_time_revenue: allTimeStats.total_revenue,
                all_time_orders: allTimeStats.total_orders,
                low_stock_count: lowStockStats.count,
                monthly_chart: monthlyData,
                top_items: topItems,
                branch_comparison: branchComp,
                recent_orders: recentOrders
            }
        });
    } catch (err) {
        return serverError(res, err, 'getDashboardMetrics');
    }
};

exports.getAnalytics = (req, res) => {
    try {
        const requestedBranch = req.query.cabang;
        const branch = req.user && req.user.peran === 'kasir'
            ? req.user.id_cabang
            : requestedBranch;

        let branchFilter = '';
        const params = [];
        if (branch && branch !== 'all' && branch !== 'Semua') {
            branchFilter = ' AND p.id_cabang = ?';
            params.push(branch);
        }

        const categoryRows = db.query(`
            SELECT COALESCE(m.kategori, 'Lainnya') AS kategori,
                   COALESCE(SUM(dp.subtotal), 0) AS total
            FROM detail_pesanan dp
            JOIN pesanan p ON dp.id_pesanan = p.id_pesanan
            LEFT JOIN menu m ON dp.id_menu = m.id_menu
            WHERE p.status = 'completed' ${branchFilter}
            GROUP BY kategori
            ORDER BY total DESC
        `, params);

        const categoryTotal = categoryRows.reduce((sum, row) => sum + row.total, 0);
        const categoryBreakdown = categoryRows.map(row => ({
            kategori: row.kategori,
            total: row.total,
            percentage: categoryTotal > 0 ? Math.round((row.total / categoryTotal) * 100) : 0
        }));

        const monthlyRows = db.query(`
            SELECT strftime('%Y-%m', p.tanggal_pesanan, ?) AS ym,
                   COALESCE(SUM(p.total), 0) AS total,
                   COUNT(*) AS orders
            FROM pesanan p
            WHERE p.status = 'completed' ${branchFilter}
            GROUP BY ym
            ORDER BY ym DESC
            LIMIT 6
        `, [dateService.sqlModifier(), ...params]);

        const monthly = monthlyRows.slice().reverse().map(row => {
            const monthIndex = parseInt(String(row.ym).slice(5, 7), 10) - 1;
            return {
                label: MONTH_LABELS[monthIndex] || String(row.ym),
                total: row.total,
                orders: row.orders
            };
        });

        const heatRows = db.query(`
            SELECT CAST(strftime('%w', p.tanggal_pesanan, ?) AS INTEGER) AS dow,
                   CAST(strftime('%H', p.tanggal_pesanan, ?) AS INTEGER) AS hour,
                   COALESCE(SUM(p.total), 0) AS total
            FROM pesanan p
            WHERE p.status = 'completed' ${branchFilter}
            GROUP BY dow, hour
        `, [dateService.sqlModifier(), dateService.sqlModifier(), ...params]);

        const slots = ['Pagi', 'Siang', 'Sore', 'Malam'];
        const heatMatrix = slots.map(slot => ({ slot, vals: [0, 0, 0, 0, 0, 0, 0] }));
        heatRows.forEach(row => {
            const dayIndex = (row.dow + 6) % 7;
            let slotIndex = 0;
            if (row.hour >= 11 && row.hour < 15) slotIndex = 1;
            else if (row.hour >= 15 && row.hour < 19) slotIndex = 2;
            else if (row.hour >= 19) slotIndex = 3;
            heatMatrix[slotIndex].vals[dayIndex] += row.total;
        });

        const maxHeat = Math.max(1, ...heatMatrix.flatMap(row => row.vals));
        heatMatrix.forEach(row => {
            row.vals = row.vals.map(value => Math.round((value / maxHeat) * 100));
        });

        const topItems = db.query(`
            SELECT dp.nama_menu, SUM(dp.jumlah) AS total_qty, SUM(dp.subtotal) AS total_sales
            FROM detail_pesanan dp
            JOIN pesanan p ON dp.id_pesanan = p.id_pesanan
            WHERE p.status = 'completed' ${branchFilter}
            GROUP BY dp.nama_menu
            ORDER BY total_qty DESC
            LIMIT 6
        `, params);

        const summary = db.get(`
            SELECT COUNT(*) AS total_transaksi,
                   COALESCE(SUM(p.total), 0) AS total_pendapatan,
                   COALESCE(SUM(p.pajak), 0) AS total_pajak
            FROM pesanan p
            WHERE p.status = 'completed' ${branchFilter}
        `, params);

        const cupsRow = db.get(`
            SELECT COALESCE(SUM(dp.jumlah), 0) AS total_porsi
            FROM detail_pesanan dp
            JOIN pesanan p ON dp.id_pesanan = p.id_pesanan
            WHERE p.status = 'completed' ${branchFilter}
        `, params);
        summary.total_porsi = cupsRow ? cupsRow.total_porsi : 0;

        return res.json({
            success: true,
            data: {
                summary,
                monthly,
                category_breakdown: categoryBreakdown,
                heatmap: heatMatrix,
                top_items: topItems
            }
        });
    } catch (err) {
        return serverError(res, err, 'getAnalytics');
    }
};

exports.getSalesReport = (req, res) => {
    const query = req.query || {};
    try {
        const { date_start, date_end, cabang, format } = query;
        const branch = req.user && req.user.peran === 'kasir' ? req.user.id_cabang : cabang;

        let sql = `
            SELECT p.id_pesanan, p.tanggal_pesanan, p.id_cabang, c.nama_cabang,
                   p.nama_pelanggan, p.jenis_pesanan, p.nomor_meja, p.subtotal, p.pajak, p.diskon, p.total,
                   pb.metode, pb.referensi, pg.nama_pengguna AS nama_kasir, s.nomor_struk
            FROM pesanan p
            LEFT JOIN cabang c ON p.id_cabang = c.id_cabang
            LEFT JOIN pengguna pg ON p.id_pengguna = pg.id_pengguna
            LEFT JOIN pembayaran pb ON p.id_pesanan = pb.id_pesanan
            LEFT JOIN struk s ON p.id_pesanan = s.id_pesanan
            WHERE p.status = 'completed'
        `;
        const params = [];

        if (branch && branch !== 'all' && branch !== 'Semua') {
            sql += ' AND p.id_cabang = ?';
            params.push(branch);
        }

        if (date_start && date_start.trim() !== '') {
            sql += ' AND date(p.tanggal_pesanan, ?) >= date(?)';
            params.push(dateService.sqlModifier(), date_start);
        }

        if (date_end && date_end.trim() !== '') {
            sql += ' AND date(p.tanggal_pesanan, ?) <= date(?)';
            params.push(dateService.sqlModifier(), date_end);
        }

        sql += ' ORDER BY p.tanggal_pesanan DESC';
        const orders = db.query(sql, params);

        let grandTotalRevenue = 0;
        let grandTotalPajak = 0;
        let grandTotalDiskon = 0;
        const methodBreakdown = { Cash: 0, QRIS: 0, Debit: 0, Transfer: 0 };

        orders.forEach(o => {
            grandTotalRevenue += o.total;
            grandTotalPajak += o.pajak;
            grandTotalDiskon += o.diskon;
            if (o.metode && methodBreakdown[o.metode] !== undefined) {
                methodBreakdown[o.metode] += o.total;
            }
        });

        if (format === 'csv' || query.export === 'csv') {
            let csv = 'ID Pesanan,Nomor Struk,Tanggal,Cabang,Pelanggan,Jenis Pesanan,Meja,Kasir,Metode,Subtotal,Pajak,Diskon,Total\n';
            orders.forEach(o => {
                csv += [
                    csvCell(o.id_pesanan),
                    csvCell(o.nomor_struk || '-'),
                    csvCell(o.tanggal_pesanan),
                    csvCell(o.nama_cabang),
                    csvCell(o.nama_pelanggan),
                    csvCell(o.jenis_pesanan || 'Dine-In'),
                    csvCell(o.nomor_meja || '-'),
                    csvCell(o.nama_kasir),
                    csvCell(o.metode),
                    csvCell(o.subtotal),
                    csvCell(o.pajak),
                    csvCell(o.diskon),
                    csvCell(o.total)
                ].join(',') + '\n';
            });
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename=laporan-penjualan-nomcherry.csv');
            return res.send(csv);
        }

        return res.json({
            success: true,
            data: {
                filter: { date_start, date_end, cabang: branch },
                summary: {
                    total_transaksi: orders.length,
                    total_pendapatan: grandTotalRevenue,
                    total_pajak: grandTotalPajak,
                    total_diskon: grandTotalDiskon,
                    rata_rata_transaksi: orders.length > 0 ? Math.round(grandTotalRevenue / orders.length) : 0,
                    metode_pembayaran: methodBreakdown
                },
                transaksi: orders
            }
        });
    } catch (err) {
        return serverError(res, err, 'getSalesReport');
    }
};
