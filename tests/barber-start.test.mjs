// ============================================================================
// VERIFIER data di inizio per barbiere — BARBER_START_DATE (_google.js)
// ============================================================================
// Un barbiere che non ha ancora iniziato non deve essere prenotabile:
//   • /api/available non restituisce slot nei giorni precedenti all'inizio
//   • /api/book rifiuta (409) con messaggio in italiano, anche su chiamata
//     diretta senza passare dall'interfaccia
// Gli altri barbieri (Berlin) non devono cambiare di una virgola.
//
// La data di inizio è un DATO, non un `if` sepolto: sta in BARBER_START_DATE
// in functions/api/_google.js. Questi test la leggono da lì, così restano validi
// anche se la data cambia.
// ============================================================================

import { onRequestPost as book } from '../functions/api/book.js';
import { onRequestGet as available } from '../functions/api/available.js';
import {
  BARBER_START_DATE, getBarberStartDate, isBeforeBarberStart, barberStartMessage,
} from '../functions/api/_google.js';
import { test, assert, assertEq, makeEnv, installFetchMock, bookRequest, validPayload } from './_harness.mjs';

const STAFF_BOTH = [
  { slug: 'berlin', calendar_id: null, event_duration_min: 30, slot_pitch_min: 30, active: true },
  { slug: 'reggie', calendar_id: null, event_duration_min: 30, slot_pitch_min: 30, active: true },
];

// Date sotto esame, derivate dalla config: il giorno prima dell'inizio (lunedì
// 21/09/2026 con l'inizio attuale) e il giorno di inizio (martedì 22/09/2026).
const START      = getBarberStartDate('reggie');           // '2026-09-22'
const DAY_BEFORE = shiftDays(START, -1);                   // '2026-09-21'

function shiftDays(iso, delta) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// /api/available e /api/book accettano solo date non troppo lontane nel passato.
// Quando la data di inizio sarà superata da un pezzo, le asserzioni HTTP su quelle
// date non sono più esprimibili: restano i test puri sull'helper.
function stillTestable(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  return d.getTime() > Date.now() - 24 * 60 * 60 * 1000;
}

async function avail(barber, date, mockOpts = {}) {
  const mock = installFetchMock(mockOpts);
  try {
    const req = new Request(`https://misterbarber.it/api/available?barber=${barber}&date=${date}`, {
      headers: { Origin: 'https://misterbarber.it' },
    });
    const res = await available({ request: req, env: makeEnv() });
    return { res, body: await res.json(), mock };
  } finally { mock.restore(); }
}

async function doBook(payload, mockOpts = {}) {
  const mock = installFetchMock(mockOpts);
  try {
    const res = await book({ request: bookRequest(payload), env: makeEnv() });
    return { res, body: await res.json(), mock };
  } finally { mock.restore(); }
}

// ── config e helper puri (nessuna dipendenza dall'orologio) ──────────
test('config: reggie ha una data di inizio, berlin no', () => {
  assertEq(BARBER_START_DATE.reggie, '2026-09-22', 'inizio reggie');
  assertEq(getBarberStartDate('berlin'), null, 'berlin senza data di inizio');
  assertEq(getBarberStartDate('pippo'), null, 'slug sconosciuto');
});

test('isBeforeBarberStart: blocca solo i giorni prima dell\'inizio', () => {
  assertEq(isBeforeBarberStart('reggie', '2026-09-20'), true,  'domenica 20/09 bloccata');
  assertEq(isBeforeBarberStart('reggie', '2026-09-21'), true,  'lunedì 21/09 bloccato');
  assertEq(isBeforeBarberStart('reggie', '2026-09-22'), false, 'martedì 22/09 aperto');
  assertEq(isBeforeBarberStart('reggie', '2026-10-05'), false, 'date successive aperte');
  assertEq(isBeforeBarberStart('berlin', '2026-09-21'), false, 'berlin mai bloccato');
});

test('barberStartMessage: italiano, con la data in chiaro', () => {
  const msg = barberStartMessage('reggie');
  assert(/Reggie/.test(msg), 'nome del barbiere nel messaggio: ' + msg);
  assert(/22\/09\/2026/.test(msg), 'data di inizio nel messaggio: ' + msg);
  assertEq(barberStartMessage('berlin'), '', 'nessun messaggio per berlin');
});

// ── /api/available ──────────────────────────────────────────────────
test('available reggie il giorno prima dell\'inizio (21/09) → zero slot', async () => {
  if (!stillTestable(DAY_BEFORE)) { console.log(`       (salto: ${DAY_BEFORE} è nel passato)`); return; }
  const { res, body } = await avail('reggie', DAY_BEFORE, { staff: STAFF_BOTH });
  assertEq(res.status, 200, 'status');
  assertEq((body.slots || []).length, 0, 'nessuno slot');
  assertEq(body.closed, true, 'giorno segnato come chiuso');
  assert(/22\/09\/2026/.test(body.reason || ''), 'motivo con la data di inizio: ' + body.reason);
});

test('available reggie il giorno di inizio (22/09) → slot regolari', async () => {
  if (!stillTestable(START)) { console.log(`       (salto: ${START} è nel passato)`); return; }
  const { res, body } = await avail('reggie', START, { staff: STAFF_BOTH });
  assertEq(res.status, 200, 'status');
  assert(!body.closed, 'giorno aperto');
  assert((body.slots || []).some(s => s.available), 'almeno uno slot libero');
  assert((body.slots || []).some(s => s.time === '09:00'), 'griglia parte da 09:00');
  assert((body.slots || []).some(s => s.time === '18:30'), 'griglia arriva a 18:30');
});

test('available berlin il 21/09 → invariato (griglia piena, freeBusy chiamato)', async () => {
  if (!stillTestable(DAY_BEFORE)) { console.log(`       (salto: ${DAY_BEFORE} è nel passato)`); return; }
  const { res, body, mock } = await avail('berlin', DAY_BEFORE, { staff: STAFF_BOTH });
  assertEq(res.status, 200, 'status');
  assert(!body.closed, 'giorno aperto per berlin');
  // Griglia storica: 09:00–12:00 e 13:00–19:00 con pitch 30 = 18 slot, tutti liberi.
  assertEq(body.slots.length, 18, 'numero di slot');
  assertEq(body.slots.map(s => s.time).join(','),
    '09:00,09:30,10:00,10:30,11:00,11:30,13:00,13:30,14:00,14:30,15:00,15:30,16:00,16:30,17:00,17:30,18:00,18:30',
    'orari identici a prima');
  assertEq(body.slots.every(s => s.available), true, 'tutti liberi');
  assert(mock.calls.some(c => c.url.includes('calendar/v3/freeBusy')), 'freeBusy chiamato per berlin');
});

// ── /api/book ───────────────────────────────────────────────────────
test('book reggie il 21/09 → 409 in italiano, nessuna INSERT', async () => {
  if (!stillTestable(DAY_BEFORE)) { console.log(`       (salto: ${DAY_BEFORE} è nel passato)`); return; }
  const { res, body, mock } = await doBook(
    validPayload({ barber: 'reggie', data: DAY_BEFORE, ora: '10:00' }),
    { staff: STAFF_BOTH },
  );
  assertEq(res.status, 409, 'status');
  assert(/Reggie/.test(body.error || ''), 'messaggio con il nome: ' + body.error);
  assert(/22\/09\/2026/.test(body.error || ''), 'messaggio con la data: ' + body.error);
  assertEq(mock.inserts().length, 0, 'nessuna INSERT');
});

test('book reggie il 22/09 → prenotazione accettata', async () => {
  if (!stillTestable(START)) { console.log(`       (salto: ${START} è nel passato)`); return; }
  const { res, body, mock } = await doBook(
    validPayload({ barber: 'reggie', data: START, ora: '10:00' }),
    { staff: STAFF_BOTH },
  );
  assertEq(res.status, 200, 'status');
  assertEq(body.ok, true, 'ok');
  assertEq(mock.inserts().length, 1, 'una INSERT');
  assertEq(mock.inserts()[0].body.barber, 'reggie', 'barbiere riga');
});

test('book berlin il 21/09 → invariato (accettata)', async () => {
  if (!stillTestable(DAY_BEFORE)) { console.log(`       (salto: ${DAY_BEFORE} è nel passato)`); return; }
  const { res, body, mock } = await doBook(
    validPayload({ barber: 'berlin', data: DAY_BEFORE, ora: '10:00' }),
    { staff: STAFF_BOTH },
  );
  assertEq(res.status, 200, 'status');
  assertEq(body.ok, true, 'ok');
  assertEq(mock.inserts().length, 1, 'una INSERT per berlin');
});
