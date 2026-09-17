-- ============================================================================
-- MIGRATION 010 — Secondo barbiere attivo: Reggie (affianca Berlin)
--
-- Reggie è "calendar-less" (come fu Gabriele nella 004): nessun Google Calendar,
-- calendar_id = null, nessuna env REGGIE_*. Il backend (_google.js
-- getCalendarId/getServiceAccount → null) usa il path Supabase:
--   • disponibilità slot dalle prenotazioni in appointment_slots
--   • nessun evento Google Calendar creato/cancellato
-- Le prenotazioni di Reggie arrivano nel gestionale come quelle di Berlin
-- (stessa /api/book server-side, stessa dedup, stesso indice 008).
--
-- Cosa fa (idempotente, rieseguibile):
--   1) allarga il CHECK appointments.barber a 'reggie'
--   2) se la policy anon_insert_only esiste ancora (009 non applicata), la
--      ricrea includendo 'reggie'; se la 009 l'ha già rimossa non la ricrea
--   3) allarga closures.scope e la policy closures_auth_all a 'reggie'
--   4) inserisce/aggiorna lo staff reggie (30/30 come Berlin, attivo, ordine 2)
--   5) copia gli orari business_hours di Berlin su Reggie (senza sovrascrivere
--      orari di Reggie già modificati dal gestionale)
--
-- ⚠️ Applicare PRIMA del deploy del sito che mostra Reggie: senza la riga staff
--    /api/available e /api/book rispondono 400 "Barbiere non valido" per reggie.
-- ============================================================================

-- 1) CHECK constraint appointments.barber -----------------------------------
alter table public.appointments
  drop constraint if exists appointments_barber_check;
alter table public.appointments
  add  constraint appointments_barber_check
  check (barber in ('george', 'berlin', 'gabriele', 'reggie'));

-- 2) RLS policy anon_insert_only (solo se ancora presente) -------------------
do $$
begin
  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'appointments'
       and policyname = 'anon_insert_only'
  ) then
    execute 'drop policy "anon_insert_only" on public.appointments';
    execute $p$
      create policy "anon_insert_only"
        on public.appointments for insert
        to anon
        with check (
          char_length(name)  between 1 and 100
          and char_length(phone) between 5 and 32
          and barber in ('george','berlin','gabriele','reggie')
          and service in ('Cut','Fade','Beard','Razor','Full')
          and (notes is null or char_length(notes) <= 500)
          and status in ('pending','confirmed')
        )
    $p$;
  end if;
end
$$;

-- 3) Closures: scope 'reggie' ------------------------------------------------
alter table public.closures
  drop constraint if exists closures_scope_check;
alter table public.closures
  add  constraint closures_scope_check
  check (scope in ('both','george','berlin','gabriele','reggie'));

drop policy if exists "closures_auth_all" on public.closures;
create policy "closures_auth_all"
  on public.closures for all
  to authenticated
  using (true)
  with check (scope in ('both','george','berlin','gabriele','reggie'));

-- 4) Staff reggie ------------------------------------------------------------
insert into public.staff (slug, display_name, calendar_id, event_duration_min, slot_pitch_min, active, sort_order) values
  ('reggie', 'Reggie', null, 30, 30, true, 2)
on conflict (slug) do update set
  display_name       = excluded.display_name,
  event_duration_min = excluded.event_duration_min,
  slot_pitch_min     = excluded.slot_pitch_min,
  active             = excluded.active,
  sort_order         = excluded.sort_order;

-- 5) Orari: copia quelli di Berlin ------------------------------------------
insert into public.business_hours (staff_slug, weekday, ranges)
select 'reggie', bh.weekday, bh.ranges
  from public.business_hours bh
 where bh.staff_slug = 'berlin'
on conflict (staff_slug, weekday) do nothing;

-- Verifica (attese: 1 riga staff attiva, stesse righe orari di Berlin):
--   select slug, active, event_duration_min, slot_pitch_min, sort_order from public.staff where slug = 'reggie';
--   select staff_slug, weekday, ranges from public.business_hours where staff_slug in ('berlin','reggie') order by weekday, staff_slug;

-- ============================================================================
-- FINE MIGRATION 010
-- ============================================================================
