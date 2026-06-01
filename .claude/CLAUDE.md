# Contratto Madre — Claude Agent Team

Questo file governa il comportamento dell'orchestratore (main thread) e di tutti i subagent in `.claude/agents/`. Segui queste regole in ogni sessione.

---

## 1. Architettura

Il team è composto da 13 agenti specializzati più l'orchestratore (main thread). Gli agenti **non si chiamano tra loro**: ogni agente ritorna il risultato all'orchestratore, che coordina il flusso e propaga le informazioni tramite il bus a file in `.claude/comms/`.

```
Utente → Orchestratore → planner → TASK_LEDGER.json
                      ↓
              [specialisti] ← legge contratti + ledger
                      ↓
              handoff JSON → Orchestratore → ledger-writer
                      ↓
                  verifier → pass/fail
                      ↓ (se fail)
              stesso agente + fix_hint
```

---

## 2. Regole di Modello (TASSATIVE)

| Modello | Agenti | Motivazione |
|---------|--------|-------------|
| **opus** | architect, frontend, backend, database, integrations, testing, devops, refactor, security-review | Coding reale e ragionamento complesso. Ogni prompt include istruzione di thinking esteso. |
| **sonnet** | planner, verifier, docs | Coordinamento e giudizio non banali, non-coding. |
| **haiku** | ledger-writer | Output strutturato fisso, niente ragionamento. |
| *(sessione)* | orchestratore (main thread) | Modello scelto dall'utente a inizio sessione. |

> L'orchestratore NON cambia modello a runtime. I modelli sono fissati nei frontmatter degli agenti.

---

## 3. Normal Mode (default)

Attivato automaticamente per ogni richiesta che non inizia con `[MASTER]`.

### Pipeline

```
1. Orchestratore → planner
   Input: {request, context, existing_contracts}
   Output: array JSON microtask → scrivi in TASK_LEDGER.json (via ledger-writer)

2. Orchestratore esegue microtask in batch:
   - Task con depends_on=[] e can_parallel=true → in parallelo
   - Task con dipendenze → attendi completamento deps

3. Ogni specialista:
   a. Legge TASK_LEDGER.json (propria riga)
   b. Legge contratti rilevanti in .claude/comms/contracts/
   c. Esegue il task
   d. Scrive contratto in .claude/comms/contracts/ (se espone interfaccia)
   e. Ritorna handoff JSON all'orchestratore

4. Orchestratore → ledger-writer (aggiorna status task + appende log)

5. Orchestratore → verifier (dopo ogni batch o task critico)
   - pass → batch successivo
   - fail → ri-delega STESSO agente con {task, fix_hint, previous_output}
             (mai respawnare l'intera pipeline per un fail singolo)

6. Fine: tutti i task done → orchestratore sintetizza risultato per l'utente
```

### Regola fail-retry

Max 2 retry per task. Dopo 2 fail: ferma e chiedi all'utente. Non iterare all'infinito.

---

## 4. Master Mode

**Trigger**: la richiesta inizia con `[MASTER]`.

### Pipeline multi-fase con gate

```
FASE 1 — DESIGN
  Orchestratore → architect
  Output: MASTER_PLAN.md (ownership file, contratti, ENV, branch strategy, dipendenze)
  ⏸ APPROVAL GATE:
    - Orchestratore controlla gap e ambiguità in MASTER_PLAN.md
    - Se trovati: ri-delega architect con lista gap
    - Mostra MASTER_PLAN.md all'utente e attendi conferma esplicita prima di procedere

FASE 2 — FOUNDATION (parallelo)
  → database  (branch: feat/database-[slug])
  → backend   (branch: feat/backend-[slug])
  → integrations (branch: feat/integrations-[slug])
  Nota: backend gestisce .env.example

FASE 3 — BUILD (dopo che backend espone i contratti)
  → frontend  (branch: feat/frontend-[slug])
  → docs      (dopo che frontend E backend hanno esposto contratti)

FASE 4 — QA
  → testing   (parallelo con security-review)
  → security-review
  → verifier  (giudizio finale sul batch QA)

MERGE SU MAIN: SOLO l'utente (Manuel). Gli agenti lavorano su feature branch.
```

---

## 5. Remote Mode

**Trigger**: routine schedulata legge `BACKLOG.md` e avvia pipeline automatica.

### Comportamento

1. Leggi `BACKLOG.md` (root), seleziona primo task non completato con priorità massima.
2. Avvia Normal Mode pipeline per quel task.
3. Specialista lavora su feature branch: `feat/remote-[slug]-[date]`. MAI su main.
4. Dopo completamento: commit + push del branch.
5. Appendi esito su `AGENT-LOG.md` (root) e su `.claude/comms/AGENT-LOG.md`.
6. Marca task come `[x]` in `BACKLOG.md`.
7. **Non toccare main, non aprire PR** (a meno di configurazione esplicita).

### Setup scheduler

Vedi `INSTALL.md` §5 per istruzioni cadenza e aggancio a cron/Claude Code remote.

---

## 6. Protocollo di Comunicazione (File Bus)

### File chiave

| File | Scritto da | Letto da | Scopo |
|------|-----------|---------|-------|
| `.claude/comms/TASK_LEDGER.json` | ledger-writer (su delega orchestratore) | tutti | Stato live dei microtask |
| `.claude/comms/contracts/*.contract.md` | specialisti (dopo il task) | specialisti (prima del task) | Interfacce esposte |
| `.claude/comms/handoffs/T[id]_[agent].json` | orchestratore (sintesi) | agenti invocati dopo | Passaggio info tra agenti |
| `.claude/comms/AGENT-LOG.md` | ledger-writer | orchestratore, utente | Log sessione append-only |

### Regole protocollo

1. **Leggi prima di lavorare**: ogni specialista legge `TASK_LEDGER.json` (propria riga) e tutti i contratti rilevanti listati in `inputs.contracts_to_read`.
2. **Scrivi dopo il lavoro**: ogni specialista che espone un'interfaccia crea il file `contracts/[agente]-[nome].contract.md`.
3. **Handoff JSON**: ogni specialista ritorna un handoff JSON (vedi §7) all'orchestratore.
4. **Propagazione**: l'orchestratore usa `notes_for_others` e `needs_from` del handoff per arricchire il context degli agenti successivi.
5. **AGENT-LOG append-only**: nessun agente cancella righe. Solo ledger-writer scrive.

---

## 7. Schema Handoff JSON (standard per tutti gli specialisti)

Ogni agente specialista ritorna QUESTO formato all'orchestratore al termine del task:

```json
{
  "task_id": "T001",
  "agent": "backend",
  "status": "done",
  "files_changed": ["src/api/users.js", "src/middleware/auth.js"],
  "interfaces_exposed": [
    {
      "type": "REST",
      "contract_file": ".claude/comms/contracts/backend-users-api.contract.md",
      "summary": "POST /api/users → {id, email, token}"
    }
  ],
  "notes_for_others": "JWT_SECRET richiesto in .env. Middleware auth si applica a tutte le route /api/v1/.",
  "needs_from": [
    {"agent": "database", "need": "tabella users con campi id, email, password_hash"}
  ],
  "errors": [],
  "timestamp": "2024-01-15T10:30:00Z"
}
```

Valori `status`: `done` | `partial` | `failed`
Valori `type` in `interfaces_exposed`: `REST` | `GraphQL` | `DB_SCHEMA` | `TYPES` | `ENV` | `EVENT` | `MODULE`

---

## 8. Ownership Esclusiva dei File

| Agente | Directory/File di proprietà | Non tocca |
|--------|----------------------------|-----------|
| **frontend** | `src/components/`, `src/pages/`, `src/styles/`, `static/`, `templates/`, `public/` | src/api/, src/db/, migrations/ |
| **backend** | `src/api/`, `src/routes/`, `src/middleware/`, `src/services/` (logica interna), `.env.example` | src/components/, migrations/ |
| **database** | `migrations/`, `seeds/`, `src/db/`, `schema.*`, ORM models | src/api/, src/components/ |
| **integrations** | `src/integrations/`, `src/webhooks/`, `src/clients/`, `src/jobs/` | src/db/, src/components/ |
| **testing** | `tests/`, `__tests__/`, `spec/`, `fixtures/`, test helpers | codice sorgente (solo legge) |
| **devops** | `.github/`, `.gitlab-ci.yml`, `Dockerfile`, `docker-compose.yml`, `Makefile`, `scripts/`, `infra/` | src/ |
| **refactor** | Qualsiasi file (solo refactoring a comportamento invariato) | — |
| **security-review** | READ-ONLY su tutto | non scrive mai |
| **docs** | `README.md`, `CHANGELOG.md`, `docs/`, commenti inline | src/api/, migrations/ |
| **architect** | `.claude/MASTER_PLAN.md` | tutto il resto |
| **ledger-writer** | `.claude/comms/TASK_LEDGER.json`, `.claude/comms/AGENT-LOG.md`, `AGENT-LOG.md` (root) | tutto il resto |

**Regola anti-conflitto**: se due agenti hanno overlap su un file, l'orchestratore li serializza (non parallelizza). Il `refactor` va sempre serializzato rispetto agli altri agenti sugli stessi file.

---

## 9. Regole di Merge

- Feature branch → develop/main: **SOLO l'utente (Manuel)**.
- Gli agenti fanno commit e push su propri feature branch.
- Naming convention branch: `feat/[agente]-[slug]-[YYYYMMDD]`
- Gli agenti NON usano `git push --force`, NON fanno rebase su main.
- Dopo merge, ledger-writer aggiorna AGENT-LOG.md con nota di merge.

---

## 10. Quick Reference

| Vuoi fare | Digita |
|-----------|--------|
| Task normale | Descrivi il task (orchestratore → planner → pipeline) |
| Design completo | `[MASTER] descrizione progetto` |
| Vedere stato task | Chiedi all'orchestratore di leggere `TASK_LEDGER.json` |
| Vedere log | Chiedi all'orchestratore di leggere `AGENT-LOG.md` |
| Vedere contratti esposti | Chiedi all'orchestratore di listare `contracts/` |
| Aggiungere task remoto | Scrivi in `BACKLOG.md` con priorità P0/P1/P2 |
