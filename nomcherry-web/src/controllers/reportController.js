/**
 * Report & Analytics Controller for NomCherry Café
 * Server-side SQL aggregation over complete datasets (>500 orders),
 * consistent business-day boundaries via dateService, and stored historical tax sums.
 */

const db = require('../database/db');
const dateService = require('../services/dateService');
const { resolveAuthorizedBranch } = require('../services/authService');

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const DAY_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

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

function formatShortDateLabel(ymd, includeWeekday = false) {
    const [y, m, d] = String(ymd).split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const mon = MONTH_LABELS[m - 1] || String(m);
    if (includeWeekday) {
        return `${DAY_SHORT[dt.getUTCDay()]} ${d}/${m}`;
    }
    return `${d} ${mon}`;
}

function computePeriodSeries(rangeInfo, branchFilterSql, branchParams, modifier) {
    if (rangeInfo.range === 'today') {
        const hourRows = db.query(`
            SELECT CAST(strftime('%H', p.tanggal_pesanan, ?) AS INTEGER) AS hr,
                   COUNT(*) AS orders,
                   COALESCE(SUM(p.total), 0) AS gross_total,
                   COALESCE(SUM(p.subtotal - p.diskon), 0) AS nett_sales
            FROM pesanan p
            WHERE p.status = 'completed'
              AND date(p.tanggal_pesanan, ?) = ?
              ${branchFilterSql}
            GROUP BY hr
        `, [modifier, modifier, rangeInfo.business_today, ...branchParams]);

        const buckets = [
            { start: 0, label: '00:00' },
            { start: 3, label: '03:00' },
            { start: 6, label: '06:00' },
            { start: 9, label: '09:00' },
            { start: 12, label: '12:00' },
            { start: 15, label: '15:00' },
            { start: 18, label: '18:00' },
            { start: 21, label: '21:00' }
        ].map(b => ({ label: b.label, start: b.start, orders: 0, gross_total: 0, nett_sales: 0 }));

        hourRows.forEach(row => {
            const idx = Math.min(7, Math.max(0, Math.floor(Number(row.hr || 0) / 3)));
            buckets[idx].orders += Number(row.orders || 0);
            buckets[idx].gross_total += Number(row.gross_total || 0);
            buckets[idx].nett_sales += Number(row.nett_sales || 0);
        });

        return buckets;
    }

    const dailyRows = db.query(`
        SELECT date(p.tanggal_pesanan, ?) AS ymd,
               COUNT(*) AS orders,
               COALESCE(SUM(p.total), 0) AS gross_total,
               COALESCE(SUM(p.subtotal - p.diskon), 0) AS nett_sales
        FROM pesanan p
        WHERE p.status = 'completed'
          AND date(p.tanggal_pesanan, ?) >= ?
          AND date(p.tanggal_pesanan, ?) <= ?
          ${branchFilterSql}
        GROUP BY ymd
        ORDER BY ymd ASC
    `, [modifier, modifier, rangeInfo.date_start, modifier, rangeInfo.date_end, ...branchParams]);

    const byDay = new Map(dailyRows.map(r => [r.ymd, r]));
    const points = [];
    for (let i = 0; i < rangeInfo.days; i++) {
        const ymd = dateService.addDays(rangeInfo.date_start, i);
        const found = byDay.get(ymd);
        points.push({
            date: ymd,
            label: formatShortDateLabel(ymd, rangeInfo.range === '7d'),
            orders: found ? Number(found.orders || 0) : 0,
            gross_total: found ? Number(found.gross_total || 0) : 0,
            nett_sales: found ? Number(found.nett_sales || 0) : 0
        });
    }
    return points;
}

exports.getDashboardMetrics = (req, res) => {
    try {
        const query = req.query || {};
        const resolved = resolveAuthorizedBranch(req, query.cabang, { allowAll: true });
        if (resolved.errorStatus) {
            return res.status(resolved.errorStatus).json({ success: false, message: resolved.errorMessage });
        }
        const branch = resolved.branchId;

        let cabangFilter = '';
        const branchParams = [];
        if (branch && branch !== 'all') {
            cabangFilter = ' AND p.id_cabang = ?';
            branchParams.push(branch);
        }

        const modifier = dateService.sqlModifier();
        const businessToday = dateService.today();
        const rangeInfo = dateService.resolveRange(query.range, businessToday);
        const periodFilter = ' AND date(p.tanggal_pesanan, ?) >= ? AND date(p.tanggal_pesanan, ?) <= ?';
        const periodParams = [modifier, rangeInfo.date_start, modifier, rangeInfo.date_end, ...branchParams];

        // 1. Exact period totals from stored transaction columns (no recalculation from current settings!)
        const periodStats = db.get(`
            SELECT COUNT(*) AS order_count,
                   COALESCE(SUM(p.subtotal), 0) AS subtotal_sum,
                   COALESCE(SUM(p.diskon), 0) AS discount_sum,
                   COALESCE(SUM(p.subtotal - p.diskon), 0) AS nett_sales,
                   COALESCE(SUM(p.pajak), 0) AS tax_sum,
                   COALESCE(SUM(p.total), 0) AS gross_total
            FROM pesanan p
            WHERE p.status = 'completed' ${periodFilter} ${cabangFilter}
        `, periodParams);

        const periodItemsRow = db.get(`
            SELECT COALESCE(SUM(dp.jumlah), 0) AS items_sold
            FROM detail_pesanan dp
            JOIN pesanan p ON dp.id_pesanan = p.id_pesanan
            WHERE p.status = 'completed' ${periodFilter} ${cabangFilter}
        `, periodParams);

        // Previous period comparison (honest null pct when previous period had 0 sales)
        const prevStats = db.get(`
            SELECT COUNT(*) AS order_count,
                   COALESCE(SUM(p.subtotal - p.diskon), 0) AS nett_sales,
                   COALESCE(SUM(p.total), 0) AS gross_total
            FROM pesanan p
            WHERE p.status = 'completed'
              AND date(p.tanggal_pesanan, ?) >= ?
              AND date(p.tanggal_pesanan, ?) <= ?
              ${cabangFilter}
        `, [modifier, rangeInfo.prev_start, modifier, rangeInfo.prev_end, ...branchParams]);

        const orderCount = Number(periodStats.order_count || 0);
        const grossTotal = Number(periodStats.gross_total || 0);
        const nettSales = Number(periodStats.nett_sales || 0);
        const taxSum = Number(periodStats.tax_sum || 0);
        const discountSum = Number(periodStats.discount_sum || 0);
        const subtotalSum = Number(periodStats.subtotal_sum || 0);
        const itemsSold = Number(periodItemsRow ? periodItemsRow.items_sold : 0);
        const prevGross = Number(prevStats ? prevStats.gross_total : 0);
        const prevNett = Number(prevStats ? prevStats.nett_sales : 0);
        const deltaAmount = grossTotal - prevGross;
        const deltaPct = prevGross > 0 ? Math.round(((grossTotal - prevGross) / prevGross) * 1000) / 10 : null;

        // 2. Payment breakdown for the EXACT same period & branch
        const payRows = db.query(`
            SELECT COALESCE(pb.metode, 'Cash') AS metode,
                   COUNT(*) AS count,
                   COALESCE(SUM(p.total), 0) AS total
            FROM pesanan p
            LEFT JOIN pembayaran pb ON p.id_pesanan = pb.id_pesanan
            WHERE p.status = 'completed' ${periodFilter} ${cabangFilter}
            GROUP BY COALESCE(pb.metode, 'Cash')
        `, periodParams);

        const paymentBreakdown = {
            QRIS: { count: 0, total: 0, pct: 0 },
            Cash: { count: 0, total: 0, pct: 0 },
            Debit: { count: 0, total: 0, pct: 0 },
            Transfer: { count: 0, total: 0, pct: 0 },
            cashless_total: 0,
            cashless_pct: 0,
            total_paid: grossTotal
        };
        payRows.forEach(r => {
            const key = paymentBreakdown[r.metode] ? r.metode : 'Cash';
            paymentBreakdown[key].count += Number(r.count || 0);
            paymentBreakdown[key].total += Number(r.total || 0);
        });
        if (grossTotal > 0) {
            const qPct = Math.round((paymentBreakdown.QRIS.total / grossTotal) * 100);
            const cPct = Math.round((paymentBreakdown.Cash.total / grossTotal) * 100);
            const cardTotal = paymentBreakdown.Debit.total + paymentBreakdown.Transfer.total;
            const dPct = Math.max(0, 100 - qPct - cPct);
            paymentBreakdown.QRIS.pct = qPct;
            paymentBreakdown.Cash.pct = cPct;
            paymentBreakdown.Debit.pct = cardTotal > 0 ? dPct : 0;
            paymentBreakdown.cashless_total = paymentBreakdown.QRIS.total + cardTotal;
            paymentBreakdown.cashless_pct = Math.round((paymentBreakdown.cashless_total / grossTotal) * 100);
        }

        // 3. Category breakdown for the EXACT same period & branch
        const catRows = db.query(`
            SELECT COALESCE(m.kategori, 'Lainnya') AS kategori,
                   COALESCE(SUM(dp.jumlah), 0) AS qty,
                   COALESCE(SUM(dp.subtotal), 0) AS total
            FROM detail_pesanan dp
            JOIN pesanan p ON dp.id_pesanan = p.id_pesanan
            LEFT JOIN menu m ON dp.id_menu = m.id_menu
            WHERE p.status = 'completed' ${periodFilter} ${cabangFilter}
            GROUP BY kategori
            ORDER BY total DESC
        `, periodParams);
        const catSum = catRows.reduce((s, r) => s + Number(r.total || 0), 0);
        const categoryBreakdown = catRows.map(r => ({
            kategori: r.kategori,
            qty: Number(r.qty || 0),
            total: Number(r.total || 0),
            percentage: catSum > 0 ? Math.round((Number(r.total || 0) / catSum) * 100) : 0
        }));

        // 4. Order type breakdown for the EXACT same period & branch
        const typeRows = db.query(`
            SELECT COALESCE(p.jenis_pesanan, 'Dine-In') AS jenis_pesanan,
                   COUNT(*) AS count,
                   COALESCE(SUM(p.total), 0) AS total
            FROM pesanan p
            WHERE p.status = 'completed' ${periodFilter} ${cabangFilter}
            GROUP BY COALESCE(p.jenis_pesanan, 'Dine-In')
        `, periodParams);
        const orderTypeBreakdown = {
            'Dine-In': { count: 0, total: 0, pct: 0 },
            Takeaway: { count: 0, total: 0, pct: 0 },
            Delivery: { count: 0, total: 0, pct: 0 }
        };
        typeRows.forEach(r => {
            const k = orderTypeBreakdown[r.jenis_pesanan] ? r.jenis_pesanan : 'Dine-In';
            orderTypeBreakdown[k].count += Number(r.count || 0);
            orderTypeBreakdown[k].total += Number(r.total || 0);
        });
        if (orderCount > 0) {
            orderTypeBreakdown['Dine-In'].pct = Math.round((orderTypeBreakdown['Dine-In'].count / orderCount) * 100);
            orderTypeBreakdown.Takeaway.pct = Math.round((orderTypeBreakdown.Takeaway.count / orderCount) * 100);
            orderTypeBreakdown.Delivery.pct = Math.max(0, 100 - orderTypeBreakdown['Dine-In'].pct - orderTypeBreakdown.Takeaway.pct);
        }

        // 5. Best item in the selected period & branch
        const periodTopItems = db.query(`
            SELECT dp.nama_menu, SUM(dp.jumlah) AS total_qty, SUM(dp.subtotal) AS total_sales
            FROM detail_pesanan dp
            JOIN pesanan p ON dp.id_pesanan = p.id_pesanan
            WHERE p.status = 'completed' ${periodFilter} ${cabangFilter}
            GROUP BY dp.nama_menu
            ORDER BY total_qty DESC, total_sales DESC
            LIMIT 5
        `, periodParams);

        // 6. Time-series points for the area chart
        const series = computePeriodSeries(rangeInfo, cabangFilter, branchParams, modifier);

        // Backward-compatible today & all-time fields
        const todayStats = rangeInfo.range === 'today'
            ? { total_order_today: orderCount, total_revenue_today: grossTotal }
            : db.get(`
                SELECT COUNT(*) AS total_order_today, COALESCE(SUM(p.total), 0) AS total_revenue_today
                FROM pesanan p
                WHERE p.status = 'completed' AND date(p.tanggal_pesanan, ?) = ? ${cabangFilter}
            `, [modifier, businessToday, ...branchParams]);

        const allTimeStats = db.get(`
            SELECT COUNT(*) AS total_orders, COALESCE(SUM(p.total), 0) AS total_revenue
            FROM pesanan p
            WHERE p.status = 'completed' ${cabangFilter}
        `, branchParams);

        const lowStockStats = branch && branch !== 'all'
            ? db.get(
                `SELECT COUNT(*) AS count
                 FROM stok_cabang sc
                 JOIN menu m ON sc.id_menu = m.id_menu
                 WHERE sc.id_cabang = ? AND COALESCE(m.is_available, 1) = 1 AND sc.stok <= sc.min_stok`,
                [branch]
            )
            : db.get(
                `SELECT COUNT(*) AS count
                 FROM stok_cabang sc
                 JOIN menu m ON sc.id_menu = m.id_menu
                 WHERE COALESCE(m.is_available, 1) = 1 AND sc.stok <= sc.min_stok`
            );

        const monthlyRows = db.query(`
            SELECT strftime('%Y-%m', p.tanggal_pesanan, ?) AS ym,
                   COALESCE(SUM(p.total), 0) AS total
            FROM pesanan p
            WHERE p.status = 'completed' ${cabangFilter}
            GROUP BY ym
            ORDER BY ym DESC
            LIMIT 8
        `, [modifier, ...branchParams]);

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

        const branchComp = db.query(`
            SELECT c.id_cabang, c.nama_cabang,
                   COUNT(p.id_pesanan) AS order_count,
                   COALESCE(SUM(p.total), 0) AS revenue
            FROM cabang c
            LEFT JOIN pesanan p ON c.id_cabang = p.id_cabang AND p.status = 'completed'
            GROUP BY c.id_cabang, c.nama_cabang
            ORDER BY c.id_cabang ASC
        `);

        const recentOrders = db.query(`
            SELECT p.id_pesanan, p.nama_pelanggan, p.jenis_pesanan, p.nomor_meja,
                   p.total, p.tanggal_pesanan, p.status, p.status_dapur,
                   pb.metode, c.nama_cabang, s.nomor_struk
            FROM pesanan p
            LEFT JOIN pembayaran pb ON p.id_pesanan = pb.id_pesanan
            LEFT JOIN cabang c ON p.id_cabang = c.id_cabang
            LEFT JOIN struk s ON p.id_pesanan = s.id_pesanan
            WHERE p.status = 'completed' ${cabangFilter}
            ORDER BY p.tanggal_pesanan DESC, p.id_pesanan DESC
            LIMIT 6
        `, branchParams);

        return res.json({
            success: true,
            data: {
                period: rangeInfo,
                totals: {
                    order_count: orderCount,
                    subtotal_sum: subtotalSum,
                    discount_sum: discountSum,
                    nett_sales: nettSales,
                    tax_sum: taxSum,
                    gross_total: grossTotal,
                    avg_order_value: orderCount > 0 ? Math.round(grossTotal / orderCount) : 0,
                    items_sold: itemsSold,
                    avg_items_per_order: orderCount > 0 ? Number((itemsSold / orderCount).toFixed(1)) : 0
                },
                comparison: {
                    prev_order_count: Number(prevStats ? prevStats.order_count : 0),
                    prev_nett_sales: prevNett,
                    prev_gross_total: prevGross,
                    delta_amount: deltaAmount,
                    delta_pct: deltaPct
                },
                series,
                category_breakdown: categoryBreakdown,
                order_type_breakdown: orderTypeBreakdown,
                payment_breakdown: paymentBreakdown,
                best_item: periodTopItems[0] || null,
                total_revenue_today: todayStats.total_revenue_today,
                total_order_today: todayStats.total_order_today,
                all_time_revenue: allTimeStats.total_revenue,
                all_time_orders: allTimeStats.total_orders,
                low_stock_count: lowStockStats ? lowStockStats.count : 0,
                monthly_chart: monthlyData,
                top_items: periodTopItems,
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
        const query = req.query || {};
        const resolved = resolveAuthorizedBranch(req, query.cabang, { allowAll: true });
        if (resolved.errorStatus) {
            return res.status(resolved.errorStatus).json({ success: false, message: resolved.errorMessage });
        }
        const branch = resolved.branchId;

        const dsCheck = dateService.validateDateParam(query.date_start, 'Tanggal awal');
        if (!dsCheck.valid) return res.status(400).json({ success: false, message: dsCheck.message });
        const deCheck = dateService.validateDateParam(query.date_end, 'Tanggal akhir');
        if (!deCheck.valid) return res.status(400).json({ success: false, message: deCheck.message });

        const modifier = dateService.sqlModifier();
        let filterSql = '';
        const params = [];
        if (branch && branch !== 'all') {
            filterSql += ' AND p.id_cabang = ?';
            params.push(branch);
        }
        if (dsCheck.value) {
            filterSql += ' AND date(p.tanggal_pesanan, ?) >= ?';
            params.push(modifier, dsCheck.value);
        }
        if (deCheck.value) {
            filterSql += ' AND date(p.tanggal_pesanan, ?) <= ?';
            params.push(modifier, deCheck.value);
        }

        const categoryRows = db.query(`
            SELECT COALESCE(m.kategori, 'Lainnya') AS kategori,
                   COALESCE(SUM(dp.jumlah), 0) AS qty,
                   COALESCE(SUM(dp.subtotal), 0) AS total
            FROM detail_pesanan dp
            JOIN pesanan p ON dp.id_pesanan = p.id_pesanan
            LEFT JOIN menu m ON dp.id_menu = m.id_menu
            WHERE p.status = 'completed' ${filterSql}
            GROUP BY kategori
            ORDER BY total DESC
        `, params);

        const categoryTotal = categoryRows.reduce((sum, row) => sum + row.total, 0);
        const categoryBreakdown = categoryRows.map(row => ({
            kategori: row.kategori,
            qty: Number(row.qty || 0),
            total: row.total,
            percentage: categoryTotal > 0 ? Math.round((row.total / categoryTotal) * 100) : 0
        }));

        let branchOnlySql = '';
        const branchOnlyParams = [];
        if (branch && branch !== 'all') {
            branchOnlySql = ' AND p.id_cabang = ?';
            branchOnlyParams.push(branch);
        }

        const monthlyRows = db.query(`
            SELECT strftime('%Y-%m', p.tanggal_pesanan, ?) AS ym,
                   COALESCE(SUM(p.total), 0) AS total,
                   COALESCE(SUM(p.subtotal - p.diskon), 0) AS nett,
                   COUNT(*) AS orders
            FROM pesanan p
            WHERE p.status = 'completed' ${branchOnlySql}
            GROUP BY ym
            ORDER BY ym DESC
            LIMIT 6
        `, [modifier, ...branchOnlyParams]);

        const monthly = monthlyRows.slice().reverse().map(row => {
            const monthIndex = parseInt(String(row.ym).slice(5, 7), 10) - 1;
            return {
                ym: row.ym,
                label: MONTH_LABELS[monthIndex] || String(row.ym),
                total: row.total,
                nett: row.nett,
                orders: row.orders
            };
        });

        const heatRows = db.query(`
            SELECT CAST(strftime('%w', p.tanggal_pesanan, ?) AS INTEGER) AS dow,
                   CAST(strftime('%H', p.tanggal_pesanan, ?) AS INTEGER) AS hour,
                   COUNT(*) AS tx_count,
                   COALESCE(SUM(p.total), 0) AS total
            FROM pesanan p
            WHERE p.status = 'completed' ${filterSql}
            GROUP BY dow, hour
        `, [modifier, modifier, ...params]);

        const slots = ['Pagi', 'Siang', 'Sore', 'Malam'];
        const heatMatrix = slots.map(slot => ({ slot, vals: [0, 0, 0, 0, 0, 0, 0], counts: [0, 0, 0, 0, 0, 0, 0] }));
        heatRows.forEach(row => {
            const dayIndex = (row.dow + 6) % 7;
            let slotIndex = 0;
            if (row.hour >= 11 && row.hour < 15) slotIndex = 1;
            else if (row.hour >= 15 && row.hour < 19) slotIndex = 2;
            else if (row.hour >= 19) slotIndex = 3;
            heatMatrix[slotIndex].vals[dayIndex] += row.total;
            heatMatrix[slotIndex].counts[dayIndex] += Number(row.tx_count || 0);
        });

        const maxHeat = Math.max(0, ...heatMatrix.flatMap(row => row.vals));
        heatMatrix.forEach(row => {
            row.vals = row.vals.map(value => (maxHeat > 0 ? Math.round((value / maxHeat) * 100) : 0));
        });

        const topItems = db.query(`
            SELECT dp.nama_menu, SUM(dp.jumlah) AS total_qty, SUM(dp.subtotal) AS total_sales
            FROM detail_pesanan dp
            JOIN pesanan p ON dp.id_pesanan = p.id_pesanan
            WHERE p.status = 'completed' ${filterSql}
            GROUP BY dp.nama_menu
            ORDER BY total_qty DESC, total_sales DESC
            LIMIT 6
        `, params);

        const summary = db.get(`
            SELECT COUNT(*) AS total_transaksi,
                   COALESCE(SUM(p.subtotal), 0) AS total_subtotal,
                   COALESCE(SUM(p.diskon), 0) AS total_diskon,
                   COALESCE(SUM(p.subtotal - p.diskon), 0) AS total_nett,
                   COALESCE(SUM(p.pajak), 0) AS total_pajak,
                   COALESCE(SUM(p.total), 0) AS total_pendapatan
            FROM pesanan p
            WHERE p.status = 'completed' ${filterSql}
        `, params);

        const cupsRow = db.get(`
            SELECT COALESCE(SUM(dp.jumlah), 0) AS total_porsi
            FROM detail_pesanan dp
            JOIN pesanan p ON dp.id_pesanan = p.id_pesanan
            WHERE p.status = 'completed' ${filterSql}
        `, params);

        summary.total_porsi = cupsRow ? Number(cupsRow.total_porsi || 0) : 0;
        summary.rata_rata_transaksi = summary.total_transaksi > 0
            ? Math.round(summary.total_pendapatan / summary.total_transaksi)
            : 0;

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
        const resolved = resolveAuthorizedBranch(req, cabang, { allowAll: true });
        if (resolved.errorStatus) {
            return res.status(resolved.errorStatus).json({ success: false, message: resolved.errorMessage });
        }
        const branch = resolved.branchId;

        const dsCheck = dateService.validateDateParam(date_start, 'Tanggal awal');
        if (!dsCheck.valid) return res.status(400).json({ success: false, message: dsCheck.message });
        const deCheck = dateService.validateDateParam(date_end, 'Tanggal akhir');
        if (!deCheck.valid) return res.status(400).json({ success: false, message: deCheck.message });
        if (dsCheck.value && deCheck.value && dsCheck.value > deCheck.value) {
            return res.status(400).json({
                success: false,
                message: 'Tanggal awal tidak boleh lebih besar dari tanggal akhir'
            });
        }

        let sql = `
            SELECT p.id_pesanan, p.tanggal_pesanan, p.id_cabang, c.nama_cabang,
                   p.nama_pelanggan, p.jenis_pesanan, p.nomor_meja,
                   p.subtotal, p.pajak, p.tarif_pajak, p.diskon, p.total,
                   pb.metode, pb.referensi, pg.nama_pengguna AS nama_kasir, s.nomor_struk
            FROM pesanan p
            LEFT JOIN cabang c ON p.id_cabang = c.id_cabang
            LEFT JOIN pengguna pg ON p.id_pengguna = pg.id_pengguna
            LEFT JOIN pembayaran pb ON p.id_pesanan = pb.id_pesanan
            LEFT JOIN struk s ON p.id_pesanan = s.id_pesanan
            WHERE p.status = 'completed'
        `;
        const params = [];

        if (branch && branch !== 'all') {
            sql += ' AND p.id_cabang = ?';
            params.push(branch);
        }

        if (dsCheck.value) {
            sql += ' AND date(p.tanggal_pesanan, ?) >= ?';
            params.push(dateService.sqlModifier(), dsCheck.value);
        }

        if (deCheck.value) {
            sql += ' AND date(p.tanggal_pesanan, ?) <= ?';
            params.push(dateService.sqlModifier(), deCheck.value);
        }

        sql += ' ORDER BY p.tanggal_pesanan DESC, p.id_pesanan DESC';
        const orders = db.query(sql, params);

        let grandTotalSubtotal = 0;
        let grandTotalNett = 0;
        let grandTotalRevenue = 0;
        let grandTotalPajak = 0;
        let grandTotalDiskon = 0;
        const methodBreakdown = { Cash: 0, QRIS: 0, Debit: 0, Transfer: 0 };

        orders.forEach(o => {
            grandTotalSubtotal += Number(o.subtotal || 0);
            grandTotalDiskon += Number(o.diskon || 0);
            grandTotalNett += Math.max(0, Number(o.subtotal || 0) - Number(o.diskon || 0));
            grandTotalPajak += Number(o.pajak || 0);
            grandTotalRevenue += Number(o.total || 0);
            if (o.metode && methodBreakdown[o.metode] !== undefined) {
                methodBreakdown[o.metode] += Number(o.total || 0);
            }
        });

        if (format === 'csv' || query.export === 'csv') {
            let csv = 'ID Pesanan,Nomor Struk,Tanggal,Cabang,Pelanggan,Jenis Pesanan,Meja,Kasir,Metode,Subtotal,Diskon,Nett Sebelum Pajak,Pajak,Total\n';
            orders.forEach(o => {
                const nett = Math.max(0, Number(o.subtotal || 0) - Number(o.diskon || 0));
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
                    csvCell(o.diskon),
                    csvCell(nett),
                    csvCell(o.pajak),
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
                filter: { date_start: dsCheck.value, date_end: deCheck.value, cabang: branch },
                summary: {
                    total_transaksi: orders.length,
                    total_subtotal: grandTotalSubtotal,
                    total_diskon: grandTotalDiskon,
                    total_nett: grandTotalNett,
                    total_pajak: grandTotalPajak,
                    total_pendapatan: grandTotalRevenue,
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
