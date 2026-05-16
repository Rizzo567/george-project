(function () {
  'use strict';

  // ── Config ─────────────────────────────────────────────────
  var sb = supabase.createClient(
    window.MB_CONFIG.SUPABASE_URL,
    window.MB_CONFIG.SUPABASE_KEY
  );

  // ── State ──────────────────────────────────────────────────
  var activeBarber    = '';
  var activeStatus    = '';
  var allAppointments = [];
  var lastDates14     = [];

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
    if (!chartTimeline) {
      initCharts();
      startChartAnimations();
    }
    loadStatsData();
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
        } else if (action === 'cancelled') {
          var row = btn.closest('tr');
          row.style.transition = 'opacity 0.3s';
          row.style.opacity = '0.4';
          var cells = row.querySelectorAll('td');
          cells[cells.length - 1].innerHTML = '<span style="font-family:var(--font-body);font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#e85a1f;">Deleting…</span>';
          setTimeout(function () {
            row.style.transition = 'opacity 0.4s';
            row.style.opacity = '0';
            setTimeout(function () {
              row.remove();
              loadStatsData();
            }, 400);
          }, 3000);
        } else {
          loadStatsData();
          loadAppointments();
        }
      });
  });

  // ── Chart instances ────────────────────────────────────────
  var chartTimeline = null;
  var chartServizi  = null;
  var chartBarbers  = null;

  // ── Count-up animation ─────────────────────────────────────
  function animateCount(el, target) {
    if (!el) return;
    var from = parseInt(el.textContent, 10) || 0;
    var duration = 650;
    var startTime = null;
    function step(ts) {
      if (!startTime) startTime = ts;
      var p = Math.min((ts - startTime) / duration, 1);
      var ease = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + (target - from) * ease);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ── Init charts ─────────────────────────────────────────────
  function initCharts() {
    if (typeof Chart === 'undefined') return;

    Chart.defaults.color = '#8E8E8E';
    Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
    Chart.defaults.font.size = 11;

    var tip = {
      backgroundColor: '#111111',
      borderColor: 'rgba(229,225,216,0.12)',
      borderWidth: 1,
      titleColor: '#E5E1D8',
      bodyColor: '#8E8E8E',
      padding: 12,
      displayColors: false,
      cornerRadius: 0
    };

    var scaleX = {
      grid: { color: 'rgba(229,225,216,0.04)' },
      border: { display: false },
      ticks: { color: '#8E8E8E', maxRotation: 0, font: { size: 10 } }
    };
    var scaleY = {
      grid: { color: 'rgba(229,225,216,0.04)' },
      border: { display: false },
      ticks: { color: '#8E8E8E', precision: 0, maxTicksLimit: 5, font: { size: 10 } },
      beginAtZero: true
    };

    // ── Bar chart: Andamento + media linea ──────────────────
    var ctxBar = document.getElementById('chartTimeline');
    if (ctxBar) {
      chartTimeline = new Chart(ctxBar.getContext('2d'), {
        type: 'bar',
        data: {
          labels: [],
          datasets: [
            {
              label: 'Prenotazioni',
              data: [],
              order: 2,
              borderRadius: 4,
              borderSkipped: false,
              barPercentage: 0.55,
              categoryPercentage: 0.85,
              backgroundColor: function(ctx) {
                var chart = ctx.chart;
                var area  = chart.chartArea;
                if (!area) return 'rgba(232,90,31,0.7)';
                var g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
                g.addColorStop(0, 'rgba(232,90,31,0.9)');
                g.addColorStop(1, 'rgba(232,90,31,0.08)');
                return g;
              }
            },
            {
              label: 'Media',
              data: [],
              type: 'line',
              order: 1,
              borderColor: 'rgba(229,225,216,0.3)',
              borderWidth: 1,
              borderDash: [4, 4],
              pointRadius: 0,
              fill: false,
              tension: 0
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 900, easing: 'easeOutQuart' },
          plugins: {
            legend: { display: false },
            tooltip: Object.assign({}, tip, {
              callbacks: {
                label: function(item) {
                  if (item.datasetIndex === 1) return 'Media: ' + (+item.raw).toFixed(1);
                  return item.raw + ' prenotazioni';
                }
              }
            })
          },
          scales: { x: scaleX, y: scaleY }
        }
      });

      ctxBar.addEventListener('click', function(evt) {
        var pts = chartTimeline.getElementsAtEventForMode(evt, 'index', { intersect: false }, false);
        if (!pts.length) return;
        var idx = pts[0].index;
        if (lastDates14[idx]) showDayPanel(lastDates14[idx]);
      });
    }

    // ── Horizontal bar: Top servizi ─────────────────────────
    var ctxServ = document.getElementById('chartServizi');
    if (ctxServ) {
      chartServizi = new Chart(ctxServ.getContext('2d'), {
        type: 'bar',
        data: {
          labels: [],
          datasets: [{
            data: [],
            backgroundColor: function(ctx) {
              var chart = ctx.chart;
              var area  = chart.chartArea;
              if (!area) return 'rgba(232,90,31,0.7)';
              var g = chart.ctx.createLinearGradient(area.left, 0, area.right, 0);
              g.addColorStop(0, 'rgba(232,90,31,0.9)');
              g.addColorStop(1, 'rgba(232,90,31,0.2)');
              return g;
            },
            borderRadius: 3,
            borderSkipped: false,
            barPercentage: 0.65,
            categoryPercentage: 0.9
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 800, easing: 'easeOutQuart' },
          plugins: {
            legend: { display: false },
            tooltip: Object.assign({}, tip, {
              callbacks: { label: function(item) { return item.raw + ' prenotazioni'; } }
            })
          },
          scales: {
            x: Object.assign({}, scaleY, { ticks: Object.assign({}, scaleY.ticks, { maxTicksLimit: 4 }) }),
            y: Object.assign({}, scaleX, { ticks: Object.assign({}, scaleX.ticks, { color: '#E5E1D8' }) })
          }
        }
      });
    }

    // ── Line chart: George vs Berlin ────────────────────────
    var ctxBrb = document.getElementById('chartBarbers');
    if (ctxBrb) {
      chartBarbers = new Chart(ctxBrb.getContext('2d'), {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            {
              label: 'George',
              data: [],
              borderColor: '#E85A1F',
              backgroundColor: 'rgba(232,90,31,0.07)',
              fill: true,
              tension: 0.35,
              pointRadius: 3,
              pointBackgroundColor: '#E85A1F',
              pointBorderColor: '#1A1A1A',
              pointBorderWidth: 1.5
            },
            {
              label: 'Berlin',
              data: [],
              borderColor: 'rgba(229,225,216,0.65)',
              backgroundColor: 'rgba(229,225,216,0.04)',
              fill: true,
              tension: 0.35,
              pointRadius: 3,
              pointBackgroundColor: '#E5E1D8',
              pointBorderColor: '#1A1A1A',
              pointBorderWidth: 1.5
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 1000, easing: 'easeOutQuart' },
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: Object.assign({}, tip, {
              callbacks: {
                label: function(item) {
                  return item.dataset.label + ': ' + item.raw + ' prenotazioni';
                }
              }
            })
          },
          scales: { x: scaleX, y: scaleY }
        }
      });
    }

    var backBtn = document.getElementById('dayPanelBack');
    if (backBtn) {
      backBtn.addEventListener('click', function() {
        document.getElementById('dayPanel').classList.add('is-hidden');
      });
    }
  }

  // ── Carica dati per stats (senza filtri) ───────────────────
  function loadStatsData() {
    sb.from('appointments')
      .select('*')
      .order('date', { ascending: true })
      .order('time', { ascending: true })
      .then(function(res) {
        if (!res.error) {
          allAppointments = res.data || [];
          updateStats(allAppointments);
        }
      });
  }

  // ── Update stats ───────────────────────────────────────────
  function updateStats(rows) {
    var now      = new Date();
    var todayStr = now.toISOString().slice(0, 10);
    var nowTime  = now.toTimeString().slice(0, 5);

    // KPI counts
    var total       = rows.length;
    var todayCount  = rows.filter(function(r) { return r.date === todayStr; }).length;
    var georgeCount = rows.filter(function(r) { return r.barber === 'george'; }).length;
    var berlinCount = rows.filter(function(r) { return r.barber === 'berlin'; }).length;

    animateCount(document.getElementById('kpiTotal'),  total);
    animateCount(document.getElementById('kpiToday'),  todayCount);
    animateCount(document.getElementById('kpiGeorge'), georgeCount);
    animateCount(document.getElementById('kpiBerlin'), berlinCount);

    // "Giornata libera" empty state
    var todaySub = document.getElementById('kpiTodaySub');
    if (todaySub) {
      if (todayCount === 0) {
        todaySub.textContent = 'Giornata libera';
        todaySub.style.color = 'rgba(107,255,141,0.6)';
      } else {
        todaySub.textContent = 'appuntamenti';
        todaySub.style.color = '';
      }
    }

    // Micro-trend: settimana corrente vs precedente
    function dayOffset(n) {
      var d = new Date(now); d.setDate(d.getDate() - n); d.setHours(0, 0, 0, 0); return d;
    }
    var w0 = dayOffset(6), w1 = dayOffset(13);
    var wEnd = new Date(w0.getTime() - 1);

    function inRange(ds, from, to) {
      var d = new Date(ds + 'T12:00:00'); return d >= from && d <= to;
    }
    function renderTrend(id, curr, prev) {
      var el = document.getElementById(id);
      if (!el) return;
      var delta = curr - prev;
      if (delta > 0) {
        el.textContent = '↑ +' + delta + ' vs sett. scorsa';
        el.className = 'kpi-trend kpi-trend--up';
      } else if (delta < 0) {
        el.textContent = '↓ ' + delta + ' vs sett. scorsa';
        el.className = 'kpi-trend kpi-trend--down';
      } else {
        el.textContent = '= stabile';
        el.className = 'kpi-trend kpi-trend--flat';
      }
    }

    var gCurr = rows.filter(function(r) { return r.barber==='george' && inRange(r.date, w0, now); }).length;
    var gPrev = rows.filter(function(r) { return r.barber==='george' && inRange(r.date, w1, wEnd); }).length;
    var bCurr = rows.filter(function(r) { return r.barber==='berlin' && inRange(r.date, w0, now); }).length;
    var bPrev = rows.filter(function(r) { return r.barber==='berlin' && inRange(r.date, w1, wEnd); }).length;
    renderTrend('trendGeorge', gCurr, gPrev);
    renderTrend('trendBerlin', bCurr, bPrev);

    // Prossimo appuntamento
    var upcoming = rows.filter(function(r) {
      return r.status === 'confirmed' && (
        r.date > todayStr ||
        (r.date === todayStr && (r.time || '').slice(0,5) >= nowTime)
      );
    }).sort(function(a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.time || '') < (b.time || '') ? -1 : 1;
    });

    var prossimoBody = document.getElementById('prossimoBody');
    if (prossimoBody) {
      var next = upcoming[0];
      if (!next) {
        prossimoBody.innerHTML = '<span class="prossimo-empty">Nessun appuntamento in programma</span>';
      } else {
        var isToday = next.date === todayStr;
        var nextDate = new Date(next.date + 'T12:00:00');
        var tmrw = new Date(now); tmrw.setDate(now.getDate() + 1);
        var isTomorrow = nextDate.toDateString() === tmrw.toDateString();
        var whenStr = isToday ? 'Oggi' :
                      isTomorrow ? 'Domani' :
                      nextDate.toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit' });
        var whenCls = isToday ? 'prossimo-when prossimo-when--today' : 'prossimo-when';
        var barberLabel = next.barber === 'george' ? 'George' : 'Berlin';
        prossimoBody.innerHTML =
          '<div class="prossimo-time">' + (next.time||'').slice(0,5) + '</div>' +
          '<div class="prossimo-info">' +
            '<div class="prossimo-name">' + esc(next.name) + '</div>' +
            '<div class="prossimo-detail">' + esc(next.service) + ' · ' + barberLabel + '</div>' +
          '</div>' +
          '<div class="' + whenCls + '">' + whenStr + '</div>';
      }
    }

    // Build 14-day axis
    var labels14 = [], dates14 = [];
    for (var d = 13; d >= 0; d--) {
      var day = new Date(now);
      day.setDate(day.getDate() - d);
      dates14.push(day.toISOString().slice(0, 10));
      labels14.push(day.toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit' }));
    }
    lastDates14 = dates14;

    // Timeline + media
    if (chartTimeline) {
      var dayCounts = dates14.map(function(ds) {
        return rows.filter(function(r) { return r.date === ds; }).length;
      });
      var sum = dayCounts.reduce(function(a, v) { return a + v; }, 0);
      var avg = Math.round((sum / dayCounts.length) * 10) / 10;
      chartTimeline.data.labels = labels14;
      chartTimeline.data.datasets[0].data = dayCounts;
      chartTimeline.data.datasets[1].data = dayCounts.map(function() { return avg; });
      chartTimeline.update();
    }

    // Top servizi
    if (chartServizi) {
      var svcMap = {};
      rows.forEach(function(r) {
        var s = (r.service || 'Altro').trim();
        svcMap[s] = (svcMap[s] || 0) + 1;
      });
      var svcKeys = Object.keys(svcMap).sort(function(a, b) { return svcMap[b] - svcMap[a]; }).slice(0, 5);
      chartServizi.data.labels = svcKeys;
      chartServizi.data.datasets[0].data = svcKeys.map(function(k) { return svcMap[k]; });
      chartServizi.update();
    }

    // George vs Berlin
    if (chartBarbers) {
      chartBarbers.data.labels = labels14;
      chartBarbers.data.datasets[0].data = dates14.map(function(ds) {
        return rows.filter(function(r) { return r.date===ds && r.barber==='george'; }).length;
      });
      chartBarbers.data.datasets[1].data = dates14.map(function(ds) {
        return rows.filter(function(r) { return r.date===ds && r.barber==='berlin'; }).length;
      });
      chartBarbers.update();
    }
  }

  // ── Scanner animation (overlay canvas) ────────────────────
  function startChartAnimations() {
    var scanX   = 0;
    var lastTs  = 0;
    var speed   = 0.00009; // full sweep ~11s
    var overlays = {};

    function ensureOverlay(id, chart) {
      if (overlays[id]) return overlays[id];
      var src = document.getElementById(id);
      if (!src || !chart) return null;
      var ov = document.createElement('canvas');
      ov.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2;';
      src.parentElement.appendChild(ov);
      overlays[id] = { ov: ov, chart: chart };
      return overlays[id];
    }

    function drawScanner(id, chart) {
      var item = ensureOverlay(id, chart);
      if (!item) return;
      var area = chart.chartArea;
      if (!area) return;
      var ov  = item.ov;
      var src = chart.canvas;
      if (ov.width !== src.width || ov.height !== src.height) {
        ov.width  = src.width;
        ov.height = src.height;
      }
      var ctx = ov.getContext('2d');
      ctx.clearRect(0, 0, ov.width, ov.height);
      var w = area.right - area.left;
      var x = area.left + scanX * w;
      // trailing glow
      var grad = ctx.createLinearGradient(x - 60, 0, x, 0);
      grad.addColorStop(0, 'rgba(232,90,31,0)');
      grad.addColorStop(1, 'rgba(232,90,31,0.07)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - 60, area.top, 62, area.bottom - area.top);
      // scanner line
      ctx.save();
      ctx.strokeStyle = 'rgba(232,90,31,0.55)';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = '#E85A1F';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(x, area.top);
      ctx.lineTo(x, area.bottom);
      ctx.stroke();
      ctx.restore();
    }

    function frame(ts) {
      if (lastTs) {
        var dt = Math.min(ts - lastTs, 80);
        scanX += dt * speed;
        if (scanX >= 1) scanX -= 1;
      }
      lastTs = ts;
      drawScanner('chartTimeline', chartTimeline);
      drawScanner('chartBarbers',  chartBarbers);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // ── Show day detail panel ──────────────────────────────────
  function showDayPanel(dateStr) {
    var dayApts = allAppointments.filter(function(r) { return r.date === dateStr; });
    var d = new Date(dateStr + 'T12:00:00');
    var longDate = d.toLocaleDateString('it-IT', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    });
    document.getElementById('dayPanelTitle').textContent = longDate;
    document.getElementById('dayPanelCount').textContent =
      dayApts.length + (dayApts.length === 1 ? ' appuntamento' : ' appuntamenti');

    var body = document.getElementById('dayPanelBody');
    if (!dayApts.length) {
      body.innerHTML = '<p class="day-panel-empty">Nessuna prenotazione registrata in questa data.</p>';
    } else {
      var sorted = dayApts.slice().sort(function(a, b) {
        return (a.time || '') < (b.time || '') ? -1 : 1;
      });
      body.innerHTML = sorted.map(function(apt) {
        var barberLabel = apt.barber === 'george' ? 'George' : 'Berlin';
        var sCls   = 'dpt-status dpt-status--' + esc(apt.status);
        var sLabel = apt.status === 'confirmed' ? '◎ Confermato' :
                     apt.status === 'completed' ? '✓ Completato' :
                     '✗ Annullato';
        return '<div class="day-panel-row">' +
          '<div class="dpt-time">'    + (apt.time || '').slice(0, 5) + '</div>' +
          '<div class="dpt-name">'    + esc(apt.name) + '</div>' +
          '<div class="dpt-service">' + esc(apt.service) + '</div>' +
          '<div class="dpt-barber">'  + barberLabel + '</div>' +
          '<div class="' + sCls + '">' + sLabel + '</div>' +
        '</div>';
      }).join('');
    }

    var panel = document.getElementById('dayPanel');
    panel.classList.remove('is-hidden');
    setTimeout(function() {
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
  }

  // ── Start ──────────────────────────────────────────────────
  init();

})();
