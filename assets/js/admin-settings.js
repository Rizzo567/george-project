/* ============================================================
   admin-settings.js - Hub Impostazioni gestionale Mister Barber
   ------------------------------------------------------------
   Estende il gestionale esistente (admin.js). Si auto-inizializza
   leggendo il bridge window.MBAdmin (client Supabase + helper).

   Sezioni:
     1. Orari & Disponibilità (business_hours via PUT /api/settings/hours,
        shop_settings via PATCH /api/settings/shop, + Chiusure migrate qui)
     2. Servizi (CRUD via /api/settings/services, nessun prezzo)
     3. Dashboard personalizzabile (GET/PUT /api/preferences, SortableJS, tema)

   Auth: ogni fetch /api/settings/* e /api/preferences include
     Authorization: 'Bearer ' + access_token (da supabase.auth.getSession()).
   ============================================================ */
(function () {
  'use strict';

  // ── Costanti dominio ───────────────────────────────────────
  var WEEKDAYS = [
    { n: 1, label: 'Lunedì',    short: 'Lun' },
    { n: 2, label: 'Martedì',   short: 'Mar' },
    { n: 3, label: 'Mercoledì', short: 'Mer' },
    { n: 4, label: 'Giovedì',   short: 'Gio' },
    { n: 5, label: 'Venerdì',   short: 'Ven' },
    { n: 6, label: 'Sabato',    short: 'Sab' },
    { n: 0, label: 'Domenica',  short: 'Dom' }
  ];

  var MODE_LABELS = {
    full:           'Chiuso tutto il giorno',
    morning_only:   'Aperti solo mattina',
    afternoon_only: 'Aperti solo pomeriggio',
    custom:         'Orario personalizzato'
  };
  var SCOPE_LABELS = { both: 'Entrambi', george: 'George', berlin: 'Berlin' };

  // Widget della dashboard riordinabili. id = chiave persistita; sel = elemento reale.
  var WIDGET_DEFS = [
    { id: 'prossimo', label: 'Prossimo appuntamento', sel: '.prossimo-card' },
    { id: 'kpi',      label: 'Statistiche / KPI',      sel: '.kpi-row' },
    { id: 'charts',   label: 'Grafici',                sel: '.charts-grid' },
    { id: 'today',    label: 'Oggi',                   sel: '#todaySection' },
    { id: 'list',     label: 'Prossimi / Lista',       sel: '#aptList' }
  ];

  var DEFAULT_LAYOUT = {
    widgets: WIDGET_DEFS.map(function (w, i) { return { id: w.id, visible: true, order: i }; }),
    theme: 'dark',
    default_view: 'list'
  };

  // ── Stato modulo ───────────────────────────────────────────
  var A = null;              // bridge window.MBAdmin
  var built = false;         // overlay markup costruito
  var bundle = null;         // GET /api/settings cache
  var currentLayout = null;  // layout dashboard corrente
  var prefsSaveTimer = null; // debounce PUT /api/preferences
  var sortableInstance = null;
  var clEditMode = false;    // form chiusure aperto

  // ── Helper escape (riusa quello di admin.js se presente) ───
  function esc(s) {
    if (A && A.esc) return A.esc(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function $(id) { return document.getElementById(id); }

  // ── Fetch autenticata verso le Functions /api/* ────────────
  function apiFetch(path, opts) {
    opts = opts || {};
    return A.getAccessToken().then(function (token) {
      if (!token) { return handleAuthExpired(); }
      var headers = opts.headers || {};
      headers['Authorization'] = 'Bearer ' + token;
      if (opts.body) headers['Content-Type'] = 'application/json';
      return fetch(path, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined
      }).then(function (res) {
        if (res.status === 401) { return handleAuthExpired(); }
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) {
            var msg = (data && data.error) ? data.error : ('Errore ' + res.status);
            var err = new Error(msg);
            err.status = res.status;
            throw err;
          }
          return data;
        });
      });
    });
  }

  function handleAuthExpired() {
    toast('Sessione scaduta. Effettua di nuovo l\'accesso.', 'error');
    closeOverlay();
    if (A && A.signOut) A.signOut();
    return Promise.reject(new Error('auth-expired'));
  }

  // ── Toast effimero ─────────────────────────────────────────
  function toast(text, type) {
    var t = document.createElement('div');
    t.className = 'st-toast st-toast--' + (type || 'ok');
    t.setAttribute('role', 'status');
    t.textContent = text;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('is-shown'); });
    setTimeout(function () {
      t.classList.remove('is-shown');
      setTimeout(function () { t.remove(); }, 300);
    }, 3200);
  }

  /* ==========================================================
     OVERLAY: costruzione markup + tab
     ========================================================== */
  function buildOverlay() {
    if (built) return;
    built = true;

    var overlay = document.createElement('div');
    overlay.className = 'settings-overlay';
    overlay.id = 'settingsOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Impostazioni');
    overlay.innerHTML =
      '<div class="settings-panel" id="settingsPanel" role="document">' +
        '<header class="settings-topbar">' +
          '<div class="settings-topbar-title">Impostazioni</div>' +
          '<button class="settings-close" id="settingsClose" type="button" aria-label="Chiudi impostazioni">' +
            '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">' +
              '<path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
            '</svg>' +
          '</button>' +
        '</header>' +
        '<nav class="settings-tabs" id="settingsTabs" role="tablist" aria-label="Sezioni impostazioni">' +
          '<button class="settings-tab is-active" role="tab" aria-selected="true" data-tab="orari" id="tabBtnOrari" aria-controls="tabPanelOrari">Orari</button>' +
          '<button class="settings-tab" role="tab" aria-selected="false" data-tab="filtri" id="tabBtnFiltri" aria-controls="tabPanelFiltri">Filtri</button>' +
          '<button class="settings-tab" role="tab" aria-selected="false" data-tab="servizi" id="tabBtnServizi" aria-controls="tabPanelServizi">Servizi</button>' +
          '<button class="settings-tab" role="tab" aria-selected="false" data-tab="dashboard" id="tabBtnDashboard" aria-controls="tabPanelDashboard">Dashboard</button>' +
        '</nav>' +
        '<div class="settings-body">' +
          '<section class="settings-tabpanel is-active" id="tabPanelOrari" role="tabpanel" aria-labelledby="tabBtnOrari" tabindex="0"></section>' +
          '<section class="settings-tabpanel" id="tabPanelFiltri" role="tabpanel" aria-labelledby="tabBtnFiltri" tabindex="0" hidden></section>' +
          '<section class="settings-tabpanel" id="tabPanelServizi" role="tabpanel" aria-labelledby="tabBtnServizi" tabindex="0" hidden></section>' +
          '<section class="settings-tabpanel" id="tabPanelDashboard" role="tabpanel" aria-labelledby="tabBtnDashboard" tabindex="0" hidden></section>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    // Tab "Filtri": sposta (NON duplica) i controlli filtro già presenti in
    // #filtersHost dentro il pannello. admin.js ha cablato i loro id al boot;
    // spostando i nodi mantiene gli stessi handler/stato senza riassociazioni.
    var filtersHost = $('filtersHost');
    var filtriPanel = $('tabPanelFiltri');
    if (filtersHost && filtriPanel) {
      var intro = document.createElement('p');
      intro.className = 'st-card-sub st-filters-intro';
      intro.textContent = 'Filtra la lista appuntamenti per barbiere e stato.';
      filtriPanel.appendChild(intro);
      while (filtersHost.firstChild) { filtriPanel.appendChild(filtersHost.firstChild); }
      filtersHost.parentNode && filtersHost.parentNode.removeChild(filtersHost);
    }

    // Chiusura
    $('settingsClose').addEventListener('click', closeOverlay);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeOverlay();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('is-open')) closeOverlay();
    });

    // Tab switching
    $('settingsTabs').addEventListener('click', function (e) {
      var btn = e.target.closest('.settings-tab');
      if (btn) switchTab(btn.dataset.tab);
    });
    $('settingsTabs').addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var tabs = Array.prototype.slice.call(this.querySelectorAll('.settings-tab'));
      var idx = tabs.indexOf(document.activeElement);
      if (idx === -1) return;
      var next = e.key === 'ArrowRight' ? (idx + 1) % tabs.length : (idx - 1 + tabs.length) % tabs.length;
      tabs[next].focus();
      switchTab(tabs[next].dataset.tab);
    });
  }

  function switchTab(name) {
    var map = { orari: 'Orari', filtri: 'Filtri', servizi: 'Servizi', dashboard: 'Dashboard' };
    Object.keys(map).forEach(function (key) {
      var isActive = (key === name);
      var btn = $('tabBtn' + map[key]);
      var panel = $('tabPanel' + map[key]);
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      panel.classList.toggle('is-active', isActive);
      if (isActive) { panel.removeAttribute('hidden'); } else { panel.setAttribute('hidden', ''); }
    });
    if (name === 'dashboard') initSortable();
  }

  function openOverlay() {
    buildOverlay();
    var overlay = $('settingsOverlay');
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    // Carica dati la prima volta / refresh
    loadSettingsBundle();
    renderDashboardTab(); // usa currentLayout già caricato all'avvio
    setTimeout(function () { $('settingsClose').focus(); }, 50);
  }

  function closeOverlay() {
    var overlay = $('settingsOverlay');
    if (!overlay) return;
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
    if (sortableInstance) { sortableInstance.destroy(); sortableInstance = null; }
    var trigger = $('settingsTriggerBtn');
    if (trigger) trigger.focus();
  }

  /* ==========================================================
     SEZIONE 1: ORARI & DISPONIBILITÀ
     ========================================================== */
  function loadSettingsBundle() {
    var orari = $('tabPanelOrari');
    var servizi = $('tabPanelServizi');
    orari.innerHTML = skeleton(3);
    servizi.innerHTML = skeleton(4);
    apiFetch('/api/settings').then(function (data) {
      bundle = data || {};
      renderOrariTab();
      renderServiziTab();
    }).catch(function (err) {
      if (err.message === 'auth-expired') return;
      orari.innerHTML = errorBlock('Impossibile caricare le impostazioni. ' + esc(err.message), loadSettingsBundle);
      servizi.innerHTML = '';
    });
  }

  function renderOrariTab() {
    var panel = $('tabPanelOrari');
    var shop = (bundle && bundle.shop_settings) || {};
    var staff = (bundle && bundle.staff) ? bundle.staff.slice() : [];
    staff.sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });

    var html = '';

    // ── Card: Impostazioni shop ──
    var closedDays = shop.weekly_closed_days || [0];
    html +=
      '<div class="st-card">' +
        '<div class="st-card-hd"><h3 class="st-card-title">Disponibilità prenotazioni</h3></div>' +
        '<div class="st-field">' +
          '<span class="st-label">Giorni di chiusura settimanale</span>' +
          '<div class="st-weekday-chips" id="shopClosedDays">' +
            WEEKDAYS.map(function (d) {
              var on = closedDays.indexOf(d.n) !== -1;
              return '<button type="button" class="st-wd-chip' + (on ? ' is-on' : '') +
                '" data-wd="' + d.n + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + d.short + '</button>';
            }).join('') +
          '</div>' +
        '</div>' +
        '<div class="st-grid2">' +
          '<label class="st-field"><span class="st-label">Anticipo minimo (minuti)</span>' +
            '<input type="number" class="st-input" id="shopMinAdvance" min="0" step="5" value="' + esc(shop.min_advance_minutes != null ? shop.min_advance_minutes : 0) + '"></label>' +
          '<label class="st-field"><span class="st-label">Giorni futuri max</span>' +
            '<input type="number" class="st-input" id="shopMaxFuture" min="1" max="3650" value="' + esc(shop.max_future_days != null ? shop.max_future_days : 365) + '"></label>' +
        '</div>' +
        '<div class="st-toggle-row">' +
          toggleHtml('shopRequireEmail', 'Email obbligatoria', shop.require_email) +
          toggleHtml('shopAutoConfirm', 'Conferma automatica', shop.auto_confirm !== false) +
        '</div>' +
        '<div class="st-card-ft">' +
          '<button class="st-btn st-btn--primary" id="shopSaveBtn" type="button">Salva disponibilità</button>' +
        '</div>' +
      '</div>';

    // ── Card per ogni barbiere: orari × giorno ──
    if (!staff.length) {
      html += '<div class="st-card"><p class="st-empty">Nessun barbiere configurato. Verranno usati gli orari di default.</p></div>';
    }
    staff.forEach(function (st) {
      html +=
        '<div class="st-card" data-staff="' + esc(st.slug) + '">' +
          '<div class="st-card-hd"><h3 class="st-card-title">Orari ' + esc(st.display_name || st.slug) + '</h3>' +
            '<button class="st-btn st-btn--primary st-btn--sm" type="button" data-save-hours="' + esc(st.slug) + '">Salva orari</button></div>' +
          '<div class="st-hours-days">' +
            WEEKDAYS.filter(function (d) { return d.n !== 0; }).map(function (d) {
              return renderDayRow(st.slug, d);
            }).join('') +
          '</div>' +
        '</div>';
    });

    // ── Chiusure / Festività (migrate qui) ──
    html += renderClosuresCard();

    panel.innerHTML = html;
    wireOrariEvents();
    loadClosures();
  }

  function getRangesFor(slug, weekday) {
    var rows = (bundle && bundle.business_hours) || [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].staff_slug === slug && rows[i].weekday === weekday) {
        return Array.isArray(rows[i].ranges) ? rows[i].ranges : [];
      }
    }
    return [];
  }

  function renderDayRow(slug, day) {
    var ranges = getRangesFor(slug, day.n);
    var rangesHtml = ranges.map(function (r) { return rangeFieldHtml(r.start, r.end); }).join('');
    return (
      '<div class="st-day-row" data-weekday="' + day.n + '">' +
        '<div class="st-day-name">' + esc(day.label) + '</div>' +
        '<div class="st-day-ranges">' + rangesHtml + '</div>' +
        '<button type="button" class="st-add-range" aria-label="Aggiungi fascia oraria a ' + esc(day.label) + '">+ Fascia</button>' +
      '</div>'
    );
  }

  function rangeFieldHtml(start, end) {
    return (
      '<div class="st-range">' +
        '<input type="time" class="st-input st-input--time st-range-start" value="' + esc(start || '') + '" aria-label="Inizio">' +
        '<span class="st-range-sep">-</span>' +
        '<input type="time" class="st-input st-input--time st-range-end" value="' + esc(end || '') + '" aria-label="Fine">' +
        '<button type="button" class="st-range-del" aria-label="Rimuovi fascia">' +
          '<svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' +
        '</button>' +
      '</div>'
    );
  }

  function wireOrariEvents() {
    var panel = $('tabPanelOrari');

    // Toggle giorni chiusi
    var chipsWrap = $('shopClosedDays');
    chipsWrap.addEventListener('click', function (e) {
      var chip = e.target.closest('.st-wd-chip');
      if (!chip) return;
      var on = chip.classList.toggle('is-on');
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    // Salva shop_settings
    $('shopSaveBtn').addEventListener('click', function () {
      var btn = this;
      var closed = [];
      chipsWrap.querySelectorAll('.st-wd-chip.is-on').forEach(function (c) { closed.push(parseInt(c.dataset.wd, 10)); });
      var minAdv = parseInt($('shopMinAdvance').value, 10);
      var maxFut = parseInt($('shopMaxFuture').value, 10);
      if (isNaN(minAdv) || minAdv < 0) { toast('Anticipo minimo non valido.', 'error'); return; }
      if (isNaN(maxFut) || maxFut < 1 || maxFut > 3650) { toast('Giorni futuri max deve essere 1-3650.', 'error'); return; }
      var body = {
        weekly_closed_days: closed,
        min_advance_minutes: minAdv,
        max_future_days: maxFut,
        require_email: $('shopRequireEmail').checked,
        auto_confirm: $('shopAutoConfirm').checked
      };
      setBtnLoading(btn, true, 'Salvataggio…');
      apiFetch('/api/settings/shop', { method: 'PATCH', body: body }).then(function (res) {
        setBtnLoading(btn, false, 'Salva disponibilità');
        if (res.shop_settings) bundle.shop_settings = res.shop_settings;
        toast('Disponibilità salvata.', 'ok');
      }).catch(function (err) {
        setBtnLoading(btn, false, 'Salva disponibilità');
        if (err.message !== 'auth-expired') toast('Errore: ' + err.message, 'error');
      });
    });

    // Aggiungi / rimuovi fascia oraria
    panel.addEventListener('click', function (e) {
      var add = e.target.closest('.st-add-range');
      if (add) {
        var row = add.closest('.st-day-row');
        var box = row.querySelector('.st-day-ranges');
        box.insertAdjacentHTML('beforeend', rangeFieldHtml('', ''));
        box.querySelector('.st-range:last-child .st-range-start').focus();
        return;
      }
      var del = e.target.closest('.st-range-del');
      if (del) { del.closest('.st-range').remove(); return; }
    });

    // Salva orari di un barbiere (batch su tutti i giorni 1..6)
    panel.querySelectorAll('[data-save-hours]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var slug = btn.dataset.saveHours;
        var card = panel.querySelector('.st-card[data-staff="' + slug + '"]');
        var entries = [];
        var valid = true;
        card.querySelectorAll('.st-day-row').forEach(function (row) {
          var wd = parseInt(row.dataset.weekday, 10);
          var ranges = [];
          row.querySelectorAll('.st-range').forEach(function (rg) {
            var s = rg.querySelector('.st-range-start').value;
            var en = rg.querySelector('.st-range-end').value;
            if (!s && !en) return;          // riga vuota: ignora
            if (!s || !en || en <= s) { valid = false; rg.classList.add('st-range--err'); return; }
            rg.classList.remove('st-range--err');
            ranges.push({ start: s, end: en });
          });
          entries.push({ staff_slug: slug, weekday: wd, ranges: ranges });
        });
        if (!valid) { toast('Controlla le fasce: la fine deve essere dopo l\'inizio.', 'error'); return; }
        setBtnLoading(btn, true, 'Salvataggio…');
        apiFetch('/api/settings/hours', { method: 'PUT', body: { entries: entries } }).then(function (res) {
          setBtnLoading(btn, false, 'Salva orari');
          if (res.business_hours) {
            // aggiorna cache: rimpiazza le righe di questo barbiere
            bundle.business_hours = (bundle.business_hours || []).filter(function (r) { return r.staff_slug !== slug; }).concat(res.business_hours);
          }
          toast('Orari salvati.', 'ok');
        }).catch(function (err) {
          setBtnLoading(btn, false, 'Salva orari');
          if (err.message !== 'auth-expired') toast('Errore: ' + err.message, 'error');
        });
      });
    });
  }

  /* ── Chiusure / Festività (logica migrata da admin.js) ───── */
  function renderClosuresCard() {
    return (
      '<div class="st-card" id="closuresCard">' +
        '<div class="st-card-hd">' +
          '<div><h3 class="st-card-title">Chiusure & Festività</h3>' +
          '<p class="st-card-sub">Giorni di chiusura, ponti e mezze giornate</p></div>' +
          '<button class="st-btn st-btn--ghost st-btn--sm" id="closuresAddBtn" type="button">+ Aggiungi</button>' +
        '</div>' +
        '<form class="st-cl-form is-hidden" id="closuresForm">' +
          '<div class="st-grid2">' +
            '<label class="st-field"><span class="st-label">Per chi</span>' +
              '<select id="clScope" class="st-input"><option value="both">Entrambi</option><option value="george">Solo George</option><option value="berlin">Solo Berlin</option></select></label>' +
            '<label class="st-field"><span class="st-label">Modalità</span>' +
              '<select id="clMode" class="st-input">' +
                '<option value="full">Chiuso tutto il giorno</option>' +
                '<option value="morning_only">Aperti solo mattina</option>' +
                '<option value="afternoon_only">Aperti solo pomeriggio</option>' +
                '<option value="custom">Orario personalizzato</option>' +
              '</select></label>' +
          '</div>' +
          '<div class="st-grid2">' +
            '<label class="st-field"><span class="st-label">Dal giorno</span><input type="date" id="clStart" class="st-input" required></label>' +
            '<label class="st-field"><span class="st-label">Al giorno</span><input type="date" id="clEnd" class="st-input" required></label>' +
          '</div>' +
          '<div class="st-grid2 is-hidden" id="clCustomRow">' +
            '<label class="st-field"><span class="st-label">Apre</span><input type="time" id="clCustomStart" class="st-input"></label>' +
            '<label class="st-field"><span class="st-label">Chiude</span><input type="time" id="clCustomEnd" class="st-input"></label>' +
          '</div>' +
          '<label class="st-field"><span class="st-label">Nota (opzionale)</span><input type="text" id="clNote" class="st-input" maxlength="200" placeholder="Es. Ponte 2 giugno"></label>' +
          '<div class="st-cl-msg" id="clMsg"></div>' +
          '<div class="st-card-ft">' +
            '<button type="button" class="st-btn st-btn--ghost" id="clCancelBtn">Annulla</button>' +
            '<button type="submit" class="st-btn st-btn--primary" id="clSaveBtn">Salva chiusura</button>' +
          '</div>' +
        '</form>' +
        '<div class="st-cl-list" id="closuresList"></div>' +
        '<p class="st-empty is-hidden" id="closuresEmpty">Nessuna chiusura programmata.</p>' +
      '</div>'
    );
  }

  function clShowMsg(text, type) {
    var el = $('clMsg'); if (!el) return;
    el.textContent = text;
    el.className = 'st-cl-msg' + (type ? ' is-' + type : '');
  }

  function wireClosuresEvents() {
    var clForm = $('closuresForm');
    var clAddBtn = $('closuresAddBtn');
    var clCancelBtn = $('clCancelBtn');
    var clModeSel = $('clMode');
    var clCustomRow = $('clCustomRow');
    if (!clForm) return;

    function toggleCustomRow() {
      clCustomRow.classList.toggle('is-hidden', clModeSel.value !== 'custom');
    }
    clModeSel.addEventListener('change', toggleCustomRow);

    clAddBtn.addEventListener('click', function () {
      clEditMode = clForm.classList.contains('is-hidden');
      if (clEditMode) {
        clForm.classList.remove('is-hidden');
        clAddBtn.textContent = '− Chiudi';
        var today = new Date().toISOString().slice(0, 10);
        $('clStart').value = today;
        $('clEnd').value = today;
        clShowMsg('', '');
        toggleCustomRow();
      } else {
        clForm.classList.add('is-hidden');
        clAddBtn.textContent = '+ Aggiungi';
      }
    });

    clCancelBtn.addEventListener('click', function () {
      clForm.classList.add('is-hidden');
      clAddBtn.textContent = '+ Aggiungi';
    });

    clForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var scope = $('clScope').value;
      var mode = clModeSel.value;
      var start = $('clStart').value;
      var end = $('clEnd').value;
      var note = $('clNote').value.trim();
      if (!start || !end) { clShowMsg('Inserisci le date.', 'error'); return; }
      if (end < start) { clShowMsg('La data finale precede quella iniziale.', 'error'); return; }

      var payload = { scope: scope, start_date: start, end_date: end, mode: mode, custom_start: null, custom_end: null, note: note || null };
      if (mode === 'custom') {
        var cs = $('clCustomStart').value, ce = $('clCustomEnd').value;
        if (!cs || !ce) { clShowMsg('Inserisci orario di apertura e chiusura.', 'error'); return; }
        if (ce <= cs) { clShowMsg('L\'orario di chiusura deve essere dopo l\'apertura.', 'error'); return; }
        payload.custom_start = cs; payload.custom_end = ce;
      }
      var clSaveBtn = $('clSaveBtn');
      setBtnLoading(clSaveBtn, true, 'Salvataggio…');
      // Chiusure usano il client Supabase diretto (RLS), come nell'originale.
      A.sb.from('closures').insert(payload).then(function (res) {
        setBtnLoading(clSaveBtn, false, 'Salva chiusura');
        if (res.error) { clShowMsg('Errore: ' + res.error.message, 'error'); return; }
        clForm.classList.add('is-hidden');
        $('closuresAddBtn').textContent = '+ Aggiungi';
        $('clNote').value = '';
        loadClosures();
      });
    });
  }

  function fmtDmy(ds) {
    var d = new Date(ds + 'T12:00:00');
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
  }

  function loadClosures() {
    wireClosuresEvents();
    var listEl = $('closuresList');
    var emptyEl = $('closuresEmpty');
    if (!listEl) return;
    listEl.innerHTML = '<div class="st-cl-loading">Caricamento…</div>';
    var todayStr = new Date().toISOString().slice(0, 10);
    A.sb.from('closures').select('*').gte('end_date', todayStr).order('start_date', { ascending: true }).then(function (res) {
      listEl.innerHTML = '';
      if (res.error) { emptyEl.classList.add('is-hidden'); listEl.innerHTML = errorBlock('Errore caricamento chiusure.', loadClosures); return; }
      var rows = res.data || [];
      if (!rows.length) { emptyEl.classList.remove('is-hidden'); return; }
      emptyEl.classList.add('is-hidden');
      rows.forEach(function (c) {
        var dates = c.start_date === c.end_date ? fmtDmy(c.start_date) : fmtDmy(c.start_date) + ' → ' + fmtDmy(c.end_date);
        var modeLabel = MODE_LABELS[c.mode] || c.mode;
        if (c.mode === 'custom' && c.custom_start && c.custom_end) {
          modeLabel = 'Aperti ' + c.custom_start.slice(0, 5) + '-' + c.custom_end.slice(0, 5);
        }
        var row = document.createElement('div');
        row.className = 'st-cl-row';
        row.innerHTML =
          '<div class="st-cl-dates">' + esc(dates) + '</div>' +
          '<div class="st-cl-info">' +
            '<div class="st-cl-mode">' + esc(modeLabel) + '</div>' +
            '<div class="st-cl-meta"><span class="st-cl-pill">' + esc(SCOPE_LABELS[c.scope] || c.scope) + '</span>' + (c.note ? esc(c.note) : '') + '</div>' +
          '</div>' +
          '<button class="st-cl-del" data-id="' + esc(c.id) + '" aria-label="Elimina chiusura">Elimina</button>';
        row.querySelector('.st-cl-del').addEventListener('click', function () {
          var b = this; b.disabled = true; b.textContent = '…';
          A.sb.from('closures').delete().eq('id', c.id).then(function (r2) {
            if (r2.error) { b.disabled = false; b.textContent = 'Elimina'; toast('Errore eliminazione.', 'error'); }
            else { loadClosures(); }
          });
        });
        listEl.appendChild(row);
      });
    });
  }

  /* ==========================================================
     SEZIONE 2: SERVIZI (nessun prezzo)
     ========================================================== */
  function renderServiziTab() {
    var panel = $('tabPanelServizi');
    var services = (bundle && bundle.services) ? bundle.services.slice() : [];
    services.sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });

    var rows = services.map(function (s) { return serviceRowHtml(s); }).join('');
    panel.innerHTML =
      '<div class="st-card">' +
        '<div class="st-card-hd">' +
          '<div><h3 class="st-card-title">Servizi</h3><p class="st-card-sub">Trascina per riordinare. Nessun prezzo.</p></div>' +
        '</div>' +
        '<div class="st-svc-list" id="svcList">' + (rows || '<p class="st-empty">Nessun servizio. Aggiungine uno qui sotto.</p>') + '</div>' +
        '<form class="st-svc-add" id="svcAddForm">' +
          '<input type="text" class="st-input" id="svcNewName" placeholder="Nome servizio" maxlength="60" required aria-label="Nome nuovo servizio">' +
          '<input type="number" class="st-input st-input--narrow" id="svcNewDur" placeholder="min" min="1" max="600" aria-label="Durata minuti (opzionale)">' +
          '<button class="st-btn st-btn--primary" type="submit">Aggiungi</button>' +
        '</form>' +
      '</div>';
    wireServiziEvents();
  }

  function serviceRowHtml(s) {
    return (
      '<div class="st-svc-row" data-id="' + esc(s.id) + '">' +
        '<span class="st-svc-handle" aria-hidden="true">' +
          '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="4" cy="3" r="1.2"/><circle cx="10" cy="3" r="1.2"/><circle cx="4" cy="7" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="4" cy="11" r="1.2"/><circle cx="10" cy="11" r="1.2"/></svg>' +
        '</span>' +
        '<span class="st-svc-name">' + esc(s.name) + '</span>' +
        '<span class="st-svc-dur">' + (s.duration_min ? esc(s.duration_min) + ' min' : 'durata barbiere') + '</span>' +
        toggleHtml('svcActive_' + s.id, '', s.active !== false, 'st-svc-toggle') +
        '<button class="st-svc-del" type="button" data-del="' + esc(s.id) + '" aria-label="Elimina servizio ' + esc(s.name) + '">' +
          '<svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' +
        '</button>' +
      '</div>'
    );
  }

  function wireServiziEvents() {
    var list = $('svcList');

    // Riordino drag-and-drop
    if (window.Sortable && list && list.querySelector('.st-svc-row')) {
      Sortable.create(list, {
        handle: '.st-svc-handle',
        animation: 150,
        ghostClass: 'st-svc-row--ghost',
        onEnd: function () {
          var ids = Array.prototype.map.call(list.querySelectorAll('.st-svc-row'), function (r) { return r.dataset.id; });
          ids.forEach(function (id, i) {
            apiFetch('/api/settings/services', { method: 'PATCH', body: { id: id, sort_order: i } }).catch(function () {});
          });
          toast('Ordine servizi aggiornato.', 'ok');
        }
      });
    }

    // Toggle attivo
    list.addEventListener('change', function (e) {
      var cb = e.target.closest('input[type="checkbox"]');
      if (!cb) return;
      var row = cb.closest('.st-svc-row');
      var id = row.dataset.id;
      apiFetch('/api/settings/services', { method: 'PATCH', body: { id: id, active: cb.checked } }).then(function () {
        toast('Servizio aggiornato.', 'ok');
      }).catch(function (err) {
        cb.checked = !cb.checked;
        if (err.message !== 'auth-expired') toast('Errore: ' + err.message, 'error');
      });
    });

    // Elimina
    list.addEventListener('click', function (e) {
      var del = e.target.closest('.st-svc-del');
      if (!del) return;
      var row = del.closest('.st-svc-row');
      var id = del.dataset.del;
      del.disabled = true;
      apiFetch('/api/settings/services?id=' + encodeURIComponent(id), { method: 'DELETE' }).then(function () {
        row.remove();
        if (bundle.services) bundle.services = bundle.services.filter(function (s) { return s.id !== id; });
        toast('Servizio eliminato.', 'ok');
      }).catch(function (err) {
        del.disabled = false;
        if (err.message !== 'auth-expired') toast('Errore: ' + err.message, 'error');
      });
    });

    // Aggiungi
    $('svcAddForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('svcNewName').value.trim();
      var durRaw = $('svcNewDur').value;
      if (!name) { toast('Inserisci un nome.', 'error'); return; }
      var body = { name: name };
      if (durRaw) {
        var dur = parseInt(durRaw, 10);
        if (isNaN(dur) || dur < 1 || dur > 600) { toast('Durata 1-600 minuti.', 'error'); return; }
        body.duration_min = dur;
      }
      body.sort_order = (bundle.services || []).length;
      var btn = this.querySelector('button[type="submit"]');
      setBtnLoading(btn, true, '…');
      apiFetch('/api/settings/services', { method: 'POST', body: body }).then(function (res) {
        setBtnLoading(btn, false, 'Aggiungi');
        if (res.service) {
          bundle.services = (bundle.services || []).concat(res.service);
          renderServiziTab();
          toast('Servizio aggiunto.', 'ok');
        }
      }).catch(function (err) {
        setBtnLoading(btn, false, 'Aggiungi');
        if (err.message === 'auth-expired') return;
        toast(err.status === 409 ? 'Esiste già un servizio con questo nome.' : 'Errore: ' + err.message, 'error');
      });
    });
  }

  /* ==========================================================
     SEZIONE 3: DASHBOARD PERSONALIZZABILE
     ========================================================== */
  function loadPreferences() {
    return apiFetch('/api/preferences').then(function (data) {
      var layout = (data && data.layout && data.layout.widgets) ? data.layout : null;
      currentLayout = normalizeLayout(layout);
      applyLayout();
      return currentLayout;
    }).catch(function (err) {
      // Fallback ai default: nessuna regressione se le preferenze non caricano
      currentLayout = normalizeLayout(null);
      applyLayout();
      if (err.message !== 'auth-expired') {
        // silenzioso: la dashboard funziona comunque con i default
      }
      return currentLayout;
    });
  }

  function normalizeLayout(layout) {
    var out = { widgets: [], theme: 'dark', default_view: 'list' };
    if (layout) {
      out.theme = (layout.theme === 'light') ? 'light' : 'dark';
      out.default_view = (layout.default_view === 'day') ? 'day' : 'list';
    }
    var byId = {};
    if (layout && Array.isArray(layout.widgets)) {
      layout.widgets.forEach(function (w) { if (w && w.id) byId[w.id] = w; });
    }
    WIDGET_DEFS.forEach(function (def, i) {
      var saved = byId[def.id];
      out.widgets.push({
        id: def.id,
        visible: saved ? saved.visible !== false : true,
        order: saved && typeof saved.order === 'number' ? saved.order : i
      });
    });
    out.widgets.sort(function (a, b) { return a.order - b.order; });
    out.widgets.forEach(function (w, i) { w.order = i; });
    return out;
  }

  // Applica order/visibilità ai veri elementi della dashboard + tema
  function applyLayout() {
    if (!currentLayout) return;
    var dash = $('dashSection');
    if (dash) dash.classList.add('dash-customizable');
    // display:contents su .stats-section così kpi/charts diventano flex item ordinabili
    var stats = document.querySelector('.stats-section');
    if (stats) stats.classList.add('stats-section--flat');

    currentLayout.widgets.forEach(function (w) {
      var def = widgetDef(w.id);
      if (!def) return;
      var el = document.querySelector(def.sel);
      if (!el) return;
      el.style.order = String(w.order);
      el.classList.toggle('widget-hidden', !w.visible);
    });

    // Tema
    document.documentElement.setAttribute('data-mb-theme', currentLayout.theme);
  }

  function widgetDef(id) {
    for (var i = 0; i < WIDGET_DEFS.length; i++) if (WIDGET_DEFS[i].id === id) return WIDGET_DEFS[i];
    return null;
  }

  function renderDashboardTab() {
    var panel = $('tabPanelDashboard');
    if (!panel) return;
    if (!currentLayout) { panel.innerHTML = skeleton(2); return; }
    var lay = currentLayout;

    var widgetRows = lay.widgets.map(function (w) {
      var def = widgetDef(w.id);
      return (
        '<li class="st-widget-item" data-id="' + esc(w.id) + '">' +
          '<span class="st-widget-handle" aria-hidden="true">' +
            '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="4" cy="3" r="1.2"/><circle cx="10" cy="3" r="1.2"/><circle cx="4" cy="7" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="4" cy="11" r="1.2"/><circle cx="10" cy="11" r="1.2"/></svg>' +
          '</span>' +
          '<span class="st-widget-name">' + esc(def ? def.label : w.id) + '</span>' +
          toggleHtml('wdgVis_' + w.id, '', w.visible, 'st-widget-toggle') +
        '</li>'
      );
    }).join('');

    panel.innerHTML =
      '<div class="st-card">' +
        '<div class="st-card-hd"><div><h3 class="st-card-title">Tema</h3><p class="st-card-sub">Aspetto del gestionale</p></div></div>' +
        '<div class="st-theme-row" id="themeRow">' +
          themeOptHtml('dark', 'Scuro', lay.theme === 'dark') +
          themeOptHtml('light', 'Chiaro', lay.theme === 'light') +
        '</div>' +
      '</div>' +
      '<div class="st-card">' +
        '<div class="st-card-hd"><div><h3 class="st-card-title">Vista predefinita</h3><p class="st-card-sub">Cosa mostrare per primo</p></div></div>' +
        '<div class="st-theme-row" id="viewRow">' +
          themeOptHtml('list', 'Lista', lay.default_view === 'list') +
          themeOptHtml('day', 'Giornaliera', lay.default_view === 'day') +
        '</div>' +
      '</div>' +
      '<div class="st-card">' +
        '<div class="st-card-hd"><div><h3 class="st-card-title">Widget</h3><p class="st-card-sub">Trascina per riordinare, interruttore per mostrare/nascondere</p></div></div>' +
        '<ul class="st-widget-list" id="widgetList">' + widgetRows + '</ul>' +
      '</div>';

    wireDashboardEvents();
    initSortable();
  }

  function themeOptHtml(value, label, active) {
    return '<button type="button" class="st-seg' + (active ? ' is-active' : '') + '" data-val="' + esc(value) + '" aria-pressed="' + (active ? 'true' : 'false') + '">' + esc(label) + '</button>';
  }

  function initSortable() {
    var list = $('widgetList');
    if (!list || !window.Sortable) return;
    if (sortableInstance) { sortableInstance.destroy(); sortableInstance = null; }
    sortableInstance = Sortable.create(list, {
      handle: '.st-widget-handle',
      animation: 150,
      ghostClass: 'st-widget-item--ghost',
      onEnd: function () {
        var ids = Array.prototype.map.call(list.querySelectorAll('.st-widget-item'), function (r) { return r.dataset.id; });
        ids.forEach(function (id, i) {
          var w = currentLayout.widgets.filter(function (x) { return x.id === id; })[0];
          if (w) w.order = i;
        });
        currentLayout.widgets.sort(function (a, b) { return a.order - b.order; });
        applyLayout();
        savePreferencesDebounced();
      }
    });
  }

  function wireDashboardEvents() {
    // Tema
    $('themeRow').addEventListener('click', function (e) {
      var b = e.target.closest('.st-seg'); if (!b) return;
      segSelect(this, b);
      currentLayout.theme = b.dataset.val;
      applyLayout();
      savePreferencesDebounced();
    });
    // Vista default
    $('viewRow').addEventListener('click', function (e) {
      var b = e.target.closest('.st-seg'); if (!b) return;
      segSelect(this, b);
      currentLayout.default_view = b.dataset.val;
      savePreferencesDebounced();
    });
    // Visibilità widget
    $('widgetList').addEventListener('change', function (e) {
      var cb = e.target.closest('input[type="checkbox"]'); if (!cb) return;
      var item = cb.closest('.st-widget-item');
      var id = item.dataset.id;
      var w = currentLayout.widgets.filter(function (x) { return x.id === id; })[0];
      if (w) { w.visible = cb.checked; applyLayout(); savePreferencesDebounced(); }
    });
  }

  function segSelect(group, btn) {
    group.querySelectorAll('.st-seg').forEach(function (s) {
      var on = s === btn;
      s.classList.toggle('is-active', on);
      s.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function savePreferencesDebounced() {
    if (prefsSaveTimer) clearTimeout(prefsSaveTimer);
    prefsSaveTimer = setTimeout(function () {
      apiFetch('/api/preferences', { method: 'PUT', body: { layout: currentLayout } }).catch(function (err) {
        if (err.message !== 'auth-expired') toast('Salvataggio layout non riuscito.', 'error');
      });
    }, 700);
  }

  /* ==========================================================
     UI helper condivisi
     ========================================================== */
  function toggleHtml(id, label, checked, extraClass) {
    return (
      '<label class="st-toggle ' + (extraClass || '') + '">' +
        '<input type="checkbox" id="' + esc(id) + '"' + (checked ? ' checked' : '') + '>' +
        '<span class="st-toggle-track" aria-hidden="true"><span class="st-toggle-thumb"></span></span>' +
        (label ? '<span class="st-toggle-label">' + esc(label) + '</span>' : '') +
      '</label>'
    );
  }

  function skeleton(n) {
    var s = '';
    for (var i = 0; i < n; i++) s += '<div class="st-skel"></div>';
    return s;
  }

  function errorBlock(msg, retryFn) {
    var id = 'retry_' + Math.random().toString(36).slice(2);
    setTimeout(function () {
      var b = document.getElementById(id);
      if (b && retryFn) b.addEventListener('click', retryFn);
    }, 0);
    return '<div class="st-error" role="alert"><p>' + esc(msg) + '</p><button class="st-btn st-btn--ghost st-btn--sm" id="' + id + '" type="button">Riprova</button></div>';
  }

  function setBtnLoading(btn, loading, text) {
    if (!btn) return;
    btn.disabled = loading;
    if (text != null) btn.textContent = text;
  }

  /* ==========================================================
     INIT
     ========================================================== */
  function init() {
    A = window.MBAdmin;
    if (!A) return;

    // Entrypoint: bottone ingranaggio nell'header dashboard
    var trigger = $('settingsTriggerBtn');
    if (trigger) trigger.addEventListener('click', openOverlay);
  }

  // onDashReady: chiamato da admin.js quando la dashboard è pronta (post-login).
  // Carica le preferenze e applica il layout salvato senza aprire l'overlay.
  function onDashReady() {
    A = window.MBAdmin;
    if (!A) return;
    loadPreferences();
  }

  // Espone l'API del modulo al bridge
  window.MBSettings = { init: init, onDashReady: onDashReady };

  // Auto-init: admin.js viene caricato PRIMA, quindi window.MBAdmin esiste già.
  if (window.MBAdmin) {
    init();
    if (window.MBAdmin._ready) { /* dash già montata in showDash? onDashReady la gestisce */ }
  } else {
    // Fallback difensivo: se l'ordine cambiasse, ritenta a DOM pronto.
    document.addEventListener('DOMContentLoaded', function () { if (window.MBAdmin) init(); });
  }
})();
