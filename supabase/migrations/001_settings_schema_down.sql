-- ============================================================================
-- MIGRATION 001 — Menu Impostazioni (DOWN / ROLLBACK)
-- Data: 2026-06-02 | Branch: feat/database-impostazioni-20260602
-- ----------------------------------------------------------------------------
-- Annulla 001_settings_schema_up.sql + 001_settings_seed.sql.
-- Droppa SOLO le 5 tabelle nuove (e i loro trigger/policy/indici cadono con
-- la tabella via CASCADE). NON tocca appointments, appointment_slots, closures.
--
-- NON droppa la funzione public.set_updated_at(): è condivisa con la tabella
-- appointments (definita in schema.sql). Rimuoverla romperebbe quel trigger.
--
-- Ordine: business_hours prima di staff (FK staff_slug -> staff.slug).
-- ============================================================================

drop table if exists public.user_preferences cascade;
drop table if exists public.business_hours   cascade;
drop table if exists public.services         cascade;
drop table if exists public.staff            cascade;
drop table if exists public.shop_settings    cascade;

-- ============================================================================
-- FINE MIGRATION 001 DOWN
-- ============================================================================
