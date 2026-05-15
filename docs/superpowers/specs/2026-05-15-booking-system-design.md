# Booking System — Mister Barber
**Date:** 2026-05-15
**Project:** george-website
**Status:** Approved

---

## 1. Obiettivo

Sistema di prenotazione indipendente da Google. I clienti prenotano dal sito, i dati vengono salvati su Supabase, il barbiere riceve una email di notifica. George e Berlin accedono a un pannello admin protetto da login.

Motivazione: account Google di George è stato bannato due volte, perdendo tutti gli appuntamenti. Zero dipendenza da Google.

---

## 2. Architettura

```
Cliente → Form PRENOTA (index.html, sezione esistente)
               ↓
         Supabase Edge Function (HTTP endpoint)
               ↓
    ┌──────────────────────────────┐
    │  Supabase DB                 │
    │  tabella: appointments       │
    └──────────────────────────────┘
               ↓
    Resend API → email al barbiere selezionato
               ↓
    Admin panel (/admin-[secret].html)
    Auth: Supabase Auth (email + password)
    Reset password: OTP email nativo Supabase
```

**Stack:**
- Supabase (DB + Auth + Edge Functions)
- Resend (email transazionale)
- Vanilla JS + Supabase JS SDK via CDN
- Tailwind CDN + design system esistente
- Cloudflare Pages (hosting statico)

---

## 3. Data model

### Tabella `appointments`

| Campo | Tipo | Note |
|---|---|---|
| `id` | uuid (PK) | generato da Supabase |
| `name` | text NOT NULL | nome cliente |
| `phone` | text NOT NULL | telefono cliente |
| `barber` | text NOT NULL | `george` oppure `berlin` |
| `service` | text NOT NULL | Cut / Fade / Beard / Razor / Full |
| `date` | date NOT NULL | data appuntamento |
| `time` | time NOT NULL | ora appuntamento |
| `notes` | text | note opzionali |
| `status` | text NOT NULL | default `pending` |
| `created_at` | timestamptz | default `now()` |

**Status flow:** `pending` → `confirmed` → `completed` / `cancelled`

---

## 4. Componenti

### 4.1 Form cliente (index.html — sezione PRENOTA)

Campi:
1. Nome (text, required)
2. Telefono (text, required)
3. Barbiere (select: George / Berlin, required)
4. Servizio (select: Cut / Fade / Beard / Razor / Full, required)
5. Data (date, required — no date passate)
6. Ora (select slot: 09:00, 09:30 ... 18:30, required)
7. Note (textarea, opzionale)

On submit:
- Validazione client-side (HTML5 + JS)
- POST alla Edge Function
- Success: mostra messaggio conferma inline (no redirect)
- Error: mostra messaggio errore inline

Design: segue design system (form input 7.9, button accent 7.3, asphalt/canvas)

### 4.2 Supabase Edge Function

Endpoint: `POST /functions/v1/book-appointment`

Responsabilità:
1. Valida i campi (server-side)
2. Inserisce riga in `appointments`
3. Chiama Resend API → manda email al barbiere selezionato
4. Risponde `200 OK` o errore

Email mittente: `noreply@misterbarber.it` (o dominio Resend sandbox)
Email destinatario:
- george → `georgevelozperez5@gmail.com`
- berlin → `superberlin0204@gmail.com`

Contenuto email:
```
Nuova prenotazione — Mister Barber

Nome: [name]
Telefono: [phone]
Servizio: [service]
Data: [date] ore [time]
Note: [notes]

→ Vai al pannello: [ADMIN_URL]
```

### 4.3 Admin panel (`/admin-[secret].html`)

URL segreto hardcodato (es. `/admin-g7x9k2.html`) — non linkato da nessuna parte del sito.

**Flusso login:**
1. Pagina mostra form email + password
2. Supabase Auth verifica credenziali
3. Se ok → mostra dashboard appuntamenti
4. Se errore → mostra messaggio inline

**Forgot password:**
1. Link "Hai dimenticato la password?" sotto il form
2. Appare campo email
3. Supabase Auth invia OTP via email
4. Utente inserisce OTP → imposta nuova password

**Dashboard:**
- Lista appuntamenti ordinati per data (prossimi prima)
- Filtro per barbiere (George / Berlin / Tutti)
- Filtro per status
- Per ogni riga: nome, telefono, servizio, data/ora, status
- Azioni: Conferma / Cancella / Completa (cambiano status)
- Nessuna paginazione per ora (volume basso)

**Design:** segue design system (asphalt bg, canvas text, Anton/Inter, no border-radius)

### 4.4 Auth accounts

Due account Supabase Auth creati manualmente via dashboard:
- `georgevelozperez5@gmail.com`
- `superberlin0204@gmail.com`

Row Level Security su `appointments`: solo utenti autenticati possono leggere/modificare.

---

## 5. Sicurezza

- Edge Function esposta pubblicamente (per submit form clienti) — rate limit Supabase default
- Supabase anon key nel frontend: ok, RLS blocca lettura/modifica diretta
- Admin panel: autenticazione Supabase, session JWT gestita da SDK
- URL admin segreto: oscurità come layer aggiuntivo (non unica protezione)
- Nessuna chiave Resend nel frontend — è nella Edge Function (env var)

---

## 6. File da creare / modificare

```
george-website/
├── index.html                          — modifica sezione PRENOTA
├── admin-g7x9k2.html                  — nuovo (nome esatto da decidere)
├── assets/
│   ├── css/style.css                  — aggiunta stili form + admin
│   └── js/
│       ├── booking.js                 — logica form cliente
│       └── admin.js                   — logica pannello admin
└── supabase/
    └── functions/
        └── book-appointment/
            └── index.ts               — Edge Function
```

---

## 7. Out of scope (per ora)

- Calendario con slot disponibili / conflitti
- Notifica email al cliente (solo al barbiere)
- Dashboard analytics
- Export CSV appuntamenti
- App mobile
