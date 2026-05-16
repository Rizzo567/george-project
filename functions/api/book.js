import { getAccessToken, uploadToDrive, getCalendarId, getServiceAccount, romeOffset, pad } from './_google.js';

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
const ALLOWED_MIMES    = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic'];
const MAX_IMG_BYTES    = 5 * 1024 * 1024; // 5 MB

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

function isValidFileName(s) {
  if (typeof s !== 'string') return false;
  if (s.length > 256) return false;
  // No path traversal, no slash, no null bytes
  return !/[\/\\\x00]/.test(s) && !s.includes('..');
}

// Stima dimensione decodificata di una stringa base64 (4 char → 3 byte)
function base64DecodedLength(b64) {
  if (typeof b64 !== 'string') return 0;
  const pad = (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
  return Math.floor(b64.length * 3 / 4) - pad;
}

function isValidBase64(s) {
  if (typeof s !== 'string') return false;
  if (s.length > 10_000_000) return false; // sanity guard
  return /^[A-Za-z0-9+/=\s]*$/.test(s);
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

  let { barber, nome, telefono, data, ora, servizio, note, imgBase64, imgMime, imgName } = body;

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

  // Validazione immagine
  let safeImgBase64 = null;
  let safeImgMime   = null;
  let safeImgName   = null;
  if (imgBase64 || imgMime || imgName) {
    if (!imgBase64 || !imgMime || !imgName) {
      return json({ error: 'Dati immagine incompleti' }, 400, corsHeaders);
    }
    if (!ALLOWED_MIMES.includes(imgMime)) {
      return json({ error: 'Tipo immagine non supportato' }, 400, corsHeaders);
    }
    if (!isValidFileName(imgName)) {
      return json({ error: 'Nome file non valido' }, 400, corsHeaders);
    }
    if (!isValidBase64(imgBase64)) {
      return json({ error: 'Immagine non valida' }, 400, corsHeaders);
    }
    if (base64DecodedLength(imgBase64) > MAX_IMG_BYTES) {
      return json({ error: 'Immagine troppo grande (max 5MB)' }, 413, corsHeaders);
    }
    safeImgBase64 = imgBase64;
    safeImgMime   = imgMime;
    safeImgName   = imgName;
  }

  // ── Dedup: stesso slot già prenotato? ──────────────────────────
  if (await isSlotAlreadyBooked(env, barber, data, ora)) {
    return json({ error: 'Slot già prenotato. Scegli un altro orario.' }, 409, corsHeaders);
  }

  // ── Config Google ──────────────────────────────────────────────
  const calendarId     = getCalendarId(barber, env);
  const serviceAccount = getServiceAccount(barber, env);
  if (!calendarId || !serviceAccount.email) {
    return json({ error: 'Barbiere non configurato' }, 400, corsHeaders);
  }

  const tz = romeOffset(data);
  const [startH, startM] = ora.split(':').map(Number);
  const endTotal = startH * 60 + startM + 30;
  const endH = Math.floor(endTotal / 60);
  const endM = endTotal % 60;

  try {
    // Upload immagine su Drive se presente
    let driveLink = null;
    if (safeImgBase64 && safeImgMime) {
      const fileName = safeImgName || `riferimento_${data}.jpg`;
      const { webViewLink } = await uploadToDrive(serviceAccount, safeImgBase64, safeImgMime, fileName);
      driveLink = webViewLink;
    }

    // Componi description in modo safe (nessun input grezzo nelle linee strutturate)
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

    return json({ ok: true }, 200, corsHeaders);
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
