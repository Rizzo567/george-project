# Refinement 2 — Aggiunte tecniche profonde

## Categorie mancanti dal Refinement 1

### Mobile-specific attacks
- Touch event hijacking
- Mobile browser autofill exploitation (telefono → phishing)
- Deep link hijacking

### Cache poisoning
- Cloudflare Pages cache: contiene endpoint API cachebili?
- Browser cache: dati sensibili (admin dashboard) cachati?
- Service Worker: presente? Vulnerabile?

### Time-based attacks
- Booking race conditions (TOCTOU)
- Timing oracle su login (è possibile dedurre email valida?)

### CSRF
- Form di prenotazione: CSRF token? No → ma è un POST anonimo quindi CSRF impact basso
- Admin actions: cambio stato prenotazione → CSRF possibile? Bearer token in localStorage protegge

### Storage attacks
- localStorage abuse: cosa salva admin.js?
- sessionStorage abuse
- IndexedDB?

### Email/SMS injection
- Edge Function `send-notification`: i campi finiscono in email/SMS senza sanitizzazione?
- Header injection in subject/body
- Link injection (phishing in conferma email)

### Image upload pipeline
- imgBase64: validato come immagine reale? Polyglot files (es. PNG+JS)?
- MIME sniffing
- Salvato su Drive: chi altro può accedere alla cartella Drive?
- Public link generato: pubblico permanente o scade?

### Calendar API abuse
- L'app crea eventi su Google Calendar del barbiere
- Se l'attaccante può prenotare con `note` malevole → quelle note finiscono nell'evento Calendar
- Phishing via Calendar invite?

### Denial of Wallet
- Cloudflare Workers fatturati per request
- Google Drive API quota
- Supabase row count quota
- Attacker può far esaurire quota gratuita → costi extra al cliente

## Strumenti di simulazione
- curl con anon key per verificare RLS (NO — non fare richieste reali)
- Analizza response shape da PostgREST docs
- Schema analysis: verifica DEFAULT policies di Postgres su tabelle nuove
