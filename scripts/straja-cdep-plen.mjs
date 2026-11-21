#!/usr/bin/env node
// Ce s-a întâmplat în ședințele Camerei Deputaților, din înregistrările cdep.ro (scripts/lib/cdep-plen.mjs), pentru
// calendarul agendei (src/lib/agenda-outcomes.ts):
//
//   data/cdep/plen/<zi>.json     o zi de plen: sumarul stenogramei (ce puncte s-au dezbătut și ce s-a hotărât la fiecare)
//                                și, până apare stenograma, voturile electronice ale zilei
//   data/cdep/comisii-documente/<idc>.json avizele și rapoartele unei comisii, de pe pagina ei de documente
//
//   node scripts/straja-cdep-plen.mjs [--max=12] [--minute=15] [--comisii=8] [--zile-comisii=15] [--de-la=2026-10-26] [--fara-cereri]
//
// Cererile, cu pauza comună a cdep.ro (lib/cdep.mjs: una pe minut, 60 pe oră, două ore de oprire la captcha), cel mult
// --max pe rulare și --minute minute:
//   1. Calendarul stenogramelor anului (o cerere, cel mult o dată la 20 de ore), doar când o zi de plen din agendă n-are
//      încă stenograma. Apoi sumarul fiecărei astfel de zile apărute în calendar, întâi cele mai noi: câte o cerere, o
//      singură dată (stenograma nu se mai schimbă după ce apare). Un sumar citit doar în parte nu se scrie și se reia
//      peste trei zile; după 45 de zile fără stenogramă ziua nu mai e căutată.
//   2. Voturile electronice ale unei zile de plen din agendă, trecute și fără stenogramă: o cerere, o singură dată.
//   3. Pagina de documente a comisiilor cu ședințe în ultimele 15 zile la care un proiect de pe ordinea de zi n-are încă
//      aviz sau raport de la comisie datat din ziua ședinței încoace: cel mult --comisii pe rulare, fiecare comisie cel
//      mult o dată la 44 de ore, întâi cele citite de cel mai mult timp. Pagina arată doar ultimele ~100 de documente,
//      deci le păstrăm pe cele citite înainte.
// Fără --fara-cereri, o pagină care nu arată cum o știm nu se scrie și nu strică ce aveam. Paginile brute stau în
// .cache/cdep-plen, pentru o citire din nou fără cereri (--fara-cereri le reia pe toate).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CdepBlocked, fetchCdep } from './lib/cdep.mjs';
import {
  committeeDocsUrl,
  evotDayUrl,
  isCommitteeDocsPage,
  isEvotDayPage,
  isStenoCalendarPage,
  numberKey,
  parseCommitteeDocs,
  parseEvotDay,
  parseStenoCalendar,
  parseStenoDay,
  stenoCalendarUrl,
  stenoDayDate,
  stenoDayKind,
  stenoDayUrl,
} from './lib/cdep-plen.mjs';
import { todayBucharest } from './lib/web.mjs';
import { writeFileAtomic } from './lib/atomic.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENDA = path.join(ROOT, 'data', 'agenda', 'camera');
const OUT_PLEN = path.join(ROOT, 'data', 'cdep', 'plen');
const OUT_COM = path.join(ROOT, 'data', 'cdep', 'comisii-documente');
const CACHE = path.join(ROOT, '.cache', 'cdep-plen');
const STATE_FILE = path.join(CACHE, 'state.json');

const arg = (name, def) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? def;
const MAX = +arg('max', 12);
const MINUTES = +arg('minute', 15);
const MAX_COMMITTEES = +arg('comisii', 8);
const FROM = arg('de-la', '2026-10-26');
// Câte zile în urmă căutăm ședințe de comisie fără document (o recuperare poate cere mai mult de fereastra obișnuită).
const COMMITTEE_LOOKBACK = +arg('zile-comisii', 15);
const OFFLINE = process.argv.includes('--fara-cereri');

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const HOUR = 3_600_000;
const CALENDAR_EVERY = 20 * HOUR;
const COMMITTEE_EVERY = 44 * HOUR;
// O stenogramă neapărută după atâtea zile nu mai e căutată; o zi „listă” (pagina fără sumar) se reia după 3 zile.
const STENO_GIVE_UP_DAYS = 45;
const LIST_RETRY = 3 * 24 * HOUR;
// Ce păstrăm: zilele de plen și documentele comisiilor din ultimele atâtea zile (agenda ține cinci săptămâni).
const KEEP_DAYS = 60;

const started = Date.now();
const today = todayBucharest();
const shift = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const oldest = shift(today, -KEEP_DAYS);
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
const writeJson = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeFileAtomic(file, JSON.stringify(data, null, 1) + '\n');
};
const age = (iso) => (iso ? Date.now() - Date.parse(iso) : Infinity);

// state.calendare[<an>] = { la, zile }; state.lista[<zi>] = la (pagina zilei fără sumar întreg); state.comisii[<idc>] = la
const state = { calendare: {}, lista: {}, comisii: {}, ...readJson(STATE_FILE) };
const saveState = () => writeJson(STATE_FILE, state);

let requests = 0;
let note = '';
const outOfBudget = () => requests >= MAX || Date.now() - started > MINUTES * 60_000;

/**
 * Pagina de la `url`, ținută și în .cache/cdep-plen/<nume>.html. Fără cereri (sau după captcha, sau peste buget) dă
 * copia de pe disc, dacă `cached` o acceptă; o pagină nouă care nu trece `looksRight` nu se păstrează.
 */
async function page(url, name, looksRight, { cached = false } = {}) {
  const file = path.join(CACHE, `${name}.html`);
  if (cached || OFFLINE || note || outOfBudget()) {
    const html = readText(file);
    return cached || OFFLINE ? (looksRight(html) ? html : null) : null;
  }
  try {
    requests++;
    const html = await fetchCdep(url, { fresh: true });
    if (!looksRight(html)) {
      console.log(`  ⚠️ ${url}: pagina nu arată cum o știm; n-o folosim`);
      return null;
    }
    fs.mkdirSync(CACHE, { recursive: true });
    writeFileAtomic(file, html);
    return html;
  } catch (err) {
    if (err instanceof CdepBlocked) note = err.message;
    else console.log(`  ⚠️ ${url}: ${err.message}`);
    return null;
  }
}

// ─── Zilele de plen ───────────────────────────────────────────────────────────────────────────────────────────────
const plenFile = (zi) => path.join(OUT_PLEN, `${zi}.json`);
const agendaDays = (fs.existsSync(AGENDA) ? fs.readdirSync(AGENDA) : []).filter((d) => DAY.test(d)).sort();
const plenDays = agendaDays.filter((zi) => zi < today && zi >= FROM && fs.existsSync(path.join(AGENDA, zi, 'plen.json')));
const hasSteno = (zi) => !!readJson(plenFile(zi))?.stenograma;
// Căutăm stenograma doar pentru zilele de plen din agendă, cel mult STENO_GIVE_UP_DAYS după ședință și niciodată mai vechi
// decât ce păstrăm (altfel o zi ștearsă la sfârșit s-ar cere din nou la fiecare rulare).
const stenoFloor = [FROM, oldest, shift(today, -STENO_GIVE_UP_DAYS)].sort().at(-1);
const wantSteno = (zi) => zi < today && zi >= stenoFloor && !hasSteno(zi);

let stenoRead = 0;
let votesRead = 0;
// Calendarul fiecărui an cu zile de așteptat (în ianuarie, și al anului trecut), cel mult o dată la 20 de ore.
// state.calendare[<an>] = { la, zile }
state.calendare ??= {};
if (state.calendar?.zile?.length) state.calendare[state.calendar.zile.at(-1).slice(0, 4)] ??= state.calendar;
delete state.calendar;
for (const year of [...new Set(plenDays.filter(wantSteno).map((zi) => zi.slice(0, 4)))]) {
  const due = age(state.calendare[year]?.la) > CALENDAR_EVERY;
  if (!due && !OFFLINE) continue;
  const html = await page(stenoCalendarUrl(year), `calendar-${year}`, isStenoCalendarPage, { cached: OFFLINE });
  if (!html) continue;
  state.calendare[year] = { la: OFFLINE ? (state.calendare[year]?.la ?? null) : new Date().toISOString(), zile: parseStenoCalendar(html) };
  saveState();
}
const published = new Set(Object.values(state.calendare).flatMap((c) => c.zile ?? []));

/** Ziua din sumar, în forma din data/cdep/plen: punctele cu proiecte și cele de pe primul nivel (fără declarații). */
function stenoRecord(zi, html, kind) {
  const { sedinte, puncte, complet } = parseStenoDay(html);
  return {
    url: stenoDayUrl(zi),
    tip: kind,
    cititLa: new Date().toISOString(),
    sedinte,
    complet,
    puncte: puncte
      .filter((p) => p.numere.length || !p.idm.includes('.'))
      .map(({ titlu, ...p }) => ({ ...p, titlu: titlu.length > 400 ? `${titlu.slice(0, 399)}…` : titlu })),
  };
}

// Cu --fara-cereri recitim de pe disc toate zilele păstrate; altfel cerem zilele de plen din agendă apărute în calendar,
// întâi cele mai noi.
const stenoDays = OFFLINE
  ? [...new Set([...plenDays, ...fs.readdirSync(CACHE).map((f) => f.match(/^steno-(\d{4}-\d{2}-\d{2})\.html$/)?.[1]).filter(Boolean)])].filter((zi) => zi >= oldest && zi < today)
  : plenDays.filter((zi) => wantSteno(zi) && published.has(zi) && age(state.lista[zi]) > LIST_RETRY).reverse();
for (const zi of stenoDays) {
  const html = await page(stenoDayUrl(zi), `steno-${zi}`, (h) => stenoDayKind(h) !== null && stenoDayDate(h) === zi, { cached: OFFLINE });
  if (!html) continue;
  const kind = stenoDayKind(html);
  const rec = kind === 'lista' ? null : stenoRecord(zi, html, kind);
  // Fără sumar (o listă de ședințe) sau un sumar al Camerei citit doar pe jumătate (vreun punct necitit, niciun proiect):
  // nu-l scriem, ca să nu dovedească nimic; îl reluăm peste câteva zile, până la STENO_GIVE_UP_DAYS.
  if (!rec || (kind === 'camera' && (!rec.complet || !rec.puncte.some((p) => p.numere.length)))) {
    if (!OFFLINE) state.lista[zi] = new Date().toISOString();
    saveState();
    console.log(`  ⚠️ stenograma din ${zi}: pagina n-are sumarul întreg al unei singure ședințe (${kind}); o reluăm peste câteva zile`);
    continue;
  }
  const before = readJson(plenFile(zi)) ?? { zi };
  if (OFFLINE && before.stenograma) rec.cititLa = before.stenograma.cititLa;
  writeJson(plenFile(zi), { ...before, zi, stenograma: rec });
  delete state.lista[zi];
  saveState();
  stenoRead++;
}

// Voturile electronice, doar pentru zilele de plen din agendă care n-au stenograma (o dată; pagina nu se mai schimbă).
for (const zi of plenDays) {
  const rec = readJson(plenFile(zi)) ?? { zi };
  if (rec.stenograma || (rec.voturi && !OFFLINE)) continue;
  const html = await page(evotDayUrl(zi), `voturi-${zi}`, isEvotDayPage, { cached: OFFLINE });
  if (!html) continue;
  writeJson(plenFile(zi), {
    ...rec,
    zi,
    voturi: { url: evotDayUrl(zi), cititLa: OFFLINE && rec.voturi ? rec.voturi.cititLa : new Date().toISOString(), voturi: parseEvotDay(html) },
  });
  votesRead++;
}

// ─── Comisiile ────────────────────────────────────────────────────────────────────────────────────────────────────
// Ședințele comisiilor din ultimele 15 zile: comisie → [{ zi, numere }], cu numerele proiectelor de pe ordinea de zi.
const comFile = (idc) => path.join(OUT_COM, `${idc}.json`);
const sessions = new Map();
for (const zi of agendaDays.filter((d) => d < today && d >= shift(today, -COMMITTEE_LOOKBACK) && d >= FROM)) {
  for (const f of fs.readdirSync(path.join(AGENDA, zi)).filter((f) => /^\d+\.json$/.test(f))) {
    const day = readJson(path.join(AGENDA, zi, f));
    // Pagina comisiei are doar legile (PL-x, Pl-x): hotărârile Camerei (PHCD) n-au cum să apară acolo.
    const numere = [...new Set((day?.puncte ?? []).map((p) => numberKey(p.numar)).filter((k) => k?.startsWith('PLX ')))];
    if (numere.length) sessions.set(f.slice(0, -5), [...(sessions.get(f.slice(0, -5)) ?? []), { zi, numere }]);
  }
}
/** Câte proiecte de pe ordinile de zi ale comisiei n-au încă un document al ei datat din ziua ședinței încoace. */
const open = (idc) => {
  const docs = readJson(comFile(idc))?.documente ?? [];
  return sessions.get(idc).reduce((n, s) => n + s.numere.filter((k) => !docs.some((d) => d.numar === k && d.data >= s.zi)).length, 0);
};
const due = [...sessions.keys()]
  .filter((idc) => OFFLINE || (open(idc) > 0 && age(state.comisii[idc]) > COMMITTEE_EVERY))
  .sort((a, b) => (state.comisii[a] ?? '').localeCompare(state.comisii[b] ?? ''))
  .slice(0, OFFLINE ? Infinity : MAX_COMMITTEES);
let comRead = 0;
let newDocs = 0;
for (const idc of due) {
  // Pagina e pe ani: anul curent și, în ianuarie, și anul trecut, dacă au fost ședințe atunci.
  const years = [...new Set([today.slice(0, 4), ...sessions.get(idc).map((x) => x.zi.slice(0, 4))])].sort().reverse();
  const fresh = [];
  let read = 0;
  for (const year of years) {
    const html = await page(committeeDocsUrl(idc, year), `comisia-${idc}-${year}`, isCommitteeDocsPage, { cached: OFFLINE });
    if (!html) continue;
    fresh.push(...parseCommitteeDocs(html));
    read++;
  }
  if (!read) continue;
  const before = readJson(comFile(idc));
  const known = new Map((before?.documente ?? []).map((d) => [d.pdf, d]));
  for (const d of fresh) {
    if (!known.has(d.pdf) && d.data >= oldest) newDocs++;
    known.set(d.pdf, d);
  }
  const documente = [...known.values()].filter((d) => d.data >= oldest).sort((a, b) => b.data.localeCompare(a.data) || a.pdf.localeCompare(b.pdf));
  writeJson(comFile(idc), { idc, url: committeeDocsUrl(idc, years[0]), cititLa: OFFLINE && before ? before.cititLa : new Date().toISOString(), documente });
  if (!OFFLINE) state.comisii[idc] = new Date().toISOString();
  saveState();
  comRead++;
}

// Zilele de plen mai vechi de KEEP_DAYS nu mai au ordine de zi în agendă.
for (const f of fs.existsSync(OUT_PLEN) ? fs.readdirSync(OUT_PLEN) : []) {
  if (/^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f.slice(0, 10) < oldest) fs.rmSync(path.join(OUT_PLEN, f));
}
saveState();
const waiting = plenDays.filter(wantSteno);
const summary = {
  start: new Date(started).toISOString(),
  gata: new Date().toISOString(),
  cereri: requests,
  stenograme: stenoRead,
  voturi: votesRead,
  comisii: comRead,
  documenteNoi: newDocs,
  faraStenograma: waiting,
  nota: note || undefined,
};
fs.mkdirSync(CACHE, { recursive: true });
if (!OFFLINE) fs.appendFileSync(path.join(CACHE, 'citiri.jsonl'), JSON.stringify(summary) + '\n');
console.log(
  `🏛️ Camera, ce s-a întâmplat: ${stenoRead} stenograme, ${votesRead} zile de voturi, ${comRead} comisii (${newDocs} documente noi); ` +
    `${waiting.length ? `fără stenogramă încă: ${waiting.join(', ')}; ` : ''}${requests} cereri` +
    (note ? ` (${note})` : ''),
);
