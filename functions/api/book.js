import { getAccessToken, getCalendarId, romeOffset } from './_google.js';

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Body non valido' }, 400); }

  const { barber, nome, telefono, data, ora, servizio, note } = body;

  if (!barber || !nome || !telefono || !data || !ora || !servizio) {
    return json({ error: 'Campi obbligatori mancanti' }, 400);
  }

  const calendarId = getCalendarId(barber, env);
  if (!calendarId) return json({ error: 'Barbiere non valido' }, 400);

  const tz = romeOffset(data);
  const [startH, startM] = ora.split(':').map(Number);
  const endH = startH + 1;

  const event = {
    summary: `${servizio} — ${nome}`,
    description: `Tel: ${telefono}${note ? `\nNote: ${note}` : ''}`,
    start: { dateTime: `${data}T${pad(startH)}:${pad(startM)}:00${tz}`, timeZone: 'Europe/Rome' },
    end:   { dateTime: `${data}T${pad(endH)}:${pad(startM)}:00${tz}`, timeZone: 'Europe/Rome' },
  };

  try {
    const token = await getAccessToken(env);

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      }
    );

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message ?? 'Errore Google Calendar');
    }

    return json({ ok: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: { ...HEADERS, 'Access-Control-Allow-Methods': 'POST, OPTIONS' },
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: HEADERS });
}

function pad(n) {
  return String(n).padStart(2, '0');
}
