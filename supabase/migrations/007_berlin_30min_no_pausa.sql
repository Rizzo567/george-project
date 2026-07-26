-- ============================================================================
-- MIGRATION 007 — Berlin: appuntamenti 30min senza pausa
--
-- CONTESTO: la pausa da 10 minuti fra un cliente e l'altro (migration 006) viene
-- eliminata. Gli appuntamenti restano da 30 minuti ma sono consecutivi:
--   • event_duration_min = 30  → evento Google Calendar da 30 minuti (invariato)
--   • slot_pitch_min     = 30  → slot ogni 30 minuti (era 40 = 30 + 10 pausa)
--
-- Con pitch 30 la griglia copre esattamente i range di apertura:
--   mattina    09:00 → 11:30 (ultimo slot finisce alle 12:00)
--   pomeriggio 13:00 → 18:30 (ultimo slot finisce alle 19:00)
-- Il range extra 18:45–18:46 (nato per recuperare la coda lasciata dal pitch 40)
-- non serve più e viene rimosso: si sovrapporrebbe allo slot 18:30–19:00.
--
-- Appuntamenti già prenotati: NON toccati. Restano validi, la loro durata reale
-- è sempre 30 minuti; cambia solo la griglia degli slot futuri.
--
-- Idempotente.
-- ============================================================================

-- Berlin: pitch 30 = appuntamenti back-to-back, nessun gap.
update public.staff
   set slot_pitch_min     = 30,
       event_duration_min = 30
 where slug = 'berlin';

-- business_hours: via il range extra 18:45–18:46, restano mattina + pomeriggio.
update public.business_hours
   set ranges = '[{"start":"09:00","end":"12:00"},{"start":"13:00","end":"19:00"}]'::jsonb
 where staff_slug = 'berlin';

-- ============================================================================
-- FINE MIGRATION 007
-- ============================================================================
