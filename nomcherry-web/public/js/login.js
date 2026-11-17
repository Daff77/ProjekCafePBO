(function () {
  'use strict';

  const brandLogo = document.querySelector('.brand-mark img');
  if (brandLogo) {
    brandLogo.addEventListener('error', () => {
      brandLogo.style.display = 'none';
      brandLogo.parentElement.textContent = 'NC';
    });
  }

  const $ = id => document.getElementById(id);
  const f = $('f'), u = $('u'), p = $('p'), err = $('err'), succ = $('succ'), b = $('b'), t = $('t');
  const loginWrap = $('login-wrap');
  const sessionBanner = $('session-banner');
  const bootstrapBanner = $('bootstrap-banner');
  const demoSection = $('demo-section');
  const helpDemoCreds = $('help-demo-creds');
  const activeUserName = $('active-user-name');
  const activeUserRole = $('active-user-role');
  const btnResume = $('btn-resume');
  const btnLogoutHere = $('btn-logout-here');
  const lupaBtn = $('lupa-btn');
  const helpModal = $('help-modal');
  const closeHelpBtn = $('close-help-btn');

  let lastTrigger = null;

  function tick() {
    const n = new Date(), h = n.getHours();
    $('g').textContent = 'Selamat ' + (h < 11 ? 'Pagi' : h < 15 ? 'Siang' : h < 18 ? 'Sore' : 'Malam');
    $('d').textContent = n.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    $('c').textContent = n.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(':', '.');
  }
  tick();
  setInterval(tick, 30000);

  t.addEventListener('click', () => {
    const show = p.type === 'password';
    p.type = show ? 'text' : 'password';
    t.textContent = show ? 'Sembunyikan' : 'Lihat';
    t.setAttribute('aria-label', show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi');
  });

  async function loadPublicConfig() {
    try {
      const res = await fetch('/api/auth/config');
      if (!res.ok) return;
      const payload = await res.json();
      if (!payload || !payload.data) return;
      if (payload.data.demo_mode) {
        demoSection.classList.add('show');
        helpDemoCreds.classList.add('show');
      }
      if (payload.data.bootstrap_required) {
        bootstrapBanner.classList.add('show');
      }
    } catch (e) {
      // Non-fatal: keep demo credentials hidden on failure
    }
  }

  async function checkExistingSession() {
    try {
      const res = await fetch('/api/auth/session');
      if (!res.ok) {
        localStorage.removeItem('nomcherry_session');
        return;
      }
      const payload = await res.json();
      const user = payload.data;
      if (user && user.nama_pengguna) {
        localStorage.setItem('nomcherry_session', JSON.stringify(user));
        activeUserName.textContent = user.nama_pengguna;
        activeUserRole.textContent = (user.peran || 'kasir').toUpperCase();
        sessionBanner.classList.add('show');
      }
    } catch (e) {
      localStorage.removeItem('nomcherry_session');
    }
  }

  const authNotice = sessionStorage.getItem('nomcherry_auth_notice');
  if (authNotice) {
    sessionStorage.removeItem('nomcherry_auth_notice');
    err.textContent = authNotice;
    err.classList.add('show');
  }

  loadPublicConfig();
  checkExistingSession();

  btnResume.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  btnLogoutHere.addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {}
    localStorage.removeItem('nomcherry_session');
    sessionStorage.removeItem('nomcherry_active_branch');
    sessionBanner.classList.remove('show');
    succ.textContent = 'Sesi sebelumnya berhasil ditutup. Silakan masuk kembali.';
    succ.classList.add('show');
    setTimeout(() => succ.classList.remove('show'), 4000);
  });

  function fail(m) {
    err.textContent = m;
    err.classList.add('show');
    succ.classList.remove('show');
    b.disabled = false;
    b.innerHTML = '<span>Masuk ke Sistem</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>';
  }

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = u.value.trim();
    const password = p.value.trim();

    if (!username) {
      fail('Masukkan username akun terlebih dahulu.');
      u.focus();
      return;
    }
    if (!password) {
      fail('Masukkan kata sandi akun terlebih dahulu.');
      p.focus();
      return;
    }

    b.disabled = true;
    b.innerHTML = '<span>Memverifikasi...</span>';
    err.classList.remove('show');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username,
          kata_sandi: password
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        succ.textContent = 'Autentikasi berhasil. Mengalihkan ke aplikasi...';
        succ.classList.add('show');
        localStorage.setItem('nomcherry_session', JSON.stringify(data.data));
        sessionStorage.removeItem('nomcherry_active_branch');
        setTimeout(() => {
          window.location.href = 'index.html';
        }, 250);
      } else {
        fail(data.message || 'Username atau kata sandi tidak sesuai.');
      }
    } catch (ex) {
      fail('Gagal terhubung ke server. Periksa koneksi jaringan Anda lalu coba lagi.');
    }
  });

  document.querySelectorAll('.demo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      u.value = btn.dataset.u || '';
      p.value = btn.dataset.p || '';
      f.requestSubmit();
    });
  });

  function openHelpModal() {
    lastTrigger = document.activeElement;
    helpModal.classList.add('show');
    if (loginWrap) {
      loginWrap.inert = true;
      loginWrap.setAttribute('aria-hidden', 'true');
    }
    closeHelpBtn.focus();
  }

  function closeHelpModal() {
    helpModal.classList.remove('show');
    if (loginWrap) {
      loginWrap.inert = false;
      loginWrap.removeAttribute('aria-hidden');
    }
    if (lastTrigger && typeof lastTrigger.focus === 'function') {
      lastTrigger.focus();
    }
  }

  lupaBtn.addEventListener('click', openHelpModal);
  closeHelpBtn.addEventListener('click', closeHelpModal);
  helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) closeHelpModal();
  });

  document.addEventListener('keydown', (e) => {
    if (!helpModal.classList.contains('show')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeHelpModal();
      return;
    }
    if (e.key === 'Tab') {
      const focusables = Array.from(helpModal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter(el => !el.disabled && el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
})();
