-- ============================================================================
-- MIGRATION 002 — Hardening RLS Impostazioni (SEC-004, difesa in profondità)
-- Data: 2026-06-02
-- ----------------------------------------------------------------------------
-- CONTESTO: il fix applicativo SEC-001 (gate admin in functions/api/settings/_lib.js)
-- chiude l'accesso via Functions. Ma un utente `authenticated` potrebbe colpire
-- PostgREST DIRETTAMENTE col proprio access_token + anon apikey: le policy 001
-- erano `for all to authenticated using(true)` → qualunque registrato avrebbe
-- lettura/scrittura diretta sulle tabelle config.
--
-- Questa migrazione restringe le 4 tabelle di config (shop_settings, services,
-- staff, business_hours) ai soli admin, controllando l'email nel JWT Supabase.
-- user_preferences resta per-utente (auth.uid()=user_id), già corretta in 001.
--
-- NB: l'allowlist email è duplicata qui (DB) e in _lib.js (app). Tenerle allineate.
-- In alternativa, DISABILITARE il signup Supabase (Auth → Disable signups) rende
-- `authenticated` == admin e using(true) tornerebbe accettabile; questa migrazione
-- aggiunge comunque difesa in profondità.
-- ============================================================================

do $$
declare
  admin_emails text := '''georgevelozperez5@gmail.com'',''superberlin0204@gmail.com''';
  t text;
begin
  foreach t in array array['shop_settings','services','staff','business_hours']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_auth_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((auth.jwt() ->> ''email'') in (%s)) with check ((auth.jwt() ->> ''email'') in (%s))',
      t || '_admin_all', t, admin_emails, admin_emails
    );
  end loop;
end $$;

-- ============================================================================
-- ROLLBACK (ripristina le policy permissive 001):
--   do $$ declare t text; begin
--     foreach t in array array['shop_settings','services','staff','business_hours'] loop
--       execute format('drop policy if exists %I on public.%I', t||'_admin_all', t);
--       execute format('create policy %I on public.%I for all to authenticated using(true) with check(true)', t||'_auth_all', t);
--     end loop; end $$;
-- ============================================================================
