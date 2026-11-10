#!/usr/bin/env node
// Proiectele aflate la Camera Deputaților: lista anului de pe cdep.ro și fișa fiecărui proiect, citite treptat.
// Scrie data/cdep/index.json (toate rândurile listei, cu stadiul), data/cdep/proiecte/<slug>.json (fișa citită) și
// data/cdep/comisii.json (adresa de e-mail a fiecărei comisii întâlnite pe fișe, pentru butonul „Scrie comisiei”).
// Urmărește la fel și anul dinainte (lista în fiecare zi, aceleași recitiri, aceeași coadă pe VM), scris în
// data/cdep/ani/<an>.json cu proiectele aflate la Cameră și cu cele urmărite deja: la 1 ianuarie, proiectele anului
// încheiat rămân aici încă un an și abia apoi trec la straja-cdep-vechi.mjs (currentYears din lib/cdep-index.mjs).
//
//   node scripts/straja-cdep.mjs [--an=2026] [--max=50]     (--max=0: doar ce a citit VM-ul, fără nicio fișă cerută de aici)
//
// PL-x și Pl-x au aceeași numerotare, deci slug-ul e plx-<nr>-<an> pentru amândouă. Un proiect venit de la Senat pe care
// îl urmărim deja (B…/L…) rămâne pe pagina lui; aici îl marcăm doar cu `senat`, ca să nu apară de două ori pe site.
// Fișele se citesc întâi pentru proiectele aflate acum la Cameră (comisii, raport, ordinea de zi), apoi celelalte, cel
// mult --max pe rulare. O fișă se recitește când lista îi arată alt stadiu și, fiindcă lista nu arată un aviz primit,
// un raport depus sau un termen mutat, și după ședințele de comisie, la termene și la intervale care țin de vârsta
// proiectului (lib/cdep-reread.mjs). Recitirile le face întâi VM-ul destraja; aici ajung doar cele rămase necitite.
// Așa ținem arhiva la zi fără să declanșăm firewall-ul Camerei.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CdepBlocked, committeeUrl, fetchCdep, fromMirror, listUrl, parseCommitteeEmail, parseList, parseSheet, sheetUrl } from './lib/cdep.mjs';
import { AT_CHAMBER, currentYears, oldYearsDir } from './lib/cdep-index.mjs';
import { mirrorFetchedAt, peerEnabled, syncMirror, vmCall } from './lib/cdep-peer.mjs';
import { byUrgency, dayOf, readHere, readMeetings, rereadDue, rereadSummary } from './lib/cdep-reread.mjs';
import { writeFileAtomic } from './lib/atomic.mjs';
import { todayBucharest } from './lib/web.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'cdep');
const SHEETS = path.join(DIR, 'proiecte');
const HTML_CACHE = path.join(ROOT, '.cache', 'cdep-html');
const arg = (name, def) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? def;
const YEAR = +arg('an', new Date().getFullYear());
const [, LAST] = currentYears(YEAR);
const MAX = +arg('max', 50);

const slugOf = (row) => `${row.tip.toLowerCase().replace(/[^a-z]/g, '')}-${row.nr}-${row.an}`.replace(/^pl(x)?-/, 'plx-');

fs.mkdirSync(SHEETS, { recursive: true });
fs.mkdirSync(HTML_CACHE, { recursive: true });
const indexFile = path.join(DIR, 'index.json');
const lastFile = path.join(oldYearsDir(path.join(ROOT, 'data')), `${LAST}.json`);
const rowsIn = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).proiecte : []);
// Rândurile de la rularea trecută, din amândouă fișierele: în prima rulare a anului, proiectele anului încheiat sunt
// încă în index.json.
const before = new Map([...rowsIn(indexFile), ...rowsIn(lastFile)].map((p) => [p.slug, p]));

// Proiectele noastre de la Senat, după numărul L sau B, ca să le recunoaștem când ajung la Cameră.
const ours = new Map();
for (const b of JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'senat-bills.json'), 'utf8'))) {
  if (b.senatNr) ours.set(b.senatNr, b.slug);
  ours.set(b.id, b.slug);
}

// Listele celor doi ani. Fără amândouă nu scriem și nu trimitem nimic: coada trimisă VM-ului o înlocuiește pe cea de
// ieri, deci una făcută dintr-un singur an le-ar scoate din ea pe ale celuilalt.
const lists = {};
let reading = YEAR;
try {
  for (reading of [YEAR, LAST]) lists[reading] = parseList(await fetchCdep(listUrl('anp', reading))).filter((r) => r.tip !== 'BP');
} catch (err) {
  console.log(`✗ lista Camerei pe ${reading}: ${err.message}`);
  process.exit(err instanceof CdepBlocked ? 0 : 1);
}
// În ianuarie lista anului în curs e goală sau scurtă (cdep.ro răspunde cu pagina obișnuită, fără rânduri); a anului
// trecut e întreagă.
if (lists[YEAR].length < 50 && YEAR === new Date().getFullYear() && new Date().getMonth() > 2) throw new Error(`Lista Camerei pe ${YEAR} are doar ${lists[YEAR].length} rânduri; formatul s-a schimbat?`);
if (lists[LAST].length < 50) throw new Error(`Lista Camerei pe ${LAST} are doar ${lists[LAST].length} rânduri; formatul s-a schimbat?`);
// O listă nu se scurtează (proiectele încheiate rămân în ea): una cu mai puține rânduri decât cele știute e o pagină de
// eroare, iar în primele luni ale anului pragul de mai sus n-o prinde.
for (const y of [YEAR, LAST]) {
  const had = [...before.keys()].filter((slug) => slug.endsWith(`-${y}`)).length;
  if (lists[y].length < had * 0.9) throw new Error(`Lista Camerei pe ${y} are ${lists[y].length} rânduri, iar noi știam ${had}; formatul s-a schimbat?`);
}

const rowOf = (r) => {
  const slug = slugOf(r);
  const old = before.get(slug);
  return { slug, idp: r.idp, numar: r.numar, tip: r.tip, inregistrat: r.data, titlu: r.titlu, stadiu: r.stadiu, stadiuData: r.stadiuData, url: sheetUrl(r.idp), ...(old?.senat && { senat: old.senat }) };
};
// Anul în curs: toate rândurile listei. Anul trecut, ca la anii dinainte (straja-cdep-vechi.mjs): proiectele aflate acum
// la Cameră și cele urmărite deja sau cu fișa citită. La 1 ianuarie sunt toate cele din index.json de până atunci, deci
// niciun proiect nu-și pierde pagina.
const index = lists[YEAR].map(rowOf);
const last = lists[LAST].map(rowOf).filter((p) => AT_CHAMBER.test(p.stadiu) || before.has(p.slug) || fs.existsSync(path.join(SHEETS, `${p.slug}.json`)));
const all = [...index, ...last];

// Consultarea publică de la Cameră nu schimbă stadiul din listă, dar numărul de propuneri crește: cât e deschisă, fișa
// se recitește o dată pe zi. Fișele citite înainte să urmărim consultarea se recitesc o dată, dacă proiectul e recent
// și Camera e prima sesizată (doar atunci are consultare).
const today = todayBucharest();
const sheetOf = (slug) => {
  const file = path.join(SHEETS, `${slug}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
};
const consultationDue = (p) => {
  const sheet = sheetOf(p.slug);
  if (!sheet?.fisa) return false;
  const c = sheet.fisa.consultare;
  if (c === undefined) return /^Senat/i.test(sheet.fisa.cameraDecizionala ?? '') && Date.now() - Date.parse(p.inregistrat) < 75 * 86_400_000;
  return Boolean(c?.termen && c.termen >= today && Date.now() - Date.parse(sheet.cititLa ?? 0) > 20 * 3_600_000);
};

// Fișele citite pe 28–29 octombrie 2026, cu un cititor care pierdea partidele când semnează doar deputați („- PSD:”):
// le recitim, ca etichetele de partid și scorurile parlamentarilor să fie din nou corecte.
const partiesLost = (p) => {
  const list = sheetOf(p.slug)?.fisa?.initiatori ?? [];
  return list.length > 1 && list.every((i) => !i.partid);
};

// Ce fișe citim acum: cele lipsă, cu stadiul schimbat sau în consultare; întâi cele aflate la Cameră, apoi cele mai noi.
// Stadiul se compară cu cel din fișa citită, nu cu indexul de ieri: o fișă schimbată care nu încape azi în --max rămâne
// de citit (până pe 6 noiembrie, indexul se rescria cu stadiul nou și fișa era uitată).
// Fișele citite deja de VM (din copia locală, vezi lib/cdep.mjs) nu se numără la --max.
const keyOf = (p) => `${p.stadiu}|${p.stadiuData ?? ''}`;
const todo = all
  .filter((p) => {
    const sheet = sheetOf(p.slug);
    if (!sheet) return true;
    return sheet.stadiu !== p.stadiu || sheet.stadiuData !== p.stadiuData || consultationDue(p) || partiesLost(p);
  })
  .sort((a, b) => Number(AT_CHAMBER.test(b.stadiu)) - Number(AT_CHAMBER.test(a.stadiu)) || b.inregistrat.localeCompare(a.inregistrat));

// Recitirile: fișe cărora lista nu le arată alt stadiu, dar au avut ședință de comisie, li s-a împlinit un termen sau
// n-au mai fost citite de mult. Vin după cele de mai sus, cele mai grabnice întâi.
const meetings = readMeetings(path.join(ROOT, 'data'));
const rereads = new Map();
{
  const first = new Set(todo.map((p) => p.slug));
  for (const p of all) {
    const due = first.has(p.slug) ? null : rereadDue(sheetOf(p.slug), { today, meetings: meetings.get(p.slug) });
    if (due) rereads.set(p.slug, due);
  }
}
const queue = [...todo, ...all.filter((p) => rereads.has(p.slug)).sort((a, b) => byUrgency(rereads.get(a.slug), rereads.get(b.slug)))];

// Fișele deja citite primesc datele noi din listă (titlul, stadiul) fără o cerere în plus.
const ROW_KEYS = ['numar', 'tip', 'inregistrat', 'titlu', 'stadiu', 'stadiuData', 'url'];
const todoSlugs = new Set(todo.map((p) => p.slug));
for (const p of all) {
  const file = path.join(SHEETS, `${p.slug}.json`);
  if (todoSlugs.has(p.slug) || !fs.existsSync(file)) continue;
  const sheet = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (sheet.senat) p.senat = sheet.senat;
  if (ROW_KEYS.every((k) => sheet[k] === p[k])) continue;
  writeFileAtomic(file, JSON.stringify({ ...sheet, ...Object.fromEntries(ROW_KEYS.map((k) => [k, p[k]])) }, null, 1) + '\n');
}

const committeesFile = path.join(DIR, 'comisii.json');
const committees = fs.existsSync(committeesFile) ? JSON.parse(fs.readFileSync(committeesFile, 'utf8')) : {};

// Copia VM-ului pentru o fișă din coadă: citită pentru același stadiu și mai nouă decât fișa noastră (copia rămâne pe
// loc câteva zile și după ce am luat-o); la o recitire, din ziua scadentă încoace.
const vmCopy = async (p) => {
  const sheet = sheetOf(p.slug);
  const html = await fromMirror(p.url, { key: keyOf(p), since: rereads.get(p.slug)?.zi ?? dayOf(sheet?.cititLa) ?? p.inregistrat });
  if (html == null || !sheet?.cititLa) return html;
  return Date.parse(mirrorFetchedAt(p.url)) > Date.parse(sheet.cititLa) ? html : null;
};
// Ce citim aici: fișele noi sau cu alt stadiu și recitirile rămase necitite, cel mult --max. Restul îl primește VM-ul
// chiar de acum, ca să citească în timp ce citim și noi.
const here = new Set();
for (const p of queue) {
  if (here.size >= MAX) break;
  const due = rereads.get(p.slug);
  if ((!due || !peerEnabled || readHere(due, today)) && (await vmCopy(p)) == null) here.add(p.slug);
}
const toVm = (rows) => [...new Map(rows.map((p) => [p.slug, { slug: p.slug, url: p.url, key: keyOf(p) }])).values()];
{
  // Mereu, și cu o coadă goală: copiile tocmai aduse de pe VM ies așa din coada lui, altfel le-ar citi a doua oară.
  const rest = [];
  for (const p of queue) if (!here.has(p.slug) && (await vmCopy(p)) == null) rest.push(p);
  await vmCall('push', { source: 'curent', queue: toVm(rest) }, { timeoutMs: 120_000 });
}

let read = 0;
let fromVm = 0;
let note = '';
const done = new Set();
/** Fișa `p` din copia VM-ului, când o are; altfel de la cdep.ro, dacă e una dintre cele alese pentru aici. */
async function take(p) {
  const cached = await vmCopy(p);
  if (cached == null && !here.has(p.slug)) return;
  // Copia VM-ului a fost deja căutată, pentru stadiul din listă: cererea de aici nu se mulțumește cu una mai veche.
  const html = cached ?? (await fetchCdep(p.url, { fresh: true }));
  if (cached == null) read++;
  else fromVm++;
  // Păstrăm și HTML-ul o săptămână: straja-amendments îl refolosește în loc să ceară fișa a doua oară.
  writeFileAtomic(path.join(HTML_CACHE, `${p.slug}.html`), html);
  const fisa = parseSheet(html);
  const senat = (fisa.numarSenat && ours.get(fisa.numarSenat)) || null;
  if (senat) p.senat = senat;
  // `cititLa` e momentul în care pagina a fost cerută de la cdep.ro, și când a cerut-o VM-ul.
  const cititLa = (cached != null && mirrorFetchedAt(p.url)) || new Date().toISOString();
  writeFileAtomic(path.join(SHEETS, `${p.slug}.json`), JSON.stringify({ ...p, cititLa, fisa }, null, 1) + '\n');
  done.add(p.slug);
  // Comisiile noi (sunt vreo 20 la Cameră): o cerere fiecare, o singură dată.
  for (const c of [...(fisa.comisii?.raport ?? []), ...(fisa.comisii?.aviz ?? [])]) {
    if (committees[c.idc]) continue;
    committees[c.idc] = { nume: c.nume, url: committeeUrl(c.idc), email: parseCommitteeEmail(await fetchCdep(committeeUrl(c.idc))) };
    writeFileAtomic(committeesFile, JSON.stringify(committees, null, 1) + '\n');
  }
}
// Două treceri: întâi coada, cu cererile de aici; apoi, dacă a durat, doar ce a citit VM-ul între timp. Fără a doua,
// fișele acelea s-ar întoarce în coada lui și le-ar citi încă o dată.
const started = Date.now();
for (const again of [false, true]) {
  try {
    if (again) {
      if (!peerEnabled || Date.now() - started < 2 * 60_000 || queue.every((p) => done.has(p.slug))) break;
      if (!(await syncMirror({ force: true }))) break;
      here.clear();
    }
    for (const p of queue) if (!done.has(p.slug)) await take(p);
  } catch (err) {
    // Captcha sau rețea căzută (DNS, conexiune întreruptă): păstrăm ce am citit și scriem indexul; restul la rularea următoare.
    const network = err?.cause?.code && /^(ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|UND_ERR_)/.test(err.cause.code);
    if (!(err instanceof CdepBlocked) && !network) throw err;
    note ||= ` (${network ? `rețea: ${err.cause.code}` : err.message})`;
  }
}
// Ce a rămas necitit, și din cele pe care voiam să le citim aici, e al VM-ului.
const left = queue.filter((p) => !done.has(p.slug));

// VM-ul destraja citește peste zi ce n-a încăput azi, recitește lista anului la 3 ore și pune singur în coadă fișele
// cu alt stadiu decât cel știut de noi (scripts/vm/cdep-vm.mjs); mâine le luăm din copia locală, fără cereri.
// Coada lui „auto” ține schimbările unei singure liste (fiecare citire o înlocuiește), așa că lista anului trecut o
// recitește doar pentru copia locală: stadiile ei noi le vedem aici la rularea următoare, fără nicio cerere, și pleacă
// în coada de mai sus. 'copie' trebuie trimis: fără el, lista ar rămâne pe VM cu 'curent', de când era a anului în curs.
const known = Object.fromEntries(all.filter((p) => sheetOf(p.slug)?.stadiu === p.stadiu && sheetOf(p.slug)?.stadiuData === p.stadiuData).map((p) => [p.slug, keyOf(p)]));
await vmCall(
  'push',
  {
    source: 'curent',
    queue: toVm(left),
    lists: [YEAR, LAST].map((y) => ({ slug: `lista-anp-${y}`, url: listUrl('anp', y), everyMs: 3 * 3_600_000, parse: y === YEAR ? 'curent' : 'copie' })),
    known,
  },
  { timeoutMs: 120_000 },
);

// Anul trecut întâi: dacă rularea se oprește între cele două scrieri, în prima zi a anului, proiectele anului încheiat
// sunt în amândouă fișierele (cine le citește le ia o singură dată, după slug), nu în niciunul.
const writtenAt = new Date().toISOString();
fs.mkdirSync(path.dirname(lastFile), { recursive: true });
writeFileAtomic(lastFile, JSON.stringify({ an: LAST, cititLa: writtenAt, randuri: lists[LAST].length, proiecte: last }, null, 1) + '\n');
writeFileAtomic(indexFile, JSON.stringify({ an: YEAR, cititLa: writtenAt, proiecte: index }, null, 1) + '\n');
const atChamber = all.filter((p) => AT_CHAMBER.test(p.stadiu)).length;
const missing = all.filter((p) => !fs.existsSync(path.join(SHEETS, `${p.slug}.json`))).length;
const reread = [...rereads.keys()].filter((slug) => done.has(slug)).length;
console.log(
  `🏛️ Camera ${YEAR}: ${index.length} proiecte, plus ${last.length} urmărite din ${LAST}; ${atChamber} aflate acum la Cameră; ${read} fișe citite aici, ${fromVm} de la VM, ${left.length} lăsate VM-ului, ${missing} încă de citit; ` +
    `${rereadSummary([...rereads.values()])}${rereads.size ? `, ${reread} făcute acum` : ''}${note}`,
);
