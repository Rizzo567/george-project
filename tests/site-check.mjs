// Verifier statico del sito nuovo: node tests/site-check.mjs (exit 1 = rosso)
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
const root = path.resolve(new URL('..', import.meta.url).pathname);
const errs = [];
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
for (const f of ['index.html','prenota.html','conferma.html','admin-mb26.html','support.js','star-field.js',
  'assets/vendor/react.production.min.js','assets/vendor/react-dom.production.min.js','assets/js/config.js','assets/js/track.js'])
  if (!fs.existsSync(path.join(root, f))) errs.push(`manca ${f}`);
for (const f of ['index.html','prenota.html','conferma.html']) {
  const s = read(f);
  if (/\.dc\.html/.test(s)) errs.push(`${f}: link a .dc.html`);
  for (const m of s.matchAll(/(?:src|href)="(assets\/[^"#?]+|\.\/[a-z-]+\.js)"/g)) {
    const p = m[1].replace(/^\.\//, '');
    if (!fs.existsSync(path.join(root, p))) errs.push(`${f}: asset mancante ${p}`);
  }
  for (const m of s.matchAll(/ props="(assets[^"]+)"/g)) for (const p of m[1].split(','))
    if (!fs.existsSync(path.join(root, p.trim()))) errs.push(`${f}: star-field asset mancante ${p}`);
  if (/unpkg\.com/.test(s.replace(/window\.__resources=\{[^}]*\}/, ''))) errs.push(`${f}: dipendenza unpkg fuori dalla mappa __resources`);
}
const p = read('prenota.html');
for (const need of ['/api/available?barber=', "fetch('/api/book'", "sessionStorage.setItem('mbooking'", "window.location.href = 'conferma.html'", 'apptId', 'MB_CONFIG']) if (!p.includes(need)) errs.push(`prenota.html: manca ${need}`);
if (!/<title>[^<]+<\/title>/.test(read('index.html'))) errs.push('index.html: manca <title>');
// conferma.html deve restare quella di prima
try { const d = execSync('git diff --stat HEAD -- conferma.html', { cwd: root }).toString().trim(); if (d) errs.push('conferma.html modificata: ' + d); } catch {}
// tiktok/video sotto 25 MiB (limite Pages)
for (const f of fs.readdirSync(path.join(root, 'assets/video'))) { const sz = fs.statSync(path.join(root, 'assets/video', f)).size; if (sz > 25 * 1024 * 1024) errs.push(`video troppo grande per Pages: ${f}`); }
if (errs.length) { console.log('ROSSO\n - ' + errs.join('\n - ')); process.exit(1); }
console.log('VERDE — sito coerente');
