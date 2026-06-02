-- ============================================================================
-- MIGRATION 001 — Menu Impostazioni (UP)
-- Progetto: Mister Barber — Gestionale Settings (MASTER_PLAN §4)
-- Data: 2026-06-02 | Branch: feat/database-impostazioni-20260602
-- ----------------------------------------------------------------------------
-- Crea 5 tabelle settings DB-driven con RLS, indici e trigger updated_at.
-- NON modifica tabelle esistenti (appointments, appointment_slots, closures).
--
-- PRINCIPIO GUIDA (MASTER_PLAN §1): col seed (002) il comportamento del sito
-- è IDENTICO a oggi. Tabelle vuote => le Functions usano i fallback hardcoded.
--
-- RLS (tassativo, MASTER_PLAN §4):
--  - shop_settings, services, staff, business_hours: SOLO ruolo `authenticated`
--    per SELECT/INSERT/UPDATE/DELETE. NESSUNA policy `anon`.
--    Le CF Functions useranno il service_role (bypassa RLS).
--  - user_preferences: ogni utente accede SOLO alla propria riga (auth.uid()).
--
-- Idempotente: usa IF NOT EXISTS / DROP POLICY IF EXISTS dove possibile.
-- Rollback: vedi 001_settings_schema_down.sql
-- ============================================================================

-- Funzione condivisa updated_at (già definita da schema.sql come
-- public.set_updated_at; ricreata qui in modo idempotente per indipendenza
-- della migrazione).
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- 1) shop_settings — singola riga di config globale
-- ============================================================================
create table if not exists public.shop_settings (
  id                  uuid        primary key default gen_random_uuid(),
  min_advance_minutes int         not null default 0   check (min_advance_minutes >= 0),
  max_future_days     int         not null default 365 check (max_future_days between 1 and 3650),
  weekly_closed_days  int[]       not null default '{0}',  -- 0=dom .. 6=sab
  require_email       boolean     not null default false,
  auto_confirm        boolean     not null default true,
  timezone            text        not null default 'Europe/Rome',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Garantisce semanticamente la "singola riga" di config globale.
-- (constraint su espressione costante: una sola riga può soddisfare row_singleton=true)
alter table public.shop_settings
  add column if not exists row_singleton boolean not null default true;
create unique index if not exists uq_shop_settings_singleton
  on public.shop_settings (row_singleton);

alter table public.shop_settings enable row level security;

drop policy if exists "shop_settings_auth_all" on public.shop_settings;
create policy "shop_settings_auth_all"
  on public.shop_settings for all
  to authenticated
  using (true)
  with check (true);

drop trigger if exists trg_shop_settings_updated_at on public.shop_settings;
create trigger trg_shop_settings_updated_at
  before update on public.shop_settings
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 2) services — catalogo servizi (NESSUN prezzo, decisione §0.4)
-- ============================================================================
create table if not exists public.services (
  id           uuid        primary key default gen_random_uuid(),
  name         text        not null unique check (char_length(name) between 1 and 60),
  duration_min int         check (duration_min is null or duration_min between 1 and 600),
  active       boolean     not null default true,
  sort_order   int         not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_services_sort_order on public.services (sort_order);
create index if not exists idx_services_active      on public.services (active);

alter table public.services enable row level security;

drop policy if exists "services_auth_all" on public.services;
create policy "services_auth_all"
  on public.services for all
  to authenticated
  using (true)
  with check (true);

drop trigger if exists trg_services_updated_at on public.services;
create trigger trg_services_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 3) staff — barbieri (slug = chiave stabile usata ovunque nel codice)
--    private key / service-account RESTANO su env CF (mai in DB).
--    calendar_id è solo override non-segreto (default resta env CF).
-- ============================================================================
create table if not exists public.staff (
  id                 uuid        primary key default gen_random_uuid(),
  slug               text        not null unique check (char_length(slug) between 1 and 40),
  display_name       text        not null check (char_length(display_name) between 1 and 80),
  calendar_id        text,
  event_duration_min int         not null check (event_duration_min between 1 and 600),
  slot_pitch_min     int         not null check (slot_pitch_min between 1 and 600),
  photo_url          text,       -- Fase B
  bio                text,       -- Fase B
  active             boolean     not null default true,
  sort_order         int         not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_staff_sort_order on public.staff (sort_order);
create index if not exists idx_staff_active      on public.staff (active);

alter table public.staff enable row level security;

drop policy if exists "staff_auth_all" on public.staff;
create policy "staff_auth_all"
  on public.staff for all
  to authenticated
  using (true)
  with check (true);

drop trigger if exists trg_staff_updated_at on public.staff;
create trigger trg_staff_updated_at
  before update on public.staff
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 4) business_hours — orari per barbiere × giorno (rimpiazza getWorkRanges)
--    ranges jsonb: [{"start":"HH:MM","end":"HH:MM"}, ...]
--    weekday: 0=dom .. 6=sab. Domenica (0): NESSUNA riga => chiuso via
--    shop_settings.weekly_closed_days.
-- ============================================================================
create table if not exists public.business_hours (
  id          uuid        primary key default gen_random_uuid(),
  staff_slug  text        not null references public.staff (slug) on update cascade on delete cascade,
  weekday     int         not null check (weekday between 0 and 6),
  ranges      jsonb       not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (staff_slug, weekday)
);

create index if not exists idx_business_hours_staff_weekday
  on public.business_hours (staff_slug, weekday);

alter table public.business_hours enable row level security;

drop policy if exists "business_hours_auth_all" on public.business_hours;
create policy "business_hours_auth_all"
  on public.business_hours for all
  to authenticated
  using (true)
  with check (true);

drop trigger if exists trg_business_hours_updated_at on public.business_hours;
create trigger trg_business_hours_updated_at
  before update on public.business_hours
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 5) user_preferences — layout dashboard per utente admin
--    RLS: ogni utente accede SOLO alla propria riga (auth.uid() = user_id).
-- ============================================================================
create table if not exists public.user_preferences (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null unique references auth.users (id) on delete cascade,
  layout     jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_preferences_user_id on public.user_preferences (user_id);

alter table public.user_preferences enable row level security;

drop policy if exists "user_preferences_select_own" on public.user_preferences;
drop policy if exists "user_preferences_insert_own" on public.user_preferences;
drop policy if exists "user_preferences_update_own" on public.user_preferences;
drop policy if exists "user_preferences_delete_own" on public.user_preferences;

create policy "user_preferences_select_own"
  on public.user_preferences for select
  to authenticated
  using (auth.uid() = user_id);

create policy "user_preferences_insert_own"
  on public.user_preferences for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "user_preferences_update_own"
  on public.user_preferences for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_preferences_delete_own"
  on public.user_preferences for delete
  to authenticated
  using (auth.uid() = user_id);

drop trigger if exists trg_user_preferences_updated_at on public.user_preferences;
create trigger trg_user_preferences_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- ============================================================================
-- GRANT minimi (RLS resta il gate effettivo; grant abilita il ruolo all'op).
-- NESSUN grant ad anon: queste tabelle non sono accessibili al ruolo anonimo.
-- ============================================================================
grant select, insert, update, delete on public.shop_settings    to authenticated;
grant select, insert, update, delete on public.services         to authenticated;
grant select, insert, update, delete on public.staff            to authenticated;
grant select, insert, update, delete on public.business_hours   to authenticated;
grant select, insert, update, delete on public.user_preferences to authenticated;

-- ============================================================================
-- FINE MIGRATION 001 UP
-- ============================================================================
