# Contract — Backend Settings API (Menu Impostazioni)

- **Agente**: backend
- **Tipo**: REST
- **Branch**: `feat/impostazioni-mvp-20260602`
- **Data**: 2026-06-02
- **File**: `functions/api/settings/{index,shop,services,staff,hours}.js`, `functions/api/preferences.js`, helper condiviso `functions/api/settings/_lib.js`
- **Dipende da**: `database-settings-schema.contract.md` (5 tabelle)

## Autenticazione (TASSATIVA su TUTTI gli endpoint)
Ogni richiesta deve includere:
```
Authorization: Bearer <supabase access_token>
```
Il token è il `access_token` della sessione Supabase dell'admin loggato.
La Function lo valida chiamando `GET {SUPABASE_URL}/auth/v1/user` (apikey ANON + Bearer token).
Se il token manca o è invalido → **401 `{error:"Non autorizzato"}`**.
Solo dopo la validazione la Function esegue le operazioni DB con **service_role** (bypassa RLS).
La service_role key NON è mai esposta al client.

### Come autenticare dal client admin (assets/js/admin.js)
Il client ha già una sessione Supabase. Recuperare il token e passarlo nell'header:
```js
const { data: { session } } = await supabase.auth.getSession();
const token = session?.access_token;
const res = await fetch('/api/settings', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```
Per POST/PATCH/PUT aggiungere anche `'Content-Type': 'application/json'` e `body: JSON.stringify(...)`.

## CORS
Lockdown identico a book.js: origin allow-list (`misterbarber.it`, `*.pages.dev`).
Preflight `OPTIONS` supportato su ogni endpoint; `Access-Control-Allow-Headers` include `Authorization`.

## Codici errore comuni
| code | quando |
|------|--------|
| 400 | body/parametro non valido |
| 401 | token mancante o non valido |
| 404 | risorsa non trovata (PATCH/DELETE su id inesistente) |
| 409 | conflitto unique (es. nome servizio duplicato, FK staff_slug) |
| 413 | payload troppo grande (layout preferences > 16KB) |
| 500 | errore interno (dettagli non esposti al client) |
| 503 | service_role non configurata lato server |

---

## Endpoint

### `GET /api/settings` → bundle config
Response 200:
```json
{
  "shop_settings": { "id","min_advance_minutes","max_future_days","weekly_closed_days":[0],
                     "require_email","auto_confirm","timezone","row_singleton" } | null,
  "services":  [ {"id","name","duration_min":null,"active":true,"sort_order":1}, ... ],
  "staff":     [ {"id","slug","display_name","calendar_id":null,
                  "event_duration_min":40,"slot_pitch_min":45,"active":true,"sort_order":1}, ... ],
  "business_hours": [ {"id","staff_slug","weekday":1,
                       "ranges":[{"start":"09:00","end":"12:00"}, ...]}, ... ]
}
```

### `PATCH /api/settings/shop` → aggiorna shop_settings (singleton)
Body (tutti i campi opzionali, almeno uno):
```json
{ "min_advance_minutes":0, "max_future_days":365, "weekly_closed_days":[0],
  "require_email":false, "auto_confirm":true, "timezone":"Europe/Rome" }
```
Validazione: `min_advance_minutes>=0`, `max_future_days 1..3650`, `weekly_closed_days` interi 0..6,
`timezone` formato `Area/Città`. Response 200: `{ "shop_settings": {...} }`.

### `/api/settings/services` → CRUD servizi (nessun prezzo)
- **GET** → `{ "services":[...] }`
- **POST** body `{ "name", "duration_min"?:1..600|null, "active"?:bool, "sort_order"?:int }`
  → 201 `{ "service": {...} }`; 409 se nome duplicato.
- **PATCH** body `{ "id":<uuid>, ...campi }` → 200 `{ "service": {...} }`; 404 se id inesistente.
- **DELETE** query `?id=<uuid>` → 200 `{ "ok":true }`.

### `/api/settings/staff` → gestione barbieri (MVP: solo update)
- **GET** → `{ "staff":[...] }`
- **PATCH** body `{ "slug":"george", ...campi }` (slug = chiave, NON modificabile)
  campi: `display_name`, `calendar_id`(null=usa env CF), `event_duration_min`,
  `slot_pitch_min`, `active`, `sort_order`. → 200 `{ "staff": {...} }`; 404 se slug inesistente.
  (`photo_url`/`bio` = Fase B, non gestiti).

### `PUT /api/settings/hours` → upsert orari
Singolo o batch. Upsert su `(staff_slug, weekday)`.
```json
{ "staff_slug":"george", "weekday":1, "ranges":[{"start":"09:00","end":"12:00"}] }
```
oppure batch:
```json
{ "entries":[ {"staff_slug","weekday","ranges"}, ... ] }
```
`ranges` formato HH:MM, `end>start`. `ranges:[]` = giorno senza orari (chiuso).
Response 200: `{ "business_hours":[...] }`; 409 se `staff_slug` inesistente (FK).

### `/api/preferences` → layout dashboard utente corrente
- **GET** → `{ "layout": {...} }` (riga dell'utente del token; `{}` se non esiste).
- **PUT** body `{ "layout": { "widgets":[{id,visible,order}], "theme", "default_view", "top_kpis" } }`
  → 200 `{ "layout": {...} }`. Max 16KB. La riga è legata a `user_id` estratto dal **token**
  (mai dal body): ogni admin vede/scrive solo le proprie preferenze.

---

## Refactor DB-driven con fallback (Task B)
`functions/api/_google.js`, `book.js`, `available.js` ora leggono la config dal DB
(service_role, una sola fetch cache-ata per-invocazione via `loadShopConfig(env)`) con
**fallback ESATTO ai default hardcoded** se la fetch fallisce o le tabelle critiche sono vuote.
Col seed applicato (valori = hardcoded) il comportamento di `/api/available` e `/api/book`
è **IDENTICO a oggi**.

Helper resi `async` / firme cambiate:
- `getEventDuration(barber, env)` — async — `staff.event_duration_min` (fallback george 40/berlin 60)
- `getSlotMinutes(barber, env)` — async — `staff.slot_pitch_min` (fallback 45/60)
- `getWorkRanges(barber, weekday, env)` — async — `business_hours.ranges` per giorno (fallback hardcoded). Firma retro-compatibile: senza `weekday`/`env` ritorna il fallback.
- `getCalendarId(barber, env, config?)` — sync — usa `staff.calendar_id` se passato `config`, altrimenti env CF.
- Nuovi: `loadShopConfig(env)`, `getAllowedServices(env)`, `getAllowedBarbers(env)`, `getWeeklyClosedDays(env)`.

## ENV richieste
Nessuna nuova ENV obbligatoria. Usate: `GEORGE_*`/`BERLIN_*` (service account + calendar_id),
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (segreta, server-only),
`RESEND_API_KEY`. URL+ANON pubblici sono anche costanti in `_google.js`.
Documentate in `.env.example`.
