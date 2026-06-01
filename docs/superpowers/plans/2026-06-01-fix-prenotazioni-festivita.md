# Piano Master — Fix Prenotazioni + Gestione Festività + Durata Appuntamenti

**PIANO-ID**: `MB-FIX-01` · **Data**: 2026-06-01 · **Stato**: in esecuzione
**Orchestratore**: main thread (Opus 4.8) · **Ispirato a**: Jarvis Piano Perfection

---

## STATO ATTUALE (root cause confermata da ispezione codice)

### BUG CRITICO #1 — Overbooking: i blocchi dei barbieri non bloccano i clienti
`prenota.html:1041-1046` ignora **di proposito** il flag `available` del calendario:
```js
// Calendar viene ignorato per la disponibilità (evita eventi stale da cancellazioni)
return { time: s.time, available: dbBooked.indexOf(s.time) === -1 };
```
George/Berlin bloccano i giorni creando eventi diretti su Google Calendar. Quegli eventi
**non entrano in Supabase** → `dbBooked` vuoto → frontend mostra tutto libero → clienti prenotano.
Inoltre `book.js:187` fa dedup **solo** su Supabase, senza `freeBusy` check → scrive cieco.

### BUG CRITICO #2 — Durata evento Calendar hardcoded a 30 min
`book.js:200`: `const endTotal = startH * 60 + startM + 30;`
Tutti gli eventi creati durano 30 min. Deve essere **George 40min, Berlin 60min**.
Lo slot grid (`fallbackSlots`, `getSlotMinutes`) è già corretto (45/60 pitch), ma l'evento no.

### GAP — Nessuna gestione festività/chiusure
Unico blocco è la domenica hardcoded (`available.js:60`). Niente tabella, niente UI.

---

## GAP ORDINATI PER IMPATTO

| # | Gap | Impatto | Causa root |
|---|-----|---------|------------|
| G1 | Overbooking su blocchi manuali barbieri | BLOCCANTE | Frontend + book.js ignorano Google Calendar |
| G2 | Durata evento sbagliata (30min) | ALTO | book.js hardcoded `+30` |
| G3 | Nessuna gestione festività/ponti | ALTO | Feature mai costruita |

---

## DECISIONI (Manuel, 2026-06-01)
- **Calendar autoritativo**: slot occupato se evento su Calendar OR prenotazione Supabase.
- **Closures scope selezionabile**: `george` | `berlin` | `both`.
- **Durata**: solo forward, nessuna migrazione eventi esistenti.

---

## PIANO PER DATABASE

### D1 — Tabella `closures` + RLS (`supabase/schema.sql`)
```sql
create table public.closures (
  id           uuid default gen_random_uuid() primary key,
  scope        text not null check (scope in ('both','george','berlin')),
  start_date   date not null,
  end_date     date not null,
  mode         text not null check (mode in ('full','morning_only','afternoon_only','custom')),
  custom_start time,
  custom_end   time,
  note         text check (note is null or char_length(note) <= 200),
  created_at   timestamptz default now()
);
```
- RLS: `authenticated` full CRUD; `anon` SELECT (no PII) per consentire a CF Functions di leggere.
- ⚠ Da eseguire manualmente nella Supabase SQL Editor.

---

## PIANO PER BACKEND (Cloudflare Pages Functions)

### B1 — `_google.js`
- `getEventDuration(barber)` → george 40, berlin 60.
- `getClosure(env, barber, date)` → fetch Supabase REST closures applicabili (scope match + range date), priorità a `full`.
- `closureWindow(closure)` → `null` (chiuso) | `{start,end}` minuti consentiti.

### B2 — `available.js`
- Legge closure: se `full` → `{slots:[], closed:true, reason}`; se parziale → restringe `workRanges` alla finestra consentita.
- Risposta arricchita con `closed` per evitare il fallback frontend.
- (Calendar già autoritativo qui via freeBusy.)

### B3 — `book.js`
- Durata evento da `getEventDuration` (no più `+30`).
- **freeBusy check** server-side sulla finestra evento → 409 se occupato (chiude G1 lato server).
- **closure check** → 409 "Giorno chiuso" se slot fuori finestra consentita.

---

## PIANO PER FRONTEND

### F1 — `prenota.html`
- `loadSlots`: slot libero solo se `s.available && dbBooked.indexOf(s.time)===-1` (calendar autoritativo in UI).
- Gestire `calData.closed === true` → messaggio "Chiuso" senza cadere su `fallbackSlots`.

### F2 — `admin-mb26.html` + `admin.js` + `admin.css`
- Nuova sezione **Chiusure / Festività**: lista chiusure attive + form (range date, scope, mode, custom times, note) + elimina.
- CRUD su tabella `closures` (Supabase auth).

---

## PIANO PER DOCS
- `SYSTEM-MAP.md`: closures, durata per-barbiere, calendar autoritativo.
- `AGENT-LOG.md`: esito sessione.

---

## CRITERI DI SUCCESSO MISURABILI

| Criterio | Baseline | Target |
|----------|----------|--------|
| Evento bloccato a mano su Calendar blocca cliente | ❌ no | ✅ sì (UI + book.js 409) |
| Durata evento George | 30min | 40min |
| Durata evento Berlin | 30min | 60min |
| Giorno festivo configurabile da gestionale | ❌ | ✅ full/mezza giornata/custom |
| Scope chiusura per barbiere | ❌ | ✅ george/berlin/both |
| book.js rifiuta slot in giorno chiuso | ❌ | ✅ 409 |

---

## ORDINE DI ESECUZIONE
1. DATABASE D1 (schema closures) →
2. BACKEND B1 (helpers) → B2 (available) → B3 (book) →
3. FRONTEND F1 (prenota) → F2 (admin) →
4. DOCS → verifica sintassi → commit su branch.

---

## ✅ ACHIEVEMENT — 2026-06-01

Tutti i task implementati dall'orchestratore (Opus 4.8).

| Fix | File | Tipo | Stato |
|-----|------|------|-------|
| Tabella `closures` + RLS | `supabase/schema.sql` | DB | ✅ |
| `getEventDuration` (40/60) + `getClosure`/`closureWindow` | `functions/api/_google.js` | BACKEND | ✅ |
| Closure check + restrizione finestra + `closed` flag | `functions/api/available.js` | BACKEND | ✅ |
| Durata corretta + freeBusy guard + closure check (409) | `functions/api/book.js` | BACKEND | ✅ |
| Calendar autoritativo in UI + `renderClosed` | `prenota.html` | FRONTEND | ✅ |
| Pannello Chiusure & Festività (CRUD) | `admin-mb26.html` + `admin.js` + `admin.css` | FRONTEND | ✅ |
| SYSTEM-MAP aggiornato | `SYSTEM-MAP.md` | DOCS | ✅ |

### Verifica sintassi
- `node --check` su `_google.js`, `available.js`, `book.js`, `admin.js` → tutti OK
- script inline `prenota.html` (2 blocchi) → 0 errori (vm.Script)

### ⚠ AZIONE MANUALE RICHIESTA (Manuel)
1. **Supabase SQL Editor**: eseguire la sezione `CHIUSURE / FESTIVITÀ` di `supabase/schema.sql`
   (crea tabella `closures` + RLS). Senza, le letture closures falliscono in modo soft
   (nessun blocco, nessun crash) ma il gestionale non potrà salvare le chiusure.
2. **Deploy** su Cloudflare Pages (push del branch → merge su main da te).
3. **Test rapido**: bloccare un giorno da Google Calendar di un barbiere → verificare che lo
   slot risulti occupato su prenota.html; creare una chiusura "domani / entrambi / full" dal
   gestionale → verificare "Chiuso in questa data" su prenota.html.
