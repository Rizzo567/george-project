// ────────────────────────────────────────────────────────────────────
// MISTER BARBER — Edge Function: notifica email al barbiere
// SECURITY (2026-05-16):
//  - Validazione rigorosa di TUTTI i campi (whitelist barber/service,
//    regex su data/ora, lunghezze massime)
//  - CORS ristretto a domini autorizzati
//  - Rate limit per IP in-memory
//  - Sanitizzazione corpo email (no header injection, no control chars)
//  - Shared secret opzionale via env BOOKING_SHARED_SECRET (header)
// ────────────────────────────────────────────────────────────────────

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const ADMIN_URL = Deno.env.get('ADMIN_URL') ?? '';
const BOOKING_SHARED_SECRET = Deno.env.get('BOOKING_SHARED_SECRET') ?? '';

const BARBER_EMAILS: Record<string, string> = {
  george: 'georgevelozperez5@gmail.com',
  berlin: 'superberlin0204@gmail.com',
};

const ALLOWED_ORIGINS = [
  'https://misterbarber.it',
  'https://www.misterbarber.it',
  'https://mister-barber.pages.dev',
  'https://george-website.pages.dev',
];

const ALLOWED_SERVICES = ['Cut', 'Fade', 'Beard', 'Razor', 'Full'];

function corsHeaders(req: Request) {
  const origin = req.headers.get('Origin') ?? '';
  const allow = ALLOWED_ORIGINS.includes(origin)
    || /^https:\/\/[a-z0-9-]+\.pages\.dev$/.test(origin)
      ? origin
      : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-booking-secret',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
}

// In-memory rate limit best-effort
const RATE_WINDOW_MS = 60_000;
const RATE_MAX       = 5;
const buckets = new Map<string, number[]>();
function rateLimit(ip: string): boolean {
  const now = Date.now();
  const arr = (buckets.get(ip) ?? []).filter(t => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) return false;
  arr.push(now);
  buckets.set(ip, arr);
  return true;
}

function isValidDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function isValidTime(s: unknown): s is string {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(s);
}
function isValidPhone(s: unknown): s is string {
  return typeof s === 'string' && /^[\d\s+\-()]{5,32}$/.test(s.trim());
}
function sanitizeText(s: unknown, max: number): string {
  if (typeof s !== 'string') return '';
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim().slice(0, max);
}
function sanitizeHeaderSafe(s: string): string {
  // Per i campi che finiscono nel subject email: niente CR/LF (header injection)
  return s.replace(/[\r\n]/g, ' ').slice(0, 120);
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Metodo non consentito' }), {
      status: 405, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  // Shared secret opzionale — se configurato in env, è obbligatorio
  if (BOOKING_SHARED_SECRET) {
    const provided = req.headers.get('x-booking-secret') ?? '';
    if (provided !== BOOKING_SHARED_SECRET) {
      return new Response(JSON.stringify({ error: 'Non autorizzato' }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...cors },
      });
    }
  }

  // Rate limit
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
          || req.headers.get('cf-connecting-ip')
          || 'unknown';
  if (!rateLimit(ip)) {
    return new Response(JSON.stringify({ error: 'Troppe richieste' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  let body: {
    barber?: string; name?: string; phone?: string;
    service?: string; date?: string; time?: string; notes?: string;
  };

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON non valido' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  // ── Validazione ──────────────────────────────────────────────
  const barber = body.barber;
  if (!barber || !BARBER_EMAILS[barber]) {
    return new Response(JSON.stringify({ error: 'Barbiere non valido' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
  const name = sanitizeText(body.name, 100);
  if (name.length < 1) {
    return new Response(JSON.stringify({ error: 'Nome non valido' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
  if (!isValidPhone(body.phone)) {
    return new Response(JSON.stringify({ error: 'Telefono non valido' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
  const phone = sanitizeText(body.phone, 32);
  if (!body.service || !ALLOWED_SERVICES.includes(body.service)) {
    return new Response(JSON.stringify({ error: 'Servizio non valido' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
  const service = body.service;
  if (!isValidDate(body.date)) {
    return new Response(JSON.stringify({ error: 'Data non valida' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
  const date = body.date;
  if (!isValidTime(body.time)) {
    return new Response(JSON.stringify({ error: 'Orario non valido' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
  const time = body.time;
  const notes = body.notes ? sanitizeText(body.notes, 500) : '';

  const emailTo = BARBER_EMAILS[barber];
  const barberName = barber === 'george' ? 'George' : 'Berlin';

  const emailBody = [
    `Nuova prenotazione — Mister Barber`,
    ``,
    `Barbiere: ${barberName}`,
    `Nome: ${name}`,
    `Telefono: ${phone}`,
    `Servizio: ${service}`,
    `Data: ${date}`,
    `Orario: ${time}`,
    `Note: ${notes || 'nessuna'}`,
    ``,
    `→ Pannello admin: ${ADMIN_URL}`,
  ].join('\n');

  const subject = sanitizeHeaderSafe(`Nuova prenotazione — ${name} — ${date} ${time}`);

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Mister Barber <onboarding@resend.dev>',
      to: [emailTo],
      subject,
      text: emailBody,
    }),
  });

  if (!resendRes.ok) {
    const err = await resendRes.text();
    console.error('Resend error:', err);
    return new Response(JSON.stringify({ error: 'Errore invio email' }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  return new Response(JSON.stringify({ sent: true }), {
    status: 200, headers: { 'Content-Type': 'application/json', ...cors },
  });
});
