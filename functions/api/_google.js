// Google Calendar API helpers — due service account separati

export const SLOT_MINUTES = 30;
export const WORK_RANGES = [
  { start: 9 * 60,  end: 12 * 60 },
  { start: 13 * 60, end: 20 * 60 },
];

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
