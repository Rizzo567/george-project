// ============================================================================
// Harness di test per le Cloudflare Pages Functions (nessuna dipendenza esterna)
// ============================================================================
// Le function girano in Workers runtime: fetch/crypto.subtle/Request/Response
// sono globali. Node 18+ le ha tutte, quindi possiamo importare i moduli veri e
// sostituire solo `globalThis.fetch` con un router di mock.
//
// Uso: node tests/run.mjs
// ============================================================================

import { generateKeyPairSync } from 'node:crypto';

// ── Mini test runner ────────────────────────────────────────────────
const tests = [];
export function test(name, fn) { tests.push({ name, fn }); }

export function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}
export function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'assertEq'}: atteso ${JSON.stringify(expected)}, ricevuto ${JSON.stringify(actual)}`);
  }
}

export async function run() {
  let pass = 0;
  const failures = [];
  for (const t of tests) {
    try {
      await t.fn();
      pass++;
      console.log(`  ok   ${t.name}`);
    } catch (e) {
      failures.push({ name: t.name, err: e });
      console.log(`  FAIL ${t.name}\n         ${e.message}`);
    }
  }
  console.log(`\n${pass}/${tests.length} test passati`);
  if (failures.length) process.exit(1);
}

// ── Chiave RSA vera: getAccessToken firma un JWT RS256 con crypto.subtle ──
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
export const TEST_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

// ── Env di test ─────────────────────────────────────────────────────
// NB: oggetto NUOVO per ogni test — loadShopConfig cachea per riferimento env
// in una WeakMap, riusare lo stesso env farebbe filtrare config fra i test.
export function makeEnv(overrides = {}) {
  return {
    SUPABASE_URL: 'https://ccmpysycifufktbrkiot.supabase.co',
    SUPABASE_ANON_KEY: 'anon-test',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
    BERLIN_SERVICE_ACCOUNT_EMAIL: 'sa@test.iam.gserviceaccount.com',
    BERLIN_PRIVATE_KEY: TEST_PEM,
    BERLIN_CALENDAR_ID: 'cal-berlin@group.calendar.google.com',
    ...overrides,
  };
}

// ── Router di fetch mockate ─────────────────────────────────────────
// opts:
//   slotRows        righe restituite dalla dedup su appointment_slots
//   insert          'ok' | 'slot_conflict' | 'pk_conflict' | 'error'
//   calendarBusy    finestre busy restituite da freeBusy
//   calendarCreate  'ok' | 'fail'
//   staff/services  override config negozio
export function installFetchMock(opts = {}) {
  const calls = [];
  const original = globalThis.fetch;

  const staff = opts.staff ?? [
    { slug: 'berlin', calendar_id: null, event_duration_min: 30, slot_pitch_min: 30, active: true },
  ];
  const services = opts.services ?? [
    { name: 'Cut', active: true, sort_order: 1 },
    { name: 'Fade', active: true, sort_order: 2 },
  ];

  globalThis.fetch = async (input, init = {}) => {
    const url    = typeof input === 'string' ? input : input.url;
    const method = (init.method || 'GET').toUpperCase();
    let body = null;
    if (init.body) { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    calls.push({ url, method, body });

    const jsonRes = (data, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

    // ── Config negozio ──
    if (url.includes('/rest/v1/shop_settings'))  return jsonRes([]);
    if (url.includes('/rest/v1/services'))       return jsonRes(services);
    if (url.includes('/rest/v1/staff'))          return jsonRes(staff);
    if (url.includes('/rest/v1/business_hours')) return jsonRes([]);
    if (url.includes('/rest/v1/closures'))       return jsonRes(opts.closures ?? []);

    // ── Dedup slot ──
    // slotRowsAfterInsert simula la corsa: lo slot risulta libero al controllo
    // iniziale e occupato alla rilettura dopo l'INSERT.
    if (url.includes('/rest/v1/appointment_slots')) {
      const inserted = calls.some(c => c.method === 'POST' && c.url.includes('/rest/v1/appointments'));
      if (inserted && opts.slotRowsAfterInsert) return jsonRes(opts.slotRowsAfterInsert);
      return jsonRes(opts.slotRows ?? []);
    }

    // ── Tabella appointments ──
    if (url.includes('/rest/v1/appointments')) {
      if (method === 'POST') {
        const mode = opts.insert ?? 'ok';
        if (mode === 'ok') return new Response(null, { status: 201 });
        if (mode === 'slot_conflict') {
          return jsonRes({
            code: '23505',
            message: 'duplicate key value violates unique constraint "uniq_appointments_active_slot"',
            details: 'Key (barber, date, "time")=(berlin, 2026-08-01, 13:30:00) already exists.',
          }, 409);
        }
        if (mode === 'pk_conflict') {
          return jsonRes({
            code: '23505',
            message: 'duplicate key value violates unique constraint "appointments_pkey"',
            details: 'Key (id)=(...) already exists.',
          }, 409);
        }
        return jsonRes({ message: 'boom' }, 500);
      }
      if (method === 'PATCH' || method === 'DELETE') return new Response(null, { status: 204 });
    }

    // ── Google ──
    if (url.includes('oauth2.googleapis.com/token')) return jsonRes({ access_token: 'tok-test' });
    if (url.includes('calendar/v3/freeBusy')) {
      return jsonRes({
        calendars: { 'cal-berlin@group.calendar.google.com': { busy: opts.calendarBusy ?? [] } },
      });
    }
    if (url.includes('calendar/v3/calendars')) {
      if ((opts.calendarCreate ?? 'ok') === 'fail') {
        return jsonRes({ error: { message: 'Not Found' } }, 404);
      }
      return jsonRes({ id: 'evt-test-123' });
    }
    if (url.includes('api.resend.com')) return jsonRes({ id: 'mail-1' });

    throw new Error('fetch non mockata: ' + method + ' ' + url);
  };

  return {
    calls,
    restore() { globalThis.fetch = original; },
    // helper di lettura
    inserts()  { return calls.filter(c => c.method === 'POST'   && c.url.includes('/rest/v1/appointments')); },
    deletes()  { return calls.filter(c => c.method === 'DELETE' && c.url.includes('/rest/v1/appointments')); },
    patches()  { return calls.filter(c => c.method === 'PATCH'  && c.url.includes('/rest/v1/appointments')); },
    calEvents(){ return calls.filter(c => c.method === 'POST'   && c.url.includes('calendar/v3/calendars')); },
  };
}

// Data valida per i test: domani (isValidDate accetta da ieri a +1 anno).
export function tomorrow() {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export function bookRequest(payload) {
  return new Request('https://misterbarber.it/api/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://misterbarber.it', 'CF-Connecting-IP': '203.0.113.' + Math.floor(Math.random() * 250) },
    body: JSON.stringify(payload),
  });
}

export function validPayload(extra = {}) {
  return {
    barber: 'berlin',
    nome: 'Mario Test',
    telefono: '+39 333 1234567',
    data: tomorrow(),
    ora: '13:30',
    servizio: 'Cut',
    notes: 'sfumatura bassa',
    ...extra,
  };
}
