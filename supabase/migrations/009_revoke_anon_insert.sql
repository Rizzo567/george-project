-- ============================================================================
-- 009 — HARDENING: togli ad anon il permesso di scrivere prenotazioni
-- ============================================================================
-- DA APPLICARE SOLO DOPO che 008 è attivo e il nuovo prenota.html è in
-- produzione da qualche giorno (per far scadere le pagine vecchie in cache dei
-- browser dei clienti).
--
-- Dopo il fix, l'unico percorso che crea prenotazioni è /api/book (service_role,
-- dopo dedup + chiusure + freeBusy). La anon key non deve più poter inserire:
-- con l'INSERT aperto, un client vecchio o un curl possono ancora creare righe
-- che scavalcano i controlli su chiusure/festività e orari di lavoro.
-- (Il doppio-slot resta impossibile comunque grazie all'indice della 008.)
--
-- ATTENZIONE: se applichi questa migrazione mentre un cliente ha ancora la
-- vecchia pagina aperta, quel cliente vedrà "Errore durante la prenotazione" e
-- dovrà ricaricare. Nessun dato viene perso, nessuna prenotazione fantasma.
-- ============================================================================

drop policy if exists "anon_insert_only" on public.appointments;

revoke insert on public.appointments from anon;

-- Verifica (attesa: 0 righe):
--   select policyname from pg_policies
--    where tablename = 'appointments' and 'anon' = any(roles) and cmd = 'INSERT';

-- Rollback (rimette il permesso come da schema.sql):
--   grant insert on public.appointments to anon;
--   create policy "anon_insert_only"
--     on public.appointments for insert
--     to anon
--     with check (
--       char_length(name)  between 1 and 100
--       and char_length(phone) between 5 and 32
--       and barber in ('george','berlin','gabriele')
--       and service in ('Cut','Fade','Beard','Razor','Full')
--       and (notes is null or char_length(notes) <= 500)
--       and status in ('pending','confirmed')
--     );
