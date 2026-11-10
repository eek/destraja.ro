#!/usr/bin/env node
// Ordinile de zi ale comisiilor Camerei Deputaților, în forma agendelor Senatului (cloud-status/agende.md):
// data/agenda/camera/<zi>/<idc>.json, un fișier pe comisie și zi. Le citește site-ul la build (src/lib/agenda.ts) și
// recitirea fișelor (scripts/lib/cdep-reread.mjs): un proiect de pe ordinea de zi a unei comisii își schimbă fișa în
// zilele de după ședință.
//
//   node scripts/straja-cdep-agenda.mjs [--max=25] [--minute=30] [--fara-cereri] [--si-studiu] [--fara-vm]
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
//
// Plenul Camerei: programul de lucru al săptămânii (o cerere) și ordinea de zi a fiecărei ședințe de plen, o pagină HTML
// cu toate punctele (o cerere la prima citire, apoi una în ziua ședinței). Scriem data/agenda/camera/<zi>/plen.json, în
// aceeași formă, cu toate punctele. Ședințele comune cu Senatul vin de pe senat.ro (straja-agenda.mjs), nu și de aici.
//
// VM-ul destraja descarcă aceleași pagini și PDF-uri la trei ore, și în zilele în care Mac-ul nu rulează
// (scripts/vm/cdep-agenda-vm.mjs). La început îi spunem ce avem și aducem prin ssh și tar ce are mai nou: ce a venit de
// acolo nu se mai cere de aici. Fără .cache/agenda-vm, cu --fara-vm sau cu VM-ul oprit, citim singuri.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CdepBlocked, fetchCdep, fetchCdepFile } from './lib/cdep.mjs';
import {
  MEETINGS_URL,
  PAST_MEETINGS_URL,
  PLENARY_PROGRAM_URL,
  billNumbers,
  isMeetingsPage,
  isPlenaryPage,
  isProgramPage,
  parseMeetings,
  parsePlenary,
  parseProgram,
  plenaryUrl,
  senateNumbers,
  slugOfNumber,
} from './lib/cdep-agenda.mjs';
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
const PLEN = path.join(CACHE, 'plen');
const PROGRAM_FILE = path.join(PLEN, 'program.html');
const ozFile = (oid) => path.join(PLEN, `oz-${oid}.html`);
const JUMP_FILE = path.join(ROOT, '.cache', 'agenda-vm');

const arg = (name, def) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? def;
const has = (name) => process.argv.includes(`--${name}`);
const MAX = +arg('max', 25);
const MINUTES = +arg('minute', 30);
const OFFLINE = has('fara-cereri');
const WITH_STUDY = has('si-studiu');
const NO_VM = has('fara-vm');
// Pentru probe: un dosar de aici în forma ~/cdep-vm/agenda de pe VM, în locul aducerii prin ssh.
const VM_DIR = arg('vm-dir', '');
const VM_COPY = VM_DIR ? path.resolve(VM_DIR) : path.join(CACHE, 'vm');

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TRIES = 3;
const RETRY_AFTER_MS = 3 * 86_400_000;
// În ziua ședinței, un PDF descărcat cu mai mult de atât în urmă se descarcă din nou.
const FRESH_MS = 20 * 3_600_000;
// O pagină (ședințele comisiilor, programul plenului) citită de VM de mai puțin de atât nu se mai cere de aici.
const VM_PAGE_MS = 4 * 3_600_000;
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
const readText = (file) => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
};
const writeJson = (file, data) => writeFileAtomic(file, JSON.stringify(data, null, 1) + '\n');
const age = (iso) => (iso ? Date.now() - Date.parse(iso) : Infinity);

// state.docs[<id-ul din link, „F1233660556”>] = { url, nume, cititLa, hash, pagini, metoda, caractere, numere, senat, ratat, sursa }
// state.liste[<nume>] = { la, sursa }; state.plen = { program: { la, sursa }, oz: { <oid>: { la, hash, sursa } } }
// `sursa` e 'vm' la ce a descărcat VM-ul și 'mac' la paginile cerute de aici.
const state = { docs: {}, liste: {}, ...readJson(STATE_FILE) };
state.plen = { program: null, oz: {}, ...state.plen };
const saveState = () => writeJson(STATE_FILE, state);

const year = Number(today.slice(0, 4));
const numbersIn = (text) => ({ numere: billNumbers(text, { year }), senat: senateNumbers(text, { year }) });
// Numerele se caută din nou în textele deja citite: o regulă îndreptată în lib/cdep-agenda.mjs ajunge și la ordinile
// de zi descărcate înaintea ei, fără altă cerere.
for (const [id, d] of Object.entries(state.docs)) {
  const file = path.join(PDFS, `F${id}.txt`);
  if (d.cititLa && fs.existsSync(file)) Object.assign(d, numbersIn(fs.readFileSync(file, 'utf8')));
}

// ─── Ce a descărcat VM-ul ─────────────────────────────────────────────────────────────────────────────────────────
// În ~/cdep-vm/agenda de pe VM stau paginile și PDF-urile descărcate acolo, cu un index.json (ce și când). Îi lăsăm
// lista cu ce avem deja (known.json), ca VM-ul să nu descarce ce am citit noi, și aducem doar ce are mai nou decât noi.
// Ce vine e tot ce a dat cdep.ro, deci trece prin aceleași verificări ca o descărcare de aici: paginile prin is…Page,
// PDF-urile prin readUntrustedPdf (mai jos, după ce știm ședințele).
const LIST_NAMES = ['sedinte', 'sedinte-trecute'];
const ID = /^\d+$/;
const newer = (theirs, mine) => typeof theirs === 'string' && (!mine || theirs > mine);
const known = () =>
  JSON.stringify({
    docs: Object.fromEntries(Object.entries(state.docs).filter(([, d]) => d.cititLa).map(([id, d]) => [id, d.cititLa])),
    oz: Object.fromEntries(Object.entries(state.plen.oz).map(([oid, d]) => [oid, d.la])),
  });
const KNOWN_CMD = 'mkdir -p cdep-vm/agenda && cat > cdep-vm/agenda/known.json.tmp && mv -f cdep-vm/agenda/known.json.tmp cdep-vm/agenda/known.json';

/** O comandă pe VM, cu `input` pe stdin; ieșirea ei, sau null dacă ssh-ul ori comanda n-a mers. */
function vm(cmd, input, timeoutMs = 60_000) {
  const to = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=15', '-i', path.join(os.homedir(), '.ssh', 'destraja_vm'), '-J', fs.readFileSync(JUMP_FILE, 'utf8').trim()];
  const res = spawnSync('ssh', [...to, 'destraja@192.168.153.10', cmd], { input, timeout: timeoutMs, maxBuffer: 2 ** 29, stdio: ['pipe', 'pipe', 'ignore'] });
  return res.status === 0 ? res.stdout : null;
}

/** Fișierele din indexul VM-ului mai noi decât ale noastre, cu numele lor din ~/cdep-vm/agenda. */
function vmNewer(index) {
  const names = [];
  for (const name of LIST_NAMES) if (newer(index.liste?.[name], state.liste[name]?.la)) names.push(`${name}.html`);
  if (newer(index.plen?.program, state.plen.program?.la)) names.push('plen/program.html');
  for (const [oid, d] of Object.entries(index.plen?.oz ?? {})) if (ID.test(oid) && newer(d?.la, state.plen.oz[oid]?.la)) names.push(`plen/oz-${oid}.html`);
  for (const [id, d] of Object.entries(index.docs ?? {})) if (ID.test(id) && newer(d?.la, state.docs[id]?.cititLa)) names.push(`pdf/F${id}.pdf`);
  return names;
}

/** Indexul VM-ului și fișierele lui mai noi, aduse în .cache/camera-agenda/vm; null dacă VM-ul nu le-a dat. */
function pullVm() {
  let index = null;
  try {
    index = JSON.parse(vm(`${KNOWN_CMD} && cat cdep-vm/agenda/index.json`, known())?.toString('utf8') ?? 'null');
  } catch {
    // un răspuns care nu e JSON e tot un VM care n-a răspuns
  }
  if (!index || typeof index !== 'object') return null;
  const files = vmNewer(index);
  fs.rmSync(VM_COPY, { recursive: true, force: true });
  fs.mkdirSync(VM_COPY, { recursive: true });
  if (!files.length) return { index, files };
  // Un fișier șters pe VM între index și arhivă nu oprește restul.
  const tgz = vm(`cd cdep-vm/agenda && while IFS= read -r f; do [ -f "$f" ] && printf '%s\\n' "$f"; done | tar -czf - -T -`, files.join('\n') + '\n', 300_000);
  if (!tgz) return null;
  const archive = `${VM_COPY}.tgz`;
  fs.writeFileSync(archive, tgz);
  // Din arhivă scoatem doar numele cerute.
  spawnSync('tar', ['-xzf', archive, '-C', VM_COPY, ...files], { stdio: 'ignore' });
  fs.rmSync(archive, { force: true });
  return { index, files: files.filter((f) => fs.existsSync(path.join(VM_COPY, f))) };
}

let vmCopy = null; // { index, files }
if (VM_DIR) {
  const index = readJson(path.join(VM_COPY, 'index.json'));
  vmCopy = index && { index, files: vmNewer(index) };
} else if (!OFFLINE && !NO_VM && fs.existsSync(JUMP_FILE)) {
  vmCopy = pullVm();
  if (!vmCopy) console.log('  ⚠️ VM-ul n-a dat ordinile de zi (ssh căzut sau cititorul lui neinstalat): citim de aici');
}

/** O pagină adusă de pe VM, dacă arată ca pagina așteptată. */
function vmPage(name, looksRight) {
  if (!vmCopy?.files.includes(name)) return null;
  const html = readText(path.join(VM_COPY, name));
  return looksRight(html) ? html : null;
}
let vmPages = 0;
if (vmCopy) {
  const { index } = vmCopy;
  for (const name of LIST_NAMES) {
    const html = vmPage(`${name}.html`, isMeetingsPage);
    if (!html) continue;
    writeFileAtomic(path.join(CACHE, `${name}.html`), html);
    state.liste[name] = { la: index.liste[name], sursa: 'vm' };
    vmPages++;
  }
  const program = vmPage('plen/program.html', isProgramPage);
  if (program) {
    writeFileAtomic(PROGRAM_FILE, program);
    state.plen.program = { la: index.plen.program, sursa: 'vm' };
    vmPages++;
  }
  for (const [oid, d] of Object.entries(index.plen?.oz ?? {})) {
    const html = vmPage(`plen/oz-${oid}.html`, isPlenaryPage);
    if (!html) continue;
    writeFileAtomic(ozFile(oid), html);
    state.plen.oz[oid] = { la: d.la, hash: sha1(html), sursa: 'vm' };
    vmPages++;
  }
}
/** Pagina e copia VM-ului, citită acolo de curând: nu o mai cerem. */
const fromVmLately = (seen, file) => seen?.sursa === 'vm' && age(seen.la) < VM_PAGE_MS && fs.existsSync(file);

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
  } else if (fromVmLately(state.liste[name], file)) {
    html = fs.readFileSync(file, 'utf8');
  } else {
    html = await fetchCdep(url);
    requests++;
    if (!isMeetingsPage(html)) throw new Error(`${url} nu arată ca pagina cu ședințele comisiilor`);
    writeFileAtomic(file, html);
    state.liste[name] = { la: new Date().toISOString(), sursa: 'mac' };
  }
  const meetings = parseMeetings(html);
  return { meetings, whole: meetings.length === html.split('<div class="gradient_gray"').length - 1 };
}

let lists;
try {
  lists = [await readList(MEETINGS_URL, LIST_NAMES[0]), await readList(PAST_MEETINGS_URL, LIST_NAMES[1])];
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

let tried = 0;
let downloaded = 0;
let changedDocs = 0;
/** Păstrează un PDF descărcat, aici sau pe VM: fișierul, textul lui, numerele din text și starea. */
async function keep(w, buf, { la = new Date().toISOString(), sursa } = {}) {
  const before = state.docs[w.id];
  const label = w.zile ? `${firstDay(w)} ${w.nume}` : w.nume;
  const file = path.join(PDFS, `F${w.id}.pdf`);
  writeFileAtomic(file, buf);
  const { text, pagini, metoda } = await pdfText(file, buf, label);
  writeFileAtomic(path.join(PDFS, `F${w.id}.txt`), text);
  const hash = sha1(text);
  if (before?.hash && before.hash !== hash) changedDocs++;
  const { numere, senat } = numbersIn(text);
  if (text.trim().length < 100) console.log(`  ⚠️ ${label}: PDF fără text lizibil (${w.url})`);
  state.docs[w.id] = { url: w.url, nume: w.nume, cititLa: la, hash, pagini, metoda, caractere: text.length, numere, senat, ...(sursa && { sursa }) };
  console.log(`  📄 ${label}: ${numere.length} proiecte, ${pagini} pagini (${metoda})${before?.hash && before.hash !== hash ? ', schimbată' : ''}${sursa === 'vm' ? ', de pe VM' : ''}`);
}

// PDF-urile aduse de pe VM, citite ca o descărcare de aici, cu ora la care le-a descărcat VM-ul. Scanările cer OCR,
// care durează: ce nu încape în timpul rulării rămâne pe VM și vine la următoarea.
let fromVm = 0;
for (const [id, d] of Object.entries(vmCopy?.index.docs ?? {})) {
  if (!vmCopy.files.includes(`pdf/F${id}.pdf`)) continue;
  if (Date.now() - started > MINUTES * 60_000) break;
  try {
    const buf = fs.readFileSync(path.join(VM_COPY, 'pdf', `F${id}.pdf`));
    if (buf.subarray(0, 5).toString('latin1') !== '%PDF-' || sha1(buf) !== d.sha1) throw new Error('nu e PDF-ul din indexul VM-ului');
    await keep(wanted.get(id) ?? { id, url: String(d.url ?? ''), nume: String(d.nume ?? `F${id}.pdf`) }, buf, { la: d.la, sursa: 'vm' });
    fromVm++;
    saveState();
  } catch (err) {
    console.log(`  ⚠️ F${id} de pe VM: ${err.message}`);
  }
}

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

// ─── Plenul ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Programul de lucru spune ce ședințe de plen are săptămâna. Ordinea de zi a fiecăreia se citește o dată și apoi o dată
// pe zi până trece ședința: proiectul de ordine de zi se schimbă până la aprobare, iar în ziua ședinței mai apar puncte.
/** O pagină a plenului, cerută acum; null când n-a venit sau nu arată cum o știm (rămâne copia dinainte). */
async function plenPage(url, file, looksRight, what) {
  if (note || Date.now() - started > MINUTES * 60_000) return null;
  try {
    requests++;
    const html = await fetchCdep(url, { fresh: true });
    if (!looksRight(html)) {
      console.log(`  ⚠️ ${what}: pagina nu arată cum o știm; rămâne copia dinainte`);
      return null;
    }
    writeFileAtomic(file, html);
    return html;
  } catch (err) {
    if (err instanceof CdepBlocked) note = err.message;
    else console.log(`  ⚠️ ${what}: ${err.message}`);
    return null;
  }
}

// Programul e cel de acum când l-am citit în rularea asta (sau l-a citit VM-ul de curând); altfel rămâne cel dinainte,
// bun pentru zilele lui, dar nu și ca să retragem o ședință.
let programNow = OFFLINE || fromVmLately(state.plen.program, PROGRAM_FILE);
if (!programNow && (await plenPage(PLENARY_PROGRAM_URL, PROGRAM_FILE, isProgramPage, 'programul de lucru al plenului'))) {
  state.plen.program = { la: new Date().toISOString(), sursa: 'mac' };
  programNow = true;
  saveState();
}
const program = parseProgram(readText(PROGRAM_FILE), { today });
const trustProgram = programNow && program.zile.length > 0;
// Fără ședințele comune cu Senatul, pe care le avem de pe senat.ro.
const sittings = program.sedinte.filter((s) => !s.comuna);
const plenDays = new Map(); // zi → ședințele de plen ale zilei
for (const s of sittings) plenDays.set(s.zi, [...(plenDays.get(s.zi) ?? []), s]);
const lastSitting = (oid) => sittings.filter((s) => s.oid === oid).map((s) => s.zi).sort().at(-1);
let plenRead = 0;
if (!OFFLINE) {
  for (const oid of new Set(sittings.map((s) => s.oid))) {
    const at = state.plen.oz[oid]?.la;
    if (at && !(lastSitting(oid) >= today && age(at) > FRESH_MS)) continue;
    const html = await plenPage(plenaryUrl(oid), ozFile(oid), isPlenaryPage, `ordinea de zi a plenului din ${lastSitting(oid)}`);
    if (!html) continue;
    state.plen.oz[oid] = { la: new Date().toISOString(), hash: sha1(html), sursa: 'mac' };
    plenRead++;
    saveState();
  }
}

// ─── Ordinile de zi ale comisiilor ────────────────────────────────────────────────────────────────────────────────
if (!OFFLINE) {
  for (const w of queue) {
    if (tried >= MAX || Date.now() - started > MINUTES * 60_000) break;
    const before = state.docs[w.id];
    try {
      tried++;
      requests++;
      const buf = await fetchCdepFile(w.url);
      downloaded++;
      await keep(w, buf);
    } catch (err) {
      if (err instanceof CdepBlocked) {
        note = err.message;
        break;
      }
      // O ordine de zi deja citită rămâne cu textul dinainte; una necitită se mai încearcă de două ori, apoi peste trei zile.
      const ratat = { n: (before?.ratat?.n ?? 0) + 1, la: new Date().toISOString(), mesaj: String(err.message).slice(0, 200) };
      state.docs[w.id] = { ...(before ?? { url: w.url, nume: w.nume }), ratat };
      console.log(`  ⚠️ ${firstDay(w)} ${w.nume}: ${err.message}`);
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
// Punctele fără număr (la plen: informări, numiri) se deosebesc după titlu.
const keyOf = (p) => (p.numar || p.titlu).toLowerCase().replace(/[^a-z0-9/]+/g, '');
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
/** Scrie fișierul unei ședințe doar când s-a schimbat ceva în el și notează ce. */
function writeDay(after) {
  const file = path.join(OUT, after.zi, `${after.comisieId}.json`);
  const before = readJson(file);
  if (before && JSON.stringify({ ...before, cititLa: undefined }) === JSON.stringify(after)) return;
  writeJson(file, { ...after, cititLa: new Date().toISOString() });
  if (before) changed++;
  else created++;
  for (const d of changes(before, after)) log.push({ la: new Date().toISOString(), comisieId: after.comisieId, comisie: after.comisie, zi: after.zi, ...d });
}
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
  writeDay({
    comisieId: g.idc,
    comisie: g.nume,
    zi: g.zi,
    url: pdfs[0]?.url ?? MEETINGS_URL,
    sedinte: [...sessions.values()].sort((a, b) => a.deLa.localeCompare(b.deLa)),
    puncte: items(pdfs, g.idc),
  });
}

// ─── Fișierul plenului ────────────────────────────────────────────────────────────────────────────────────────────
// Toate punctele ordinii de zi, cum le scrie pagina: numărul curent, numărul de înregistrare, titlul și, în `scop`, ce
// urmează după titlu (felul legii, votul Senatului, raportul comisiei, procedura de urgență, Camera decizională). `cod`
// e idp-ul din linkul fișei, pe care îl au doar proiectele de lege.
for (const [zi, list] of plenDays) {
  const pages = [...new Set(list.map((s) => s.oid))].map((oid) => {
    const html = readText(ozFile(oid));
    return isPlenaryPage(html) ? parsePlenary(html) : null;
  });
  // O ordine de zi încă necitită, sau cu un tabel pe care nu-l mai înțelegem: fișierul rămâne cel dinainte.
  if (pages.some((p) => !p?.whole)) {
    if (pages.some((p) => p && !p.whole)) console.log(`  ⚠️ plenul din ${zi}: tabelul ordinii de zi nu mai arată cum îl știm; rămâne fișierul dinainte`);
    waiting++;
    continue;
  }
  writeDay({
    comisieId: 'plen',
    comisie: 'Plenul Camerei Deputaților',
    zi,
    url: plenaryUrl(list[0].oid),
    sedinte: list.flatMap((s) => s.ore).map((o) => ({ descriere: o.descriere, deLa: o.deLa, panaLa: o.panaLa, etaj: '', sala: '' })),
    puncte: pages
      .flatMap((p) => p.puncte)
      .map((p) => ({
        capitol: '',
        nr: p.nr,
        numar: (p.slug && readJson(path.join(SHEETS, `${p.slug}.json`))?.numar) || p.numar,
        cod: p.idp,
        b: null,
        titlu: p.titlu,
        scop: p.detalii.join('; '),
        termen: '',
        rezolutie: '',
      })),
  });
}

// Ședințele scoase din program: fișierele zilelor de mâine încolo care nu mai apar printre ședințele anunțate. Ziua
// de azi rămâne cum e: nu știm dacă o ședință începută mai stă pe pagina celor anunțate. Plenul, după programul de lucru,
// doar când l-am citit acum.
let withdrawn = 0;
if (trustLists && fs.existsSync(OUT)) {
  for (const zi of fs.readdirSync(OUT).filter((d) => DAY.test(d) && d > today)) {
    const dir = path.join(OUT, zi);
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const idc = f.slice(0, -5);
      if (idc === 'plen' ? plenDays.has(zi) || !trustProgram : held.has(`${zi}|${idc}`)) continue;
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
// Ce am descărcat noi acum nu mai trebuie descărcat și de VM.
if (vmCopy && !VM_DIR && (downloaded || plenRead)) vm(KNOWN_CMD, known());
const left = queue.filter((w) => !state.docs[w.id]?.cititLa && !w.studiu).length;
const summary = {
  start: new Date(started).toISOString(),
  gata: new Date().toISOString(),
  cereri: requests,
  sedinte: held.size,
  pdfuri: downloaded,
  pdfuriSchimbate: changedDocs,
  deLaVm: vmCopy ? { pdfuri: fromVm, pagini: vmPages } : undefined,
  plen: { sedinte: plenDays.size, citite: plenRead },
  zileNoi: created,
  zileSchimbate: changed,
  retrase: withdrawn,
  inAsteptare: waiting,
  nota: note || undefined,
};
fs.appendFileSync(path.join(CACHE, 'citiri.jsonl'), JSON.stringify(summary) + '\n');
console.log(
  `📅 Camera: ${held.size} ședințe de comisie în program și ${plenDays.size} de plen; ${downloaded} ordini de zi descărcate` +
    `${vmCopy ? `, ${fromVm} aduse de pe VM` : ''} (${changedDocs} schimbate), ${left} rămase; ${plenRead} ale plenului citite; ` +
    `${created} fișiere noi, ${changed} schimbate, ${withdrawn} retrase, ${waiting} în așteptare; ${requests} cereri` +
    (note ? ` (${note})` : ''),
);
