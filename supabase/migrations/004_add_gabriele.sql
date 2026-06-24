-- ============================================================================
-- MIGRATION 004 — Aggiunge il barbiere Gabriele (sostituisce George)
--
-- Gabriele è "calendar-less": NON ha ancora un account Google / Service Account,
-- quindi calendar_id = null e nessuna env GABRIELE_* esiste. Il backend
-- (_google.js getCalendarId/getServiceAccount) ritorna null per slug != george/berlin
-- → book.js / available.js usano il path Supabase:
--   • disponibilità slot calcolata dalle prenotazioni in appointment_slots
--   • nessun evento creato su Google Calendar
-- Le prenotazioni di Gabriele vivono SOLO nella dashboard admin.
--
-- Quando Gabriele avrà l'account Google:
--   1) creare le env Cloudflare (o impostare staff.calendar_id) + service account
--   2) aggiornare getCalendarId/getServiceAccount in _google.js con il ramo 'gabriele'
--      (oppure valorizzare staff.calendar_id qui) → il path Calendar si attiva da solo.
--
-- Orari e durata: identici a Berlin (event 60min, pitch 60min).
-- ============================================================================

insert into public.staff (slug, display_name, calendar_id, event_duration_min, slot_pitch_min, active, sort_order) values
  ('gabriele', 'Gabriele', null, 60, 60, true, 3)
on conflict (slug) do update set
  display_name       = excluded.display_name,
  event_duration_min = excluded.event_duration_min,
  slot_pitch_min     = excluded.slot_pitch_min,
  active             = excluded.active,
  sort_order         = excluded.sort_order;

-- Orari lavorativi lun-sab (weekday 1..6), uguali a Berlin.
-- Domenica (0): nessuna riga => chiuso via shop_settings.weekly_closed_days.
insert into public.business_hours (staff_slug, weekday, ranges)
select 'gabriele', wd,
       '[{"start":"09:00","end":"12:00"},{"start":"13:00","end":"19:00"},{"start":"18:45","end":"18:46"}]'::jsonb
from generate_series(1, 6) as wd
on conflict (staff_slug, weekday) do nothing;

-- ============================================================================
-- FINE MIGRATION 004
-- ============================================================================
