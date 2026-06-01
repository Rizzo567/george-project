-- ============================================================================
-- MISTER BARBER — Database schema con RLS sicurizzata
-- ============================================================================
-- Security note (2026-05-16):
-- La policy precedente `anon_select_slots` con `using (true)` esponeva TUTTI i
-- campi (nome, telefono, note, immagini) della tabella appointments a chiunque
-- possedesse la chiave anon (pubblica per design Supabase). Violazione GDPR.
--
-- Soluzione: revocare SELECT anon su public.appointments e creare una VIEW
-- separata `appointment_slots` che espone SOLO i campi necessari (data, ora,
-- barbiere, status) per il controllo slot disponibili.
-- ============================================================================

-- Tabella prenotazioni
create table if not exists public.appointments (
  id          uuid        default gen_random_uuid() primary key,
  name        text        not null check (char_length(name) between 1 and 100),
  phone       text        not null check (char_length(phone) between 5 and 32),
  barber      text        not null check (barber in ('george', 'berlin')),
  service     text        not null check (service in ('Cut','Fade','Beard','Razor','Full')),
  date        date        not null,
  time        time        not null,
  notes       text        check (notes is null or char_length(notes) <= 500),
  img_url     text        check (img_url is null or char_length(img_url) <= 2048),
  status      text        not null default 'confirmed'
                          check (status in ('pending','confirmed','completed','cancelled')),
  created_at  timestamptz default now()
);

-- Indici utili (slot lookup + admin list)
create index if not exists idx_appointments_barber_date on public.appointments (barber, date);
create index if not exists idx_appointments_date_time   on public.appointments (date, time);

-- Abilita RLS
alter table public.appointments enable row level security;

-- ============================================================================
-- POLICY CLEANUP: rimuovi vecchie policy insicure se presenti (idempotente)
-- ============================================================================
drop policy if exists "anon_select_slots" on public.appointments;
drop policy if exists "anon_insert"       on public.appointments;
drop policy if exists "auth_select_all"   on public.appointments;
drop policy if exists "auth_update_status" on public.appointments;

-- ============================================================================
-- ANON: può SOLO inserire prenotazioni. NESSUN select diretto sulla tabella.
-- I dati personali (name, phone, notes, img_url) restano invisibili al ruolo anon.
-- ============================================================================
create policy "anon_insert_only"
  on public.appointments for insert
  to anon
  with check (
    -- difensiva: vincoli replicati anche in policy
    char_length(name)  between 1 and 100
    and char_length(phone) between 5 and 32
    and barber in ('george','berlin')
    and service in ('Cut','Fade','Beard','Razor','Full')
    and (notes is null or char_length(notes) <= 500)
    and status in ('pending','confirmed')  -- anon non può creare prenotazioni già completed/cancelled
  );

-- Anon NON ha select sulla tabella appointments.
-- Per i slot disponibili anon legge la VIEW `appointment_slots` (sotto).

-- ============================================================================
-- AUTHENTICATED (admin/barbieri): full read + update controllato
-- ============================================================================
create policy "auth_select_all"
  on public.appointments for select
  to authenticated
  using (true);

-- Update consentito solo per cambio status (gli altri campi restano immutabili
-- tramite check che verifica che i campi sensibili NON cambino — Postgres
-- non supporta column-level RLS, ma il check qui sotto vincola usando OLD
-- via funzione trigger separata se necessario. Per ora autorizziamo update
-- a status, e per le altre colonne contiamo su disciplina applicativa.)
create policy "auth_update_status"
  on public.appointments for update
  to authenticated
  using (true)
  with check (
    status in ('pending','confirmed','completed','cancelled')
  );

-- DELETE: solo authenticated (admin) può cancellare definitivamente
create policy "auth_delete"
  on public.appointments for delete
  to authenticated
  using (true);

-- ============================================================================
-- VIEW: appointment_slots — esposta ad anon SOLO con campi non-PII
-- Mostra solo data, ora, barbiere e status, e solo per slot attivi.
-- ============================================================================
drop view if exists public.appointment_slots;
-- security_invoker = false (DEFINER): la view gira coi privilegi del proprietario
-- (postgres) ed espone SOLO colonne non-PII. Necessario perché anon NON ha SELECT
-- sulla tabella base appointments: con security_invoker=true anon vedrebbe 0 righe
-- e la disponibilità slot si romperebbe.
create view public.appointment_slots
with (security_invoker = false)
as
  select
    id,
    barber,
    date,
    time,
    status
  from public.appointments
  where status in ('pending','confirmed');

-- Grant minimi sulla VIEW
revoke all on public.appointment_slots from anon, authenticated;
grant select on public.appointment_slots to anon, authenticated;

-- Sicurezza colonne tabella base: nega anon select esplicitamente
revoke all on public.appointments from anon;
grant insert on public.appointments to anon;

-- ============================================================================
-- AUDIT TRAIL (best practice): trigger updated_at per tracking modifiche admin
-- ============================================================================
alter table public.appointments
  add column if not exists updated_at timestamptz default now();

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_appointments_updated_at on public.appointments;
create trigger trg_appointments_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

-- ============================================================================
-- STORAGE: bucket "bookings" policy (da applicare in Dashboard → Storage)
-- ============================================================================
-- I client devono usare upload limitato. Il bucket deve essere creato come
-- "Private" e protetto dalla seguente policy:
--
--   create policy "anon_upload_limited"
--     on storage.objects for insert
--     to anon
--     with check (
--       bucket_id = 'bookings'
--       and octet_length(decode(metadata->>'size', 'escape')) < 5242880  -- 5MB max
--     );
--
-- (la verifica dimensione viene comunque fatta server-side in /api/book)

-- ============================================================================
-- GDPR: helper per right-to-erasure (cliente può chiedere cancellazione)
-- Da invocare da un endpoint backend autenticato con secret manager.
-- ============================================================================
create or replace function public.gdpr_delete_by_phone(target_phone text)
returns int language plpgsql security definer as $$
declare
  deleted_count int;
begin
  delete from public.appointments where phone = target_phone;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- Solo service_role può invocarla (mai esposta al client)
revoke all on function public.gdpr_delete_by_phone(text) from public, anon, authenticated;

-- ============================================================================
-- CHIUSURE / FESTIVITÀ (2026-06-01)
-- Gestione giorni festivi, ponti e mezze giornate dal gestionale.
-- Lette server-side da /api/available e /api/book (CF Functions, anon key)
-- e scritte dal gestionale (authenticated).
--
-- scope:  'both' | 'george' | 'berlin'  → a quale barbiere si applica
-- mode:   'full'          → chiuso tutto il giorno
--         'morning_only'  → aperti solo mattina (09:00–12:00)
--         'afternoon_only'→ aperti solo pomeriggio (13:00–chiusura)
--         'custom'        → aperti solo nella finestra custom_start–custom_end
-- start_date/end_date: intervallo inclusivo (per i ponti); per un singolo
--                      giorno start_date == end_date.
-- ============================================================================
create table if not exists public.closures (
  id           uuid        default gen_random_uuid() primary key,
  scope        text        not null check (scope in ('both','george','berlin')),
  start_date   date        not null,
  end_date     date        not null check (end_date >= start_date),
  mode         text        not null check (mode in ('full','morning_only','afternoon_only','custom')),
  custom_start time,
  custom_end   time,
  note         text        check (note is null or char_length(note) <= 200),
  created_at   timestamptz default now(),
  -- se mode = custom, servono entrambi gli estremi e start < end
  check (
    mode <> 'custom'
    or (custom_start is not null and custom_end is not null and custom_start < custom_end)
  )
);

create index if not exists idx_closures_dates on public.closures (start_date, end_date);

alter table public.closures enable row level security;

-- Cleanup idempotente
drop policy if exists "closures_anon_select" on public.closures;
drop policy if exists "closures_auth_all"    on public.closures;

-- ANON: può solo leggere (nessun dato personale qui) — serve a /api/available e
-- /api/book che interrogano Supabase REST con la anon key.
create policy "closures_anon_select"
  on public.closures for select
  to anon
  using (true);

-- AUTHENTICATED (gestionale): CRUD completo
create policy "closures_auth_all"
  on public.closures for all
  to authenticated
  using (true)
  with check (scope in ('both','george','berlin'));

grant select on public.closures to anon;
grant select, insert, update, delete on public.closures to authenticated;
