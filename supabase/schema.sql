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
create view public.appointment_slots
with (security_invoker = true)
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
