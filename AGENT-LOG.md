# George Website — Agent Log

> Diario append-only. Ogni run agente aggiunge una entry.
> Non modificare entry passate.

---

## Formato entry

```
## [YYYY-MM-DD HH:MM] — [task eseguito]
- Task: [nome task dal BACKLOG]
- Azione: [cosa è stato fatto in 2-3 frasi]
- File modificati: [lista]
- Stato: completato | parziale | bloccato
- Note: [solo se bloccato]
```

---

<!-- Le entry degli agenti vengono aggiunte qui sotto -->

## [2026-05-25 12:00] — fix slot orari per barbiere
- Task: slot timing George vs Berlin
- Azione: Modificata `fallbackSlots()` in `prenota.html` per accettare il parametro `barber`. George riceve slot ogni 45 minuti (09:00, 09:45, 10:30, 11:15, 12:00, 14:00, 14:45, 15:30, 16:15, 17:00); Berlin riceve slot ogni 60 minuti (09:00–17:00). Aggiornata anche la chiamata nella funzione `loadSlots` da `fallbackSlots()` a `fallbackSlots(barber)`.
- File modificati: prenota.html
- Stato: completato

## [2026-06-01 ] — fix overbooking + festività + durata appuntamenti (MB-FIX-01)
- Task: 3 problemi prenotazioni — vedi docs/superpowers/plans/2026-06-01-fix-prenotazioni-festivita.md
- Azione: (1) Google Calendar reso autoritativo: prenota.html ora rispetta il flag `available`
  di /api/available (slot libero = calendar libero AND non in dbBooked); book.js aggiunge un
  freeBusy guard server-side (409 se occupato) → i blocchi creati a mano dai barbieri su Google
  Calendar ora bloccano i clienti. (2) Gestione festività: nuova tabella `closures` (scope
  george/berlin/both, intervallo date, mode full/morning_only/afternoon_only/custom) + pannello
  "Chiusure & Festività" nel gestionale (CRUD); available.js e book.js leggono le chiusure e
  bloccano/restringono di conseguenza. (3) Durata evento corretta: getEventDuration() → George
  40min, Berlin 60min (era hardcoded 30min). Nessuna migrazione eventi vecchi (scelta Manuel).
- File modificati: supabase/schema.sql, functions/api/_google.js, functions/api/available.js,
  functions/api/book.js, prenota.html, admin-mb26.html, assets/js/admin.js, assets/css/admin.css,
  SYSTEM-MAP.md, docs/superpowers/plans/2026-06-01-fix-prenotazioni-festivita.md
- Stato: completato (⚠ richiede esecuzione manuale SQL `closures` su Supabase + deploy)
- Note: la tabella closures va creata in Supabase SQL Editor prima del deploy, altrimenti le
  letture closures falliscono in modo soft (getClosure ritorna null → non blocca, nessun crash).

## [2026-06-01 ] — audit completo Supabase + fix sicurezza PII
- Task: revisione completa sistema (richiesta utente) — accesso DB diretto via pooler Postgres
- Azione: Audit SQL read-only su DB produzione (239 prenotazioni: 202 completed, 21 confirmed,
  16 cancelled). Trovati 3 problemi: (1) 🔴 FUGA PII — la anon key pubblica leggeva l'INTERA
  tabella appointments (nome/telefono/email/note) perché la policy insicura `anon_select_slots`
  using(true) era ancora attiva in prod e anon aveva grant SELECT/UPDATE/DELETE/TRUNCATE sulla
  tabella. Le RLS sicure di schema.sql non erano mai state applicate. (2) 🔴 calendar_event_id
  NULL su tutte le 239 righe → la cancellazione admin non rimuove mai l'evento Google Calendar
  (l'UPDATE lato client fallisce: anon non ha policy UPDATE). (3) 🟡 doppione berlin 2026-06-02
  14:00 (stesso cliente, doppio click). Inoltre bug nel mio schema.sql: view con
  security_invoker=true → avrebbe rotto la disponibilità (anon 0 righe); corretto a false (definer).
- Fix applicati (transazione con verifica come ruolo anon prima del commit):
  drop policy anon_select_slots + insert duplicate; revoke all su appointments da anon + grant
  solo insert; view appointment_slots ricreata definer (solo colonne non-PII); tabella closures
  creata con RLS. Verifica REST live: anon→appointments HTTP 401 ✅, anon→appointment_slots 200
  (21 righe) ✅, anon→closures 200 ✅. Doppione: record successivo messo a cancelled.
- File modificati: supabase/schema.sql (security_invoker fix) + DB produzione (migrazione applicata)
- Stato: completato — PII leak chiuso, closures creata
- DA FARE: (a) fix persistenza calendar_event_id lato server (book.js + service_role) per far
  funzionare la cancellazione calendar con la nuova logica Calendar-autoritativa; (b) audit Google
  Calendar (serve credenziali service account); (c) Manuel: ruotare la password DB usata in audit.
