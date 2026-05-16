(function () {
  'use strict';

  // ── Config ─────────────────────────────────────────────────
  var sb = supabase.createClient(
    window.MB_CONFIG.SUPABASE_URL,
    window.MB_CONFIG.SUPABASE_KEY
  );

  // ── State ──────────────────────────────────────────────────
  var activeBarber = '';
  var activeStatus = '';

  // ── DOM refs ───────────────────────────────────────────────
  var authSection = document.getElementById('authSection');
  var dashSection = document.getElementById('dashSection');
  var loginForm   = document.getElementById('loginForm');
  var forgotForm  = document.getElementById('forgotForm');
  var resetForm   = document.getElementById('resetForm');
  var loginMsg    = document.getElementById('loginMsg');
  var forgotMsg   = document.getElementById('forgotMsg');
  var resetMsg    = document.getElementById('resetMsg');

  // ── Helpers ────────────────────────────────────────────────
  function showMsg(el, text, type) {
    el.innerHTML = '<div class="auth-msg auth-msg--' + type + '">' + text + '</div>';
  }

  function clearMsg(el) { el.innerHTML = ''; }

  function hide(el) { el.classList.add('is-hidden'); }
  function show(el) { el.classList.remove('is-hidden'); }

  function showAuthMode(mode) {
    // Show authSection, hide dash
    show(authSection);
    hide(dashSection);

    // Show only the right form
    if (mode === 'login') {
      show(loginForm); hide(forgotForm); hide(resetForm);
    } else if (mode === 'forgot') {
      hide(loginForm); show(forgotForm); hide(resetForm);
    } else if (mode === 'reset') {
      hide(loginForm); hide(forgotForm); show(resetForm);
    }
  }

  function showDash() {
    hide(authSection);
    show(dashSection);
    loadAppointments();
  }

  // ── Init ───────────────────────────────────────────────────
  function init() {
    // Check for password recovery in URL hash
    var hash = window.location.hash;
    if (hash.indexOf('type=recovery') !== -1) {
      showAuthMode('reset');
      return;
    }

    sb.auth.getSession().then(function (res) {
      if (res.data && res.data.session) {
        showDash();
      } else {
        showAuthMode('login');
      }
    });
  }

  // ── Login ──────────────────────────────────────────────────
  loginForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var email    = document.getElementById('authEmail').value.trim();
    var password = document.getElementById('authPassword').value;
    var btn      = document.getElementById('loginBtn');
    clearMsg(loginMsg);
    btn.disabled = true;
    btn.textContent = 'Accesso in corso…';

    sb.auth.signInWithPassword({ email: email, password: password })
      .then(function (res) {
        if (res.error) {
          showMsg(loginMsg, 'Credenziali errate. Riprova.', 'error');
          btn.disabled = false;
          btn.textContent = 'Entra';
        } else {
          showDash();
        }
      });
  });

  // ── Forgot password ────────────────────────────────────────
  document.getElementById('forgotLink').addEventListener('click', function () {
    clearMsg(forgotMsg);
    showAuthMode('forgot');
  });

  document.getElementById('backToLoginLink').addEventListener('click', function () {
    clearMsg(loginMsg);
    showAuthMode('login');
  });

  forgotForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = document.getElementById('forgotEmail').value.trim();
    var btn   = document.getElementById('forgotBtn');
    clearMsg(forgotMsg);
    btn.disabled = true;
    btn.textContent = 'Invio…';

    sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    })
      .then(function (res) {
        if (res.error) {
          showMsg(forgotMsg, 'Errore: ' + res.error.message, 'error');
        } else {
          showMsg(forgotMsg, 'Email inviata. Controlla la casella di posta.', 'ok');
        }
        btn.disabled = false;
        btn.textContent = 'Invia link di reset';
      });
  });

  // ── Reset password ─────────────────────────────────────────
  resetForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var newPwd = document.getElementById('newPassword').value;
    var btn    = document.getElementById('resetBtn');
    clearMsg(resetMsg);
    btn.disabled = true;
    btn.textContent = 'Salvataggio…';

    sb.auth.updateUser({ password: newPwd })
      .then(function (res) {
        if (res.error) {
          showMsg(resetMsg, 'Errore: ' + res.error.message, 'error');
          btn.disabled = false;
          btn.textContent = 'Salva password';
        } else {
          showMsg(resetMsg, 'Password aggiornata. Reindirizzamento…', 'ok');
          setTimeout(function () {
            window.location.hash = '';
            showDash();
          }, 1500);
        }
      });
  });

  // ── Logout ─────────────────────────────────────────────────
  document.getElementById('logoutBtn').addEventListener('click', function () {
    sb.auth.signOut().then(function () { showAuthMode('login'); });
  });

  // ── Filtri ─────────────────────────────────────────────────
  document.getElementById('barberFilters').addEventListener('click', function (e) {
    var btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('#barberFilters .filter-btn').forEach(function (b) {
      b.classList.remove('is-active');
    });
    btn.classList.add('is-active');
    activeBarber = btn.dataset.barber;
    loadAppointments();
  });

  document.getElementById('statusFilters').addEventListener('click', function (e) {
    var btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('#statusFilters .filter-btn').forEach(function (b) {
      b.classList.remove('is-active');
    });
    btn.classList.add('is-active');
    activeStatus = btn.dataset.status;
    loadAppointments();
  });

  // ── Carica appuntamenti ────────────────────────────────────
  function loadAppointments() {
    var tbody = document.getElementById('aptTableBody');
    var empty = document.getElementById('dashEmpty');
    tbody.innerHTML = '<tr><td colspan="9" style="color:var(--silver);padding:24px 16px;font-size:13px;">Caricamento…</td></tr>';
    empty.classList.add('is-hidden');

    var query = sb.from('appointments')
      .select('*')
      .order('date', { ascending: true })
      .order('time', { ascending: true });

    if (activeBarber) query = query.eq('barber', activeBarber);
    if (activeStatus) query = query.eq('status', activeStatus);

    query.then(function (res) {
      if (res.error) {
        tbody.innerHTML = '<tr><td colspan="9" style="color:#ff6b6b;padding:24px 16px;">Errore caricamento dati.</td></tr>';
        return;
      }
      renderTable(res.data || []);
    });
  }

  // ── Render tabella ─────────────────────────────────────────
  function renderTable(rows) {
    var tbody = document.getElementById('aptTableBody');
    var empty = document.getElementById('dashEmpty');
    tbody.innerHTML = '';

    if (!rows.length) {
      empty.classList.remove('is-hidden');
      return;
    }

    rows.forEach(function (apt) {
      var barberLabel = apt.barber === 'george' ? 'George' : 'Berlin';
      var dateObj     = new Date(apt.date + 'T12:00:00');
      var dateStr     = dateObj.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' });
      var timeStr     = (apt.time || '').slice(0, 5);

      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + dateStr + '</td>' +
        '<td>' + timeStr + '</td>' +
        '<td style="font-weight:500;">' + esc(apt.name) + '</td>' +
        '<td>' + esc(apt.phone) + '</td>' +
        '<td>' + barberLabel + '</td>' +
        '<td>' + esc(apt.service) + '</td>' +
        '<td style="max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(apt.notes || '—') + '</td>' +
        '<td>' + statusBadge(apt.status) + '</td>' +
        '<td>' + actionButtons(apt) + '</td>';
      tbody.appendChild(tr);
    });
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function statusBadge(status) {
    return '<span class="status-badge status-badge--' + esc(status) + '">' + esc(status) + '</span>';
  }

  function actionButtons(apt) {
    var btns = '<div class="apt-actions">';
    if (apt.status !== 'completed' && apt.status !== 'cancelled') {
      btns += '<button class="apt-btn apt-btn--complete" data-id="' + apt.id + '" data-action="completed">Completo</button>';
      btns += '<button class="apt-btn apt-btn--cancel" data-id="' + apt.id + '" data-action="cancelled">Annulla</button>';
    }
    btns += '</div>';
    return btns;
  }

  // ── Azioni status (event delegation) ──────────────────────
  document.getElementById('aptTableBody').addEventListener('click', function (e) {
    var btn = e.target.closest('.apt-btn[data-action]');
    if (!btn) return;
    var id     = btn.dataset.id;
    var action = btn.dataset.action;
    btn.disabled = true;
    sb.from('appointments')
      .update({ status: action })
      .eq('id', id)
      .then(function (res) {
        if (res.error) {
          btn.disabled = false;
        } else {
          loadAppointments();
        }
      });
  });

  // ── Start ──────────────────────────────────────────────────
  init();

})();
