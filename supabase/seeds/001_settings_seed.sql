-- ============================================================================
-- SEED 001 — Menu Impostazioni
-- Valori HARDCODED ATTUALI estratti da:
--   - functions/api/_google.js  (getWorkRanges, getEventDuration, getSlotMinutes)
--   - functions/api/book.js     (ALLOWED_SERVICES, ALLOWED_BARBERS)
--   - functions/api/available.js (domenica chiusa => weekday 0)
--
-- OBIETTIVO: col seed applicato il comportamento del sito è IDENTICO a oggi.
--
-- Idempotente: ogni INSERT usa ON CONFLICT per non duplicare a riesecuzione.
-- Eseguire DOPO 001_settings_schema_up.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- shop_settings — singola riga con i default attuali.
-- Domenica chiusa (available.js: dayOfWeek === 0) => weekly_closed_days '{0}'.
-- ----------------------------------------------------------------------------
insert into public.shop_settings
  (min_advance_minutes, max_future_days, weekly_closed_days, require_email, auto_confirm, timezone, row_singleton)
values
  (0, 365, '{0}', false, true, 'Europe/Rome', true)
on conflict (row_singleton) do nothing;

-- ----------------------------------------------------------------------------
-- services — ALLOWED_SERVICES da book.js: Cut, Fade, Beard, Razor, Full.
-- Tutti attivi, sort 1..5, duration_min null (usa durata barbiere).
-- ----------------------------------------------------------------------------
insert into public.services (name, duration_min, active, sort_order) values
  ('Cut',   null, true, 1),
  ('Fade',  null, true, 2),
  ('Beard', null, true, 3),
  ('Razor', null, true, 4),
  ('Full',  null, true, 5)
on conflict (name) do nothing;

-- ----------------------------------------------------------------------------
-- staff — ALLOWED_BARBERS da book.js: george, berlin.
-- george: event_duration_min=40 (getEventDuration), slot_pitch_min=45 (getSlotMinutes)
-- berlin: event_duration_min=60, slot_pitch_min=60
-- calendar_id null => default resta env CF (GEORGE_CALENDAR_ID / BERLIN_CALENDAR_ID).
-- ----------------------------------------------------------------------------
insert into public.staff (slug, display_name, calendar_id, event_duration_min, slot_pitch_min, active, sort_order) values
  ('george', 'George', null, 40, 45, true, 1),
  ('berlin', 'Berlin', null, 60, 60, true, 2)
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
-- business_hours — range ESATTI da getWorkRanges(_google.js), tradotti in HH:MM.
--
-- GEORGE (minuti dalla mezzanotte -> HH:MM):
--   {540,720}   -> 09:00-12:00
--   {780,1080}  -> 13:00-18:00
--   {1095,1096} -> 18:15-18:16  (slot extra singolo 18:15)
-- BERLIN:
--   {540,720}   -> 09:00-12:00
--   {780,1140}  -> 13:00-19:00
--   {1125,1126} -> 18:45-18:46  (slot extra singolo 18:45)
--
-- Applicati a weekday 1..6 (lun-sab). Weekday 0 (domenica): NESSUNA riga
-- (chiuso via shop_settings.weekly_closed_days = '{0}').
-- generate_series(1,6) crea le 6 righe per ciascun barbiere.
-- ----------------------------------------------------------------------------
insert into public.business_hours (staff_slug, weekday, ranges)
select 'george', wd,
       '[{"start":"09:00","end":"12:00"},{"start":"13:00","end":"18:00"},{"start":"18:15","end":"18:16"}]'::jsonb
from generate_series(1, 6) as wd
on conflict (staff_slug, weekday) do nothing;

insert into public.business_hours (staff_slug, weekday, ranges)
select 'berlin', wd,
       '[{"start":"09:00","end":"12:00"},{"start":"13:00","end":"19:00"},{"start":"18:45","end":"18:46"}]'::jsonb
from generate_series(1, 6) as wd
on conflict (staff_slug, weekday) do nothing;

-- ----------------------------------------------------------------------------
-- user_preferences: NESSUN seed. Le righe nascono al primo salvataggio layout
-- di ciascun utente admin (auth.uid()). Nessun dato di default condiviso.
-- ----------------------------------------------------------------------------

-- ============================================================================
-- FINE SEED 001
-- ============================================================================
