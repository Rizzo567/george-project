// Google Calendar API helpers — due service account separati

// Supabase pubblico: URL + anon key sono pubblici per design (già esposti nel
// client assets/js/config.js). Usati come fallback quando le env CF non sono
// configurate, così la lettura closures non dipende da SUPABASE_URL/SUPABASE_ANON_KEY.
export const SUPABASE_URL_PUBLIC  = 'https://ccmpysycifufktbrkiot.supabase.co';
export const SUPABASE_ANON_PUBLIC = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjbXB5c3ljaWZ1Zmt0YnJraW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NjA3NzYsImV4cCI6MjA5NDQzNjc3Nn0.G0qWDUmFHGuVsEqX3TqbW0ztyqxTwyyoPYqmluXGAMA';

// Legacy (non usare nei nuovi moduli)
export const SLOT_MINUTES = 30;
export const WORK_RANGES  = [
  { start: 9 * 60,  end: 12 * 60 },
  { start: 13 * 60, end: 20 * 60 },
];

// Per-barber slot duration (pitch della griglia: George 40min+5 pausa, Berlin 60min)
export function getSlotMinutes(barber) {
  return barber === 'george' ? 45 : 60;
}

// Per-barber EVENT duration (durata reale dell'appuntamento sul calendario)
// George: 40min di servizio (+5 di pausa lasciati liberi). Berlin: 60min pieni.
export function getEventDuration(barber) {
  return barber === 'george' ? 40 : 60;
}

// ────────────────────────────────────────────────────────────────────
// CHIUSURE / FESTIVITÀ
// Legge da Supabase REST (anon key) le chiusure che coprono `date` e si
// applicano a `barber`. Ritorna la più restrittiva (full ha priorità).
// Robusto al fallimento: se Supabase non è configurato o la fetch fallisce,
// ritorna null (nessuna chiusura → non blocca le prenotazioni).
// ────────────────────────────────────────────────────────────────────
export async function getClosure(env, barber, date) {
  // .trim(): le env incollate in dashboard possono avere newline/spazi finali
  // che rendono invalido l'header (TypeError: Invalid header value).
  const url = (env.SUPABASE_URL     || SUPABASE_URL_PUBLIC).trim();
  const key = (env.SUPABASE_ANON_KEY || SUPABASE_ANON_PUBLIC).trim();
  if (!url || !key) return null;

  try {
    // closures che coprono la data e valgono per questo barbiere (o 'both')
    const reqUrl = `${url}/rest/v1/closures`
      + `?select=scope,mode,custom_start,custom_end`
      + `&start_date=lte.${encodeURIComponent(date)}`
      + `&end_date=gte.${encodeURIComponent(date)}`
      + `&or=(scope.eq.both,scope.eq.${encodeURIComponent(barber)})`;
    const r = await fetch(reqUrl, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    if (!r.ok) return null;
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    // full ha priorità assoluta; altrimenti la prima chiusura parziale
    return rows.find(c => c.mode === 'full') || rows[0];
  } catch {
    return null;
  }
}

// Dato un record closure, ritorna la finestra oraria CONSENTITA in minuti dalla
// mezzanotte, oppure null se il giorno è completamente chiuso.
export function closureWindow(closure) {
  if (!closure) return { start: 0, end: 24 * 60 }; // nessuna chiusura: tutto aperto
  switch (closure.mode) {
    case 'full':           return null;                       // chiuso tutto il giorno
    case 'morning_only':   return { start: 0, end: 12 * 60 }; // solo mattina (fino a 12:00)
    case 'afternoon_only': return { start: 13 * 60, end: 24 * 60 }; // solo pomeriggio (da 13:00)
    case 'custom': {
      const s = hhmmToMin(closure.custom_start);
      const e = hhmmToMin(closure.custom_end);
      if (s == null || e == null || e <= s) return null;
      return { start: s, end: e };
    }
    default: return { start: 0, end: 24 * 60 };
  }
}

function hhmmToMin(t) {
  if (typeof t !== 'string') return null;
  const m = /^(\d{2}):(\d{2})/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

// Per-barber work ranges (matching frontend fallbackSlots)
export function getWorkRanges(barber) {
  if (barber === 'george') {
    return [
      { start: 9 * 60,        end: 12 * 60       }, // 09:00–11:15
      { start: 13 * 60,       end: 18 * 60        }, // 13:00–17:30
      { start: 18 * 60 + 15,  end: 18 * 60 + 16  }, // 18:15 extra
    ];
  }
  // berlin
  return [
    { start: 9 * 60,        end: 12 * 60       }, // 09:00–11:00
    { start: 13 * 60,       end: 19 * 60       }, // 13:00–18:00
    { start: 18 * 60 + 45,  end: 18 * 60 + 46 }, // 18:45 extra
  ];
}

export function getCalendarId(barber, env) {
  return barber === 'george' ? env.GEORGE_CALENDAR_ID : env.BERLIN_CALENDAR_ID;
}

export function getServiceAccount(barber, env) {
  return barber === 'george'
    ? { email: env.GEORGE_SERVICE_ACCOUNT_EMAIL, key: env.GEORGE_PRIVATE_KEY }
    : { email: env.BERLIN_SERVICE_ACCOUNT_EMAIL, key: env.BERLIN_PRIVATE_KEY };
}

export function romeOffset(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const m = d.getUTCMonth() + 1;
  if (m >= 4 && m <= 9) return '+02:00';
  if (m === 3 || m === 10) {
    const year = d.getUTCFullYear();
    const lastSun = new Date(Date.UTC(year, m === 3 ? 2 : 9, 31));
    while (lastSun.getUTCDay() !== 0) lastSun.setUTCDate(lastSun.getUTCDate() - 1);
    if (m === 3) return d >= lastSun ? '+02:00' : '+01:00';
    return d < lastSun ? '+02:00' : '+01:00';
  }
  return '+01:00';
}

export function pad(n) {
  return String(n).padStart(2, '0');
}

function base64url(data) {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function pemToBuffer(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const str = atob(b64);
  const buf = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) buf[i] = str.charCodeAt(i);
  return buf.buffer;
}

export async function getAccessToken(serviceAccount, scope = 'https://www.googleapis.com/auth/calendar') {
  const enc = new TextEncoder();
  const now = Math.floor(Date.now() / 1000);

  const header  = base64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claim   = base64url(enc.encode(JSON.stringify({
    iss: serviceAccount.email,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })));

  const sigInput = `${header}.${claim}`;
  const privateKey = serviceAccount.key.replace(/\\n/g, '\n');

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToBuffer(privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(sigInput));
  const jwt = `${sigInput}.${base64url(sig)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  const { access_token, error } = await res.json();
  if (error) throw new Error(`Google token error: ${error}`);
  return access_token;
}

export async function uploadToDrive(serviceAccount, base64Data, mimeType, fileName) {
  const token    = await getAccessToken(serviceAccount, 'https://www.googleapis.com/auth/drive.file');
  const boundary = 'misterbarber_boundary_314159';
  const metadata = JSON.stringify({ name: fileName });

  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    `--${boundary}`,
    `Content-Type: ${mimeType}`,
    'Content-Transfer-Encoding: base64',
    '',
    base64Data,
    `--${boundary}--`,
  ].join('\r\n');

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`,
      },
      body,
    }
  );

  const file = await uploadRes.json();
  if (!uploadRes.ok) throw new Error(file.error?.message ?? 'Drive upload error');

  // Make file viewable by anyone with the link
  await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}/permissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });

  return { fileId: file.id, webViewLink: file.webViewLink };
}
