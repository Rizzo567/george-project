// /api/settings/services  — CRUD catalogo servizi (NESSUN prezzo, decisione §0.4).
//   GET    → lista servizi (ordinati per sort_order)
//   POST   → crea servizio {name, duration_min?, active?, sort_order?}
//   PATCH  → aggiorna servizio {id, ...campi}
//   DELETE → elimina servizio (?id=<uuid>)
// Auth: Bearer admin token. DB via service_role.
import { guard, json, preflight, clampInt, cleanText } from './_lib.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function onRequestGet({ request, env }) {
  const g = await guard(request, env);
  if (!g.ok) return g.response;
  const { db, corsHeaders } = g;
  try {
    const services = await db.get('services?select=*&order=sort_order.asc');
    return json({ services: Array.isArray(services) ? services : [] }, 200, corsHeaders);
  } catch (err) {
    console.error('services GET error:', err.message);
    return json({ error: 'Errore interno' }, 500, corsHeaders);
  }
}

export async function onRequestPost({ request, env }) {
  const g = await guard(request, env);
  if (!g.ok) return g.response;
  const { db, corsHeaders } = g;

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Body non valido' }, 400, corsHeaders); }

  const name = cleanText(body.name, 60);
  if (!name) return json({ error: 'name obbligatorio' }, 400, corsHeaders);

  const payload = { name, active: true, sort_order: 0 };

  if (body.duration_min != null) {
    const v = clampInt(body.duration_min, 1, 600);
    if (v == null) return json({ error: 'duration_min non valido' }, 400, corsHeaders);
    payload.duration_min = v;
  }
  if ('active' in body) {
    if (typeof body.active !== 'boolean') return json({ error: 'active non valido' }, 400, corsHeaders);
    payload.active = body.active;
  }
  if ('sort_order' in body) {
    const v = clampInt(body.sort_order, 0, 100000);
    if (v == null) return json({ error: 'sort_order non valido' }, 400, corsHeaders);
    payload.sort_order = v;
  }

  try {
    const rows = await db.insert('services', payload);
    return json({ service: (Array.isArray(rows) && rows[0]) || null }, 201, corsHeaders);
  } catch (err) {
    console.error('services POST error:', err.message);
    // 409 probabile su violazione unique(name)
    if (/409|duplicate|unique/i.test(err.message)) {
      return json({ error: 'Servizio già esistente' }, 409, corsHeaders);
    }
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

  if (!UUID_RE.test(body.id || '')) return json({ error: 'id non valido' }, 400, corsHeaders);

  const patch = {};
  if ('name' in body) {
    const name = cleanText(body.name, 60);
    if (!name) return json({ error: 'name non valido' }, 400, corsHeaders);
    patch.name = name;
  }
  if ('duration_min' in body) {
    if (body.duration_min === null) {
      patch.duration_min = null;
    } else {
      const v = clampInt(body.duration_min, 1, 600);
      if (v == null) return json({ error: 'duration_min non valido' }, 400, corsHeaders);
      patch.duration_min = v;
    }
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
  if (Object.keys(patch).length === 0) {
    return json({ error: 'Nessun campo da aggiornare' }, 400, corsHeaders);
  }

  try {
    const rows = await db.patch('services', `?id=eq.${encodeURIComponent(body.id)}`, patch);
    if (!Array.isArray(rows) || rows.length === 0) {
      return json({ error: 'Servizio non trovato' }, 404, corsHeaders);
    }
    return json({ service: rows[0] }, 200, corsHeaders);
  } catch (err) {
    console.error('services PATCH error:', err.message);
    if (/409|duplicate|unique/i.test(err.message)) {
      return json({ error: 'Nome servizio già esistente' }, 409, corsHeaders);
    }
    return json({ error: 'Errore interno' }, 500, corsHeaders);
  }
}

export async function onRequestDelete({ request, env }) {
  const g = await guard(request, env);
  if (!g.ok) return g.response;
  const { db, corsHeaders } = g;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!UUID_RE.test(id || '')) return json({ error: 'id non valido' }, 400, corsHeaders);

  try {
    await db.del('services', `?id=eq.${encodeURIComponent(id)}`);
    return json({ ok: true }, 200, corsHeaders);
  } catch (err) {
    console.error('services DELETE error:', err.message);
    return json({ error: 'Errore interno' }, 500, corsHeaders);
  }
}

export function onRequestOptions({ request }) {
  return preflight(request, 'GET, POST, PATCH, DELETE');
}
