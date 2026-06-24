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

// ────────────────────────────────────────────────────────────────────
// DB-DRIVEN CONFIG (con fallback ai default hardcoded)
//
// loadShopConfig(env) fa UNA sola fetch a Supabase (service_role, bypassa RLS)
// e ritorna { services, staff, hours, shop } oppure null se:
//   - service_role key non configurata
//   - fetch fallita / risposta non ok
//   - una qualsiasi tabella critica è vuota
// In tutti questi casi i chiamanti ricadono sui default hardcoded → comportamento
// IDENTICO a oggi. La config è cache-ata per-invocazione (WeakMap su `env`),
// così le funzioni helper che la rileggono più volte fanno una sola fetch.
//
// ⚠️ service_role è SEGRETA: usata solo server-side, mai esposta al client.
//    Sanifichiamo togliendo OGNI whitespace (paste corrotti in dashboard CF).
// ────────────────────────────────────────────────────────────────────
const _shopConfigCache = new WeakMap();

export async function loadShopConfig(env) {
  if (!env) return null;
  if (_shopConfigCache.has(env)) return _shopConfigCache.get(env);

  // Promise cache: evita fetch concorrenti multiple nella stessa invocazione.
  const p = _fetchShopConfig(env);
  _shopConfigCache.set(env, p);
  return p;
}

async function _fetchShopConfig(env) {
  const url = SUPABASE_URL_PUBLIC;
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/\s/g, '');
  if (!url || !key) {
    _shopConfigCache.set(env, null);
    return null;
  }

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
  };

  try {
    const [shopRes, servicesRes, staffRes, hoursRes] = await Promise.all([
      fetch(`${url}/rest/v1/shop_settings?select=weekly_closed_days,min_advance_minutes,max_future_days,timezone&limit=1`, { headers }),
      fetch(`${url}/rest/v1/services?select=name,active,sort_order&order=sort_order.asc`, { headers }),
      fetch(`${url}/rest/v1/staff?select=slug,calendar_id,event_duration_min,slot_pitch_min,active&order=sort_order.asc`, { headers }),
      fetch(`${url}/rest/v1/business_hours?select=staff_slug,weekday,ranges`, { headers }),
    ]);

    if (!shopRes.ok || !servicesRes.ok || !staffRes.ok || !hoursRes.ok) {
      _shopConfigCache.set(env, null);
      return null;
    }

    const [shopRows, services, staff, hours] = await Promise.all([
      shopRes.json(), servicesRes.json(), staffRes.json(), hoursRes.json(),
    ]);

    // Tabelle critiche vuote → fallback completo (null). shop_settings è singleton.
    if (!Array.isArray(staff) || staff.length === 0) { _shopConfigCache.set(env, null); return null; }
    if (!Array.isArray(services)) { _shopConfigCache.set(env, null); return null; }

    const config = {
      shop: (Array.isArray(shopRows) && shopRows[0]) || null,
      services: services,
      staff: staff,
      hours: Array.isArray(hours) ? hours : [],
    };
    _shopConfigCache.set(env, config);
    return config;
  } catch {
    _shopConfigCache.set(env, null);
    return null;
  }
}

function _findStaff(config, barber) {
  if (!config || !Array.isArray(config.staff)) return null;
  return config.staff.find(s => s.slug === barber) || null;
}

// Lista servizi ammessi (book.js): services.name where active.
// Fallback: lista fissa Cut/Fade/Beard/Razor/Full.
export async function getAllowedServices(env) {
  const fallback = ['Cut', 'Fade', 'Beard', 'Razor', 'Full'];
  const config = await loadShopConfig(env);
  if (config && Array.isArray(config.services)) {
    const names = config.services
      .filter(s => s.active && typeof s.name === 'string' && s.name.trim() !== '')
      .map(s => s.name);
    if (names.length > 0) return names;
  }
  return fallback;
}

// Lista barbieri ammessi (book.js / available.js): staff.slug where active.
// Fallback: ['george','berlin'].
export async function getAllowedBarbers(env) {
  const fallback = ['george', 'berlin'];
  const config = await loadShopConfig(env);
  if (config && Array.isArray(config.staff)) {
    const slugs = config.staff
      .filter(s => s.active && typeof s.slug === 'string' && s.slug.trim() !== '')
      .map(s => s.slug);
    if (slugs.length > 0) return slugs;
  }
  return fallback;
}

// Giorni di chiusura settimanale (available.js): shop_settings.weekly_closed_days.
// Fallback: [0] (domenica). Ritorna sempre un array di interi 0..6.
export async function getWeeklyClosedDays(env) {
  const fallback = [0];
  const config = await loadShopConfig(env);
  if (config && config.shop && Array.isArray(config.shop.weekly_closed_days)) {
    const days = config.shop.weekly_closed_days
      .map(Number)
      .filter(n => Number.isInteger(n) && n >= 0 && n <= 6);
    // weekly_closed_days vuoto è una scelta valida (nessun giorno chiuso)
    return days;
  }
  return fallback;
}

// Per-barber slot duration (pitch della griglia: George 45, Berlin 60).
// DB-driven: staff.slot_pitch_min; fallback hardcoded george=45 / berlin=60.
export async function getSlotMinutes(barber, env) {
  const config = await loadShopConfig(env);
  const s = _findStaff(config, barber);
  if (s && Number.isFinite(s.slot_pitch_min) && s.slot_pitch_min > 0) {
    return s.slot_pitch_min;
  }
  return barber === 'george' ? 45 : 60;
}

// Per-barber EVENT duration (durata reale dell'appuntamento sul calendario).
// George: 40min di servizio (+5 di pausa lasciati liberi). Berlin: 60min pieni.
// DB-driven: staff.event_duration_min; fallback hardcoded george=40 / berlin=60.
export async function getEventDuration(barber, env) {
  const config = await loadShopConfig(env);
  const s = _findStaff(config, barber);
  if (s && Number.isFinite(s.event_duration_min) && s.event_duration_min > 0) {
    return s.event_duration_min;
  }
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
  // URL + anon key sono PUBBLICI (già nel client config.js): usiamo direttamente
  // le costanti, NON l'env. Motivo: una SUPABASE_ANON_KEY incollata in dashboard
  // può contenere whitespace interno (paste spezzato) → header invalido
  // (TypeError: Invalid header value) → fetch fallita → closures ignorate.
  const url = SUPABASE_URL_PUBLIC;
  const key = SUPABASE_ANON_PUBLIC;
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

// Range orari hardcoded di fallback (comportamento attuale, identico per ogni
// giorno feriale). Usati quando il DB non è disponibile o non ha una riga
// business_hours per (barbiere, giorno).
function _fallbackWorkRanges(barber) {
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

// Converte "HH:MM" → minuti dalla mezzanotte; null se invalido.
function _hhmmToMinutes(t) {
  if (typeof t !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]); const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

// Per-barber work ranges per uno specifico giorno della settimana (0=dom..6=sab).
// DB-driven: business_hours.ranges (formato [{start:"HH:MM",end:"HH:MM"}]) per
// (staff_slug, weekday), convertito in minuti. Fallback ai range hardcoded attuali.
//
// Firma retro-compatibile: `weekday` ed `env` sono opzionali. Se omessi, ritorna
// direttamente il fallback hardcoded (= comportamento storico, uguale per ogni giorno).
// Domenica (weekday 0) non ha righe DB → la chiusura è gestita a monte da
// shop_settings.weekly_closed_days nei chiamanti.
export async function getWorkRanges(barber, weekday, env) {
  // Retro-compat: chiamata senza weekday/env → fallback hardcoded.
  if (weekday == null || env == null) return _fallbackWorkRanges(barber);

  const config = await loadShopConfig(env);
  if (config && Array.isArray(config.hours)) {
    const row = config.hours.find(h => h.staff_slug === barber && h.weekday === weekday);
    if (row && Array.isArray(row.ranges) && row.ranges.length > 0) {
      const ranges = [];
      for (const r of row.ranges) {
        const start = _hhmmToMinutes(r && r.start);
        const end   = _hhmmToMinutes(r && r.end);
        if (start != null && end != null && end > start) {
          ranges.push({ start, end });
        }
      }
      if (ranges.length > 0) return ranges;
    }
    // Riga assente/vuota per quel giorno ma config valida: nessun orario lavorativo.
    // Nota: il caso "tabella business_hours del tutto vuota" è coperto dal fallback
    // sotto (config null), così il seed mancante non blocca il booking.
  }

  return _fallbackWorkRanges(barber);
}

// Calendar ID: override DB (staff.calendar_id) se presente, altrimenti env CF.
// Firma resta sincrona e retro-compatibile: senza config DB usa solo le env.
// Per usare l'override DB passare un terzo arg `config` già caricato.
export function getCalendarId(barber, env, config) {
  if (config) {
    const s = _findStaff(config, barber);
    if (s && typeof s.calendar_id === 'string' && s.calendar_id.trim() !== '') {
      return s.calendar_id.trim();
    }
  }
  // Env fallback SOLO per barbieri con calendario Google configurato.
  // Barbieri "calendar-less" (es. Gabriele, in attesa account Google) → null:
  // niente fallback a Berlin, così book/available passano al path Supabase.
  if (barber === 'george') return env.GEORGE_CALENDAR_ID || null;
  if (barber === 'berlin') return env.BERLIN_CALENDAR_ID || null;
  return null;
}

export function getServiceAccount(barber, env) {
  if (barber === 'george') return { email: env.GEORGE_SERVICE_ACCOUNT_EMAIL, key: env.GEORGE_PRIVATE_KEY };
  if (barber === 'berlin') return { email: env.BERLIN_SERVICE_ACCOUNT_EMAIL, key: env.BERLIN_PRIVATE_KEY };
  return { email: null, key: null };
}

// Finestre occupate da Supabase per barbieri SENZA Google Calendar.
// Legge gli slot già prenotati (appointment_slots = specchio delle prenotazioni
// attive) e li trasforma in intervalli occupati [{start,end}] della durata
// dell'appuntamento. Stessa forma dell'output freeBusy di Google → il loop slot
// in available.js resta identico per entrambi i path.
export async function getBookedBusy(env, barber, date, tz, durationMin) {
  const url = SUPABASE_URL_PUBLIC;
  const key = SUPABASE_ANON_PUBLIC;
  const dur = Number.isFinite(durationMin) && durationMin > 0 ? durationMin : 60;
  try {
    const reqUrl = `${url}/rest/v1/appointment_slots`
      + `?select=time`
      + `&barber=eq.${encodeURIComponent(barber)}`
      + `&date=eq.${encodeURIComponent(date)}`;
    const r = await fetch(reqUrl, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    if (!r.ok) return [];
    const rows = await r.json();
    if (!Array.isArray(rows)) return [];
    return rows.map(row => {
      const t = String(row.time || '').slice(0, 5); // HH:MM
      if (!/^\d{2}:\d{2}$/.test(t)) return null;
      const startMs = new Date(`${date}T${t}:00${tz}`).getTime();
      if (Number.isNaN(startMs)) return null;
      return {
        start: new Date(startMs).toISOString(),
        end:   new Date(startMs + dur * 60000).toISOString(),
      };
    }).filter(Boolean);
  } catch {
    return [];
  }
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
