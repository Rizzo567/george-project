import { getScriptUrl, romeOffset, WORK_START, WORK_END, SLOT_MINUTES, pad } from './_google.js';

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

  const scriptUrl = getScriptUrl(barber, env);
  if (!scriptUrl) return json({ error: 'Barbiere non configurato' }, 400);

  try {
    const res = await fetch(`${scriptUrl}?action=availability&date=${date}&secret=${env.BOOKING_SECRET}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const tz = romeOffset(date);
    const now = new Date();
    const busy = data.busy ?? [];

    const slots = [];
    for (let h = WORK_START; h < WORK_END; h++) {
      const slotStart = new Date(`${date}T${pad(h)}:00:00${tz}`);
      const slotEnd = new Date(slotStart.getTime() + SLOT_MINUTES * 60000);

      if (slotEnd <= now) continue;

      const isBusy = busy.some(({ start, end }) =>
        slotStart < new Date(end) && slotEnd > new Date(start)
      );

      slots.push({ time: `${pad(h)}:00`, available: !isBusy });
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
