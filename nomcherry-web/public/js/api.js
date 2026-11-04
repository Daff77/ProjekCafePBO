/**
 * API Client for NomCherry Café
 */

const API = {
    async request(endpoint, options = {}) {
        const url = `/api${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        try {
            const res = await fetch(url, {
                ...options,
                headers
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.message || 'Terjadi kesalahan sistem');
            }
            return data;
        } catch (err) {
            console.error(`API Error [${endpoint}]:`, err.message);
            throw err;
        }
    },

    // Auth
    login(credentials) {
        return this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify(credentials)
        });
    },

    getUsers() {
        return this.request('/users');
    },

    createUser(userData) {
        return this.request('/users', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
    },

    deleteUser(id) {
        return this.request(`/users/${id}`, {
            method: 'DELETE'
        });
    },

    // Menu
    getMenu(params = {}) {
        const q = new URLSearchParams(params).toString();
        return this.request(`/menu?${q}`);
    },

    createMenu(menuData) {
        return this.request('/menu', {
            method: 'POST',
            body: JSON.stringify(menuData)
        });
    },

    updateMenu(id, menuData) {
        return this.request(`/menu/${id}`, {
            method: 'PUT',
            body: JSON.stringify(menuData)
        });
    },

    deleteMenu(id) {
        return this.request(`/menu/${id}`, {
            method: 'DELETE'
        });
    },

    // Orders & POS
    createOrder(orderData) {
        return this.request('/orders', {
            method: 'POST',
            body: JSON.stringify(orderData)
        });
    },

    getOrders(params = {}) {
        const q = new URLSearchParams(params).toString();
        return this.request(`/orders?${q}`);
    },

    getOrderById(id) {
        return this.request(`/orders/${id}`);
    },

    // Stock
    getStock(params = {}) {
        const q = new URLSearchParams(params).toString();
        return this.request(`/stock?${q}`);
    },

    adjustStock(stockData) {
        return this.request('/stock/adjust', {
            method: 'POST',
            body: JSON.stringify(stockData)
        });
    },

    getStockLogs(params = {}) {
        const q = new URLSearchParams(params).toString();
        return this.request(`/stock/logs?${q}`);
    },

    // Reports & Dashboard
    getDashboard(params = {}) {
        const q = new URLSearchParams(params).toString();
        return this.request(`/reports/dashboard?${q}`);
    },

    getSalesReport(params = {}) {
        const q = new URLSearchParams(params).toString();
        return this.request(`/reports/sales?${q}`);
    },

    // Branches
    getBranches() {
        return this.request('/branches');
    }
};

window.API = API;

