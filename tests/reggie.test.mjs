// ============================================================================
// VERIFIER secondo barbiere — Reggie (calendar-less, migrazione 010)
// ============================================================================
// Reggie non ha Google Calendar: disponibilità e prenotazioni devono passare
// SOLO da Supabase (stessa pipeline/dedup di Berlin), senza mai toccare Google.
// ============================================================================

import { onRequestPost as book } from '../functions/api/book.js';
import { onRequestGet as available } from '../functions/api/available.js';
import { onRequestPost as cancelCalendar } from '../functions/api/cancel-calendar.js';
import { getBarberStartDate } from '../functions/api/_google.js';
import { test, assert, assertEq, makeEnv, installFetchMock, bookRequest, validPayload } from './_harness.mjs';

const STAFF_BOTH = [
  { slug: 'berlin', calendar_id: null, event_duration_min: 30, slot_pitch_min: 30, active: true },
  { slug: 'reggie', calendar_id: null, event_duration_min: 30, slot_pitch_min: 30, active: true },
];
const STAFF_BERLIN_ONLY = [STAFF_BOTH[0]];

const googleCalls = mock => mock.calls.filter(c => /googleapis\.com/.test(c.url));

// Prima data utile per Reggie: non domenica e non prima della sua data di inizio
// (BARBER_START_DATE in _google.js), altrimenti scatterebbe quel blocco invece
// del comportamento calendar-less che questi test verificano.
function nextOpenDate() {
  const start = getBarberStartDate('reggie');
  for (let i = 1; i <= 21; i++) {
    const d = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
    const iso = d.toISOString().slice(0, 10);
    if (d.getUTCDay() === 0) continue;
    if (start && iso < start) continue;
    return iso;
  }
  throw new Error('nessuna data utile');
}

// validPayload usa domani: per Reggie serve una data dal suo inizio in poi.
function reggiePayload(extra = {}) {
  return validPayload({ barber: 'reggie', data: nextOpenDate(), ...extra });
}

async function avail(barber, mockOpts = {}) {
  const date = nextOpenDate();
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

// ── available ───────────────────────────────────────────────────────
test('reggie available: slot da Supabase, nessuna chiamata Google', async () => {
  const { res, body, mock } = await avail('reggie', { staff: STAFF_BOTH, slotRows: [{ time: '10:00:00' }] });
  assertEq(res.status, 200, 'status');
  const at = t => (body.slots || []).find(x => x.time === t);
  assert(at('13:30'), 'slot 13:30 presente');
  assertEq(at('13:30').available, true, '13:30 libero');
  assertEq(at('10:00').available, false, '10:00 occupato da prenotazione Reggie');
  assertEq(googleCalls(mock).length, 0, 'zero chiamate Google');
  assert(mock.calls.some(c => c.url.includes('appointment_slots') && c.url.includes('barber=eq.reggie')), 'query slot filtrata su reggie');
});

test('reggie available: staff senza reggie (migrazione non applicata) → 400', async () => {
  const { res } = await avail('reggie', { staff: STAFF_BERLIN_ONLY });
  assertEq(res.status, 400, 'status');
});

test('berlin available invariato con reggie attivo (usa ancora Calendar)', async () => {
  const { res, mock } = await avail('berlin', { staff: STAFF_BOTH });
  assertEq(res.status, 200, 'status');
  assert(mock.calls.some(c => c.url.includes('calendar/v3/freeBusy')), 'freeBusy chiamato per berlin');
});

// ── book ────────────────────────────────────────────────────────────
test('reggie book: 200, riga barber=reggie, nessun evento Calendar', async () => {
  const { res, body, mock } = await doBook(reggiePayload(), { staff: STAFF_BOTH });
  assertEq(res.status, 200, 'status');
  assertEq(body.ok, true, 'ok');
  const ins = mock.inserts();
  assertEq(ins.length, 1, 'una INSERT');
  assertEq(ins[0].body.barber, 'reggie', 'barbiere riga');
  assertEq(ins[0].body.status, 'confirmed', 'status');
  assertEq(googleCalls(mock).length, 0, 'zero chiamate Google');
  assertEq(mock.deletes().length, 0, 'nessun rollback');
});

test('reggie book: slot già preso → 409 senza INSERT (dedup)', async () => {
  const { res, mock } = await doBook(reggiePayload(), { staff: STAFF_BOTH, slotRows: [{ id: 'x' }] });
  assertEq(res.status, 409, 'status');
  assertEq(mock.inserts().length, 0, 'nessuna INSERT');
});

test('reggie book: indice unique scatta → 409', async () => {
  const { res } = await doBook(reggiePayload(), { staff: STAFF_BOTH, insert: 'slot_conflict' });
  assertEq(res.status, 409, 'status');
});

test('reggie book: chiusura scope reggie → 409 senza INSERT', async () => {
  const p = reggiePayload();
  const { res, mock } = await doBook(p, { staff: STAFF_BOTH, closures: [{ scope: 'reggie', mode: 'full' }] });
  assertEq(res.status, 409, 'status');
  assertEq(mock.inserts().length, 0, 'nessuna INSERT');
});

test('reggie book: staff senza reggie → 400 senza INSERT', async () => {
  const { res, mock } = await doBook(reggiePayload(), { staff: STAFF_BERLIN_ONLY });
  assertEq(res.status, 400, 'status');
  assertEq(mock.inserts().length, 0, 'nessuna INSERT');
});

// ── cancel-calendar ─────────────────────────────────────────────────
test('cancel-calendar reggie: no-op ok senza Google', async () => {
  const mock = installFetchMock({ staff: STAFF_BOTH });
  try {
    const req = new Request('https://misterbarber.it/api/cancel-calendar', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://misterbarber.it' },
      body: JSON.stringify({ barber: 'reggie', eventId: 'evt-x' }),
    });
    const res = await cancelCalendar({ request: req, env: makeEnv() });
    const body = await res.json();
    assertEq(res.status, 200, 'status');
    assertEq(body.ok, true, 'ok');
    assertEq(googleCalls(mock).length, 0, 'zero chiamate Google');
  } finally { mock.restore(); }
});

test('cancel-calendar slug sconosciuto → 400', async () => {
  const mock = installFetchMock({ staff: STAFF_BOTH });
  try {
    const req = new Request('https://misterbarber.it/api/cancel-calendar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barber: 'pippo', eventId: 'evt-x' }),
    });
    const res = await cancelCalendar({ request: req, env: makeEnv() });
    assertEq(res.status, 400, 'status');
  } finally { mock.restore(); }
});
