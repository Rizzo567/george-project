// Shared helpers per le Functions /api/settings/* e /api/preferences.
//
// SICUREZZA — modello di accesso:
//   1. Ogni endpoint richiede header `Authorization: Bearer <supabase access_token>`.
//   2. Validiamo il token chiamando Supabase GET /auth/v1/user con
//      apikey: ANON + Authorization: Bearer <token>. Se non è un utente valido → 401.
//   3. SOLO dopo, eseguiamo le operazioni DB con service_role (bypassa RLS).
//      La service_role key NON è MAI esposta al client.
//   4. CORS lockdown + header sicurezza identici a book.js.

import { SUPABASE_URL_PUBLIC, SUPABASE_ANON_PUBLIC } from '../_google.js';

const ALLOWED_ORIGINS = [
  'https://misterbarber.it',
  'https://www.misterbarber.it',
  'https://mister-barber.pages.dev',
  'https://george-website.pages.dev',
];

export function buildCorsHeaders(request) {
  const origin = request?.headers?.get?.('Origin') || '';
  const allow  = ALLOWED_ORIGINS.includes(origin)
    || /^https:\/\/[a-z0-9-]+\.pages\.dev$/.test(origin)
    || origin === ''
      ? origin || ALLOWED_ORIGINS[0]
      : ALLOWED_ORIGINS[0];
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cache-Control': 'no-store',
  };
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers });
}

// Risposta OPTIONS (preflight) standard per gli endpoint settings.
export function preflight(request, methods) {
  const corsHeaders = buildCorsHeaders(request);
  return new Response(null, {
    headers: {
      ...corsHeaders,
      'Access-Control-Allow-Methods': `${methods}, OPTIONS`,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

// Estrae il bearer token dall'header Authorization.
function extractBearer(request) {
  const h = request.headers.get('Authorization') || request.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

// Valida il token Supabase. Ritorna l'oggetto user ({ id, email, ... }) se valido,
// altrimenti null. Usa l'ANON key pubblica come apikey (richiesta da GoTrue) +
// il token utente come Bearer.
export async function authenticate(request) {
  const token = extractBearer(request);
  if (!token) return null;
  try {
    const r = await fetch(`${SUPABASE_URL_PUBLIC}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_ANON_PUBLIC,
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    if (!r.ok) return null;
    const user = await r.json();
    if (!user || typeof user.id !== 'string') return null;
    return user;
  } catch {
    return null;
  }
}

// Client REST con service_role (bypassa RLS). La chiave è SEGRETA: solo server-side,
// sanificata da whitespace (paste corrotti in dashboard CF).
export function serviceClient(env) {
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/\s/g, '');
  const url = SUPABASE_URL_PUBLIC;
  if (!key) return null;

  function headers(extra = {}) {
    return {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      ...extra,
    };
  }

  return {
    // GET su /rest/v1/<path><query>
    async get(path) {
      const r = await fetch(`${url}/rest/v1/${path}`, { headers: headers() });
      if (!r.ok) throw new Error(`supabase GET ${path} → ${r.status}`);
      return r.json();
    },
    // INSERT (POST). Ritorna le righe create (return=representation).
    async insert(table, payload) {
      const r = await fetch(`${url}/rest/v1/${table}`, {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`supabase INSERT ${table} → ${r.status}: ${await r.text()}`);
      return r.json();
    },
    // UPSERT (POST con resolution=merge-duplicates su una colonna unique).
    async upsert(table, payload, onConflict) {
      const oc = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : '';
      const r = await fetch(`${url}/rest/v1/${table}${oc}`, {
        method: 'POST',
        headers: headers({
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=representation',
        }),
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`supabase UPSERT ${table} → ${r.status}: ${await r.text()}`);
      return r.json();
    },
    // PATCH con filtro (query string incl. ?). Ritorna le righe aggiornate.
    async patch(table, query, payload) {
      const r = await fetch(`${url}/rest/v1/${table}${query}`, {
        method: 'PATCH',
        headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`supabase PATCH ${table} → ${r.status}: ${await r.text()}`);
      return r.json();
    },
    // DELETE con filtro (query string incl. ?).
    async del(table, query) {
      const r = await fetch(`${url}/rest/v1/${table}${query}`, {
        method: 'DELETE',
        headers: headers({ Prefer: 'return=minimal' }),
      });
      if (!r.ok) throw new Error(`supabase DELETE ${table} → ${r.status}: ${await r.text()}`);
      return true;
    },
  };
}

// Guardia comune: valida auth + prepara client service_role.
// Ritorna { ok, user, db, corsHeaders } oppure { ok:false, response }.
export async function guard(request, env) {
  const corsHeaders = buildCorsHeaders(request);
  const user = await authenticate(request);
  if (!user) {
    return { ok: false, response: json({ error: 'Non autorizzato' }, 401, corsHeaders) };
  }
  const db = serviceClient(env);
  if (!db) {
    return { ok: false, response: json({ error: 'Servizio non configurato' }, 503, corsHeaders) };
  }
  return { ok: true, user, db, corsHeaders };
}

// ── Validazione input ────────────────────────────────────────────
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isHHMM(s) { return typeof s === 'string' && HHMM_RE.test(s); }

export function clampInt(v, min, max) {
  const n = Number(v);
  if (!Number.isInteger(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

export function cleanText(s, max) {
  if (typeof s !== 'string') return null;
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim().slice(0, max);
}

// Valida un array ranges [{start,end}] in formato HH:MM con end>start.
export function validateRanges(ranges) {
  if (!Array.isArray(ranges)) return null;
  const out = [];
  for (const r of ranges) {
    if (!r || !isHHMM(r.start) || !isHHMM(r.end)) return null;
    const [sh, sm] = r.start.split(':').map(Number);
    const [eh, em] = r.end.split(':').map(Number);
    if (eh * 60 + em <= sh * 60 + sm) return null;
    out.push({ start: r.start, end: r.end });
  }
  return out;
}
