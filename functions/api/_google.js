// Shared helpers — Google Apps Script bridge

export function getScriptUrl(barber, env) {
  return barber === 'george' ? env.GEORGE_SCRIPT_URL : env.BERLIN_SCRIPT_URL;
}

export const WORK_START = 9;
export const WORK_END = 19;
export const SLOT_MINUTES = 60;

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
