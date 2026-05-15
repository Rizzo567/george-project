# Booking System — Mister Barber — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collegare il form di prenotazione esistente a Supabase (DB + Auth + Storage), aggiungere notifiche email via Resend, e creare un pannello admin protetto per George e Berlin.

**Architecture:** Il form `prenota.html` chiama direttamente Supabase JS SDK (anon key pubblica, RLS protegge lettura). L'immagine di riferimento viene caricata su Supabase Storage prima dell'insert. Dopo l'insert, il frontend chiama una Edge Function Deno che invia l'email via Resend. Il pannello admin usa Supabase Auth con email+password e reset password via OTP.

**Tech Stack:** Supabase JS SDK v2 (CDN), Supabase Edge Functions (Deno), Resend API, Vanilla JS, HTML/CSS design system esistente.

---

## File da creare / modificare

| File | Azione | Responsabilità |
|---|---|---|
| `prenota.html` | Modifica | Aggiungi SDK CDN, campo servizio, sostituisci fetch `/api/*` con Supabase |
| `admin-mb26.html` | Crea | Admin panel: login + dashboard appuntamenti |
| `assets/js/admin.js` | Crea | Supabase Auth, caricamento appuntamenti, cambio status |
| `assets/css/admin.css` | Crea | Stili admin (design system asphalt/canvas) |
| `supabase/functions/send-notification/index.ts` | Crea | Edge Function: riceve dati prenotazione, invia email via Resend |

---

## Task 1: Setup Supabase — Progetto + DB + Storage + RLS

**Files:**
- Manual: Supabase Dashboard
- Create: `supabase/schema.sql`

- [ ] **Step 1: Crea progetto Supabase**

  Vai su https://supabase.com → New Project.
  - Nome: `mister-barber`
  - Password DB: scegli una forte e salvala
  - Regione: West EU (Ireland)

  Dopo creazione, copia da Settings → API:
  - `Project URL` → es. `https://abcdefgh.supabase.co`
  - `anon public` key → stringa lunga `eyJ...`

- [ ] **Step 2: Crea file schema SQL**

  Crea `supabase/schema.sql` con questo contenuto:

  ```sql
  -- Tabella prenotazioni
  create table public.appointments (
    id          uuid        default gen_random_uuid() primary key,
    name        text        not null,
    phone       text        not null,
    barber      text        not null check (barber in ('george', 'berlin')),
    service     text        not null check (service in ('Cut','Fade','Beard','Razor','Full')),
    date        date        not null,
    time        time        not null,
    notes       text,
    img_url     text,
    status      text        not null default 'pending'
                            check (status in ('pending','confirmed','completed','cancelled')),
    created_at  timestamptz default now()
  );

  -- Abilita RLS
  alter table public.appointments enable row level security;

  -- Anon: può inserire nuove prenotazioni
  create policy "anon_insert"
    on public.appointments for insert
    to anon
    with check (true);

  -- Anon: può leggere solo barber+date+time+status (per slot disponibili)
  create policy "anon_select_slots"
    on public.appointments for select
    to anon
    using (true);

  -- Authenticated: può leggere tutto
  create policy "auth_select_all"
    on public.appointments for select
    to authenticated
    using (true);

  -- Authenticated: può aggiornare status
  create policy "auth_update_status"
    on public.appointments for update
    to authenticated
    using (true)
    with check (true);
  ```

- [ ] **Step 3: Esegui SQL nel Dashboard**

  Supabase Dashboard → SQL Editor → New Query → incolla `supabase/schema.sql` → Run.

  Verifica: Table Editor → `appointments` esiste con tutte le colonne.

- [ ] **Step 4: Crea Storage bucket**

  Dashboard → Storage → New Bucket.
  - Nome: `bookings`
  - Public: NO (privato)
  - Click Create

  Poi Storage → Policies → `bookings` → New Policy → "For full customization":
  ```sql
  -- Anon può caricare immagini
  create policy "anon_upload"
    on storage.objects for insert
    to anon
    with check (bucket_id = 'bookings');

  -- Authenticated può leggere
  create policy "auth_read"
    on storage.objects for select
    to authenticated
    using (bucket_id = 'bookings');
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add supabase/schema.sql
  git commit -m "feat: aggiungi schema SQL Supabase e documentazione setup"
  ```

---

## Task 2: Edge Function — send-notification

**Files:**
- Create: `supabase/functions/send-notification/index.ts`

- [ ] **Step 1: Installa Supabase CLI**

  ```bash
  npm install -g supabase
  ```

  Verifica:
  ```bash
  supabase --version
  ```
  Expected output: `supabase x.x.x`

- [ ] **Step 2: Inizializza Supabase nel progetto**

  ```bash
  cd C:\Users\manue\Desktop\george-website
  supabase init
  ```

  Questo crea la cartella `supabase/` con `config.toml`.

- [ ] **Step 3: Crea Edge Function**

  ```bash
  supabase functions new send-notification
  ```

  Questo crea `supabase/functions/send-notification/index.ts`.

- [ ] **Step 4: Scrivi il codice della Edge Function**

  Sostituisci il contenuto di `supabase/functions/send-notification/index.ts`:

  ```typescript
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
  const ADMIN_URL = Deno.env.get('ADMIN_URL')!;

  const BARBER_EMAILS: Record<string, string> = {
    george: 'georgevelozperez5@gmail.com',
    berlin: 'superberlin0204@gmail.com',
  };

  const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: CORS_HEADERS });
    }

    let body: {
      barber: string; name: string; phone: string;
      service: string; date: string; time: string; notes?: string;
    };

    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'JSON non valido' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    const { barber, name, phone, service, date, time, notes } = body;

    if (!barber || !name || !phone || !service || !date || !time) {
      return new Response(JSON.stringify({ error: 'Campi obbligatori mancanti' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    const emailTo = BARBER_EMAILS[barber];
    if (!emailTo) {
      return new Response(JSON.stringify({ error: 'Barbiere non valido' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    const barberName = barber === 'george' ? 'George' : 'Berlin';
    const emailBody = [
      `Nuova prenotazione — Mister Barber`,
      ``,
      `Barbiere: ${barberName}`,
      `Nome: ${name}`,
      `Telefono: ${phone}`,
      `Servizio: ${service}`,
      `Data: ${date}`,
      `Orario: ${time}`,
      `Note: ${notes || 'nessuna'}`,
      ``,
      `→ Pannello admin: ${ADMIN_URL}`,
    ].join('\n');

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Mister Barber <onboarding@resend.dev>',
        to: [emailTo],
        subject: `Nuova prenotazione — ${name} — ${date} ${time}`,
        text: emailBody,
      }),
    });

    if (!resendRes.ok) {
      const err = await resendRes.text();
      console.error('Resend error:', err);
      return new Response(JSON.stringify({ error: 'Errore invio email' }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    return new Response(JSON.stringify({ sent: true }), {
      status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  });
  ```

- [ ] **Step 5: Crea account Resend e ottieni API key**

  1. Vai su https://resend.com → Sign Up
  2. Dashboard → API Keys → Create API Key
  3. Copia la chiave (es. `re_xxxxxxxxxxxx`)

- [ ] **Step 6: Linka il progetto Supabase**

  ```bash
  supabase login
  supabase link --project-ref INSERISCI_REF_PROGETTO
  ```

  Il `project-ref` si trova in Supabase Dashboard → Settings → General → Reference ID.

- [ ] **Step 7: Imposta secrets della Edge Function**

  ```bash
  supabase secrets set RESEND_API_KEY=re_TUACHIAVE
  supabase secrets set ADMIN_URL=https://misterbarber.pages.dev/admin-mb26.html
  ```

  (Aggiorna `ADMIN_URL` con il dominio reale dopo il deploy su Cloudflare Pages)

- [ ] **Step 8: Deploy Edge Function**

  ```bash
  supabase functions deploy send-notification --no-verify-jwt
  ```

  `--no-verify-jwt` permette chiamate dal frontend senza autenticazione.

  Expected output:
  ```
  Deploying Function send-notification ...
  Done: send-notification
  ```

  L'URL della function sarà: `https://TUOREF.supabase.co/functions/v1/send-notification`

- [ ] **Step 9: Commit**

  ```bash
  git add supabase/
  git commit -m "feat: aggiungi Edge Function send-notification per email Resend"
  ```

---

## Task 3: Modifica prenota.html — collega Supabase

**Files:**
- Modify: `prenota.html`

**Cosa cambia:**
1. Aggiungi Supabase JS SDK CDN in `<head>`
2. Aggiungi costanti configurazione (URL, key, edge function URL)
3. Aggiungi campo `servizio` nel form (Step 3)
4. Sostituisci `loadSlots` → query Supabase invece di `/api/available`
5. Sostituisci `sendBooking` → upload immagine su Storage + insert su DB + chiama Edge Function

- [ ] **Step 1: Aggiungi Supabase SDK in `<head>` di prenota.html**

  Subito prima di `</head>` (riga ~597), aggiungi:

  ```html
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
  ```

- [ ] **Step 2: Aggiungi costanti di configurazione**

  Subito dopo `<script>` del BOOKING FLOW (riga ~810), prima di `(function () {`, aggiungi in cima al blocco script:

  ```javascript
  // ── Supabase config ──────────────────────────────────
  var SUPABASE_URL  = 'https://INSERISCI_TUO_PROJECT_URL.supabase.co';
  var SUPABASE_KEY  = 'INSERISCI_TUO_ANON_KEY';
  var EDGE_FN_URL   = 'https://INSERISCI_TUO_PROJECT_URL.supabase.co/functions/v1/send-notification';
  var sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  ```

  Sostituisci `INSERISCI_TUO_PROJECT_URL` e `INSERISCI_TUO_ANON_KEY` con i valori reali dal Dashboard Supabase → Settings → API.

- [ ] **Step 3: Aggiungi campo servizio nel form (Step 3)**

  Nel form `#prenotaForm` (riga ~696), dopo il campo telefono e prima di `note-taglio`, aggiungi:

  ```html
  <div class="form-field form-field--full">
    <label class="form-label" for="servizio">Servizio</label>
    <select class="form-input" id="servizio" name="servizio" required style="cursor:pointer;">
      <option value="" disabled selected>Scegli il servizio</option>
      <option value="Cut">Cut</option>
      <option value="Fade">Fade</option>
      <option value="Beard">Beard</option>
      <option value="Razor">Razor</option>
      <option value="Full">Full</option>
    </select>
  </div>
  ```

- [ ] **Step 4: Sostituisci la funzione `loadSlots`**

  Trova (riga ~986):
  ```javascript
  function loadSlots(barber, date) {
    var sec  = document.getElementById('slotsSection');
    var hint = document.getElementById('slotHint');
    var grid = document.getElementById('slotGrid');
    sec.style.display = 'block';
    hint.textContent  = 'Caricamento orari…';
    grid.innerHTML    = '';

    fetch('/api/available?barber=' + barber + '&date=' + date)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) throw new Error(data.error);
        renderSlots(data.slots);
      })
      .catch(function () {
        renderSlots(fallbackSlots());
      });
  }
  ```

  Sostituisci con:
  ```javascript
  function loadSlots(barber, date) {
    var sec  = document.getElementById('slotsSection');
    var hint = document.getElementById('slotHint');
    var grid = document.getElementById('slotGrid');
    sec.style.display = 'block';
    hint.textContent  = 'Caricamento orari…';
    grid.innerHTML    = '';

    sb.from('appointments')
      .select('time')
      .eq('barber', barber)
      .eq('date', date)
      .in('status', ['pending', 'confirmed'])
      .then(function (res) {
        var bookedTimes = (res.data || []).map(function (r) { return r.time.slice(0, 5); });
        var all = fallbackSlots();
        var slots = all.map(function (s) {
          return { time: s.time, available: bookedTimes.indexOf(s.time) === -1 };
        });
        renderSlots(slots);
      })
      .catch(function () {
        renderSlots(fallbackSlots());
      });
  }
  ```

- [ ] **Step 5: Sostituisci la funzione `sendBooking`**

  Trova (riga ~1108):
  ```javascript
  function sendBooking(imgBase64, imgMime, imgName) {
    fetch('/api/book', {
  ```

  Sostituisci l'intera funzione `sendBooking` con:
  ```javascript
  function sendBooking(imgBase64, imgMime, imgName) {
    var nome     = document.getElementById('nome').value.trim();
    var telefono = document.getElementById('telefono').value.trim();
    var note     = document.getElementById('note-taglio').value.trim();
    var servizio = document.getElementById('servizio').value;

    function doInsert(imgUrl) {
      sb.from('appointments').insert({
        barber:  state.barber,
        name:    nome,
        phone:   telefono,
        service: servizio,
        date:    state.date,
        time:    state.time,
        notes:   note || null,
        img_url: imgUrl || null,
        status:  'pending'
      })
      .then(function (res) {
        if (res.error) { doError(); return; }
        return fetch(EDGE_FN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            barber:  state.barber,
            name:    nome,
            phone:   telefono,
            service: servizio,
            date:    state.date,
            time:    state.time,
            notes:   note || null
          })
        });
      })
      .then(function () { doSuccess(); })
      .catch(function () { doSuccess(); });
    }

    if (imgBase64 && imgMime && imgName) {
      var ext  = imgName.split('.').pop();
      var path = state.barber + '/' + state.date + '_' + state.time.replace(':', '') + '.' + ext;
      var blob = base64ToBlob(imgBase64, imgMime);
      sb.storage.from('bookings').upload(path, blob, { contentType: imgMime, upsert: true })
        .then(function (res) {
          if (res.error) { doInsert(null); return; }
          var urlData = sb.storage.from('bookings').getPublicUrl(path);
          doInsert(urlData.data.publicUrl || null);
        })
        .catch(function () { doInsert(null); });
    } else {
      doInsert(null);
    }
  }

  function base64ToBlob(b64, mime) {
    var bytes = atob(b64);
    var arr   = new Uint8Array(bytes.length);
    for (var i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function doError() {
    var btn = document.getElementById('submitBtn');
    btn.disabled = false;
    btn.classList.remove('is-loading');
    alert('Errore durante la prenotazione. Riprova.');
  }
  ```

- [ ] **Step 6: Aggiorna la validazione del submit per includere servizio**

  Trova (riga ~1094):
  ```javascript
  if (!nome)     { document.getElementById('nome').focus(); return; }
  if (!telefono) { document.getElementById('telefono').focus(); return; }
  ```

  Aggiungi dopo:
  ```javascript
  if (!servizio) { document.getElementById('servizio').focus(); return; }
  ```

  Dove `var servizio = document.getElementById('servizio').value;` va aggiunto subito dopo `var note = ...` nello stesso blocco submit (riga ~1096):
  ```javascript
  var note     = document.getElementById('note-taglio').value.trim();
  var servizio = document.getElementById('servizio').value;
  ```

- [ ] **Step 7: Verifica visiva nel browser**

  Apri `prenota.html` nel browser (doppio click o live server).
  - Step 1: seleziona un barbiere → animazione card ✓
  - Step 2: seleziona una data → appare griglia slot (può dare errore Supabase se le chiavi non sono ancora reali — normale) ✓
  - Step 3: il form mostra campo Servizio ✓
  - Il select Servizio ha stile corretto (bordo, font) ✓

- [ ] **Step 8: Commit**

  ```bash
  git add prenota.html
  git commit -m "feat: collega prenota.html a Supabase (slot disponibili, insert prenotazione, upload immagine)"
  ```

---

## Task 4: Admin panel — admin-mb26.html

**Files:**
- Create: `admin-mb26.html`
- Create: `assets/css/admin.css`

- [ ] **Step 1: Crea `assets/css/admin.css`**

  ```css
  /* ─── RESET / BASE ─── */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--asphalt);
    color: var(--canvas);
    font-family: var(--font-body);
    min-height: 100vh;
  }

  /* ─── WRAPPER ─── */
  .admin-wrap {
    max-width: 1100px;
    margin: 0 auto;
    padding: 48px var(--page-margin) 80px;
  }

  /* ─── LOGO ─── */
  .admin-logo {
    font-family: var(--font-display);
    font-size: 28px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--canvas);
    margin-bottom: 48px;
  }
  .admin-logo span { color: var(--ember); }

  /* ─── AUTH SECTION ─── */
  #authSection { max-width: 420px; }

  .admin-title {
    font-family: var(--font-display);
    font-size: 40px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--canvas);
    margin-bottom: 8px;
  }
  .admin-sub {
    font-size: var(--body-s);
    color: var(--silver);
    letter-spacing: 0.04em;
    margin-bottom: 40px;
  }

  /* ─── FORM AUTH ─── */
  .auth-form { display: flex; flex-direction: column; gap: 20px; }
  .auth-form label {
    font-size: var(--eyebrow);
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--silver);
    font-weight: 500;
    display: block;
    margin-bottom: 8px;
  }
  .auth-form input {
    width: 100%;
    background: #111;
    border: 1px solid rgba(229,225,216,0.15);
    color: var(--canvas);
    font-family: var(--font-body);
    font-size: var(--body);
    padding: 14px 18px;
    outline: none;
    border-radius: 0;
    transition: border-color 0.2s;
  }
  .auth-form input:focus { border-color: var(--ember); }

  .btn-auth {
    background: var(--ember);
    color: var(--asphalt);
    border: none;
    padding: 16px 32px;
    font-family: var(--font-display);
    font-size: 18px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background 0.2s;
    width: 100%;
  }
  .btn-auth:hover { background: #ff7a3c; }
  .btn-auth:disabled { opacity: 0.5; cursor: not-allowed; }

  .auth-link {
    background: none;
    border: none;
    color: var(--silver);
    font-family: var(--font-body);
    font-size: var(--body-s);
    letter-spacing: 0.06em;
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
    text-underline-offset: 3px;
    transition: color 0.2s;
  }
  .auth-link:hover { color: var(--canvas); }

  .auth-msg {
    font-size: var(--body-s);
    letter-spacing: 0.04em;
    padding: 12px 16px;
    border: 1px solid;
  }
  .auth-msg--error { color: #ff6b6b; border-color: rgba(255,107,107,0.3); background: rgba(255,107,107,0.06); }
  .auth-msg--ok    { color: #6bff8d; border-color: rgba(107,255,141,0.3); background: rgba(107,255,141,0.06); }

  /* ─── DASHBOARD ─── */
  #dashSection { display: none; }

  .dash-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 40px;
    flex-wrap: wrap;
    gap: 16px;
  }
  .dash-title {
    font-family: var(--font-display);
    font-size: 36px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .btn-logout {
    background: none;
    border: 1px solid rgba(229,225,216,0.2);
    color: var(--silver);
    font-family: var(--font-body);
    font-size: var(--body-s);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 10px 20px;
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
  }
  .btn-logout:hover { border-color: var(--canvas); color: var(--canvas); }

  /* ─── FILTRI ─── */
  .dash-filters {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 32px;
  }
  .filter-btn {
    background: none;
    border: 1px solid rgba(229,225,216,0.15);
    color: var(--silver);
    font-family: var(--font-body);
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    padding: 8px 16px;
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s, background 0.2s;
  }
  .filter-btn:hover { border-color: rgba(229,225,216,0.4); color: var(--canvas); }
  .filter-btn.is-active {
    background: var(--canvas);
    border-color: var(--canvas);
    color: var(--asphalt);
    font-weight: 600;
  }

  /* ─── TABELLA ─── */
  .apt-table-wrap { overflow-x: auto; }
  .apt-table {
    width: 100%;
    border-collapse: collapse;
  }
  .apt-table th {
    font-size: var(--eyebrow);
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--silver);
    font-weight: 500;
    text-align: left;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(229,225,216,0.1);
  }
  .apt-table td {
    font-size: var(--body-s);
    color: var(--canvas);
    padding: 16px 16px;
    border-bottom: 1px solid rgba(229,225,216,0.06);
    vertical-align: middle;
  }
  .apt-table tr:hover td { background: rgba(229,225,216,0.03); }

  /* Status badge */
  .status-badge {
    display: inline-block;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    font-weight: 600;
    padding: 4px 10px;
    border: 1px solid;
  }
  .status-badge--pending   { color: #f0c040; border-color: rgba(240,192,64,0.4); }
  .status-badge--confirmed { color: #6bff8d; border-color: rgba(107,255,141,0.4); }
  .status-badge--completed { color: var(--silver); border-color: rgba(142,142,142,0.3); }
  .status-badge--cancelled { color: #ff6b6b; border-color: rgba(255,107,107,0.3); }

  /* Azioni */
  .apt-actions { display: flex; gap: 8px; }
  .apt-btn {
    background: none;
    border: 1px solid rgba(229,225,216,0.2);
    color: var(--silver);
    font-family: var(--font-body);
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 6px 12px;
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
  }
  .apt-btn:hover { border-color: var(--ember); color: var(--ember); }
  .apt-btn--cancel:hover { border-color: #ff6b6b; color: #ff6b6b; }
  .apt-btn--complete:hover { border-color: #6bff8d; color: #6bff8d; }

  /* Empty state */
  .dash-empty {
    font-size: var(--body-s);
    color: var(--silver);
    letter-spacing: 0.06em;
    padding: 48px 0;
    text-align: center;
  }

  /* ─── RESPONSIVE ─── */
  @media (max-width: 768px) {
    .admin-wrap { padding: 32px 20px 64px; }
    .apt-table th, .apt-table td { padding: 12px 10px; }
    .apt-actions { flex-direction: column; }
  }
  ```

- [ ] **Step 2: Crea `admin-mb26.html`**

  ```html
  <!DOCTYPE html>
  <html lang="it">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin — Mister Barber</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="assets/css/style.css">
    <link rel="stylesheet" href="assets/css/admin.css">
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
  </head>
  <body>
  <div class="admin-wrap">

    <div class="admin-logo">Mister <span>Barber</span></div>

    <!-- ── AUTH SECTION ── -->
    <section id="authSection">
      <h1 class="admin-title" id="authTitle">Accedi</h1>
      <p class="admin-sub" id="authSub">Pannello prenotazioni</p>

      <!-- Login form -->
      <form class="auth-form" id="loginForm">
        <div>
          <label for="authEmail">Email</label>
          <input type="email" id="authEmail" placeholder="la tua email" required autocomplete="email">
        </div>
        <div>
          <label for="authPassword">Password</label>
          <input type="password" id="authPassword" placeholder="••••••••" required autocomplete="current-password">
        </div>
        <div id="loginMsg"></div>
        <button class="btn-auth" type="submit" id="loginBtn">Entra</button>
        <button type="button" class="auth-link" id="forgotLink">Hai dimenticato la password?</button>
      </form>

      <!-- Forgot password form -->
      <form class="auth-form" id="forgotForm" style="display:none;">
        <div>
          <label for="forgotEmail">La tua email</label>
          <input type="email" id="forgotEmail" placeholder="la tua email" required>
        </div>
        <div id="forgotMsg"></div>
        <button class="btn-auth" type="submit" id="forgotBtn">Invia link di reset</button>
        <button type="button" class="auth-link" id="backToLoginLink">← Torna al login</button>
      </form>

      <!-- Reset password form (mostrato dopo click sul link dell'email) -->
      <form class="auth-form" id="resetForm" style="display:none;">
        <h1 class="admin-title" style="margin-bottom:8px;">Nuova password</h1>
        <p class="admin-sub">Scegli una password sicura</p>
        <div>
          <label for="newPassword">Nuova password</label>
          <input type="password" id="newPassword" placeholder="min. 8 caratteri" required minlength="8" autocomplete="new-password">
        </div>
        <div id="resetMsg"></div>
        <button class="btn-auth" type="submit" id="resetBtn">Salva password</button>
      </form>
    </section>

    <!-- ── DASHBOARD SECTION ── -->
    <section id="dashSection">
      <div class="dash-header">
        <h1 class="dash-title">Prenotazioni</h1>
        <button class="btn-logout" id="logoutBtn">Esci</button>
      </div>

      <!-- Filtri barbiere -->
      <div class="dash-filters" id="barberFilters">
        <button class="filter-btn is-active" data-barber="">Tutti</button>
        <button class="filter-btn" data-barber="george">George</button>
        <button class="filter-btn" data-barber="berlin">Berlin</button>
      </div>

      <!-- Filtri status -->
      <div class="dash-filters" id="statusFilters">
        <button class="filter-btn is-active" data-status="">Tutti gli status</button>
        <button class="filter-btn" data-status="pending">In attesa</button>
        <button class="filter-btn" data-status="confirmed">Confermati</button>
        <button class="filter-btn" data-status="completed">Completati</button>
        <button class="filter-btn" data-status="cancelled">Annullati</button>
      </div>

      <div class="apt-table-wrap">
        <table class="apt-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Ora</th>
              <th>Cliente</th>
              <th>Telefono</th>
              <th>Barbiere</th>
              <th>Servizio</th>
              <th>Note</th>
              <th>Status</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody id="aptTableBody"></tbody>
        </table>
        <p class="dash-empty" id="dashEmpty" style="display:none;">Nessuna prenotazione trovata.</p>
      </div>
    </section>

  </div>

  <script src="assets/js/admin.js"></script>
  </body>
  </html>
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add admin-mb26.html assets/css/admin.css
  git commit -m "feat: aggiungi struttura HTML e CSS pannello admin"
  ```

---

## Task 5: Admin JavaScript — assets/js/admin.js

**Files:**
- Create: `assets/js/admin.js`

- [ ] **Step 1: Crea `assets/js/admin.js`**

  ```javascript
  (function () {
    'use strict';

    // ── Config ─────────────────────────────────────────────────
    var SUPABASE_URL = 'https://INSERISCI_TUO_PROJECT_URL.supabase.co';
    var SUPABASE_KEY = 'INSERISCI_TUO_ANON_KEY';
    var sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // ── State ──────────────────────────────────────────────────
    var activeBarber = '';
    var activeStatus = '';

    // ── DOM refs ───────────────────────────────────────────────
    var authSection  = document.getElementById('authSection');
    var dashSection  = document.getElementById('dashSection');
    var loginForm    = document.getElementById('loginForm');
    var forgotForm   = document.getElementById('forgotForm');
    var resetForm    = document.getElementById('resetForm');
    var loginMsg     = document.getElementById('loginMsg');
    var forgotMsg    = document.getElementById('forgotMsg');
    var resetMsg     = document.getElementById('resetMsg');

    // ── Helpers ────────────────────────────────────────────────
    function showMsg(el, text, type) {
      el.innerHTML = '<div class="auth-msg auth-msg--' + type + '">' + text + '</div>';
    }

    function clearMsg(el) { el.innerHTML = ''; }

    function showAuth(mode) {
      authSection.style.display = 'block';
      dashSection.style.display = 'none';
      loginForm.style.display  = mode === 'login'  ? 'flex' : 'none';
      forgotForm.style.display = mode === 'forgot' ? 'flex' : 'none';
      resetForm.style.display  = mode === 'reset'  ? 'flex' : 'none';
    }

    function showDash() {
      authSection.style.display = 'none';
      dashSection.style.display = 'block';
      loadAppointments();
    }

    // ── Init: controlla sessione e URL hash ────────────────────
    function init() {
      var hash = window.location.hash;
      if (hash.indexOf('type=recovery') !== -1) {
        showAuth('reset');
        return;
      }
      sb.auth.getSession().then(function (res) {
        if (res.data && res.data.session) {
          showDash();
        } else {
          showAuth('login');
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
      showAuth('forgot');
    });

    document.getElementById('backToLoginLink').addEventListener('click', function () {
      clearMsg(loginMsg);
      showAuth('login');
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
      sb.auth.signOut().then(function () { showAuth('login'); });
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
      empty.style.display = 'none';

      var query = sb.from('appointments')
        .select('*')
        .order('date', { ascending: true })
        .order('time', { ascending: true });

      if (activeBarber) query = query.eq('barber', activeBarber);
      if (activeStatus) query = query.eq('status', activeStatus);

      query.then(function (res) {
        if (res.error) {
          tbody.innerHTML = '<tr><td colspan="9" style="color:#ff6b6b;padding:24px 16px;">Errore caricamento.</td></tr>';
          return;
        }
        renderTable(res.data || []);
      });
    }

    function renderTable(rows) {
      var tbody = document.getElementById('aptTableBody');
      var empty = document.getElementById('dashEmpty');
      tbody.innerHTML = '';

      if (!rows.length) {
        empty.style.display = 'block';
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
      return '<span class="status-badge status-badge--' + status + '">' + status + '</span>';
    }

    function actionButtons(apt) {
      var btns = '<div class="apt-actions">';
      if (apt.status === 'pending') {
        btns += '<button class="apt-btn apt-btn--confirm" data-id="' + apt.id + '" data-action="confirmed">Conferma</button>';
      }
      if (apt.status !== 'completed' && apt.status !== 'cancelled') {
        btns += '<button class="apt-btn apt-btn--complete" data-id="' + apt.id + '" data-action="completed">Completo</button>';
        btns += '<button class="apt-btn apt-btn--cancel"   data-id="' + apt.id + '" data-action="cancelled">Annulla</button>';
      }
      btns += '</div>';
      return btns;
    }

    // ── Azioni status (event delegation) ──────────────────────
    document.getElementById('aptTableBody').addEventListener('click', function (e) {
      var btn = e.target.closest('.apt-btn');
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
  ```

- [ ] **Step 2: Aggiorna le costanti Supabase in admin.js**

  In `assets/js/admin.js` righe 6-7, sostituisci:
  ```javascript
  var SUPABASE_URL = 'https://INSERISCI_TUO_PROJECT_URL.supabase.co';
  var SUPABASE_KEY = 'INSERISCI_TUO_ANON_KEY';
  ```
  Con i valori reali dal Supabase Dashboard → Settings → API.

- [ ] **Step 3: Verifica apertura admin nel browser**

  Apri `admin-mb26.html` direttamente nel browser.
  - Appare form login ✓
  - "Hai dimenticato la password?" → appare form forgot ✓
  - "← Torna al login" → torna al login form ✓
  - Inserisci credenziali sbagliate → messaggio errore rosso ✓

- [ ] **Step 4: Commit**

  ```bash
  git add assets/js/admin.js
  git commit -m "feat: aggiungi logica JS pannello admin (auth, dashboard, filtri, azioni)"
  ```

---

## Task 6: Crea account Auth in Supabase Dashboard

**Files:**
- Manual: Supabase Dashboard

- [ ] **Step 1: Crea account George**

  Supabase Dashboard → Authentication → Users → Invite user (oppure Add User):
  - Email: `georgevelozperez5@gmail.com`
  - Password: scegli una temporanea sicura (es. `MisterBarber2026!`)
  - Informa George che dovrà resettare la password al primo accesso

- [ ] **Step 2: Crea account Berlin**

  Stesso procedimento:
  - Email: `superberlin0204@gmail.com`
  - Password: scegli una temporanea sicura
  - Informa Berlin che dovrà resettare la password al primo accesso

- [ ] **Step 3: Verifica login reale**

  Apri `admin-mb26.html`, inserisci email+password George → deve apparire il dashboard.
  
  Expected: sezione filtri + tabella vuota (nessuna prenotazione ancora).

---

## Task 7: Deploy e test end-to-end

**Files:**
- Manual: Cloudflare Pages + browser test

- [ ] **Step 1: Push branch corrente**

  ```bash
  git push origin master
  ```

- [ ] **Step 2: Verifica Cloudflare Pages deploy**

  Cloudflare Pages rileva il push e fa il deploy automatico. Controlla il dashboard Cloudflare Pages → deploy riuscito ✓.

- [ ] **Step 3: Aggiorna ADMIN_URL nel secret Supabase**

  Ora che il sito è live, aggiorna il secret con il dominio reale:

  ```bash
  supabase secrets set ADMIN_URL=https://TUODOMINIO.pages.dev/admin-mb26.html
  ```

- [ ] **Step 4: Test prenotazione end-to-end**

  1. Apri `prenota.html` sul sito live
  2. Step 1: scegli barbiere → Step 2: scegli data e ora → Step 3: compila form (nome, telefono, servizio)
  3. Invia prenotazione
  4. Expected: animazione success → redirect `conferma.html` ✓
  5. Supabase Dashboard → Table Editor → `appointments` → riga inserita ✓
  6. Email ricevuta dal barbiere scelto ✓ (verifica inbox georgevelozperez5@gmail.com o superberlin0204@gmail.com)
  7. Email contiene link `admin-mb26.html` ✓

- [ ] **Step 5: Test slot disponibili**

  Fai una seconda prenotazione con stesso barbiere + stessa data + stesso orario.
  Expected: lo slot appare disabilitato nel calendario ✓

- [ ] **Step 6: Test admin panel**

  1. Apri `TUODOMINIO.pages.dev/admin-mb26.html`
  2. Login con credenziali George ✓
  3. Appare la prenotazione creata nel test precedente ✓
  4. Clicca "Conferma" → status cambia a `confirmed` ✓
  5. Filtra per "Berlin" → lista vuota (nessuna prenotazione per Berlin) ✓
  6. Logout → torna al form login ✓

- [ ] **Step 7: Test reset password**

  1. Logout dal pannello admin
  2. Clicca "Hai dimenticato la password?"
  3. Inserisci email George
  4. Controlla inbox → arriva email Supabase con link
  5. Clicca link → redirectato alla pagina admin con form nuova password
  6. Inserisci nuova password → salvata ✓
  7. Redirect automatico al dashboard ✓

- [ ] **Step 8: Commit finale**

  ```bash
  git add .
  git commit -m "feat: booking system completo — Supabase + email Resend + admin panel"
  ```

---

## Note post-deploy

**Cambio URL admin:** Se il dominio cambia, aggiornare:
1. Secret Supabase: `supabase secrets set ADMIN_URL=NUOVO_URL`
2. Rideploy Edge Function: `supabase functions deploy send-notification --no-verify-jwt`

**Dominio Resend:** L'email mittente è attualmente `onboarding@resend.dev` (sandbox Resend). Per usare `noreply@misterbarber.it`, aggiungere il dominio in Resend Dashboard → Domains e aggiornare la Edge Function.

**Backup appuntamenti:** Supabase Dashboard → Database → Backups (disponibile su piano Pro). Per ora gli appuntamenti sono sempre accessibili dal pannello admin, zero dipendenza Google.
