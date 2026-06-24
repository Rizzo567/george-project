-- ============================================================================
-- MIGRATION 005 — Sblocca le prenotazioni per Gabriele
--
-- BUG: la migration 004 ha aggiunto Gabriele alla tabella `staff` (e quindi al
-- frontend + alle liste DB-driven getAllowedBarbers), MA non ha mai aggiornato:
--   1) il CHECK constraint della tabella `appointments` (barber in ('george','berlin'))
--   2) la RLS policy `anon_insert_only` (stesso check barber in ('george','berlin'))
-- Risultato: ogni INSERT con barber='gabriele' veniva rifiutato da Postgres
-- (violazione CHECK / RLS) → il client mostrava "Errore durante la prenotazione"
-- e la riga non arrivava MAI nella dashboard admin.
--
-- FIX: allarga entrambi i vincoli per includere 'gabriele'. Manteniamo george e
-- berlin per non rompere lo storico delle prenotazioni esistenti.
-- Aggiungiamo anche 'gabriele' allo scope delle closures (admin può chiudere i
-- giorni di Gabriele).
-- ============================================================================

-- 1) CHECK constraint sulla colonna barber ----------------------------------
alter table public.appointments
  drop constraint if exists appointments_barber_check;
alter table public.appointments
  add  constraint appointments_barber_check
  check (barber in ('george', 'berlin', 'gabriele'));

-- 2) RLS policy anon_insert_only --------------------------------------------
drop policy if exists "anon_insert_only" on public.appointments;
create policy "anon_insert_only"
  on public.appointments for insert
  to anon
  with check (
    char_length(name)  between 1 and 100
    and char_length(phone) between 5 and 32
    and barber in ('george','berlin','gabriele')
    and service in ('Cut','Fade','Beard','Razor','Full')
    and (notes is null or char_length(notes) <= 500)
    and status in ('pending','confirmed')
  );

-- 3) Closures: consenti scope 'gabriele' ------------------------------------
alter table public.closures
  drop constraint if exists closures_scope_check;
alter table public.closures
  add  constraint closures_scope_check
  check (scope in ('both','george','berlin','gabriele'));

drop policy if exists "closures_auth_all" on public.closures;
create policy "closures_auth_all"
  on public.closures for all
  to authenticated
  using (true)
  with check (scope in ('both','george','berlin','gabriele'));

-- ============================================================================
-- FINE MIGRATION 005
-- ============================================================================
