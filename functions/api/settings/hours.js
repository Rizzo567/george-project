// PUT /api/settings/hours  — upsert degli orari di lavoro (business_hours).
// Body: { staff_slug, weekday (0..6), ranges:[{start:"HH:MM",end:"HH:MM"}] }
//   oppure batch: { entries:[ {staff_slug,weekday,ranges}, ... ] }
// Upsert su (staff_slug, weekday). ranges=[] = giorno senza orari (chiuso).
// Auth: Bearer admin token. DB via service_role.
import { guard, json, preflight, clampInt, validateRanges } from './_lib.js';

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

function normalizeEntry(e) {
  if (!e || typeof e !== 'object') return { error: 'entry non valida' };
  const slug = typeof e.staff_slug === 'string' ? e.staff_slug.trim() : '';
  if (!SLUG_RE.test(slug)) return { error: 'staff_slug non valido' };
  const weekday = clampInt(e.weekday, 0, 6);
  if (weekday == null) return { error: 'weekday non valido' };
  const ranges = validateRanges(e.ranges);
  if (ranges == null) return { error: 'ranges non valido (formato HH:MM, end>start)' };
  return { staff_slug: slug, weekday, ranges };
}

export async function onRequestPut({ request, env }) {
  const g = await guard(request, env);
  if (!g.ok) return g.response;
  const { db, corsHeaders } = g;

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Body non valido' }, 400, corsHeaders); }

  const rawEntries = Array.isArray(body.entries) ? body.entries : [body];
  if (rawEntries.length === 0 || rawEntries.length > 100) {
    return json({ error: 'Numero entries non valido' }, 400, corsHeaders);
  }

  const payload = [];
  for (const e of rawEntries) {
    const n = normalizeEntry(e);
    if (n.error) return json({ error: n.error }, 400, corsHeaders);
    payload.push(n);
  }

  try {
    const rows = await db.upsert('business_hours', payload, 'staff_slug,weekday');
    return json({ business_hours: Array.isArray(rows) ? rows : [] }, 200, corsHeaders);
  } catch (err) {
    console.error('hours PUT error:', err.message);
    // FK violation su staff_slug inesistente
    if (/409|foreign key|violates/i.test(err.message)) {
      return json({ error: 'staff_slug inesistente' }, 409, corsHeaders);
    }
    return json({ error: 'Errore interno' }, 500, corsHeaders);
  }
}

export function onRequestOptions({ request }) {
  return preflight(request, 'PUT');
}
