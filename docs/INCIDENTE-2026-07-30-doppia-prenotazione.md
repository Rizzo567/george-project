# Incidente 30/07/2026 — due clienti prenotati alle 13:30

## Cosa ha visto il barbiere

Nel gestionale, sezione OGGI (giovedì 30 luglio), due appuntamenti `CONFIRMED` su
Berlin · Cut alle **13:30**: Tharusha e Lorenzo.

## Cosa dicono i dati

| cliente | `created_at` (UTC) | `calendar_event_id` | status finale |
|---|---|---|---|
| Tharusha | 2026-07-30 10:50:34 | `quh0pmue6jom5dp7hj4m6lssbk` | completed |
| Lorenzo | 2026-07-30 10:51:48 (**+74s**) | `NULL` | cancelled (a mano dal barbiere) |

74 secondi di scarto: **non** una corsa di millisecondi fra due click simultanei.

## Catena causale

1. **La riga nasceva prima della validazione.** `prenota.html` inseriva in
   `appointments` con la anon key e *poi* chiamava `/api/book`.
2. **Il server ha fatto il suo lavoro.** La dedup in `book.js` ha trovato la riga
   di Tharusha e ha risposto `409`, uscendo prima di creare l'evento Google
   Calendar — da qui `calendar_event_id = NULL` su Lorenzo: è la prova che il
   server aveva rifiutato.
3. **Il client ignorava il rifiuto.** `r.ok ? r.json() : {}` scartava la risposta
   409 e proseguiva fino a `doSuccess()`: Lorenzo ha visto "prenotato".
4. **Nessun rollback possibile.** Sotto RLS il ruolo anon ha solo INSERT: né
   DELETE né UPDATE. La riga orfana restava `confirmed` per sempre.
5. **Nessuna rete di sicurezza a DB.** Nessun vincolo unique su
   `(barber, date, time)`.
6. **Perché Lorenzo vedeva 13:30 libero:** `loadSlots()` carica la griglia una
   volta sola e non la rivalidava. Pagina aperta da prima delle 10:50:34 →
   disponibilità stantìa.

Inoltre `/api/available`, con Google Calendar configurato, guardava **solo** il
freeBusy di Google: una prenotazione a DB senza evento Calendar non chiudeva lo
slot lato API.

## Precedenti (stesso pattern in archivio)

Coppie create a 1–4 minuti di distanza, seconda riga sempre con
`calendar_event_id NULL`:

- `berlin` 2026-05-22 14:30
- `george` 2026-05-22 18:30
- `george` 2026-05-25 15:00
- `george` 2026-05-30 15:15

## Fix applicato

1. **`/api/book` crea la prenotazione** (service_role) **dopo** dedup, chiusure e
   freeBusy. Il client non scrive più a DB: se il server dice no, a DB non resta
   nulla.
2. **Indice unique parziale** `uniq_appointments_active_slot` su
   `(barber, date, time) where status in ('pending','confirmed')` — migrazione
   `008`. Rende il claim atomico: fra due request simultanee ne passa una sola.
   Conflitto su `appointments_pkey` = stesso `apptId` reinviato → trattato come
   inserimento idempotente, non come doppione.
3. **Rollback**: se la creazione dell'evento Calendar fallisce, la riga appena
   inserita viene cancellata e il client riceve `502` → lo slot non resta
   occupato da un appuntamento che il barbiere non vede sul calendario.
4. **Il client gestisce il rifiuto**: `409` → messaggio "orario appena
   prenotato", ritorno al calendario con la griglia ricaricata. Errori di rete
   non mostrano più successo.
5. **Griglia meno stantìa**: la disponibilità si ricarica al ritorno sulla
   scheda (`visibilitychange`), se il cliente è ancora sullo step calendario.
6. **`/api/available` somma le fonti**: prenotazioni Supabase **+** freeBusy
   Google. Basta che una dica "occupato".
7. Recuperato di sbieco: le note del cliente arrivavano al server come `notes`
   ma venivano lette come `note` → non finivano nella description dell'evento
   Calendar. Ora si accettano entrambi i nomi.
8. Migrazione `009` (da applicare qualche giorno dopo): revoca l'INSERT ad anon,
   così l'unico percorso di scrittura resta `/api/book`.

## Verifier

```
node tests/run.mjs
```

16 test senza dipendenze esterne (`tests/_harness.mjs` mocka `fetch` e firma un
JWT RS256 vero). Coprono: slot occupato → nessuna INSERT, conflitto sull'indice
unique → 409 senza evento Calendar, conflitto PK → idempotente, Calendar fallito
→ rollback, freeBusy occupato → 409, service_role mancante → 500 (mai un "ok"
senza riga a DB), e l'unione delle due fonti di disponibilità.

## Da fare a mano (DDL: serve la SQL editor di Supabase)

```sql
create unique index if not exists uniq_appointments_active_slot
  on public.appointments (barber, date, time)
  where status in ('pending', 'confirmed');
```

Poi, dopo qualche giorno, `supabase/migrations/009_revoke_anon_insert.sql`.
