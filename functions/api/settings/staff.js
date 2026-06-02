// /api/settings/staff  — gestione barbieri.
//   GET   → lista staff (ordinata per sort_order)
//   PATCH → aggiorna uno staff {slug, ...campi}  (slug è la chiave stabile)
// MVP: niente create/delete staff (Fase B). Lo slug NON è modificabile.
// Auth: Bearer admin token. DB via service_role.
import { guard, json, preflight, clampInt, cleanText } from './_lib.js';

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

export async function onRequestGet({ request, env }) {
  const g = await guard(request, env);
  if (!g.ok) return g.response;
  const { db, corsHeaders } = g;
  try {
    const staff = await db.get('staff?select=*&order=sort_order.asc');
    return json({ staff: Array.isArray(staff) ? staff : [] }, 200, corsHeaders);
  } catch (err) {
    console.error('staff GET error:', err.message);
    return json({ error: 'Errore interno' }, 500, corsHeaders);
  }
}

export async function onRequestPatch({ request, env }) {
  const g = await guard(request, env);
  if (!g.ok) return g.response;
  const { db, corsHeaders } = g;

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Body non valido' }, 400, corsHeaders); }

  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  if (!SLUG_RE.test(slug)) return json({ error: 'slug non valido' }, 400, corsHeaders);

  const patch = {};
  if ('display_name' in body) {
    const v = cleanText(body.display_name, 80);
    if (!v) return json({ error: 'display_name non valido' }, 400, corsHeaders);
    patch.display_name = v;
  }
  if ('calendar_id' in body) {
    if (body.calendar_id === null || body.calendar_id === '') {
      patch.calendar_id = null;
    } else {
      const v = cleanText(body.calendar_id, 200);
      if (!v) return json({ error: 'calendar_id non valido' }, 400, corsHeaders);
      patch.calendar_id = v;
    }
  }
  if ('event_duration_min' in body) {
    const v = clampInt(body.event_duration_min, 1, 600);
    if (v == null) return json({ error: 'event_duration_min non valido' }, 400, corsHeaders);
    patch.event_duration_min = v;
  }
  if ('slot_pitch_min' in body) {
    const v = clampInt(body.slot_pitch_min, 1, 600);
    if (v == null) return json({ error: 'slot_pitch_min non valido' }, 400, corsHeaders);
    patch.slot_pitch_min = v;
  }
  if ('active' in body) {
    if (typeof body.active !== 'boolean') return json({ error: 'active non valido' }, 400, corsHeaders);
    patch.active = body.active;
  }
  if ('sort_order' in body) {
    const v = clampInt(body.sort_order, 0, 100000);
    if (v == null) return json({ error: 'sort_order non valido' }, 400, corsHeaders);
    patch.sort_order = v;
  }
  // photo_url / bio sono Fase B: non gestiti in MVP.

  if (Object.keys(patch).length === 0) {
    return json({ error: 'Nessun campo da aggiornare' }, 400, corsHeaders);
  }

  try {
    const rows = await db.patch('staff', `?slug=eq.${encodeURIComponent(slug)}`, patch);
    if (!Array.isArray(rows) || rows.length === 0) {
      return json({ error: 'Barbiere non trovato' }, 404, corsHeaders);
    }
    return json({ staff: rows[0] }, 200, corsHeaders);
  } catch (err) {
    console.error('staff PATCH error:', err.message);
    return json({ error: 'Errore interno' }, 500, corsHeaders);
  }
}

export function onRequestOptions({ request }) {
  return preflight(request, 'GET, PATCH');
}
