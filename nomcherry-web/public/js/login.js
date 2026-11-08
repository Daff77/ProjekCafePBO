const brandLogo = document.querySelector('.brand-mark img');
if (brandLogo) {
  brandLogo.addEventListener('error', () => {
    brandLogo.style.display = 'none';
    brandLogo.parentElement.textContent = '🍒';
  });
}

const $ = id => document.getElementById(id);
const f = $('f'), u = $('u'), p = $('p'), err = $('err'), succ = $('succ'), b = $('b'), t = $('t');
const sessionBanner = $('session-banner');
const activeUserName = $('active-user-name');
const activeUserRole = $('active-user-role');
const btnResume = $('btn-resume');
const btnLogoutHere = $('btn-logout-here');
const lupaBtn = $('lupa-btn');
const helpModal = $('help-modal');
const closeHelpBtn = $('close-help-btn');

function tick(){
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
checkExistingSession();

btnResume.addEventListener('click', () => {
  window.location.href = 'index.html';
});

btnLogoutHere.addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (e) {}
  localStorage.removeItem('nomcherry_session');
  sessionBanner.classList.remove('show');
  succ.textContent = 'Sesi sebelumnya berhasil dibersihkan. Silakan masuk kembali.';
  succ.classList.add('show');
  setTimeout(() => succ.classList.remove('show'), 3000);
});

function fail(m){
  err.textContent = m;
  err.classList.add('show');
  succ.classList.remove('show');
  b.disabled = false;
  b.innerHTML = '<span>Masuk ke Sistem</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>';
}

f.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = u.value.trim();
  const password = p.value.trim();

  if (!username) {
    fail('Silakan masukkan username kasir atau admin');
    u.focus();
    return;
  }
  if (!password) {
    fail('Silakan masukkan kata sandi akun');
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
      succ.textContent = 'Verifikasi berhasil! Mengalihkan ke kasir...';
      succ.classList.add('show');
      localStorage.setItem('nomcherry_session', JSON.stringify(data.data));
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 350);
    } else {
      fail(data.message || 'Username atau kata sandi tidak cocok untuk cabang ini.');
    }
  } catch (ex) {
    fail('Koneksi ke server gagal: ' + ex.message);
  }
});

document.querySelectorAll('.demo-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    u.value = btn.dataset.u;
    p.value = btn.dataset.p;
    f.requestSubmit();
  });
});

lupaBtn.addEventListener('click', () => {
  helpModal.classList.add('show');
});
closeHelpBtn.addEventListener('click', () => {
  helpModal.classList.remove('show');
});
helpModal.addEventListener('click', (e) => {
  if (e.target === helpModal) helpModal.classList.remove('show');
});
