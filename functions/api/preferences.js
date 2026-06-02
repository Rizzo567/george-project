// /api/preferences  — layout dashboard dell'utente corrente.
//   GET → { layout }  (la riga dell'utente del token; {} se non esiste)
//   PUT → upsert {layout} per l'utente corrente
// La riga è SEMPRE legata a user_id = id utente estratto dal token (mai dal body),
// così un utente non può leggere/scrivere le preferenze di un altro.
// Auth: Bearer admin token. DB via service_role (upsert su user_id).
import { guard, json, preflight } from './settings/_lib.js';

// Limita la dimensione del JSON layout per evitare abusi.
const MAX_LAYOUT_BYTES = 16 * 1024;

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

export async function onRequestGet({ request, env }) {
  const g = await guard(request, env);
  if (!g.ok) return g.response;
  const { db, user, corsHeaders } = g;

  try {
    const rows = await db.get(
      `user_preferences?user_id=eq.${encodeURIComponent(user.id)}&select=layout&limit=1`
    );
    const layout = (Array.isArray(rows) && rows[0] && rows[0].layout) || {};
    return json({ layout }, 200, corsHeaders);
  } catch (err) {
    console.error('preferences GET error:', err.message);
    return json({ error: 'Errore interno' }, 500, corsHeaders);
  }
}

export async function onRequestPut({ request, env }) {
  const g = await guard(request, env);
  if (!g.ok) return g.response;
  const { db, user, corsHeaders } = g;

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Body non valido' }, 400, corsHeaders); }

  const layout = body.layout;
  if (!isPlainObject(layout)) {
    return json({ error: 'layout non valido' }, 400, corsHeaders);
  }
  // Guard dimensione (evita payload enormi nel jsonb).
  let serialized;
  try { serialized = JSON.stringify(layout); }
  catch { return json({ error: 'layout non serializzabile' }, 400, corsHeaders); }
  if (serialized.length > MAX_LAYOUT_BYTES) {
    return json({ error: 'layout troppo grande' }, 413, corsHeaders);
  }

  try {
    // user_id è UNIQUE → upsert. user_id viene SEMPRE dal token, mai dal client.
    const rows = await db.upsert(
      'user_preferences',
      { user_id: user.id, layout },
      'user_id'
    );
    const saved = (Array.isArray(rows) && rows[0] && rows[0].layout) || layout;
    return json({ layout: saved }, 200, corsHeaders);
  } catch (err) {
    console.error('preferences PUT error:', err.message);
    return json({ error: 'Errore interno' }, 500, corsHeaders);
  }
}

export function onRequestOptions({ request }) {
  return preflight(request, 'GET, PUT');
}
