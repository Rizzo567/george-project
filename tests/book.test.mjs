// ============================================================================
// VERIFIER anti doppia prenotazione — /api/book
// ============================================================================
// Ogni test è un modo in cui il 30/07/2026 due clienti si sono ritrovati alle
// 13:30. Il criterio è sempre lo stesso: quando il server dice NO, a DB non
// deve restare NULLA; quando dice sì, la riga esiste e ha il suo evento Calendar.
// ============================================================================

import { onRequestPost } from '../functions/api/book.js';
import { test, assert, assertEq, makeEnv, installFetchMock, bookRequest, validPayload } from './_harness.mjs';

async function call(payload, mockOpts = {}) {
  const mock = installFetchMock(mockOpts);
  const env  = makeEnv(mockOpts.env);
  try {
    const res  = await onRequestPost({ request: bookRequest(payload), env });
    const body = await res.json();
    return { res, body, mock };
  } finally {
    mock.restore();
  }
}

// ── 1. Percorso felice ──────────────────────────────────────────────
test('slot libero → 200, riga inserita server-side + evento Calendar', async () => {
  const { res, body, mock } = await call(validPayload());
  assertEq(res.status, 200, 'status');
  assertEq(body.ok, true, 'body.ok');
  assert(body.apptId, 'apptId restituito al client');
  assertEq(body.eventId, 'evt-test-123', 'eventId');

  const ins = mock.inserts();
  assertEq(ins.length, 1, 'una sola INSERT');
  assertEq(ins[0].body.status, 'confirmed', 'status riga');
  assertEq(ins[0].body.time, '13:30', 'ora riga');
  assertEq(ins[0].body.barber, 'berlin', 'barbiere riga');
  // Regressione: il client manda `notes`, il server leggeva solo `note` →
  // le note del cliente sparivano.
  assertEq(ins[0].body.notes, 'sfumatura bassa', 'note salvate');
  assertEq(mock.calEvents().length, 1, 'un evento Calendar');
  assertEq(mock.patches().length, 1, 'calendar_event_id persistito');
  assertEq(mock.deletes().length, 0, 'nessun rollback');
});

// ── 2. LA REGRESSIONE DELL'INCIDENTE ────────────────────────────────
test('slot già prenotato a DB → 409 e NESSUNA riga scritta', async () => {
  const { res, body, mock } = await call(validPayload(), {
    slotRows: [{ id: '11111111-1111-4111-8111-111111111111' }],
  });
  assertEq(res.status, 409, 'status');
  assert(/già prenotato/i.test(body.error), 'messaggio slot occupato');
  // Il punto di tutto il fix: prima qui la riga esisteva GIÀ (inserita dal
  // client) e restava a DB come "confirmed" → doppia prenotazione visibile nel
  // gestionale. Ora non deve esistere alcuna INSERT.
  assertEq(mock.inserts().length, 0, 'nessuna INSERT');
  assertEq(mock.calEvents().length, 0, 'nessun evento Calendar');
});

// ── 3. Corsa persa sul filo: l'indice unique fa da giudice ──────────
test('dedup passa ma indice unique scatta → 409 senza evento Calendar', async () => {
  const { res, body, mock } = await call(validPayload(), { insert: 'slot_conflict' });
  assertEq(res.status, 409, 'status');
  assert(/già prenotato/i.test(body.error), 'messaggio slot occupato');
  assertEq(mock.calEvents().length, 0, 'nessun evento Calendar');
  assertEq(mock.deletes().length, 0, 'niente da cancellare');
});

// ── 4. Retry / client vecchio in cache: idempotenza sulla PK ────────
test('conflitto su appointments_pkey (stesso apptId) → 200, non è un doppione', async () => {
  const apptId = '22222222-2222-4222-8222-222222222222';
  const { res, body, mock } = await call(validPayload({ apptId }), { insert: 'pk_conflict' });
  assertEq(res.status, 200, 'status');
  assertEq(body.apptId, apptId, 'riusa l\'id del client');
  assertEq(mock.calEvents().length, 1, 'evento Calendar creato');
  assertEq(mock.deletes().length, 0, 'nessun rollback su riga non nostra');
});

// ── 5. Rollback: senza evento Calendar lo slot non resta occupato ───
test('creazione evento Calendar fallita → 502 e riga cancellata', async () => {
  const { res, body, mock } = await call(validPayload(), { calendarCreate: 'fail' });
  assertEq(res.status, 502, 'status');
  assert(/non confermata/i.test(body.error), 'messaggio esplicito');
  assertEq(mock.inserts().length, 1, 'la riga era stata inserita');
  assertEq(mock.deletes().length, 1, 'rollback eseguito');
});

test('evento Calendar fallito su riga NON nostra (pk_conflict) → 502 senza cancellare', async () => {
  const { res, mock } = await call(
    validPayload({ apptId: '33333333-3333-4333-8333-333333333333' }),
    { insert: 'pk_conflict', calendarCreate: 'fail' },
  );
  assertEq(res.status, 502, 'status');
  assertEq(mock.deletes().length, 0, 'non cancella righe scritte da altri');
});

// ── 6. Blocchi manuali del barbiere su Google Calendar ──────────────
test('freeBusy occupato → 409 e nessuna riga scritta', async () => {
  const p = validPayload();
  const { res, mock } = await call(p, {
    calendarBusy: [{
      start: `${p.data}T13:00:00+02:00`,
      end:   `${p.data}T14:00:00+02:00`,
    }],
  });
  assertEq(res.status, 409, 'status');
  assertEq(mock.inserts().length, 0, 'nessuna INSERT');
});

// ── 7. Mai un "ok" senza riga a DB ──────────────────────────────────
test('service_role mancante → 500, non 200', async () => {
  const { res, body } = await call(validPayload(), {
    env: { SUPABASE_SERVICE_ROLE_KEY: '' },
  });
  assertEq(res.status, 500, 'status');
  assert(!body.ok, 'nessun ok');
});

test('errore DB sull\'insert → 500, nessun evento Calendar', async () => {
  const { res, mock } = await call(validPayload(), { insert: 'error' });
  assertEq(res.status, 500, 'status');
  assertEq(mock.calEvents().length, 0, 'nessun evento Calendar');
});

// ── 8. Validazione input (non regredita dal refactor) ───────────────
test('telefono non valido → 400 senza toccare il DB', async () => {
  const { res, mock } = await call(validPayload({ telefono: 'abc' }));
  assertEq(res.status, 400, 'status');
  assertEq(mock.inserts().length, 0, 'nessuna INSERT');
});

test('ora non valida → 400', async () => {
  const { res } = await call(validPayload({ ora: '25:99' }));
  assertEq(res.status, 400, 'status');
});

test('giorno chiuso (chiusura full) → 409 senza INSERT', async () => {
  const p = validPayload();
  const { res, mock } = await call(p, {
    closures: [{ scope: 'berlin', start_date: p.data, end_date: p.data, mode: 'full' }],
  });
  assertEq(res.status, 409, 'status');
  assertEq(mock.inserts().length, 0, 'nessuna INSERT');
});
