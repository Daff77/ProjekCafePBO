/**
 * Point of Sale (POS) & Order History Module for NomCherry Café
 * Implements Test Cases 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3
 */

const PosModule = {
    menuCatalog: [],
    cart: [],
    selectedCategory: 'Semua',
    searchQuery: '',
    selectedPaymentMethod: 'Cash',
    currentReceiptData: null,

    async load() {
        await this.loadMenu();
        this.renderCatalog();
        this.renderCart();
    },

    async loadMenu() {
        try {
            const res = await API.getMenu({ cabang: App.currentCabang });
            if (res && res.success && Array.isArray(res.data)) {
                this.menuCatalog = res.data;
            } else {
                this.menuCatalog = [];
            }
        } catch (err) {
            console.error('Failed to load menu catalog:', err);
            this.menuCatalog = [];
        }
    },

    setCategory(cat) {
        this.selectedCategory = cat;
        document.querySelectorAll('.cat-tab').forEach(tab => {
            if (tab.getAttribute('data-cat') === cat) {
                tab.classList.add('is-active');
            } else {
                tab.classList.remove('is-active');
            }
        });
        this.renderCatalog();
    },

    setSearch(term) {
        this.searchQuery = term.toLowerCase().trim();
        this.renderCatalog();
    },

    renderCatalog() {
        const grid = document.getElementById('pos-menu-grid');
        if (!grid) return;

        let filtered = this.menuCatalog;
        if (this.selectedCategory !== 'Semua') {
            filtered = filtered.filter(m => m.kategori === this.selectedCategory);
        }
        if (this.searchQuery !== '') {
            filtered = filtered.filter(m =>
                m.nama_menu.toLowerCase().includes(this.searchQuery) ||
                (m.deskripsi && m.deskripsi.toLowerCase().includes(this.searchQuery))
            );
        }

        if (filtered.length === 0) {
            grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--ink-muted);">Tidak ada menu ditemukan.</div>';
            return;
        }

        grid.innerHTML = filtered.map(m => {
            const isOutOfStock = m.stok <= 0;
            const isLowStock = m.stok > 0 && m.stok <= 5;
            const badgeClass = isOutOfStock ? 'is-empty' : (isLowStock ? 'is-low' : '');
            const badgeText = isOutOfStock ? 'Habis' : (isLowStock ? `Sisa ${m.stok}` : `${m.stok} Ready`);
            const isImageUrl = m.gambar && (m.gambar.startsWith('http') || m.gambar.startsWith('assets/'));
            const imgHtml = isImageUrl
                ? `<img class="menu-card__img" src="${m.gambar}" alt="${m.nama_menu}" loading="lazy" onerror="this.onerror=null;this.src='assets/logo.png'">`
                : `<div style="display:grid;place-items:center;height:100%;font-size:3rem;background:#f5eedf;">${m.gambar || '☕'}</div>`;

            return `
                <div class="menu-card ${isOutOfStock ? 'is-out-of-stock' : ''}" onclick="PosModule.addToCart('${m.id_menu}')" title="Klik untuk menambah ke keranjang">
                    <div class="menu-card__thumb">
                        ${imgHtml}
                        <span class="menu-card__tag">${m.kategori}</span>
                        <span class="menu-card__badge ${badgeClass}">${badgeText}</span>
                    </div>
                    <div class="menu-card__body">
                        <div>
                            <h3 class="menu-card__name">${m.nama_menu}</h3>
                            <p class="menu-card__desc">${m.deskripsi || 'Menu racikan barista & dapur NomCherry Café.'}</p>
                        </div>
                        <div class="menu-card__foot">
                            <span class="menu-card__price">${App.formatRupiah(m.harga)}</span>
                            <button class="menu-card__add-btn" type="button" aria-label="Tambah" ${isOutOfStock ? 'disabled' : ''}>+</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    // Test Case 3.1 & 3.2: Tambah item ke keranjang & Validasi Stok Habis
    addToCart(idMenu) {
        const item = this.menuCatalog.find(m => m.id_menu === idMenu);
        if (!item) return;

        // Test Case 3.2: Tambah item stok habis -> Error "Stok habis"
        if (item.stok <= 0) {
            App.showToast(`Gagal: Stok untuk ${item.nama_menu} habis!`, 'error');
            return;
        }

        const existing = this.cart.find(c => c.id_menu === idMenu);
        if (existing) {
            // Test Case 3.3: Update qty melebihi stok -> Error "Stok tidak cukup"
            if (existing.qty + 1 > item.stok) {
                App.showToast(`Gagal: Stok tidak cukup! Maksimal ${item.stok} porsi.`, 'error');
                return;
            }
            existing.qty += 1;
        } else {
            this.cart.push({
                id_menu: item.id_menu,
                nama_menu: item.nama_menu,
                harga: item.harga,
                gambar: item.gambar,
                stok_maks: item.stok,
                qty: 1
            });
        }

        App.showToast(`${item.nama_menu} ditambahkan ke keranjang`, 'success');
        this.renderCart();
    },

    // Test Case 3.3: Update Qty
    updateCartQty(idMenu, delta) {
        const item = this.cart.find(c => c.id_menu === idMenu);
        if (!item) return;

        const newQty = item.qty + delta;
        if (newQty <= 0) {
            this.removeFromCart(idMenu);
            return;
        }

        if (newQty > item.stok_maks) {
            App.showToast(`Gagal: Stok tidak cukup! Tersedia ${item.stok_maks} porsi.`, 'error');
            return;
        }

        item.qty = newQty;
        this.renderCart();
    },

    // Test Case 3.4: Hapus item dari keranjang
    removeFromCart(idMenu) {
        this.cart = this.cart.filter(c => c.id_menu !== idMenu);
        this.renderCart();
    },

    clearCart() {
        this.cart = [];
        this.renderCart();
    },

    getCartCalculations() {
        const subtotal = this.cart.reduce((sum, item) => sum + (item.harga * item.qty), 0);
        const discountInput = document.getElementById('cart-discount-input');
        const diskon = discountInput ? (parseFloat(discountInput.value) || 0) : 0;
        const taxable = Math.max(0, subtotal - diskon);
        const pajak = Math.round(taxable * 0.10); // 10% PB1
        const grandTotal = taxable + pajak;
        return { subtotal, diskon, pajak, grandTotal };
    },

    renderCart() {
        const container = document.getElementById('cart-items-list');
        const countBadge = document.getElementById('cart-item-count');
        const btnCheckout = document.getElementById('btn-checkout');
        if (!container) return;

        const totalItems = this.cart.reduce((sum, i) => sum + i.qty, 0);
        if (countBadge) countBadge.textContent = `${totalItems} Item`;

        if (this.cart.length === 0) {
            container.innerHTML = `
                <div class="cart-empty">
                    <svg viewBox="0 0 24 24" width="40" height="40" stroke="currentColor" stroke-width="1.5" fill="none"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
                    <p style="margin:4px 0;font-weight:600;">Keranjang Masih Kosong</p>
                    <span style="font-size:0.75rem;">Klik menu di sebelah kiri untuk menambahkan</span>
                </div>
            `;
            if (btnCheckout) btnCheckout.disabled = true;
        } else {
            container.innerHTML = this.cart.map(c => `
                <div class="cart-item">
                    <div class="cart-item__info">
                        <div class="cart-item__name">${c.nama_menu}</div>
                        <div class="cart-item__sub">${App.formatRupiah(c.harga)} × ${c.qty} = <b>${App.formatRupiah(c.harga * c.qty)}</b></div>
                    </div>
                    <div class="cart-item__stepper">
                        <button class="step-btn" onclick="PosModule.updateCartQty('${c.id_menu}', -1)">−</button>
                        <span class="cart-item__qty">${c.qty}</span>
                        <button class="step-btn" onclick="PosModule.updateCartQty('${c.id_menu}', 1)">+</button>
                        <button class="btn-icon is-delete" onclick="PosModule.removeFromCart('${c.id_menu}')" title="Hapus">
                            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                </div>
            `).join('');
            if (btnCheckout) btnCheckout.disabled = false;
        }

        const calc = this.getCartCalculations();
        const subtotalEl = document.getElementById('cart-subtotal');
        const taxEl = document.getElementById('cart-tax');
        const totalEl = document.getElementById('cart-grand-total');

        if (subtotalEl) subtotalEl.textContent = App.formatRupiah(calc.subtotal);
        if (taxEl) taxEl.textContent = App.formatRupiah(calc.pajak);
        if (totalEl) totalEl.textContent = App.formatRupiah(calc.grandTotal);
    },

    // Test Case 4.1 & 4.2: Open Checkout / Payment Modal
    openPaymentModal() {
        // Test Case 4.2: Checkout dengan keranjang kosong -> Error "Keranjang kosong"
        if (this.cart.length === 0) {
            App.showToast('Gagal: Keranjang kosong!', 'error');
            return;
        }

        const calc = this.getCartCalculations();
        const modal = document.getElementById('modal-payment');
        if (!modal) return;

        document.getElementById('pay-total-display').textContent = App.formatRupiah(calc.grandTotal);
        document.getElementById('pay-cash-input').value = calc.grandTotal;

        this.setPaymentMethod('Cash');
        this.updateCashChange();
        modal.classList.add('is-open');
    },

    setPaymentMethod(method) {
        this.selectedPaymentMethod = method;
        document.querySelectorAll('.pay-btn').forEach(btn => {
            if (btn.getAttribute('data-method') === method) {
                btn.classList.add('is-selected');
            } else {
                btn.classList.remove('is-selected');
            }
        });

        const cashArea = document.getElementById('pay-cash-area');
        const qrisArea = document.getElementById('pay-qris-area');
        const transferArea = document.getElementById('pay-transfer-area');

        if (cashArea) cashArea.style.display = method === 'Cash' ? 'block' : 'none';
        if (qrisArea) qrisArea.style.display = method === 'QRIS' ? 'flex' : 'none';
        if (transferArea) transferArea.style.display = (method === 'Debit' || method === 'Transfer') ? 'block' : 'none';
    },

    fillCashInput(amount) {
        const input = document.getElementById('pay-cash-input');
        if (input) {
            input.value = amount;
            this.updateCashChange();
        }
    },

    updateCashChange() {
        const calc = this.getCartCalculations();
        const input = document.getElementById('pay-cash-input');
        const changeEl = document.getElementById('pay-change-display');
        if (!input || !changeEl) return;

        const val = parseFloat(input.value) || 0;
        const change = val - calc.grandTotal;

        if (change < 0) {
            changeEl.textContent = `Kurang Rp ${Math.abs(change).toLocaleString('id-ID')}`;
            changeEl.style.color = 'var(--bad)';
        } else {
            changeEl.textContent = App.formatRupiah(change);
            changeEl.style.color = 'var(--good)';
        }
    },

    // Test Case 4.1: Confirm Payment & Create Order
    async processCheckout() {
        const calc = this.getCartCalculations();
        const customerInput = document.getElementById('cart-customer-input');
        const tableInput = document.getElementById('cart-table-input');
        const cashInput = document.getElementById('pay-cash-input');

        const receivedVal = this.selectedPaymentMethod === 'Cash' ? (parseFloat(cashInput.value) || 0) : calc.grandTotal;

        if (this.selectedPaymentMethod === 'Cash' && receivedVal < calc.grandTotal) {
            App.showToast('Nominal uang tunai kurang dari total tagihan!', 'error');
            return;
        }

        const payload = {
            id_pengguna: App.currentUser.id_pengguna,
            id_cabang: App.currentCabang,
            nama_pelanggan: customerInput ? customerInput.value.trim() : 'Pelanggan Umum',
            nomor_meja: tableInput ? tableInput.value.trim() : 'Take Away',
            items: this.cart.map(c => ({
                id_menu: c.id_menu,
                jumlah: c.qty
            })),
            metode_pembayaran: this.selectedPaymentMethod,
            nominal_diterima: receivedVal,
            diskon: calc.diskon
        };

        try {
            const res = await API.createOrder(payload);
            if (res.success) {
                App.showToast('Transaksi Berhasil! Mencetak struk...', 'success');

                // Close payment modal
                document.getElementById('modal-payment').classList.remove('is-open');

                // Clear cart
                this.cart = [];
                this.renderCart();
                if (customerInput) customerInput.value = '';
                if (tableInput) tableInput.value = '';

                // Reload menu to update stock counts immediately
                await this.loadMenu();
                this.renderCatalog();

                // Test Case 5.1, 5.2, 5.3: Show Thermal Receipt
                this.showReceiptData(res.data);
            }
        } catch (err) {
            App.showToast(err.message, 'error');
        }
    },

    // Test Case 5.1, 5.2, 5.3: Receipt Preview & Printing
    showReceiptData(data) {
        this.currentReceiptData = data;
        const modal = document.getElementById('modal-receipt');
        const content = document.getElementById('receipt-print-area');
        if (!modal || !content) return;

        const dateStr = App.formatDateTime(data.tanggal);

        content.innerHTML = `
            <div class="receipt-wrapper">
                <div class="receipt-header">
                    <img src="assets/logo.png" class="receipt-logo" alt="NomCherry" onerror="this.onerror=null;this.src='nomcherry-logo.png'">
                    <div class="receipt-brand">NOMCHERRY CAFÉ</div>
                    <div class="receipt-slogan">Sweet Moments, Perfect Sips</div>
                    <div class="receipt-sub" style="margin-top:6px;"><b>${data.cabang.nama_cabang}</b></div>
                    <div class="receipt-sub">${data.cabang.alamat}</div>
                    <div class="receipt-sub">Telp: ${data.cabang.no_telp}</div>
                </div>

                <hr class="receipt-divider double">

                <div style="font-size:0.75rem;display:flex;justify-content:space-between;line-height:1.4;">
                    <span>No: <b>${data.nomor_struk}</b></span>
                    <span><b>${data.nomor_meja}</b></span>
                </div>
                <div style="font-size:0.75rem;display:flex;justify-content:space-between;line-height:1.4;">
                    <span>Tgl: ${dateStr}</span>
                    <span>Kasir: ${data.kasir}</span>
                </div>
                <div style="font-size:0.75rem;line-height:1.4;">Plg: <b>${data.pelanggan}</b></div>

                <hr class="receipt-divider">

                <table class="receipt-table">
                    ${data.items.map(it => `
                        <tr>
                            <td colspan="2" class="item-name">${it.nama_menu}</td>
                        </tr>
                        <tr>
                            <td class="item-calc">${it.jumlah} × Rp ${Number(it.harga || it.harga_satuan).toLocaleString('id-ID')}</td>
                            <td class="text-right" style="font-weight:700;">Rp ${Number(it.subtotal).toLocaleString('id-ID')}</td>
                        </tr>
                    `).join('')}
                </table>

                <hr class="receipt-divider">

                <table class="receipt-table" style="font-size:0.8rem;">
                    <tr>
                        <td>Subtotal</td>
                        <td class="text-right">Rp ${Number(data.subtotal).toLocaleString('id-ID')}</td>
                    </tr>
                    ${data.diskon > 0 ? `
                        <tr>
                            <td>Diskon Promo</td>
                            <td class="text-right" style="color:#b3261e;font-weight:600;">- Rp ${Number(data.diskon).toLocaleString('id-ID')}</td>
                        </tr>
                    ` : ''}
                    <tr>
                        <td>PB1 Resto (10%)</td>
                        <td class="text-right">Rp ${Number(data.pajak).toLocaleString('id-ID')}</td>
                    </tr>
                    <tr class="total-row">
                        <td style="padding-top:6px;border-top:1px dashed #444;">TOTAL</td>
                        <td class="text-right" style="padding-top:6px;border-top:1px dashed #444;color:var(--c-cherry);">Rp ${Number(data.total).toLocaleString('id-ID')}</td>
                    </tr>
                    <tr>
                        <td style="padding-top:6px;">Metode Bayar</td>
                        <td class="text-right" style="padding-top:6px;font-weight:600;">${data.metode}</td>
                    </tr>
                    <tr>
                        <td>Nominal Diterima</td>
                        <td class="text-right">Rp ${Number(data.nominal_diterima).toLocaleString('id-ID')}</td>
                    </tr>
                    <tr style="font-weight:bold;">
                        <td>Kembalian</td>
                        <td class="text-right" style="color:var(--good);">Rp ${Number(data.kembalian).toLocaleString('id-ID')}</td>
                    </tr>
                </table>

                <div class="receipt-info-pill">
                    📶 Wi-Fi: <b>NomCherry-Guest</b> · Pass: <b>cherrycoffee</b>
                </div>

                <div class="receipt-barcode">
                    <svg viewBox="0 0 100 20" preserveAspectRatio="none">
                        <line x1="5" y1="0" x2="5" y2="20" stroke="#000" stroke-width="2"/>
                        <line x1="10" y1="0" x2="10" y2="20" stroke="#000" stroke-width="1"/>
                        <line x1="13" y1="0" x2="13" y2="20" stroke="#000" stroke-width="3"/>
                        <line x1="19" y1="0" x2="19" y2="20" stroke="#000" stroke-width="1"/>
                        <line x1="23" y1="0" x2="23" y2="20" stroke="#000" stroke-width="4"/>
                        <line x1="30" y1="0" x2="30" y2="20" stroke="#000" stroke-width="2"/>
                        <line x1="36" y1="0" x2="36" y2="20" stroke="#000" stroke-width="1"/>
                        <line x1="40" y1="0" x2="40" y2="20" stroke="#000" stroke-width="3"/>
                        <line x1="46" y1="0" x2="46" y2="20" stroke="#000" stroke-width="2"/>
                        <line x1="52" y1="0" x2="52" y2="20" stroke="#000" stroke-width="4"/>
                        <line x1="60" y1="0" x2="60" y2="20" stroke="#000" stroke-width="1"/>
                        <line x1="64" y1="0" x2="64" y2="20" stroke="#000" stroke-width="3"/>
                        <line x1="70" y1="0" x2="70" y2="20" stroke="#000" stroke-width="2"/>
                        <line x1="75" y1="0" x2="75" y2="20" stroke="#000" stroke-width="1"/>
                        <line x1="80" y1="0" x2="80" y2="20" stroke="#000" stroke-width="3"/>
                        <line x1="88" y1="0" x2="88" y2="20" stroke="#000" stroke-width="2"/>
                        <line x1="94" y1="0" x2="94" y2="20" stroke="#000" stroke-width="1"/>
                    </svg>
                    <div style="font-size:0.68rem;letter-spacing:2px;margin-top:4px;font-weight:700;">* ${data.id_pesanan} *</div>
                </div>

                <div class="receipt-footer">
                    <div><b>Terima Kasih atas Kunjungan Anda!</b></div>
                    <div style="font-style:italic;margin-top:2px;">Nikmati setiap tegukan & rasa manis hari ini.</div>
                    <div style="margin-top:6px;font-size:0.68rem;color:#777;">Follow Instagram: @nomcherry.cafe</div>
                </div>
            </div>
        `;

        modal.classList.add('is-open');
    },

    async showReceipt(orderId) {
        try {
            const res = await API.getOrderById(orderId);
            if (res.success) {
                const order = res.data;
                const formattedData = {
                    id_pesanan: order.id_pesanan,
                    nomor_struk: order.nomor_struk,
                    tanggal: order.tanggal_pesanan,
                    cabang: {
                        nama_cabang: order.nama_cabang || 'NomCherry Café',
                        alamat: order.alamat_cabang || 'Jl. Jemur Andayani No. 12, Surabaya',
                        no_telp: order.no_telp_cabang || '0812-3456-7890'
                    },
                    kasir: order.nama_pengguna || 'Kasir',
                    pelanggan: order.nama_pelanggan || 'Pelanggan Umum',
                    nomor_meja: order.nomor_meja || 'Take Away',
                    items: order.items,
                    subtotal: order.subtotal,
                    pajak: order.pajak,
                    diskon: order.diskon,
                    total: order.total,
                    metode: order.metode || 'Cash',
                    nominal_diterima: order.nominal_diterima || order.total,
                    kembalian: order.kembalian || 0
                };
                this.showReceiptData(formattedData);
            }
        } catch (err) {
            App.showToast('Gagal memuat struk: ' + err.message, 'error');
        }
    },

    printReceipt() {
        window.print();
    },

    // Order History Module
    async loadOrders() {
        try {
            const res = await API.getOrders({ cabang: App.currentCabang });
            if (res.success) {
                this.renderOrdersTable(res.data);
            }
        } catch (err) {
            console.error('Failed to load orders history:', err);
        }
    },

    renderOrdersTable(orders) {
        const tbody = document.getElementById('orders-table-body');
        if (!tbody) return;

        if (orders.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--ink-muted);">Belum ada data transaksi untuk cabang ini.</td></tr>';
            return;
        }

        tbody.innerHTML = orders.map(o => `
            <tr>
                <td style="font-weight:700;color:var(--c-cherry);">${o.id_pesanan}</td>
                <td style="font-weight:600;">${o.nomor_struk || '-'}</td>
                <td>${App.formatDateTime(o.tanggal_pesanan)}</td>
                <td>${o.nama_pelanggan || 'Pelanggan Umum'}</td>
                <td><span class="status-pill is-success">${o.metode || 'Cash'}</span></td>
                <td style="font-weight:700;">${App.formatRupiah(o.total)}</td>
                <td>
                    <button class="btn-secondary" style="padding:4px 10px;font-size:0.75rem;" onclick="PosModule.showReceipt('${o.id_pesanan}')">
                        Lihat Struk
                    </button>
                </td>
            </tr>
        `).join('');
    }
};

window.PosModule = PosModule;

