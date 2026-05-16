# Refinement 1 — Security Review Methodology

## Critique della metodologia originale

La metodologia iniziale è solida ma manca di:

1. **Threat modeling esplicito** — non definisce gli attori della minaccia (anon attacker, malicious customer, ex-employee, competitor)
2. **Business logic abuse** — focalizzata su OWASP Top 10, ma manca pattern di abuso di business logic (es. prenotare slot e cancellarli per saturare l'agenda)
3. **Privacy by Design (GDPR)** — solo accenni, nessun controllo su data retention, right-to-erasure, data minimization
4. **Supply chain** — CDN script verificati per versione ma non per tampering history
5. **Logging & detection** — nessun audit su cosa viene loggato, audit trail mancanti
6. **Secret scanning** — manca scan di git history per leak passati (chiavi, token)
7. **Lateral movement** — se anon key è compromessa, cosa altro si può fare? Cosa raggiungere?
8. **Edge functions** — Supabase Edge Function `send-notification` non auditata per SSRF/injection

## Aggiunte proposte

### Threat Actors
- **External attacker** (no auth) — bot/scraper
- **Malicious customer** — ha completato una prenotazione, cosa può fare?
- **Disgruntled employee** — barbiere con credenziali, cosa può abusare?
- **Competitor** — vuole sabotare le prenotazioni
- **Scraper** — vuole rubare PII dei clienti per phishing

### Business Logic Attacks
- Prenotare tutti gli slot del giorno per saturare l'agenda di un concorrente
- Prenotare e cancellare ripetutamente per generare load
- Bookare un servizio costoso con dati fake (no-show attack)
- Race condition: doppia prenotazione dello stesso slot in millisecondi

### GDPR Deep Dive
- Diritto all'oblio: esiste meccanismo per eliminare dati cliente?
- Data retention: per quanto tempo si tengono i dati?
- Consenso: il form raccoglie consenso esplicito?
- Privacy Policy linkata?
- Telefono = dato personale ai sensi GDPR → adeguata cifratura at-rest?

### Audit Logging
- Le modifiche admin sono loggate (chi ha cancellato cosa)?
- I tentativi di login falliti sono tracciati?

### Process & Operational Security
- Backup strategy?
- Disaster recovery?
- Chi ha accesso al progetto Supabase?
