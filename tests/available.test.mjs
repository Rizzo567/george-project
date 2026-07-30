// ============================================================================
// VERIFIER disponibilità — /api/available
// ============================================================================
// Con Google Calendar configurato, l'API guardava SOLO il freeBusy di Google:
// una prenotazione a DB senza evento Calendar (creazione evento fallita) lasciava
// lo slot mostrato come libero. Ora le due fonti si sommano.
// ============================================================================

import { onRequestGet } from '../functions/api/available.js';
import { test, assert, assertEq, makeEnv, installFetchMock } from './_harness.mjs';

// Prima data futura che non sia domenica (chiusura settimanale di default).
function nextOpenDate() {
  for (let i = 1; i <= 8; i++) {
    const d = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
    if (d.getUTCDay() !== 0) return d.toISOString().slice(0, 10);
  }
  throw new Error('nessuna data utile');
}

async function slotsFor(mockOpts = {}) {
  const date = nextOpenDate();
  const mock = installFetchMock(mockOpts);
  const env  = makeEnv(mockOpts.env);
  try {
    const req = new Request(`https://misterbarber.it/api/available?barber=berlin&date=${date}`, {
      headers: { Origin: 'https://misterbarber.it' },
    });
    const res  = await onRequestGet({ request: req, env });
    const body = await res.json();
    return { date, res, body };
  } finally {
    mock.restore();
  }
}

test('nessuna prenotazione → 13:30 libero (controllo)', async () => {
  const { body } = await slotsFor();
  const s = (body.slots || []).find(x => x.time === '13:30');
  assert(s, 'slot 13:30 presente');
  assertEq(s.available, true, 'disponibile');
});

test('prenotazione a DB senza evento Calendar → 13:30 NON libero', async () => {
  const { body } = await slotsFor({ slotRows: [{ time: '13:30:00' }] });
  const s = (body.slots || []).find(x => x.time === '13:30');
  assert(s, 'slot 13:30 presente');
  assertEq(s.available, false, 'occupato dalla riga Supabase');
});

test('blocco manuale solo su Google Calendar → slot NON libero', async () => {
  const date = nextOpenDate();
  const { body } = await slotsFor({
    calendarBusy: [{ start: `${date}T13:00:00+02:00`, end: `${date}T14:00:00+02:00` }],
  });
  const s = (body.slots || []).find(x => x.time === '13:30');
  assert(s, 'slot 13:30 presente');
  assertEq(s.available, false, 'occupato dal calendario');
});

test('le due fonti si sommano, non si sostituiscono', async () => {
  const date = nextOpenDate();
  const { body } = await slotsFor({
    slotRows: [{ time: '10:00:00' }],
    calendarBusy: [{ start: `${date}T15:00:00+02:00`, end: `${date}T15:30:00+02:00` }],
  });
  const at = t => (body.slots || []).find(x => x.time === t);
  assertEq(at('10:00').available, false, '10:00 occupato da DB');
  assertEq(at('15:00').available, false, '15:00 occupato da Calendar');
  assertEq(at('11:00').available, true,  '11:00 resta libero');
});
