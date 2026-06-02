# Contract - Frontend Settings UI (Menu Impostazioni)

- **Agente**: frontend
- **Tipo**: MODULE
- **Branch**: `feat/impostazioni-mvp-20260602`
- **Data**: 2026-06-02
- **File posseduti / modificati**:
  - `admin-mb26.html` (entrypoint, CDN SortableJS, link CSS, rimozione closures dalla dashboard)
  - `assets/js/admin.js` (bridge `window.MBAdmin`, rimozione logica closures)
  - `assets/js/admin-settings.js` (NUOVO - tutta la logica Impostazioni)
  - `assets/css/admin-settings.css` (NUOVO - stili overlay/sezioni + tema chiaro)
- **Dipende da**: `backend-settings-api.contract.md`, `database-settings-schema.contract.md`
- **Dipendenza CDN nuova**: SortableJS 1.15.2 (`https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js`), coperta da CSP `script-src ... cdn.jsdelivr.net`.

## Come si apre Impostazioni
1. Login admin nella dashboard (`admin-mb26.html`).
2. Header dashboard: bottone ingranaggio `#settingsTriggerBtn` (label "Impostazioni", a sinistra di "Esci").
3. Click apre overlay full-screen `#settingsOverlay` (role=dialog, aria-modal). Chiusura: X, click sul backdrop, o tasto Esc.

## Bridge esposto da admin.js (`window.MBAdmin`)
admin.js (caricato PRIMA di admin-settings.js) espone:
```js
window.MBAdmin = {
  sb,                 // client Supabase autenticato (usato per closures via RLS diretto)
  esc,                // HTML escaper
  show, hide,         // toggle .is-hidden
  getAccessToken(),   // Promise<string|null> = session.access_token
  signOut()           // logout + torna al login
};
```
admin.js chiama `window.MBSettings.onDashReady()` dopo il login (carica le preferenze e applica il layout). admin.js chiama `window.MBSettings.init()` se disponibile al termine dell'IIFE; in alternativa admin-settings.js si auto-inizializza leggendo `window.MBAdmin`.

## Modulo esposto (`window.MBSettings`)
```js
window.MBSettings = { init(), onDashReady() };
```

## Sezioni (tab nell'overlay)
| Tab | id pannello | Cosa fa | Endpoint |
|-----|-------------|---------|----------|
| Orari | `#tabPanelOrari` | shop_settings (giorni chiusi, anticipo, max futuro, require_email, auto_confirm) + orari per barbiere x giorno (fasce HH:MM) + **Chiusure/Festività** (migrate qui) | `PATCH /api/settings/shop`, `PUT /api/settings/hours`, closures via `sb.from('closures')` (RLS) |
| Servizi | `#tabPanelServizi` | lista servizi: nome, durata opzionale, attivo on/off, riordino drag-and-drop. Nessun prezzo | `POST/PATCH/DELETE /api/settings/services` |
| Dashboard | `#tabPanelDashboard` | tema chiaro/scuro, vista default (lista/giornaliera), widget show/hide + riordino drag-and-drop (SortableJS) | `GET/PUT /api/preferences` (debounce 700ms) |

Il bundle iniziale viene da `GET /api/settings` (cache `bundle`).

## Auth (rispettata da contratto backend)
Tutte le fetch `/api/settings/*` e `/api/preferences` passano da `apiFetch()`:
- header `Authorization: 'Bearer ' + access_token` (da `MBAdmin.getAccessToken()` -> `supabase.auth.getSession()`)
- per POST/PATCH/PUT aggiunge `Content-Type: application/json`
- su **401** o token assente: toast "Sessione scaduta", chiude overlay, esegue logout.

## ID DOM chiave (per testing)
- Entrypoint: `#settingsTriggerBtn`
- Overlay: `#settingsOverlay` (classe `is-open`), pannello `#settingsPanel`, chiusura `#settingsClose`
- Tab: `#tabBtnOrari` `#tabBtnServizi` `#tabBtnDashboard`; pannelli `#tabPanelOrari` `#tabPanelServizi` `#tabPanelDashboard`
- Orari shop: `#shopClosedDays` (chip giorni), `#shopMinAdvance`, `#shopMaxFuture`, `#shopRequireEmail`, `#shopAutoConfirm`, `#shopSaveBtn`
- Orari barbiere: card `.st-card[data-staff="<slug>"]`, righe `.st-day-row[data-weekday]`, fasce `.st-range` (`.st-range-start`/`.st-range-end`), salva `[data-save-hours="<slug>"]`
- Chiusure: `#closuresAddBtn`, `#closuresForm`, `#clScope` `#clMode` `#clStart` `#clEnd` `#clCustomStart` `#clCustomEnd` `#clNote`, `#clSaveBtn`, lista `#closuresList`, vuoto `#closuresEmpty`
- Servizi: lista `#svcList`, riga `.st-svc-row[data-id]`, form `#svcAddForm` (`#svcNewName`, `#svcNewDur`)
- Dashboard: `#themeRow`, `#viewRow`, lista widget `#widgetList`, item `.st-widget-item[data-id]`

## Layout dashboard (shape persistita)
```json
{ "widgets": [ { "id": "prossimo|kpi|charts|today|list", "visible": true, "order": 0 } ],
  "theme": "dark|light", "default_view": "list|day" }
```
Widget id -> elemento reale dashboard: `prossimo`=`.prossimo-card`, `kpi`=`.kpi-row`, `charts`=`.charts-grid`, `today`=`#todaySection`, `list`=`#aptList`.
- Applicazione: `#dashSection` diventa flex-column (`.dash-customizable`); `.stats-section` usa `display:contents` (`.stats-section--flat`) per rendere `kpi-row`/`charts-grid` ordinabili come item indipendenti; `order` inline + classe `.widget-hidden`.
- Tema: attributo `html[data-mb-theme="light|dark"]`. Default scuro = nessuna regressione visiva.

## Note di accessibilita / non-regressione
- Mobile-first 375px; touch target >= 44px; focus-visible su tutti gli interattivi.
- `prefers-reduced-motion: reduce` onorato (transizioni/animazioni disattivate).
- Una sola tinta accento (ember #E85A1F). Nessun em-dash nei sorgenti.
- Funzioni dashboard preesistenti (lista, filtri, stats, charts, detail panel, storico) invariate.
- Tema chiaro override mirato: l'overlay Impostazioni resta scuro (pannello modale) in entrambi i temi.
