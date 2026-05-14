import { getAccessToken, uploadToDrive, getCalendarId, getServiceAccount, romeOffset, pad } from './_google.js';

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Body non valido' }, 400); }

  const { barber, nome, telefono, data, ora, servizio, note, imgBase64, imgMime, imgName } = body;

  if (!barber || !nome || !telefono || !data || !ora) {
    return json({ error: 'Campi obbligatori mancanti' }, 400);
  }

  const calendarId     = getCalendarId(barber, env);
  const serviceAccount = getServiceAccount(barber, env);
  if (!calendarId || !serviceAccount.email) return json({ error: 'Barbiere non configurato' }, 400);

  const tz = romeOffset(data);
  const [startH, startM] = ora.split(':').map(Number);
  const endTotal = startH * 60 + startM + 30;
  const endH = Math.floor(endTotal / 60);
  const endM = endTotal % 60;

  try {
    // Upload immagine su Drive se presente
    let driveLink = null;
    if (imgBase64 && imgMime) {
      const fileName = imgName || `riferimento_${nome}_${data}.jpg`;
      const { webViewLink } = await uploadToDrive(serviceAccount, imgBase64, imgMime, fileName);
      driveLink = webViewLink;
    }

    const description = [
      `Tel: ${telefono}`,
      note ? `Note: ${note}` : null,
      driveLink ? `Immagine riferimento: ${driveLink}` : null,
    ].filter(Boolean).join('\n');

    const event = {
      summary:     servizio ? `${servizio} — ${nome}` : `Prenotazione — ${nome}`,
      description,
      start: { dateTime: `${data}T${pad(startH)}:${pad(startM)}:00${tz}`, timeZone: 'Europe/Rome' },
      end:   { dateTime: `${data}T${pad(endH)}:${pad(endM)}:00${tz}`,   timeZone: 'Europe/Rome' },
      ...(driveLink && {
        attachments: [{ fileUrl: driveLink, title: 'Immagine di riferimento' }],
      }),
    };

    const token = await getAccessToken(serviceAccount);
    const calUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
      + (driveLink ? '?supportsAttachments=true' : '');

    const res = await fetch(calUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });

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
