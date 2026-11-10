#!/usr/bin/env node
// Pe VM-ul destraja: descarcă ordinile de zi ale Camerei Deputaților, ca Mac-ul să le găsească gata și în zilele în care
// nu rulează (sâmbăta, duminica, laptopul închis): cele două pagini cu ședințele comisiilor, PDF-urile ordinilor de zi,
// programul de lucru și ordinea de zi a fiecărei ședințe de plen a Camerei (ședințele comune cu Senatul vin de pe
// senat.ro). Aici doar se descarcă: textul PDF-urilor (cu OCR la scanări), numerele de proiect și fișierele din
// data/agenda/camera le face scripts/straja-cdep-agenda.mjs pe Mac, care își ia de aici, prin ssh și tar, ce e mai nou
// decât are și nu mai cere el aceleași pagini.
//
//   node scripts/vm/cdep-agenda-vm.mjs [--max=20] [--minute=40] [--fara-cereri]
//
// Pornit de destraja-cdep-agenda.timer, la trei ore (scripts/vm/install-cdep-agenda-vm.sh). Stă în ~/cdep-vm, lângă
// cititorul fișelor (cdep-vm.mjs), și cere prin același scripts/lib/cdep.mjs, deci cu același registru al cererilor
// (~/cdep-vm/.cache/cdep-last-request): o cerere pe minut și 60 pe oră cu totul, nu pe fiecare cititor, și aceeași pauză
// de două ore după un captcha. Ca serviciul destraja-cdep, lasă rândul Mac-ului cât acesta cere de pe același IP.
//
// În ~/cdep-vm/agenda:
//   sedinte.html, sedinte-trecute.html   paginile cu ședințele comisiilor, cum au venit
//   pdf/F<id>.pdf                        ordinile de zi ale comisiilor
//   plen/program.html, plen/oz-<oid>.html  programul de lucru și ordinile de zi ale plenului
//   index.json                           ce s-a citit și când: { liste, docs, plen }
//   known.json                           ce are deja Mac-ul ({ docs: { id: ora }, oz: { oid: ora } }), scris de el la fiecare
//                                        aducere: ce a citit singur cât VM-ul a fost oprit nu se mai descarcă aici
//   citiri.jsonl                         o linie pe rulare
// --fara-cereri arată ce ar descărca acum, din copiile de aici, fără nicio cerere.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CdepBlocked, fetchCdep, fetchCdepFile } from '../lib/cdep.mjs';
import { MEETINGS_URL, PAST_MEETINGS_URL, PLENARY_PROGRAM_URL, isMeetingsPage, isPlenaryPage, isProgramPage, parseMeetings, parseProgram, plenaryUrl } from '../lib/cdep-agenda.mjs';
import { writeFileAtomic } from '../lib/atomic.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STATE = path.join(ROOT, 'state');
const OUT = path.join(ROOT, 'agenda');
const PDFS = path.join(OUT, 'pdf');
const PLEN = path.join(OUT, 'plen');
const INDEX = path.join(OUT, 'index.json');

const arg = (name, def) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? def;
const MAX = +arg('max', 20);
const MINUTES = +arg('minute', 40);
const OFFLINE = process.argv.includes('--fara-cereri');

const MIN = 60_000;
const HEARTBEAT_MS = 3 * MIN;
// Paginile cu ședințe și programul plenului se recitesc la fiecare pornire a timerului, dar nu și la o pornire de mână
// venită imediat după.
const LIST_EVERY_MS = 2 * 60 * MIN;
// Ca pe Mac (straja-cdep-agenda.mjs): în ziua ședinței ordinea de zi se mai descarcă o dată; una care nu vine se mai
// încearcă de două ori, apoi peste trei zile.
const FRESH_MS = 20 * 60 * MIN;
const TRIES = 3;
const RETRY_AFTER_MS = 3 * 86_400_000;
// Ce a ieșit din paginile cdep.ro mai stă aici atât, pentru un Mac care n-a mai trecut de câteva zile.
const KEEP_MS = 10 * 86_400_000;

const started = Date.now();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
const log = (line) => console.log(`[${new Date().toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' })}] ${line}`);
const readJson = (f, def = null) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return def;
  }
};
const readText = (f) => {
  try {
    return fs.readFileSync(f, 'utf8');
  } catch {
    return '';
  }
};
const age = (iso) => (iso ? Date.now() - Date.parse(iso) : Infinity);

for (const dir of [STATE, PDFS, PLEN]) fs.mkdirSync(dir, { recursive: true });
// index.liste[<nume>] = ora citirii; index.docs[<id>] = { url, nume, la, sha1, octeti, ratat }; index.plen = { program, oz: { <oid>: { la, sha1 } } }
const index = { liste: {}, docs: {}, ...readJson(INDEX, {}) };
index.plen = { oz: {}, ...index.plen };
const saveIndex = () => writeFileAtomic(INDEX, JSON.stringify(index));
const known = { docs: {}, oz: {}, ...readJson(path.join(OUT, 'known.json'), {}) };
// Jurnalul cererilor ținut de cdep-vm.mjs, în aceeași formă: ora, cine, ce.
const note = (what) => fs.appendFileSync(path.join(STATE, 'requests.log'), `${new Date().toISOString()} vm agenda:${what}\n`);

/** Ca holdReason din cdep-vm.mjs: cât Mac-ul a cerut ceva de pe același IP în ultimele 3 minute, rândul e al lui. */
function macAsking() {
  const lease = readJson(path.join(STATE, 'lease.json'), {});
  const ip = readJson(path.join(STATE, 'ip.json'), {}).ip ?? null;
  const beat = readJson(path.join(STATE, 'heartbeat.json'), {});
  return (!lease.macIp || !ip || lease.macIp === ip) && Date.now() - (beat.at ?? 0) < HEARTBEAT_MS;
}

let requests = 0;
let stop = '';
/** Rândul nostru la cdep.ro; false când rularea s-a terminat (timpul, sau un captcha la o cerere de dinainte). */
async function turn() {
  let shown = false;
  for (;;) {
    if (stop) return false;
    if (Date.now() - started > MINUTES * MIN) {
      stop = `cele ${MINUTES} de minute s-au dus`;
      return false;
    }
    if (!macAsking()) return true;
    if (!shown) log('pauză: Mac-ul cere de pe același IP');
    shown = true;
    await sleep(30_000);
  }
}

/** O pagină HTML, păstrată doar dacă arată ca pagina așteptată; null când n-a venit. */
async function page(url, file, what, looksRight) {
  if (!(await turn())) return null;
  try {
    requests++;
    const html = await fetchCdep(url, { fresh: true });
    note(what);
    if (!looksRight(html)) {
      log(`${what}: pagina nu arată cum o știm; rămâne copia dinainte`);
      return null;
    }
    writeFileAtomic(file, html);
    return html;
  } catch (err) {
    if (err instanceof CdepBlocked) {
      note(`captcha ${what}`);
      stop = err.message;
    } else {
      log(`${what}: ${err.message}${err?.cause?.code ? ` (${err.cause.code})` : ''}`);
    }
    return null;
  }
}

// ─── Ședințele comisiilor ─────────────────────────────────────────────────────────────────────────────────────────
const LISTS = [
  { name: 'sedinte', url: MEETINGS_URL },
  { name: 'sedinte-trecute', url: PAST_MEETINGS_URL },
];
let listsRead = 0;
for (const l of LISTS) {
  if (OFFLINE || age(index.liste[l.name]) < LIST_EVERY_MS) continue;
  if (await page(l.url, path.join(OUT, `${l.name}.html`), l.name, isMeetingsPage)) {
    index.liste[l.name] = new Date().toISOString();
    listsRead++;
    saveIndex();
  }
}

// PDF-urile din cele două pagini, fără zilele de studiu (pe care nici Mac-ul nu le citește).
const wanted = new Map(); // id → { url, id, nume, zile: Set, studiu }
for (const l of LISTS) {
  for (const m of parseMeetings(readText(path.join(OUT, `${l.name}.html`)))) {
    for (const p of m.pdfs) {
      if (!wanted.has(p.id)) wanted.set(p.id, { ...p, zile: new Set(), studiu: true });
      const w = wanted.get(p.id);
      w.zile.add(m.zi);
      if (!m.studiu) w.studiu = false;
    }
  }
}
/** Când a fost citit ultima dată, aici sau pe Mac. */
const haveAt = (id) => [index.docs[id]?.la, known.docs[id]].filter(Boolean).sort().at(-1) ?? null;
const failedLately = (d) => d?.ratat && d.ratat.n >= TRIES && age(d.ratat.la) < RETRY_AFTER_MS;
const firstDay = (w) => [...w.zile].sort()[0];
const lastDay = (w) => [...w.zile].sort().at(-1);
const meetings = [...wanted.values()].filter((w) => !w.studiu);
const unread = meetings.filter((w) => !haveAt(w.id) && !failedLately(index.docs[w.id]));
const queue = [
  // Ședințele de azi încolo, cele mai apropiate întâi.
  ...unread.filter((w) => lastDay(w) >= today).sort((a, b) => firstDay(a).localeCompare(firstDay(b))),
  // Ordinea de zi a ședințelor de azi, încă o dată.
  ...meetings.filter((w) => w.zile.has(today) && haveAt(w.id) && age(haveAt(w.id)) > FRESH_MS),
  // Ședințele trecute, cele mai noi întâi.
  ...unread.filter((w) => lastDay(w) < today).sort((a, b) => lastDay(b).localeCompare(lastDay(a))),
];

// ─── Plenul ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Programul de lucru spune ce ședințe de plen are săptămâna; ordinea de zi a fiecăreia se citește o dată și apoi o dată
// pe zi până trece ședința (proiectul de ordine de zi se schimbă până la aprobare).
const programFile = path.join(PLEN, 'program.html');
let plenRead = 0;
if (!OFFLINE && age(index.plen.program) >= LIST_EVERY_MS && (await page(PLENARY_PROGRAM_URL, programFile, 'plen-program', isProgramPage))) {
  index.plen.program = new Date().toISOString();
  saveIndex();
}
const program = parseProgram(readText(programFile), { today });
// Fără ședințele comune cu Senatul, pe care le avem de pe senat.ro; o ordine de zi ținută două zile se citește o dată.
const sittings = program.sedinte.filter((s, i, all) => !s.comuna && all.findIndex((o) => o.oid === s.oid) === i);
const ozAt = (oid) => [index.plen.oz[oid]?.la, known.oz[oid]].filter(Boolean).sort().at(-1) ?? null;
const lastSitting = (oid) => program.sedinte.filter((s) => s.oid === oid).map((s) => s.zi).sort().at(-1);
const plenQueue = sittings.filter((s) => !ozAt(s.oid) || (lastSitting(s.oid) >= today && age(ozAt(s.oid)) > FRESH_MS));

if (OFFLINE) {
  console.log(`${meetings.length} ordini de zi ale comisiilor în program; de descărcat acum: ${queue.length}`);
  for (const w of queue) console.log(`  ${firstDay(w)} F${w.id} ${w.nume}${haveAt(w.id) ? ' (din nou, e ședința de azi)' : ''}`);
  console.log(`${sittings.length} ședințe de plen ale Camerei în program; de citit acum: ${plenQueue.length}`);
  for (const s of plenQueue) console.log(`  ${s.zi} oid ${s.oid} ${s.nume}`);
  process.exit(0);
}

for (const s of plenQueue) {
  const html = await page(plenaryUrl(s.oid), path.join(PLEN, `oz-${s.oid}.html`), `plen-${s.oid}`, isPlenaryPage);
  if (stop) break;
  if (!html) continue;
  index.plen.oz[s.oid] = { la: new Date().toISOString(), sha1: sha1(html) };
  plenRead++;
  saveIndex();
}

// ─── PDF-urile comisiilor ─────────────────────────────────────────────────────────────────────────────────────────
let tried = 0;
let downloaded = 0;
for (const w of queue) {
  if (tried >= MAX || !(await turn())) break;
  const before = index.docs[w.id];
  try {
    tried++;
    requests++;
    const buf = await fetchCdepFile(w.url);
    note(`F${w.id}`);
    writeFileAtomic(path.join(PDFS, `F${w.id}.pdf`), buf);
    index.docs[w.id] = { url: w.url, nume: w.nume, la: new Date().toISOString(), sha1: sha1(buf), octeti: buf.length };
    downloaded++;
    log(`${firstDay(w)} ${w.nume} (${Math.round(buf.length / 1024)} KB)`);
  } catch (err) {
    if (err instanceof CdepBlocked) {
      note(`captcha F${w.id}`);
      stop = err.message;
      break;
    }
    index.docs[w.id] = { ...(before ?? { url: w.url, nume: w.nume }), ratat: { n: (before?.ratat?.n ?? 0) + 1, la: new Date().toISOString(), mesaj: String(err.message).slice(0, 200) } };
    log(`${firstDay(w)} ${w.nume}: ${err.message}${err?.cause?.code ? ` (${err.cause.code})` : ''}`);
  }
  saveIndex();
}

// ─── Ce nu mai e în paginile cdep.ro ──────────────────────────────────────────────────────────────────────────────
// Doar când paginile de acum s-au putut citi: o pagină goală nu șterge nimic.
if (wanted.size) {
  for (const [id, d] of Object.entries(index.docs)) {
    if (wanted.has(id) || age(d.la ?? d.ratat?.la) < KEEP_MS) continue;
    fs.rmSync(path.join(PDFS, `F${id}.pdf`), { force: true });
    delete index.docs[id];
  }
}
if (program.zile.length) {
  for (const [oid, d] of Object.entries(index.plen.oz)) {
    if (sittings.some((s) => s.oid === oid) || age(d.la) < KEEP_MS) continue;
    fs.rmSync(path.join(PLEN, `oz-${oid}.html`), { force: true });
    delete index.plen.oz[oid];
  }
}
saveIndex();

const left = queue.filter((w) => !haveAt(w.id)).length;
fs.appendFileSync(
  path.join(OUT, 'citiri.jsonl'),
  JSON.stringify({ start: new Date(started).toISOString(), gata: new Date().toISOString(), cereri: requests, liste: listsRead, pdfuri: downloaded, plen: plenRead, ramase: left, nota: stop || undefined }) + '\n',
);
log(`${listsRead} pagini cu ședințe, ${downloaded} ordini de zi ale comisiilor (${left} rămase), ${plenRead} ale plenului; ${requests} cereri${stop ? ` (${stop})` : ''}`);
