import { getAccessToken, getCalendarId, getServiceAccount } from './_google.js';

const ALLOWED_ORIGINS = [
  'https://misterbarber.it',
  'https://www.misterbarber.it',
  'https://mister-barber.pages.dev',
  'https://george-website.pages.dev',
];

function buildCorsHeaders(request) {
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

export async function onRequestPost({ request, env }) {
  const corsHeaders = buildCorsHeaders(request);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Body non valido' }, 400, corsHeaders); }

  const { barber, eventId } = body;

  if (!['george', 'berlin'].includes(barber)) {
    return json({ error: 'Barbiere non valido' }, 400, corsHeaders);
  }
  if (!eventId || typeof eventId !== 'string' || eventId.length > 1024) {
    return json({ error: 'eventId non valido' }, 400, corsHeaders);
  }

  const calendarId     = getCalendarId(barber, env);
  const serviceAccount = getServiceAccount(barber, env);

  if (!calendarId || !serviceAccount.email) {
    return json({ error: 'Barbiere non configurato' }, 400, corsHeaders);
  }

  try {
    const token  = await getAccessToken(serviceAccount);
    const delUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;

    const res = await fetch(delUrl, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    // 204 = deleted, 404 = already gone — entrambi OK
    if (res.status === 204 || res.status === 404) {
      return json({ ok: true }, 200, corsHeaders);
    }

    const err = await res.json().catch(() => ({}));
    console.error('cancel-calendar error:', res.status, err);
    return json({ error: 'Errore cancellazione Calendar' }, 500, corsHeaders);

  } catch (err) {
    console.error('cancel-calendar exception:', err.message);
    return json({ error: 'Errore interno' }, 500, corsHeaders);
  }
}

export async function onRequestOptions({ request }) {
  const corsHeaders = buildCorsHeaders(request);
  return new Response(null, {
    headers: {
      ...corsHeaders,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers });
}
