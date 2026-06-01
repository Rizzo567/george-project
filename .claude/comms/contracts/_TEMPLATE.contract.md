---
exposed_by: [agente che espone: backend | database | integrations | frontend | devops]
consumed_by: [lista agenti che consumano: frontend, testing, ...]
type: REST | GraphQL | DB_SCHEMA | TYPES | ENV | EVENT | MODULE
version: 1
created_at: YYYY-MM-DD
updated_at: YYYY-MM-DD
task_id: T001
---

# Contratto: [Nome Interfaccia]

> Breve descrizione in 1 frase di cosa espone questo contratto.

---

## Sezione per tipo REST / GraphQL

### Endpoint

| Metodo | Path | Auth richiesta |
|--------|------|---------------|
| POST | /api/[resource] | JWT Bearer |
| GET | /api/[resource]/:id | JWT Bearer |

### Input Schema

```json
{
  "field": "type — descrizione"
}
```

### Response Schema (200)

```json
{
  "field": "type — descrizione"
}
```

### Codici errore

| Codice | Quando |
|--------|--------|
| 400 | Input non valido |
| 401 | Token mancante o scaduto |
| 404 | Risorsa non trovata |
| 422 | Validazione fallita |
| 500 | Errore server |

---

## Sezione per tipo DB_SCHEMA

### Tabella: [nome_tabella]

| Campo | Tipo | Constraint | Note |
|-------|------|-----------|------|
| id | UUID | PK, NOT NULL | generato automaticamente |
| email | VARCHAR(255) | UNIQUE, NOT NULL | |
| created_at | TIMESTAMP | DEFAULT NOW() | |

### Relazioni

- `[tabella].[campo_fk]` → `[tabella_ref].[campo_pk]` (ON DELETE CASCADE | SET NULL | RESTRICT)

### Indici

| Nome | Campi | Tipo | Motivazione |
|------|-------|------|-------------|
| idx_users_email | email | BTREE | lookup per autenticazione |

---

## Sezione per tipo ENV

### Variabili richieste

| Variabile | Tipo | Richiesta | Descrizione | Esempio |
|-----------|------|----------|-------------|---------|
| DATABASE_URL | string | sì | Connection string PostgreSQL | postgresql://user:pass@localhost:5432/db |
| JWT_SECRET | string | sì | Secret per firmare JWT, min 32 char | generato con `openssl rand -hex 32` |

---

## Sezione per tipo EVENT

### Evento: [nome:evento]

- **Emesso da**: [modulo/agente]
- **Consumato da**: [moduli/agenti]
- **Trigger**: [quando viene emesso]

**Payload:**
```json
{
  "event": "nome:evento",
  "data": {},
  "timestamp": "ISO8601"
}
```

---

## Sezione per tipo MODULE

### Export pubblici

```typescript
// o pseudocodice se non TypeScript
export function nomeFunction(param: tipo): tipo {}
export const COSTANTE = valore
export type NomeTipo = { ... }
```

### Dipendenze richieste

- [pacchetto@versione] — motivo

---

## Note per altri agenti

[Informazioni critiche che altri devono sapere prima di usare questa interfaccia]

## Changelog

| Versione | Data | Modifica |
|---------|------|---------|
| 1 | YYYY-MM-DD | Creazione iniziale |
