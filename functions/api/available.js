import { getAccessToken, getCalendarId, getServiceAccount, romeOffset, WORK_RANGES, SLOT_MINUTES, pad } from './_google.js';

// ────────────────────────────────────────────────────────────────────
// SECURITY: CORS lockdown (vedi book.js per dettagli)
// ────────────────────────────────────────────────────────────────────
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

const ALLOWED_BARBERS = ['george', 'berlin'];

export async function onRequestGet({ request, env }) {
  const corsHeaders = buildCorsHeaders(request);
  const { searchParams } = new URL(request.url);
  const barber = searchParams.get('barber');
  const date   = searchParams.get('date');

  // ── Validazione input ────────────────────────────────────────
  if (!ALLOWED_BARBERS.includes(barber)) {
    return json({ error: 'Barbiere non valido' }, 400, corsHeaders);
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ error: 'Data non valida' }, 400, corsHeaders);
  }
  // Limite range temporale (no query a date assurde)
  const reqDate = new Date(date + 'T12:00:00Z');
  if (isNaN(reqDate.getTime())) {
    return json({ error: 'Data non valida' }, 400, corsHeaders);
  }
  const now = new Date();
  const minDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const maxDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  if (reqDate < minDate || reqDate > maxDate) {
    return json({ slots: [] }, 200, corsHeaders);
  }

  // Blocca domenica
  const dayOfWeek = reqDate.getUTCDay();
  if (dayOfWeek === 0) return json({ slots: [] }, 200, corsHeaders);

  const calendarId     = getCalendarId(barber, env);
  const serviceAccount = getServiceAccount(barber, env);
  if (!calendarId || !serviceAccount.email) {
    return json({ error: 'Barbiere non configurato' }, 400, corsHeaders);
  }

  const tz = romeOffset(date);

  try {
    const token = await getAccessToken(serviceAccount);

    const fbRes = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeMin: `${date}T09:00:00${tz}`,
        timeMax: `${date}T20:00:00${tz}`,
        timeZone: 'Europe/Rome',
        items: [{ id: calendarId }],
      }),
    });

    const fbData = await fbRes.json();
    const busy   = fbData.calendars?.[calendarId]?.busy ?? [];
    const nowD   = new Date();

    const slots = [];
    for (const range of WORK_RANGES) {
      for (let m = range.start; m < range.end; m += SLOT_MINUTES) {
        const h   = Math.floor(m / 60);
        const min = m % 60;
        const slotStart = new Date(`${date}T${pad(h)}:${pad(min)}:00${tz}`);
        const slotEnd   = new Date(slotStart.getTime() + SLOT_MINUTES * 60000);

        if (slotEnd <= nowD) continue;

        const isBusy = busy.some(({ start, end }) =>
          slotStart < new Date(end) && slotEnd > new Date(start)
        );

        slots.push({ time: `${pad(h)}:${pad(min)}`, available: !isBusy });
      }
    }

    return json({ slots }, 200, corsHeaders);
  } catch (err) {
    console.error('available.js error:', err.message);
    // Non esporre dettagli interni
    return json({ error: 'Errore interno' }, 500, corsHeaders);
  }
}

export async function onRequestOptions({ request }) {
  const corsHeaders = buildCorsHeaders(request);
  return new Response(null, {
    headers: {
      ...corsHeaders,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers });
}
