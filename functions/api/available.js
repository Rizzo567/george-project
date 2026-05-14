import { getAccessToken, getCalendarId, getServiceAccount, romeOffset, WORK_START, WORK_END, SLOT_MINUTES, pad } from './_google.js';

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export async function onRequestGet({ request, env }) {
  const { searchParams } = new URL(request.url);
  const barber = searchParams.get('barber');
  const date   = searchParams.get('date');

  if (!barber || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ error: 'Parametri non validi' }, 400);
  }

  const calendarId     = getCalendarId(barber, env);
  const serviceAccount = getServiceAccount(barber, env);
  if (!calendarId || !serviceAccount.email) return json({ error: 'Barbiere non configurato' }, 400);

  const tz = romeOffset(date);

  try {
    const token = await getAccessToken(serviceAccount);

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
    const busy   = fbData.calendars?.[calendarId]?.busy ?? [];
    const now    = new Date();

    const slots = [];
    for (let m = WORK_START * 60; m < WORK_END * 60; m += SLOT_MINUTES) {
      const h = Math.floor(m / 60);
      const min = m % 60;
      const slotStart = new Date(`${date}T${pad(h)}:${pad(min)}:00${tz}`);
      const slotEnd   = new Date(slotStart.getTime() + SLOT_MINUTES * 60000);

      if (slotEnd <= now) continue;

      const isBusy = busy.some(({ start, end }) =>
        slotStart < new Date(end) && slotEnd > new Date(start)
      );

      slots.push({ time: `${pad(h)}:${pad(min)}`, available: !isBusy });
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
