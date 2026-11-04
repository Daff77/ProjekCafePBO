/**
 * User & Branch Management Module for NomCherry Café
 * Implements Test Cases 8.1, 8.2, 8.3
 */

const UsersModule = {
    users: [],
    branches: [],

    async load() {
        await Promise.all([this.loadUsers(), this.loadBranches()]);
    },

    async loadUsers() {
        try {
            const res = await API.getUsers();
            if (res.success) {
                this.users = res.data;
                this.renderUsersTable();
            }
        } catch (err) {
            console.error('Failed to load users:', err);
        }
    },

    async loadBranches() {
        try {
            const res = await API.getBranches();
            if (res.success) {
                this.branches = res.data;
                this.renderBranchesCards();
            }
        } catch (err) {
            console.error('Failed to load branches:', err);
        }
    },

    renderUsersTable() {
        const tbody = document.getElementById('users-table-body');
        if (!tbody) return;

        tbody.innerHTML = this.users.map(u => {
            const roleColor = u.peran === 'admin' ? 'var(--c-cherry)' : (u.peran === 'manager' ? 'var(--c-violet)' : (u.peran === 'owner' ? 'var(--c-yellow)' : 'var(--c-teal)'));
            const isProtected = u.id_pengguna === 'USR001';

            return `
                <tr>
                    <td style="font-weight:700;color:var(--c-cherry);">${u.id_pengguna}</td>
                    <td style="font-weight:700;color:var(--ink);">${u.nama_pengguna}</td>
                    <td style="font-family:monospace;color:var(--ink-2);">${u.username}</td>
                    <td>
                        <span class="chip" style="background:${roleColor}22;color:${roleColor};font-weight:700;">
                            ${u.peran.toUpperCase()}
                        </span>
                    </td>
                    <td>${u.nama_cabang || '-'}</td>
                    <td>
                        ${isProtected ? '<span style="font-size:0.75rem;color:var(--ink-muted);">(Admin Utama)</span>' : `
                            <button class="btn-icon is-delete" title="Hapus User" onclick="UsersModule.confirmDelete('${u.id_pengguna}', '${u.nama_pengguna}')">
                                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        `}
                    </td>
                </tr>
            `;
        }).join('');
    },

    renderBranchesCards() {
        const container = document.getElementById('branches-cards-container');
        if (!container) return;

        container.innerHTML = this.branches.map(b => `
            <div style="background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:20px;box-shadow:var(--shadow-sm);">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                    <span class="chip chip--cherry">${b.id_cabang}</span>
                    <span class="status-pill is-success">Aktif</span>
                </div>
                <h4 style="font-family:var(--font-display);font-size:1.1rem;font-weight:700;color:var(--ink);margin:4px 0 8px 0;">${b.nama_cabang}</h4>
                <p style="font-size:0.82rem;color:var(--ink-2);margin:0 0 6px 0;">📍 ${b.alamat}</p>
                <p style="font-size:0.82rem;color:var(--ink-2);margin:0;">📞 ${b.no_telp}</p>
            </div>
        `).join('');
    },

    // Test Case 8.1: Open modal add user
    openAddUserModal() {
        document.getElementById('form-user-name').value = '';
        document.getElementById('form-user-username').value = '';
        document.getElementById('form-user-password').value = '';
        document.getElementById('form-user-role').value = 'kasir';
        document.getElementById('form-user-branch').value = App.currentCabang;

        document.getElementById('modal-user-form').classList.add('is-open');
    },

    async saveUser() {
        const nama = document.getElementById('form-user-name').value.trim();
        const username = document.getElementById('form-user-username').value.trim();
        const password = document.getElementById('form-user-password').value.trim();
        const peran = document.getElementById('form-user-role').value;
        const cabang = document.getElementById('form-user-branch').value;

        if (!nama || !username || !password) {
            App.showToast('Semua field wajib diisi!', 'error');
            return;
        }

        try {
            const res = await API.createUser({
                nama_pengguna: nama,
                username: username,
                kata_sandi: password,
                peran: peran,
                id_cabang: cabang
            });

            if (res.success) {
                App.showToast('User berhasil disimpan', 'success');
                document.getElementById('modal-user-form').classList.remove('is-open');
                await this.loadUsers();
            }
        } catch (err) {
            App.showToast(err.message, 'error');
        }
    },

    // Test Case 8.3: Hapus user
    confirmDelete(id, nama) {
        if (confirm(`Yakin ingin menghapus pengguna "${nama}"? Akun ini tidak akan dapat login lagi.`)) {
            API.deleteUser(id)
                .then(res => {
                    if (res.success) {
                        App.showToast('User terhapus', 'success');
                        this.loadUsers();
                    }
                })
                .catch(err => App.showToast(err.message, 'error'));
        }
    }
};

window.UsersModule = UsersModule;

