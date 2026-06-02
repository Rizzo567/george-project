# Contract — Database Settings Schema (Menu Impostazioni)

- **Agente**: database
- **Tipo**: DB_SCHEMA
- **Branch**: `feat/database-impostazioni-20260602`
- **Data**: 2026-06-02
- **Migrazioni**: `supabase/migrations/001_settings_schema_up.sql` (UP), `supabase/migrations/001_settings_schema_down.sql` (DOWN), `supabase/seeds/001_settings_seed.sql` (SEED)
- **DB**: Supabase Postgres (REST + RLS). Tabelle in schema `public`.

## Principio (MASTER_PLAN §1)
Col seed applicato il comportamento del sito è **identico a oggi**. Se le tabelle sono vuote, le CF Functions devono usare i fallback hardcoded. Le scritture/letture admin passano da ruolo `authenticated`; le Functions usano `service_role` (bypassa RLS). **Nessuna policy `anon`** su queste tabelle (a differenza di `closures`).

## Convenzioni comuni a tutte le tabelle
- `id uuid primary key default gen_random_uuid()`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()` — auto-aggiornata dal trigger `public.set_updated_at()` (condivisa con `appointments`, NON droppare nel rollback).
- RLS abilitata su tutte e 5.

---

## Tabelle

### `public.shop_settings` — singola riga config globale
| col | tipo | constraint / default |
|-----|------|----------------------|
| id | uuid pk | gen_random_uuid() |
| min_advance_minutes | int | not null, default 0, `>= 0` |
| max_future_days | int | not null, default 365, `1..3650` |
| weekly_closed_days | int[] | not null, default `'{0}'` (0=dom..6=sab) |
| require_email | boolean | not null, default false |
| auto_confirm | boolean | not null, default true |
| timezone | text | not null, default `'Europe/Rome'` |
| row_singleton | boolean | not null, default true — unique index forza **una sola riga** |
| created_at / updated_at | timestamptz | default now() |

- Unicità: `uq_shop_settings_singleton` su `(row_singleton)` → max 1 riga.
- RLS: `shop_settings_auth_all` — ALL a `authenticated` (using true / check true).
- Per fare upsert della riga singola: `on conflict (row_singleton)`.

### `public.services` — catalogo servizi (NESSUN prezzo, decisione §0.4)
| col | tipo | constraint / default |
|-----|------|----------------------|
| id | uuid pk | |
| name | text | not null, **unique**, len 1..60 |
| duration_min | int null | `null` o `1..600` (null = usa durata barbiere) |
| active | boolean | not null, default true |
| sort_order | int | not null, default 0 |
| created_at / updated_at | timestamptz | |

- Indici: `idx_services_sort_order (sort_order)`, `idx_services_active (active)`.
- RLS: `services_auth_all` — ALL a `authenticated`.
- Upsert per nome: `on conflict (name)`.

### `public.staff` — barbieri
| col | tipo | constraint / default |
|-----|------|----------------------|
| id | uuid pk | |
| slug | text | not null, **unique**, len 1..40 — chiave stabile (`george`,`berlin`) |
| display_name | text | not null, len 1..80 |
| calendar_id | text null | override non-segreto; null = usa env CF |
| event_duration_min | int | not null, `1..600` |
| slot_pitch_min | int | not null, `1..600` |
| photo_url | text null | Fase B |
| bio | text null | Fase B |
| active | boolean | not null, default true |
| sort_order | int | not null, default 0 |
| created_at / updated_at | timestamptz | |

- Indici: `idx_staff_sort_order`, `idx_staff_active`.
- RLS: `staff_auth_all` — ALL a `authenticated`.
- Upsert per slug: `on conflict (slug)`.
- ⚠️ private key / service-account **NON sono in DB**: restano su env CF.

### `public.business_hours` — orari per barbiere × giorno (rimpiazza getWorkRanges)
| col | tipo | constraint / default |
|-----|------|----------------------|
| id | uuid pk | |
| staff_slug | text | not null, **FK → staff.slug** (on update cascade, on delete cascade) |
| weekday | int | not null, `0..6` (0=dom..6=sab) |
| ranges | jsonb | not null, default `'[]'` — `[{"start":"HH:MM","end":"HH:MM"}, ...]` |
| created_at / updated_at | timestamptz | |

- Unicità: `unique (staff_slug, weekday)` → una riga per barbiere/giorno.
- Indice: `idx_business_hours_staff_weekday (staff_slug, weekday)`.
- RLS: `business_hours_auth_all` — ALL a `authenticated`.
- Upsert: `on conflict (staff_slug, weekday)`.
- **Domenica (weekday 0): NESSUNA riga** → chiuso via `shop_settings.weekly_closed_days`.

### `public.user_preferences` — layout dashboard per utente
| col | tipo | constraint / default |
|-----|------|----------------------|
| id | uuid pk | |
| user_id | uuid | not null, **unique**, FK → `auth.users(id)` on delete cascade |
| layout | jsonb | not null, default `'{}'` — `{widgets:[{id,visible,order}], theme, default_view, top_kpis}` |
| created_at / updated_at | timestamptz | |

- Indice: `idx_user_preferences_user_id`.
- RLS (per-riga, `auth.uid() = user_id`):
  - `user_preferences_select_own` (SELECT)
  - `user_preferences_insert_own` (INSERT, with check)
  - `user_preferences_update_own` (UPDATE, using + with check)
  - `user_preferences_delete_own` (DELETE)
- Ogni utente vede/modifica **solo** la propria riga. Upsert per utente: `on conflict (user_id)`.

---

## Seed (valori = comportamento attuale)
- **shop_settings**: `(0, 365, '{0}', false, true, 'Europe/Rome')`.
- **services**: `Cut(1) Fade(2) Beard(3) Razor(4) Full(5)`, tutti `active`, `duration_min=null`.
- **staff**: `george(event=40, pitch=45)`, `berlin(event=60, pitch=60)`, `calendar_id=null`.
- **business_hours** (weekday 1..6, niente domenica):
  - george: `[{09:00-12:00},{13:00-18:00},{18:15-18:16}]`
  - berlin: `[{09:00-12:00},{13:00-19:00},{18:45-18:46}]`
  - (gli slot extra 18:15 george / 18:45 berlin sono fedeli ai range extra di `getWorkRanges`)
- **user_preferences**: nessun seed (creata al primo salvataggio utente).

## ENV richieste
Nessuna nuova ENV introdotta da questo schema. Le Functions di scrittura settings useranno la **service_role key** già prevista (`SUPABASE_SERVICE_ROLE_KEY` lato backend) per bypassare RLS; lettura admin via access_token Supabase (`authenticated`).

## Note per backend (mappatura refactor — MASTER_PLAN §6)
- `getEventDuration(barber)` → `staff.event_duration_min` (fallback george 40 / berlin 60).
- `getSlotMinutes(barber)` → `staff.slot_pitch_min` (fallback 45 / 60).
- `getWorkRanges(barber,date)` → `business_hours.ranges` where `staff_slug=barber and weekday=<getDay>` (fallback range hardcoded). Formato `ranges` = `[{"start":"HH:MM","end":"HH:MM"}]` (stringa HH:MM, NON minuti).
- `ALLOWED_SERVICES` → `select name from services where active` (fallback `['Cut','Fade','Beard','Razor','Full']`).
- `ALLOWED_BARBERS` → `select slug from staff where active` (fallback `['george','berlin']`).
- Domenica chiusa → `0 = any(shop_settings.weekly_closed_days)` (fallback `{0}`).
- `staff.calendar_id` è override opzionale: se null usare env CF `GEORGE_CALENDAR_ID`/`BERLIN_CALENDAR_ID`.

## Applicazione (manuale, NON eseguita su prod)
1. Esegui `supabase/migrations/001_settings_schema_up.sql`
2. Esegui `supabase/seeds/001_settings_seed.sql`
3. Rollback: `supabase/migrations/001_settings_schema_down.sql`
