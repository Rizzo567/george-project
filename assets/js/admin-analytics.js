/* ─────────────────────────────────────────────────────────────────────────────
 * Mister Barber — Dashboard Analitiche (admin)
 *
 * Legge:
 *   - nav_stats          (aggregati anonimi: tempo pagina + time-to-book)
 *   - customer_visit_stats()      RPC → distribuzione visite per cliente
 *   - customer_visits_by_phone()  RPC → lookup singolo cliente
 *
 * Auth: riusa la sessione admin (Supabase persiste in localStorage, quindi un
 * secondo client createClient condivide lo stesso JWT authenticated). RLS/grant
 * garantiscono che anon non possa leggere nulla di tutto questo.
 * ───────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  if (!window.supabase || !window.MB_CONFIG) return;

  var sb = window.supabase.createClient(
    window.MB_CONFIG.SUPABASE_URL,
    window.MB_CONFIG.SUPABASE_KEY
  );

  var overlay   = document.getElementById('analyticsOverlay');
  var triggerBtn = document.getElementById('analyticsTriggerBtn');
  var closeBtn  = document.getElementById('analyticsCloseBtn');
  if (!overlay || !triggerBtn) return;

  var visitsChart = null;
  var loadedOnce = false;

  // ── Helpers ────────────────────────────────────────────────────────────────
  function fmtDuration(ms) {
    if (!ms || ms < 0) return '—';
    var s = Math.round(ms / 1000);
    if (s < 60) return s + 's';
    var m = Math.floor(s / 60);
    var rem = s % 60;
    return m + 'm ' + (rem < 10 ? '0' : '') + rem + 's';
  }

  function showError(msg) {
    var el = document.getElementById('mbaError');
    el.textContent = msg;
    el.classList.remove('is-hidden');
  }
  function clearError() {
    document.getElementById('mbaError').classList.add('is-hidden');
  }

  // ── Overlay open/close ───────────────────────────────────────────────────────
  function open() {
    overlay.classList.remove('is-hidden');
    document.body.style.overflow = 'hidden';
    if (!loadedOnce) { loadedOnce = true; load(); }
    else { load(); } // ricarica sempre: i dati sono live
  }
  function close() {
    overlay.classList.add('is-hidden');
    document.body.style.overflow = '';
  }

  triggerBtn.addEventListener('click', open);
  if (closeBtn) closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !overlay.classList.contains('is-hidden')) close();
  });

  // ── Data load ────────────────────────────────────────────────────────────────
  function load() {
    clearError();
    loadNavStats();
    loadVisitStats();
  }

  function loadNavStats() {
    sb.from('nav_stats').select('metric,total_ms,sample_count').then(function (res) {
      if (res.error) { showError('Errore lettura aggregati: ' + res.error.message); return; }
      var by = {};
      (res.data || []).forEach(function (r) { by[r.metric] = r; });

      function avg(m) {
        var r = by[m];
        return (r && r.sample_count > 0) ? (r.total_ms / r.sample_count) : 0;
      }
      function cnt(m) {
        var r = by[m];
        return r ? Number(r.sample_count) : 0;
      }

      setText('mbaTimeIndex',   fmtDuration(avg('page_index')));
      setText('mbaTimePrenota', fmtDuration(avg('page_prenota')));
      setText('mbaTtb',         fmtDuration(avg('ttb')));
      setText('mbaCntIndex',   cnt('page_index')   + ' sessioni');
      setText('mbaCntPrenota', cnt('page_prenota') + ' sessioni');
      setText('mbaCntTtb',     cnt('ttb')          + ' prenotazioni');
    });
  }

  function loadVisitStats() {
    sb.rpc('customer_visit_stats').then(function (res) {
      if (res.error) { showError('Errore lettura clienti: ' + res.error.message); return; }
      var rows = res.data || []; // [{visits, customers}]
      renderVisitStats(rows);
    });
  }

  function renderVisitStats(rows) {
    var emptyEl = document.getElementById('mbaVisitsEmpty');
    var totalCustomers = 0, returning = 0;
    rows.forEach(function (r) {
      var c = Number(r.customers);
      totalCustomers += c;
      if (Number(r.visits) >= 2) returning += c;
    });

    setText('mbaUnique', totalCustomers || '0');
    setText('mbaReturning', returning || '0');
    setText('mbaRepeatRate', totalCustomers > 0
      ? Math.round((returning / totalCustomers) * 100) + '%'
      : '—');

    // Grafico: raggruppa visite alte in "5+"
    var buckets = { '1': 0, '2': 0, '3': 0, '4': 0, '5+': 0 };
    rows.forEach(function (r) {
      var v = Number(r.visits), c = Number(r.customers);
      if (v >= 5) buckets['5+'] += c;
      else buckets[String(v)] += c;
    });
    var labels = ['1', '2', '3', '4', '5+'];
    var data = labels.map(function (k) { return buckets[k]; });

    if (totalCustomers === 0) {
      emptyEl.classList.remove('is-hidden');
    } else {
      emptyEl.classList.add('is-hidden');
    }

    drawVisitsChart(labels, data);
  }

  function drawVisitsChart(labels, data) {
    var ctx = document.getElementById('mbaChartVisits');
    if (!ctx || typeof Chart === 'undefined') return;

    if (visitsChart) {
      visitsChart.data.labels = labels;
      visitsChart.data.datasets[0].data = data;
      visitsChart.update();
      return;
    }
    visitsChart = new Chart(ctx.getContext('2d'), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Clienti',
          data: data,
          backgroundColor: '#E85A1F',
          borderRadius: 6,
          maxBarThickness: 64
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: function (items) { return items[0].label + ' visite'; },
              label: function (item) { return item.parsed.y + ' clienti'; }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: 'Numero di visite', color: 'rgba(229,225,216,0.5)' },
            ticks: { color: 'rgba(229,225,216,0.6)' },
            grid: { display: false }
          },
          y: {
            beginAtZero: true,
            ticks: { color: 'rgba(229,225,216,0.6)', precision: 0 },
            grid: { color: 'rgba(229,225,216,0.06)' }
          }
        }
      }
    });
  }

  // ── Lookup cliente per telefono ──────────────────────────────────────────────
  var lookupBtn = document.getElementById('mbaLookupBtn');
  var phoneInput = document.getElementById('mbaPhoneInput');
  var resultEl = document.getElementById('mbaLookupResult');

  function doLookup() {
    var phone = (phoneInput.value || '').trim();
    if (phone.replace(/[^0-9]/g, '').length < 5) {
      resultEl.textContent = 'Inserisci un numero valido.';
      return;
    }
    resultEl.textContent = 'Ricerca…';
    sb.rpc('customer_visits_by_phone', { p_phone: phone }).then(function (res) {
      if (res.error) { resultEl.textContent = 'Errore: ' + res.error.message; return; }
      var n = Number(res.data) || 0;
      if (n === 0) {
        resultEl.textContent = 'Nessuna prenotazione per questo numero.';
      } else {
        resultEl.innerHTML = 'Questo cliente è venuto <strong>' + n + '</strong> ' +
          (n === 1 ? 'volta.' : 'volte.');
      }
    });
  }

  if (lookupBtn) lookupBtn.addEventListener('click', doLookup);
  if (phoneInput) phoneInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); doLookup(); }
  });

  // ── util ─────────────────────────────────────────────────────────────────────
  function setText(id, txt) {
    var el = document.getElementById(id);
    if (el) el.textContent = txt;
  }
})();
