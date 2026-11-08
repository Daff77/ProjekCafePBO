(function () {
  'use strict';

  document.addEventListener('error', (event) => {
    const image = event.target;
    if (image && image.tagName === 'IMG' && image.dataset && image.dataset.imgFallback) {
      image.src = image.dataset.imgFallback;
    }
  }, true);

  const STATE = {
    branch: 'CBG001',
    user: {
      id_pengguna: 'USR002',
      nama_pengguna: 'Daffa Danendra',
      peran: 'kasir',
      id_cabang: 'CBG001'
    },
    currentView: 'overview',
    menus: [],
    posCategory: 'all',
    posSearch: '',
    showPhotos: true,
    orderType: 'Dine-In',
    lastDineInTable: 'Meja 04',
    discount: 0,
    payMethod: 'QRIS',
    cashManuallyEdited: false,
    taxRate: 10,
    cart: [],
    catalogCategory: 'all',
    catalogSearch: '',
    ordersFilterStatus: 'all',
    ordersFilterPay: 'all',
    ordersSearch: '',
    invFilterStatus: 'all',
    invFilterCat: 'all',
    invSearch: '',
    invLogType: 'all',
    invLogSearch: '',
    cardStackIdx: 0,
    overviewRange: 'today',
    analytics: null,
    orders: [],
    inventory: [],
    inventoryLogs: [],
    members: []
  };

  const ROLE_VIEWS = {
    admin: ['overview', 'pos', 'orders', 'catalog', 'inventory', 'reports', 'members', 'settings'],
    manager: ['overview', 'orders', 'catalog', 'inventory', 'reports', 'members', 'settings'],
    owner: ['overview', 'orders', 'reports', 'members', 'settings'],
    kasir: ['overview', 'pos', 'orders', 'members', 'settings']
  };

  function canView(viewName) {
    const allowed = ROLE_VIEWS[STATE.user.peran] || ROLE_VIEWS.kasir;
    return allowed.includes(viewName);
  }

  const formatRp = (num) => 'Rp ' + Math.round(Number(num) || 0).toLocaleString('id-ID');

  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showToast(msg) {
    const stack = document.getElementById('toast-stack');
    if (!stack) return;
    const t = document.createElement('div');
    t.className = 'toast';
    const icon = document.createElement('span');
    icon.textContent = '✓';
    const text = document.createElement('span');
    text.textContent = msg;
    t.appendChild(icon);
    t.appendChild(text);
    stack.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  /* ============================================================
     1. SESSION, THEME, PRIVACY & NAVIGATION
     ============================================================ */
  function initSessionAndHeader() {
    try {
      const saved = localStorage.getItem('nomcherry_session');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.nama_pengguna) {
          STATE.user = parsed;
          if (parsed.id_cabang) STATE.branch = parsed.id_cabang;
        }
      }
    } catch (e) {}

    const initials = STATE.user.nama_pengguna.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const roleName = (STATE.user.peran || 'kasir').toUpperCase();
    const branchLabel = STATE.branch === 'CBG002' ? 'Cabang Timur' : 'Cabang Pusat';
    const branchSelect = document.getElementById('branch-selector');
    if (branchSelect) {
      branchSelect.value = STATE.branch;
      branchSelect.disabled = STATE.user.peran === 'kasir';
    }

    document.querySelectorAll('[data-view]').forEach(el => {
      const view = el.dataset.view;
      if (view && !canView(view)) {
        el.style.display = 'none';
      }
    });

    const canExportReports = ['admin', 'manager', 'owner'].includes(STATE.user.peran);
    ['export-csv-btn', 'reports-export-csv-btn'].forEach(id => {
      const button = document.getElementById(id);
      if (button) button.style.display = canExportReports ? '' : 'none';
    });

    document.getElementById('user-avatar').textContent = initials;
    document.getElementById('user-name-label').textContent = STATE.user.nama_pengguna;
    document.getElementById('user-role-label').textContent = roleName + ' · ' + branchLabel;
    document.getElementById('pop-user-av').textContent = initials;
    document.getElementById('pop-user-name').textContent = STATE.user.nama_pengguna;
    document.getElementById('pop-user-role').textContent = roleName + ' · ' + branchLabel;
    document.getElementById('st-avatar').textContent = initials;
    document.getElementById('st-name').textContent = STATE.user.nama_pengguna;
    document.getElementById('st-role').textContent = roleName + ' · ' + branchLabel;

    const now = new Date();
    const hr = now.getHours();
    const greet = hr < 11 ? 'Selamat Pagi' : hr < 15 ? 'Selamat Siang' : hr < 18 ? 'Selamat Sore' : 'Selamat Malam';
    const firstName = STATE.user.nama_pengguna.split(' ')[0];
    document.getElementById('ov-greeting-title').textContent = greet + ', ' + firstName;
    document.getElementById('ov-date-eyebrow').textContent =
      now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) +
      ' · ' + (STATE.branch === 'CBG002' ? 'Surabaya Timur' : 'Surabaya Pusat');
  }

  function switchView(viewName) {
    if (!canView(viewName)) {
      showToast('Akses ditolak untuk peran ini.');
      return;
    }
    const titles = {
      overview: 'Ringkasan Kafe',
      pos: 'Kasir POS',
      orders: 'Pesanan & Dapur',
      catalog: 'Katalog Menu',
      inventory: 'Inventori Bahan',
      reports: 'Laporan & Analitik',
      members: 'Member Loyalitas',
      settings: 'Pengaturan Sistem'
    };
    if (!titles[viewName]) viewName = 'overview';
    STATE.currentView = viewName;

    document.querySelectorAll('.view-section').forEach(sec => {
      sec.classList.toggle('is-active', sec.id === 'view-' + viewName);
    });

    document.querySelectorAll('.snav__item[data-view]').forEach(link => {
      const active = link.dataset.view === viewName;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });

    document.querySelectorAll('.tabbar button[data-view]').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.view === viewName);
    });

    document.getElementById('top-crumb-current').textContent = titles[viewName];
    document.getElementById('app-shell').classList.remove('is-mobile-open');
    document.getElementById('user-popover').classList.remove('is-open');
    document.getElementById('notif-popover').classList.remove('is-open');
  }

  /* ============================================================
     2. OVERVIEW RENDERING (COFRA CHART, CARD STACK, JARS, LISTS)
     ============================================================ */
  const RANGE_DATA = {
    today: {
      rev: 'Rp 6.840.000',
      delta: '↑ 14.8%',
      sub: '+Rp 880.000 dibanding rata-rata shift kemarin',
      grid: ['Rp 7 Jt', 'Rp 4,5 Jt', 'Rp 2 Jt'],
      x: ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', 'Sekarang'],
      line: 'M0,142 C70,136 115,118 165,112 C220,105 260,120 315,92 C370,64 415,58 470,46 C525,34 580,28 640,18',
      fill: 'M0,142 C70,136 115,118 165,112 C220,105 260,120 315,92 C370,64 415,58 470,46 C525,34 580,28 640,18 L640,170 L0,170 Z',
      dotY: 18
    },
    '7d': {
      rev: 'Rp 44.920.000',
      delta: '↑ 19.2%',
      sub: 'Total 918 struk lunas selama 7 hari terakhir',
      grid: ['Rp 45 Jt', 'Rp 30 Jt', 'Rp 15 Jt'],
      x: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'],
      line: 'M0,130 C90,115 150,125 220,88 C290,55 360,72 440,42 C520,25 585,20 640,14',
      fill: 'M0,130 C90,115 150,125 220,88 C290,55 360,72 440,42 C520,25 585,20 640,14 L640,170 L0,170 Z',
      dotY: 14
    },
    '30d': {
      rev: 'Rp 148.650.000',
      delta: '↑ 22.4%',
      sub: 'Rekor penjualan tertinggi kuartal ini (3.110 struk)',
      grid: ['Rp 150 Jt', 'Rp 100 Jt', 'Rp 50 Jt'],
      x: ['Mgg 1', 'Mgg 2', 'Mgg 3', 'Mgg 4', 'Sekarang'],
      line: 'M0,148 C120,122 240,96 360,70 C480,45 560,28 640,12',
      fill: 'M0,148 C120,122 240,96 360,70 C480,45 560,28 640,12 L640,170 L0,170 Z',
      dotY: 12
    }
  };

  function renderOverviewAreaRange(rangeKey) {
    STATE.overviewRange = rangeKey;
    const d = RANGE_DATA[rangeKey] || RANGE_DATA.today;
    document.getElementById('ov-hero-rev').textContent = d.rev;
    document.getElementById('ov-hero-delta').textContent = d.delta;
    document.getElementById('ov-hero-subtext').textContent = d.sub;
    document.getElementById('ov-area-line').setAttribute('d', d.line);
    document.getElementById('ov-area-fill').setAttribute('d', d.fill);
    document.getElementById('ov-area-dot').setAttribute('cy', String(d.dotY));
    document.getElementById('ov-area-grid').innerHTML = d.grid.map(g => '<span>' + g + '</span>').join('');
    document.getElementById('ov-area-x').innerHTML = d.x.map(lbl => '<span>' + lbl + '</span>').join('');
  }

  function updateCardStack(activeIndex) {
    STATE.cardStackIdx = (activeIndex + 3) % 3;
    const cards = document.querySelectorAll('#cstack-pile .paydeck');
    cards.forEach((card, idx) => {
      const pos = (idx - STATE.cardStackIdx + 3) % 3;
      card.setAttribute('data-pos', String(pos));
    });
    document.querySelectorAll('#cstack-dots button').forEach((dot, idx) => {
      if (idx === STATE.cardStackIdx) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });

    const metaList = [
      { status: 'QRIS Dinamis · Aktif', mdr: '0.7% BI', settle: 'H+0 Otomatis' },
      { status: 'Laci Kasir #01 · Terkunci', mdr: '0% Tunai', settle: 'Kas Fisik' },
      { status: 'EDC BCA/Mandiri · Siap', mdr: '0.15% Debit', settle: 'Batch 22:00' }
    ];
    const m = metaList[STATE.cardStackIdx];
    document.getElementById('cstack-meta-status').textContent = m.status;
    document.getElementById('cstack-meta-mdr').textContent = m.mdr;
    document.getElementById('cstack-meta-settle').textContent = m.settle;
  }

  function renderOverviewWidgets() {
    // 0. Overview Summary Accs, Payment Cards, Tax & Notifications from real STATE.orders & STATE.inventory
    const totalOrders = STATE.orders.length;
    const grossTotal = STATE.orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const totalItemsSold = STATE.orders.reduce(
      (sum, o) => sum + (o.items || []).reduce((s, it) => s + Number(it.jumlah || it.qty || 0), 0),
      0
    );
    const avgTicket = totalOrders > 0 ? Math.round(grossTotal / totalOrders) : 0;

    const txCountEl = document.getElementById('ov-kpi-tx-count');
    if (txCountEl) txCountEl.textContent = totalOrders + ' Struk';
    const avgTicketEl = document.getElementById('ov-kpi-avg-ticket');
    if (avgTicketEl) avgTicketEl.textContent = formatRp(avgTicket);
    const itemsEl = document.getElementById('ov-kpi-items');
    if (itemsEl) itemsEl.textContent = totalItemsSold + ' Item';
    const bestMenuEl = document.getElementById('ov-kpi-best-menu');
    if (bestMenuEl && STATE.analytics && Array.isArray(STATE.analytics.top_items) && STATE.analytics.top_items[0]) {
      bestMenuEl.textContent = 'Best: ' + STATE.analytics.top_items[0].nama_menu;
    }

    const sumByPay = (method) => STATE.orders
      .filter(o => o.metode_pembayaran === method)
      .reduce((sum, o) => sum + Number(o.total || 0), 0);
    const qrisSum = sumByPay('QRIS');
    const cashSum = sumByPay('Cash');
    const debitSum = sumByPay('Debit') + sumByPay('Transfer');
    const payBase = Math.max(1, qrisSum + cashSum + debitSum);
    const qrisPct = totalOrders > 0 ? Math.round((qrisSum / payBase) * 100) : 0;
    const cashPct = totalOrders > 0 ? Math.round((cashSum / payBase) * 100) : 0;
    const debitPct = totalOrders > 0 ? Math.max(0, 100 - qrisPct - cashPct) : 0;
    const cashlessPct = Math.min(100, qrisPct + debitPct);

    const setElText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setElText('ov-qris-val', formatRp(qrisSum));
    setElText('ov-qris-pct', qrisPct + '%');
    setElText('ov-cash-val', formatRp(cashSum));
    setElText('ov-cash-pct', cashPct + '%');
    setElText('ov-card-val', formatRp(debitSum));
    setElText('ov-card-pct', debitPct + '%');
    setElText('ov-cashless-ratio', cashlessPct + '% Cashless');
    const cashlessBar = document.getElementById('ov-cashless-bar');
    if (cashlessBar) cashlessBar.style.width = cashlessPct + '%';

    const nettVal = Math.round(grossTotal / (1 + (STATE.taxRate / 100)));
    const taxVal = Math.max(0, grossTotal - nettVal);
    const taxEl = document.getElementById('ov-tax-val');
    if (taxEl) {
      taxEl.innerHTML = `${esc(formatRp(taxVal))} <small>/ pajak PB1 ${esc(STATE.taxRate)}%</small>`;
    }
    setElText('ov-gross-val', formatRp(grossTotal));
    setElText('ov-nett-val', formatRp(nettVal));

    const notifListEl = document.getElementById('notif-popover-list');
    const notifCountEl = document.getElementById('notif-popover-count');
    const notifDotEl = document.getElementById('notif-dot');
    if (notifListEl) {
      const alertItems = STATE.inventory.filter(
        i => i.status_stok === 'Menipis' || i.status_stok === 'Habis' || i.is_expired || i.is_near_expiry
      );
      if (notifCountEl) notifCountEl.textContent = (alertItems.length + 1) + ' Info';
      if (notifDotEl) notifDotEl.style.display = alertItems.length > 0 ? '' : 'none';
      const stockAlertsHtml = alertItems.slice(0, 4).map(item => {
        const alertColor = (item.status_stok === 'Habis' || item.is_expired) ? 'var(--bad)' : 'var(--warn)';
        const expTag = item.is_expired
          ? ' · EXPIRED (' + item.exp + ')'
          : (item.is_near_expiry ? ' · Segera Expired (' + item.exp + ')' : '');
        return `
          <div style="padding-bottom:6px;border-bottom:1px solid var(--line);">
            <b style="display:block;color:${alertColor};">${esc(item.nama)} (${esc(item.stok)} porsi · Min ${esc(item.min_stok ?? 5)})</b>
            <span style="color:var(--muted);">Status: ${esc(item.status_stok)}${esc(expTag)} di ${esc(item.cabang)}.</span>
          </div>
        `;
      }).join('');
      notifListEl.innerHTML = (stockAlertsHtml || `
        <div style="padding-bottom:6px;border-bottom:1px solid var(--line);">
          <b style="display:block;color:var(--good);">Seluruh Stok Cabang Aman</b>
          <span style="color:var(--muted);">Tidak ada item di bawah batas minimum atau kedaluwarsa.</span>
        </div>
      `) + `
        <div>
          <b style="display:block;color:var(--good);">Printer Thermal Siap (${esc(document.getElementById('set-printer-size')?.value || '80mm')})</b>
          <span style="color:var(--muted);">Siap mencetak struk pada cabang aktif.</span>
        </div>
      `;
    }

    // 1. Cofra Jars (Top 5 Stock Items)
    const jarsEl = document.getElementById('ov-jars-container');
    if (jarsEl) {
      const stockItems = STATE.inventory.slice(0, 5);
      const maxStock = Math.max(1, ...STATE.inventory.map(item => item.stok));
      const allowRestockClick = canView('inventory');
      if (stockItems.length === 0) {
        jarsEl.innerHTML = '<div style="padding:16px;color:var(--muted);font-size:var(--fs-xs);">Belum ada data stok untuk cabang ini.</div>';
      } else {
        jarsEl.innerHTML = stockItems.map(item => {
          const pct = Math.max(0, Math.min(100, Math.round((item.stok / maxStock) * 100)));
          const stateCls = item.status_stok === 'Habis' ? 'jar--over' : item.status_stok === 'Menipis' ? 'jar--warn' : '';
          const stateTxt = item.status_stok || 'Aman';
          const color = item.status_stok === 'Habis' ? 'var(--bad)' : item.status_stok === 'Menipis' ? 'var(--tangerine)' : 'var(--good)';
          const restockAttr = allowRestockClick ? `data-restock-id="${esc(item.id)}" title="Klik untuk Restock ${esc(item.nama)}"` : `title="${esc(item.nama)} (${esc(item.stok)} porsi)"`;
          return `
            <button type="button" class="jar ${stateCls}" ${restockAttr}>
              <div class="jar__glass" style="--fill:${pct}; --jar-c:${color}">
                <span class="jar__lid"></span>
                <div class="jar__liquid"></div>
                <span class="jar__icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 8h1a4 4 0 1 1 0 8h-1"></path><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"></path></svg>
                </span>
                <span class="jar__pct">${esc(item.stok)}</span>
              </div>
              <div class="jar__text">
                <b>${esc(String(item.nama).split(' ').slice(0, 2).join(' '))}</b>
                <small class="num">${esc(item.kategori)} · ${esc(item.cabang)}</small>
                <i class="jar__state">${esc(stateTxt)}</i>
              </div>
            </button>
          `;
        }).join('');
      }
    }

    // 2. Recent Transactions List
    const txEl = document.getElementById('ov-recent-tx-list');
    if (txEl) {
      txEl.innerHTML = STATE.orders.slice(0, 5).map(ord => `
        <div class="tx" data-open-receipt="${esc(ord.id_pesanan)}">
          <div class="tx__ico">${ord.metode_pembayaran === 'QRIS' ? 'QR' : ord.metode_pembayaran === 'Cash' ? 'Rp' : 'EDC'}</div>
          <div>
            <div class="tx__name">${esc(ord.nama_pelanggan)} · ${esc(ord.lokasi_label)}</div>
            <div class="tx__sub"><span>${esc(ord.nomor_struk)}</span><span>·</span><span>${esc(ord.waktu)}</span></div>
          </div>
          <div class="tx__amt tx__amt--in priv">+${formatRp(ord.total)}</div>
        </div>
      `).join('');
    }

    // 3. Kitchen Queue
    const activeOrders = STATE.orders.filter(o => o.status === 'Diproses');
    const navBadge = document.getElementById('nav-orders-badge');
    if (navBadge) navBadge.textContent = String(activeOrders.length);
    const qPill = document.getElementById('ov-queue-pill');
    if (qPill) qPill.textContent = activeOrders.length + ' Aktif';

    const qEl = document.getElementById('ov-kitchen-queue');
    if (qEl) {
      if (activeOrders.length === 0) {
        qEl.innerHTML = '<div style="padding:18px 4px;font-size:var(--fs-xs);color:var(--muted);">Semua pesanan telah disajikan oleh barista.</div>';
      } else {
        qEl.innerHTML = activeOrders.map(ord => `
          <div class="up" data-complete-order="${esc(ord.id_pesanan)}" title="Klik untuk tandai selesai disajikan">
            <div class="up__date"><small>${esc(ord.metode_pembayaran)}</small><b>${esc(ord.badge_meja)}</b></div>
            <div class="up__body">
              <b>${esc(ord.nama_pelanggan)} (${esc(ord.jenis_pesanan)})</b>
              <small>${esc(ord.items.map(i => i.jumlah + 'x ' + i.nama_menu).join(', '))}</small>
            </div>
            <span class="pill pill--warn">Sajikan ✓</span>
          </div>
        `).join('');
      }
    }

    // 4. Members Preview
    const memEl = document.getElementById('ov-members-preview');
    if (memEl) {
      memEl.innerHTML = STATE.members.slice(0, 4).map(m => `
        <div class="person">
          <span class="av av--sm">${esc(m.inisial)}</span>
          <div class="person__meta">
            <b>${esc(m.nama)}</b>
            <small>${esc(m.tier)} · ${esc(m.kunjungan)}</small>
          </div>
          <span class="pill pill--good">${esc(m.poin)} pts</span>
        </div>
      `).join('');
    }
  }

  /* ============================================================
     3. POS KASIR & CART ENGINE
     ============================================================ */
  function reconcileCartWithProducts() {
    if (!Array.isArray(STATE.cart) || STATE.cart.length === 0) return;
    const nextCart = [];
    for (const item of STATE.cart) {
      const live = STATE.menus.find(m => m.id_menu === item.id_menu && m.is_available !== 0);
      if (!live || live.stok <= 0) continue;
      nextCart.push({
        id_menu: live.id_menu,
        nama_menu: live.nama_menu,
        harga: live.harga,
        qty: Math.min(item.qty, live.stok)
      });
    }
    STATE.cart = nextCart;
  }

  function renderPosProducts() {
    const grid = document.getElementById('pos-products-grid');
    if (!grid) return;

    const activeMenus = STATE.menus.filter(m => m.is_available !== 0);
    const filtered = activeMenus.filter(m => {
      const matchCat = STATE.posCategory === 'all' || m.kategori === STATE.posCategory;
      const matchSearch = !STATE.posSearch || m.nama_menu.toLowerCase().includes(STATE.posSearch.toLowerCase());
      return matchCat && matchSearch;
    });

    document.getElementById('nav-cart-badge').textContent = activeMenus.length + ' Menu';

    if (filtered.length === 0) {
      grid.innerHTML = '<div style="grid-column:1/-1;padding:32px;text-align:center;color:var(--muted);">Tidak ada menu yang cocok dengan filter pencarian.</div>';
      return;
    }

    grid.innerHTML = filtered.map(m => {
      const out = m.stok <= 0;
      const imgHtml = STATE.showPhotos ? `
        <div class="prod-img-wrap">
          <img class="prod-img" src="${esc(m.gambar || 'assets/logo.png')}" alt="${esc(m.nama_menu)}" loading="lazy" data-img-fallback="assets/logo.png">
          <span class="prod-stock-badge">${out ? 'Habis' : 'Stok ' + m.stok}</span>
        </div>
      ` : '';
      return `
        <article class="prod-card ${out ? 'is-out' : ''}" data-add-menu="${esc(m.id_menu)}" role="button" tabindex="0" aria-label="Tambah ${esc(m.nama_menu)} ke keranjang">
          ${imgHtml}
          <span class="prod-cat">${esc(m.kategori)}</span>
          <h3 class="prod-title">${esc(m.nama_menu)}</h3>
          <p class="prod-desc">${esc(m.deskripsi || 'Disiapkan segar dengan bahan pilihan NomCherry.')}</p>
          <div class="prod-foot">
            <span class="prod-price">${formatRp(m.harga)}</span>
            <span class="prod-add-btn" aria-hidden="true">+</span>
          </div>
        </article>
      `;
    }).join('');
  }

  function getCartTotals() {
    const subtotal = STATE.cart.reduce((s, item) => s + item.harga * item.qty, 0);
    const qtyCount = STATE.cart.reduce((s, item) => s + item.qty, 0);
    const discount = Math.min(STATE.discount, subtotal);
    const taxable = Math.max(0, subtotal - discount);
    const tax = Math.round(taxable * (STATE.taxRate / 100));
    const total = taxable + tax;
    return { subtotal, qtyCount, discount, tax, total };
  }

  function syncOrderTypeUi() {
    const tableField = document.getElementById('field-table-num');
    const tableInput = document.getElementById('cart-table-num');
    const deliveryField = document.getElementById('field-delivery-note');

    if (STATE.orderType === 'Dine-In') {
      if (tableField) tableField.style.display = '';
      if (tableInput) {
        tableInput.disabled = false;
        const cur = tableInput.value.trim();
        if (!cur || ['-', 'takeaway', 'take away', 'delivery'].includes(cur.toLowerCase())) {
          tableInput.value = STATE.lastDineInTable || 'Meja 04';
        }
      }
      if (deliveryField) deliveryField.style.display = 'none';
    } else if (STATE.orderType === 'Takeaway') {
      if (tableInput) {
        const cur = tableInput.value.trim();
        if (cur && !['-', 'takeaway', 'take away', 'delivery'].includes(cur.toLowerCase())) {
          STATE.lastDineInTable = cur;
        }
        tableInput.value = '';
        tableInput.disabled = true;
      }
      if (tableField) tableField.style.display = 'none';
      if (deliveryField) deliveryField.style.display = 'none';
    } else if (STATE.orderType === 'Delivery') {
      if (tableInput) {
        const cur = tableInput.value.trim();
        if (cur && !['-', 'takeaway', 'take away', 'delivery'].includes(cur.toLowerCase())) {
          STATE.lastDineInTable = cur;
        }
        tableInput.value = '';
        tableInput.disabled = true;
      }
      if (tableField) tableField.style.display = 'none';
      if (deliveryField) deliveryField.style.display = '';
    }
  }

  function syncPaymentMethodUi() {
    const { total } = getCartTotals();
    const qrisGroup = document.getElementById('qris-input-group');
    const cashGroup = document.getElementById('cash-input-group');
    const edcGroup = document.getElementById('edc-input-group');
    const qrisBillEl = document.getElementById('qris-bill-val');
    const edcBillEl = document.getElementById('edc-bill-val');

    if (qrisBillEl) qrisBillEl.textContent = formatRp(total);
    if (edcBillEl) edcBillEl.textContent = formatRp(total);

    const method = STATE.payMethod === 'Card' ? 'Debit' : STATE.payMethod;
    if (qrisGroup) qrisGroup.style.display = method === 'QRIS' ? '' : 'none';
    if (cashGroup) cashGroup.style.display = method === 'Cash' ? '' : 'none';
    if (edcGroup) edcGroup.style.display = method === 'Debit' ? '' : 'none';

    if (method === 'Cash') {
      updateCashChange();
    }
  }

  function renderCart() {
    const container = document.getElementById('pos-cart-items');
    if (!container) return;

    if (STATE.cart.length === 0) {
      container.innerHTML = '<div style="padding:22px 6px;text-align:center;font-size:var(--fs-xs);color:var(--muted);">Keranjang masih kosong. Klik produk di sebelah kiri untuk menambahkan.</div>';
    } else {
      container.innerHTML = STATE.cart.map(item => `
        <div class="cart-item">
          <div class="cart-item__info">
            <div class="cart-item__title">${esc(item.nama_menu)}</div>
            <div class="cart-item__price">${formatRp(item.harga)} × ${item.qty} = <b>${formatRp(item.harga * item.qty)}</b></div>
          </div>
          <div class="cart-qty-ctrl">
            <button type="button" class="qty-btn" data-cart-dec="${esc(item.id_menu)}" aria-label="Kurangi">−</button>
            <span class="num" style="font-size:var(--fs-xs);font-weight:700;min-width:18px;text-align:center;">${item.qty}</span>
            <button type="button" class="qty-btn" data-cart-inc="${esc(item.id_menu)}" aria-label="Tambah">+</button>
          </div>
        </div>
      `).join('');
    }

    const { subtotal, qtyCount, discount, tax, total } = getCartTotals();
    document.getElementById('cart-qty-count').textContent = String(qtyCount);
    document.getElementById('cart-subtotal-val').textContent = formatRp(subtotal);
    document.getElementById('cart-discount-val').textContent = '-' + formatRp(discount);
    document.getElementById('cart-tax-val').textContent = formatRp(tax);
    document.getElementById('cart-total-val').textContent = formatRp(total);

    const cashIn = document.getElementById('cart-cash-received');
    if (cashIn && !STATE.cashManuallyEdited) {
      cashIn.value = total > 0 ? String(total) : '';
    }
    syncOrderTypeUi();
    syncPaymentMethodUi();
    updateCashChange();
  }

  function updateCashChange() {
    const { total } = getCartTotals();
    const cashInput = document.getElementById('cart-cash-received');
    const changeEl = document.getElementById('cart-change-val');
    if (!cashInput || !changeEl) return;

    const raw = cashInput.value.trim();
    const cashVal = raw === '' ? NaN : Number(raw);

    if (total === 0) {
      changeEl.textContent = 'Rp 0';
      changeEl.style.color = 'var(--good)';
      return;
    }

    if (!Number.isFinite(cashVal) || cashVal < total) {
      const kurang = Math.max(0, total - (Number.isFinite(cashVal) ? cashVal : 0));
      changeEl.textContent = 'Kurang ' + formatRp(kurang);
      changeEl.style.color = 'var(--bad)';
    } else {
      changeEl.textContent = formatRp(cashVal - total);
      changeEl.style.color = 'var(--good)';
    }
  }

  function addToCart(menuId) {
    const m = STATE.menus.find(x => x.id_menu === menuId);
    if (!m) return;
    if (m.stok <= 0) {
      showToast('Maaf, stok ' + m.nama_menu + ' habis!');
      return;
    }
    const existing = STATE.cart.find(c => c.id_menu === menuId);
    if (existing) {
      if (existing.qty + 1 > m.stok) {
        showToast('Batas stok tersedia tercapai (' + m.stok + ')');
        return;
      }
      existing.qty += 1;
    } else {
      STATE.cart.push({ id_menu: m.id_menu, nama_menu: m.nama_menu, harga: m.harga, qty: 1 });
    }
    renderCart();
  }

  /* ============================================================
     4. THERMAL RECEIPT GENERATOR
     ============================================================ */
  function focusModal(modal) {
    if (!modal) return;
    const target = modal.querySelector('input, select, textarea, button, [href]');
    if (target) target.focus();
  }

  function openReceiptModal(orderObj) {
    const cafeName = document.getElementById('set-cafe-name').value || 'NomCherry Café & Roastery';
    const cafeAddr = document.getElementById('set-branch-addr').value || 'Jl. Tunjungan No. 88, Surabaya Pusat';
    const cafePhone = document.getElementById('set-branch-phone').value || '(031) 548-2910';
    const footerMsg = document.getElementById('set-receipt-footer').value || 'Terima kasih atas kunjungan Anda!';

    const items = orderObj.items || [];
    const sub = orderObj.subtotal !== undefined && orderObj.subtotal !== null
      ? Number(orderObj.subtotal)
      : items.reduce((s, i) => s + Number(i.harga || i.harga_satuan || 0) * Number(i.jumlah || i.qty || 1), 0);
    const discount = Number(orderObj.diskon || 0);
    const tax = orderObj.pajak !== undefined && orderObj.pajak !== null
      ? Number(orderObj.pajak)
      : Math.round(Math.max(0, sub - discount) * (STATE.taxRate / 100));
    const tot = orderObj.total !== undefined && orderObj.total !== null
      ? Number(orderObj.total)
      : sub - discount + tax;

    const orderTypeLabel = orderObj.jenis_pesanan || 'Dine-In';
    const hasTable = orderTypeLabel === 'Dine-In' && orderObj.nomor_meja && orderObj.nomor_meja !== '-';
    const methodLabel = orderObj.metode_pembayaran === 'Debit' ? 'Kartu EDC (Debit)' : orderObj.metode_pembayaran;
    const isCashPayment = orderObj.metode_pembayaran === 'Cash';

    const html = `
      <div style="text-align:center;margin-bottom:10px;">
        <strong style="font-size:14px;display:block;">${esc(cafeName.toUpperCase())}</strong>
        <span>${esc(cafeAddr)}</span><br>
        <span>Telp: ${esc(cafePhone)}</span>
      </div>
      <div style="border-top:1px dashed var(--line-2);border-bottom:1px dashed var(--line-2);padding:6px 0;margin-bottom:8px;">
        <div>No. Struk : <b>${esc(orderObj.nomor_struk)}</b></div>
        <div>Pelanggan : ${esc(orderObj.nama_pelanggan)}</div>
        <div>Jenis     : <b>${esc(orderTypeLabel)}</b>${hasTable ? ` · ${esc(orderObj.nomor_meja)}` : ''}</div>
        ${orderTypeLabel === 'Delivery' && orderObj.catatan && orderObj.catatan !== 'Order POS' ? `<div>Catatan   : ${esc(orderObj.catatan)}</div>` : ''}
        <div>Kasir     : ${esc(STATE.user.nama_pengguna)}</div>
        <div>Metode    : ${esc(methodLabel)} · ${esc(orderObj.waktu || 'Hari Ini')}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:8px;">
        ${items.map(i => {
          const q = Number(i.jumlah || i.qty || 1);
          const p = Number(i.harga || i.harga_satuan || 0);
          return `<div style="display:flex;justify-content:space-between;"><span>${q}x ${esc(i.nama_menu)}</span><b>${formatRp(q * p)}</b></div>`;
        }).join('')}
      </div>
      <div style="border-top:1px dashed var(--line-2);padding-top:6px;">
        <div style="display:flex;justify-content:space-between;"><span>Subtotal</span><span>${formatRp(sub)}</span></div>
        ${discount > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Diskon</span><span>-${formatRp(discount)}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;"><span>PB1 Restoran (${esc(STATE.taxRate)}%)</span><span>${formatRp(tax)}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:700;font-size:13px;margin-top:4px;"><span>TOTAL LUNAS</span><span>${formatRp(tot)}</span></div>
        ${isCashPayment ? `
          <div style="display:flex;justify-content:space-between;"><span>Tunai Diterima</span><span>${formatRp(orderObj.nominal_diterima ?? tot)}</span></div>
          <div style="display:flex;justify-content:space-between;"><span>Kembalian</span><span>${formatRp(orderObj.kembalian ?? 0)}</span></div>
        ` : `
          <div style="display:flex;justify-content:space-between;"><span>Pembayaran</span><span>${esc(methodLabel)} (Pas)</span></div>
          ${orderObj.referensi ? `<div style="display:flex;justify-content:space-between;"><span>Ref Transaksi</span><span>${esc(orderObj.referensi)}</span></div>` : ''}
        `}
      </div>
      <div style="text-align:center;margin-top:12px;font-size:11px;color:var(--muted);">
        ${esc(footerMsg)}
      </div>
    `;
    document.getElementById('receipt-paper-content').innerHTML = html;
    const receiptModal = document.getElementById('receipt-modal');
    receiptModal.classList.add('is-open');
    focusModal(receiptModal);
  }

  /* ============================================================
     5. SECONDARY VIEWS (ORDERS, CATALOG, INVENTORY, REPORTS, MEMBERS)
     ============================================================ */
  function renderOrdersView() {
    const listEl = document.getElementById('orders-activity-list');
    if (!listEl) return;

    const prepCount = STATE.orders.filter(o => o.status === 'Diproses').length;
    const doneCount = STATE.orders.filter(o => o.status === 'Selesai').length;
    const totalRev = STATE.orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    document.getElementById('ord-sum-total').textContent = STATE.orders.length + ' Transaksi';
    document.getElementById('ord-sum-prep').textContent = prepCount + ' Pesanan';
    document.getElementById('ord-sum-done').textContent = doneCount + ' Pesanan';
    const ordRevEl = document.getElementById('ord-sum-rev');
    if (ordRevEl) ordRevEl.textContent = formatRp(totalRev);

    const filtered = STATE.orders.filter(o => {
      const mStatus = STATE.ordersFilterStatus === 'all' || o.status === STATE.ordersFilterStatus;
      const mPay = STATE.ordersFilterPay === 'all' || o.metode_pembayaran === STATE.ordersFilterPay;
      const q = STATE.ordersSearch.toLowerCase();
      const mSearch = !q || o.nomor_struk.toLowerCase().includes(q) || o.nama_pelanggan.toLowerCase().includes(q);
      return mStatus && mPay && mSearch;
    });

    if (filtered.length === 0) {
      listEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);">Tidak ada pesanan yang sesuai filter.</div>';
      return;
    }

    listEl.innerHTML = `
      <div class="ac-group__head">
        <span>Daftar Pesanan Shift Aktif (${filtered.length} Struk)</span>
        <span>Klik tombol aksi untuk cetak struk atau selesaikan antrean</span>
      </div>
      ${filtered.map(o => `
        <div class="ac-row">
          <div class="tx__ico">${o.metode_pembayaran === 'QRIS' ? 'QR' : o.metode_pembayaran === 'Cash' ? 'Rp' : 'EDC'}</div>
          <div class="ac-row__who">
            <b>${esc(o.nama_pelanggan)} · ${esc(o.lokasi_label)}</b>
            <small>${esc(o.nomor_struk)} · ${esc(o.items.map(i => (i.jumlah || i.qty || 1) + 'x ' + i.nama_menu).join(', '))}</small>
          </div>
          <div class="ac-row__acc">${esc(o.waktu)}</div>
          <div class="ac-row__cat"><span class="pill">${esc(o.metode_pembayaran)}</span></div>
          <div class="ac-row__status">
            <span class="pill ${o.status === 'Selesai' ? 'pill--good' : 'pill--warn'}">${esc(o.status)}</span>
          </div>
          <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;">
            <strong class="ac-row__amt priv">${formatRp(o.total)}</strong>
            ${o.status === 'Diproses' ? `<button type="button" class="btn btn--sm btn--primary" data-complete-order="${esc(o.id_pesanan)}">Sajikan ✓</button>` : ''}
            <button type="button" class="btn btn--sm" data-open-receipt="${esc(o.id_pesanan)}">Struk</button>
          </div>
        </div>
      `).join('')}
    `;
  }

  function renderCatalogView() {
    const grid = document.getElementById('catalog-manage-grid');
    if (!grid) return;

    const filtered = STATE.menus.filter(m => {
      if (m.is_available === 0) return false;
      const matchCat = STATE.catalogCategory === 'all' || m.kategori === STATE.catalogCategory;
      const matchSearch = !STATE.catalogSearch || m.nama_menu.toLowerCase().includes(STATE.catalogSearch.toLowerCase());
      return matchCat && matchSearch;
    });

    grid.innerHTML = filtered.map(m => `
      <article class="prod-card">
        <div class="prod-img-wrap">
          <img class="prod-img" src="${esc(m.gambar || 'assets/logo.png')}" alt="${esc(m.nama_menu)}" loading="lazy" data-img-fallback="assets/logo.png">
          <span class="prod-stock-badge">Stok: ${m.stok}</span>
        </div>
        <span class="prod-cat">${esc(m.kategori)} · ${esc(m.id_menu)}</span>
        <h3 class="prod-title">${esc(m.nama_menu)}</h3>
        <p class="prod-desc">${esc(m.deskripsi || 'Menu spesial NomCherry Café.')}</p>
        <div class="prod-foot">
          <span class="prod-price">${formatRp(m.harga)}</span>
          <div style="display:flex;gap:6px;">
            <button type="button" class="btn btn--sm" data-restock-menu="${esc(m.id_menu)}" title="Kelola / Restock Stok">Restock</button>
            <button type="button" class="btn btn--sm" data-edit-menu="${esc(m.id_menu)}">Edit</button>
            <button type="button" class="btn btn--sm" data-delete-menu="${esc(m.id_menu)}" style="color:var(--bad);" title="Hapus / Nonaktifkan Menu">Hapus</button>
          </div>
        </div>
      </article>
    `).join('');
  }

  function renderInventoryLogs() {
    const logContainer = document.getElementById('inventory-logs-container');
    if (!logContainer) return;

    const q = (STATE.invLogSearch || '').trim().toLowerCase();
    const typeFilter = STATE.invLogType || 'all';

    const filteredLogs = (STATE.inventoryLogs || []).filter(log => {
      const jenis = String(log.jenis || 'PENYESUAIAN').toUpperCase();
      const matchType = typeFilter === 'all'
        || (typeFilter === 'WASTE' ? ['RUSAK', 'KADALUARSA', 'KELUAR'].includes(jenis) : jenis === typeFilter);
      const matchSearch = !q
        || String(log.nama_menu || '').toLowerCase().includes(q)
        || String(log.keterangan || '').toLowerCase().includes(q)
        || String(log.nama_pengguna || '').toLowerCase().includes(q)
        || String(log.id_menu || '').toLowerCase().includes(q);
      return matchType && matchSearch;
    });

    if (filteredLogs.length === 0) {
      logContainer.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:var(--fs-xs);">Belum ada riwayat mutasi stok yang sesuai filter pada cabang ini.</div>';
      return;
    }

    const badgeConfig = {
      MASUK: { cls: 'pill--good', lbl: 'Restock (Masuk)' },
      PENJUALAN: { cls: '', lbl: 'Penjualan POS' },
      OPNAME: { cls: 'pill--warn', lbl: 'Stock Opname' },
      PENYESUAIAN: { cls: 'pill--warn', lbl: 'Penyesuaian' },
      RUSAK: { cls: 'pill--bad', lbl: 'Barang Rusak' },
      KADALUARSA: { cls: 'pill--bad', lbl: 'Kedaluwarsa' },
      KELUAR: { cls: 'pill--bad', lbl: 'Stok Keluar' }
    };

    logContainer.innerHTML = filteredLogs.slice(0, 60).map(log => {
      const jenis = String(log.jenis || 'PENYESUAIAN').toUpperCase();
      const cfg = badgeConfig[jenis] || { cls: '', lbl: jenis };
      const delta = Number(log.perubahan || 0);
      const deltaStr = delta > 0 ? `+${delta}` : String(delta);
      const deltaColor = delta > 0 ? 'var(--good)' : (delta < 0 ? 'var(--bad)' : 'var(--muted)');
      const stokAwal = log.stok_awal !== undefined && log.stok_awal !== null
        ? log.stok_awal
        : (Number(log.stok_sisa || 0) - delta);
      const waktu = log.tanggal
        ? new Date(log.tanggal).toLocaleString('id-ID', {
            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
          })
        : '-';
      const userLbl = log.nama_pengguna || log.id_pengguna || 'Sistem';
      const expPart = log.tanggal_kadaluarsa ? ` · Exp: ${log.tanggal_kadaluarsa}` : '';

      return `
        <div class="ac-row" data-log-id="${esc(log.id_stok)}">
          <div class="tx__ico" style="color:${deltaColor};font-weight:800;">${esc(deltaStr)}</div>
          <div class="ac-row__who">
            <b>${esc(log.nama_menu || log.id_menu)}</b>
            <small>${esc(log.keterangan || '-')} · Oleh: <b>${esc(userLbl)}</b>${esc(expPart)}</small>
          </div>
          <div class="ac-row__acc">${esc(waktu)}</div>
          <div class="ac-row__cat num">Awal ${esc(stokAwal)} &rarr; <b>Sisa ${esc(log.stok_sisa)}</b></div>
          <div class="ac-row__status"><span class="pill ${cfg.cls}">${esc(cfg.lbl)}</span></div>
          <div style="text-align:right;font-size:var(--fs-2xs);color:var(--muted);">${esc(log.nama_cabang || log.id_cabang || STATE.branch)}</div>
        </div>
      `;
    }).join('');
  }

  function renderInventoryView() {
    const container = document.getElementById('inventory-rows-container');
    if (!container) return;

    const items = STATE.inventory;
    const onlyLowItems = items.filter(item => item.status_stok === 'Menipis');
    const outItems = items.filter(item => item.status_stok === 'Habis');
    const alertItems = items.filter(item => item.status_stok === 'Menipis' || item.status_stok === 'Habis');
    const expiredItems = items.filter(item => item.is_expired);
    const nearExpiryItems = items.filter(item => item.is_near_expiry);
    const safeItems = items.filter(item => item.status_stok === 'Aman' && !item.is_expired);

    const totalEl = document.getElementById('inv-sum-total');
    const safeEl = document.getElementById('inv-sum-safe');
    const lowEl = document.getElementById('inv-sum-low');
    const lowNamesEl = document.getElementById('inv-sum-low-names');
    const outEl = document.getElementById('inv-sum-out');
    const outNamesEl = document.getElementById('inv-sum-out-names');
    const expEl = document.getElementById('inv-sum-exp');
    const expSubEl = document.getElementById('inv-sum-exp-sub');
    const navBadge = document.getElementById('nav-inv-badge');

    if (totalEl) totalEl.textContent = items.length + ' Item Stok';
    if (safeEl) safeEl.textContent = safeItems.length + ' Aman';
    if (lowEl) lowEl.textContent = onlyLowItems.length + ' Menipis';
    if (lowNamesEl) {
      lowNamesEl.textContent = onlyLowItems.length > 0
        ? onlyLowItems.slice(0, 2).map(i => i.nama).join(', ')
        : 'Batas minimum aman';
    }
    if (outEl) outEl.textContent = outItems.length + ' Habis';
    if (outNamesEl) {
      outNamesEl.textContent = outItems.length > 0
        ? outItems.slice(0, 2).map(i => i.nama).join(', ')
        : 'Semua menu tersedia';
    }
    if (expEl) expEl.textContent = (expiredItems.length + nearExpiryItems.length) + ' Item';
    if (expSubEl) {
      expSubEl.textContent = expiredItems.length > 0
        ? `${expiredItems.length} Expired · ${nearExpiryItems.length} Near-Exp`
        : (nearExpiryItems.length > 0 ? `${nearExpiryItems.length} Mendekati Kadaluarsa` : 'Quality Control Lulus');
    }
    if (navBadge) {
      const totalAlerts = alertItems.length + expiredItems.length;
      navBadge.textContent = totalAlerts > 0 ? totalAlerts + ' Alert' : 'Aman';
    }

    const q = (STATE.invSearch || '').trim().toLowerCase();
    const statusFilter = STATE.invFilterStatus || 'all';
    const catFilter = STATE.invFilterCat || 'all';

    const filtered = items.filter(item => {
      const matchCat = catFilter === 'all' || item.kategori === catFilter;
      const matchSearch = !q || item.nama.toLowerCase().includes(q) || item.id.toLowerCase().includes(q);
      let matchStatus = true;
      if (statusFilter === 'Expired') {
        matchStatus = Boolean(item.is_expired || item.is_near_expiry);
      } else if (statusFilter !== 'all') {
        matchStatus = item.status_stok === statusFilter;
      }
      return matchCat && matchSearch && matchStatus;
    });

    if (filtered.length === 0) {
      container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);">Tidak ada item stok yang sesuai filter pada cabang ini.</div>';
      renderInventoryLogs();
      return;
    }

    container.innerHTML = filtered.map(item => {
      const pillCls = item.is_expired || item.status_stok === 'Habis'
        ? 'pill--bad'
        : (item.status_stok === 'Menipis' || item.is_near_expiry) ? 'pill--warn' : 'pill--good';
      const statusLbl = item.is_expired
        ? 'Expired'
        : (item.is_near_expiry && item.status_stok === 'Aman' ? 'Near Expiry' : (item.status_stok || 'Aman'));
      let expiry = 'Tanpa tanggal kadaluarsa';
      if (item.exp && item.exp !== '-') {
        if (item.is_expired) {
          expiry = `EXPIRED (${item.exp})`;
        } else if (item.is_near_expiry) {
          expiry = `Segera Exp: ${item.exp} (${item.days_until_expiry} hr)`;
        } else {
          expiry = `Kadaluarsa: ${item.exp}`;
        }
      }

      return `
        <div class="ac-row" data-inv-row="${esc(item.id)}">
          <div class="tx__ico" style="font-weight:800;">${esc(item.stok)}</div>
          <div class="ac-row__who">
            <b>${esc(item.nama)}</b>
            <small>Kode: ${esc(item.id)} · ${esc(item.kategori)} · Min Alert: <b>${esc(item.min_stok ?? 5)}</b> · ${esc(expiry)}</small>
          </div>
          <div class="ac-row__acc">${esc(item.cabang)}</div>
          <div class="ac-row__cat num">${esc(item.stok)} porsi</div>
          <div class="ac-row__status"><span class="pill ${pillCls}">${esc(statusLbl)}</span></div>
          <div style="display:flex;gap:6px;justify-content:flex-end;">
            <button type="button" class="btn btn--sm btn--primary" data-restock-id="${esc(item.id)}">Restock</button>
            <button type="button" class="btn btn--sm" data-adjust-stock="${esc(item.id)}">Kelola</button>
          </div>
        </div>
      `;
    }).join('');

    renderInventoryLogs();
  }

  function renderReportsView() {
    const data = STATE.analytics;
    const empty = '<div style="padding:18px;color:var(--muted);font-size:var(--fs-xs);">Belum ada data penjualan untuk cabang ini.</div>';

    if (data && data.summary) {
      const kpiMonthEl = document.getElementById('rep-kpi-month');
      const kpiCupsEl = document.getElementById('rep-kpi-cups');
      const kpiTaxEl = document.getElementById('rep-kpi-tax');
      const totalRev = Number(data.summary.total_pendapatan || 0);
      const totalTax = data.summary.total_pajak !== undefined
        ? Number(data.summary.total_pajak)
        : Math.round(totalRev - (totalRev / (1 + (STATE.taxRate / 100))));
      const totalCups = data.summary.total_porsi !== undefined
        ? Number(data.summary.total_porsi)
        : (data.top_items || []).reduce((s, it) => s + Number(it.total_qty || 0), 0);

      if (kpiMonthEl) kpiMonthEl.textContent = formatRp(totalRev);
      if (kpiCupsEl) kpiCupsEl.textContent = totalCups.toLocaleString('id-ID') + ' Porsi';
      if (kpiTaxEl) kpiTaxEl.textContent = formatRp(totalTax);
    }

    const barsEl = document.getElementById('reports-bars-chart');
    if (barsEl) {
      if (!data || !data.monthly || data.monthly.length === 0) {
        barsEl.innerHTML = empty;
      } else {
        const maxTotal = Math.max(1, ...data.monthly.map(row => row.total));
        barsEl.innerHTML = data.monthly.map((row, index) => `
          <div class="bars__col ${index === data.monthly.length - 1 ? 'is-now' : ''}">
            <span class="bars__val">${formatRp(row.total)}</span>
            <div class="bars__stack">
              <i style="height:${Math.max(4, Math.round((row.total / maxTotal) * 120))}px;background:var(--accent)"></i>
            </div>
            <span class="bars__lbl">${esc(row.label)} · ${esc(row.orders)}x</span>
          </div>
        `).join('');
      }
    }

    const catEl = document.getElementById('reports-category-breakdown');
    if (catEl) {
      if (!data || !data.category_breakdown || data.category_breakdown.length === 0) {
        catEl.innerHTML = empty;
      } else {
        const colors = ['var(--accent)', 'var(--tangerine)', 'var(--good)', 'var(--c-work)', 'var(--muted)'];
        catEl.innerHTML = data.category_breakdown.map((row, index) => `
          <div class="an-cat">
            <div class="an-cat__top">
              <span class="an-cat__l"><i class="sw" style="background:${colors[index % colors.length]}"></i>${esc(row.kategori)}</span>
              <span class="an-cat__r"><b class="priv">${formatRp(row.total)}</b><small>${esc(row.percentage)}%</small></span>
            </div>
            <div class="meter"><i style="width:${row.percentage}%;background:${colors[index % colors.length]}"></i></div>
          </div>
        `).join('');
      }
    }

    const heatEl = document.getElementById('reports-heatmap');
    if (heatEl) {
      if (!data || !data.heatmap || data.heatmap.length === 0) {
        heatEl.innerHTML = empty;
      } else {
        heatEl.innerHTML = `
          <div class="heat__head"><span></span><span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span><span>Jum</span><span>Sab</span><span>Min</span></div>
          ${data.heatmap.map(row => `
            <div class="heat__row">
              <small>${esc(row.slot)}</small>
              ${row.vals.map(value => `<div class="heat__cell" style="--v:${value}">${value}%</div>`).join('')}
            </div>
          `).join('')}
        `;
      }
    }

    const topEl = document.getElementById('reports-top-items');
    if (topEl) {
      if (!data || !data.top_items || data.top_items.length === 0) {
        topEl.innerHTML = empty;
      } else {
        topEl.innerHTML = data.top_items.map((item, index) => `
          <div class="an-shop">
            <div class="tx__ico">#${index + 1}</div>
            <div class="an-shop__meta">
              <b>${esc(item.nama_menu)}</b>
              <small>${esc(item.total_qty)} porsi terjual</small>
            </div>
            <div class="an-shop__amt priv">${formatRp(item.total_sales)}</div>
          </div>
        `).join('');
      }
    }
  }

  function renderMembersView(searchQuery = '') {
    const el = document.getElementById('members-list-container');
    if (!el) return;
    const q = searchQuery.toLowerCase();
    const list = STATE.members.filter(m => !q || m.nama.toLowerCase().includes(q) || m.telp.includes(q));
    if (list.length === 0) {
      el.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);">Belum ada data member. Modul loyalitas memerlukan keputusan aturan tier dan poin sebelum diaktifkan.</div>';
      return;
    }
    el.innerHTML = list.map(m => `
      <div class="ac-row">
        <span class="av">${esc(m.inisial)}</span>
        <div class="ac-row__who">
          <b>${esc(m.nama)}</b>
          <small>${esc(m.telp)} · ID: ${esc(m.id)}</small>
        </div>
        <div class="ac-row__acc">${esc(m.kunjungan)}</div>
        <div class="ac-row__cat"><span class="pill pill--good">${esc(m.tier)}</span></div>
        <div class="ac-row__status"><strong class="num">${esc(m.poin)} Poin</strong></div>
        <div style="text-align:right;">
          <button type="button" class="btn btn--sm" data-use-member="${esc(m.nama)}">Pilih di POS</button>
        </div>
      </div>
    `).join('');
  }

  function renderAll() {
    renderOverviewWidgets();
    renderPosProducts();
    renderCart();
    renderOrdersView();
    renderCatalogView();
    renderInventoryView();
    renderReportsView();
    renderMembersView();
  }

  /* ============================================================
     6. BACKEND API INTEGRATION (FETCH MENU, ORDERS, DASHBOARD)
     ============================================================ */
  function redirectIfUnauthorized(response) {
    if (response.status === 401) {
      window.location.href = 'login.html';
      return true;
    }
    return false;
  }

  function mapOrderFromApi(order) {
    const items = (order.items || []).map(item => ({
      nama_menu: item.nama_menu,
      jumlah: item.jumlah,
      harga: item.harga_satuan
    }));

    const rawMeja = String(order.nomor_meja || '').trim();
    let jenis = order.jenis_pesanan;
    if (!['Dine-In', 'Takeaway', 'Delivery'].includes(jenis)) {
      if (rawMeja.toLowerCase().includes('take')) jenis = 'Takeaway';
      else if (rawMeja.toLowerCase() === 'delivery') jenis = 'Delivery';
      else if (rawMeja && rawMeja !== '-') jenis = 'Dine-In';
      else jenis = 'Takeaway';
    }

    const nomorMeja = jenis === 'Dine-In' ? (rawMeja && rawMeja !== '-' ? rawMeja : '-') : '-';
    const lokasiLabel = jenis === 'Dine-In' && nomorMeja !== '-'
      ? `Dine-In (${nomorMeja})`
      : jenis;
    const badgeMeja = jenis === 'Dine-In' && nomorMeja !== '-'
      ? nomorMeja.replace('Meja ', 'M')
      : (jenis === 'Delivery' ? 'DLV' : 'TA');

    return {
      id_pesanan: order.id_pesanan,
      nomor_struk: order.nomor_struk || order.id_pesanan,
      nama_pelanggan: order.nama_pelanggan || 'Pelanggan Umum',
      jenis_pesanan: jenis,
      nomor_meja: nomorMeja,
      lokasi_label: lokasiLabel,
      badge_meja: badgeMeja,
      tipe: jenis,
      catatan: order.catatan || '',
      metode_pembayaran: order.metode || 'Cash',
      nominal_diterima: order.nominal_diterima,
      kembalian: order.kembalian,
      referensi: order.referensi || '',
      tanggal_iso: order.tanggal_pesanan,
      status_dapur: order.status_dapur || 'served',
      status: (order.status_dapur || 'served') === 'pending' ? 'Diproses' : 'Selesai',
      waktu: order.tanggal_pesanan
        ? new Date(order.tanggal_pesanan).toLocaleString('id-ID', {
            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
          })
        : '-',
      subtotal: order.subtotal,
      pajak: order.pajak,
      diskon: order.diskon,
      total: order.total,
      items: items
    };
  }

  async function fetchOrders() {
    const res = await fetch(`/api/orders?cabang=${encodeURIComponent(STATE.branch)}`);
    if (redirectIfUnauthorized(res)) return;
    if (!res.ok) throw new Error('Gagal memuat riwayat pesanan');
    const payload = await res.json();
    STATE.orders = (payload.data || []).map(mapOrderFromApi);
  }

  async function loadSettings() {
    try {
      const res = await fetch('/api/settings');
      if (redirectIfUnauthorized(res)) return;
      if (!res.ok) throw new Error('Gagal memuat pengaturan');
      const payload = await res.json();
      if (!payload.success) return;

      const settings = payload.data || {};
      const fields = {
        'set-cafe-name': settings.cafe_name,
        'set-branch-addr': settings.cafe_address,
        'set-branch-phone': settings.cafe_phone,
        'set-tax-rate': settings.tax_rate,
        'set-receipt-footer': settings.receipt_footer
      };
      Object.entries(fields).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element && value !== undefined) element.value = value;
      });

      const rate = Number(settings.tax_rate);
      STATE.taxRate = Number.isFinite(rate) && rate >= 0 && rate <= 25 ? rate : 10;
      renderCart();
    } catch (err) {
      showToast('Gagal memuat pengaturan: ' + err.message);
    }
  }

  async function loadAnalytics() {
    if (!canView('reports')) return;
    const res = await fetch(`/api/reports/analytics?cabang=${encodeURIComponent(STATE.branch)}`);
    if (redirectIfUnauthorized(res)) return;
    if (res.status === 403) return;
    if (!res.ok) throw new Error('Gagal memuat analitik');
    const payload = await res.json();
    if (payload.success) {
      STATE.analytics = payload.data;
      renderReportsView();
    }
  }

  async function syncWithBackend() {
    try {
      const menuRes = await fetch(`/api/menu?cabang=${encodeURIComponent(STATE.branch)}`);
      if (redirectIfUnauthorized(menuRes)) return;
      if (menuRes.ok) {
        const menuData = await menuRes.json();
        STATE.menus = menuData.success && Array.isArray(menuData.data) ? menuData.data : [];
        reconcileCartWithProducts();
      }

      await fetchOrders();

      if (canView('inventory') || STATE.user.peran === 'owner') {
        const stockRes = await fetch(`/api/stock?cabang=${encodeURIComponent(STATE.branch)}`);
        if (redirectIfUnauthorized(stockRes)) return;
        if (stockRes.ok) {
          const stockPayload = await stockRes.json();
          STATE.inventory = (stockPayload.data || []).map(item => ({
            id: item.id_menu,
            nama: item.nama_menu,
            kategori: item.kategori,
            stok: item.stok,
            min_stok: item.min_stok ?? 5,
            status_stok: item.status_stok,
            exp: item.tanggal_kadaluarsa || '-',
            days_until_expiry: item.days_until_expiry,
            is_expired: item.is_expired,
            is_near_expiry: item.is_near_expiry,
            cabang: item.nama_cabang || item.id_cabang
          }));
        }

        const logRes = await fetch(`/api/stock/logs?cabang=${encodeURIComponent(STATE.branch)}&limit=100`);
        if (!redirectIfUnauthorized(logRes) && logRes.ok) {
          const logPayload = await logRes.json();
          STATE.inventoryLogs = logPayload.success && Array.isArray(logPayload.data) ? logPayload.data : [];
        }
      } else {
        const branchName = STATE.branch === 'CBG002' ? 'Cabang 2 - Surabaya Timur' : 'Cabang 1 - Surabaya Pusat';
        STATE.inventory = STATE.menus
          .filter(m => m.is_available !== 0)
          .slice()
          .sort((a, b) => a.stok - b.stok)
          .map(item => {
            const minStok = item.min_stok ?? 5;
            return {
              id: item.id_menu,
              nama: item.nama_menu,
              kategori: item.kategori,
              stok: item.stok,
              min_stok: minStok,
              status_stok: item.stok <= 0 ? 'Habis' : item.stok <= minStok ? 'Menipis' : 'Aman',
              exp: item.tanggal_kadaluarsa || '-',
              days_until_expiry: null,
              is_expired: false,
              is_near_expiry: false,
              cabang: branchName
            };
          });
      }

      const dashRes = await fetch(`/api/reports/dashboard?cabang=${encodeURIComponent(STATE.branch)}`);
      if (!redirectIfUnauthorized(dashRes) && dashRes.ok) {
        const dash = await dashRes.json();
        if (dash.success && dash.data) {
          RANGE_DATA.today.rev = formatRp(dash.data.total_revenue_today);
          RANGE_DATA.today.sub = `${dash.data.total_order_today} pesanan hari ini`;
          RANGE_DATA.today.delta = '';

          const now = Date.now();
          const sumSince = (days) => STATE.orders
            .filter(o => new Date(o.tanggal_iso).getTime() >= now - days * 86400000)
            .reduce((sum, o) => sum + Number(o.total || 0), 0);

          RANGE_DATA['7d'].rev = formatRp(sumSince(7));
          RANGE_DATA['7d'].sub = 'Total 7 hari terakhir';
          RANGE_DATA['7d'].delta = '';
          RANGE_DATA['30d'].rev = formatRp(sumSince(30));
          RANGE_DATA['30d'].sub = 'Total 30 hari terakhir';
          RANGE_DATA['30d'].delta = '';

          renderOverviewAreaRange(STATE.overviewRange);
        }
      }

      await loadAnalytics();
      renderAll();
    } catch (e) {
      renderAll();
      showToast('Gagal memuat data dari server: ' + e.message);
    }
  }

  function updateStockAdjustPreview() {
    const id = document.getElementById('adj-menu-id')?.value;
    const inv = STATE.inventory.find(i => i.id === id) || STATE.menus.find(m => m.id_menu === id);
    const currentStok = inv ? Number(inv.stok || 0) : 0;
    const type = document.getElementById('adj-movement-type')?.value || 'MASUK';
    const qtyInput = document.getElementById('adj-qty');
    const qtyLabel = document.getElementById('adj-qty-label');
    const reasonInput = document.getElementById('adj-reason');
    const previewVal = document.getElementById('adj-preview-val');

    const rawQty = qtyInput ? Number(qtyInput.value) : 0;
    const qty = Number.isFinite(rawQty) && rawQty >= 0 ? Math.floor(rawQty) : 0;

    const labelByType = {
      MASUK: 'Jumlah Tambahan (Porsi)',
      KELUAR: 'Jumlah Pengurangan (Porsi)',
      RUSAK: 'Jumlah Barang Rusak / Waste (Porsi)',
      KADALUARSA: 'Jumlah Stok Kedaluwarsa (Porsi)',
      PENYESUAIAN: 'Target Jumlah Stok Baru (Porsi)',
      OPNAME: 'Hasil Hitung Stok Fisik (Porsi)'
    };
    if (qtyLabel) qtyLabel.textContent = labelByType[type] || 'Jumlah (Porsi)';

    const defaultReasonByType = {
      MASUK: 'Restock persediaan cabang',
      KELUAR: 'Pengurangan stok operasional',
      RUSAK: 'Barang rusak / tumpah saat penyajian',
      KADALUARSA: 'Pemusnahan stok melewati tanggal kadaluarsa',
      PENYESUAIAN: 'Penyesuaian stok manual',
      OPNAME: 'Koreksi stok fisik (Stock Opname)'
    };
    if (reasonInput && (!reasonInput.value || Object.values(defaultReasonByType).includes(reasonInput.value))) {
      reasonInput.value = defaultReasonByType[type] || 'Penyesuaian stok';
    }

    let nextStok = currentStok;
    if (type === 'MASUK') {
      nextStok = currentStok + qty;
    } else if (type === 'KELUAR' || type === 'RUSAK' || type === 'KADALUARSA') {
      nextStok = currentStok - qty;
    } else {
      nextStok = qty;
    }

    if (previewVal) {
      const diff = nextStok - currentStok;
      const diffStr = diff > 0 ? `+${diff}` : String(diff);
      if (nextStok < 0) {
        previewVal.textContent = `Stok tidak cukup (${nextStok} porsi)`;
        previewVal.style.color = 'var(--bad)';
      } else {
        previewVal.textContent = `${currentStok} → ${nextStok} porsi (${diffStr})`;
        previewVal.style.color = nextStok <= 0 ? 'var(--bad)' : 'var(--good)';
      }
    }
  }

  function openStockAdjustModal(menuId, defaultType = 'MASUK') {
    const inv = STATE.inventory.find(i => i.id === menuId);
    const menu = STATE.menus.find(m => m.id_menu === menuId);
    if (!inv && !menu) return;

    const itemName = inv ? inv.nama : menu.nama_menu;
    const currentStok = inv ? inv.stok : menu.stok;
    const minStok = inv ? (inv.min_stok ?? 5) : (menu.min_stok ?? 5);
    const expDate = (inv && inv.exp && inv.exp !== '-') ? inv.exp : (menu?.tanggal_kadaluarsa || '');
    const branchLabel = inv ? inv.cabang : (STATE.branch === 'CBG002' ? 'Cabang Surabaya Timur' : 'Cabang Surabaya Pusat');

    document.getElementById('adj-menu-id').value = menuId;
    document.getElementById('adj-item-name').textContent = `${itemName} (${menuId})`;
    document.getElementById('adj-branch-label').textContent = branchLabel;
    document.getElementById('adj-current-stock').textContent = `${currentStok} porsi`;
    document.getElementById('adj-movement-type').value = defaultType;
    document.getElementById('adj-qty').value = (defaultType === 'PENYESUAIAN' || defaultType === 'OPNAME') ? String(currentStok) : '10';
    document.getElementById('adj-min-stock').value = String(minStok);
    document.getElementById('adj-exp-date').value = expDate;
    document.getElementById('adj-reason').value = '';

    updateStockAdjustPreview();
    const modal = document.getElementById('stock-adjust-modal');
    modal.classList.add('is-open');
    focusModal(modal);
  }

  function updateOpnameSummary() {
    const inputs = document.querySelectorAll('[data-opname-input]');
    let diffCount = 0;
    inputs.forEach(input => {
      const sys = Number(input.dataset.opnameSys || 0);
      const val = Number(input.value);
      const selisih = (Number.isFinite(val) ? val : sys) - sys;
      const badge = document.querySelector(`[data-opname-badge="${input.dataset.opnameInput}"]`);
      if (badge) {
        if (selisih === 0) {
          badge.className = 'pill pill--good';
          badge.textContent = '0 (Sesuai)';
        } else if (selisih > 0) {
          badge.className = 'pill pill--warn';
          badge.textContent = `+${selisih} (Surplus)`;
          diffCount += 1;
        } else {
          badge.className = 'pill pill--bad';
          badge.textContent = `${selisih} (Defisit)`;
          diffCount += 1;
        }
      }
    });
    const summaryEl = document.getElementById('opname-summary-label');
    if (summaryEl) {
      summaryEl.textContent = `${diffCount} dari ${inputs.length} item memiliki selisih fisik vs sistem`;
    }
  }

  function openStockOpnameModal() {
    const container = document.getElementById('opname-items-container');
    if (!container) return;

    const branchLabel = STATE.branch === 'CBG002' ? 'NomCherry Cabang Timur (CBG002)' : 'NomCherry Pusat (CBG001)';
    const subEl = document.getElementById('stock-opname-branch-sub');
    if (subEl) subEl.textContent = `Cabang Aktif: ${branchLabel} — Masukkan stok fisik aktual hasil perhitungan gudang/barista`;

    container.innerHTML = STATE.inventory.map(item => `
      <div class="ac-row" style="padding:8px 6px;gap:8px;align-items:center;" data-opname-row="${esc(item.id)}">
        <div class="ac-row__who" style="min-width:160px;">
          <b>${esc(item.nama)}</b>
          <small>${esc(item.id)} · ${esc(item.kategori)}</small>
        </div>
        <div class="num" style="font-size:var(--fs-xs);color:var(--muted);">Sistem: <b>${esc(item.stok)}</b></div>
        <div style="display:flex;align-items:center;gap:6px;">
          <label style="font-size:var(--fs-2xs);color:var(--muted);">Fisik:</label>
          <input type="number" min="0" max="10000" value="${esc(item.stok)}"
                 data-opname-input="${esc(item.id)}" data-opname-sys="${esc(item.stok)}"
                 style="width:76px;padding:5px 8px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--ink);">
        </div>
        <div><span class="pill pill--good" data-opname-badge="${esc(item.id)}">0 (Sesuai)</span></div>
        <div style="flex:1;min-width:140px;">
          <input type="text" placeholder="Catatan selisih (opsional)"
                 data-opname-reason="${esc(item.id)}"
                 style="width:100%;padding:5px 8px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--ink);font-size:var(--fs-2xs);">
        </div>
      </div>
    `).join('');

    updateOpnameSummary();
    const modal = document.getElementById('stock-opname-modal');
    modal.classList.add('is-open');
    focusModal(modal);
  }

  /* ============================================================
     7. INTERACTIVE EVENT LISTENERS
     ============================================================ */
  function bindEvents() {
    // Sidebar & Mobile Navigation
    document.querySelectorAll('[data-view]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        switchView(el.dataset.view);
      });
    });

    document.querySelectorAll('[data-goto-view]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        switchView(el.dataset.gotoView);
      });
    });

    document.getElementById('top-quick-pos-btn').addEventListener('click', () => switchView('pos'));
    document.getElementById('brand-home-link').addEventListener('click', (e) => {
      e.preventDefault();
      switchView('overview');
    });

    // Mobile drawer
    document.getElementById('mobile-menu-btn').addEventListener('click', () => {
      document.getElementById('app-shell').classList.toggle('is-mobile-open');
    });
    document.getElementById('mobile-backdrop').addEventListener('click', () => {
      document.getElementById('app-shell').classList.remove('is-mobile-open');
    });

    // Search shortcut (#side-search-btn & Ctrl+K)
    document.getElementById('side-search-btn').addEventListener('click', () => {
      switchView('pos');
      setTimeout(() => document.getElementById('pos-search-input').focus(), 60);
    });
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        switchView('pos');
        setTimeout(() => document.getElementById('pos-search-input').focus(), 60);
        return;
      }

      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop.is-open').forEach(modal => {
          modal.classList.remove('is-open');
        });
        return;
      }

      if (e.key === 'Enter' || e.key === ' ') {
        const productCard = e.target.closest('[data-add-menu]');
        if (productCard) {
          e.preventDefault();
          addToCart(productCard.dataset.addMenu);
          return;
        }

        const payCard = e.target.closest('.paydeck[data-card-idx]');
        if (payCard) {
          e.preventDefault();
          updateCardStack(Number(payCard.dataset.cardIdx));
        }
      }
    });

    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', () => {
      const root = document.documentElement;
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      localStorage.setItem('nomcherry_theme', next);
    });

    // Privacy toggle
    document.getElementById('priv-toggle-btn').addEventListener('click', () => {
      document.body.classList.toggle('is-priv');
    });

    // Popovers
    document.getElementById('sidebar-user-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('user-popover').classList.toggle('is-open');
      document.getElementById('notif-popover').classList.remove('is-open');
    });
    document.getElementById('notif-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('notif-popover').classList.toggle('is-open');
      document.getElementById('user-popover').classList.remove('is-open');
      document.getElementById('notif-dot').style.display = 'none';
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#user-popover') && !e.target.closest('#sidebar-user-btn')) {
        document.getElementById('user-popover').classList.remove('is-open');
      }
      if (!e.target.closest('#notif-popover') && !e.target.closest('#notif-btn')) {
        document.getElementById('notif-popover').classList.remove('is-open');
      }
    });

    // Branch selector
    document.getElementById('branch-selector').addEventListener('change', async (e) => {
      if (STATE.user.peran === 'kasir' && e.target.value !== STATE.user.id_cabang) {
        e.target.value = STATE.user.id_cabang;
        showToast('Kasir hanya dapat mengakses cabang tugas terdaftar.');
        return;
      }
      STATE.branch = e.target.value;
      initSessionAndHeader();
      showToast('Berpindah ke ' + (STATE.branch === 'CBG002' ? 'Cabang Surabaya Timur' : 'Cabang Surabaya Pusat'));
      await syncWithBackend();
    });

    // Overview Range Segmented Control
    document.querySelectorAll('#ov-range-seg button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#ov-range-seg button').forEach(b => {
          b.classList.remove('is-active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('is-active');
        btn.setAttribute('aria-pressed', 'true');
        renderOverviewAreaRange(btn.dataset.range);
      });
    });

    // Card Stack Controls
    document.getElementById('cstack-prev').addEventListener('click', () => updateCardStack(STATE.cardStackIdx - 1));
    document.getElementById('cstack-next').addEventListener('click', () => updateCardStack(STATE.cardStackIdx + 1));
    document.querySelectorAll('#cstack-dots button').forEach(btn => {
      btn.addEventListener('click', () => updateCardStack(Number(btn.dataset.dot)));
    });
    document.querySelectorAll('#cstack-pile .paydeck').forEach(card => {
      card.addEventListener('click', () => updateCardStack(Number(card.dataset.cardIdx)));
    });

    // POS Category Tabs & Search
    document.querySelectorAll('#pos-category-tabs button').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#pos-category-tabs button').forEach(b => {
          b.classList.remove('is-active');
          b.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('is-active');
        tab.setAttribute('aria-selected', 'true');
        STATE.posCategory = tab.dataset.cat;
        renderPosProducts();
      });
    });

    document.getElementById('pos-search-input').addEventListener('input', (e) => {
      STATE.posSearch = e.target.value;
      renderPosProducts();
    });

    document.getElementById('toggle-photo-btn').addEventListener('click', (e) => {
      STATE.showPhotos = !STATE.showPhotos;
      e.currentTarget.textContent = STATE.showPhotos ? 'Sembunyikan Foto' : 'Tampilkan Foto';
      renderPosProducts();
    });

    // POS Order Type, Discount, Payment Method, Quick Cash
    document.querySelectorAll('#pos-order-type-seg button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#pos-order-type-seg button').forEach(b => {
          b.classList.remove('is-active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('is-active');
        btn.setAttribute('aria-pressed', 'true');
        STATE.orderType = btn.dataset.type;
        syncOrderTypeUi();
      });
    });

    document.querySelectorAll('#pos-discount-chips button').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#pos-discount-chips button').forEach(c => {
          c.classList.remove('is-active');
          c.setAttribute('aria-pressed', 'false');
        });
        chip.classList.add('is-active');
        chip.setAttribute('aria-pressed', 'true');
        STATE.discount = Number(chip.dataset.disc) || 0;
        renderCart();
      });
    });

    document.querySelectorAll('#pos-pay-method-seg button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#pos-pay-method-seg button').forEach(b => {
          b.classList.remove('is-active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('is-active');
        btn.setAttribute('aria-pressed', 'true');
        STATE.payMethod = btn.dataset.pay;
        syncPaymentMethodUi();
      });
    });

    document.querySelectorAll('[data-quick-cash]').forEach(chip => {
      chip.addEventListener('click', () => {
        const { total } = getCartTotals();
        const val = chip.dataset.quickCash === 'exact' ? total : Number(chip.dataset.quickCash);
        STATE.cashManuallyEdited = true;
        document.getElementById('cart-cash-received').value = String(val);
        updateCashChange();
      });
    });

    document.getElementById('cart-cash-received').addEventListener('input', () => {
      STATE.cashManuallyEdited = true;
      updateCashChange();
    });

    document.getElementById('clear-cart-btn').addEventListener('click', () => {
      STATE.cart = [];
      STATE.cashManuallyEdited = false;
      const qrisCheck = document.getElementById('qris-confirm-check');
      if (qrisCheck) qrisCheck.checked = false;
      const edcRefInput = document.getElementById('cart-edc-ref');
      if (edcRefInput) edcRefInput.value = '';
      renderCart();
    });

    // Checkout Button
    document.getElementById('checkout-btn').addEventListener('click', async () => {
      if (STATE.cart.length === 0) {
        showToast('Pilih minimal 1 menu sebelum melakukan pembayaran.');
        return;
      }

      const { total } = getCartTotals();
      const custName = document.getElementById('cart-customer-name').value.trim() || 'Pelanggan Umum';
      const orderType = STATE.orderType || 'Dine-In';
      const tableInput = document.getElementById('cart-table-num');
      const rawTableNum = tableInput ? tableInput.value.trim() : '';
      const deliveryNoteInput = document.getElementById('cart-delivery-note');
      const deliveryNote = deliveryNoteInput ? deliveryNoteInput.value.trim() : '';

      if (orderType === 'Dine-In') {
        if (!rawTableNum || ['-', 'takeaway', 'take away', 'delivery'].includes(rawTableNum.toLowerCase())) {
          showToast('Nomor meja wajib diisi untuk pesanan Dine-In!');
          if (tableInput) tableInput.focus();
          return;
        }
      }

      const method = STATE.payMethod === 'Card' ? 'Debit' : STATE.payMethod;
      let cashReceived = total;
      let qrisConfirmed = false;
      let edcRef = '';

      if (method === 'Cash') {
        const rawCash = document.getElementById('cart-cash-received').value.trim();
        const parsedCash = rawCash === '' ? NaN : Number(rawCash);
        if (!Number.isFinite(parsedCash) || parsedCash < total) {
          showToast('Nominal tunai kurang dari total tagihan!');
          document.getElementById('cart-cash-received').focus();
          return;
        }
        cashReceived = parsedCash;
      } else if (method === 'QRIS') {
        const qrisCheck = document.getElementById('qris-confirm-check');
        qrisConfirmed = Boolean(qrisCheck && qrisCheck.checked);
        if (!qrisConfirmed) {
          showToast('Konfirmasi pembayaran QRIS terlebih dahulu sebelum menyelesaikan transaksi!');
          return;
        }
      } else if (method === 'Debit') {
        const edcInput = document.getElementById('cart-edc-ref');
        edcRef = edcInput ? edcInput.value.trim() : '';
      }

      const requestBody = {
        id_cabang: STATE.branch,
        nama_pelanggan: custName,
        jenis_pesanan: orderType,
        nomor_meja: orderType === 'Dine-In' ? rawTableNum : '-',
        catatan: orderType === 'Delivery' ? (deliveryNote || 'Pesanan Delivery') : '',
        metode_pembayaran: method,
        diskon: STATE.discount,
        items: STATE.cart.map(c => ({ id_menu: c.id_menu, jumlah: c.qty }))
      };

      if (method === 'Cash') {
        requestBody.nominal_diterima = cashReceived;
      } else if (method === 'QRIS') {
        requestBody.qris_confirmed = true;
      } else if (method === 'Debit' && edcRef) {
        requestBody.referensi = edcRef;
      }

      let serverData;
      try {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });

        if (redirectIfUnauthorized(res)) return;

        const payload = await res.json();
        if (!res.ok || !payload.success || !payload.data) {
          showToast(payload.message || 'Transaksi gagal diproses.');
          return;
        }
        serverData = payload.data;
      } catch (e) {
        showToast('Transaksi gagal: ' + e.message);
        return;
      }

      STATE.cart = [];
      STATE.cashManuallyEdited = false;
      document.getElementById('cart-customer-name').value = 'Pelanggan Umum';
      if (orderType === 'Dine-In') {
        STATE.lastDineInTable = 'Meja 04';
        if (tableInput) tableInput.value = 'Meja 04';
      }
      if (deliveryNoteInput) deliveryNoteInput.value = '';
      const qrisCheck = document.getElementById('qris-confirm-check');
      if (qrisCheck) qrisCheck.checked = false;
      const edcInput = document.getElementById('cart-edc-ref');
      if (edcInput) edcInput.value = '';

      const receiptOrder = mapOrderFromApi({
        id_pesanan: serverData.id_pesanan,
        nomor_struk: serverData.nomor_struk,
        nama_pelanggan: serverData.pelanggan,
        jenis_pesanan: serverData.jenis_pesanan,
        nomor_meja: serverData.nomor_meja,
        catatan: serverData.catatan,
        metode: serverData.metode,
        nominal_diterima: serverData.nominal_diterima,
        kembalian: serverData.kembalian,
        referensi: serverData.referensi,
        tanggal_pesanan: serverData.tanggal,
        subtotal: serverData.subtotal,
        pajak: serverData.pajak,
        diskon: serverData.diskon,
        total: serverData.total,
        status: 'completed',
        items: serverData.items.map(item => ({
          nama_menu: item.nama_menu,
          jumlah: item.jumlah,
          harga_satuan: item.harga
        }))
      });

      showToast('Transaksi berhasil! Struk ' + serverData.nomor_struk + ' diterbitkan.');
      await syncWithBackend();
      openReceiptModal(receiptOrder);
    });

    // Delegated Clicks (Add Product, Cart +/-, Receipt Modal, Complete Order, Restock, Edit Menu)
    document.addEventListener('click', async (e) => {
      const addCard = e.target.closest('[data-add-menu]');
      if (addCard) {
        addToCart(addCard.dataset.addMenu);
        return;
      }

      const incBtn = e.target.closest('[data-cart-inc]');
      if (incBtn) {
        addToCart(incBtn.dataset.cartInc);
        return;
      }

      const decBtn = e.target.closest('[data-cart-dec]');
      if (decBtn) {
        const id = decBtn.dataset.cartDec;
        const item = STATE.cart.find(c => c.id_menu === id);
        if (item) {
          item.qty -= 1;
          if (item.qty <= 0) STATE.cart = STATE.cart.filter(c => c.id_menu !== id);
          renderCart();
        }
        return;
      }

      const recBtn = e.target.closest('[data-open-receipt]');
      if (recBtn) {
        const ord = STATE.orders.find(o => o.id_pesanan === recBtn.dataset.openReceipt);
        if (ord) openReceiptModal(ord);
        return;
      }

      const compBtn = e.target.closest('[data-complete-order]');
      if (compBtn) {
        const ord = STATE.orders.find(o => o.id_pesanan === compBtn.dataset.completeOrder);
        if (!ord) return;
        try {
          const res = await fetch('/api/orders/' + encodeURIComponent(ord.id_pesanan) + '/status', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status_dapur: 'served' })
          });
          if (redirectIfUnauthorized(res)) return;
          const data = await res.json();
          if (!res.ok || !data.success) {
            showToast(data.message || 'Gagal memperbarui status pesanan.');
            return;
          }
          await syncWithBackend();
          showToast('Pesanan ' + ord.nama_pelanggan + ' selesai disajikan!');
        } catch (err) {
          showToast('Gagal memperbarui status: ' + err.message);
        }
        return;
      }

      const restockBtn = e.target.closest('[data-restock-id]');
      if (restockBtn) {
        openStockAdjustModal(restockBtn.dataset.restockId, 'MASUK');
        return;
      }

      const adjustStockBtn = e.target.closest('[data-adjust-stock]');
      if (adjustStockBtn) {
        openStockAdjustModal(adjustStockBtn.dataset.adjustStock, 'PENYESUAIAN');
        return;
      }

      const restockMenuBtn = e.target.closest('[data-restock-menu]');
      if (restockMenuBtn) {
        openStockAdjustModal(restockMenuBtn.dataset.restockMenu, 'MASUK');
        return;
      }

      const presetChip = e.target.closest('[data-adj-preset]');
      if (presetChip) {
        const qtyInput = document.getElementById('adj-qty');
        if (qtyInput) {
          qtyInput.value = presetChip.dataset.adjPreset;
          updateStockAdjustPreview();
        }
        return;
      }

      const editMenuBtn = e.target.closest('[data-edit-menu]');
      if (editMenuBtn) {
        const m = STATE.menus.find(x => x.id_menu === editMenuBtn.dataset.editMenu);
        if (m) {
          document.getElementById('menu-modal-title').textContent = 'Edit Menu Kafe';
          document.getElementById('crud-menu-id').value = m.id_menu;
          document.getElementById('crud-menu-name').value = m.nama_menu;
          document.getElementById('crud-menu-cat').value = m.kategori;
          document.getElementById('crud-menu-price').value = m.harga;
          document.getElementById('crud-menu-stock').value = m.stok;
          const minStockEl = document.getElementById('crud-menu-min-stock');
          if (minStockEl) minStockEl.value = m.min_stok ?? 5;
          const expEl = document.getElementById('crud-menu-exp');
          if (expEl) expEl.value = m.tanggal_kadaluarsa || '';
          document.getElementById('crud-menu-img').value = m.gambar || '';
          document.getElementById('crud-menu-desc').value = m.deskripsi || '';
          const menuModal = document.getElementById('menu-crud-modal');
          menuModal.classList.add('is-open');
          focusModal(menuModal);
        }
        return;
      }

      const deleteMenuBtn = e.target.closest('[data-delete-menu]');
      if (deleteMenuBtn) {
        const m = STATE.menus.find(x => x.id_menu === deleteMenuBtn.dataset.deleteMenu);
        if (!m) return;
        try {
          const res = await fetch('/api/menu/' + encodeURIComponent(m.id_menu), {
            method: 'DELETE'
          });
          if (redirectIfUnauthorized(res)) return;
          const data = await res.json();
          if (!res.ok || !data.success) {
            showToast(data.message || 'Gagal menghapus menu.');
            return;
          }
          await syncWithBackend();
          showToast(data.message || 'Menu berhasil dihapus.');
        } catch (err) {
          showToast('Gagal menghapus menu: ' + err.message);
        }
        return;
      }

      const useMemberBtn = e.target.closest('[data-use-member]');
      if (useMemberBtn) {
        document.getElementById('cart-customer-name').value = useMemberBtn.dataset.useMember;
        STATE.discount = 5000;
        renderCart();
        switchView('pos');
        showToast('Member ' + useMemberBtn.dataset.useMember + ' dipilih (-Rp 5.000).');
      }
    });

    // Orders View Filters
    document.querySelectorAll('#orders-status-chips button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#orders-status-chips button').forEach(b => {
          b.classList.remove('is-active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('is-active');
        btn.setAttribute('aria-pressed', 'true');
        STATE.ordersFilterStatus = btn.dataset.ordStatus;
        renderOrdersView();
      });
    });

    document.getElementById('orders-pay-select').addEventListener('change', (e) => {
      STATE.ordersFilterPay = e.target.value;
      renderOrdersView();
    });

    document.getElementById('orders-search-input').addEventListener('input', (e) => {
      STATE.ordersSearch = e.target.value;
      renderOrdersView();
    });

    document.getElementById('orders-refresh-btn').addEventListener('click', async () => {
      await syncWithBackend();
      showToast('Data antrean pesanan diperbarui.');
    });

    // Catalog Filters & CRUD Modal
    document.querySelectorAll('#catalog-filter-chips button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#catalog-filter-chips button').forEach(b => {
          b.classList.remove('is-active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('is-active');
        btn.setAttribute('aria-pressed', 'true');
        STATE.catalogCategory = btn.dataset.catFilter;
        renderCatalogView();
      });
    });

    document.getElementById('catalog-search-input').addEventListener('input', (e) => {
      STATE.catalogSearch = e.target.value;
      renderCatalogView();
    });

    document.getElementById('add-menu-btn').addEventListener('click', () => {
      document.getElementById('menu-modal-title').textContent = 'Tambah Menu Baru';
      document.getElementById('menu-crud-form').reset();
      document.getElementById('crud-menu-id').value = '';
      const menuModal = document.getElementById('menu-crud-modal');
      menuModal.classList.add('is-open');
      focusModal(menuModal);
    });

    document.getElementById('close-menu-modal-btn').addEventListener('click', () => {
      document.getElementById('menu-crud-modal').classList.remove('is-open');
    });
    document.getElementById('cancel-menu-modal-btn').addEventListener('click', () => {
      document.getElementById('menu-crud-modal').classList.remove('is-open');
    });

    document.getElementById('menu-crud-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('crud-menu-id').value;
      const minStockEl = document.getElementById('crud-menu-min-stock');
      const expEl = document.getElementById('crud-menu-exp');
      const payload = {
        id_cabang: STATE.branch,
        nama_menu: document.getElementById('crud-menu-name').value.trim(),
        kategori: document.getElementById('crud-menu-cat').value,
        harga: Number(document.getElementById('crud-menu-price').value) || 25000,
        stok: Number(document.getElementById('crud-menu-stock').value) || 0,
        min_stok: minStockEl && minStockEl.value !== '' ? Number(minStockEl.value) : 5,
        tanggal_kadaluarsa: expEl && expEl.value ? expEl.value : undefined,
        gambar: document.getElementById('crud-menu-img').value.trim() || 'assets/logo.png',
        deskripsi: document.getElementById('crud-menu-desc').value.trim()
      };

      try {
        const res = await fetch(id ? '/api/menu/' + encodeURIComponent(id) : '/api/menu', {
          method: id ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (redirectIfUnauthorized(res)) return;

        const data = await res.json();
        if (!res.ok || !data.success) {
          showToast(data.message || 'Gagal menyimpan menu.');
          return;
        }

        document.getElementById('menu-crud-modal').classList.remove('is-open');
        await syncWithBackend();
        showToast(id ? 'Menu berhasil diperbarui.' : 'Menu baru berhasil ditambahkan.');
      } catch (err) {
        showToast('Gagal menyimpan menu: ' + err.message);
      }
    });

    // Inventory View Filters & Search
    document.querySelectorAll('#inv-status-chips button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#inv-status-chips button').forEach(b => {
          b.classList.remove('is-active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('is-active');
        btn.setAttribute('aria-pressed', 'true');
        STATE.invFilterStatus = btn.dataset.invStatus;
        renderInventoryView();
      });
    });

    const invCatSelect = document.getElementById('inv-cat-select');
    if (invCatSelect) {
      invCatSelect.addEventListener('change', (e) => {
        STATE.invFilterCat = e.target.value;
        renderInventoryView();
      });
    }

    const invSearchInput = document.getElementById('inv-search-input');
    if (invSearchInput) {
      invSearchInput.addEventListener('input', (e) => {
        STATE.invSearch = e.target.value;
        renderInventoryView();
      });
    }

    document.querySelectorAll('#inv-log-type-chips button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#inv-log-type-chips button').forEach(b => {
          b.classList.remove('is-active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('is-active');
        btn.setAttribute('aria-pressed', 'true');
        STATE.invLogType = btn.dataset.logType;
        renderInventoryLogs();
      });
    });

    const invLogSearchInput = document.getElementById('inv-log-search-input');
    if (invLogSearchInput) {
      invLogSearchInput.addEventListener('input', (e) => {
        STATE.invLogSearch = e.target.value;
        renderInventoryLogs();
      });
    }

    // Stock Adjust Modal (Single Item Restock / Kelola / Waste / Expired)
    document.getElementById('adj-movement-type').addEventListener('change', () => {
      const id = document.getElementById('adj-menu-id').value;
      const inv = STATE.inventory.find(i => i.id === id);
      const type = document.getElementById('adj-movement-type').value;
      if ((type === 'PENYESUAIAN' || type === 'OPNAME') && inv) {
        document.getElementById('adj-qty').value = String(inv.stok);
      } else if (type === 'KADALUARSA' && inv && inv.stok > 0) {
        document.getElementById('adj-qty').value = String(inv.stok);
      }
      updateStockAdjustPreview();
    });

    document.getElementById('adj-qty').addEventListener('input', updateStockAdjustPreview);

    document.getElementById('close-stock-adjust-btn').addEventListener('click', () => {
      document.getElementById('stock-adjust-modal').classList.remove('is-open');
    });
    document.getElementById('cancel-stock-adjust-btn').addEventListener('click', () => {
      document.getElementById('stock-adjust-modal').classList.remove('is-open');
    });

    document.getElementById('stock-adjust-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id_menu = document.getElementById('adj-menu-id').value;
      const jenis = document.getElementById('adj-movement-type').value;
      const jumlah = Number(document.getElementById('adj-qty').value);
      const min_stok = Number(document.getElementById('adj-min-stock').value);
      const tanggal_kadaluarsa = document.getElementById('adj-exp-date').value.trim();
      const keterangan = document.getElementById('adj-reason').value.trim();

      try {
        const res = await fetch('/api/stock/adjust', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id_menu,
            id_cabang: STATE.branch,
            jenis,
            jumlah,
            min_stok: Number.isInteger(min_stok) && min_stok >= 0 ? min_stok : undefined,
            tanggal_kadaluarsa: tanggal_kadaluarsa || undefined,
            keterangan
          })
        });
        if (redirectIfUnauthorized(res)) return;
        const data = await res.json();
        if (!res.ok || !data.success) {
          showToast(data.message || 'Gagal menyimpan perubahan stok.');
          return;
        }
        document.getElementById('stock-adjust-modal').classList.remove('is-open');
        await syncWithBackend();
        showToast(`Stok ${data.data.nama_menu} berhasil diperbarui (${data.data.stok_sebelum} → ${data.data.stok_baru}).`);
      } catch (err) {
        showToast('Gagal menyimpan perubahan stok: ' + err.message);
      }
    });

    // Stock Opname Modal
    document.getElementById('stock-opname-btn').addEventListener('click', () => {
      if (STATE.inventory.length === 0) {
        showToast('Belum ada item stok untuk dilakukan Stock Opname.');
        return;
      }
      openStockOpnameModal();
    });

    document.getElementById('opname-items-container').addEventListener('input', (e) => {
      if (e.target.matches('[data-opname-input]')) {
        updateOpnameSummary();
      }
    });

    document.getElementById('close-opname-modal-btn').addEventListener('click', () => {
      document.getElementById('stock-opname-modal').classList.remove('is-open');
    });
    document.getElementById('cancel-opname-modal-btn').addEventListener('click', () => {
      document.getElementById('stock-opname-modal').classList.remove('is-open');
    });

    document.getElementById('stock-opname-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const catatan = document.getElementById('opname-general-note').value.trim();
      const items = [];
      document.querySelectorAll('[data-opname-input]').forEach(input => {
        const id_menu = input.dataset.opnameInput;
        const stok_fisik = Number(input.value);
        const reasonEl = document.querySelector(`[data-opname-reason="${id_menu}"]`);
        const keterangan = reasonEl ? reasonEl.value.trim() : '';
        items.push({ id_menu, stok_fisik, keterangan });
      });

      try {
        const res = await fetch('/api/stock/opname', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id_cabang: STATE.branch,
            catatan,
            items
          })
        });
        if (redirectIfUnauthorized(res)) return;
        const data = await res.json();
        if (!res.ok || !data.success) {
          showToast(data.message || 'Gagal menyimpan hasil Stock Opname.');
          return;
        }
        document.getElementById('stock-opname-modal').classList.remove('is-open');
        await syncWithBackend();
        showToast(data.message);
      } catch (err) {
        showToast('Gagal menyimpan Stock Opname: ' + err.message);
      }
    });

    // Controlled Bulk Restock Modal
    document.getElementById('restock-all-btn').addEventListener('click', () => {
      if (STATE.inventory.length === 0) {
        showToast('Tidak ada item stok untuk direstock pada cabang ini.');
        return;
      }
      const modal = document.getElementById('bulk-restock-modal');
      modal.classList.add('is-open');
      focusModal(modal);
    });

    document.getElementById('close-bulk-restock-btn').addEventListener('click', () => {
      document.getElementById('bulk-restock-modal').classList.remove('is-open');
    });
    document.getElementById('cancel-bulk-restock-btn').addEventListener('click', () => {
      document.getElementById('bulk-restock-modal').classList.remove('is-open');
    });

    document.getElementById('bulk-restock-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const target = document.getElementById('bulk-restock-target').value;
      const jumlah = Number(document.getElementById('bulk-restock-qty').value);
      const tanggal_kadaluarsa = document.getElementById('bulk-restock-exp').value.trim();
      const keterangan = document.getElementById('bulk-restock-note').value.trim();

      try {
        const res = await fetch('/api/stock/restock-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id_cabang: STATE.branch,
            jumlah,
            only_low_stock: target === 'low',
            tanggal_kadaluarsa: tanggal_kadaluarsa || undefined,
            keterangan
          })
        });
        if (redirectIfUnauthorized(res)) return;
        const data = await res.json();
        if (!res.ok || !data.success) {
          showToast(data.message || 'Gagal melakukan restock massal.');
          return;
        }
        document.getElementById('bulk-restock-modal').classList.remove('is-open');
        await syncWithBackend();
        showToast(data.message);
      } catch (err) {
        showToast('Gagal melakukan restock massal: ' + err.message);
      }
    });

    // Member Search & Add
    document.getElementById('member-search-input').addEventListener('input', (e) => {
      renderMembersView(e.target.value);
    });
    document.getElementById('add-member-btn').addEventListener('click', () => {
      showToast('Registrasi member belum diaktifkan: aturan tier/poin perlu disetujui terlebih dahulu.');
    });

    // Receipt Modal Close & Print
    document.getElementById('close-receipt-btn').addEventListener('click', () => {
      document.getElementById('receipt-modal').classList.remove('is-open');
    });
    document.getElementById('close-receipt-btn-2').addEventListener('click', () => {
      document.getElementById('receipt-modal').classList.remove('is-open');
    });
    document.getElementById('print-receipt-btn').addEventListener('click', () => {
      window.print();
    });

    // CSV Export
    const triggerCsvExport = () => {
      window.location.href = '/api/reports/sales?cabang=' + STATE.branch + '&format=csv';
      showToast('Mengunduh file laporan CSV...');
    };
    document.getElementById('export-csv-btn').addEventListener('click', triggerCsvExport);
    document.getElementById('reports-export-csv-btn').addEventListener('click', triggerCsvExport);

    // Settings Form & Logout
    document.getElementById('settings-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      const payload = {
        cafe_name: document.getElementById('set-cafe-name').value.trim(),
        cafe_address: document.getElementById('set-branch-addr').value.trim(),
        cafe_phone: document.getElementById('set-branch-phone').value.trim(),
        tax_rate: Number(document.getElementById('set-tax-rate').value),
        receipt_footer: document.getElementById('set-receipt-footer').value.trim()
      };

      if (!Number.isFinite(payload.tax_rate) || payload.tax_rate < 0 || payload.tax_rate > 25) {
        showToast('Tarif pajak harus antara 0 dan 25.');
        return;
      }

      try {
        const res = await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (redirectIfUnauthorized(res)) return;
        const data = await res.json();
        if (!res.ok || !data.success) {
          showToast(data.message || 'Gagal menyimpan pengaturan.');
          return;
        }
        STATE.taxRate = Number(data.data.tax_rate);
        renderCart();
        showToast('Konfigurasi berhasil disimpan.');
      } catch (err) {
        showToast('Gagal menyimpan pengaturan: ' + err.message);
      }
    });
    const performLogout = async (e) => {
      if (e) e.preventDefault();
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch (err) {}
      localStorage.removeItem('nomcherry_session');
      window.location.href = 'login.html';
    };
    document.getElementById('settings-logout-btn').addEventListener('click', performLogout);
    const popoverLogoutBtn = document.getElementById('logout-btn');
    if (popoverLogoutBtn) {
      popoverLogoutBtn.addEventListener('click', performLogout);
    }
  }

  async function ensureSession() {
    try {
      const res = await fetch('/api/auth/session');
      if (!res.ok) {
        window.location.href = 'login.html';
        return false;
      }
      const payload = await res.json();
      if (!payload.success || !payload.data) {
        window.location.href = 'login.html';
        return false;
      }
      STATE.user = payload.data;
      STATE.branch = payload.data.id_cabang || STATE.branch;
      localStorage.setItem('nomcherry_session', JSON.stringify(payload.data));
      return true;
    } catch (e) {
      window.location.href = 'login.html';
      return false;
    }
  }

  // Initialize App
  const savedTheme = localStorage.getItem('nomcherry_theme');
  if (savedTheme === 'dark' || savedTheme === 'light') {
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  (async function boot() {
    if (!(await ensureSession())) return;
    initSessionAndHeader();
    bindEvents();
    await loadSettings();
    renderAll();
    await syncWithBackend();
  })();
})();
