// PATCH /api/settings/shop  — aggiorna la riga singleton shop_settings.
// Auth: Bearer admin token. DB via service_role (upsert su row_singleton).
import { guard, json, preflight, clampInt, cleanText } from './_lib.js';

const ALLOWED_TZ = /^[A-Za-z]+\/[A-Za-z_\-]+$/;

export async function onRequestPatch({ request, env }) {
  const g = await guard(request, env);
  if (!g.ok) return g.response;
  const { db, corsHeaders } = g;

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Body non valido' }, 400, corsHeaders); }

  const patch = {};

  if ('min_advance_minutes' in body) {
    const v = clampInt(body.min_advance_minutes, 0, 100000);
    if (v == null) return json({ error: 'min_advance_minutes non valido' }, 400, corsHeaders);
    patch.min_advance_minutes = v;
  }
  if ('max_future_days' in body) {
    const v = clampInt(body.max_future_days, 1, 3650);
    if (v == null) return json({ error: 'max_future_days non valido' }, 400, corsHeaders);
    patch.max_future_days = v;
  }
  if ('weekly_closed_days' in body) {
    if (!Array.isArray(body.weekly_closed_days)) {
      return json({ error: 'weekly_closed_days non valido' }, 400, corsHeaders);
    }
    const days = [];
    for (const d of body.weekly_closed_days) {
      const n = clampInt(d, 0, 6);
      if (n == null) return json({ error: 'weekly_closed_days non valido' }, 400, corsHeaders);
      if (!days.includes(n)) days.push(n);
    }
    patch.weekly_closed_days = days;
  }
  if ('require_email' in body) {
    if (typeof body.require_email !== 'boolean') return json({ error: 'require_email non valido' }, 400, corsHeaders);
    patch.require_email = body.require_email;
  }
  if ('auto_confirm' in body) {
    if (typeof body.auto_confirm !== 'boolean') return json({ error: 'auto_confirm non valido' }, 400, corsHeaders);
    patch.auto_confirm = body.auto_confirm;
  }
  if ('timezone' in body) {
    const tz = cleanText(body.timezone, 64);
    if (!tz || !ALLOWED_TZ.test(tz)) return json({ error: 'timezone non valido' }, 400, corsHeaders);
    patch.timezone = tz;
  }

  if (Object.keys(patch).length === 0) {
    return json({ error: 'Nessun campo da aggiornare' }, 400, corsHeaders);
  }

  try {
    // shop_settings è singleton: aggiorna la riga esistente. Se non esiste,
    // la crea via upsert sulla colonna sentinel row_singleton.
    const existing = await db.get('shop_settings?select=id&limit=1');
    let rows;
    if (Array.isArray(existing) && existing[0]) {
      rows = await db.patch('shop_settings', `?id=eq.${encodeURIComponent(existing[0].id)}`, patch);
    } else {
      rows = await db.upsert('shop_settings', { ...patch, row_singleton: true }, 'row_singleton');
    }
    return json({ shop_settings: (Array.isArray(rows) && rows[0]) || null }, 200, corsHeaders);
  } catch (err) {
    console.error('settings/shop error:', err.message);
    return json({ error: 'Errore interno' }, 500, corsHeaders);
  }
}

export function onRequestOptions({ request }) {
  return preflight(request, 'PATCH');
}
