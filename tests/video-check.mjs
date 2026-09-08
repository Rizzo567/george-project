// Verifier dei video del sito: file, faststart, peso, e byte-range dell'host.
//
//   node tests/video-check.mjs                       → controlla solo i file
//   node tests/video-check.mjs http://localhost:8788 → controlla anche l'host (206)
//
// Il 206 è la parte che conta: Safari su iPhone chiede sempre un Range e, se
// l'host risponde 200 col file intero, non riproduce niente.
import { readFileSync, statSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const MAX_MB = 8;
let fail = 0;
const ok = (n, c, d = '') => { if (!c) fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); };

const html = readFileSync(ROOT + 'index.html', 'utf8');
const paths = [...new Set([...html.matchAll(/assets\/video\/[A-Za-z0-9/_.-]+\.mp4/g)].map(m => m[0]))];
ok('index.html cita dei video', paths.length > 0, `${paths.length} file`);

/** L'ordine degli atom di primo livello: `moov` deve venire prima di `mdat`. */
function atoms(buf) {
  const out = [];
  let pos = 0;
  while (pos + 8 <= buf.length && out.length < 8) {
    let size = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    out.push(type);
    if (size === 1) size = Number(buf.readBigUInt64BE(pos + 8));
    if (size < 8) break;
    pos += size;
  }
  return out;
}

for (const p of paths) {
  const full = ROOT + p;
  let st;
  try { st = statSync(full); } catch { ok(`${p} esiste`, false); continue; }
  const mb = st.size / 1048576;
  ok(`${p} pesa ≤ ${MAX_MB} MB`, mb <= MAX_MB, `${mb.toFixed(2)} MB`);
  const head = readFileSync(full).subarray(0, Math.min(st.size, 4 * 1024 * 1024));
  const a = atoms(head);
  const iMoov = a.indexOf('moov'), iMdat = a.indexOf('mdat');
  ok(`${p} faststart (moov prima di mdat)`, iMoov >= 0 && (iMdat === -1 || iMoov < iMdat), a.join('->'));
}

const base = process.argv[2];
if (base) {
  for (const p of paths) {
    const url = `${base.replace(/\/$/, '')}/${p}`;
    let r;
    try { r = await fetch(url, { headers: { Range: 'bytes=0-99' } }); } catch (e) { ok(`${p} raggiungibile`, false, String(e)); continue; }
    const cr = r.headers.get('content-range') || '';
    ok(`${p} risponde 206 al Range`, r.status === 206, `HTTP ${r.status} ${cr}`);
    ok(`${p} content-range coerente`, /^bytes 0-99\/\d+$/.test(cr), cr || '(assente)');
    ok(`${p} accept-ranges: bytes`, (r.headers.get('accept-ranges') || '') === 'bytes');
  }
}

console.log(fail ? `\n${fail} controlli falliti` : '\nTutti i controlli passati');
process.exit(fail ? 1 : 0);
