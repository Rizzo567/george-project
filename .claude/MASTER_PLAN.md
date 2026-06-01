# MASTER_PLAN.md

> Template prodotto dall'agente `architect` in [MASTER] mode.
> Sostituire tutti i segnaposto `[...]` prima di procedere con la Fase 2.

---

*Architect: claude-architect | Data: YYYY-MM-DD | Progetto: [NOME PROGETTO] | Revisione: 1*

---

## 1. Panoramica Architetturale

[Descrizione del sistema in 3-5 frasi. Cosa fa il sistema, chi lo usa, quale problema risolve. NON come è implementato — quello viene nei paragrafi successivi.]

**Tipo sistema**: [Web app monolitica | API REST | Microservizi | Backend-only | Full-stack | ...]
**Utenti target**: [Descrizione]
**Scala prevista**: [Ordine di grandezza utenti/richieste/giorno]

---

## 2. Stack Tecnologico

| Layer | Tecnologia | Versione | Note |
|-------|-----------|---------|------|
| Frontend | [React / Vue / Svelte / vanilla / N/A] | ... | |
| Backend | [Node.js / Python / Go / ...] | ... | Framework: ... |
| Database | [PostgreSQL / MySQL / MongoDB / SQLite / ...] | ... | ORM: ... |
| Cache | [Redis / Memcached / N/A] | ... | |
| Queue | [BullMQ / Celery / N/A] | ... | |
| Infra | [Docker / K8s / Vercel / Railway / ...] | ... | |
| CI/CD | [GitHub Actions / GitLab CI / N/A] | ... | |

---

## 3. Ownership dei File per Agente

| Agente | Directory/File | Esclusivo | Note |
|--------|---------------|---------|------|
| frontend | `src/components/`, `src/pages/`, `src/styles/` | sì | |
| backend | `src/api/`, `src/routes/`, `src/middleware/`, `src/services/`, `.env.example` | sì | |
| database | `migrations/`, `seeds/`, `src/db/`, `schema.*` | sì | |
| integrations | `src/integrations/`, `src/webhooks/`, `src/clients/`, `src/jobs/` | sì | |
| testing | `tests/`, `__tests__/`, `spec/`, `fixtures/` | sì | |
| devops | `.github/`, `Dockerfile`, `docker-compose.yml`, `Makefile`, `scripts/` | sì | |
| docs | `README.md`, `CHANGELOG.md`, `docs/` | sì | |

**Conflitti noti**: [Elenca eventuali sovrapposizioni e come vengono risolte per serializzazione]

---

## 4. Contratti d'Interfaccia Previsti

### 4.1 API REST / GraphQL

| Endpoint | Metodo | Input | Output | Owner | Consumato da |
|----------|--------|-------|--------|-------|-------------|
| `/api/[resource]` | POST | `{...}` | `{id, ...}` | backend | frontend |
| `/api/[resource]/:id` | GET | `id` (param) | `{...}` | backend | frontend |

### 4.2 Schema Database (tabelle principali)

| Tabella | Campi chiave | Relazioni | Indici |
|---------|-------------|----------|-------|
| `[tabella]` | id, ..., created_at | FK → [altra_tabella] | idx su email |

### 4.3 Variabili ENV Richieste

| Variabile | Owner | Richiesta in | Descrizione |
|-----------|-------|-------------|-------------|
| `DATABASE_URL` | database | prod, dev | Connection string DB |
| `JWT_SECRET` | backend | prod, dev | Secret JWT, min 32 char |
| `PORT` | backend | prod | Porta server HTTP |
| `NODE_ENV` | backend | prod | `production` \| `development` |

### 4.4 Eventi / Code (se applicabile)

| Evento | Emesso da | Consumato da | Payload chiave |
|--------|----------|-------------|---------------|
| `[nome:evento]` | integrations | backend | `{id, data, timestamp}` |

---

## 5. Strategia Branch

| Branch | Agente | Base | Merge target | Note |
|--------|--------|------|-------------|------|
| `feat/database-[slug]-[date]` | database | main | develop | |
| `feat/backend-[slug]-[date]` | backend | main | develop | dopo database |
| `feat/integrations-[slug]-[date]` | integrations | main | develop | |
| `feat/frontend-[slug]-[date]` | frontend | develop | develop | dopo backend |
| `feat/devops-[slug]-[date]` | devops | main | develop | |

**Merge su main**: SOLO Manuel, dopo QA e security-review.

---

## 6. Grafo delle Dipendenze

```
database ──────────────────┐
                           ▼
integrations ──────────► backend ──────────► frontend
                           │                     │
                           └────────► testing ◄──┘
                                          │
                               security-review ◄── verifier
```

**Ordine di build Master Mode:**
- Fase 2 (parallelo): `database`, `backend`, `integrations`
- Fase 3 (sequenziale): `frontend` (dopo backend contracts), `docs` (dopo tutti)
- Fase 4 (parallelo): `testing`, `security-review`, poi `verifier`

---

## 7. Rischi e Mitigazioni

| Rischio | Probabilità | Impatto | Mitigazione |
|---------|------------|---------|-------------|
| Schema DB incompatibile con ORM | media | alto | database espone contratto prima che backend inizi |
| ENV mancanti in CI/CD | bassa | alto | devops verifica .env.example completo |
| [Rischio specifico progetto] | ... | ... | ... |

---

## 8. Gate di Approvazione

- [ ] **Piano approvato da Manuel** (questo gate)
- [ ] database ha esposto contratto schema
- [ ] backend ha esposto contratto API
- [ ] integrations ha esposto contratti eventi (se applicabile)
- [ ] testing: tutti i test passano
- [ ] security-review: nessun finding Critical o High non risolto
- [ ] verifier: overall "pass"
- [ ] **Merge su main autorizzato da Manuel**

---

## 9. Note e Decisioni Architetturali

[Decisioni prese durante la progettazione con motivazione. Es: "Usato UUID invece di integer per id → evita enumerazione, compatibile con future migrazioni multi-DB."]

---

*Aggiornato da: architect | [DATA]*
