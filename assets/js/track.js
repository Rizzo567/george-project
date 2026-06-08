/* ─────────────────────────────────────────────────────────────────────────────
 * Mister Barber — Analitiche navigazione (privacy-first, anonime)
 *
 * Cosa misura:
 *   - tempo VISIBILE per pagina (index.html / prenota.html)
 *   - time-to-book: da apertura prenota.html alla conferma prenotazione
 *
 * Cosa NON fa:
 *   - nessun PII, nessun cookie, nessun fingerprint, nessun id visitatore
 *   - nessuna riga-evento per visita: solo bump di contatori aggregati
 *
 * Trasporto: RPC Supabase `bump_nav` (SECURITY DEFINER, anon execute).
 * La anon key è pubblica per design (sicurezza via RLS) → vedi assets/js/config.js
 * ───────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://ccmpysycifufktbrkiot.supabase.co';
  var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjbXB5c3ljaWZ1Zmt0YnJraW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NjA3NzYsImV4cCI6MjA5NDQzNjc3Nn0.G0qWDUmFHGuVsEqX3TqbW0ztyqxTwyyoPYqmluXGAMA';
  var RPC_URL = SUPABASE_URL + '/rest/v1/rpc/bump_nav';

  function bump(metric, ms) {
    ms = Math.round(ms);
    if (!(ms >= 1000) || ms > 1800000) return; // scarta <1s e >30min (garbage)
    try {
      fetch(RPC_URL, {
        method: 'POST',
        keepalive: true, // sopravvive all'unload della pagina
        headers: {
          apikey: ANON_KEY,
          Authorization: 'Bearer ' + ANON_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ p_metric: metric, p_ms: ms })
      }).catch(function () {});
    } catch (e) { /* best-effort: l'analitica non deve mai rompere la pagina */ }
  }

  // Metrica pagina dal path
  var path = (location.pathname || '').toLowerCase();
  var pageMetric = /prenota/.test(path)
    ? 'page_prenota'
    : (/(index|^\/$|\/$)/.test(path) ? 'page_index' : null);

  var START = Date.now();

  // ── Accounting del tempo VISIBILE (esclude tab in background) ──────────────
  var visibleAcc = 0;          // ms visibili accumulati
  var flushed = 0;             // ms già inviati (delta-flush, niente doppi conteggi)
  var lastResume = (document.visibilityState === 'visible') ? Date.now() : null;

  function settle() {
    if (lastResume != null) { visibleAcc += Date.now() - lastResume; lastResume = null; }
  }
  function resume() {
    if (lastResume == null) lastResume = Date.now();
  }
  function flushPage() {
    if (!pageMetric) return;
    settle();
    var delta = visibleAcc - flushed;
    if (delta >= 1000) { bump(pageMetric, delta); flushed = visibleAcc; }
    if (document.visibilityState === 'visible') resume();
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) flushPage(); else resume();
  });
  window.addEventListener('pagehide', flushPage);

  // ── Time-to-book: prenota.html chiama MBTrack.markBooked() al successo ─────
  var booked = false;
  window.MBTrack = {
    markBooked: function () {
      if (booked) return;
      booked = true;
      bump('ttb', Date.now() - START);
    }
  };
})();
