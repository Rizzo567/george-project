# Refinement 3 — Metodologia finale consolidata

## Threat Model

### Asset critici (ordinati per valore)
1. **PII clienti** (nome + telefono) — GDPR, reputazione
2. **Accesso admin** — può cancellare prenotazioni, vedere tutto
3. **Disponibilità servizio** — barber può perdere clienti se sito down
4. **Google Calendar barbiere** — accesso write via service account
5. **Google Drive** — upload immagini
6. **Budget Cloudflare/Supabase** — denial of wallet

### Threat Actors
- T1 Scraper anonimo (alta probabilità, basso skill)
- T2 Malicious customer (media probabilità, basso skill)
- T3 Competitor / sabotatore (bassa probabilità, medio skill)
- T4 Targeted attacker su George (bassa probabilità, alto skill)

## Metodologia Finale

### Fase A — Inventario superficie d'attacco
1. Tutti gli endpoint HTTP esposti (Workers + Supabase PostgREST + Supabase Auth + Edge Functions)
2. Tutti i secret e dove vivono (env vars, hardcoded, public CDN)
3. Tutte le integrazioni esterne (Google APIs, Supabase, Cloudflare)
4. Tutte le superfici di input (forms, URL params, hash, postMessage)

### Fase B — Static audit per categoria (OWASP + business logic)
A. Injection (SQL, XSS, HTML, header, CRLF, calendar event injection, email)
B. Broken Auth (admin discovery, brute force, recovery token, session)
C. Access Control (RLS bypass, IDOR, privilege escalation, mass assignment)
D. Misconfiguration (CORS, headers, secrets, defaults)
E. Crypto (PII storage, hashing, transit)
F. Insecure Design (input validation, rate limit, captcha, business logic)
G. Vulnerable Components (CDN versions, SRI)
H. SSRF / Request Forgery
I. **Logging & Monitoring** (audit trail, login failures)
J. **GDPR / Privacy** (consent, retention, erasure, minimization)
K. **DoS / Denial of Wallet** (rate limit, size limit, quota)
L. **Race Conditions** (booking, slot reservation)
M. **Supply Chain** (CDN integrity, dependencies)

### Fase C — Attack simulation (paper-only, no live calls)
Per ogni vuln trovata in B:
- Payload concreto
- Risultato atteso
- Severity (CVSS-like)
- Exploitability

### Fase D — Report (SECURITY-REPORT.md)
- Executive summary
- Findings ordinati per severity
- Attack surface map
- GDPR compliance status
- Raccomandazioni operative (non solo codice: anche processo)

### Fase E — Fix
- Schema fix prioritario (RLS data leak)
- Input validation server-side
- Security headers
- CORS lockdown
- SRI sui CDN
- Rate limiting + dedup
- Hardening admin
- GDPR (privacy policy link, consenso)

### Fase F — Verifica + Commit
- Diff review
- Test che HTML resti valido
- Commit descrittivo in italiano

## Principi guida durante l'audit

1. **Assume breach** — l'anon key è già pubblica, cosa può fare l'attaccante?
2. **Defense in depth** — RLS + validation + rate limit + monitoring, non un singolo layer
3. **Least privilege** — ogni ruolo (anon, authenticated) deve avere il minimo accesso
4. **Fail closed** — in caso di errore, negare anziché concedere
5. **Validate at boundary** — ogni input validato dove entra (Worker, RLS, DB constraint)

## Decisioni durante il fix
- Quando il fix richiederebbe breaking change al frontend, scelgo retrocompat
- Quando manca info di business (es. domini allowed), uso variabile env documentata
- Non rompo funzionalità esistenti per il fix
