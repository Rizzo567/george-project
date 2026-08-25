// Verifier per il fix stats del gestionale (KPI "Oggi" a 0 + grafici fermi al 13/08).
// Uso: node scripts/verify-stats.mjs   (legge .dev.vars: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
//
// Controlla che:
//   1. la paginazione .range() recuperi TUTTE le righe (PostgREST tronca a 1000)
//   2. il conteggio di oggi usi la data locale e coincida con la query filtrata
//   3. la serie a 14 giorni non sia piatta dopo la millesima riga
//   4. admin.js non usi più toISOString() per le date e usi .range()
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')])
);
const URL_ = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const pad2 = n => (n < 10 ? '0' : '') + n;
const dateStrLocal = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

let fails = 0;
const check = (name, ok, extra = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) fails++;
};

// Totale reale
const head = await fetch(`${URL_}/rest/v1/appointments?select=id&limit=1`, { headers: { ...H, Prefer: 'count=exact' } });
const total = Number(head.headers.get('content-range').split('/')[1]);

// 1. paginazione come in loadStatsData
const PAGE = 1000, acc = [];
for (let from = 0; from < 50000; from += PAGE) {
  const r = await fetch(`${URL_}/rest/v1/appointments?select=*&order=date.asc,time.asc&offset=${from}&limit=${PAGE}`, { headers: H });
  const rows = await r.json();
  acc.push(...rows);
  if (rows.length < PAGE) break;
}
check('paginazione recupera tutte le righe', acc.length === total, `${acc.length}/${total}`);
check('senza paginazione si perdono righe (bug riprodotto)', total > PAGE, `cap 1000 su ${total} righe`);

// 2. conteggio di oggi
const todayStr = dateStrLocal();
const rHead = await fetch(`${URL_}/rest/v1/appointments?select=id&date=eq.${todayStr}&limit=1`, { headers: { ...H, Prefer: 'count=exact' } });
const todayReal = Number(rHead.headers.get('content-range').split('/')[1]);
const todayCalc = acc.filter(r => r.date === todayStr).length;
check('KPI Oggi coincide con il DB', todayCalc === todayReal, `${todayCalc} vs ${todayReal}`);
check('KPI Oggi non è a zero se ci sono appuntamenti', todayReal === 0 || todayCalc > 0, `oggi ${todayStr}: ${todayCalc}`);

// 3. serie 14 giorni
const dates14 = [];
for (let d = 13; d >= 0; d--) { const x = new Date(); x.setDate(x.getDate() - d); dates14.push(dateStrLocal(x)); }
const series = dates14.map(ds => acc.filter(r => r.date === ds).length);
const capped = acc.slice(0, PAGE);
const seriesCapped = dates14.map(ds => capped.filter(r => r.date === ds).length);
check('serie 14gg non piatta con paginazione', series.some(v => v > 0), JSON.stringify(series));
check('serie 14gg era troncata senza paginazione', seriesCapped.reduce((a, b) => a + b, 0) < series.reduce((a, b) => a + b, 0),
      `${seriesCapped.reduce((a, b) => a + b, 0)} → ${series.reduce((a, b) => a + b, 0)} prenotazioni`);

// 4. controlli statici sul sorgente
const src = fs.readFileSync(new URL('../assets/js/admin.js', import.meta.url), 'utf8');
check('admin.js non usa più toISOString() per le date', !/toISOString\(\)\.slice\(0, *10\)/.test(src));
check('admin.js pagina le stats con .range()', /\.range\(from, from \+ PAGE - 1\)/.test(src));
const set = fs.readFileSync(new URL('../assets/js/admin-settings.js', import.meta.url), 'utf8');
check('admin-settings.js non usa più toISOString() per le date', !/toISOString\(\)\.slice\(0, *10\)/.test(set));

console.log(fails ? `\n${fails} controlli falliti` : '\nTutti i controlli passati');
process.exit(fails ? 1 : 0);
