#!/usr/bin/env node
// Ordinile de zi ale comisiilor Camerei Deputaților, în forma agendelor Senatului (cloud-status/agende.md):
// data/agenda/camera/<zi>/<idc>.json, un fișier pe comisie și zi. Le citește site-ul la build (src/lib/agenda.ts) și
// recitirea fișelor (scripts/lib/cdep-reread.mjs): un proiect de pe ordinea de zi a unei comisii își schimbă fișa în
// zilele de după ședință.
//
//   node scripts/straja-cdep-agenda.mjs [--max=25] [--minute=30] [--fara-cereri] [--si-studiu]
//
// cdep.ro are o pagină cu ședințele anunțate și una cu cele din ultimele șapte zile: două cereri pe rulare. Ordinea de
// zi a unei ședințe e un PDF, descărcat o dată, cu pauza comună a cdep.ro (lib/cdep.mjs); îi citim textul (stratul de
// text, sau OCR la scanări) și căutăm numerele de proiect, care apar ca text, fără link. În ziua ședinței PDF-ul se mai
// descarcă o dată, pentru completările de ultim moment. Cel mult --max PDF-uri pe rulare și --minute minute; restul
// vine la rularea următoare, iar până atunci fișierul comisiei rămâne cel de ieri.
//
// O ședință comună apare pe cdep.ro de două ori, o dată pentru fiecare comisie, fiecare cu PDF-ul ei: scriem câte un
// fișier pe comisie, cu punctele din amândouă. Zilele de „documentare și consultare” nu sunt ședințe și nu se scriu
// (--si-studiu le descarcă totuși PDF-urile, pentru verificare). O ședință dispărută din program își pierde fișierul.
// Comisiile comune cu Senatul scriu numărul de la Senat („L631/2026”): îl păstrăm când e al unui proiect urmărit de noi.
// Zilele trecute rămân cinci săptămâni, cât le folosește recitirea fișelor.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CdepBlocked, fetchCdep, fetchCdepFile } from './lib/cdep.mjs';
import { MEETINGS_URL, PAST_MEETINGS_URL, billNumbers, parseMeetings, senateNumbers, slugOfNumber } from './lib/cdep-agenda.mjs';
import { readUntrustedPdf } from './lib/pdf-untrusted.mjs';
import { extractPdfText } from './lib/pdf-text.mjs';
import { todayBucharest } from './lib/web.mjs';
import { writeFileAtomic } from './lib/atomic.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'agenda', 'camera');
const SHEETS = path.join(ROOT, 'data', 'cdep', 'proiecte');
const CACHE = path.join(ROOT, '.cache', 'camera-agenda');
const PDFS = path.join(CACHE, 'pdf');
const OCR_CACHE = path.join(ROOT, '.cache', 'ocr');
const SENATE_BILLS = path.join(ROOT, 'data', 'senat-bills.json');
const STATE_FILE = path.join(CACHE, 'state.json');

const arg = (name, def) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? def;
const has = (name) => process.argv.includes(`--${name}`);
const MAX = +arg('max', 25);
const MINUTES = +arg('minute', 30);
const OFFLINE = has('fara-cereri');
const WITH_STUDY = has('si-studiu');

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TRIES = 3;
const RETRY_AFTER_MS = 3 * 86_400_000;
// În ziua ședinței, un PDF descărcat cu mai mult de atât în urmă se descarcă din nou.
const FRESH_MS = 20 * 3_600_000;
const KEEP_DAYS = 35;

const started = Date.now();
const today = todayBucharest();
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');
const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};
const writeJson = (file, data) => writeFileAtomic(file, JSON.stringify(data, null, 1) + '\n');

// state.docs[<id-ul din link, „F1233660556”>] = { url, nume, cititLa, hash, pagini, metoda, caractere, numere, senat, ratat }
const state = readJson(STATE_FILE) ?? { docs: {} };
const saveState = () => writeJson(STATE_FILE, state);

const year = Number(today.slice(0, 4));
const numbersIn = (text) => ({ numere: billNumbers(text, { year }), senat: senateNumbers(text, { year }) });
// Numerele se caută din nou în textele deja citite: o regulă îndreptată în lib/cdep-agenda.mjs ajunge și la ordinile
// de zi descărcate înaintea ei, fără altă cerere.
for (const [id, d] of Object.entries(state.docs)) {
  const file = path.join(PDFS, `F${id}.txt`);
  if (d.cititLa && fs.existsSync(file)) Object.assign(d, numbersIn(fs.readFileSync(file, 'utf8')));
}

// ─── Cele două pagini cu ședințe ──────────────────────────────────────────────────────────────────────────────────
let requests = 0;
let note = '';

/** HTML-ul unei pagini cu ședințe și ședințele din ea; `whole` spune dacă toate blocurile paginii au putut fi citite. */
async function readList(url, name) {
  const file = path.join(CACHE, `${name}.html`);
  let html;
  if (OFFLINE) {
    if (!fs.existsSync(file)) throw new Error(`${name}: nicio copie în .cache/camera-agenda (rulează o dată fără --fara-cereri)`);
    html = fs.readFileSync(file, 'utf8');
  } else {
    html = await fetchCdep(url);
    requests++;
    if (!/<title>[^<]*comisiilor parlamentare/i.test(html)) throw new Error(`${url} nu arată ca pagina cu ședințele comisiilor`);
    writeFileAtomic(file, html);
  }
  const meetings = parseMeetings(html);
  return { meetings, whole: meetings.length === html.split('<div class="gradient_gray"').length - 1 };
}

let lists;
try {
  lists = [await readList(MEETINGS_URL, 'sedinte'), await readList(PAST_MEETINGS_URL, 'sedinte-trecute')];
} catch (err) {
  console.error(`✗ ședințele comisiilor Camerei: ${err.message}`);
  process.exit(err instanceof CdepBlocked ? 0 : 1);
}
const meetings = lists.flatMap((l) => l.meetings);
// O ședință lipsă din amândouă paginile e retrasă doar dacă paginile s-au citit întregi și programul nu e gol (un
// program gol poate fi și o pagină schimbată).
const trustLists = lists.every((l) => l.whole) && lists[0].meetings.length > 0;

// ─── Ședințele pe comisie și zi ───────────────────────────────────────────────────────────────────────────────────
// Un bloc de pe pagină ține de fiecare comisie pe care o numește: la ședințele comune, de amândouă.
const groups = new Map();
for (const m of meetings) {
  for (const c of m.comisii) {
    const key = `${m.zi}|${c.idc}`;
    if (!groups.has(key)) groups.set(key, { zi: m.zi, idc: c.idc, nume: c.nume, blocks: [] });
    groups.get(key).blocks.push({ m, own: m.comisii[0].idc === c.idc });
  }
}
/** Blocurile unei comisii care sunt ședințe (nu zile de studiu), cu blocul comisiei înaintea celui al comisiei partenere. */
const realBlocks = (g) => g.blocks.filter((b) => !b.m.studiu).sort((a, b) => Number(b.own) - Number(a.own));
const pdfsOf = (blocks) => [...new Map(blocks.flatMap((b) => b.m.pdfs).map((p) => [p.id, p])).values()];

// ─── PDF-urile de descărcat ───────────────────────────────────────────────────────────────────────────────────────
const wanted = new Map(); // id → { ...pdf, zile: Set, studiu }
for (const m of meetings) {
  for (const p of m.pdfs) {
    if (!wanted.has(p.id)) wanted.set(p.id, { ...p, zile: new Set(), studiu: true });
    const w = wanted.get(p.id);
    w.zile.add(m.zi);
    if (!m.studiu) w.studiu = false;
  }
}
const failedLately = (d) => d?.ratat && d.ratat.n >= TRIES && Date.now() - Date.parse(d.ratat.la) < RETRY_AFTER_MS;
const firstDay = (w) => [...w.zile].sort()[0];
const lastDay = (w) => [...w.zile].sort().at(-1);
const unread = [...wanted.values()].filter((w) => !state.docs[w.id]?.cititLa && !failedLately(state.docs[w.id]) && (WITH_STUDY || !w.studiu));
const queue = [
  // Ședințele de azi încolo, cele mai apropiate întâi.
  ...unread.filter((w) => !w.studiu && lastDay(w) >= today).sort((a, b) => firstDay(a).localeCompare(firstDay(b))),
  // Ordinea de zi a ședințelor de azi, încă o dată.
  ...[...wanted.values()].filter((w) => {
    const d = state.docs[w.id];
    return !w.studiu && w.zile.has(today) && d?.cititLa && Date.now() - Date.parse(d.cititLa) > FRESH_MS;
  }),
  // Ședințele trecute, cele mai noi întâi.
  ...unread.filter((w) => !w.studiu && lastDay(w) < today).sort((a, b) => lastDay(b).localeCompare(lastDay(a))),
  ...unread.filter((w) => w.studiu),
];

/** Textul unui PDF: stratul de text când e scris pe calculator, OCR când e o scanare. */
async function pdfText(file, buf, label) {
  let layer = { text: '', pages: 0 };
  try {
    layer = await readUntrustedPdf(buf);
  } catch (err) {
    console.log(`  ⚠️ ${label}: stratul de text nu se poate citi (${err.message}); trecem la OCR`);
  }
  if (layer.text.length >= 150 * Math.max(1, layer.pages)) return { text: layer.text, pagini: layer.pages, metoda: 'text' };
  try {
    const res = await extractPdfText(file, { pdfParse: null, cacheDir: OCR_CACHE, label });
    if (res.text.trim().length > layer.text.trim().length) return { text: res.text, pagini: layer.pages || res.pages || 0, metoda: res.method };
  } catch (err) {
    console.log(`  ⚠️ ${label}: OCR-ul a eșuat (${err.message})`);
  }
  return { text: layer.text, pagini: layer.pages, metoda: 'text' };
}

let tried = 0;
let downloaded = 0;
let changedDocs = 0;
if (!OFFLINE) {
  for (const w of queue) {
    if (tried >= MAX || Date.now() - started > MINUTES * 60_000) break;
    const before = state.docs[w.id];
    const label = `${firstDay(w)} ${w.nume}`;
    try {
      tried++;
      requests++;
      const buf = await fetchCdepFile(w.url);
      downloaded++;
      const file = path.join(PDFS, `F${w.id}.pdf`);
      writeFileAtomic(file, buf);
      const { text, pagini, metoda } = await pdfText(file, buf, label);
      writeFileAtomic(path.join(PDFS, `F${w.id}.txt`), text);
      const hash = sha1(text);
      if (before?.hash && before.hash !== hash) changedDocs++;
      const { numere, senat } = numbersIn(text);
      if (text.trim().length < 100) console.log(`  ⚠️ ${label}: PDF fără text lizibil (${w.url})`);
      state.docs[w.id] = { url: w.url, nume: w.nume, cititLa: new Date().toISOString(), hash, pagini, metoda, caractere: text.length, numere, senat };
      console.log(`  📄 ${label}: ${numere.length} proiecte, ${pagini} pagini (${metoda})${before?.hash && before.hash !== hash ? ', schimbată' : ''}`);
    } catch (err) {
      if (err instanceof CdepBlocked) {
        note = err.message;
        break;
      }
      // O ordine de zi deja citită rămâne cu textul dinainte; una necitită se mai încearcă de două ori, apoi peste trei zile.
      const ratat = { n: (before?.ratat?.n ?? 0) + 1, la: new Date().toISOString(), mesaj: String(err.message).slice(0, 200) };
      state.docs[w.id] = { ...(before ?? { url: w.url, nume: w.nume }), ratat };
      console.log(`  ⚠️ ${label}: ${err.message}`);
    }
    saveState();
  }
}

// ─── Fișierele comisiilor ─────────────────────────────────────────────────────────────────────────────────────────
// Sala scrisă în notă („camera 3150, etaj 3”, „Ora 17.00, parter, corp B4, camera 28”), cum e la ședințele trecute.
const ROOM = /\b(sala|camera|cam|etaj|et|corp|nivel|parter)\b/i;

function session({ m }, idc) {
  const inNote = ROOM.test(m.nota) ? m.nota.replace(/^ora\s+\d{1,2}[.:]\d{2}\s*,?\s*/i, '') : '';
  const others = m.comisii.filter((c) => c.idc !== idc).map((c) => c.nume);
  const descriere = [others.length ? `Ședință comună cu ${others.join(', ')}` : '', !inNote && m.nota !== m.sala ? m.nota : ''].filter(Boolean).join('; ');
  return { descriere, deLa: m.ora, panaLa: '', etaj: '', sala: m.sala || inNote };
}

// Proiectele Senatului pe care le urmărim, după numărul L (rândurile fără L au încă numărul de înregistrare, „B563/2026”).
let senateByNr = null;
function senateBill(numar) {
  if (!senateByNr) {
    const rows = readJson(SENATE_BILLS) ?? [];
    senateByNr = new Map((Array.isArray(rows) ? rows : rows.bills ?? []).filter((b) => /^L\d/.test(b.senatNr ?? '')).map((b) => [b.senatNr, b]));
  }
  return senateByNr.get(numar) ?? null;
}

/** Punctele unei ședințe: proiectele din PDF-urile ei, cu ce știm din fișa noastră (titlul, `idp`, rolul comisiei). */
function items(pdfs, idc) {
  const out = new Map();
  for (const p of pdfs) {
    for (const n of state.docs[p.id]?.numere ?? []) {
      if (out.has(n.slug)) continue;
      const sheet = readJson(path.join(SHEETS, `${n.slug}.json`));
      // Număr scris fără an („PL-x 594”, cu data dedesubt): anul vine din dată, deci îl credem doar dacă fișa are aceeași dată.
      if (n.data && sheet?.inregistrat && sheet.inregistrat !== n.data) {
        console.log(`  ⚠️ ${p.nume}: ${n.numar} cu data ${n.data}, dar fișa noastră e din ${sheet.inregistrat}; lăsat deoparte`);
        continue;
      }
      const seized = (list) => (list ?? []).some((c) => String(c.idc) === idc);
      const scop = seized(sheet?.fisa?.comisii?.raport) ? 'Raport' : seized(sheet?.fisa?.comisii?.aviz) ? 'Aviz' : '';
      out.set(n.slug, {
        capitol: '',
        nr: n.nr,
        numar: sheet?.numar ?? n.numar,
        cod: sheet?.idp != null ? String(sheet.idp) : null,
        b: null,
        titlu: sheet?.titlu ?? '',
        scop,
        termen: '',
        rezolutie: '',
      });
    }
  }
  // Numerele de la Senat, doar ale proiectelor urmărite și doar când proiectul nu e deja pe listă cu numărul Camerei.
  for (const p of pdfs) {
    for (const numar of state.docs[p.id]?.senat ?? []) {
      const bill = senateBill(numar);
      if (!bill || out.has(numar) || out.has(slugOfNumber(bill.cdepNr))) continue;
      out.set(numar, { capitol: '', nr: '', numar, cod: null, b: null, titlu: bill.officialTitle ?? '', scop: '', termen: '', rezolutie: '' });
    }
  }
  return [...out.values()];
}

// Ca în straja-agenda.mjs (Senatul), care rulează pe VM doar cu lib/senat-agenda.mjs și de aceea nu împarte codul.
const keyOf = (p) => p.numar.toLowerCase().replace(/[^a-z0-9/]+/g, '');
function changes(before, after) {
  if (!before) return [{ tip: 'publicat', puncte: after.puncte.map((p) => p.numar) }];
  const out = [];
  const old = new Map(before.puncte.map((p) => [keyOf(p), p]));
  const now = new Map(after.puncte.map((p) => [keyOf(p), p]));
  for (const [k, p] of now) if (!old.has(k)) out.push({ tip: 'adăugat', numar: p.numar, cod: p.cod });
  for (const [k, p] of old) if (!now.has(k)) out.push({ tip: 'scos', numar: p.numar, cod: p.cod });
  if (JSON.stringify(before.sedinte) !== JSON.stringify(after.sedinte)) out.push({ tip: 'ședință schimbată', inainte: before.sedinte, acum: after.sedinte });
  return out;
}

const log = [];
let created = 0;
let changed = 0;
let waiting = 0;
const held = new Set(); // ședințele din program, citite sau nu
for (const g of groups.values()) {
  const real = realBlocks(g);
  if (!real.length) continue;
  held.add(`${g.zi}|${g.idc}`);
  const pdfs = pdfsOf(real);
  // O ordine de zi încă necitită: fișierul rămâne cel dinainte, nu unul gol. Una care nu s-a putut citi de trei ori (alt
  // format decât PDF, de exemplu) nu mai ține ședința pe loc.
  if (pdfs.some((p) => !state.docs[p.id]?.cititLa && !(state.docs[p.id]?.ratat?.n >= TRIES))) {
    waiting++;
    continue;
  }
  // Ședința comună e o singură ședință, deși are două blocuri.
  const sessions = new Map();
  for (const b of real) {
    const key = `${b.m.ora}|${b.m.comisii.map((c) => c.idc).sort().join('+')}`;
    if (!sessions.has(key)) sessions.set(key, session(b, g.idc));
  }
  const after = {
    comisieId: g.idc,
    comisie: g.nume,
    zi: g.zi,
    url: pdfs[0]?.url ?? MEETINGS_URL,
    sedinte: [...sessions.values()].sort((a, b) => a.deLa.localeCompare(b.deLa)),
    puncte: items(pdfs, g.idc),
  };
  const file = path.join(OUT, g.zi, `${g.idc}.json`);
  const before = readJson(file);
  if (before && JSON.stringify({ ...before, cititLa: undefined }) === JSON.stringify(after)) continue;
  writeJson(file, { ...after, cititLa: new Date().toISOString() });
  if (before) changed++;
  else created++;
  for (const d of changes(before, after)) log.push({ la: new Date().toISOString(), comisieId: g.idc, comisie: g.nume, zi: g.zi, ...d });
}

// Ședințele scoase din program: fișierele zilelor de mâine încolo care nu mai apar printre ședințele anunțate. Ziua
// de azi rămâne cum e: nu știm dacă o ședință începută mai stă pe pagina celor anunțate.
let withdrawn = 0;
if (trustLists && fs.existsSync(OUT)) {
  for (const zi of fs.readdirSync(OUT).filter((d) => DAY.test(d) && d > today)) {
    const dir = path.join(OUT, zi);
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const idc = f.slice(0, -5);
      if (held.has(`${zi}|${idc}`)) continue;
      const before = readJson(path.join(dir, f));
      fs.rmSync(path.join(dir, f));
      withdrawn++;
      log.push({ la: new Date().toISOString(), comisieId: idc, comisie: before?.comisie ?? '', zi, tip: 'ședință retrasă', puncte: (before?.puncte ?? []).map((p) => p.numar) });
    }
    if (!fs.readdirSync(dir).length) fs.rmdirSync(dir);
  }
}
// Zilele vechi: recitirea fișelor se uită cel mult trei săptămâni în urmă, iar site-ul arată săptămâna aceasta și următoarea.
const oldest = new Date(Date.parse(`${today}T12:00:00Z`) - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
for (const zi of fs.existsSync(OUT) ? fs.readdirSync(OUT).filter((d) => DAY.test(d) && d < oldest) : []) {
  fs.rmSync(path.join(OUT, zi), { recursive: true, force: true });
}

fs.mkdirSync(CACHE, { recursive: true });
saveState();
if (log.length) fs.appendFileSync(path.join(CACHE, 'schimbari.jsonl'), log.map((l) => JSON.stringify(l)).join('\n') + '\n');
const left = queue.filter((w) => !state.docs[w.id]?.cititLa && !w.studiu).length;
const summary = {
  start: new Date(started).toISOString(),
  gata: new Date().toISOString(),
  cereri: requests,
  sedinte: held.size,
  pdfuri: downloaded,
  pdfuriSchimbate: changedDocs,
  zileNoi: created,
  zileSchimbate: changed,
  retrase: withdrawn,
  inAsteptare: waiting,
  nota: note || undefined,
};
fs.appendFileSync(path.join(CACHE, 'citiri.jsonl'), JSON.stringify(summary) + '\n');
console.log(
  `📅 Camera: ${held.size} ședințe de comisie în program; ${downloaded} ordini de zi descărcate (${changedDocs} schimbate), ${left} rămase; ` +
    `${created} fișiere noi, ${changed} schimbate, ${withdrawn} retrase, ${waiting} în așteptare; ${requests} cereri` +
    (note ? ` (${note})` : ''),
);
