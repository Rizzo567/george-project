import { getAccessToken, getCalendarId, getServiceAccount, romeOffset, getEventDuration, getClosure, closureWindow, pad, SUPABASE_URL_PUBLIC } from './_google.js';

// ────────────────────────────────────────────────────────────────────
// SECURITY: CORS lockdown
// Lista origini consentite. Aggiornare se il dominio custom cambia.
// Per dev/preview Pages, includere il pattern *.pages.dev.
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
    || origin === '' // server-to-server / curl: nessun browser policy
      ? origin || ALLOWED_ORIGINS[0]
      : ALLOWED_ORIGINS[0];
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
    // Defense in depth security headers
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cache-Control': 'no-store',
  };
}

// ────────────────────────────────────────────────────────────────────
// SECURITY: input validation
// ────────────────────────────────────────────────────────────────────
const ALLOWED_SERVICES = ['Cut', 'Fade', 'Beard', 'Razor', 'Full'];
const ALLOWED_BARBERS  = ['george', 'berlin'];

function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T12:00:00Z');
  if (isNaN(d.getTime())) return false;
  // Non in passato di più di 1 giorno (UTC tolerance), non più di 1 anno futuro
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const inOneYear = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  return d >= yesterday && d <= inOneYear;
}

function isValidTime(s) {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

function sanitizeText(s, max) {
  if (typeof s !== 'string') return '';
  // Rimuovi caratteri di controllo (newline esclusa per le note multiriga? No: per
  // calendar event description i caratteri di controllo non sono ammessi).
  // Manteniamo \n e \r per note multiriga ma rimuoviamo gli altri.
  return s
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, max);
}

function isValidPhone(s) {
  if (typeof s !== 'string') return false;
  const trimmed = s.trim();
  if (trimmed.length < 5 || trimmed.length > 32) return false;
  // Caratteri ammessi: cifre, +, spazi, trattini, parentesi
  return /^[\d\s+\-()]+$/.test(trimmed);
}

// ────────────────────────────────────────────────────────────────────
// SECURITY: in-memory rate limit (best-effort, per Worker isolate)
// Per protezione robusta usare Cloudflare Rate Limiting Rules.
// ────────────────────────────────────────────────────────────────────
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX       = 5;
const ipBuckets = new Map();

function rateLimitCheck(ip) {
  const now = Date.now();
  const bucket = ipBuckets.get(ip) || [];
  const fresh  = bucket.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (fresh.length >= RATE_LIMIT_MAX) return false;
  fresh.push(now);
  ipBuckets.set(ip, fresh);
  // GC sporadico
  if (ipBuckets.size > 1000) {
    for (const [k, v] of ipBuckets) {
      const recent = v.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
      if (recent.length === 0) ipBuckets.delete(k);
      else ipBuckets.set(k, recent);
    }
  }
  return true;
}

// ────────────────────────────────────────────────────────────────────
// SECURITY: dedup tramite Supabase REST con anon key
// Verifica che non esista già una prenotazione attiva con stesso barber+date+time
// ────────────────────────────────────────────────────────────────────
async function isSlotAlreadyBooked(env, barber, date, time) {
  // Se le env vars non sono configurate, skip (dedup non blocca booking)
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY;
  if (!url || !key) return false;

  try {
    // Time può arrivare come HH:MM ma in DB è HH:MM:SS
    const timeFull = time.length === 5 ? time + ':00' : time;
    const reqUrl = `${url}/rest/v1/appointment_slots`
      + `?barber=eq.${encodeURIComponent(barber)}`
      + `&date=eq.${encodeURIComponent(date)}`
      + `&time=eq.${encodeURIComponent(timeFull)}`
      + `&select=id&limit=1`;
    const r = await fetch(reqUrl, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
    });
    if (!r.ok) return false;
    const rows = await r.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

// ────────────────────────────────────────────────────────────────────
// Persiste calendar_event_id sulla riga appointments via Supabase REST con
// SERVICE_ROLE key (bypassa RLS). Necessario perché l'UPDATE lato client con
// anon key falliva sempre (anon non ha policy UPDATE). Best-effort: un errore
// qui non deve far fallire la prenotazione (l'evento Calendar è già creato).
// ────────────────────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function persistEventId(env, apptId, eventId) {
  const url = env.SUPABASE_URL || SUPABASE_URL_PUBLIC;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !eventId || !UUID_RE.test(apptId || '')) return false;
  try {
    const r = await fetch(`${url}/rest/v1/appointments?id=eq.${encodeURIComponent(apptId)}`, {
      method: 'PATCH',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ calendar_event_id: eventId }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function onRequestPost({ request, env }) {
  const corsHeaders = buildCorsHeaders(request);
  const ip = request.headers.get('CF-Connecting-IP')
          || request.headers.get('X-Forwarded-For')
          || 'unknown';

  // Rate limit
  if (!rateLimitCheck(ip)) {
    return json({ error: 'Troppe richieste. Riprova tra qualche minuto.' }, 429, corsHeaders);
  }

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Body non valido' }, 400, corsHeaders); }

  let { barber, nome, telefono, data, ora, servizio, note, imgUrl, email, apptId } = body;

  // ── Validazione ────────────────────────────────────────────────
  if (!ALLOWED_BARBERS.includes(barber)) {
    return json({ error: 'Barbiere non valido' }, 400, corsHeaders);
  }
  nome = sanitizeText(nome, 100);
  if (nome.length < 1) {
    return json({ error: 'Nome non valido' }, 400, corsHeaders);
  }
  if (!isValidPhone(telefono)) {
    return json({ error: 'Telefono non valido' }, 400, corsHeaders);
  }
  telefono = sanitizeText(telefono, 32);
  if (!isValidDate(data)) {
    return json({ error: 'Data non valida' }, 400, corsHeaders);
  }
  if (!isValidTime(ora)) {
    return json({ error: 'Orario non valido' }, 400, corsHeaders);
  }
  if (servizio && !ALLOWED_SERVICES.includes(servizio)) {
    return json({ error: 'Servizio non valido' }, 400, corsHeaders);
  }
  if (note != null && note !== '') {
    note = sanitizeText(note, 500);
  } else {
    note = null;
  }

  // Validazione imgUrl (Supabase public URL)
  let safeImgUrl = null;
  if (imgUrl != null && imgUrl !== '') {
    const trimmedUrl = String(imgUrl).trim();
    if (trimmedUrl.startsWith('https://') && trimmedUrl.length <= 2048) {
      safeImgUrl = trimmedUrl;
    }
  }

  // ── Dedup: stesso slot già prenotato? ──────────────────────────
  if (await isSlotAlreadyBooked(env, barber, data, ora)) {
    return json({ error: 'Slot già prenotato. Scegli un altro orario.' }, 409, corsHeaders);
  }

  // ── Chiusura / festività: slot dentro un giorno chiuso? ────────
  const closure    = await getClosure(env, barber, data);
  const closureWin = closureWindow(closure);
  const [startH, startM] = ora.split(':').map(Number);
  const startMin = startH * 60 + startM;
  if (closureWin === null || startMin < closureWin.start || startMin >= closureWin.end) {
    return json({ error: 'Il barbiere è chiuso in questo giorno/orario.' }, 409, corsHeaders);
  }

  // ── Config Google ──────────────────────────────────────────────
  const calendarId     = getCalendarId(barber, env);
  const serviceAccount = getServiceAccount(barber, env);
  if (!calendarId || !serviceAccount.email) {
    return json({ error: 'Barbiere non configurato' }, 400, corsHeaders);
  }

  const tz = romeOffset(data);
  // Durata reale per barbiere: George 40min, Berlin 60min
  const duration = getEventDuration(barber);
  const endTotal = startMin + duration;
  const endH = Math.floor(endTotal / 60);
  const endM = endTotal % 60;

  try {
    // ── Guard autoritativo: il calendario è occupato su questa finestra? ──
    // Chiude l'overbooking quando i barbieri bloccano i giorni creando eventi
    // direttamente su Google Calendar (non presenti in Supabase).
    const token = await getAccessToken(serviceAccount);

    const startIso = `${data}T${pad(startH)}:${pad(startM)}:00${tz}`;
    const endIso   = `${data}T${pad(endH)}:${pad(endM)}:00${tz}`;
    const fbRes = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeMin: startIso,
        timeMax: endIso,
        timeZone: 'Europe/Rome',
        items: [{ id: calendarId }],
      }),
    });
    if (fbRes.ok) {
      const fbData = await fbRes.json();
      const busy   = fbData.calendars?.[calendarId]?.busy ?? [];
      const sD = new Date(startIso);
      const eD = new Date(endIso);
      const overlaps = busy.some(({ start, end }) => sD < new Date(end) && eD > new Date(start));
      if (overlaps) {
        return json({ error: 'Slot non più disponibile. Scegli un altro orario.' }, 409, corsHeaders);
      }
    }
    // Se la verifica freeBusy fallisce (fbRes non ok), si procede: la dedup
    // Supabase resta come rete di sicurezza, non blocchiamo per un errore transitorio.
    // Componi description in modo safe (nessun input grezzo nelle linee strutturate)
    const description = [
      `Tel: ${telefono}`,
      note ? `Note: ${note}` : null,
      safeImgUrl ? `Immagine riferimento: ${safeImgUrl}` : null,
    ].filter(Boolean).join('\n');

    const event = {
      summary:     servizio ? `${servizio} — ${nome}` : `Prenotazione — ${nome}`,
      description,
      start: { dateTime: `${data}T${pad(startH)}:${pad(startM)}:00${tz}`, timeZone: 'Europe/Rome' },
      end:   { dateTime: `${data}T${pad(endH)}:${pad(endM)}:00${tz}`,   timeZone: 'Europe/Rome' },
    };

    const calUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;

    const res = await fetch(calUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message ?? 'Errore Google Calendar');
    }

    const createdEvent = await res.json();
    const eventId = createdEvent.id ?? null;

    // Collega l'evento Calendar alla riga DB (server-side, service_role).
    // Senza questo la cancellazione admin non può eliminare l'evento Calendar
    // → con Calendar autoritativo lo slot resterebbe bloccato dopo un annullamento.
    if (eventId && apptId) {
      await persistEventId(env, apptId, eventId);
    }

    // ── Email di conferma al cliente (server-side via Resend) ──
    if (email && env.RESEND_API_KEY) {
      const emailSanitized = sanitizeText(email, 254);
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailSanitized)) {
        const barberLabel = barber === 'george' ? 'George' : 'Berlin';
        const [yyyy, mm, dd] = data.split('-');
        const dateObj = new Date(`${data}T12:00:00Z`);
        const DAYS   = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
        const MONTHS = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
        const dateStr = `${DAYS[dateObj.getUTCDay()]} ${dd} ${MONTHS[dateObj.getUTCMonth()]} ${yyyy}`;

        const emailHtml = `<!DOCTYPE html>
<html lang="it"><head><meta charset="UTF-8"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background-color:#F5F4F1;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F5F4F1;padding:40px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background-color:#FFFFFF;">
<tr><td style="background-color:#E85A1F;height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:36px 40px 32px;background-color:#0B0B0B;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td><div style="font-family:Impact,Arial,sans-serif;font-size:30px;letter-spacing:0.06em;text-transform:uppercase;line-height:0.9;">
      <span style="color:#E5E1D8;">Mister</span><br><span style="color:#E85A1F;">Barber</span>
    </div></td>
    <td align="right" valign="middle">
      <span style="font-family:Arial,sans-serif;font-size:10px;font-weight:bold;letter-spacing:0.28em;text-transform:uppercase;color:#E85A1F;background-color:rgba(232,90,31,0.15);padding:6px 12px;border:1px solid #E85A1F;">CONFIRMED</span>
    </td>
  </tr></table>
</td></tr>
<tr><td style="padding:40px 40px 0;background-color:#FFFFFF;">
  <p style="font-family:Arial,sans-serif;font-size:15px;color:#1A1A1A;line-height:1.7;margin:0 0 32px;">
    Ciao <strong>${nome}</strong>,<br><br>La tua prenotazione è confermata. Ti aspettiamo puntuale.
  </p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E8E6E1;border-left:4px solid #E85A1F;margin-bottom:32px;">
    <tr><td style="padding:28px 28px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid #F0EDE8;">
        <tr>
          <td>
            <span style="font-family:Arial,sans-serif;font-size:10px;font-weight:bold;letter-spacing:0.22em;text-transform:uppercase;color:#8E8E8E;display:block;margin-bottom:6px;">Barbiere</span>
            <span style="font-family:Impact,Arial,sans-serif;font-size:26px;letter-spacing:0.04em;text-transform:uppercase;color:#0B0B0B;">${barberLabel}</span>
          </td>
        </tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid #F0EDE8;">
        <tr>
          <td width="50%">
            <span style="font-family:Arial,sans-serif;font-size:10px;font-weight:bold;letter-spacing:0.22em;text-transform:uppercase;color:#8E8E8E;display:block;margin-bottom:6px;">Data</span>
            <span style="font-family:Impact,Arial,sans-serif;font-size:22px;letter-spacing:0.04em;text-transform:uppercase;color:#0B0B0B;">${dateStr}</span>
          </td>
          <td width="50%">
            <span style="font-family:Arial,sans-serif;font-size:10px;font-weight:bold;letter-spacing:0.22em;text-transform:uppercase;color:#8E8E8E;display:block;margin-bottom:6px;">Orario</span>
            <span style="font-family:Impact,Arial,sans-serif;font-size:22px;letter-spacing:0.04em;color:#E85A1F;">${ora}</span>
          </td>
        </tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
        <tr><td>
          <span style="font-family:Arial,sans-serif;font-size:10px;font-weight:bold;letter-spacing:0.22em;text-transform:uppercase;color:#8E8E8E;display:block;margin-bottom:6px;">Servizio</span>
          <span style="font-family:Impact,Arial,sans-serif;font-size:22px;letter-spacing:0.04em;text-transform:uppercase;color:#0B0B0B;">${servizio || '—'}</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F5F4F1;margin-bottom:36px;">
    <tr><td style="padding:16px 20px;">
      <span style="font-family:Arial,sans-serif;font-size:12px;color:#5A5A5A;line-height:1.7;letter-spacing:0.04em;">
        Via Torino 38, Pavia &nbsp;·&nbsp; Mar – Sab 09:00 – 19:00
      </span>
    </td></tr>
  </table>
</td></tr>
<tr><td style="padding:24px 40px 32px;background-color:#FFFFFF;border-top:1px solid #F0EDE8;">
  <p style="font-family:Arial,sans-serif;font-size:11px;color:#8E8E8E;letter-spacing:0.06em;margin:0;line-height:1.8;">
    Devi spostare o cancellare?<br>
    <a href="mailto:superberlin0204@gmail.com" style="color:#E85A1F;text-decoration:none;font-weight:bold;">superberlin0204@gmail.com</a>
  </p>
</td></tr>
<tr><td style="background-color:#0B0B0B;padding:14px 40px;">
  <p style="font-family:Arial,sans-serif;font-size:10px;color:#5A5A5A;letter-spacing:0.12em;text-transform:uppercase;margin:0;">
    © 2026 Mister Barber — Via Torino 38, Pavia
  </p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

        try {
          const resendRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${env.RESEND_API_KEY.trim()}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'Mister Barber <noreply@misterbarber.shop>',
              to:   [emailSanitized],
              reply_to: 'superberlin0204@gmail.com',
              subject: `Prenotazione confermata — ${barberLabel} · ${ora}`,
              html: emailHtml,
            }),
          });
          if (!resendRes.ok) {
            const errText = await resendRes.text();
            console.error('Resend error:', resendRes.status, errText);
          }
        } catch (emailErr) {
          console.error('Resend fetch error:', emailErr.message);
        }
      }
    }

    return json({ ok: true, eventId }, 200, corsHeaders);
  } catch (err) {
    // Non esporre dettagli interni al client
    console.error('book.js error:', err.message);
    return json({ error: 'Errore interno. Riprova.' }, 500, corsHeaders);
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
