#!/usr/bin/env node
// Proiectele înregistrate la Camera Deputaților în anii trecuți (din 2025 înapoi până în 2020) și încă în dezbatere.
// straja-cdep.mjs citește doar anul curent; un proiect din 2025 aflat încă la comisii (PL-x 400/2025) lipsea de pe site.
//
//   node scripts/straja-cdep-vechi.mjs [--max=10] [--liste] [--asteapta] [--ani=2025,2024] [--intai=plx-400-2025]
//
// Lista fiecărui an (o cerere pe an, întâi 2025, apoi 2024 … 2020) se recitește cel mult o dată pe săptămână, sau acum
// cu --liste. Din ea păstrăm în data/cdep/ani/<an>.json proiectele aflate acum la Cameră (AT_CHAMBER) și pe cele pe
// care le urmăream deja, cu stadiul nou: un proiect care pleacă de la Cameră își păstrează pagina. Fișa unui proiect
// (data/cdep/proiecte/<slug>.json, ca la anul curent) se citește când lipsește sau când rândul din listă îi arată alt
// stadiu și, ca la anul curent, se recitește după ședințele de comisie, la termene și la 6–8 săptămâni
// (lib/cdep-reread.mjs): un aviz sau un raport nou nu schimbă stadiul din listă. Recitirile le face întâi VM-ul; aici
// ajung doar cele rămase necitite de două zile. Cel mult --max fișe pe rulare (implicit 10).
//
// --asteapta e pentru citirea lungă, pornită de mână (caffeinate -i): în zilele lucrătoare, între 08:00 și 09:20, Mac-ul
// e fără rețea, așa că așteaptă până la 09:20; cât ops/daily.lock al copiei principale numește un proces viu, îi lasă
// rândul actualizării zilnice; după un captcha așteaptă cele două ore o singură dată, la al doilea se oprește. Se poate
// relua oricând: citește doar ce lipsește.
//
// VM-ul destraja citește și el fișe din aceeași coadă (scripts/vm/cdep-vm.mjs; un buget pe IP, vezi
// scripts/lib/cdep-peer.mjs): la pornire și apoi o dată la 15 minute aducem prin ssh HTML-ul citit de el, îl citim aici cu
// același parseSheet și îi trimitem coada nouă. El ia fișele de la coada cozii, noi de la cap, și fiecare fișă se
// revendică întâi pe VM, deci nu se cere de două ori. Cu --asteapta, când tot ce a rămas e la VM, așteptăm și aducem.
//   --doar-vm   doar aduce și citește fișele de pe VM, fără nicio cerere la cdep.ro (pasul din actualizarea zilnică)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CdepBlocked, committeeUrl, fetchCdep, listUrl, parseCommitteeEmail, parseList, parseSheet, sheetUrl } from './lib/cdep.mjs';
import { AT_CHAMBER, oldYearsDir } from './lib/cdep-index.mjs';
import { mirrorEntries, mirrorHtml, peerEnabled, peerHello, syncMirror, vmCall } from './lib/cdep-peer.mjs';
import { byUrgency, dayOf, readHere, readMeetings, rereadDue, rereadSummary } from './lib/cdep-reread.mjs';
import { writeFileAtomic } from './lib/atomic.mjs';
import { todayBucharest } from './lib/web.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const DIR = oldYearsDir(DATA);
const SHEETS = path.join(DATA, 'cdep', 'proiecte');
const HTML_CACHE = path.join(ROOT, '.cache', 'cdep-html');
const BLOCK_FILE = path.join(ROOT, '.cache', 'cdep-blocked-until');
const arg = (name, def) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? def;
const has = (name) => process.argv.includes(`--${name}`);

const THIS_YEAR = new Date().getFullYear();
const FIRST_YEAR = 2020;
const YEARS = arg('ani', '')
  ? arg('ani').split(',').map(Number)
  : Array.from({ length: THIS_YEAR - FIRST_YEAR }, (_, i) => THIS_YEAR - 1 - i);
const MAX = +arg('max', 10);
const FORCE_LISTS = has('liste');
const WAIT = has('asteapta');
const FIRST = new Set(arg('intai', '').split(',').filter(Boolean));
const VM_ONLY = has('doar-vm');
// O săptămână, cu o oră de toleranță: rularea de luni 09:30 trebuie să prindă lista citită lunea trecută la 09:35.
const LIST_EVERY_MS = 7 * 86_400_000 - 3_600_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (line) => console.log(`[${new Date().toLocaleTimeString('ro-RO', { timeZone: 'Europe/Bucharest' })}] ${line}`);
const readJson = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);
const writeJson = (file, data) => writeFileAtomic(file, JSON.stringify(data, null, 1) + '\n');
const slugOf = (row) => `${row.tip.toLowerCase().replace(/[^a-z]/g, '')}-${row.nr}-${row.an}`.replace(/^pl(x)?-/, 'plx-');

// ─── Când avem voie să cerem ──────────────────────────────────────────────────────────────────────────────────────
// Copia principală e cea către care arată .cache (în copiile de lucru e un link); acolo stă lacătul actualizării zilnice.
const MAIN = (() => {
  try {
    return path.dirname(fs.realpathSync(path.join(ROOT, '.cache')));
  } catch {
    return ROOT;
  }
})();
const DAILY_LOCKS = [...new Set([path.join(ROOT, 'ops', 'daily.lock'), path.join(MAIN, 'ops', 'daily.lock')])];

/** Actualizarea zilnică rulează acum, alta decât cea care ne-a pornit pe noi. */
function dailyRunning() {
  for (const file of DAILY_LOCKS) {
    try {
      const pid = Number(fs.readFileSync(file, 'utf8'));
      if (!pid || pid === process.ppid || pid === process.pid) continue;
      process.kill(pid, 0);
      return true;
    } catch {}
  }
  return false;
}

/** Milisecunde până la 09:20, dacă suntem într-o zi lucrătoare între 08:00 și 09:20 la București (Mac-ul e pe drum). */
function commuteLeft(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  if (parts.weekday === 'Sat' || parts.weekday === 'Sun') return 0;
  const minutes = +parts.hour * 60 + +parts.minute;
  return minutes >= 8 * 60 && minutes < 9 * 60 + 20 ? (9 * 60 + 20 - minutes) * 60_000 : 0;
}

/** Așteaptă până avem voie să cerem; fără --asteapta întoarce false în loc să aștepte. */
async function mayRequest() {
  for (;;) {
    const commute = commuteLeft();
    const daily = dailyRunning();
    if (!commute && !daily) return true;
    if (!WAIT) return false;
    log(commute ? `drumul spre birou: așteptăm ${Math.round(commute / 60_000)} min` : 'rulează actualizarea zilnică: îi lăsăm rândul');
    await sleep(commute || 5 * 60_000);
  }
}

let captchas = 0;
/**
 * fetchCdep, cu așteptarea de mai sus; la captcha sau rețea căzută, cu --asteapta, mai încearcă după pauză. Cu `fresh`
 * pagina se cere de la cdep.ro chiar dacă VM-ul are o copie a ei (o fișă: copia potrivită a fost deja căutată).
 */
async function request(url, { fresh = false } = {}) {
  for (;;) {
    if (!(await mayRequest())) throw new Pause('fără rețea acum (drumul spre birou) sau rulează actualizarea zilnică');
    try {
      return await fetchCdep(url, { fresh });
    } catch (err) {
      const network = err?.cause?.code && /^(ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|UND_ERR_)/.test(err.cause.code);
      if (err instanceof CdepBlocked) {
        // Un captcha pus de alt proces înainte să pornim nu se numără: așteptăm doar să treacă pauza.
        const until = Number(fs.existsSync(BLOCK_FILE) ? fs.readFileSync(BLOCK_FILE, 'utf8') : 0) || 0;
        const ours = !/nu mai cerem nimic/.test(err.message);
        if (ours) captchas++;
        if (!WAIT || captchas >= 2) throw err;
        log(`${err.message}; așteptăm până la ${new Date(until).toLocaleTimeString('ro-RO', { timeZone: 'Europe/Bucharest' })}`);
        await sleep(Math.max(60_000, until - Date.now() + 60_000));
        continue;
      }
      if (network && WAIT) {
        log(`rețea: ${err.cause.code}; mai încercăm peste 10 minute`);
        await sleep(10 * 60_000);
        continue;
      }
      if (network) throw new Pause(`rețea: ${err.cause.code}`);
      throw err;
    }
  }
}
class Pause extends Error {}

// ─── Listele pe an ────────────────────────────────────────────────────────────────────────────────────────────────
fs.mkdirSync(DIR, { recursive: true });
fs.mkdirSync(SHEETS, { recursive: true });
fs.mkdirSync(HTML_CACHE, { recursive: true });

// Proiectele noastre de la Senat, după numărul L sau B: au deja pagina lor, aici le marcăm doar cu `senat`.
const ours = new Map();
for (const b of JSON.parse(fs.readFileSync(path.join(DATA, 'senat-bills.json'), 'utf8'))) {
  if (b.senatNr) ours.set(b.senatNr, b.slug);
  ours.set(b.id, b.slug);
}

const yearFile = (y) => path.join(DIR, `${y}.json`);
const sheetFile = (slug) => path.join(SHEETS, `${slug}.json`);
let requests = 0;
let note = '';
const listsRead = [];

try {
  for (const year of VM_ONLY ? [] : YEARS) {
    const previous = readJson(yearFile(year));
    if (!FORCE_LISTS && previous && Date.now() - Date.parse(previous.cititLa) < LIST_EVERY_MS) continue;
    const html = await request(listUrl('anp', year));
    requests++;
    const rows = parseList(html).filter((r) => r.tip !== 'BP');
    // O listă goală înseamnă alt format sau o eroare a site-ului: nu pierdem ce aveam.
    if (!rows.length) throw new Error(`lista Camerei pe ${year} n-are niciun rând; formatul s-a schimbat?`);
    const before = new Map((previous?.proiecte ?? []).map((p) => [p.slug, p]));
    const proiecte = rows
      .map((r) => {
        const slug = slugOf(r);
        const old = before.get(slug);
        return { slug, idp: r.idp, numar: r.numar, tip: r.tip, inregistrat: r.data, titlu: r.titlu, stadiu: r.stadiu, stadiuData: r.stadiuData, url: sheetUrl(r.idp), ...(old?.senat && { senat: old.senat }) };
      })
      // Și cele cu fișa deja citită: la schimbarea anului, proiectele anului trecut își păstrează paginile.
      .filter((p) => AT_CHAMBER.test(p.stadiu) || before.has(p.slug) || fs.existsSync(sheetFile(p.slug)));
    writeJson(yearFile(year), { an: year, cititLa: new Date().toISOString(), randuri: rows.length, proiecte });
    listsRead.push(year);
    log(`lista ${year}: ${rows.length} proiecte, ${proiecte.filter((p) => AT_CHAMBER.test(p.stadiu)).length} aflate acum la Cameră, ${proiecte.length} urmărite`);
  }
} catch (err) {
  if (!(err instanceof CdepBlocked) && !(err instanceof Pause)) throw err;
  note = ` (${err.message})`;
}

// ─── Fișele ───────────────────────────────────────────────────────────────────────────────────────────────────────
const years = YEARS.map((y) => readJson(yearFile(y))).filter(Boolean);
const all = years.flatMap((y) => y.proiecte);

// Fișele deja citite primesc datele noi din listă (titlul, stadiul) fără o cerere în plus; un stadiu nou cere fișa.
const ROW_KEYS = ['numar', 'tip', 'inregistrat', 'titlu', 'url'];
const changed = (p, sheet) => sheet.stadiu !== p.stadiu || sheet.stadiuData !== p.stadiuData;
for (const p of all) {
  const sheet = readJson(sheetFile(p.slug));
  if (!sheet) continue;
  if (sheet.senat) p.senat = sheet.senat;
  if (changed(p, sheet) || ROW_KEYS.every((k) => sheet[k] === p[k])) continue;
  writeJson(sheetFile(p.slug), { ...sheet, ...Object.fromEntries(ROW_KEYS.map((k) => [k, p[k]])) });
}

// Ordinea: cele cerute cu --intai, apoi cele pe ordinea de zi, cu raport, celelalte aflate la Cameră și abia apoi cele
// plecate între timp; în fiecare grup, anii mai noi întâi și, în an, cele mai noi.
const RANK = [/^pe ordinea de zi/i, /^raport/i];
const rank = (p) => {
  if (FIRST.has(p.slug)) return -1;
  const i = RANK.findIndex((re) => re.test(p.stadiu));
  return i !== -1 ? i : AT_CHAMBER.test(p.stadiu) ? RANK.length : RANK.length + 1;
};
const pending = all.filter((p) => {
  const sheet = readJson(sheetFile(p.slug));
  return !sheet || changed(p, sheet);
});
pending.sort((a, b) => rank(a) - rank(b) || b.inregistrat.localeCompare(a.inregistrat));
// Recitirile: fișe cu același stadiu în listă, dar cu o ședință de comisie, un termen împlinit sau necitite de mult. Stau
// la coada cozii, cea mai grabnică ultima: VM-ul ia fișele de acolo.
const today = todayBucharest();
const meetings = readMeetings(DATA);
const rereads = new Map();
{
  const first = new Set(pending.map((p) => p.slug));
  for (const p of all) {
    const due = first.has(p.slug) ? null : rereadDue(readJson(sheetFile(p.slug)), { today, meetings: meetings.get(p.slug) });
    if (due) rereads.set(p.slug, due);
  }
}
const dueAtStart = [...rereads.values()];
const again = all.filter((p) => rereads.has(p.slug)).sort((a, b) => byUrgency(rereads.get(b.slug), rereads.get(a.slug)));
// Ce e încă de citit, în ordine; o fișă iese de aici când o citim noi sau când vine de pe VM.
const left = new Map([...pending, ...again].map((p) => [p.slug, p]));
// Versiunea rândului: o fișă citită de VM pentru alt stadiu decât cel din listă nu se folosește.
const keyOf = (p) => `${p.stadiu}|${p.stadiuData ?? ''}`;

const committeesFile = path.join(DATA, 'cdep', 'comisii.json');
const committees = readJson(committeesFile) ?? {};
let read = 0;
let fromVm = 0;

/** O fișă citită (de noi sau de VM): HTML-ul în .cache, fișa în data/cdep/proiecte, ca la anul curent. */
function save(p, html, cititLa) {
  // Ca la anul curent: HTML-ul rămâne o vreme în .cache, ca straja-amendments să nu ceară fișa a doua oară.
  writeFileAtomic(path.join(HTML_CACHE, `${p.slug}.html`), html);
  const fisa = parseSheet(html);
  const senat = (fisa.numarSenat && ours.get(fisa.numarSenat)) || null;
  if (senat) p.senat = senat;
  writeJson(sheetFile(p.slug), { ...p, cititLa, fisa });
  left.delete(p.slug);
  return fisa;
}

/** Adresa de e-mail a comisiilor noi dintr-o fișă (o cerere pe comisie, o singură dată). */
async function readCommittees(fisa) {
  for (const c of [...(fisa.comisii?.raport ?? []), ...(fisa.comisii?.aviz ?? [])]) {
    if (committees[c.idc]) continue;
    committees[c.idc] = { nume: c.nume, url: committeeUrl(c.idc), email: parseCommitteeEmail(await request(committeeUrl(c.idc))) };
    requests++;
    writeJson(committeesFile, committees);
  }
}

// ─── Fișele citite de VM ──────────────────────────────────────────────────────────────────────────────────────────
let vmClaims = new Map();
let lastSync = 0;
let lastPush = Date.now();
const vmSheets = [];
/**
 * Aduce HTML-ul de pe VM în copia comună a Mac-ului (lib/cdep-peer.mjs, .cache/cdep-mirror) și citește de acolo fișele
 * noastre, apoi îi trimite VM-ului coada nouă (ce a rămas, în ordinea noastră), ca sursa „vechi”.
 */
async function syncVm() {
  if (!peerEnabled) return;
  lastSync = Date.now();
  if (await syncMirror({ force: true })) {
    let now = 0;
    for (const meta of mirrorEntries()) {
      const p = left.get(meta.slug);
      // Citită între timp, sau rândul din listă arată alt stadiu: fișa se cere din nou. La o recitire, copia trebuie să fie
      // din ziua scadentă încoace (cea dinainte e chiar fișa pe care o avem).
      if (!p || meta.key !== keyOf(p)) continue;
      if (rereads.has(p.slug) && dayOf(meta.fetchedAt) < rereads.get(p.slug).zi) continue;
      vmSheets.push(save(p, mirrorHtml(meta.slug), meta.fetchedAt));
      now++;
    }
    fromVm += now;
    if (now) log(`VM: ${now} fișe aduse și citite aici (${fromVm} în rularea asta)`);
  }
  const queue = [...left.values()].map((p) => ({ slug: p.slug, url: p.url, key: keyOf(p) }));
  const reply = await vmCall('push', { source: 'vechi', queue }, { timeoutMs: 120_000 });
  if (reply?.claims) {
    vmClaims = new Map(Object.entries(reply.claims));
    lastPush = Date.now();
  } else if (Date.now() - lastPush > 3_600_000) {
    // VM-ul nu mai răspunde de o oră: ce revendicase îl citim noi.
    vmClaims = new Map();
  }
}

// Fișele care au comisii fără adresă (de exemplu cele aduse de pe VM de pasul --doar-vm) le completăm la prima cerere.
if (!VM_ONLY) {
  for (const p of all) {
    const fisa = left.has(p.slug) ? null : readJson(sheetFile(p.slug))?.fisa;
    if ([...(fisa?.comisii?.raport ?? []), ...(fisa?.comisii?.aviz ?? [])].some((c) => !committees[c.idc])) vmSheets.push(fisa);
  }
}

// Fără el, VM-ul se oprește după 8 minute (lib/cdep-peer.mjs); pe același IP, fiecare cerere a noastră e și semn de viață.
const keepalive = WAIT && peerEnabled ? setInterval(() => peerHello(), 3 * 60_000) : null;
const SYNC_EVERY = 15 * 60_000;
if (!note) {
  try {
    await syncVm();
    while (!VM_ONLY && read < MAX) {
      if (!(await mayRequest())) throw new Pause('fără rețea acum (drumul spre birou) sau rulează actualizarea zilnică');
      if (Date.now() - lastSync > SYNC_EVERY) await syncVm();
      for (const fisa of vmSheets.splice(0)) await readCommittees(fisa);
      // Întâi fișele lipsă sau cu alt stadiu; dintre recitiri, doar cele pe care VM-ul nu le-a citit la timp.
      const open = [...left.values()].filter((x) => vmClaims.get(x.slug) !== 'vm');
      // (sau toate, când VM-ul nu mai răspunde de o oră)
      const late = (x) => !peerEnabled || Date.now() - lastPush > 3_600_000 || readHere(rereads.get(x.slug), today);
      const p = open.find((x) => !rereads.has(x.slug)) ?? open.filter(late).sort((a, b) => byUrgency(rereads.get(a.slug), rereads.get(b.slug)))[0];
      if (!p) {
        // Ce a rămas e revendicat de VM: cu --asteapta îl așteptăm și aducem fișele o dată la 5 minute.
        if (!WAIT || !peerEnabled || !left.size) break;
        await sleep(5 * 60_000);
        lastSync = 0;
        continue;
      }
      // Revendicarea pe VM; dacă VM-ul nu răspunde, cerem oricum (cel mult o fișă citită de două ori).
      const claim = await vmCall('claim', { slug: p.slug, key: keyOf(p) });
      if (claim?.by === 'vm') {
        vmClaims.set(p.slug, 'vm');
        continue;
      }
      const html = await request(p.url, { fresh: true });
      requests++;
      const fisa = save(p, html, new Date().toISOString());
      read++;
      if (read % 10 === 0) log(`${read} fișe citite, ${left.size} încă de citit (ultima: ${p.numar}, ${p.stadiu})`);
      await readCommittees(fisa);
    }
  } catch (err) {
    if (!(err instanceof CdepBlocked) && !(err instanceof Pause)) throw err;
    note = ` (${err.message})`;
  }
}
if (keepalive) clearInterval(keepalive);

// `senat` aflat din fișe ajunge și în fișierele anilor, ca proiectul să nu apară de două ori pe site.
for (const y of years) {
  const saved = new Map(readJson(yearFile(y.an)).proiecte.map((p) => [p.slug, p]));
  if (y.proiecte.some((p) => p.senat && !saved.get(p.slug)?.senat)) writeJson(yearFile(y.an), y);
}

const missing = all.filter((p) => !fs.existsSync(sheetFile(p.slug))).length;
const perYear = years.map((y) => `${y.an}: ${y.proiecte.filter((p) => AT_CHAMBER.test(p.stadiu)).length}`).join(', ');
console.log(
  `🏛️ Camera, anii trecuți: ${all.filter((p) => AT_CHAMBER.test(p.stadiu)).length} proiecte aflate la Cameră (${perYear}); ` +
    `${listsRead.length ? `liste citite: ${listsRead.join(', ')}; ` : ''}${read} fișe citite${peerEnabled ? `, ${fromVm} aduse de pe VM` : ''}, ${left.size} încă de citit (${missing} lipsă); ${rereadSummary(dueAtStart)}; ${requests} cereri${note}`,
);
