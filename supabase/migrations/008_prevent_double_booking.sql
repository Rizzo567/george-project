-- ============================================================================
-- 008 — ANTI DOPPIA PRENOTAZIONE (2026-07-30)
-- ============================================================================
-- Incidente 30/07/2026: Tharusha e Lorenzo entrambi confermati su berlin 13:30.
--   Tharusha  created_at 10:50:34Z  calendar_event_id = quh0pmue6jom5dp7hj4m6lssbk
--   Lorenzo   created_at 10:51:48Z  calendar_event_id = NULL
--
-- Causa: la riga appointments veniva inserita dal CLIENT (anon key) PRIMA della
-- validazione server. /api/book rifiutava correttamente il secondo cliente con
-- 409 (dedup slot), ma:
--   1. il client ignorava la risposta non-ok (`r.ok ? r.json() : {}`) e mostrava
--      comunque successo;
--   2. anon non ha DELETE sotto RLS → la riga orfana restava "confirmed" per
--      sempre e compariva nel gestionale;
--   3. nessun vincolo DB impediva due righe attive sullo stesso slot.
--
-- Stesso pattern in archivio: berlin 2026-05-22 14:30, george 2026-05-22 18:30,
-- george 2026-05-25 15:00, george 2026-05-30 15:15 (coppie a 1-4 min di distanza,
-- tutte con calendar_event_id NULL sulla seconda riga).
--
-- Questa migrazione mette la garanzia dura nel database: due prenotazioni ATTIVE
-- (pending/confirmed) sullo stesso barbiere+data+ora non possono coesistere,
-- qualunque sia il client o il bug applicativo.
--
-- Il predicato usa gli stessi status della view appointment_slots, così che
-- "slot occupato" significhi esattamente la stessa cosa in tutto il sistema.
-- Gli status completed/cancelled sono esclusi: liberano lo slot (appuntamento
-- passato o annullato) e sono gli unici casi in cui esistono già duplicati
-- storici in tabella.
--
-- Verificato prima dell'apply: 0 slot duplicati fra le righe pending/confirmed
-- (30 righe attive) → la creazione dell'indice non può fallire.
-- ============================================================================

create unique index if not exists uniq_appointments_active_slot
  on public.appointments (barber, date, time)
  where status in ('pending', 'confirmed');

-- ============================================================================
-- Come si comporta il codice contro questo indice
-- ============================================================================
-- functions/api/book.js inserisce la prenotazione server-side con la
-- service_role key DOPO tutti i controlli (dedup, chiusure, freeBusy Google).
-- Se l'indice scatta, PostgREST risponde 409 con SQLSTATE 23505 e book.js
-- traduce in `409 {"error":"Slot già prenotato. Scegli un altro orario."}`
-- senza creare l'evento Google Calendar e senza lasciare righe orfane.
--
-- Un conflitto sulla PRIMARY KEY (appointments_pkey) invece NON è un doppio
-- slot: è lo stesso apptId reinviato (retry di rete, oppure un client vecchio
-- in cache che aveva già inserito la riga da sé). book.js lo tratta come
-- inserimento idempotente e prosegue.
-- ============================================================================

-- Rollback:
--   drop index if exists public.uniq_appointments_active_slot;
