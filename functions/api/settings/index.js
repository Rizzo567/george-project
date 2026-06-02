// GET /api/settings
// Bundle di configurazione per il gestionale: { shop_settings, services, staff, business_hours }.
// Auth: Bearer <supabase access_token> (admin). DB via service_role.
import { guard, json, preflight } from './_lib.js';

export async function onRequestGet({ request, env }) {
  const g = await guard(request, env);
  if (!g.ok) return g.response;
  const { db, corsHeaders } = g;

  try {
    const [shopRows, services, staff, hours] = await Promise.all([
      db.get('shop_settings?select=*&limit=1'),
      db.get('services?select=*&order=sort_order.asc'),
      db.get('staff?select=*&order=sort_order.asc'),
      db.get('business_hours?select=*&order=staff_slug.asc,weekday.asc'),
    ]);

    return json({
      shop_settings: (Array.isArray(shopRows) && shopRows[0]) || null,
      services: Array.isArray(services) ? services : [],
      staff: Array.isArray(staff) ? staff : [],
      business_hours: Array.isArray(hours) ? hours : [],
    }, 200, corsHeaders);
  } catch (err) {
    console.error('settings/index error:', err.message);
    return json({ error: 'Errore interno' }, 500, corsHeaders);
  }
}

export function onRequestOptions({ request }) {
  return preflight(request, 'GET');
}
