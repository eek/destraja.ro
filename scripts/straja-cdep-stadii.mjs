#!/usr/bin/env node
// Stadiul fiecărui proiect înregistrat la Camera Deputaților, pe ani, pentru pagina /uitate: din lista anului de pe
// cdep.ro (o cerere pe an) păstrăm toate rândurile, nu doar pe cele încă în dezbatere (cum face straja-cdep-vechi.mjs în
// data/cdep/ani). Fără ele nu știm câte proiecte din 2020–2025 au devenit legi sau au fost respinse.
//
//   node scripts/straja-cdep-stadii.mjs [--ani=2020,2021] [--din=director-cu-anp-AAAA.html]
//
// Implicit anii 2020 – anul trecut: anul curent are deja toate rândurile în data/cdep/index.json (straja-cdep.mjs).
// Scrie data/cdep/stadii/<an>.json: { an, cititLa, randuri, proiecte: [{ slug, numar, inregistrat, stadiu, stadiuData }] }.
// Cererile trec prin fetchCdep din lib/cdep.mjs: întâi copia citită de VM (o listă din ultimele 6 ore), apoi ritmul comun
// tuturor proceselor (o cerere pe minut, cel mult 60 pe oră, două ore de pauză după un captcha). În orele în care Mac-ul e
// pe drum (zilele lucrătoare, 08:00–09:20) nu cere nimic. Cu --din citește HTML-ul salvat, fără nicio cerere.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CdepBlocked, fetchCdep, listUrl, parseList } from './lib/cdep.mjs';
import { FIRST_YEAR } from './lib/cdep-index.mjs';
import { writeFileAtomic } from './lib/atomic.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'cdep', 'stadii');
const arg = (name, def) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? def;
const thisYear = new Date().getFullYear();
const YEARS = arg('ani', '')
  ? arg('ani').split(',').map(Number)
  : Array.from({ length: thisYear - FIRST_YEAR }, (_, i) => FIRST_YEAR + i);
const FROM = arg('din', '');
const slugOf = (row) => `${row.tip.toLowerCase().replace(/[^a-z]/g, '')}-${row.nr}-${row.an}`.replace(/^pl(x)?-/, 'plx-');
const log = (line) => console.log(`[${new Date().toLocaleTimeString('ro-RO', { timeZone: 'Europe/Bucharest' })}] ${line}`);

/** Minute până la 09:20, dacă suntem într-o zi lucrătoare între 08:00 și 09:20 la București (Mac-ul e pe drum). */
function commute(now = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  if (p.weekday === 'Sat' || p.weekday === 'Sun') return false;
  const m = +p.hour * 60 + +p.minute;
  return m >= 8 * 60 && m < 9 * 60 + 20;
}

fs.mkdirSync(DIR, { recursive: true });
for (const year of YEARS) {
  let html;
  let cititLa = new Date().toISOString();
  if (FROM) {
    const file = path.join(FROM, `anp-${year}.html`);
    if (!fs.existsSync(file)) {
      log(`${year}: lipsește ${file}`);
      continue;
    }
    html = fs.readFileSync(file, 'utf8');
    cititLa = fs.statSync(file).mtime.toISOString();
  } else {
    if (commute()) {
      log('Mac-ul e pe drum (08:00–09:20): nu cerem nimic acum');
      break;
    }
    try {
      html = await fetchCdep(listUrl('anp', year));
    } catch (err) {
      if (err instanceof CdepBlocked) {
        log(err.message);
        break;
      }
      throw err;
    }
  }
  const rows = parseList(html).filter((r) => r.tip !== 'BP');
  // O listă goală înseamnă alt format sau o eroare a site-ului: păstrăm ce aveam.
  if (!rows.length) throw new Error(`lista Camerei pe ${year} n-are niciun rând; formatul s-a schimbat?`);
  const proiecte = rows.map((r) => ({ slug: slugOf(r), numar: r.numar, inregistrat: r.data, stadiu: r.stadiu, stadiuData: r.stadiuData }));
  writeFileAtomic(path.join(DIR, `${year}.json`), JSON.stringify({ an: year, cititLa, randuri: rows.length, proiecte }, null, 1) + '\n');
  log(`${year}: ${rows.length} proiecte`);
}
