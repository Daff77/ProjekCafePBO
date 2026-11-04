/**
 * Main Application Orchestrator for NomCherry Café
 * SPA Router, Session Management, Parley Navigation, and Role Permissions
 */

const App = {
    currentUser: null,
    currentCabang: 'CBG001',
    activeRoute: 'dashboard',

    init() {
        this.loadSession();
        this.setupNavigation();
        this.setupGlobalEvents();
        this.updateHeaderGreeting();
        this.setupKeyboardShortcuts();

        // Check hash or default
        const hash = window.location.hash.replace('#/', '') || 'dashboard';
        this.navigate(hash);
    },

    loadSession() {
        const stored = localStorage.getItem('nomcherry_user');
        if (stored) {
            try {
                this.currentUser = JSON.parse(stored);
                this.currentCabang = this.currentUser.id_cabang || 'CBG001';
            } catch (e) {
                this.currentUser = null;
            }
        }

        // If no user, fallback to Admin or show Login
        if (!this.currentUser) {
            this.currentUser = {
                id_pengguna: 'USR001',
                nama_pengguna: 'Admin Utama',
                username: 'admin',
                peran: 'admin',
                id_cabang: 'CBG001',
                nama_cabang: 'NomCherry Pusat (Jemur)'
            };
            localStorage.setItem('nomcherry_user', JSON.stringify(this.currentUser));
        }

        this.updateUserUI();
    },

    updateUserUI() {
        if (!this.currentUser) return;

        // Avatar initial
        const avatarEl = document.getElementById('user-avatar');
        if (avatarEl) {
            const initials = this.currentUser.nama_pengguna
                .split(' ')
                .map(n => n[0])
                .slice(0, 2)
                .join('')
                .toUpperCase();
            avatarEl.textContent = initials || 'NC';
            avatarEl.title = `${this.currentUser.nama_pengguna} (${this.currentUser.peran.toUpperCase()})`;
        }

        // Branch selector sync
        const branchSelect = document.getElementById('branch-select');
        if (branchSelect) {
            branchSelect.value = this.currentCabang;
        }

        // Role-based Nav Item Visibility
        const role = this.currentUser.peran;
        document.querySelectorAll('[data-role-guard]').forEach(el => {
            const allowed = el.getAttribute('data-role-guard').split(',');
            if (allowed.includes(role) || role === 'admin' || role === 'owner') {
                el.style.display = '';
            } else {
                el.style.display = 'none';
            }
        });
    },

    updateHeaderGreeting() {
        const titleEl = document.getElementById('page-title');
        const subEl = document.getElementById('page-sub');
        if (!titleEl) return;

        const hour = new Date().getHours();
        let greeting = 'Selamat Datang';
        if (hour >= 4 && hour < 11) greeting = 'Selamat Pagi';
        else if (hour >= 11 && hour < 15) greeting = 'Selamat Siang';
        else if (hour >= 15 && hour < 18) greeting = 'Selamat Sore';
        else greeting = 'Selamat Malam';

        const firstName = this.currentUser ? this.currentUser.nama_pengguna.split(' ')[0] : 'Tim';
        titleEl.innerHTML = `${greeting}, <span style="color:var(--c-cherry);">${firstName}</span>`;

        const cabangName = this.currentCabang === 'CBG002' ? 'Cabang Timur (Rungkut)' : 'Cabang Pusat (Jemur)';
        if (subEl) {
            subEl.textContent = `Operasional & Kasir NomCherry Café — ${cabangName}`;
        }
    },

    setupNavigation() {
        // Rail toggle
        const toggleBtn = document.getElementById('rail-toggle');
        const appRoot = document.getElementById('app-root');
        if (toggleBtn && appRoot) {
            toggleBtn.addEventListener('click', () => {
                appRoot.classList.toggle('is-rail-expanded');
                const isExpanded = appRoot.classList.contains('is-rail-expanded');
                toggleBtn.setAttribute('aria-expanded', isExpanded);
                this.updateRailPill();
            });
        }

        // Rail links
        document.querySelectorAll('.rail__item[data-route]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const route = link.getAttribute('data-route');
                this.navigate(route);
            });
        });

        // Window resize adjusts pill
        window.addEventListener('resize', () => this.updateRailPill());

        // Hash change listener
        window.addEventListener('hashchange', () => {
            const hash = window.location.hash.replace('#/', '') || 'dashboard';
            if (hash !== this.activeRoute) {
                this.navigate(hash);
            }
        });
    },

    setupGlobalEvents() {
        // Branch switcher
        const branchSelect = document.getElementById('branch-select');
        if (branchSelect) {
            branchSelect.addEventListener('change', (e) => {
                const newCabang = e.target.value;
                // If kasir tries to switch to unauthorized branch
                if (this.currentUser.peran === 'kasir' && this.currentUser.id_cabang !== newCabang) {
                    this.showToast('Kasir hanya dapat mengakses cabang tugas terdaftar!', 'error');
                    branchSelect.value = this.currentCabang;
                    return;
                }

                this.currentCabang = newCabang;
                this.updateHeaderGreeting();
                this.showToast(`Beralih ke ${newCabang === 'CBG001' ? 'Cabang Pusat' : 'Cabang Timur'}`, 'success');

                // Reload current active view data
                this.renderActiveView();
            });
        }

        // User avatar dropdown / click to switch role modal
        const avatarBtn = document.getElementById('account-btn');
        if (avatarBtn) {
            avatarBtn.addEventListener('click', () => {
                this.openRoleSwitcherModal();
            });
        }
    },

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Cmd+K or Ctrl+K opens quick command / search
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                this.openQuickSearchModal();
            }
            // Escape closes modals
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal-backdrop.is-open').forEach(m => {
                    m.classList.remove('is-open');
                });
            }
        });

        const searchInput = document.getElementById('top-search');
        if (searchInput) {
            searchInput.addEventListener('click', () => {
                this.openQuickSearchModal();
            });
        }
    },

    navigate(route) {
        // Permission check for kasir
        if (this.currentUser && this.currentUser.peran === 'kasir') {
            if (['stock', 'reports', 'users'].includes(route)) {
                this.showToast('Akses ditolak: Hanya Manager/Admin yang dapat membuka menu ini', 'error');
                route = 'pos';
            }
        }

        this.activeRoute = route;
        window.location.hash = `#/${route}`;

        // Update active class on rail
        document.querySelectorAll('.rail__item[data-route]').forEach(link => {
            if (link.getAttribute('data-route') === route) {
                link.classList.add('is-active');
                this.updateRailPill(link);
            } else {
                link.classList.remove('is-active');
            }
        });

        // Show/hide view sections
        document.querySelectorAll('.view-section').forEach(sec => {
            if (sec.id === `view-${route}`) {
                sec.style.display = 'block';
            } else {
                sec.style.display = 'none';
            }
        });

        // Render view specific logic
        this.renderActiveView();
    },

    updateRailPill(targetEl) {
        const item = targetEl || document.querySelector('.rail__item.is-active');
        const pill = document.getElementById('rail-pill');
        if (item && pill) {
            const top = item.offsetTop;
            pill.style.transform = `translateY(${top}px)`;
            pill.style.opacity = '1';
        }
    },

    renderActiveView() {
        switch (this.activeRoute) {
            case 'dashboard':
                if (window.DashboardModule) window.DashboardModule.load();
                break;
            case 'pos':
                if (window.PosModule) window.PosModule.load();
                break;
            case 'orders':
                if (window.PosModule) window.PosModule.loadOrders();
                break;
            case 'menu':
                if (window.MenuModule) window.MenuModule.load();
                break;
            case 'stock':
                if (window.StockModule) window.StockModule.load();
                break;
            case 'reports':
                if (window.ReportsModule) window.ReportsModule.load();
                break;
            case 'users':
                if (window.UsersModule) window.UsersModule.load();
                break;
        }
    },

    showToast(message, type = 'success') {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast is-${type}`;
        const icon = type === 'success' ? '✓' : (type === 'error' ? '✕' : 'ℹ');
        toast.innerHTML = `<span style="font-size:1.1rem">${icon}</span> <span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 300);
        }, 3200);
    },

    formatRupiah(num) {
        return 'Rp ' + Number(num || 0).toLocaleString('id-ID');
    },

    formatDateTime(isoStr) {
        if (!isoStr) return '-';
        const d = new Date(isoStr);
        return d.toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    openQuickSearchModal() {
        const modal = document.getElementById('modal-quick-search');
        if (modal) {
            modal.classList.add('is-open');
            const input = document.getElementById('quick-search-input');
            if (input) {
                input.value = '';
                input.focus();
                this.renderQuickSearchResults('');
            }
        }
    },

    renderQuickSearchResults(term) {
        const list = document.getElementById('quick-search-list');
        if (!list) return;

        const defaultActions = [
            { title: 'Buka Kasir / POS Baru', desc: 'Mulai input transaksi pemesanan menu', action: () => this.navigate('pos'), icon: '🛒' },
            { title: 'Lihat Laporan Penjualan', desc: 'Rekapitulasi omzet dan ekspor laporan', action: () => this.navigate('reports'), icon: '📊' },
            { title: 'Tambah Menu Makanan/Minuman', desc: 'Input menu baru ke katalog kafe', action: () => { this.navigate('menu'); if (window.MenuModule) window.MenuModule.openCreateModal(); }, icon: '➕' },
            { title: 'Cek Status Stok & Kadaluarsa', desc: 'Pantau ketersediaan bahan baku kafe', action: () => this.navigate('stock'), icon: '📦' },
            { title: 'Riwayat Transaksi Struk', desc: 'Cetak ulang struk dan riwayat kasir', action: () => this.navigate('orders'), icon: '🧾' },
            { title: 'Ganti Peran / Switch User', desc: 'Masuk sebagai Admin, Kasir, Manager, Owner', action: () => this.openRoleSwitcherModal(), icon: '👤' }
        ];

        let filtered = defaultActions;
        if (term.trim() !== '') {
            const t = term.toLowerCase();
            filtered = defaultActions.filter(a => a.title.toLowerCase().includes(t) || a.desc.toLowerCase().includes(t));
        }

        list.innerHTML = filtered.map((a, idx) => `
            <div class="search-item" data-idx="${idx}" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;cursor:pointer;transition:background 0.15s;border:1px solid transparent;">
                <span style="font-size:1.4rem;">${a.icon}</span>
                <div style="flex:1;">
                    <div style="font-weight:700;color:var(--ink);font-size:0.92rem;">${a.title}</div>
                    <div style="font-size:0.78rem;color:var(--ink-3);">${a.desc}</div>
                </div>
                <span style="font-size:0.75rem;color:var(--ink-muted);">Enter ↵</span>
            </div>
        `).join('');

        list.querySelectorAll('.search-item').forEach((item, idx) => {
            item.addEventListener('click', () => {
                filtered[idx].action();
                document.getElementById('modal-quick-search').classList.remove('is-open');
            });
            item.addEventListener('mouseenter', () => {
                item.style.background = 'var(--surface-2)';
                item.style.borderColor = 'var(--line)';
            });
            item.addEventListener('mouseleave', () => {
                item.style.background = 'transparent';
                item.style.borderColor = 'transparent';
            });
        });
    },

    openRoleSwitcherModal() {
        const modal = document.getElementById('modal-role-switcher');
        if (modal) {
            modal.classList.add('is-open');
        }
    },

    switchUser(username, password, cabang) {
        API.login({ username, kata_sandi: password, id_cabang: cabang })
            .then(res => {
                this.currentUser = res.data;
                this.currentCabang = res.data.id_cabang;
                localStorage.setItem('nomcherry_user', JSON.stringify(this.currentUser));
                this.updateUserUI();
                this.updateHeaderGreeting();
                this.showToast(`Berhasil masuk sebagai ${res.data.nama_pengguna} (${res.data.peran.toUpperCase()})`, 'success');
                document.querySelectorAll('.modal-backdrop.is-open').forEach(m => m.classList.remove('is-open'));
                this.navigate('dashboard');
            })
            .catch(err => {
                this.showToast(err.message, 'error');
            });
    }
};

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());

