(function () {
  'use strict';

  document.addEventListener('error', (event) => {
    const image = event.target;
    if (image && image.tagName === 'IMG' && image.dataset && image.dataset.imgFallback) {
      if (image.src !== image.dataset.imgFallback) {
        image.src = image.dataset.imgFallback;
      }
    }
  }, true);

  /* ============================================================
     0. CENTRALIZED STATE & CONSTANTS
     ============================================================ */
  const DEFAULT_BRANCHES = [
    {
      id_cabang: 'CBG001',
      nama_cabang: 'NomCherry Pusat',
      alamat: 'Jl. Tunjungan No. 88, Genteng, Surabaya Pusat',
      no_telp: '(031) 534-8810'
    },
    {
      id_cabang: 'CBG002',
      nama_cabang: 'NomCherry Cabang Timur',
      alamat: 'Jl. Raya Darmo Permai III No. 12, Mulyorejo, Surabaya Timur',
      no_telp: '(031) 592-4421'
    }
  ];

  const STATE = {
    user: {
      id_pengguna: '',
      nama_pengguna: 'Pengguna',
      username: '',
      peran: 'kasir',
      id_cabang: 'CBG001'
    },
    assignedBranch: 'CBG001',
    activeBranch: 'CBG001',
    branches: DEFAULT_BRANCHES.slice(),
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
    printerSize: localStorage.getItem('nomcherry_printer_size') === '58mm' ? '58mm' : '80mm',
    cart: [],
    checkoutSubmitting: false,
    pendingCheckout: null,
    catalogCategory: 'all',
    catalogSearch: '',
    ordersFilterStatus: 'all',
    ordersFilterPay: 'all',
    ordersDate: '',
    ordersSearch: '',
    ordersPageLimit: 25,
    ordersOffset: 0,
    ordersPagination: {
      total: 0,
      limit: 25,
      offset: 0,
      page: 1,
      total_pages: 1,
      has_prev: false,
      has_next: false
    },
    ordersSummary: {
      total_orders: 0,
      pending_kitchen: 0,
      served_kitchen: 0,
      gross_total: 0,
      nett_total: 0,
      tax_total: 0,
      discount_total: 0
    },
    invFilterStatus: 'all',
    invFilterCat: 'all',
    invSearch: '',
    invLogType: 'all',
    invLogSearch: '',
    cardStackIdx: 0,
    overviewRange: 'today',
    dashboard: null,
    analytics: null,
    reportsDateStart: '',
    reportsDateEnd: '',
    orders: [],
    kitchenQueue: [],
    orderMap: new Map(),
    inventory: [],
    inventoryLogs: [],
    settingsPermissions: {
      can_edit_business: false,
      can_edit_branch: false
    },
    isSyncing: false,
    lastSyncedAt: null,
    isOnline: navigator.onLine !== false
  };

  let syncSeq = 0;
  let activeAbortController = null;
  let pollTimerId = null;
  let ordersSearchDebounce = null;
  let sessionExpiredRedirecting = false;

  const ROLE_VIEWS = {
    admin: ['overview', 'pos', 'orders', 'catalog', 'inventory', 'reports', 'members', 'settings'],
    manager: ['overview', 'orders', 'catalog', 'inventory', 'reports', 'members', 'settings'],
    owner: ['overview', 'orders', 'reports', 'members', 'settings'],
    kasir: ['overview', 'pos', 'orders', 'members', 'settings']
  };

  const RANGE_LABELS = {
    today: 'Hari Ini',
    '7d': '7 Hari Terakhir',
    '30d': '30 Hari Terakhir'
  };

  function canView(viewName) {
    const allowed = ROLE_VIEWS[STATE.user.peran] || ROLE_VIEWS.kasir;
    return allowed.includes(viewName);
  }

  const formatRp = (num) => 'Rp ' + Math.round(Number(num) || 0).toLocaleString('id-ID');

  function formatCompactRp(num) {
    const val = Math.round(Number(num) || 0);
    if (val >= 1000000000) {
      return 'Rp ' + (val / 1000000000).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' M';
    }
    if (val >= 1000000) {
      return 'Rp ' + (val / 1000000).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' Jt';
    }
    if (val >= 1000) {
      return 'Rp ' + Math.round(val / 1000).toLocaleString('id-ID') + ' rb';
    }
    return formatRp(val);
  }

  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getBranchMeta(branchId) {
    return STATE.branches.find(b => b.id_cabang === branchId)
      || DEFAULT_BRANCHES.find(b => b.id_cabang === branchId)
      || { id_cabang: branchId, nama_cabang: branchId, alamat: '-', no_telp: '-' };
  }

  function getActiveBranchMeta() {
    return getBranchMeta(STATE.activeBranch);
  }

  function generateIdempotencyKey() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return 'nc-' + window.crypto.randomUUID();
    }
    return 'nc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }

  /* ============================================================
     1. SEMANTIC TOASTS & INLINE BANNERS
     ============================================================ */
  const TOAST_ICONS = {
    success: '<svg class="toast__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="m8.5 12.5 2.3 2.3 4.7-5.1"></path></svg>',
    error: '<svg class="toast__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><line x1="12" y1="8" x2="12" y2="12.5"></line><circle cx="12" cy="16" r="0.6" fill="currentColor"></circle></svg>',
    warning: '<svg class="toast__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18.2a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><circle cx="12" cy="17" r="0.6" fill="currentColor"></circle></svg>',
    info: '<svg class="toast__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><line x1="12" y1="11" x2="12" y2="16"></line><circle cx="12" cy="8" r="0.6" fill="currentColor"></circle></svg>'
  };

  function showToast(msg, type = 'info') {
    const stack = document.getElementById('toast-stack');
    if (!stack || !msg) return;
    const validType = TOAST_ICONS[type] ? type : 'info';
    const isUrgent = validType === 'error' || validType === 'warning';

    const t = document.createElement('div');
    t.className = `toast toast--${validType}`;
    t.setAttribute('role', isUrgent ? 'alert' : 'status');

    const iconWrap = document.createElement('span');
    iconWrap.innerHTML = TOAST_ICONS[validType];
    const iconSvg = iconWrap.firstElementChild;
    if (iconSvg) t.appendChild(iconSvg);

    const text = document.createElement('span');
    text.className = 'toast__text';
    text.textContent = String(msg);
    t.appendChild(text);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'toast__close';
    closeBtn.setAttribute('aria-label', 'Tutup notifikasi');
    closeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"></path></svg>';
    t.appendChild(closeBtn);

    const removeToast = () => {
      if (t.parentNode) t.remove();
    };
    closeBtn.addEventListener('click', removeToast);

    stack.appendChild(t);
    const duration = isUrgent ? 5400 : 3400;
    setTimeout(removeToast, duration);
  }

  function setInlineAlert(elementId, message, variant = 'error') {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (!message) {
      el.style.display = 'none';
      el.textContent = '';
      return;
    }
    el.className = `inline-alert inline-alert--${variant}`;
    if (el.classList.contains('field')) {
      el.classList.add('field', 'field--full');
    }
    el.textContent = String(message);
    el.style.display = '';
  }

  /* ============================================================
     2. ACCESSIBLE OVERLAY, MODAL & DRAWER FOCUS MANAGER
     ============================================================ */
  const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(', ');

  const overlayStack = [];

  function isElementVisible(el) {
    if (!el || el.hidden) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return el.getClientRects().length > 0;
  }

  function getFocusableElements(root) {
    if (!root) return [];
    return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isElementVisible);
  }

  function syncInertBackground() {
    const appShell = document.getElementById('app-shell');
    const sidebar = document.getElementById('main-sidebar');
    const workspace = document.getElementById('main-workspace');
    const tabbar = document.getElementById('mobile-tabbar');
    const topBar = workspace ? workspace.querySelector('.top') : null;
    const posMain = document.querySelector('#view-pos .pos-main');
    const mobileCartBar = document.getElementById('mobile-cart-bar');

    const allTargets = [appShell, sidebar, workspace, tabbar, topBar, posMain, mobileCartBar].filter(Boolean);
    allTargets.forEach(el => {
      el.inert = false;
      el.removeAttribute('aria-hidden');
    });

    if (overlayStack.length === 0) return;

    const topOverlay = overlayStack[overlayStack.length - 1];
    if (topOverlay.kind === 'modal') {
      if (appShell) {
        appShell.inert = true;
        appShell.setAttribute('aria-hidden', 'true');
      }
    } else if (topOverlay.kind === 'mobile-nav') {
      [workspace, tabbar].filter(Boolean).forEach(el => {
        el.inert = true;
        el.setAttribute('aria-hidden', 'true');
      });
    } else if (topOverlay.kind === 'mobile-cart') {
      [sidebar, tabbar, topBar, posMain, mobileCartBar].filter(Boolean).forEach(el => {
        el.inert = true;
        el.setAttribute('aria-hidden', 'true');
      });
    }
  }

  function openOverlay({ id, kind = 'modal', backdropEl = null, boxEl, triggerEl = null, onClose = null }) {
    if (!boxEl) return;
    const existingIdx = overlayStack.findIndex(o => o.id === id);
    const resolvedTrigger = triggerEl || document.activeElement;
    if (existingIdx !== -1) {
      overlayStack.splice(existingIdx, 1);
    }

    if (backdropEl) {
      backdropEl.classList.add('is-open');
    }

    overlayStack.push({
      id,
      kind,
      backdropEl,
      boxEl,
      triggerEl: resolvedTrigger,
      onClose
    });

    syncInertBackground();

    requestAnimationFrame(() => {
      const focusables = getFocusableElements(boxEl);
      const preferred = boxEl.querySelector('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])');
      if (preferred && isElementVisible(preferred)) {
        preferred.focus({ preventScroll: kind === 'mobile-cart' });
      } else if (focusables.length > 0) {
        focusables[0].focus({ preventScroll: kind === 'mobile-cart' });
      } else {
        if (!boxEl.hasAttribute('tabindex')) boxEl.setAttribute('tabindex', '-1');
        boxEl.focus({ preventScroll: kind === 'mobile-cart' });
      }
      if (kind === 'mobile-cart') {
        boxEl.scrollTop = 0;
      }
    });
  }

  function closeOverlayById(id, { restoreFocus = true } = {}) {
    const idx = overlayStack.findIndex(o => o.id === id);
    if (idx === -1) {
      const modalEl = document.getElementById(id);
      if (modalEl && modalEl.classList.contains('is-open')) {
        modalEl.classList.remove('is-open');
      }
      syncInertBackground();
      return;
    }

    const [entry] = overlayStack.splice(idx, 1);
    if (entry.backdropEl) {
      entry.backdropEl.classList.remove('is-open');
    }
    if (typeof entry.onClose === 'function') {
      entry.onClose();
    }

    syncInertBackground();

    if (restoreFocus && entry.triggerEl && typeof entry.triggerEl.focus === 'function') {
      try {
        entry.triggerEl.focus();
      } catch (e) {
        // Ignore if detached
      }
    }
  }

  function closeTopOverlay() {
    if (overlayStack.length === 0) return false;
    const top = overlayStack[overlayStack.length - 1];
    closeOverlayById(top.id, { restoreFocus: true });
    return true;
  }

  function openModal(modalId, triggerEl = null) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    const box = modal.querySelector('.modal-box') || modal;
    openOverlay({
      id: modalId,
      kind: 'modal',
      backdropEl: modal,
      boxEl: box,
      triggerEl
    });
  }

  function closeModal(modalId) {
    closeOverlayById(modalId, { restoreFocus: true });
  }

  function openMobileNavDrawer(triggerEl = null) {
    const appShell = document.getElementById('app-shell');
    const sidebar = document.getElementById('main-sidebar');
    const toggleBtn = document.getElementById('mobile-menu-btn');
    if (!appShell || !sidebar) return;
    appShell.classList.add('is-mobile-open');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
    openOverlay({
      id: 'mobile-nav-drawer',
      kind: 'mobile-nav',
      boxEl: sidebar,
      triggerEl: triggerEl || toggleBtn,
      onClose: () => {
        appShell.classList.remove('is-mobile-open');
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function closeMobileNavDrawer({ restoreFocus = true } = {}) {
    const appShell = document.getElementById('app-shell');
    const toggleBtn = document.getElementById('mobile-menu-btn');
    if (appShell) appShell.classList.remove('is-mobile-open');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
    closeOverlayById('mobile-nav-drawer', { restoreFocus });
  }

  function openMobileCartSheet(triggerEl = null) {
    const appShell = document.getElementById('app-shell');
    const cartAside = document.getElementById('pos-cart-aside');
    const openBtn = document.getElementById('open-mobile-cart-btn');
    if (!appShell || !cartAside) return;
    appShell.classList.add('is-cart-sheet-open');
    if (openBtn) openBtn.setAttribute('aria-expanded', 'true');
    openOverlay({
      id: 'mobile-cart-sheet',
      kind: 'mobile-cart',
      boxEl: cartAside,
      triggerEl: triggerEl || openBtn,
      onClose: () => {
        appShell.classList.remove('is-cart-sheet-open');
        if (openBtn) openBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function closeMobileCartSheet({ restoreFocus = true } = {}) {
    const appShell = document.getElementById('app-shell');
    const openBtn = document.getElementById('open-mobile-cart-btn');
    if (appShell) appShell.classList.remove('is-cart-sheet-open');
    if (openBtn) openBtn.setAttribute('aria-expanded', 'false');
    closeOverlayById('mobile-cart-sheet', { restoreFocus });
  }

  function openConfirmDialog({ title = 'Konfirmasi Tindakan', message = '', confirmLabel = 'Lanjutkan', cancelLabel = 'Batal', triggerEl = null }) {
    return new Promise((resolve) => {
      const modal = document.getElementById('confirm-modal');
      const titleEl = document.getElementById('confirm-modal-title');
      const msgEl = document.getElementById('confirm-modal-message');
      const acceptBtn = document.getElementById('confirm-accept-btn');
      const cancelBtn = document.getElementById('confirm-cancel-btn');
      const closeBtn = document.getElementById('close-confirm-modal-btn');

      if (!modal || !acceptBtn || !cancelBtn) {
        resolve(true);
        return;
      }

      if (titleEl) titleEl.textContent = title;
      if (msgEl) msgEl.textContent = message;
      acceptBtn.textContent = confirmLabel;
      cancelBtn.textContent = cancelLabel;

      let settled = false;
      const finish = (choice) => {
        if (settled) return;
        settled = true;
        acceptBtn.removeEventListener('click', onAccept);
        cancelBtn.removeEventListener('click', onCancel);
        if (closeBtn) closeBtn.removeEventListener('click', onCancel);
        closeOverlayById('confirm-modal', { restoreFocus: true });
        resolve(choice);
      };

      const onAccept = () => finish(true);
      const onCancel = () => finish(false);

      acceptBtn.addEventListener('click', onAccept);
      cancelBtn.addEventListener('click', onCancel);
      if (closeBtn) closeBtn.addEventListener('click', onCancel);

      openOverlay({
        id: 'confirm-modal',
        kind: 'modal',
        backdropEl: modal,
        boxEl: modal.querySelector('.modal-box') || modal,
        triggerEl,
        onClose: () => {
          if (!settled) {
            settled = true;
            acceptBtn.removeEventListener('click', onAccept);
            cancelBtn.removeEventListener('click', onCancel);
            if (closeBtn) closeBtn.removeEventListener('click', onCancel);
            resolve(false);
          }
        }
      });
    });
  }

  /* ============================================================
     3. SESSION HYDRATION, ACTIVE BRANCH & HEADER RENDERING
     ============================================================ */
  function hydrateSessionOnce(sessionUser) {
    STATE.user = {
      id_pengguna: sessionUser.id_pengguna || '',
      nama_pengguna: sessionUser.nama_pengguna || 'Pengguna',
      username: sessionUser.username || '',
      peran: sessionUser.peran || 'kasir',
      id_cabang: sessionUser.id_cabang || 'CBG001',
      nama_cabang: sessionUser.nama_cabang || ''
    };
    STATE.assignedBranch = STATE.user.id_cabang || 'CBG001';

    if (STATE.user.peran === 'kasir') {
      STATE.activeBranch = STATE.assignedBranch;
    } else {
      const storedBranch = sessionStorage.getItem('nomcherry_active_branch');
      const validIds = new Set(STATE.branches.map(b => b.id_cabang));
      STATE.activeBranch = (storedBranch && validIds.has(storedBranch))
        ? storedBranch
        : STATE.assignedBranch;
    }

    sessionStorage.setItem('nomcherry_active_branch', STATE.activeBranch);
  }

  function populateBranchSelector() {
    const branchSelect = document.getElementById('branch-selector');
    if (!branchSelect) return;

    const validIds = new Set(STATE.branches.map(b => b.id_cabang));
    if (!validIds.has(STATE.activeBranch)) {
      STATE.activeBranch = STATE.assignedBranch;
      sessionStorage.setItem('nomcherry_active_branch', STATE.activeBranch);
    }

    branchSelect.innerHTML = STATE.branches.map(b => (
      `<option value="${esc(b.id_cabang)}">${esc(b.nama_cabang)} (${esc(b.id_cabang)})</option>`
    )).join('');
    branchSelect.value = STATE.activeBranch;
    branchSelect.disabled = STATE.user.peran === 'kasir';
  }

  function renderHeaderAndSessionUi() {
    const initials = (STATE.user.nama_pengguna || 'NC')
      .split(' ')
      .filter(Boolean)
      .map(w => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'NC';
    const roleName = (STATE.user.peran || 'kasir').toUpperCase();
    const activeMeta = getActiveBranchMeta();
    const assignedMeta = getBranchMeta(STATE.assignedBranch);

    const branchSelect = document.getElementById('branch-selector');
    if (branchSelect) {
      if (branchSelect.value !== STATE.activeBranch) {
        branchSelect.value = STATE.activeBranch;
      }
      branchSelect.disabled = STATE.user.peran === 'kasir';
    }

    document.querySelectorAll('[data-view]').forEach(el => {
      const view = el.dataset.view;
      if (view) {
        el.style.display = canView(view) ? '' : 'none';
      }
    });

    document.querySelectorAll('[data-goto-view]').forEach(el => {
      const targetView = el.dataset.gotoView;
      if (targetView) {
        el.style.display = canView(targetView) ? '' : 'none';
      }
    });

    const topPosBtn = document.getElementById('top-quick-pos-btn');
    if (topPosBtn) {
      topPosBtn.style.display = canView('pos') ? '' : 'none';
    }

    const canExportReports = ['admin', 'manager', 'owner'].includes(STATE.user.peran);
    ['export-csv-btn', 'reports-export-csv-btn'].forEach(id => {
      const button = document.getElementById(id);
      if (button) button.style.display = canExportReports ? '' : 'none';
    });

    const setEl = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    const roleBranchSummary = `${roleName} · ${activeMeta.nama_cabang}`;
    setEl('user-avatar', initials);
    setEl('user-name-label', STATE.user.nama_pengguna);
    setEl('user-role-label', roleBranchSummary);
    setEl('pop-user-av', initials);
    setEl('pop-user-name', STATE.user.nama_pengguna);
    setEl('pop-user-role', `${roleName} · Tugas: ${assignedMeta.id_cabang}`);
    setEl('st-avatar', initials);
    setEl('st-name', STATE.user.nama_pengguna);
    setEl('st-role', `${roleName} · Tugas: ${assignedMeta.nama_cabang}`);
    setEl('st-stat-branch', STATE.activeBranch);
    setEl('st-stat-printer', STATE.printerSize);
    setEl('st-stat-tax', `${STATE.taxRate}%`);
    setEl('cart-order-code', `${activeMeta.nama_cabang} (${STATE.activeBranch})`);
    setEl('pos-branch-sub', `Katalog & stok mengikuti ${activeMeta.nama_cabang} (${STATE.activeBranch})`);
    setEl('menu-modal-sub', `Stok awal dialokasikan khusus ke ${activeMeta.nama_cabang} (${STATE.activeBranch}); cabang lain 0 porsi`);

    const now = new Date();
    const hr = now.getHours();
    const greet = hr < 11 ? 'Selamat Pagi' : hr < 15 ? 'Selamat Siang' : hr < 18 ? 'Selamat Sore' : 'Selamat Malam';
    const firstName = STATE.user.nama_pengguna.split(' ')[0] || STATE.user.nama_pengguna;
    setEl('ov-greeting-title', `${greet}, ${firstName}`);
    setEl(
      'ov-date-eyebrow',
      now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) +
      ` · Cabang Aktif: ${activeMeta.nama_cabang} (${STATE.activeBranch})`
    );
  }

  function updateSyncStatusIndicator(mode = 'ready', detail = '') {
    const dot = document.getElementById('sync-status-dot');
    const chip = document.getElementById('live-clock-chip');
    if (!dot || !chip) return;

    dot.classList.remove('dot--warn', 'dot--bad');

    const lastStr = STATE.lastSyncedAt
      ? STATE.lastSyncedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : null;

    if (!STATE.isOnline || mode === 'offline') {
      dot.classList.add('dot--bad');
      chip.textContent = lastStr ? `Terputus · Data ${lastStr}` : 'Terputus · Offline';
      return;
    }

    if (mode === 'error') {
      dot.classList.add('dot--warn');
      chip.textContent = detail || (lastStr ? `Gangguan sinkron · ${lastStr}` : 'Gangguan koneksi server');
      return;
    }

    if (mode === 'syncing' && !lastStr) {
      dot.classList.add('dot--warn');
      chip.textContent = 'Menyinkronkan...';
      return;
    }

    chip.textContent = lastStr ? `Terhubung · Sinkron ${lastStr}` : 'Terhubung ke server';
  }

  function switchView(viewName) {
    if (!canView(viewName)) {
      showToast('Peran Anda tidak memiliki akses ke halaman tersebut.', 'warning');
      return;
    }
    const titles = {
      overview: 'Ringkasan Kafe',
      pos: 'Kasir POS',
      orders: 'Pesanan & Dapur',
      catalog: 'Katalog Menu',
      inventory: 'Inventori Stok',
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

    const crumb = document.getElementById('top-crumb-current');
    if (crumb) crumb.textContent = titles[viewName];

    closeMobileNavDrawer({ restoreFocus: false });
    if (viewName !== 'pos') {
      closeMobileCartSheet({ restoreFocus: false });
    }
    document.getElementById('user-popover')?.classList.remove('is-open');
    document.getElementById('notif-popover')?.classList.remove('is-open');
    document.getElementById('sidebar-user-btn')?.setAttribute('aria-expanded', 'false');
    document.getElementById('notif-btn')?.setAttribute('aria-expanded', 'false');
  }

  /* ============================================================
     4. OVERVIEW DASHBOARD RENDERING (REAL DATA ONLY)
     ============================================================ */
  function computeNiceAxisMax(maxVal) {
    if (maxVal <= 0) return 0;
    const magnitude = Math.pow(10, Math.floor(Math.log10(maxVal)));
    const normalized = maxVal / magnitude;
    let step = 10;
    if (normalized <= 1.2) step = 1.2;
    else if (normalized <= 1.5) step = 1.5;
    else if (normalized <= 2) step = 2;
    else if (normalized <= 3) step = 3;
    else if (normalized <= 4) step = 4;
    else if (normalized <= 5) step = 5;
    else if (normalized <= 6) step = 6;
    else if (normalized <= 8) step = 8;
    return Math.ceil(step * magnitude);
  }

  function buildAreaSvgGeometry(series, orderCount) {
    const width = 640;
    const yTop = 18;
    const yBottom = 166;
    const svgBottom = 170;
    const plotHeight = yBottom - yTop;

    const values = (series || []).map(pt => Math.max(0, Number(pt.gross_total || 0)));
    const maxVal = values.length > 0 ? Math.max(...values) : 0;

    if (!series || series.length === 0 || orderCount === 0 || maxVal <= 0) {
      return {
        isEmpty: true,
        gridLabels: ['Rp 0', 'Rp 0', 'Rp 0'],
        linePath: `M0,${yBottom} L${width},${yBottom}`,
        fillPath: `M0,${yBottom} L${width},${yBottom} L${width},${svgBottom} L0,${svgBottom} Z`,
        dotCx: width,
        dotCy: yBottom
      };
    }

    const niceMax = computeNiceAxisMax(maxVal);
    const coords = values.map((v, idx) => {
      const x = values.length === 1 ? width / 2 : Math.round((idx / (values.length - 1)) * width);
      const ratio = Math.min(1, Math.max(0, v / niceMax));
      const y = Math.round((yBottom - ratio * plotHeight) * 10) / 10;
      return { x, y };
    });

    let linePath = '';
    if (coords.length === 1) {
      linePath = `M0,${coords[0].y} L${width},${coords[0].y}`;
    } else {
      linePath = `M${coords[0].x},${coords[0].y}`;
      for (let i = 0; i < coords.length - 1; i++) {
        const p0 = coords[i];
        const p1 = coords[i + 1];
        const cpX = Math.round(((p0.x + p1.x) / 2) * 10) / 10;
        linePath += ` C${cpX},${p0.y} ${cpX},${p1.y} ${p1.x},${p1.y}`;
      }
    }

    const lastPt = coords[coords.length - 1];
    const fillPath = `${linePath} L${lastPt.x},${svgBottom} L${coords[0].x},${svgBottom} Z`;

    return {
      isEmpty: false,
      gridLabels: [
        formatCompactRp(niceMax),
        formatCompactRp(Math.round(niceMax / 2)),
        'Rp 0'
      ],
      linePath,
      fillPath,
      dotCx: lastPt.x,
      dotCy: lastPt.y
    };
  }

  function sampleXAxisLabels(series, rangeKey) {
    if (!Array.isArray(series) || series.length === 0) return [];
    if (rangeKey !== '30d' || series.length <= 8) {
      return series.map(s => s.label);
    }
    const indices = [0, 5, 11, 17, 23, series.length - 1];
    return Array.from(new Set(indices))
      .filter(i => i >= 0 && i < series.length)
      .map(i => series[i].label);
  }

  function updateCardStack(activeIndex) {
    STATE.cardStackIdx = ((activeIndex % 3) + 3) % 3;
    const cards = document.querySelectorAll('#cstack-pile .paydeck');
    cards.forEach((card, idx) => {
      const pos = (idx - STATE.cardStackIdx + 3) % 3;
      card.setAttribute('data-pos', String(pos));
    });
    document.querySelectorAll('#cstack-dots button').forEach((dot, idx) => {
      if (idx === STATE.cardStackIdx) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });

    const dash = STATE.dashboard;
    const pb = dash && dash.payment_breakdown ? dash.payment_breakdown : null;
    const periodLabel = RANGE_LABELS[STATE.overviewRange] || 'Hari Ini';

    const cardCounts = pb
      ? [
          pb.QRIS ? pb.QRIS.count : 0,
          pb.Cash ? pb.Cash.count : 0,
          (pb.Debit ? pb.Debit.count : 0) + (pb.Transfer ? pb.Transfer.count : 0)
        ]
      : [0, 0, 0];

    const modeLabels = [
      'QRIS · Konfirmasi Kasir',
      'Tunai · Kasir Fisik',
      'Kartu EDC · Input Ref'
    ];

    const statusEl = document.getElementById('cstack-meta-status');
    const mdrEl = document.getElementById('cstack-meta-mdr');
    const settleEl = document.getElementById('cstack-meta-settle');
    if (statusEl) statusEl.textContent = modeLabels[STATE.cardStackIdx];
    if (mdrEl) mdrEl.textContent = `${cardCounts[STATE.cardStackIdx].toLocaleString('id-ID')} Struk`;
    if (settleEl) settleEl.textContent = periodLabel;
  }

  function renderOverviewWidgets() {
    const dash = STATE.dashboard;
    const periodLabel = RANGE_LABELS[STATE.overviewRange] || 'Hari Ini';
    const activeMeta = getActiveBranchMeta();

    const setElText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    const totals = (dash && dash.totals) || {
      order_count: 0,
      subtotal_sum: 0,
      discount_sum: 0,
      nett_sales: 0,
      tax_sum: 0,
      gross_total: 0,
      avg_order_value: 0,
      items_sold: 0,
      avg_items_per_order: 0
    };
    const comparison = (dash && dash.comparison) || { delta_pct: null, delta_amount: 0, prev_gross_total: 0 };
    const series = (dash && Array.isArray(dash.series)) ? dash.series : [];
    const catBreakdown = (dash && Array.isArray(dash.category_breakdown)) ? dash.category_breakdown : [];
    const orderTypes = (dash && dash.order_type_breakdown) || {
      'Dine-In': { count: 0 },
      Takeaway: { count: 0 },
      Delivery: { count: 0 }
    };
    const pb = (dash && dash.payment_breakdown) || {
      QRIS: { count: 0, total: 0, pct: 0 },
      Cash: { count: 0, total: 0, pct: 0 },
      Debit: { count: 0, total: 0, pct: 0 },
      Transfer: { count: 0, total: 0, pct: 0 },
      cashless_pct: 0
    };

    // Hero Gross & Delta
    setElText('ov-hero-rev', formatRp(totals.gross_total));
    const deltaEl = document.getElementById('ov-hero-delta');
    if (deltaEl) {
      deltaEl.className = 'delta';
      if (!dash) {
        deltaEl.classList.add('delta--flat');
        deltaEl.textContent = 'Memuat';
      } else if (comparison.delta_pct === null) {
        deltaEl.classList.add('delta--flat');
        deltaEl.textContent = totals.order_count === 0 ? '0 Transaksi' : periodLabel;
      } else if (comparison.delta_pct > 0) {
        deltaEl.textContent = `+${comparison.delta_pct}%`;
      } else if (comparison.delta_pct < 0) {
        deltaEl.classList.add('delta--down');
        deltaEl.textContent = `${comparison.delta_pct}%`;
      } else {
        deltaEl.classList.add('delta--flat');
        deltaEl.textContent = '0% Stabil';
      }
    }

    const periodInfo = dash && dash.period;
    const rangeDatesText = periodInfo
      ? (periodInfo.date_start === periodInfo.date_end
          ? periodInfo.date_start
          : `${periodInfo.date_start} s/d ${periodInfo.date_end}`)
      : periodLabel;
    setElText(
      'ov-hero-subtext',
      `${totals.order_count.toLocaleString('id-ID')} struk selesai pada ${periodLabel} (${rangeDatesText})`
    );

    // SVG Area Chart
    const geom = buildAreaSvgGeometry(series, totals.order_count);
    const lineEl = document.getElementById('ov-area-line');
    const fillEl = document.getElementById('ov-area-fill');
    const dotEl = document.getElementById('ov-area-dot');
    const gridEl = document.getElementById('ov-area-grid');
    const xEl = document.getElementById('ov-area-x');
    const emptyEl = document.getElementById('ov-chart-empty');

    if (lineEl) lineEl.setAttribute('d', geom.linePath);
    if (fillEl) fillEl.setAttribute('d', geom.fillPath);
    if (dotEl) {
      dotEl.setAttribute('cx', String(geom.dotCx));
      dotEl.setAttribute('cy', String(geom.dotCy));
      dotEl.style.display = geom.isEmpty ? 'none' : '';
    }
    if (gridEl) {
      gridEl.innerHTML = geom.gridLabels.map(lbl => `<span>${esc(lbl)}</span>`).join('');
    }
    if (xEl) {
      const xLabels = sampleXAxisLabels(series, STATE.overviewRange);
      xEl.innerHTML = xLabels.map(lbl => `<span>${esc(lbl)}</span>`).join('');
    }
    if (emptyEl) {
      if (!dash) {
        emptyEl.hidden = false;
        emptyEl.textContent = 'Memuat data grafik penjualan...';
      } else if (geom.isEmpty) {
        emptyEl.hidden = false;
        emptyEl.textContent = `Belum ada penjualan tercatat pada ${periodLabel.toLowerCase()} di ${activeMeta.nama_cabang}.`;
      } else {
        emptyEl.hidden = true;
      }
    }

    // Category Split Bar & Legend
    const splitBar = document.getElementById('ov-split-bar');
    const splitLeg = document.getElementById('ov-split-leg');
    const catColors = ['var(--accent)', 'var(--tangerine)', 'var(--good)', 'var(--c-work)', 'var(--muted)'];
    if (splitBar && splitLeg) {
      if (catBreakdown.length === 0) {
        splitBar.innerHTML = '';
        splitLeg.innerHTML = '<span>Belum ada komposisi kategori pada periode ini.</span>';
      } else {
        splitBar.innerHTML = catBreakdown.map((c, idx) => (
          `<i style="width:${Math.max(2, Number(c.percentage || 0))}%;background:${catColors[idx % catColors.length]}"></i>`
        )).join('');
        splitLeg.innerHTML = catBreakdown.map((c, idx) => (
          `<span><i class="sw" style="background:${catColors[idx % catColors.length]}"></i>${esc(c.kategori)} <b>${esc(c.percentage)}%</b> (${esc(formatCompactRp(c.total))})</span>`
        )).join('');
      }
    }

    // 3 Account KPIs (#ov-kpi-orders, #ov-kpi-aov, #ov-kpi-items)
    setElText('ov-kpi-orders-badge', periodLabel);
    setElText('ov-kpi-orders', `${totals.order_count.toLocaleString('id-ID')} Struk`);
    setElText(
      'ov-kpi-orders-meta',
      totals.order_count > 0
        ? `Dine-In ${orderTypes['Dine-In'].count} · Takeaway ${orderTypes.Takeaway.count} · Delivery ${orderTypes.Delivery.count}`
        : 'Belum ada pesanan pada periode ini'
    );
    setElText('ov-kpi-aov', formatRp(totals.avg_order_value));
    setElText('ov-kpi-aov-meta', `${totals.avg_items_per_order} item rata-rata per struk`);
    setElText('ov-kpi-items', `${totals.items_sold.toLocaleString('id-ID')} Item`);
    setElText(
      'ov-kpi-best-menu',
      dash && dash.best_item
        ? `Terlaris: ${dash.best_item.nama_menu} (${dash.best_item.total_qty}x)`
        : 'Belum ada menu terjual pada periode ini'
    );

    // Payment Card Stack (exact period & branch)
    const cardSum = Number(pb.Debit?.total || 0) + Number(pb.Transfer?.total || 0);
    setElText('cstack-sub', `${activeMeta.nama_cabang} · ${periodLabel}`);
    setElText('ov-qris-label', `Penerimaan QRIS (${periodLabel})`);
    setElText('ov-qris-val', formatRp(pb.QRIS?.total || 0));
    setElText('ov-qris-pct', `${pb.QRIS?.pct || 0}%`);
    setElText('ov-cash-label', `Penerimaan Tunai (${periodLabel})`);
    setElText('ov-cash-val', formatRp(pb.Cash?.total || 0));
    setElText('ov-cash-pct', `${pb.Cash?.pct || 0}%`);
    setElText('ov-card-label', `Penerimaan Kartu (${periodLabel})`);
    setElText('ov-card-val', formatRp(cardSum));
    setElText('ov-card-pct', `${pb.Debit?.pct || 0}%`);
    setElText('ov-cashless-ratio', `${pb.cashless_pct || 0}% Cashless`);
    const cashlessBar = document.getElementById('ov-cashless-bar');
    if (cashlessBar) cashlessBar.style.width = `${Math.min(100, Math.max(0, Number(pb.cashless_pct || 0)))}%`;
    updateCardStack(STATE.cardStackIdx);

    // Historical Tax & Nett Sales Card (.ov-safe) — strictly from stored order columns
    setElText('ov-safe-sub', `${periodLabel} · Dihitung dari nilai historis tersimpan per struk`);
    const taxEl = document.getElementById('ov-tax-val');
    if (taxEl) {
      taxEl.innerHTML = `${esc(formatRp(totals.tax_sum))} <small>/ pajak struk tersimpan</small>`;
    }
    setElText('ov-gross-val', formatRp(totals.gross_total));
    setElText('ov-nett-val', formatRp(totals.nett_sales));
    setElText('ov-disc-val', formatRp(totals.discount_sum));

    // Operational Notifications Popover
    const notifListEl = document.getElementById('notif-popover-list');
    const notifCountEl = document.getElementById('notif-popover-count');
    const notifDotEl = document.getElementById('notif-dot');
    if (notifListEl) {
      const alertItems = STATE.inventory.filter(
        i => i.status_stok === 'Menipis' || i.status_stok === 'Habis' || i.is_expired || i.is_near_expiry
      );
      if (notifCountEl) {
        notifCountEl.textContent = alertItems.length > 0 ? `${alertItems.length} Peringatan` : 'Aman';
        notifCountEl.className = alertItems.length > 0 ? 'pill pill--warn' : 'pill pill--good';
      }
      if (notifDotEl) notifDotEl.style.display = alertItems.length > 0 ? '' : 'none';

      const stockAlertsHtml = alertItems.slice(0, 5).map(item => {
        const alertColor = (item.status_stok === 'Habis' || item.is_expired) ? 'var(--bad)' : 'var(--warn)';
        const expTag = item.is_expired
          ? ` · Kedaluwarsa (${item.exp})`
          : (item.is_near_expiry ? ` · H-${item.days_until_expiry} Exp (${item.exp})` : '');
        return `
          <div style="padding-bottom:6px;border-bottom:1px solid var(--line);">
            <b style="display:block;color:${alertColor};">${esc(item.nama)} (${esc(item.stok)} porsi · Min ${esc(item.min_stok ?? 5)})</b>
            <span style="color:var(--muted);">Status: ${esc(item.status_stok)}${esc(expTag)} · ${esc(item.cabang)}</span>
          </div>
        `;
      }).join('');

      notifListEl.innerHTML = (stockAlertsHtml || `
        <div style="padding-bottom:6px;border-bottom:1px solid var(--line);">
          <b style="display:block;color:var(--good);">Persediaan Cabang Aman</b>
          <span style="color:var(--muted);">Tidak ada item habis, di bawah batas minimum, atau kedaluwarsa.</span>
        </div>
      `) + `
        <div>
          <b style="display:block;color:var(--ink);">Format Kertas Struk Lokal: ${esc(STATE.printerSize)}</b>
          <span style="color:var(--muted);">Menggunakan dialog cetak browser standar.</span>
        </div>
      `;
    }

    // Priority Stock Jars (5 lowest stock items in active branch)
    const jarsEl = document.getElementById('ov-jars-container');
    if (jarsEl) {
      const sortedStock = STATE.inventory.slice().sort((a, b) => {
        if (a.is_expired !== b.is_expired) return a.is_expired ? -1 : 1;
        return a.stok - b.stok;
      });
      const stockItems = sortedStock.slice(0, 5);
      const maxStock = Math.max(1, ...STATE.inventory.map(item => Number(item.stok || 0)));
      const canManageStock = ['admin', 'manager'].includes(STATE.user.peran);

      if (stockItems.length === 0) {
        jarsEl.innerHTML = '<div style="grid-column:1/-1;padding:16px;color:var(--muted);font-size:var(--fs-xs);">Belum ada item stok aktif untuk cabang ini.</div>';
      } else {
        jarsEl.innerHTML = stockItems.map(item => {
          const pct = Math.max(0, Math.min(100, Math.round((item.stok / maxStock) * 100)));
          const isBad = item.status_stok === 'Habis' || item.is_expired;
          const isWarn = !isBad && (item.status_stok === 'Menipis' || item.is_near_expiry);
          const stateCls = isBad ? 'jar--over' : isWarn ? 'jar--warn' : '';
          const stateTxt = item.is_expired
            ? 'Kedaluwarsa'
            : (item.status_stok === 'Habis' ? 'Habis' : (item.is_near_expiry ? `H-${item.days_until_expiry} Exp` : (item.status_stok || 'Aman')));
          const color = isBad ? 'var(--bad)' : isWarn ? 'var(--tangerine)' : 'var(--good)';
          const actionAttrs = canManageStock
            ? `data-restock-id="${esc(item.id)}" title="Kelola stok ${esc(item.nama)}"`
            : `aria-disabled="true" style="cursor:default;" title="${esc(item.nama)} (${esc(item.stok)} porsi)"`;
          return `
            <button type="button" class="jar ${stateCls}" ${actionAttrs}>
              <div class="jar__glass" style="--fill:${pct}; --jar-c:${color}">
                <span class="jar__lid"></span>
                <div class="jar__liquid"></div>
                <span class="jar__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 8h1a4 4 0 1 1 0 8h-1"></path><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"></path></svg>
                </span>
                <span class="jar__pct">${esc(item.stok)}</span>
              </div>
              <div class="jar__text">
                <b>${esc(item.nama)}</b>
                <small class="num">${esc(item.kategori)}</small>
                <i class="jar__state">${esc(stateTxt)}</i>
              </div>
            </button>
          `;
        }).join('');
      }
    }

    // Recent Transactions List
    const txEl = document.getElementById('ov-recent-tx-list');
    if (txEl) {
      const recentList = STATE.orders.slice(0, 5);
      if (recentList.length === 0) {
        txEl.innerHTML = '<div style="padding:18px 4px;font-size:var(--fs-xs);color:var(--muted);">Belum ada transaksi struk tercatat pada cabang ini.</div>';
      } else {
        txEl.innerHTML = recentList.map(ord => `
          <div class="tx" role="button" tabindex="0" data-open-receipt="${esc(ord.id_pesanan)}" aria-label="Buka struk ${esc(ord.nomor_struk)}">
            <div class="tx__ico">${ord.metode_pembayaran === 'QRIS' ? 'QR' : ord.metode_pembayaran === 'Cash' ? 'Rp' : 'EDC'}</div>
            <div style="min-width:0;">
              <div class="tx__name">${esc(ord.nama_pelanggan)} · ${esc(ord.lokasi_label)}</div>
              <div class="tx__sub"><span>${esc(ord.nomor_struk)}</span><span>·</span><span>${esc(ord.waktu)}</span></div>
            </div>
            <div class="tx__amt tx__amt--in priv">+${formatRp(ord.total)}</div>
          </div>
        `).join('');
      }
    }

    // Active Kitchen Queue (from dedicated server kitchen_queue)
    const activeQueue = STATE.kitchenQueue;
    const pendingTotal = Number(STATE.ordersSummary.pending_kitchen || activeQueue.length);
    setElText('nav-orders-badge', String(pendingTotal));
    setElText('ov-queue-pill', `${pendingTotal} Aktif`);

    const canServeKitchen = ['admin', 'kasir', 'manager'].includes(STATE.user.peran);
    const qEl = document.getElementById('ov-kitchen-queue');
    if (qEl) {
      if (activeQueue.length === 0) {
        qEl.innerHTML = '<div style="padding:18px 4px;font-size:var(--fs-xs);color:var(--muted);">Semua pesanan telah disajikan oleh barista.</div>';
      } else {
        qEl.innerHTML = activeQueue.slice(0, 8).map(ord => {
          const itemSummary = ord.items.map(i => `${i.jumlah}x ${i.nama_menu}`).join(', ');
          if (canServeKitchen) {
            return `
              <div class="up" role="button" tabindex="0" data-complete-order="${esc(ord.id_pesanan)}" title="Klik untuk tandai selesai disajikan">
                <div class="up__date"><small>${esc(ord.metode_pembayaran)}</small><b>${esc(ord.badge_meja)}</b></div>
                <div class="up__body">
                  <b>${esc(ord.nama_pelanggan)} (${esc(ord.jenis_pesanan)})</b>
                  <small>${esc(itemSummary)}</small>
                </div>
                <span class="pill pill--warn">Sajikan</span>
              </div>
            `;
          }
          return `
            <div class="up" style="cursor:default;">
              <div class="up__date"><small>${esc(ord.metode_pembayaran)}</small><b>${esc(ord.badge_meja)}</b></div>
              <div class="up__body">
                <b>${esc(ord.nama_pelanggan)} (${esc(ord.jenis_pesanan)})</b>
                <small>${esc(itemSummary)}</small>
              </div>
              <span class="pill pill--warn">Menunggu</span>
            </div>
          `;
        }).join('');
      }
    }

    // Loyalty Module Preview (explicitly non-active)
    const memEl = document.getElementById('ov-members-preview');
    if (memEl) {
      memEl.innerHTML = `
        <div style="padding:10px 4px;font-size:var(--fs-xs);color:var(--muted);line-height:1.5;">
          <strong style="display:block;color:var(--ink);margin-bottom:4px;">Program Poin &amp; Tier Belum Diaktifkan</strong>
          Sistem saat ini belum menyimpan basis data poin member. Untuk potongan harga operasional, gunakan fitur <b>Potongan Promo Manual</b> pada halaman Kasir POS.
        </div>
      `;
    }
  }

  /* ============================================================
     5. POS KASIR, EXPIRY GUARD & IDEMPOTENT CHECKOUT
     ============================================================ */
  function reconcileCartWithProducts() {
    if (!Array.isArray(STATE.cart) || STATE.cart.length === 0) return;
    if (STATE.checkoutSubmitting) return;

    const nextCart = [];
    let removedOrAdjusted = false;

    for (const item of STATE.cart) {
      const live = STATE.menus.find(m => m.id_menu === item.id_menu && m.is_available !== 0);
      if (!live || live.stok <= 0 || live.is_expired) {
        removedOrAdjusted = true;
        continue;
      }
      const clampedQty = Math.min(item.qty, live.stok);
      if (clampedQty !== item.qty) removedOrAdjusted = true;
      nextCart.push({
        id_menu: live.id_menu,
        nama_menu: live.nama_menu,
        harga: live.harga,
        qty: clampedQty
      });
    }

    if (removedOrAdjusted) {
      STATE.cart = nextCart;
      STATE.pendingCheckout = null;
      showToast('Keranjang disesuaikan karena ketersediaan atau masa berlaku stok cabang berubah.', 'warning');
    }
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

    const navCartBadge = document.getElementById('nav-cart-badge');
    if (navCartBadge) navCartBadge.textContent = `${activeMenus.length} Menu`;

    if (filtered.length === 0) {
      grid.innerHTML = '<div style="grid-column:1/-1;padding:32px;text-align:center;color:var(--muted);">Tidak ada menu yang cocok dengan filter pencarian.</div>';
      return;
    }

    grid.innerHTML = filtered.map(m => {
      const expired = Boolean(m.is_expired);
      const nearExp = Boolean(m.is_near_expiry && !expired);
      const out = m.stok <= 0 || expired;

      let badgeCls = 'prod-stock-badge';
      let badgeTxt = `Stok ${m.stok}`;
      if (expired) {
        badgeCls += ' prod-stock-badge--bad';
        badgeTxt = 'Kedaluwarsa';
      } else if (m.stok <= 0) {
        badgeCls += ' prod-stock-badge--bad';
        badgeTxt = 'Habis';
      } else if (nearExp) {
        badgeCls += ' prod-stock-badge--warn';
        badgeTxt = m.days_until_expiry === 0
          ? `Stok ${m.stok} · Exp Hari Ini`
          : `Stok ${m.stok} · H-${m.days_until_expiry}`;
      }

      const imgHtml = STATE.showPhotos ? `
        <div class="prod-img-wrap">
          <img class="prod-img" src="${esc(m.gambar || 'assets/logo.png')}" alt="${esc(m.nama_menu)}" loading="lazy" data-img-fallback="assets/logo.png">
          <span class="${badgeCls}">${esc(badgeTxt)}</span>
        </div>
      ` : '';

      const catLabel = STATE.showPhotos
        ? m.kategori
        : `${m.kategori} · ${badgeTxt}`;

      return `
        <article class="prod-card ${out ? 'is-out' : ''}"
                 data-add-menu="${esc(m.id_menu)}"
                 role="button"
                 tabindex="0"
                 aria-disabled="${out ? 'true' : 'false'}"
                 aria-label="${out ? `${esc(m.nama_menu)} tidak dapat dipilih (${esc(badgeTxt)})` : `Tambah ${esc(m.nama_menu)} ke keranjang`}">
          ${imgHtml}
          <span class="prod-cat">${esc(catLabel)}</span>
          <h3 class="prod-title">${esc(m.nama_menu)}</h3>
          <p class="prod-desc">${esc(m.deskripsi || 'Disiapkan segar sesuai standar resep NomCherry.')}</p>
          <div class="prod-foot">
            <span class="prod-price">${formatRp(m.harga)}</span>
            <span class="prod-add-btn" aria-hidden="true">${out ? '×' : '+'}</span>
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

  function buildCheckoutPayloadSnapshot() {
    const custName = (document.getElementById('cart-customer-name')?.value || '').trim() || 'Pelanggan Umum';
    const orderType = STATE.orderType || 'Dine-In';
    const rawTableNum = (document.getElementById('cart-table-num')?.value || '').trim();
    const deliveryNote = (document.getElementById('cart-delivery-note')?.value || '').trim();
    const method = STATE.payMethod === 'Card' ? 'Debit' : STATE.payMethod;
    const rawCash = (document.getElementById('cart-cash-received')?.value || '').trim();
    const edcRef = (document.getElementById('cart-edc-ref')?.value || '').trim();
    const qrisChecked = Boolean(document.getElementById('qris-confirm-check')?.checked);

    return JSON.stringify({
      b: STATE.activeBranch,
      c: custName,
      t: orderType,
      m: orderType === 'Dine-In' ? rawTableNum : '-',
      n: orderType === 'Delivery' ? deliveryNote : '',
      p: method,
      d: STATE.discount,
      cash: method === 'Cash' ? rawCash : '',
      qris: method === 'QRIS' ? qrisChecked : false,
      ref: method === 'Debit' ? edcRef : '',
      items: STATE.cart.map(i => `${i.id_menu}:${i.qty}`)
    });
  }

  function invalidatePendingCheckoutIfChanged() {
    if (STATE.checkoutSubmitting || !STATE.pendingCheckout) return;
    const snap = buildCheckoutPayloadSnapshot();
    if (STATE.pendingCheckout.fingerprint !== snap) {
      STATE.pendingCheckout = null;
    }
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
    const { total, qtyCount } = getCartTotals();
    const qrisGroup = document.getElementById('qris-input-group');
    const cashGroup = document.getElementById('cash-input-group');
    const edcGroup = document.getElementById('edc-input-group');
    const qrisBillEl = document.getElementById('qris-bill-val');
    const edcBillEl = document.getElementById('edc-bill-val');

    const billDisplay = qtyCount > 0 ? formatRp(total) : 'Belum ada item';
    if (qrisBillEl) qrisBillEl.textContent = billDisplay;
    if (edcBillEl) edcBillEl.textContent = billDisplay;

    const method = STATE.payMethod === 'Card' ? 'Debit' : STATE.payMethod;
    if (qrisGroup) qrisGroup.style.display = method === 'QRIS' ? '' : 'none';
    if (cashGroup) cashGroup.style.display = method === 'Cash' ? '' : 'none';
    if (edcGroup) edcGroup.style.display = method === 'Debit' ? '' : 'none';

    if (method === 'Cash') {
      updateCashChange();
    }
  }

  function updateCashChange() {
    const { total, qtyCount } = getCartTotals();
    const cashInput = document.getElementById('cart-cash-received');
    const changeEl = document.getElementById('cart-change-val');
    if (!cashInput || !changeEl) return;

    const raw = cashInput.value.trim();
    const cashVal = raw === '' ? NaN : Number(raw);

    if (qtyCount === 0 || total === 0) {
      changeEl.textContent = '—';
      changeEl.style.color = 'var(--muted)';
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

  function renderCart() {
    const container = document.getElementById('pos-cart-items');
    if (!container) return;

    if (STATE.cart.length === 0) {
      container.innerHTML = '<div style="padding:22px 6px;text-align:center;font-size:var(--fs-xs);color:var(--muted);">Keranjang masih kosong. Pilih produk pada katalog untuk memulai transaksi.</div>';
    } else {
      container.innerHTML = STATE.cart.map(item => `
        <div class="cart-item">
          <div class="cart-item__info">
            <div class="cart-item__title">${esc(item.nama_menu)}</div>
            <div class="cart-item__price">${formatRp(item.harga)} × ${item.qty} = <b>${formatRp(item.harga * item.qty)}</b></div>
          </div>
          <div class="cart-qty-ctrl">
            <button type="button" class="qty-btn" data-cart-dec="${esc(item.id_menu)}" aria-label="Kurangi ${esc(item.nama_menu)}">−</button>
            <span class="num" style="font-size:var(--fs-xs);font-weight:700;min-width:20px;text-align:center;">${item.qty}</span>
            <button type="button" class="qty-btn" data-cart-inc="${esc(item.id_menu)}" aria-label="Tambah ${esc(item.nama_menu)}">+</button>
          </div>
        </div>
      `).join('');
    }

    const { subtotal, qtyCount, discount, tax, total } = getCartTotals();
    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setTxt('cart-qty-count', String(qtyCount));
    setTxt('cart-subtotal-val', formatRp(subtotal));
    setTxt('cart-discount-val', discount > 0 ? '-' + formatRp(discount) : '—');
    setTxt('cart-tax-label', `Pajak Restoran PB1 (${STATE.taxRate}%)`);
    setTxt('cart-tax-val', qtyCount > 0 ? formatRp(tax) : '—');
    setTxt('cart-total-val', formatRp(total));

    // Mobile persistent cart summary bar
    setTxt('mobile-cart-count', `${qtyCount} item dalam keranjang`);
    setTxt('mobile-cart-total', formatRp(total));
    const openMobBtn = document.getElementById('open-mobile-cart-btn');
    if (openMobBtn) {
      const span = openMobBtn.querySelector('span') || openMobBtn;
      span.textContent = qtyCount > 0 ? `Keranjang (${qtyCount})` : 'Buka Keranjang';
    }

    const cashIn = document.getElementById('cart-cash-received');
    if (cashIn && !STATE.cashManuallyEdited) {
      cashIn.value = total > 0 ? String(total) : '';
    }

    syncOrderTypeUi();
    syncPaymentMethodUi();
    updateCashChange();
    invalidatePendingCheckoutIfChanged();
  }

  function resetCartState() {
    STATE.cart = [];
    STATE.cashManuallyEdited = false;
    STATE.pendingCheckout = null;
    setInlineAlert('pos-checkout-alert', '');
    const qrisCheck = document.getElementById('qris-confirm-check');
    if (qrisCheck) qrisCheck.checked = false;
    const edcRefInput = document.getElementById('cart-edc-ref');
    if (edcRefInput) edcRefInput.value = '';
    renderCart();
  }

  function addToCart(menuId) {
    if (STATE.checkoutSubmitting) return;
    const m = STATE.menus.find(x => x.id_menu === menuId);
    if (!m) return;

    if (m.is_expired) {
      const msg = `Menu ${m.nama_menu} telah kedaluwarsa (${m.tanggal_kadaluarsa}) dan tidak dapat dijual.`;
      setInlineAlert('pos-checkout-alert', msg, 'error');
      showToast(msg, 'error');
      return;
    }

    if (m.stok <= 0) {
      showToast(`Stok ${m.nama_menu} habis pada cabang ini.`, 'warning');
      return;
    }

    const existing = STATE.cart.find(c => c.id_menu === menuId);
    if (existing) {
      if (existing.qty + 1 > m.stok) {
        showToast(`Batas stok tersedia tercapai (${m.stok} porsi).`, 'warning');
        return;
      }
      existing.qty += 1;
    } else {
      STATE.cart.push({ id_menu: m.id_menu, nama_menu: m.nama_menu, harga: m.harga, qty: 1 });
      if (m.is_near_expiry) {
        const expNote = m.days_until_expiry === 0 ? 'berakhir hari ini' : `berakhir dalam ${m.days_until_expiry} hari`;
        showToast(`Perhatian: stok ${m.nama_menu} ${expNote} (${m.tanggal_kadaluarsa}).`, 'warning');
      }
    }

    setInlineAlert('pos-checkout-alert', '');
    renderCart();
  }

  /* ============================================================
     6. THERMAL RECEIPT GENERATOR (SERVER SNAPSHOT ONLY)
     ============================================================ */
  function openReceiptModal(orderObj, triggerEl = null) {
    if (!orderObj) return;

    const receiptSnap = orderObj.receipt || {};
    const branchMeta = getBranchMeta(orderObj.id_cabang || STATE.activeBranch);

    // Strictly use server snapshot fields — NEVER read unsaved DOM settings inputs!
    const cafeName = receiptSnap.nama_kafe || 'NomCherry Café & Roastery';
    const branchName = receiptSnap.nama_cabang || orderObj.nama_cabang || branchMeta.nama_cabang;
    const cafeAddr = receiptSnap.alamat_cabang || orderObj.alamat_cabang || branchMeta.alamat;
    const cafePhone = receiptSnap.no_telp_cabang || orderObj.no_telp_cabang || branchMeta.no_telp;
    const footerMsg = receiptSnap.footer_struk || 'Terima kasih atas kunjungan Anda!';
    const cashierName = receiptSnap.nama_kasir || orderObj.nama_kasir || STATE.user.nama_pengguna;

    const items = orderObj.items || [];
    const sub = orderObj.subtotal !== undefined && orderObj.subtotal !== null
      ? Number(orderObj.subtotal)
      : items.reduce((s, i) => s + Number(i.harga || i.harga_satuan || 0) * Number(i.jumlah || i.qty || 1), 0);
    const discount = Number(orderObj.diskon || 0);
    const tax = Number(orderObj.pajak ?? 0);
    const tot = Number(orderObj.total ?? (sub - discount + tax));

    const storedTaxRate = receiptSnap.tarif_pajak !== undefined && receiptSnap.tarif_pajak !== null
      ? Number(receiptSnap.tarif_pajak)
      : (orderObj.tarif_pajak !== undefined && orderObj.tarif_pajak !== null
          ? Number(orderObj.tarif_pajak)
          : ((sub - discount) > 0 ? Math.round((tax / (sub - discount)) * 1000) / 10 : 0));

    const orderTypeLabel = orderObj.jenis_pesanan || 'Dine-In';
    const hasTable = orderTypeLabel === 'Dine-In' && orderObj.nomor_meja && orderObj.nomor_meja !== '-';
    const methodLabel = orderObj.metode_pembayaran === 'Debit' ? 'Kartu EDC (Debit)' : orderObj.metode_pembayaran;
    const isCashPayment = orderObj.metode_pembayaran === 'Cash';

    const paperEl = document.getElementById('receipt-paper-content');
    if (!paperEl) return;
    paperEl.style.maxWidth = STATE.printerSize === '58mm' ? '260px' : '380px';
    paperEl.style.margin = '0 auto';

    paperEl.innerHTML = `
      <div style="text-align:center;margin-bottom:10px;">
        <strong style="font-size:14px;display:block;">${esc(cafeName.toUpperCase())}</strong>
        <strong style="font-size:12px;display:block;">${esc(branchName)}</strong>
        <span>${esc(cafeAddr)}</span><br>
        <span>Telp: ${esc(cafePhone)}</span>
      </div>
      <div style="border-top:1px dashed var(--line-2);border-bottom:1px dashed var(--line-2);padding:6px 0;margin-bottom:8px;">
        <div>No. Struk : <b>${esc(orderObj.nomor_struk)}</b></div>
        <div>Pelanggan : ${esc(orderObj.nama_pelanggan)}</div>
        <div>Jenis     : <b>${esc(orderTypeLabel)}</b>${hasTable ? ` · ${esc(orderObj.nomor_meja)}` : ''}</div>
        ${orderTypeLabel === 'Delivery' && orderObj.catatan && orderObj.catatan !== 'Order POS' ? `<div>Catatan   : ${esc(orderObj.catatan)}</div>` : ''}
        <div>Kasir     : ${esc(cashierName)}</div>
        <div>Metode    : ${esc(methodLabel)} · ${esc(orderObj.waktu || '-')}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:8px;">
        ${items.map(i => {
          const q = Number(i.jumlah || i.qty || 1);
          const p = Number(i.harga || i.harga_satuan || 0);
          return `<div style="display:flex;justify-content:space-between;gap:8px;"><span>${q}x ${esc(i.nama_menu)}</span><b>${formatRp(q * p)}</b></div>`;
        }).join('')}
      </div>
      <div style="border-top:1px dashed var(--line-2);padding-top:6px;">
        <div style="display:flex;justify-content:space-between;"><span>Subtotal</span><span>${formatRp(sub)}</span></div>
        ${discount > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Potongan Promo</span><span>-${formatRp(discount)}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;"><span>PB1 Restoran (${esc(storedTaxRate)}%)</span><span>${formatRp(tax)}</span></div>
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

    openModal('receipt-modal', triggerEl);
  }

  /* ============================================================
     7. ORDERS, CATALOG, INVENTORY, REPORTS & MEMBERS VIEWS
     ============================================================ */
  function renderOrdersView() {
    const listEl = document.getElementById('orders-activity-list');
    if (!listEl) return;

    const sum = STATE.ordersSummary;
    const pg = STATE.ordersPagination;
    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setTxt('ord-sum-total', `${Number(sum.total_orders || 0).toLocaleString('id-ID')} Transaksi`);
    setTxt('ord-sum-prep', `${Number(sum.pending_kitchen || 0).toLocaleString('id-ID')} Pesanan`);
    setTxt('ord-sum-done', `${Number(sum.served_kitchen || 0).toLocaleString('id-ID')} Pesanan`);
    setTxt('ord-sum-rev', formatRp(sum.gross_total || 0));
    setTxt('ord-sum-tax-sub', `Nett ${formatRp(sum.nett_total || 0)} · Pajak ${formatRp(sum.tax_total || 0)}`);

    const pageInfoEl = document.getElementById('orders-page-info');
    const prevBtn = document.getElementById('orders-prev-page');
    const nextBtn = document.getElementById('orders-next-page');
    if (pageInfoEl) {
      if (pg.total === 0) {
        pageInfoEl.textContent = '0 transaksi ditemukan';
      } else {
        const startIdx = pg.offset + 1;
        const endIdx = pg.offset + STATE.orders.length;
        pageInfoEl.textContent = `Menampilkan ${startIdx}–${endIdx} dari ${pg.total.toLocaleString('id-ID')} struk (Halaman ${pg.page}/${pg.total_pages})`;
      }
    }
    if (prevBtn) prevBtn.disabled = !pg.has_prev;
    if (nextBtn) nextBtn.disabled = !pg.has_next;

    if (STATE.orders.length === 0) {
      listEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);">Tidak ada pesanan yang sesuai dengan filter pada cabang ini.</div>';
      return;
    }

    const canServeKitchen = ['admin', 'kasir', 'manager'].includes(STATE.user.peran);

    listEl.innerHTML = `
      <div class="ac-group__head">
        <span>Riwayat Transaksi Cabang (${pg.total.toLocaleString('id-ID')} Struk)</span>
        <span>Klik Struk untuk pratinjau snapshot asli</span>
      </div>
      ${STATE.orders.map(o => `
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
          <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;">
            <strong class="ac-row__amt priv">${formatRp(o.total)}</strong>
            ${canServeKitchen && o.status === 'Diproses' ? `<button type="button" class="btn btn--sm btn--primary" data-complete-order="${esc(o.id_pesanan)}">Sajikan</button>` : ''}
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
      const q = STATE.catalogSearch.toLowerCase();
      const matchSearch = !q || m.nama_menu.toLowerCase().includes(q) || m.id_menu.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });

    if (filtered.length === 0) {
      grid.innerHTML = '<div style="grid-column:1/-1;padding:28px;text-align:center;color:var(--muted);">Tidak ada menu yang sesuai filter di katalog.</div>';
      return;
    }

    grid.innerHTML = filtered.map(m => {
      const badgeCls = m.is_expired || m.stok <= 0
        ? 'prod-stock-badge prod-stock-badge--bad'
        : (m.is_near_expiry ? 'prod-stock-badge prod-stock-badge--warn' : 'prod-stock-badge');
      const badgeTxt = m.is_expired ? 'Kedaluwarsa' : `Stok: ${m.stok}`;
      return `
        <article class="prod-card" style="cursor:default;">
          <div class="prod-img-wrap">
            <img class="prod-img" src="${esc(m.gambar || 'assets/logo.png')}" alt="${esc(m.nama_menu)}" loading="lazy" data-img-fallback="assets/logo.png">
            <span class="${badgeCls}">${esc(badgeTxt)}</span>
          </div>
          <span class="prod-cat">${esc(m.kategori)} · ${esc(m.id_menu)}</span>
          <h3 class="prod-title">${esc(m.nama_menu)}</h3>
          <p class="prod-desc">${esc(m.deskripsi || 'Menu spesial NomCherry Café.')}</p>
          <div class="prod-foot">
            <span class="prod-price">${formatRp(m.harga)}</span>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button type="button" class="btn btn--sm" data-restock-menu="${esc(m.id_menu)}" title="Kelola Stok Cabang">Stok</button>
              <button type="button" class="btn btn--sm" data-edit-menu="${esc(m.id_menu)}">Edit</button>
              <button type="button" class="btn btn--sm" data-delete-menu="${esc(m.id_menu)}" style="color:var(--bad);">Hapus</button>
            </div>
          </div>
        </article>
      `;
    }).join('');
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
          <div class="ac-row__cat num">Awal ${esc(stokAwal)} → <b>Sisa ${esc(log.stok_sisa)}</b></div>
          <div class="ac-row__status"><span class="pill ${cfg.cls}">${esc(cfg.lbl)}</span></div>
          <div style="text-align:right;font-size:var(--fs-2xs);color:var(--muted);">${esc(log.nama_cabang || log.id_cabang || STATE.activeBranch)}</div>
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
    const nearExpiryItems = items.filter(item => item.is_near_expiry && !item.is_expired);
    const safeItems = items.filter(item => item.status_stok === 'Aman' && !item.is_expired);

    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setTxt('inv-sum-total', `${items.length} Item Stok`);
    setTxt('inv-sum-safe', `${safeItems.length} Aman`);
    setTxt('inv-sum-low', `${onlyLowItems.length} Menipis`);
    setTxt('inv-sum-low-names', onlyLowItems.length > 0 ? onlyLowItems.slice(0, 2).map(i => i.nama).join(', ') : 'Batas minimum aman');
    setTxt('inv-sum-out', `${outItems.length} Habis`);
    setTxt('inv-sum-out-names', outItems.length > 0 ? outItems.slice(0, 2).map(i => i.nama).join(', ') : 'Semua menu tersedia');
    setTxt('inv-sum-exp', `${expiredItems.length + nearExpiryItems.length} Item`);
    setTxt(
      'inv-sum-exp-sub',
      expiredItems.length > 0
        ? `${expiredItems.length} Kedaluwarsa · ${nearExpiryItems.length} Near-Exp`
        : (nearExpiryItems.length > 0 ? `${nearExpiryItems.length} Mendekati Kedaluwarsa` : 'Tidak ada item kedaluwarsa')
    );

    const navBadge = document.getElementById('nav-inv-badge');
    if (navBadge) {
      const totalAlerts = alertItems.length + expiredItems.length;
      navBadge.textContent = totalAlerts > 0 ? `${totalAlerts} Alert` : 'Aman';
    }

    const canMutateStock = ['admin', 'manager'].includes(STATE.user.peran);
    const opnameBtn = document.getElementById('stock-opname-btn');
    const bulkBtn = document.getElementById('restock-all-btn');
    if (opnameBtn) opnameBtn.style.display = canMutateStock ? '' : 'none';
    if (bulkBtn) bulkBtn.style.display = canMutateStock ? '' : 'none';

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
        ? 'Kedaluwarsa'
        : (item.is_near_expiry && item.status_stok === 'Aman' ? 'Near Expiry' : (item.status_stok || 'Aman'));

      let expiry = 'Tanpa tanggal kedaluwarsa';
      if (item.exp && item.exp !== '-') {
        if (item.is_expired) {
          expiry = `KEDALUWARSA (${item.exp})`;
        } else if (item.is_near_expiry) {
          expiry = item.days_until_expiry === 0
            ? `Berakhir Hari Ini (${item.exp})`
            : `Segera Exp: ${item.exp} (${item.days_until_expiry} hr)`;
        } else {
          expiry = `Kedaluwarsa: ${item.exp}`;
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
          <div style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap;">
            ${canMutateStock ? `
              <button type="button" class="btn btn--sm btn--primary" data-restock-id="${esc(item.id)}">Restock</button>
              <button type="button" class="btn btn--sm" data-adjust-stock="${esc(item.id)}">Kelola</button>
            ` : `<span style="font-size:var(--fs-2xs);color:var(--muted);">Baca-saja</span>`}
          </div>
        </div>
      `;
    }).join('');

    renderInventoryLogs();
  }

  function renderReportsView() {
    const data = STATE.analytics;
    const activeMeta = getActiveBranchMeta();
    const empty = '<div style="padding:18px;color:var(--muted);font-size:var(--fs-xs);">Belum ada data penjualan pada filter &amp; cabang ini.</div>';
    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    const filterNote = (STATE.reportsDateStart || STATE.reportsDateEnd)
      ? `Rentang ${STATE.reportsDateStart || 'awal'} s/d ${STATE.reportsDateEnd || 'sekarang'} · ${activeMeta.nama_cabang}`
      : `Seluruh transaksi selesai · ${activeMeta.nama_cabang} (${STATE.activeBranch})`;
    setTxt('reports-sub-label', filterNote);

    const summary = (data && data.summary) || {
      total_transaksi: 0,
      total_subtotal: 0,
      total_diskon: 0,
      total_nett: 0,
      total_pajak: 0,
      total_pendapatan: 0,
      total_porsi: 0,
      rata_rata_transaksi: 0
    };

    setTxt('rep-kpi-tx-badge', `${Number(summary.total_transaksi || 0).toLocaleString('id-ID')} Struk`);
    setTxt('rep-kpi-month', formatRp(summary.total_pendapatan || 0));
    setTxt('rep-kpi-branch-foot', activeMeta.nama_cabang);
    setTxt('rep-kpi-nett', formatRp(summary.total_nett || 0));
    setTxt('rep-kpi-aov-foot', `Rata-rata: ${formatRp(summary.rata_rata_transaksi || 0)}`);
    setTxt('rep-kpi-disc-foot', `Diskon: ${formatRp(summary.total_diskon || 0)}`);
    setTxt('rep-kpi-cups', `${Number(summary.total_porsi || 0).toLocaleString('id-ID')} Porsi`);
    setTxt('rep-kpi-tax', formatRp(summary.total_pajak || 0));

    const barsEl = document.getElementById('reports-bars-chart');
    if (barsEl) {
      if (!data || !data.monthly || data.monthly.length === 0) {
        barsEl.innerHTML = empty;
      } else {
        const maxTotal = Math.max(1, ...data.monthly.map(row => Number(row.total || 0)));
        barsEl.innerHTML = data.monthly.map((row, index) => `
          <div class="bars__col ${index === data.monthly.length - 1 ? 'is-now' : ''}">
            <span class="bars__val priv">${formatCompactRp(row.total)}</span>
            <div class="bars__stack">
              <i style="height:${Math.max(4, Math.round((Number(row.total || 0) / maxTotal) * 120))}px;background:var(--accent)"></i>
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
              <span class="an-cat__l"><i class="sw" style="background:${colors[index % colors.length]}"></i>${esc(row.kategori)} (${esc(row.qty || 0)} item)</span>
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

  function renderMembersView() {
    const el = document.getElementById('members-list-container');
    if (!el) return;
    el.innerHTML = `
      <div style="padding:28px 20px;max-width:620px;margin:0 auto;text-align:center;display:flex;flex-direction:column;gap:10px;align-items:center;">
        <span class="pill pill--warn">Status Modul: Belum Diaktifkan</span>
        <h2 style="font-size:var(--fs-lg);font-weight:700;">Program Member &amp; Poin Loyalitas Belum Tersedia</h2>
        <p style="font-size:var(--fs-xs);color:var(--muted);line-height:1.6;">
          Basis data keanggotaan, perhitungan poin otomatis, serta penukaran reward belum diimplementasikan pada rilis operasional ini. Halaman ini tidak menampilkan data pelanggan fiktif agar laporan operasional tetap akurat.
        </p>
        <div class="info-strip" style="width:100%;justify-content:center;margin-top:4px;">
          <span>Untuk memberikan potongan harga kasir saat ini, gunakan fitur <b>Potongan Promo Manual</b> di halaman Kasir POS.</span>
        </div>
      </div>
    `;
  }

  function renderAll() {
    renderHeaderAndSessionUi();
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
     8. BACKEND API INTEGRATION, RACE GUARD & POLLING
     ============================================================ */
  function handleSessionExpired() {
    if (sessionExpiredRedirecting) return true;
    sessionExpiredRedirecting = true;
    localStorage.removeItem('nomcherry_session');
    sessionStorage.setItem('nomcherry_auth_notice', 'Sesi Anda telah berakhir atau dicabut. Silakan masuk kembali.');
    showToast('Sesi berakhir. Mengalihkan ke halaman masuk...', 'error');
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 150);
    return true;
  }

  function redirectIfUnauthorized(response) {
    if (response && response.status === 401) {
      return handleSessionExpired();
    }
    return false;
  }

  function mapOrderFromApi(order) {
    const items = (order.items || []).map(item => ({
      nama_menu: item.nama_menu,
      jumlah: item.jumlah ?? item.qty ?? 1,
      harga: item.harga_satuan ?? item.harga ?? 0
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
      id_cabang: order.id_cabang || STATE.activeBranch,
      nomor_struk: order.nomor_struk || order.id_pesanan,
      nama_pelanggan: order.nama_pelanggan || order.pelanggan || 'Pelanggan Umum',
      jenis_pesanan: jenis,
      nomor_meja: nomorMeja,
      lokasi_label: lokasiLabel,
      badge_meja: badgeMeja,
      catatan: order.catatan || '',
      metode_pembayaran: order.metode || 'Cash',
      nominal_diterima: order.nominal_diterima,
      kembalian: order.kembalian,
      referensi: order.referensi || '',
      tanggal_iso: order.tanggal_pesanan || order.tanggal,
      status_dapur: order.status_dapur || 'served',
      status: (order.status_dapur || 'served') === 'pending' ? 'Diproses' : 'Selesai',
      waktu: (order.tanggal_pesanan || order.tanggal)
        ? new Date(order.tanggal_pesanan || order.tanggal).toLocaleString('id-ID', {
            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
          })
        : '-',
      subtotal: order.subtotal,
      pajak: order.pajak,
      tarif_pajak: order.tarif_pajak,
      diskon: order.diskon,
      total: order.total,
      nama_cabang: order.nama_cabang,
      alamat_cabang: order.alamat_cabang,
      no_telp_cabang: order.no_telp_cabang,
      nama_kasir: order.nama_pengguna || order.kasir,
      receipt: order.receipt || null,
      items
    };
  }

  async function loadBranches() {
    try {
      const res = await fetch('/api/branches');
      if (redirectIfUnauthorized(res)) return;
      if (!res.ok) return;
      const payload = await res.json();
      if (payload.success && Array.isArray(payload.data) && payload.data.length > 0) {
        STATE.branches = payload.data;
      }
    } catch (e) {
      // Keep default fallback list if offline
    }
    populateBranchSelector();
  }

  async function loadSettings(signal) {
    try {
      const res = await fetch(`/api/settings?cabang=${encodeURIComponent(STATE.activeBranch)}`, { signal });
      if (redirectIfUnauthorized(res)) return;
      if (!res.ok) throw new Error('Gagal memuat konfigurasi sistem');
      const payload = await res.json();
      if (!payload.success || !payload.data) return;

      const settings = payload.data;
      const perms = settings.permissions || {
        can_edit_business: ['admin', 'manager'].includes(STATE.user.peran),
        can_edit_branch: STATE.user.peran === 'admin'
      };
      STATE.settingsPermissions = perms;

      const branchObj = settings.branch || getActiveBranchMeta();
      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el && val !== undefined && val !== null) el.value = String(val);
      };

      setVal('set-cafe-name', settings.cafe_name);
      setVal('set-tax-rate', settings.tax_rate);
      setVal('set-receipt-footer', settings.receipt_footer);
      setVal('set-branch-name', branchObj.nama_cabang || '');
      setVal('set-branch-phone', branchObj.no_telp || '');
      setVal('set-branch-addr', branchObj.alamat || '');

      const branchSecTitle = document.getElementById('settings-branch-section-title');
      if (branchSecTitle) {
        branchSecTitle.textContent = `Identitas Cabang Aktif (${branchObj.id_cabang || STATE.activeBranch})`;
      }

      // Apply RBAC field states cleanly
      ['set-cafe-name', 'set-tax-rate', 'set-receipt-footer'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.disabled = !perms.can_edit_business;
          el.readOnly = !perms.can_edit_business;
        }
      });

      ['set-branch-name', 'set-branch-phone', 'set-branch-addr'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.disabled = !perms.can_edit_branch;
          el.readOnly = !perms.can_edit_branch;
        }
      });

      const canSaveAny = Boolean(perms.can_edit_business || perms.can_edit_branch);
      const submitRow = document.getElementById('settings-submit-row');
      const saveBtn = document.getElementById('save-settings-btn');
      if (submitRow) submitRow.style.display = canSaveAny ? 'flex' : 'none';
      if (saveBtn) saveBtn.disabled = !canSaveAny;

      const accessPill = document.getElementById('settings-access-pill');
      const permBanner = document.getElementById('settings-perm-banner');
      if (perms.can_edit_branch) {
        if (accessPill) {
          accessPill.className = 'pill pill--good';
          accessPill.textContent = 'Akses Penuh Admin';
        }
        setInlineAlert(
          'settings-perm-banner',
          'Anda masuk sebagai Admin: dapat memperbarui konfigurasi global kafe sekaligus nama, alamat, dan telepon cabang aktif.',
          'good'
        );
      } else if (perms.can_edit_business) {
        if (accessPill) {
          accessPill.className = 'pill pill--warn';
          accessPill.textContent = 'Akses Manajer';
        }
        setInlineAlert(
          'settings-perm-banner',
          'Anda dapat mengubah nama brand, tarif pajak baru, dan footer struk global. Identitas alamat/telepon cabang bersifat baca-saja (khusus Admin).',
          'info'
        );
      } else {
        if (accessPill) {
          accessPill.className = 'pill';
          accessPill.textContent = 'Mode Baca-Saja';
        }
        if (permBanner) {
          setInlineAlert(
            'settings-perm-banner',
            `Peran ${(STATE.user.peran || 'kasir').toUpperCase()} hanya memiliki akses baca pada konfigurasi bisnis. Gunakan panel di kiri untuk mengatur tema tampilan, ukuran kertas thermal, atau mengganti kata sandi akun Anda.`,
            'info'
          );
        }
      }

      const rate = Number(settings.tax_rate);
      STATE.taxRate = Number.isFinite(rate) && rate >= 0 && rate <= 25 ? rate : 10;
      renderHeaderAndSessionUi();
      renderCart();
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      showToast('Gagal memuat pengaturan sistem: ' + err.message, 'error');
    }
  }

  async function fetchOrders(branchId, signal) {
    const params = new URLSearchParams({
      cabang: branchId,
      limit: String(STATE.ordersPageLimit),
      offset: String(STATE.ordersOffset)
    });

    if (STATE.ordersFilterStatus === 'Diproses') {
      params.set('status_dapur', 'pending');
    } else if (STATE.ordersFilterStatus === 'Selesai') {
      params.set('status_dapur', 'served');
    }

    if (STATE.ordersFilterPay && STATE.ordersFilterPay !== 'all') {
      params.set('metode', STATE.ordersFilterPay);
    }

    if (STATE.ordersDate) {
      params.set('date', STATE.ordersDate);
    }

    if (STATE.ordersSearch.trim()) {
      params.set('search', STATE.ordersSearch.trim());
    }

    const res = await fetch(`/api/orders?${params.toString()}`, { signal });
    if (redirectIfUnauthorized(res)) return null;
    const payload = await res.json();
    if (!res.ok || !payload.success) {
      throw new Error(payload.message || 'Gagal memuat riwayat pesanan');
    }
    return payload;
  }

  async function fetchDashboard(branchId, rangeKey, signal) {
    const params = new URLSearchParams({
      cabang: branchId,
      range: rangeKey || 'today'
    });
    const res = await fetch(`/api/reports/dashboard?${params.toString()}`, { signal });
    if (redirectIfUnauthorized(res)) return null;
    const payload = await res.json();
    if (!res.ok || !payload.success) {
      throw new Error(payload.message || 'Gagal memuat ringkasan dashboard');
    }
    return payload.data;
  }

  async function fetchAnalytics(branchId, signal) {
    if (!canView('reports')) return null;
    const params = new URLSearchParams({ cabang: branchId });
    if (STATE.reportsDateStart) params.set('date_start', STATE.reportsDateStart);
    if (STATE.reportsDateEnd) params.set('date_end', STATE.reportsDateEnd);

    const res = await fetch(`/api/reports/analytics?${params.toString()}`, { signal });
    if (redirectIfUnauthorized(res)) return null;
    if (res.status === 403) return null;
    const payload = await res.json();
    if (!res.ok || !payload.success) {
      throw new Error(payload.message || 'Gagal memuat analitik laporan');
    }
    return payload.data;
  }

  async function syncWithBackend({ background = false } = {}) {
    if (background && (STATE.isSyncing || STATE.checkoutSubmitting || !STATE.isOnline)) {
      return;
    }

    if (!background && activeAbortController) {
      activeAbortController.abort();
    }

    const controller = new AbortController();
    activeAbortController = controller;
    const { signal } = controller;
    const mySeq = ++syncSeq;
    const targetBranch = STATE.activeBranch;
    const targetRange = STATE.overviewRange;

    STATE.isSyncing = true;
    if (!background) {
      updateSyncStatusIndicator('syncing');
    }

    try {
      const [menuRes, ordersPayload, dashData] = await Promise.all([
        fetch(`/api/menu?cabang=${encodeURIComponent(targetBranch)}`, { signal }),
        fetchOrders(targetBranch, signal),
        fetchDashboard(targetBranch, targetRange, signal)
      ]);

      if (redirectIfUnauthorized(menuRes)) return;
      if (mySeq !== syncSeq || targetBranch !== STATE.activeBranch) return;

      if (menuRes.ok) {
        const menuData = await menuRes.json();
        if (mySeq !== syncSeq || targetBranch !== STATE.activeBranch) return;
        STATE.menus = menuData.success && Array.isArray(menuData.data) ? menuData.data : [];
        reconcileCartWithProducts();
      }

      if (ordersPayload) {
        const mappedOrders = (ordersPayload.data || []).map(mapOrderFromApi);
        const mappedQueue = (ordersPayload.kitchen_queue || []).map(mapOrderFromApi);
        STATE.orders = mappedOrders;
        STATE.kitchenQueue = mappedQueue;
        STATE.ordersSummary = ordersPayload.summary || STATE.ordersSummary;
        STATE.ordersPagination = ordersPayload.pagination || STATE.ordersPagination;
        const map = new Map();
        mappedOrders.forEach(o => map.set(o.id_pesanan, o));
        mappedQueue.forEach(o => map.set(o.id_pesanan, o));
        STATE.orderMap = map;
      }

      if (dashData) {
        STATE.dashboard = dashData;
        setInlineAlert('ov-error-banner', '');
      }

      if (canView('inventory') || STATE.user.peran === 'owner') {
        const [stockRes, logRes] = await Promise.all([
          fetch(`/api/stock?cabang=${encodeURIComponent(targetBranch)}`, { signal }),
          fetch(`/api/stock/logs?cabang=${encodeURIComponent(targetBranch)}&limit=100`, { signal })
        ]);
        if (redirectIfUnauthorized(stockRes) || redirectIfUnauthorized(logRes)) return;
        if (mySeq !== syncSeq || targetBranch !== STATE.activeBranch) return;

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
            is_expired: Boolean(item.is_expired),
            is_near_expiry: Boolean(item.is_near_expiry),
            cabang: item.nama_cabang || item.id_cabang
          }));
        }

        if (logRes.ok) {
          const logPayload = await logRes.json();
          STATE.inventoryLogs = logPayload.success && Array.isArray(logPayload.data) ? logPayload.data : [];
        }
      } else {
        const branchName = getBranchMeta(targetBranch).nama_cabang;
        STATE.inventory = STATE.menus
          .filter(m => m.is_available !== 0)
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
              days_until_expiry: item.days_until_expiry,
              is_expired: Boolean(item.is_expired),
              is_near_expiry: Boolean(item.is_near_expiry),
              cabang: branchName
            };
          });
      }

      if (canView('reports')) {
        try {
          const analyticsData = await fetchAnalytics(targetBranch, signal);
          if (mySeq === syncSeq && targetBranch === STATE.activeBranch && analyticsData) {
            STATE.analytics = analyticsData;
            setInlineAlert('rep-error-banner', '');
          }
        } catch (repErr) {
          if (repErr && repErr.name !== 'AbortError') {
            setInlineAlert('rep-error-banner', repErr.message, 'error');
          }
        }
      }

      if (mySeq !== syncSeq || targetBranch !== STATE.activeBranch) return;
      STATE.lastSyncedAt = new Date();
      STATE.isOnline = true;
      updateSyncStatusIndicator('ready');
      renderAll();
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      if (mySeq !== syncSeq) return;
      updateSyncStatusIndicator(navigator.onLine === false ? 'offline' : 'error');
      if (!background) {
        setInlineAlert('ov-error-banner', 'Gagal memuat pembaruan dari server: ' + err.message, 'error');
        showToast('Gagal memuat data dari server: ' + err.message, 'error');
        renderAll();
      }
    } finally {
      if (activeAbortController === controller) {
        STATE.isSyncing = false;
      }
    }
  }

  function scheduleBackgroundPoll() {
    if (pollTimerId) {
      clearTimeout(pollTimerId);
      pollTimerId = null;
    }
    const intervalMs = Math.max(1500, Number(window.__NOMCHERRY_POLL_MS) || 10000);
    pollTimerId = setTimeout(async () => {
      if (document.visibilityState === 'visible' && STATE.isOnline) {
        await syncWithBackend({ background: true });
      }
      scheduleBackgroundPoll();
    }, intervalMs);
  }

  /* ============================================================
     9. STOCK ADJUSTMENT & OPNAME HELPERS
     ============================================================ */
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
      KADALUARSA: 'Pemusnahan stok melewati tanggal kedaluwarsa',
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

  function openStockAdjustModal(menuId, defaultType = 'MASUK', triggerEl = null) {
    if (!['admin', 'manager'].includes(STATE.user.peran)) {
      showToast('Hanya Admin atau Manajer yang dapat mengubah stok.', 'warning');
      return;
    }
    const inv = STATE.inventory.find(i => i.id === menuId);
    const menu = STATE.menus.find(m => m.id_menu === menuId);
    if (!inv && !menu) return;

    const itemName = inv ? inv.nama : menu.nama_menu;
    const currentStok = inv ? inv.stok : menu.stok;
    const minStok = inv ? (inv.min_stok ?? 5) : (menu.min_stok ?? 5);
    const expDate = (inv && inv.exp && inv.exp !== '-') ? inv.exp : (menu?.tanggal_kadaluarsa || '');
    const branchLabel = inv ? inv.cabang : getActiveBranchMeta().nama_cabang;

    setInlineAlert('adj-modal-error', '');
    document.getElementById('adj-menu-id').value = menuId;
    document.getElementById('adj-item-name').textContent = `${itemName} (${menuId})`;
    document.getElementById('adj-branch-label').textContent = `${branchLabel} (${STATE.activeBranch})`;
    document.getElementById('adj-current-stock').textContent = `${currentStok} porsi`;
    document.getElementById('adj-movement-type').value = defaultType;
    document.getElementById('adj-qty').value = (defaultType === 'PENYESUAIAN' || defaultType === 'OPNAME') ? String(currentStok) : '10';
    document.getElementById('adj-min-stock').value = String(minStok);
    document.getElementById('adj-exp-date').value = expDate;
    document.getElementById('adj-reason').value = '';

    updateStockAdjustPreview();
    openModal('stock-adjust-modal', triggerEl);
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

  function openStockOpnameModal(triggerEl = null) {
    const container = document.getElementById('opname-items-container');
    if (!container) return;

    const activeMeta = getActiveBranchMeta();
    const subEl = document.getElementById('stock-opname-branch-sub');
    if (subEl) {
      subEl.textContent = `Cabang Aktif: ${activeMeta.nama_cabang} (${STATE.activeBranch}) — Masukkan stok fisik aktual hasil perhitungan`;
    }

    container.innerHTML = STATE.inventory.map(item => `
      <div class="ac-row" style="padding:8px 6px;gap:8px;align-items:center;" data-opname-row="${esc(item.id)}">
        <div class="ac-row__who" style="min-width:140px;">
          <b>${esc(item.nama)}</b>
          <small>${esc(item.id)} · ${esc(item.kategori)}</small>
        </div>
        <div class="num" style="font-size:var(--fs-xs);color:var(--muted);">Sistem: <b>${esc(item.stok)}</b></div>
        <div style="display:flex;align-items:center;gap:6px;">
          <label for="opname-in-${esc(item.id)}" style="font-size:var(--fs-2xs);color:var(--muted);">Fisik:</label>
          <input type="number" id="opname-in-${esc(item.id)}" min="0" max="10000" value="${esc(item.stok)}"
                 data-opname-input="${esc(item.id)}" data-opname-sys="${esc(item.stok)}"
                 style="width:78px;min-height:36px;padding:5px 8px;border:1px solid var(--line-2);border-radius:6px;background:var(--bg);color:var(--ink);">
        </div>
        <div><span class="pill pill--good" data-opname-badge="${esc(item.id)}">0 (Sesuai)</span></div>
        <div style="flex:1;min-width:130px;">
          <input type="text" aria-label="Catatan selisih ${esc(item.nama)}" placeholder="Catatan selisih (opsional)"
                 data-opname-reason="${esc(item.id)}"
                 style="width:100%;min-height:36px;padding:5px 8px;border:1px solid var(--line-2);border-radius:6px;background:var(--bg);color:var(--ink);font-size:var(--fs-2xs);">
        </div>
      </div>
    `).join('');

    updateOpnameSummary();
    openModal('stock-opname-modal', triggerEl);
  }

  /* ============================================================
     10. EVENT LISTENERS & INTERACTION BINDINGS
     ============================================================ */
  async function applyBranchSwitch(nextBranch) {
    if (activeAbortController) {
      activeAbortController.abort();
    }
    syncSeq += 1;
    STATE.activeBranch = nextBranch;
    STATE.ordersOffset = 0;
    STATE.pendingCheckout = null;
    sessionStorage.setItem('nomcherry_active_branch', nextBranch);

    renderHeaderAndSessionUi();
    await Promise.all([
      loadSettings(),
      syncWithBackend({ background: false })
    ]);
    const meta = getActiveBranchMeta();
    showToast(`Cabang aktif berpindah ke ${meta.nama_cabang} (${nextBranch}).`, 'info');
  }

  function applyTheme(themeValue) {
    const next = themeValue === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('nomcherry_theme', next);
    const prefSelect = document.getElementById('pref-theme-select');
    if (prefSelect && prefSelect.value !== next) {
      prefSelect.value = next;
    }
  }

  function bindEvents() {
    // View Navigation
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

    document.getElementById('top-quick-pos-btn')?.addEventListener('click', () => switchView('pos'));
    document.getElementById('brand-home-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      switchView('overview');
    });

    // Mobile Nav Drawer + Mobile Cart Sheet
    document.getElementById('mobile-menu-btn')?.addEventListener('click', (e) => {
      const appShell = document.getElementById('app-shell');
      if (appShell && appShell.classList.contains('is-mobile-open')) {
        closeMobileNavDrawer();
      } else {
        openMobileNavDrawer(e.currentTarget);
      }
    });
    document.getElementById('close-mobile-nav-btn')?.addEventListener('click', () => closeMobileNavDrawer());
    document.getElementById('mobile-backdrop')?.addEventListener('click', () => closeMobileNavDrawer());

    document.getElementById('open-mobile-cart-btn')?.addEventListener('click', (e) => {
      openMobileCartSheet(e.currentTarget);
    });
    document.getElementById('close-mobile-cart-btn')?.addEventListener('click', () => closeMobileCartSheet());
    document.getElementById('mobile-cart-backdrop')?.addEventListener('click', () => closeMobileCartSheet());

    window.addEventListener('resize', () => {
      if (window.innerWidth >= 1024) {
        if (overlayStack.some(o => o.id === 'mobile-nav-drawer')) {
          closeMobileNavDrawer({ restoreFocus: false });
        }
        if (overlayStack.some(o => o.id === 'mobile-cart-sheet')) {
          closeMobileCartSheet({ restoreFocus: false });
        }
      }
    });

    // Backdrop click on all .modal-backdrop
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          closeOverlayById(backdrop.id, { restoreFocus: true });
        }
      });
    });

    // Global Keyboard Handler: Focus Trap + Escape + Shortcuts
    document.addEventListener('keydown', (e) => {
      if (overlayStack.length > 0) {
        const top = overlayStack[overlayStack.length - 1];

        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          closeTopOverlay();
          return;
        }

        if (e.key === 'Tab') {
          const focusables = getFocusableElements(top.boxEl);
          if (focusables.length === 0) {
            e.preventDefault();
            top.boxEl.focus();
            return;
          }
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          const active = document.activeElement;

          if (e.shiftKey) {
            if (active === first || !top.boxEl.contains(active)) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (active === last || !top.boxEl.contains(active)) {
              e.preventDefault();
              first.focus();
            }
          }
          return;
        }
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (canView('pos') && overlayStack.length === 0) {
          e.preventDefault();
          switchView('pos');
          setTimeout(() => document.getElementById('pos-search-input')?.focus(), 60);
        }
        return;
      }

      if (e.key === 'Escape') {
        document.getElementById('user-popover')?.classList.remove('is-open');
        document.getElementById('notif-popover')?.classList.remove('is-open');
        document.getElementById('sidebar-user-btn')?.setAttribute('aria-expanded', 'false');
        document.getElementById('notif-btn')?.setAttribute('aria-expanded', 'false');
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
          return;
        }

        const receiptRow = e.target.closest('.tx[data-open-receipt]');
        if (receiptRow) {
          e.preventDefault();
          receiptRow.click();
          return;
        }

        const queueRow = e.target.closest('.up[data-complete-order]');
        if (queueRow) {
          e.preventDefault();
          queueRow.click();
        }
      }
    });

    // Quick POS Search button
    document.getElementById('side-search-btn')?.addEventListener('click', () => {
      if (!canView('pos')) {
        showToast('Pencarian menu POS hanya tersedia untuk peran Kasir atau Admin.', 'info');
        return;
      }
      switchView('pos');
      setTimeout(() => document.getElementById('pos-search-input')?.focus(), 60);
    });

    // Theme & Local Printer Preferences
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });

    document.getElementById('pref-theme-select')?.addEventListener('change', (e) => {
      applyTheme(e.target.value);
      showToast('Preferensi tema tampilan diperbarui.', 'info');
    });

    const printerSelect = document.getElementById('set-printer-size');
    if (printerSelect) {
      printerSelect.value = STATE.printerSize;
      printerSelect.addEventListener('change', (e) => {
        STATE.printerSize = e.target.value === '58mm' ? '58mm' : '80mm';
        localStorage.setItem('nomcherry_printer_size', STATE.printerSize);
        renderHeaderAndSessionUi();
        renderOverviewWidgets();
        showToast(`Ukuran kertas thermal lokal disetel ke ${STATE.printerSize}.`, 'info');
      });
    }

    // Privacy Toggle
    document.getElementById('priv-toggle-btn')?.addEventListener('click', (e) => {
      const active = document.body.classList.toggle('is-priv');
      e.currentTarget.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    // Popovers
    document.getElementById('sidebar-user-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const pop = document.getElementById('user-popover');
      const isOpen = pop.classList.toggle('is-open');
      e.currentTarget.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      document.getElementById('notif-popover')?.classList.remove('is-open');
      document.getElementById('notif-btn')?.setAttribute('aria-expanded', 'false');
    });

    document.getElementById('notif-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const pop = document.getElementById('notif-popover');
      const isOpen = pop.classList.toggle('is-open');
      e.currentTarget.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      document.getElementById('user-popover')?.classList.remove('is-open');
      document.getElementById('sidebar-user-btn')?.setAttribute('aria-expanded', 'false');
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#user-popover') && !e.target.closest('#sidebar-user-btn')) {
        document.getElementById('user-popover')?.classList.remove('is-open');
        document.getElementById('sidebar-user-btn')?.setAttribute('aria-expanded', 'false');
      }
      if (!e.target.closest('#notif-popover') && !e.target.closest('#notif-btn')) {
        document.getElementById('notif-popover')?.classList.remove('is-open');
        document.getElementById('notif-btn')?.setAttribute('aria-expanded', 'false');
      }
    });

    // Branch Selector (#branch-selector)
    document.getElementById('branch-selector')?.addEventListener('change', async (e) => {
      const selectEl = e.currentTarget;
      const requestedBranch = selectEl.value;

      if (STATE.user.peran === 'kasir' && requestedBranch !== STATE.assignedBranch) {
        selectEl.value = STATE.assignedBranch;
        showToast('Kasir terkunci pada cabang tugas yang ditetapkan.', 'warning');
        return;
      }

      if (requestedBranch === STATE.activeBranch) return;

      if (STATE.cart.length > 0) {
        selectEl.value = STATE.activeBranch;
        const confirmed = await openConfirmDialog({
          title: 'Kosongkan Keranjang & Pindah Cabang?',
          message: `Keranjang kasir saat ini berisi ${STATE.cart.length} menu dari ${getActiveBranchMeta().nama_cabang}. Berpindah cabang akan mereset keranjang agar stok tidak tercampur.`,
          confirmLabel: 'Reset & Pindah Cabang',
          cancelLabel: 'Tetap di Cabang Ini',
          triggerEl: selectEl
        });
        if (!confirmed) {
          selectEl.value = STATE.activeBranch;
          return;
        }
        resetCartState();
      }

      await applyBranchSwitch(requestedBranch);
    });

    // Overview Period Range Segmented Control
    document.querySelectorAll('#ov-range-seg button').forEach(btn => {
      btn.addEventListener('click', async () => {
        const nextRange = btn.dataset.range || 'today';
        if (STATE.overviewRange === nextRange && STATE.dashboard) return;
        document.querySelectorAll('#ov-range-seg button').forEach(b => {
          const active = b === btn;
          b.classList.toggle('is-active', active);
          b.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        STATE.overviewRange = nextRange;
        await syncWithBackend({ background: false });
      });
    });

    // Card Stack Controls
    document.getElementById('cstack-prev')?.addEventListener('click', () => updateCardStack(STATE.cardStackIdx - 1));
    document.getElementById('cstack-next')?.addEventListener('click', () => updateCardStack(STATE.cardStackIdx + 1));
    document.querySelectorAll('#cstack-dots button').forEach(btn => {
      btn.addEventListener('click', () => updateCardStack(Number(btn.dataset.dot)));
    });
    document.querySelectorAll('#cstack-pile .paydeck').forEach(card => {
      card.addEventListener('click', () => updateCardStack(Number(card.dataset.cardIdx)));
    });

    // POS Category Tabs, Search & Photos
    document.querySelectorAll('#pos-category-tabs button').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#pos-category-tabs button').forEach(b => {
          b.classList.toggle('is-active', b === tab);
          b.setAttribute('aria-selected', b === tab ? 'true' : 'false');
        });
        STATE.posCategory = tab.dataset.cat;
        renderPosProducts();
      });
    });

    document.getElementById('pos-search-input')?.addEventListener('input', (e) => {
      STATE.posSearch = e.target.value;
      renderPosProducts();
    });

    document.getElementById('toggle-photo-btn')?.addEventListener('click', (e) => {
      STATE.showPhotos = !STATE.showPhotos;
      e.currentTarget.textContent = STATE.showPhotos ? 'Sembunyikan Foto' : 'Tampilkan Foto';
      renderPosProducts();
    });

    // POS Form & Payment Controls
    document.querySelectorAll('#pos-order-type-seg button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#pos-order-type-seg button').forEach(b => {
          b.classList.toggle('is-active', b === btn);
          b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
        });
        STATE.orderType = btn.dataset.type;
        syncOrderTypeUi();
        invalidatePendingCheckoutIfChanged();
      });
    });

    document.querySelectorAll('#pos-discount-chips button').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#pos-discount-chips button').forEach(c => {
          c.classList.toggle('is-active', c === chip);
          c.setAttribute('aria-pressed', c === chip ? 'true' : 'false');
        });
        STATE.discount = Number(chip.dataset.disc) || 0;
        renderCart();
      });
    });

    document.querySelectorAll('#pos-pay-method-seg button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#pos-pay-method-seg button').forEach(b => {
          b.classList.toggle('is-active', b === btn);
          b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
        });
        STATE.payMethod = btn.dataset.pay;
        syncPaymentMethodUi();
        invalidatePendingCheckoutIfChanged();
      });
    });

    document.querySelectorAll('[data-quick-cash]').forEach(chip => {
      chip.addEventListener('click', () => {
        const { total } = getCartTotals();
        const val = chip.dataset.quickCash === 'exact' ? total : Number(chip.dataset.quickCash);
        STATE.cashManuallyEdited = true;
        const cashEl = document.getElementById('cart-cash-received');
        if (cashEl) cashEl.value = String(val);
        updateCashChange();
        invalidatePendingCheckoutIfChanged();
      });
    });

    ['cart-customer-name', 'cart-table-num', 'cart-delivery-note', 'cart-edc-ref'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => {
        setInlineAlert('pos-checkout-alert', '');
        invalidatePendingCheckoutIfChanged();
      });
    });

    document.getElementById('qris-confirm-check')?.addEventListener('change', () => {
      setInlineAlert('pos-checkout-alert', '');
      invalidatePendingCheckoutIfChanged();
    });

    document.getElementById('cart-cash-received')?.addEventListener('input', () => {
      STATE.cashManuallyEdited = true;
      setInlineAlert('pos-checkout-alert', '');
      updateCashChange();
      invalidatePendingCheckoutIfChanged();
    });

    document.getElementById('clear-cart-btn')?.addEventListener('click', () => {
      resetCartState();
    });

    // Idempotent Checkout Handler
    document.getElementById('checkout-btn')?.addEventListener('click', async (e) => {
      if (STATE.checkoutSubmitting) return;
      const checkoutBtn = e.currentTarget;
      const checkoutLbl = document.getElementById('checkout-btn-label');

      if (STATE.cart.length === 0) {
        const msg = 'Pilih minimal 1 menu sebelum memproses pembayaran.';
        setInlineAlert('pos-checkout-alert', msg, 'error');
        showToast(msg, 'warning');
        return;
      }

      // Client-side expired check before network call
      const expiredInCart = STATE.cart.find(item => {
        const live = STATE.menus.find(m => m.id_menu === item.id_menu);
        return live && live.is_expired;
      });
      if (expiredInCart) {
        const msg = `Menu ${expiredInCart.nama_menu} telah melewati tanggal kedaluwarsa dan diblokir.`;
        setInlineAlert('pos-checkout-alert', msg, 'error');
        showToast(msg, 'error');
        return;
      }

      const { total } = getCartTotals();
      const custName = (document.getElementById('cart-customer-name')?.value || '').trim() || 'Pelanggan Umum';
      const orderType = STATE.orderType || 'Dine-In';
      const tableInput = document.getElementById('cart-table-num');
      const rawTableNum = tableInput ? tableInput.value.trim() : '';
      const deliveryNoteInput = document.getElementById('cart-delivery-note');
      const deliveryNote = deliveryNoteInput ? deliveryNoteInput.value.trim() : '';

      if (orderType === 'Dine-In') {
        if (!rawTableNum || ['-', 'takeaway', 'take away', 'delivery'].includes(rawTableNum.toLowerCase())) {
          const msg = 'Nomor meja wajib diisi untuk pesanan Dine-In.';
          setInlineAlert('pos-checkout-alert', msg, 'error');
          showToast(msg, 'error');
          tableInput?.focus();
          return;
        }
      }

      const method = STATE.payMethod === 'Card' ? 'Debit' : STATE.payMethod;
      let cashReceived = total;
      let edcRef = '';

      if (method === 'Cash') {
        const cashInput = document.getElementById('cart-cash-received');
        const rawCash = cashInput ? cashInput.value.trim() : '';
        const parsedCash = rawCash === '' ? NaN : Number(rawCash);
        if (!Number.isFinite(parsedCash) || parsedCash < total) {
          const msg = `Nominal uang tunai kurang dari total tagihan (${formatRp(total)}).`;
          setInlineAlert('pos-checkout-alert', msg, 'error');
          showToast(msg, 'error');
          cashInput?.focus();
          return;
        }
        cashReceived = parsedCash;
      } else if (method === 'QRIS') {
        const qrisCheck = document.getElementById('qris-confirm-check');
        if (!qrisCheck || !qrisCheck.checked) {
          const msg = 'Centang konfirmasi pemeriksaan bukti pembayaran QRIS terlebih dahulu.';
          setInlineAlert('pos-checkout-alert', msg, 'error');
          showToast(msg, 'error');
          qrisCheck?.focus();
          return;
        }
      } else if (method === 'Debit') {
        const edcInput = document.getElementById('cart-edc-ref');
        edcRef = edcInput ? edcInput.value.trim() : '';
      }

      const requestBody = {
        id_cabang: STATE.activeBranch,
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

      const fingerprint = buildCheckoutPayloadSnapshot();
      if (!STATE.pendingCheckout || STATE.pendingCheckout.fingerprint !== fingerprint) {
        STATE.pendingCheckout = {
          key: generateIdempotencyKey(),
          fingerprint
        };
      }

      setInlineAlert('pos-checkout-alert', '');
      STATE.checkoutSubmitting = true;
      checkoutBtn.disabled = true;
      checkoutBtn.setAttribute('aria-busy', 'true');
      if (checkoutLbl) checkoutLbl.textContent = 'Memproses Transaksi...';

      let serverData = null;
      let isReplay = false;
      try {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': STATE.pendingCheckout.key
          },
          body: JSON.stringify(requestBody)
        });

        if (redirectIfUnauthorized(res)) return;

        const payload = await res.json();
        if (!res.ok || !payload.success || !payload.data) {
          const errMsg = payload.message || 'Transaksi gagal diproses oleh server.';
          if (res.status >= 400 && res.status < 500) {
            STATE.pendingCheckout = null;
            if (payload.code === 'STOCK_CHANGED' || payload.code === 'STOCK_EXPIRED' || payload.code === 'OUT_OF_STOCK') {
              await syncWithBackend({ background: false });
            }
          }
          setInlineAlert('pos-checkout-alert', errMsg, 'error');
          showToast(errMsg, 'error');
          return;
        }

        serverData = payload.data;
        isReplay = Boolean(payload.idempotent_replay);
      } catch (netErr) {
        // Retain STATE.pendingCheckout & STATE.cart so retry uses the same Idempotency-Key safely!
        const netMsg = 'Koneksi terputus sebelum konfirmasi diterima. Keranjang tetap tersimpan — tekan tombol Bayar lagi untuk mengirim ulang tanpa risiko duplikasi.';
        setInlineAlert('pos-checkout-alert', netMsg, 'error');
        showToast('Gagal menghubungi server. Keranjang disimpan untuk kirim ulang aman.', 'error');
        return;
      } finally {
        STATE.checkoutSubmitting = false;
        checkoutBtn.disabled = false;
        checkoutBtn.removeAttribute('aria-busy');
        if (checkoutLbl) checkoutLbl.textContent = 'Bayar & Cetak Struk Thermal';
      }

      // Confirmed success: clear cart & idempotency token
      STATE.pendingCheckout = null;
      STATE.cart = [];
      STATE.cashManuallyEdited = false;
      const custInput = document.getElementById('cart-customer-name');
      if (custInput) custInput.value = 'Pelanggan Umum';
      if (orderType === 'Dine-In') {
        STATE.lastDineInTable = 'Meja 04';
        if (tableInput) tableInput.value = 'Meja 04';
      }
      if (deliveryNoteInput) deliveryNoteInput.value = '';
      const qrisCheck = document.getElementById('qris-confirm-check');
      if (qrisCheck) qrisCheck.checked = false;
      const edcInput = document.getElementById('cart-edc-ref');
      if (edcInput) edcInput.value = '';

      closeMobileCartSheet({ restoreFocus: false });

      const receiptOrder = mapOrderFromApi({
        id_pesanan: serverData.id_pesanan,
        id_cabang: serverData.id_cabang,
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
        tarif_pajak: serverData.tarif_pajak,
        diskon: serverData.diskon,
        total: serverData.total,
        kasir: serverData.kasir,
        receipt: serverData.receipt,
        status: 'completed',
        status_dapur: serverData.status_dapur || 'pending',
        items: (serverData.items || []).map(item => ({
          nama_menu: item.nama_menu,
          jumlah: item.jumlah,
          harga_satuan: item.harga
        }))
      });

      showToast(
        isReplay
          ? `Transaksi dipulihkan tanpa duplikasi (${serverData.nomor_struk}).`
          : `Transaksi berhasil! Struk ${serverData.nomor_struk} diterbitkan.`,
        'success'
      );

      await syncWithBackend({ background: false });
      openReceiptModal(receiptOrder, checkoutBtn);
    });

    // Delegated Clicks
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
        if (STATE.checkoutSubmitting) return;
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
        const orderId = recBtn.dataset.openReceipt;
        let ord = STATE.orderMap.get(orderId) || STATE.orders.find(o => o.id_pesanan === orderId);
        if (!ord || !ord.receipt) {
          try {
            const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`);
            if (redirectIfUnauthorized(res)) return;
            const payload = await res.json();
            if (res.ok && payload.success && payload.data) {
              ord = mapOrderFromApi(payload.data);
              STATE.orderMap.set(orderId, ord);
            }
          } catch (fetchErr) {
            showToast('Gagal mengambil detail struk dari server.', 'error');
            return;
          }
        }
        if (ord) openReceiptModal(ord, recBtn);
        return;
      }

      const compBtn = e.target.closest('[data-complete-order]');
      if (compBtn) {
        const orderId = compBtn.dataset.completeOrder;
        const ord = STATE.orderMap.get(orderId) || STATE.kitchenQueue.find(o => o.id_pesanan === orderId);
        try {
          const res = await fetch('/api/orders/' + encodeURIComponent(orderId) + '/status', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status_dapur: 'served' })
          });
          if (redirectIfUnauthorized(res)) return;
          const data = await res.json();
          if (!res.ok || !data.success) {
            showToast(data.message || 'Gagal memperbarui status antrean dapur.', 'error');
            return;
          }
          await syncWithBackend({ background: false });
          showToast(`Pesanan ${ord ? ord.nama_pelanggan : orderId} selesai disajikan.`, 'success');
        } catch (err) {
          showToast('Gagal memperbarui status dapur: ' + err.message, 'error');
        }
        return;
      }

      const restockBtn = e.target.closest('[data-restock-id]');
      if (restockBtn) {
        openStockAdjustModal(restockBtn.dataset.restockId, 'MASUK', restockBtn);
        return;
      }

      const adjustStockBtn = e.target.closest('[data-adjust-stock]');
      if (adjustStockBtn) {
        openStockAdjustModal(adjustStockBtn.dataset.adjustStock, 'PENYESUAIAN', adjustStockBtn);
        return;
      }

      const restockMenuBtn = e.target.closest('[data-restock-menu]');
      if (restockMenuBtn) {
        openStockAdjustModal(restockMenuBtn.dataset.restockMenu, 'MASUK', restockMenuBtn);
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
          setInlineAlert('menu-modal-error', '');
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
          openModal('menu-crud-modal', editMenuBtn);
        }
        return;
      }

      const deleteMenuBtn = e.target.closest('[data-delete-menu]');
      if (deleteMenuBtn) {
        const m = STATE.menus.find(x => x.id_menu === deleteMenuBtn.dataset.deleteMenu);
        if (!m) return;
        const confirmed = await openConfirmDialog({
          title: 'Hapus / Nonaktifkan Menu?',
          message: `Apakah Anda yakin ingin menghapus atau menonaktifkan "${m.nama_menu}" dari katalog aktif?`,
          confirmLabel: 'Ya, Nonaktifkan',
          cancelLabel: 'Batal',
          triggerEl: deleteMenuBtn
        });
        if (!confirmed) return;

        try {
          const res = await fetch('/api/menu/' + encodeURIComponent(m.id_menu), {
            method: 'DELETE'
          });
          if (redirectIfUnauthorized(res)) return;
          const data = await res.json();
          if (!res.ok || !data.success) {
            showToast(data.message || 'Gagal menghapus menu.', 'error');
            return;
          }
          await syncWithBackend({ background: false });
          showToast(data.message || 'Menu berhasil dinonaktifkan.', 'success');
        } catch (err) {
          showToast('Gagal menghapus menu: ' + err.message, 'error');
        }
      }
    });

    // Orders View Server-Side Filters & Pagination
    document.querySelectorAll('#orders-status-chips button').forEach(btn => {
      btn.addEventListener('click', async () => {
        document.querySelectorAll('#orders-status-chips button').forEach(b => {
          b.classList.toggle('is-active', b === btn);
          b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
        });
        STATE.ordersFilterStatus = btn.dataset.ordStatus;
        STATE.ordersOffset = 0;
        await syncWithBackend({ background: false });
      });
    });

    document.getElementById('orders-pay-select')?.addEventListener('change', async (e) => {
      STATE.ordersFilterPay = e.target.value;
      STATE.ordersOffset = 0;
      await syncWithBackend({ background: false });
    });

    document.getElementById('orders-date-input')?.addEventListener('change', async (e) => {
      STATE.ordersDate = e.target.value;
      STATE.ordersOffset = 0;
      await syncWithBackend({ background: false });
    });

    document.getElementById('orders-search-input')?.addEventListener('input', (e) => {
      STATE.ordersSearch = e.target.value;
      STATE.ordersOffset = 0;
      if (ordersSearchDebounce) clearTimeout(ordersSearchDebounce);
      ordersSearchDebounce = setTimeout(() => {
        syncWithBackend({ background: false });
      }, 240);
    });

    document.getElementById('orders-prev-page')?.addEventListener('click', async () => {
      if (!STATE.ordersPagination.has_prev) return;
      STATE.ordersOffset = Math.max(0, STATE.ordersOffset - STATE.ordersPageLimit);
      await syncWithBackend({ background: false });
    });

    document.getElementById('orders-next-page')?.addEventListener('click', async () => {
      if (!STATE.ordersPagination.has_next) return;
      STATE.ordersOffset += STATE.ordersPageLimit;
      await syncWithBackend({ background: false });
    });

    document.getElementById('orders-refresh-btn')?.addEventListener('click', async () => {
      await syncWithBackend({ background: false });
      showToast('Data pesanan & antrean dapur berhasil disegarkan.', 'info');
    });

    // Catalog Filters & CRUD Modal
    document.querySelectorAll('#catalog-filter-chips button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#catalog-filter-chips button').forEach(b => {
          b.classList.toggle('is-active', b === btn);
          b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
        });
        STATE.catalogCategory = btn.dataset.catFilter;
        renderCatalogView();
      });
    });

    document.getElementById('catalog-search-input')?.addEventListener('input', (e) => {
      STATE.catalogSearch = e.target.value;
      renderCatalogView();
    });

    document.getElementById('add-menu-btn')?.addEventListener('click', (e) => {
      setInlineAlert('menu-modal-error', '');
      document.getElementById('menu-modal-title').textContent = 'Tambah Menu Baru';
      document.getElementById('menu-crud-form').reset();
      document.getElementById('crud-menu-id').value = '';
      openModal('menu-crud-modal', e.currentTarget);
    });

    document.getElementById('close-menu-modal-btn')?.addEventListener('click', () => closeModal('menu-crud-modal'));
    document.getElementById('cancel-menu-modal-btn')?.addEventListener('click', () => closeModal('menu-crud-modal'));

    document.getElementById('menu-crud-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      setInlineAlert('menu-modal-error', '');
      const id = document.getElementById('crud-menu-id').value;
      const minStockEl = document.getElementById('crud-menu-min-stock');
      const expEl = document.getElementById('crud-menu-exp');
      const rawPrice = Number(document.getElementById('crud-menu-price').value);
      const rawStock = Number(document.getElementById('crud-menu-stock').value);

      const payload = {
        id_cabang: STATE.activeBranch,
        nama_menu: document.getElementById('crud-menu-name').value.trim(),
        kategori: document.getElementById('crud-menu-cat').value,
        harga: Number.isFinite(rawPrice) ? rawPrice : 0,
        stok: Number.isFinite(rawStock) ? rawStock : 0,
        min_stok: minStockEl && minStockEl.value !== '' ? Number(minStockEl.value) : 5,
        tanggal_kadaluarsa: expEl && expEl.value ? expEl.value : null,
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
          const msg = data.message || 'Gagal menyimpan menu.';
          setInlineAlert('menu-modal-error', msg, 'error');
          showToast(msg, 'error');
          return;
        }

        closeModal('menu-crud-modal');
        await syncWithBackend({ background: false });
        showToast(id ? 'Menu berhasil diperbarui.' : `Menu baru ditambahkan ke katalog (stok dialokasikan di ${STATE.activeBranch}).`, 'success');
      } catch (err) {
        setInlineAlert('menu-modal-error', 'Gagal menghubungi server: ' + err.message, 'error');
        showToast('Gagal menyimpan menu: ' + err.message, 'error');
      }
    });

    // Inventory Filters, Adjust, Opname & Bulk Restock
    document.querySelectorAll('#inv-status-chips button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#inv-status-chips button').forEach(b => {
          b.classList.toggle('is-active', b === btn);
          b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
        });
        STATE.invFilterStatus = btn.dataset.invStatus;
        renderInventoryView();
      });
    });

    document.getElementById('inv-cat-select')?.addEventListener('change', (e) => {
      STATE.invFilterCat = e.target.value;
      renderInventoryView();
    });

    document.getElementById('inv-search-input')?.addEventListener('input', (e) => {
      STATE.invSearch = e.target.value;
      renderInventoryView();
    });

    document.querySelectorAll('#inv-log-type-chips button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#inv-log-type-chips button').forEach(b => {
          b.classList.toggle('is-active', b === btn);
          b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
        });
        STATE.invLogType = btn.dataset.logType;
        renderInventoryLogs();
      });
    });

    document.getElementById('inv-log-search-input')?.addEventListener('input', (e) => {
      STATE.invLogSearch = e.target.value;
      renderInventoryLogs();
    });

    document.getElementById('adj-movement-type')?.addEventListener('change', () => {
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

    document.getElementById('adj-qty')?.addEventListener('input', updateStockAdjustPreview);
    document.getElementById('close-stock-adjust-btn')?.addEventListener('click', () => closeModal('stock-adjust-modal'));
    document.getElementById('cancel-stock-adjust-btn')?.addEventListener('click', () => closeModal('stock-adjust-modal'));

    document.getElementById('stock-adjust-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      setInlineAlert('adj-modal-error', '');
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
            id_cabang: STATE.activeBranch,
            jenis,
            jumlah,
            min_stok: Number.isInteger(min_stok) && min_stok >= 0 ? min_stok : undefined,
            tanggal_kadaluarsa: tanggal_kadaluarsa || null,
            keterangan
          })
        });
        if (redirectIfUnauthorized(res)) return;
        const data = await res.json();
        if (!res.ok || !data.success) {
          const msg = data.message || 'Gagal menyimpan perubahan stok.';
          setInlineAlert('adj-modal-error', msg, 'error');
          showToast(msg, 'error');
          return;
        }
        closeModal('stock-adjust-modal');
        await syncWithBackend({ background: false });
        showToast(`Stok ${data.data.nama_menu} diperbarui (${data.data.stok_sebelum} → ${data.data.stok_baru} porsi).`, 'success');
      } catch (err) {
        setInlineAlert('adj-modal-error', 'Gagal menghubungi server: ' + err.message, 'error');
        showToast('Gagal menyimpan perubahan stok: ' + err.message, 'error');
      }
    });

    // Stock Opname Modal
    document.getElementById('stock-opname-btn')?.addEventListener('click', (e) => {
      if (STATE.inventory.length === 0) {
        showToast('Belum ada item stok pada cabang ini.', 'warning');
        return;
      }
      openStockOpnameModal(e.currentTarget);
    });

    document.getElementById('opname-items-container')?.addEventListener('input', (e) => {
      if (e.target.matches('[data-opname-input]')) {
        updateOpnameSummary();
      }
    });

    document.getElementById('close-opname-modal-btn')?.addEventListener('click', () => closeModal('stock-opname-modal'));
    document.getElementById('cancel-opname-modal-btn')?.addEventListener('click', () => closeModal('stock-opname-modal'));

    document.getElementById('stock-opname-form')?.addEventListener('submit', async (e) => {
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
            id_cabang: STATE.activeBranch,
            catatan,
            items
          })
        });
        if (redirectIfUnauthorized(res)) return;
        const data = await res.json();
        if (!res.ok || !data.success) {
          showToast(data.message || 'Gagal menyimpan hasil Stock Opname.', 'error');
          return;
        }
        closeModal('stock-opname-modal');
        await syncWithBackend({ background: false });
        showToast(data.message, 'success');
      } catch (err) {
        showToast('Gagal menyimpan Stock Opname: ' + err.message, 'error');
      }
    });

    // Controlled Bulk Restock Modal
    document.getElementById('restock-all-btn')?.addEventListener('click', (e) => {
      if (STATE.inventory.length === 0) {
        showToast('Tidak ada item stok pada cabang ini.', 'warning');
        return;
      }
      openModal('bulk-restock-modal', e.currentTarget);
    });

    document.getElementById('close-bulk-restock-btn')?.addEventListener('click', () => closeModal('bulk-restock-modal'));
    document.getElementById('cancel-bulk-restock-btn')?.addEventListener('click', () => closeModal('bulk-restock-modal'));

    document.getElementById('bulk-restock-form')?.addEventListener('submit', async (e) => {
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
            id_cabang: STATE.activeBranch,
            jumlah,
            only_low_stock: target === 'low',
            tanggal_kadaluarsa: tanggal_kadaluarsa || undefined,
            keterangan
          })
        });
        if (redirectIfUnauthorized(res)) return;
        const data = await res.json();
        if (!res.ok || !data.success) {
          showToast(data.message || 'Gagal melakukan restock massal.', 'error');
          return;
        }
        closeModal('bulk-restock-modal');
        await syncWithBackend({ background: false });
        showToast(data.message, 'success');
      } catch (err) {
        showToast('Gagal melakukan restock massal: ' + err.message, 'error');
      }
    });

    // Reports Date Filter & CSV Export
    document.getElementById('rep-apply-filter-btn')?.addEventListener('click', async () => {
      const ds = document.getElementById('rep-date-start')?.value || '';
      const de = document.getElementById('rep-date-end')?.value || '';
      if (ds && de && ds > de) {
        const msg = 'Tanggal awal laporan tidak boleh melebihi tanggal akhir.';
        setInlineAlert('rep-error-banner', msg, 'error');
        showToast(msg, 'error');
        return;
      }
      setInlineAlert('rep-error-banner', '');
      STATE.reportsDateStart = ds;
      STATE.reportsDateEnd = de;
      await syncWithBackend({ background: false });
    });

    document.getElementById('rep-reset-filter-btn')?.addEventListener('click', async () => {
      const dsEl = document.getElementById('rep-date-start');
      const deEl = document.getElementById('rep-date-end');
      if (dsEl) dsEl.value = '';
      if (deEl) deEl.value = '';
      STATE.reportsDateStart = '';
      STATE.reportsDateEnd = '';
      setInlineAlert('rep-error-banner', '');
      await syncWithBackend({ background: false });
    });

    const triggerCsvExport = () => {
      const params = new URLSearchParams({
        cabang: STATE.activeBranch,
        format: 'csv'
      });
      if (STATE.reportsDateStart) params.set('date_start', STATE.reportsDateStart);
      if (STATE.reportsDateEnd) params.set('date_end', STATE.reportsDateEnd);
      window.location.href = `/api/reports/sales?${params.toString()}`;
      showToast('Mengunduh laporan penjualan CSV...', 'info');
    };
    document.getElementById('export-csv-btn')?.addEventListener('click', triggerCsvExport);
    document.getElementById('reports-export-csv-btn')?.addEventListener('click', triggerCsvExport);

    // Receipt Modal Close & Print
    document.getElementById('close-receipt-btn')?.addEventListener('click', () => closeModal('receipt-modal'));
    document.getElementById('close-receipt-btn-2')?.addEventListener('click', () => closeModal('receipt-modal'));
    document.getElementById('print-receipt-btn')?.addEventListener('click', () => window.print());

    // Password Change Form (All Roles)
    document.getElementById('password-change-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      setInlineAlert('pwd-form-alert', '');
      const currentPassword = document.getElementById('pwd-current').value;
      const newPassword = document.getElementById('pwd-new').value;
      const confirmPassword = document.getElementById('pwd-confirm').value;

      if (!currentPassword || !newPassword) {
        setInlineAlert('pwd-form-alert', 'Kata sandi saat ini dan kata sandi baru wajib diisi.', 'error');
        return;
      }
      if (newPassword.length < 8) {
        setInlineAlert('pwd-form-alert', 'Kata sandi baru minimal 8 karakter.', 'error');
        return;
      }
      if (newPassword !== confirmPassword) {
        setInlineAlert('pwd-form-alert', 'Konfirmasi kata sandi baru tidak cocok.', 'error');
        return;
      }

      const btn = document.getElementById('submit-pwd-btn');
      if (btn) btn.disabled = true;
      try {
        const res = await fetch('/api/auth/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kata_sandi_lama: currentPassword,
            kata_sandi_baru: newPassword
          })
        });
        if (redirectIfUnauthorized(res)) return;
        const data = await res.json();
        if (!res.ok || !data.success) {
          const msg = data.message || 'Gagal memperbarui kata sandi.';
          setInlineAlert('pwd-form-alert', msg, 'error');
          showToast(msg, 'error');
          return;
        }
        document.getElementById('password-change-form').reset();
        setInlineAlert('pwd-form-alert', 'Kata sandi berhasil diperbarui. Sesi di perangkat lain telah dicabut.', 'good');
        showToast('Kata sandi berhasil diperbarui.', 'success');
      } catch (err) {
        setInlineAlert('pwd-form-alert', 'Gagal menghubungi server: ' + err.message, 'error');
        showToast('Gagal memperbarui kata sandi: ' + err.message, 'error');
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    // Business & Branch Settings Form (Role-Gated)
    document.getElementById('settings-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!STATE.settingsPermissions.can_edit_business && !STATE.settingsPermissions.can_edit_branch) {
        showToast('Peran Anda tidak berwenang mengubah konfigurasi bisnis.', 'warning');
        return;
      }

      const payload = {
        cafe_name: document.getElementById('set-cafe-name').value.trim(),
        tax_rate: Number(document.getElementById('set-tax-rate').value),
        receipt_footer: document.getElementById('set-receipt-footer').value.trim()
      };

      if (!Number.isFinite(payload.tax_rate) || payload.tax_rate < 0 || payload.tax_rate > 25) {
        showToast('Tarif pajak harus bernilai antara 0% hingga 25%.', 'error');
        return;
      }

      if (STATE.settingsPermissions.can_edit_branch) {
        payload.id_cabang = STATE.activeBranch;
        payload.branch_name = document.getElementById('set-branch-name').value.trim();
        payload.branch_phone = document.getElementById('set-branch-phone').value.trim();
        payload.branch_address = document.getElementById('set-branch-addr').value.trim();
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
          showToast(data.message || 'Gagal menyimpan konfigurasi.', 'error');
          return;
        }
        STATE.taxRate = Number(data.data.tax_rate);
        await loadBranches();
        await loadSettings();
        renderAll();
        showToast('Konfigurasi bisnis berhasil disimpan untuk transaksi berikutnya.', 'success');
      } catch (err) {
        showToast('Gagal menyimpan pengaturan: ' + err.message, 'error');
      }
    });

    // Logout Handlers
    const performLogout = async (e) => {
      if (e) e.preventDefault();
      if (pollTimerId) clearTimeout(pollTimerId);
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch (err) {}
      localStorage.removeItem('nomcherry_session');
      sessionStorage.removeItem('nomcherry_active_branch');
      window.location.href = 'login.html';
    };
    document.getElementById('settings-logout-btn')?.addEventListener('click', performLogout);
    document.getElementById('logout-btn')?.addEventListener('click', performLogout);

    // Online / Offline & Visibility Listeners
    window.addEventListener('online', () => {
      STATE.isOnline = true;
      updateSyncStatusIndicator('syncing');
      syncWithBackend({ background: true });
    });
    window.addEventListener('offline', () => {
      STATE.isOnline = false;
      updateSyncStatusIndicator('offline');
      showToast('Koneksi jaringan terputus. Perubahan belum dapat dikirim ke server.', 'warning');
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && STATE.isOnline) {
        syncWithBackend({ background: true });
      }
    });
  }

  async function ensureSession() {
    try {
      const res = await fetch('/api/auth/session');
      if (!res.ok) {
        localStorage.removeItem('nomcherry_session');
        window.location.href = 'login.html';
        return null;
      }
      const payload = await res.json();
      if (!payload.success || !payload.data) {
        localStorage.removeItem('nomcherry_session');
        window.location.href = 'login.html';
        return null;
      }
      localStorage.setItem('nomcherry_session', JSON.stringify(payload.data));
      return payload.data;
    } catch (e) {
      window.location.href = 'login.html';
      return null;
    }
  }

  /* ============================================================
     11. BOOTSTRAP APPLICATION
     ============================================================ */
  const savedTheme = localStorage.getItem('nomcherry_theme');
  applyTheme(savedTheme === 'dark' ? 'dark' : 'light');

  (async function boot() {
    const sessionUser = await ensureSession();
    if (!sessionUser) return;

    await loadBranches();
    hydrateSessionOnce(sessionUser);
    populateBranchSelector();
    renderHeaderAndSessionUi();
    bindEvents();

    // Support initial URL hash navigation if permitted
    const initialHash = (window.location.hash || '').replace('#', '').trim();
    if (initialHash && canView(initialHash)) {
      switchView(initialHash);
    }

    await loadSettings();
    await syncWithBackend({ background: false });
    scheduleBackgroundPoll();
  })();
})();
