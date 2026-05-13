import { getScriptUrl, romeOffset, pad } from './_google.js';

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

  const scriptUrl = getScriptUrl(barber, env);
  if (!scriptUrl) return json({ error: 'Barbiere non configurato' }, 400);

  const tz = romeOffset(data);
  const [startH, startM] = ora.split(':').map(Number);
  const endH = startH + 1;

  try {
    const res = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: env.BOOKING_SECRET,
        action: 'book',
        summary: `${servizio} — ${nome}`,
        description: `Tel: ${telefono}${note ? `\nNote: ${note}` : ''}`,
        start: `${data}T${pad(startH)}:${pad(startM)}:00${tz}`,
        end:   `${data}T${pad(endH)}:${pad(startM)}:00${tz}`,
      }),
    });

    const result = await res.json();
    if (result.error) throw new Error(result.error);

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
