-- ============================================================================
-- MIGRATION 006 — Solo Berlin + appuntamenti 30min con pausa 10min
--
-- CONTESTO: il negozio resta con un solo barbiere, Berlin. George (trasferito in
-- Australia) e Gabriele vengono disattivati. Le prenotazioni di Berlin passano a
-- 30 minuti di durata reale con 10 minuti di pausa tra un cliente e l'altro:
--   • event_duration_min = 30  → evento Google Calendar da 30 minuti
--   • slot_pitch_min      = 40  → slot ogni 40 minuti = 30 appuntamento + 10 pausa
--
-- Lo storico appointments (barber = 'george' | 'gabriele') NON viene toccato: il
-- CHECK constraint resta permissivo così le righe passate restano valide. La lista
-- dei barbieri prenotabili è DB-driven (staff where active) → basta disattivare.
--
-- Idempotente.
-- ============================================================================

-- Berlin: durata 30min, pitch 40min (30 + 10 di pausa), primo in ordine.
update public.staff
   set event_duration_min = 30,
       slot_pitch_min     = 40,
       sort_order         = 1,
       active             = true
 where slug = 'berlin';

-- George e Gabriele: fuori. active=false → spariscono da getAllowedBarbers,
-- dal frontend DB-driven e dalle liste admin. Righe conservate per lo storico.
update public.staff
   set active = false
 where slug in ('george', 'gabriele');

-- ============================================================================
-- FINE MIGRATION 006
-- ============================================================================
