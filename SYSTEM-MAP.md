# MISTER BARBER — System Map
> Stato: 2026-05-25 · Tutto operativo ✅

---

## 1. INFRASTRUTTURA

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLOUDFLARE PAGES                             │
│                    george-project.pages.dev                         │
│                      misterbarber.shop                              │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │  index.html  │  │ prenota.html │  │admin-mb26.html│             │
│  │  (homepage)  │  │ (booking)    │  │ (dashboard)  │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
│                                                                     │
│  ┌─────────────────────────────────────────────────────┐           │
│  │              PAGES FUNCTIONS  /api/*                │           │
│  │  ┌────────────┐ ┌─────────────┐ ┌────────────────┐ │           │
│  │  │  /book     │ │ /available  │ │/cancel-calendar│ │           │
│  │  └────────────┘ └─────────────┘ └────────────────┘ │           │
│  └─────────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────────┘
         │                    │                      │
         ▼                    ▼                      ▼
┌──────────────┐   ┌──────────────────┐   ┌──────────────────┐
│   SUPABASE   │   │  GOOGLE CALENDAR │   │     RESEND       │
│  PostgreSQL  │   │  2 calendari     │   │  misterbarber    │
│  Auth        │   │  george / berlin │   │  .shop verified  │
│  Storage     │   │  Service Account │   └──────────────────┘
│  Edge Fn     │   └──────────────────┘
└──────────────┘
```

---

## 2. FLUSSO PRENOTAZIONE

```
CLIENTE (prenota.html)
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 1 — Scegli barbiere                                   │
│  ┌──────────────┐    ┌──────────────┐                       │
│  │   GEORGE     │    │   BERLIN     │                       │
│  │   45 min     │    │   60 min     │                       │
│  └──────────────┘    └──────────────┘                       │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 2 — Scegli data → carica slot                         │
│                                                             │
│  GET /api/available?barber=george&date=2026-05-26           │
│       │                                                     │
│       ▼ (server-side)                                       │
│  Supabase → appointment_slots VIEW                          │
│  (esclude slot già prenotati, genera griglia orari)         │
│       │                                                     │
│       ▼                                                     │
│  Slot disponibili renderizzati nel calendario               │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 3 — Compila form + invia                              │
│  nome / telefono / email / servizio / note / foto           │
│                                                             │
│  1. Foto (opzionale) → Supabase Storage bucket "bookings"   │
│  2. Supabase INSERT appointments → ottiene row ID           │
│  3. POST /api/book ──────────────────────────────────────┐  │
│     { barber, nome, email, data, ora, servizio, imgUrl } │  │
│                                                          ▼  │
│                                              Google Calendar│
│                                              crea evento    │
│                                              → eventId      │
│                                                          │  │
│  4. Supabase UPDATE calendar_event_id = eventId ◄────────┘  │
│  5. Edge Function send-notification ──► email barbiere      │
│  6. Resend email conferma ──────────────────► email cliente  │
│  7. Redirect → conferma.html                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. ORARI BARBIERI

```
GEORGE (45 min/slot)                BERLIN (60 min/slot)
─────────────────────               ──────────────────────
09:00 ████████████████              09:00 ████████████████
09:45 ████████████████              10:00 ████████████████
10:30 ████████████████              11:00 ████████████████
11:15 ████████████████              ──────────────────────
──────────────────────              12:00 ░░░ PAUSA ░░░░░
12:00 ░░░ PAUSA ░░░░░               13:00 ████████████████
13:00 ████████████████              14:00 ████████████████
13:45 ████████████████              15:00 ████████████████
14:30 ████████████████              16:00 ████████████████
15:15 ████████████████              17:00 ████████████████
16:00 ████████████████              18:00 ████████████████
16:45 ████████████████              18:45 ████ (extra)
17:30 ████████████████
18:15 ████ (extra)
```

---

## 4. FLUSSO CANCELLAZIONE

```
ADMIN (admin-mb26.html)
       │
       ▼
  apre dettaglio appuntamento
       │
       ▼
  clicca "Annulla"
       │
       ├──► Supabase UPDATE status = 'cancelled'
       │
       └──► POST /api/cancel-calendar
                 { barber, eventId }
                      │
                      ▼
              Google Calendar
              DELETE evento
                      │
                      ▼
              slot torna disponibile
              per nuove prenotazioni
```

---

## 5. DATABASE (Supabase)

```
TABLE: appointments
┌──────────────────┬──────────────┬─────────────────────────────────┐
│ Campo            │ Tipo         │ Note                            │
├──────────────────┼──────────────┼─────────────────────────────────┤
│ id               │ uuid (PK)    │ auto-generated                  │
│ barber           │ text         │ 'george' | 'berlin'             │
│ name             │ text         │ nome cliente                    │
│ phone            │ text         │ telefono                        │
│ email            │ text         │ email cliente (nullable)        │
│ service          │ text         │ Cut/Fade/Beard/Razor/Full       │
│ date             │ date         │ YYYY-MM-DD                      │
│ time             │ time         │ HH:MM:SS                        │
│ notes            │ text         │ note libere (nullable)          │
│ img_url          │ text         │ URL foto riferimento (nullable) │
│ status           │ text         │ confirmed/completed/cancelled   │
│ calendar_event_id│ text         │ ID evento Google Calendar       │
│ created_at       │ timestamptz  │ auto                            │
└──────────────────┴──────────────┴─────────────────────────────────┘

VIEW: appointment_slots
→ barber + date + time di tutti gli appuntamenti NON cancelled
→ usata da /api/available come source of truth disponibilità

STORAGE: bucket "bookings" (pubblico)
→ foto riferimento taglio caricate dal cliente
→ URL salvata in img_url

RLS POLICIES:
  anon    → INSERT ✅  SELECT ✅  UPDATE ✗
  auth    → INSERT ✅  SELECT ✅  UPDATE ✅
```

---

## 6. CLOUDFLARE PAGES FUNCTIONS

```
/api/book  (POST)
├── INPUT:  barber, nome, email, telefono, servizio, data, ora, notes, imgUrl
├── SECURITY: rate limit 5req/min · CORS whitelist · input validation
├── DEDUP: controlla appointment_slots (stesso slot già preso?)
├── Google Calendar: crea evento con service account
├── Resend: invia email conferma al cliente
└── OUTPUT: { ok: true, eventId }

/api/available  (GET)
├── INPUT:  ?barber=&date=
├── Legge appointment_slots da Supabase (source of truth)
├── Genera griglia slot per barber (George 45min / Berlin 60min)
├── Esclude slot già occupati
└── OUTPUT: { slots: [...] }

/api/cancel-calendar  (POST)
├── INPUT:  barber, eventId
├── Google Calendar: elimina evento
└── OUTPUT: { ok: true }

ENV VARS (server-side, mai esposti al browser):
  GEORGE_SERVICE_ACCOUNT_EMAIL
  GEORGE_PRIVATE_KEY
  GEORGE_CALENDAR_ID
  BERLIN_SERVICE_ACCOUNT_EMAIL
  BERLIN_PRIVATE_KEY
  BERLIN_CALENDAR_ID
  SUPABASE_URL
  SUPABASE_ANON_KEY
  RESEND_API_KEY  ← aggiunto 2026-05-25
```

---

## 7. SISTEMA EMAIL

```
EMAIL CONFERMA CLIENTE
─────────────────────
prenota.html
    │
    └──► POST /api/book (include email nel payload)
              │
              ▼ (server-side)
         Resend API
         from: noreply@misterbarber.shop
         to: cliente@qualsiasi.com
         html: template branded Mister Barber
              │
              ▼
         ✉ Cliente riceve conferma con:
           • Barbiere (nome + orario)
           • Data e ora
           • Servizio
           • Indirizzo Via Torino 38, Pavia
           • Contact: superberlin0204@gmail.com

EMAIL NOTIFICA BARBIERI
───────────────────────
prenota.html
    │
    └──► Supabase Edge Function: send-notification
              │
              ▼
         Resend API
         to: george → georgevelozperez5@gmail.com
             berlin → superberlin0204@gmail.com
         text: nome / telefono / data / ora / servizio / note
```

---

## 8. DASHBOARD ADMIN

```
admin-mb26.html
       │
       ▼
  Login (Supabase Auth)
  email + password
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  DASHBOARD                                                  │
│                                                             │
│  KPI ──────────────────────────────────────────────────    │
│  Totale | Oggi | George | Berlin                           │
│                                                             │
│  GRAFICI ───────────────────────────────────────────────   │
│  Andamento 14gg (bar+media) | Top Servizi (horizontal bar) │
│  George vs Berlin (line chart) | Scanner animation         │
│                                                             │
│  FILTRI (⚙️ bottone ingranaggio) ──────────────────────    │
│  → modal centrato: Barbiere (Tutti/George/Berlin)          │
│                    Status (Tutti/Confermati/Completati/     │
│                            Annullati)                       │
│                                                             │
│  OGGI ─────────────────────────────────────────────────    │
│  → solo status = 'confirmed'                               │
│  → auto-complete: slot finito +1min → status = 'completed' │
│                                                             │
│  PROSSIMI 14 GIORNI ────────────────────────────────────   │
│  → futuro, esclude cancelled, esclude oggi                 │
│                                                             │
│  STORICO ───────────────────────────────────────────────   │
│  → passato + oggi completati/annullati                     │
│  → ordine inverso                                          │
│                                                             │
│  DETAIL PANEL (tap su riga) ────────────────────────────   │
│  → overlay bottom sheet                                    │
│  → foto riferimento | nome | data | ora | barbiere | tel   │
│  → azioni: "Segna completo" | "Annulla"                    │
│    Annulla → Supabase UPDATE + /api/cancel-calendar        │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. SICUREZZA

```
VISIBILE IN F12                    NASCOSTO (server-side)
───────────────────                ──────────────────────────────
SUPABASE_URL       ← by design     GOOGLE_PRIVATE_KEY (George)
SUPABASE_ANON_KEY  ← by design     GOOGLE_PRIVATE_KEY (Berlin)
                                   GOOGLE_CALENDAR_ID (George)
                                   GOOGLE_CALENDAR_ID (Berlin)
ELIMINATI (erano esposti):         GOOGLE_SERVICE_ACCOUNT_EMAIL x2
  ✅ EMAILJS_PUBLIC_KEY            SUPABASE_SERVICE_ROLE_KEY
  ✅ EMAILJS_SERVICE_ID            RESEND_API_KEY
  ✅ EMAILJS_TEMPLATE_ID

PROTEZIONI ATTIVE:
  ✅ CORS whitelist su tutti gli endpoint CF Functions
  ✅ Rate limit 5 req/min per IP su /api/book
  ✅ Input validation + sanitizzazione su tutti gli endpoint
  ✅ RLS Supabase (anon: INSERT only, auth: full)
  ✅ CSP header su prenota.html e admin-mb26.html
  ✅ Security headers (X-Frame-Options, X-Content-Type-Options)

PIANO FASI FUTURE:
  Fase 2 → tighten RLS: blocca SELECT anon su appointments
  Fase 3 → rimuovi Supabase dal client → tutto via CF Functions
  Fase 4 → Cloudflare Access su admin-mb26.html + WAF rules
```

---

## 10. FILE STRUCTURE

```
george-website/
├── index.html                    ← homepage
├── prenota.html                  ← booking flow (3 step)
├── conferma.html                 ← success page
├── admin-mb26.html               ← dashboard admin
├── assets/
│   ├── css/
│   │   ├── style.css             ← stili globali
│   │   └── admin.css             ← stili dashboard
│   ├── js/
│   │   ├── config.js             ← solo SUPABASE_URL + anon key
│   │   └── admin.js              ← logica dashboard completa
│   └── img/                      ← foto barbieri e assets
├── functions/
│   └── api/
│       ├── _google.js            ← helpers Google Calendar (JWT, token)
│       ├── book.js               ← crea evento Cal + invia email
│       ├── available.js          ← genera slot disponibili
│       └── cancel-calendar.js    ← elimina evento Cal
└── supabase/
    └── functions/
        └── send-notification/
            └── index.ts          ← notifica email ai barbieri
```
