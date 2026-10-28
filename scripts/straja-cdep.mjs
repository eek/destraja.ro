#!/usr/bin/env node
// Proiectele aflate la Camera Deputaților: lista anului de pe cdep.ro și fișa fiecărui proiect, citite treptat.
// Scrie data/cdep/index.json (toate rândurile listei, cu stadiul), data/cdep/proiecte/<slug>.json (fișa citită) și
// data/cdep/comisii.json (adresa de e-mail a fiecărei comisii întâlnite pe fișe, pentru butonul „Scrie comisiei”).
//
//   node scripts/straja-cdep.mjs [--an=2026] [--max=50]
//
// PL-x și Pl-x au aceeași numerotare, deci slug-ul e plx-<nr>-<an> pentru amândouă. Un proiect venit de la Senat pe care
// îl urmărim deja (B…/L…) rămâne pe pagina lui; aici îl marcăm doar cu `senat`, ca să nu apară de două ori pe site.
// Fișele se citesc întâi pentru proiectele aflate acum la Cameră (comisii, raport, ordinea de zi), apoi celelalte, cel
// mult --max pe rulare, iar o fișă se recitește doar când lista îi arată alt stadiu. Așa umplem arhiva încet, fără
// să declanșăm firewall-ul Camerei.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CdepBlocked, committeeUrl, fetchCdep, listUrl, parseCommitteeEmail, parseList, parseSheet, sheetUrl } from './lib/cdep.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'cdep');
const SHEETS = path.join(DIR, 'proiecte');
const arg = (name, def) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? def;
const YEAR = +arg('an', new Date().getFullYear());
const MAX = +arg('max', 50);

// Stadiile din listă în care proiectul e chiar la Cameră și se mai poate interveni.
export const AT_CHAMBER = /^(la comisii|raport|pe ordinea de zi|în reexaminare|aviz|sesizare)/i;
const slugOf = (row) => `${row.tip.toLowerCase().replace(/[^a-z]/g, '')}-${row.nr}-${row.an}`.replace(/^pl(x)?-/, 'plx-');

fs.mkdirSync(SHEETS, { recursive: true });
const indexFile = path.join(DIR, 'index.json');
const previous = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : { proiecte: [] };
const before = new Map(previous.proiecte.map((p) => [p.slug, p]));

// Proiectele noastre de la Senat, după numărul L sau B, ca să le recunoaștem când ajung la Cameră.
const ours = new Map();
for (const b of JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'senat-bills.json'), 'utf8'))) {
  if (b.senatNr) ours.set(b.senatNr, b.slug);
  ours.set(b.id, b.slug);
}

let rows;
try {
  rows = parseList(await fetchCdep(listUrl('anp', YEAR))).filter((r) => r.tip !== 'BP');
} catch (err) {
  console.log(`✗ lista Camerei pe ${YEAR}: ${err.message}`);
  process.exit(err instanceof CdepBlocked ? 0 : 1);
}
if (rows.length < 50 && YEAR === new Date().getFullYear() && new Date().getMonth() > 2) throw new Error(`Lista Camerei are doar ${rows.length} rânduri; formatul s-a schimbat?`);

const index = rows.map((r) => {
  const slug = slugOf(r);
  const old = before.get(slug);
  return { slug, idp: r.idp, numar: r.numar, tip: r.tip, inregistrat: r.data, titlu: r.titlu, stadiu: r.stadiu, stadiuData: r.stadiuData, url: sheetUrl(r.idp), ...(old?.senat && { senat: old.senat }) };
});

// Ce fișe citim acum: cele lipsă sau cu stadiul schimbat; întâi cele aflate la Cameră, apoi cele mai noi.
const todo = index
  .filter((p) => {
    const file = path.join(SHEETS, `${p.slug}.json`);
    if (!fs.existsSync(file)) return true;
    const old = before.get(p.slug);
    return !old || old.stadiu !== p.stadiu || old.stadiuData !== p.stadiuData;
  })
  .sort((a, b) => Number(AT_CHAMBER.test(b.stadiu)) - Number(AT_CHAMBER.test(a.stadiu)) || b.inregistrat.localeCompare(a.inregistrat))
  .slice(0, MAX);

// Fișele deja citite primesc datele noi din listă (titlul, stadiul) fără o cerere în plus.
const ROW_KEYS = ['numar', 'tip', 'inregistrat', 'titlu', 'stadiu', 'stadiuData', 'url'];
const todoSlugs = new Set(todo.map((p) => p.slug));
for (const p of index) {
  const file = path.join(SHEETS, `${p.slug}.json`);
  if (todoSlugs.has(p.slug) || !fs.existsSync(file)) continue;
  const sheet = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (sheet.senat) p.senat = sheet.senat;
  if (ROW_KEYS.every((k) => sheet[k] === p[k])) continue;
  fs.writeFileSync(file, JSON.stringify({ ...sheet, ...Object.fromEntries(ROW_KEYS.map((k) => [k, p[k]])) }, null, 1) + '\n');
}

const committeesFile = path.join(DIR, 'comisii.json');
const committees = fs.existsSync(committeesFile) ? JSON.parse(fs.readFileSync(committeesFile, 'utf8')) : {};

let read = 0;
let note = '';
try {
  for (const p of todo) {
    const fisa = parseSheet(await fetchCdep(p.url));
    const senat = (fisa.numarSenat && ours.get(fisa.numarSenat)) || null;
    if (senat) p.senat = senat;
    fs.writeFileSync(path.join(SHEETS, `${p.slug}.json`), JSON.stringify({ ...p, cititLa: new Date().toISOString(), fisa }, null, 1) + '\n');
    read++;
    // Comisiile noi (sunt vreo 20 la Cameră): o cerere fiecare, o singură dată.
    for (const c of [...(fisa.comisii?.raport ?? []), ...(fisa.comisii?.aviz ?? [])]) {
      if (committees[c.idc]) continue;
      committees[c.idc] = { nume: c.nume, url: committeeUrl(c.idc), email: parseCommitteeEmail(await fetchCdep(committeeUrl(c.idc))) };
      fs.writeFileSync(committeesFile, JSON.stringify(committees, null, 1) + '\n');
    }
  }
} catch (err) {
  if (!(err instanceof CdepBlocked)) throw err;
  note = ` (${err.message})`;
}

fs.writeFileSync(indexFile, JSON.stringify({ an: YEAR, cititLa: new Date().toISOString(), proiecte: index }, null, 1) + '\n');
const atChamber = index.filter((p) => AT_CHAMBER.test(p.stadiu)).length;
const missing = index.filter((p) => !fs.existsSync(path.join(SHEETS, `${p.slug}.json`))).length;
console.log(`🏛️ Camera ${YEAR}: ${index.length} proiecte, ${atChamber} aflate acum la Cameră; ${read} fișe citite, ${missing} încă de citit${note}`);
