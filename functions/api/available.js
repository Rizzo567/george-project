import { getAccessToken, getCalendarId, romeOffset, WORK_START, WORK_END, SLOT_MINUTES } from './_google.js';

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export async function onRequestGet({ request, env }) {
  const { searchParams } = new URL(request.url);
  const barber = searchParams.get('barber');
  const date = searchParams.get('date');

  if (!barber || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ error: 'Parametri non validi' }, 400);
  }

  const tz = romeOffset(date);
  const calendarId = getCalendarId(barber, env);
  if (!calendarId) return json({ error: 'Barbiere non valido' }, 400);

  try {
    const token = await getAccessToken(env);

    const fbRes = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeMin: `${date}T${pad(WORK_START)}:00:00${tz}`,
        timeMax: `${date}T${pad(WORK_END)}:00:00${tz}`,
        timeZone: 'Europe/Rome',
        items: [{ id: calendarId }],
      }),
    });

    const fbData = await fbRes.json();
    const busy = fbData.calendars?.[calendarId]?.busy ?? [];
    const now = new Date();

    const slots = [];
    for (let h = WORK_START; h < WORK_END; h++) {
      const slotStart = new Date(`${date}T${pad(h)}:00:00${tz}`);
      const slotEnd = new Date(slotStart.getTime() + SLOT_MINUTES * 60000);

      if (slotEnd <= now) continue; // slot nel passato

      const busy_ = busy.some(({ start, end }) => {
        return slotStart < new Date(end) && slotEnd > new Date(start);
      });

      slots.push({ time: `${pad(h)}:00`, available: !busy_ });
    }

    return json({ slots });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: { ...HEADERS, 'Access-Control-Allow-Methods': 'GET, OPTIONS' },
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: HEADERS });
}

function pad(n) {
  return String(n).padStart(2, '0');
}
