# MASTER_PLAN.md — Menu Impostazioni + Dashboard Personalizzabile

*Progetto: Mister Barber — Gestionale Settings | Data: 2026-06-02 | Revisione: 1 | Orchestratore (architect failover)*
*Rollback point: tag git `backup-pre-impostazioni-20260602` (commit c5b673f)*

---

## 0. DECISIONI APPROVATE (Manuel, 2026-06-02) — GATE PASSATO
1. **Scope = solo MVP (Fase A)**. Fase B/C rimandate.
2. **Scrittura settings via Functions dedicate** `/api/settings/*` (validazione server-side + service_role, token admin verificato).
3. **Dashboard riordino = drag-and-drop con SortableJS** (CDN — unica dipendenza esterna ammessa).
4. **Nessun prezzo**: la tabella `services` NON ha `price_cents`. Solo name/duration/active/sort. Sezione = "Servizi" (non "Servizi & Prezzi"). prenota.html invariato.
5. **impeccable skill assente** → frontend usa solo `taste-skill`.

---

## 1. Panoramica

Hub **Impostazioni** nel gestionale (`admin-mb26.html`) che (a) raccoglie le Chiusure/Festività già esistenti, (b) rende **DB-driven** tutta la config oggi hardcoded nel codice (orari, durate, servizi, barbieri), (c) aggiunge una **dashboard personalizzabile** con layout salvato per utente.

- **Utenti**: titolare + barbieri (admin autenticati Supabase). Path pubblico/anon (prenota.html, /api/available, /api/book) NON cambia comportamento.
- **Principio guida**: ogni config ha un **fallback ai default hardcoded attuali** → se le tabelle settings sono vuote, il sito si comporta esattamente come oggi. Zero regressioni al booking.

## 2. Stack (invariato)

| Layer | Tecnologia | Note |
|-------|-----------|------|
| Frontend | HTML + vanilla JS + Tailwind CDN | no build tool, mobile-first 375px |
| API | Cloudflare Pages Functions (`functions/api/`) | |
| DB | Supabase Postgres (REST + RLS) | |
| Auth | Supabase Auth (già in admin.js) | |
| Deploy | Cloudflare Pages `george-project`, auto-deploy su main | |
| Design | skill `taste-skill` (anti-slop). "impeccable" NON installata | |

## 3. Scope & Fasi (MVP isolato)

### 🟢 MVP (Fase A) — il blocco di valore minimo
1. **Tabelle + seed** dei default attuali (services, staff, business_hours, shop_settings, user_preferences)
2. **API settings** CRUD + lettura
3. **Refactor DB-driven con fallback** di `_google.js`/`book.js`/`available.js` (orari, durate, servizi, barbieri)
4. **UI Impostazioni** sezioni: Orari & Disponibilità (+ Chiusure migrate qui), Servizi & Prezzi
5. **Dashboard personalizzabile** (mostra/nascondi/riordina widget + tema + vista default, salvati in `user_preferences`)

### 🟡 Fase B (post-MVP)
6. Staff/Barbieri CRUD completo (foto/bio/calendar multipli)
7. Notifiche avanzate (template email editabile, Telegram/WhatsApp, reminder)
8. Policy prenotazioni (auto-confirm, cancellazione self-service)

### 🔵 Fase C (futuro)
9. Branding pubblico, ruoli/2FA, export CSV/GDPR, caparra Stripe

> **GATE**: Manuel approva scope (solo MVP vs MVP+B) prima della Fase 2.

## 4. Schema DB (nuove tabelle)

> Tutte con `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`, `updated_at`. RLS: `SELECT/INSERT/UPDATE/DELETE` solo a `authenticated` (admin); **nessuna** policy anon (eccetto dove indicato). Service-role bypassa per le Functions.

### `shop_settings` (singola riga di config globale)
| col | tipo | note |
|-----|------|------|
| id | uuid pk | |
| min_advance_minutes | int | anticipo minimo prenotazione (default 0) |
| max_future_days | int | default 365 |
| weekly_closed_days | int[] | giorni chiusi 0=dom..6=sab (default `{0}` = domenica) |
| require_email | bool | default false |
| auto_confirm | bool | default true |
| timezone | text | default 'Europe/Rome' |

### `services` (nessun prezzo — decisione §0.4)
| col | tipo | note |
|-----|------|------|
| name | text unique | seed: Cut, Fade, Beard, Razor, Full |
| duration_min | int null | override durata (null = usa durata barbiere) |
| active | bool default true | |
| sort_order | int | |

### `staff` (barbieri)
| col | tipo | note |
|-----|------|------|
| slug | text unique | seed: 'george', 'berlin' (NON cambiare: chiave usata ovunque) |
| display_name | text | 'George', 'Berlin' |
| calendar_id | text null | override opzionale; default resta env CF |
| event_duration_min | int | seed george=40, berlin=60 |
| slot_pitch_min | int | seed george=45, berlin=60 |
| photo_url | text null | Fase B |
| bio | text null | Fase B |
| active | bool default true | |
| sort_order | int | |

> ⚠️ private key / service-account **restano su env CF** (mai in DB). `staff.calendar_id` è solo override non-segreto.

### `business_hours` (orari per barbiere × giorno)
| col | tipo | note |
|-----|------|------|
| staff_slug | text fk→staff.slug | |
| weekday | int | 0=dom..6=sab |
| ranges | jsonb | `[{start:"09:00",end:"12:00"},...]` (rimpiazza getWorkRanges) |
| seed | | george/berlin dai range attuali di `getWorkRanges()` |

### `user_preferences` (layout dashboard per utente admin)
| col | tipo | note |
|-----|------|------|
| user_id | uuid | = auth.uid() |
| layout | jsonb | `{widgets:[{id,visible,order}], theme, default_view, top_kpis}` |
| RLS | | `user_id = auth.uid()` (ognuno vede solo il proprio) |

## 5. Contratti API (`functions/api/settings/`)

Richiedono `Authorization: Bearer <supabase access_token>` admin; la Function valida il token (`role=authenticated`) prima di usare service_role. CORS lockdown come book.js.

| Endpoint | Metodo | Effetto |
|----------|--------|---------|
| `/api/settings` | GET | bundle: shop_settings + services + staff + business_hours |
| `/api/settings/shop` | PATCH | aggiorna shop_settings |
| `/api/settings/services` | GET/POST/PATCH/DELETE | CRUD services |
| `/api/settings/staff` | GET/PATCH | update staff |
| `/api/settings/hours` | PUT | upsert business_hours |
| `/api/preferences` | GET/PUT | layout dashboard utente |

> Alternativa snella MVP: scrittura diretta client→Supabase con RLS `authenticated` (come già fa admin.js per `closures`), senza nuove Functions. **Decisione al gate** (§9.2).

## 6. Migrazione hardcoded → DB (con fallback)

Ogni helper di `_google.js` diventa `async`, legge dal DB con fallback al default attuale:

- `getEventDuration(barber,env)` → `staff.event_duration_min`; fallback `george?40:60`
- `getSlotMinutes` → `staff.slot_pitch_min`; fallback 45/60
- `getWorkRanges(barber,date,env)` → `business_hours(slug,weekday)`; fallback range hardcoded
- `ALLOWED_SERVICES` (book.js) → `services.name where active`; fallback lista fissa
- `ALLOWED_BARBERS` → `staff.slug where active`; fallback `['george','berlin']`
- Domenica chiusa (available.js) → `shop_settings.weekly_closed_days`; fallback `{0}`

**Retro-compatibilità**: tabelle col seed = comportamento identico a oggi. Test di regressione obbligatorio in Fase 4.

## 7. Ownership file per agente (rif. .claude/CLAUDE.md §8)

| Agente | Possiede | Branch |
|--------|----------|--------|
| **database** | `migrations/`, `seeds/`, schema+RLS+seed | `feat/database-impostazioni-20260602` |
| **backend** | `functions/api/settings/*`, `functions/api/preferences.js`, refactor `_google.js`/`book.js`/`available.js`, `.env.example` | `feat/backend-impostazioni-20260602` |
| **integrations** | notifiche Telegram/reminder — solo Fase B | `feat/integrations-impostazioni-20260602` |
| **frontend** | `admin-mb26.html`, `assets/js/admin.js`, `assets/css/` — UI + dashboard custom. **Invoca taste-skill** | `feat/frontend-impostazioni-20260602` |
| **testing** | `tests/` — unit API, regression booking, e2e | — |
| **security-review** | READ-ONLY audit RLS/authz/input | — |
| **docs** | `README.md`, guida utente, API reference | — |

> Serializzazione: `backend` possiede `_google.js`/`book.js`/`available.js` (frontend non li tocca). UI `closures` migrata da frontend solo lato admin markup/JS → nessun conflitto.

## 8. Grafo dipendenze / fasi

```
FASE 2: database ──────┐
                        ├──> FASE 3: backend (refactor+API, dopo schema)
FASE 2: backend .env ──┘
                              │ espone contratto /api/settings
                              ▼
                        FASE 3: frontend (UI) + docs
                              ▼
                        FASE 4: testing ∥ security-review ──> verifier (gate finale)
```
- `database` PRIMA di `backend`. `backend` espone contratto PRIMA di `frontend`. `integrations` solo se scope include Fase B.

## 9. Ambiguità / decisioni per Manuel (GATE)

1. **Scope**: MVP (Fase A) soltanto, o MVP+B? (consiglio: MVP prima)
2. **Architettura scrittura settings**: (a) **client→Supabase diretto con RLS** (semplice, come `closures`, niente nuove Functions) vs (b) **Functions /api/settings** (validazione server-side). Consiglio MVP: **(a)**, **(b)** solo dove serve service_role.
3. **`impeccable` skill**: assente → procedo con sola `taste-skill`?
4. **Prezzi servizi**: mostrarli anche nel sito pubblico (prenota.html) o solo gestione interna?
5. **Dashboard custom**: drag-drop reale (libreria CDN SortableJS) o riordino a **frecce** (zero dipendenze)? Consiglio: frecce (no-deps).

## 10. Rischi & Rollback

- **Rischio**: refactor `_google.js` async rompe booking. **Mitigazione**: fallback default + test regressione obbligatorio prima del merge.
- **Rischio**: RLS mal configurata espone PII. **Mitigazione**: security-review su tutte le policy; settings solo `authenticated`.
- **Rollback codice**: `git reset --hard backup-pre-impostazioni-20260602 && git push --force origin main`.
- **Rollback DB**: migrazioni con `DOWN` (drop tabelle nuove). Il rollback codice NON tocca il DB.
- **Merge su main**: SOLO Manuel. Agenti su feature branch.
