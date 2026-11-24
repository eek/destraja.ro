#!/usr/bin/env node
// Monitorul Oficial, Partea I → data/mo/stats.json (agregatele pentru /monitorul-oficial) și data/mo/legi.json
// (publicarea legilor în care s-au transformat proiectele noastre). Citește doar fișierele setului de date
// ~/work/monitorul-oficial; nu cere nimic din rețea. Fără setul de date iese liniștit.
//
// Sursa principală e tabelul întreg al actelor de pe NAS, nas-exports/acts.ndjson (actele cerute portalului după id,
// plus importul romanian-law-data, din 1990). Fiecare act se completează, după id, cu copia lui din listele pe zile
// (samples/<zi>/, cu paginile în formatul vechi citite din .cache/http): titlul, decretul de promulgare, eticheta exactă
// a tipului. Fără tabel, rămân listele pe zile și nas-exports/extra-acts.json, ca înainte, din 2003.
//
//   node scripts/straja-mo.mjs            # MO_DIR=~/work/monitorul-oficial
//
// Rulat zilnic de straja-daily.mjs. Când se completează anii lipsă din setul de date, o rulare nouă refăcută totul.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeFileAtomic } from './lib/atomic.mjs';
import { addDays, aggregate, dayStatus, decreeIndex, lawIndex, lawOfSheet, matchBills } from './lib/mo.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MO_DIR = process.env.MO_DIR || path.join(os.homedir(), 'work', 'monitorul-oficial');
const SAMPLES = path.join(MO_DIR, 'samples');
const OUT = path.join(ROOT, 'data', 'mo');
const ACTS_FILE = path.join(MO_DIR, 'nas-exports', 'acts.ndjson');
const TABLE = fs.existsSync(ACTS_FILE);
const FROM = TABLE ? '1990-01-01' : '2003-01-01';

if (!fs.existsSync(SAMPLES)) {
  console.log(`[mo] ${SAMPLES} lipsește; sar peste.`);
  process.exit(0);
}

// Fără cititorul formatului vechi, anii 2003–2011 ar ieși fără număr, titlu și Monitor: ieșim cu eroare și rămân
// fișierele de ieri (straja-daily.mjs raportează pasul eșuat).
let legacy;
let portal;
try {
  legacy = await import(pathToFileURL(path.join(MO_DIR, 'lib', 'parse-legacy.mjs')).href);
  portal = await import(pathToFileURL(path.join(MO_DIR, 'lib', 'parse-portal.mjs')).href);
} catch (e) {
  console.error(`[mo] nu pot încărca bibliotecile din ${MO_DIR}/lib: ${e.message}. Las datele de ieri.`);
  process.exit(1);
}

const readJson = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

const dates = fs.readdirSync(SAMPLES).filter((d) => /^(199\d|20\d\d)-\d{2}-\d{2}$/.test(d)).sort();
const days = [];
const unusable = [];
let unread = 0;
let completed = 0;
for (const date of dates) {
  const summary = readJson(path.join(SAMPLES, date, 'summary.json'));
  if (!summary) continue;
  const doc = readJson(path.join(SAMPLES, date, 'partea-i.json'));
  let status = dayStatus(summary);
  // Rezumatul spune că sunt acte, dar fișierul lor lipsește sau nu se citește: ziua nu e folosibilă.
  if (!doc && (summary.parts?.['partea-i']?.acts ?? 0) > 0) {
    unusable.push(date);
    status = 'lipsă';
  }
  let acts = doc ? doc.issues.flatMap((i) => i.acts) : [];
  if (acts.some((a) => !a.designation)) {
    const r = legacy.completeLegacyActs(MO_DIR, date, acts, doc.portalTotal);
    acts = r.acts;
    unread += r.unread;
    completed += r.completed;
    // Decretele de promulgare se leagă de legea lor în același număr de Monitor (ca în bin/day.mjs).
    if (r.completed) {
      const byIssue = new Map();
      for (const a of acts) {
        if (!a.mo) continue;
        const k = `${a.mo.number}:${a.mo.bis ? 'bis' : ''}`;
        byIssue.set(k, [...(byIssue.get(k) ?? []), a]);
      }
      for (const group of byIssue.values()) portal.pairDecreesWithLaws(group);
    }
    // Acte rămase necitite (paginile lor lipsesc din cache): ziua e parțială, nu completă.
    if (r.completed < r.unread && status === 'ok') status = 'parțială';
  }
  days.push({ date, status, acts });
}
if (!days.length) {
  console.error('[mo] nicio zi citibilă în setul de date. Las datele de ieri.');
  process.exit(1);
}

// Actele pe care listele pe zile ale portalului le sar (numere întregi de Monitor, sau acte din numere listate),
// găsite pe NAS după numărul Monitorului și, pentru legi, prin SOAP după număr: nas-exports/extra-acts.json, adus cu
// rsync din ~/work/mo-nas/exports. Fiecare intră în ziua publicării lui, o singură dată după id-ul din portal.
const extraFile = path.join(MO_DIR, 'nas-exports', 'extra-acts.json');
const extraDoc = readJson(extraFile);
// Tabelul întreg le cuprinde deja: extra-acts.json se folosește doar fără el.
const extra = TABLE ? [] : Array.isArray(extraDoc) ? extraDoc : (extraDoc?.acts ?? []);
let extraAdded = 0;
if (extra.length) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const known = new Set(days.flatMap((d) => d.acts.map((a) => a.portalId)).filter(Boolean));
  const touched = new Set();
  for (const a of extra) {
    const day = byDate.get(a.mo?.date);
    if (!day || !a.portalId || known.has(a.portalId)) continue;
    day.acts.push({ links: {}, ...a });
    known.add(a.portalId);
    touched.add(day);
    extraAdded++;
  }
  // Legea și decretul ei de promulgare, adăugate din același număr de Monitor, se leagă ca în bin/day.mjs.
  for (const day of touched) {
    const byIssue = new Map();
    for (const a of day.acts) {
      if (!a.mo) continue;
      const k = `${a.mo.number}:${a.mo.bis ? 'bis' : ''}`;
      byIssue.set(k, [...(byIssue.get(k) ?? []), a]);
    }
    for (const group of byIssue.values()) portal.pairDecreesWithLaws(group);
  }
  console.log(`[mo] acte sărite de listele pe zile, adăugate din ${path.relative(MO_DIR, extraFile)}: ${extraAdded} din ${extra.length}`);
}
let to = days.at(-1).date;
// Tabelul întreg: actele după data Monitorului, fiecare zi din 1990 până azi; listele pe zile doar completează.
let undated = [];
let tableInfo = null;
if (TABLE) {
  const lines = fs.readFileSync(ACTS_FILE, 'utf8').split('\n');
  const meta = JSON.parse(lines[0])._meta ?? {};
  const sampleById = new Map();
  for (const d of days) for (const a of d.acts) if (a.portalId) sampleById.set(a.portalId, a);
  const info = { generatedAt: meta.generatedAt ?? null, rows: 0, buletinOficial: 0, before1990: 0, parteaV: 0, unpublished: 0, partNull: 0, undatedWithYear: 0, undatedNoYear: 0, fromDayListsOnly: 0, future: 0 };
  const byDate = new Map();
  const seenIds = new Set();
  const today = new Date().toISOString().slice(0, 10);
  const place = (a) => {
    const d = a.mo?.date;
    if (d && d > today) return void info.future++;
    if (d && d < FROM) return void info.before1990++;
    if (a.mo && a.mo.number === 0) a.notInGazette = true;
    if (d) byDate.set(d, [...(byDate.get(d) ?? []), a]);
    else if (a.year) {
      info.undatedWithYear++;
      undated.push(a);
    } else info.undatedNoYear++;
  };
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const nd = JSON.parse(line);
    info.rows++;
    seenIds.add(nd.portalId);
    const part = nd.mo?.part ?? null;
    // Buletinul Oficial (înainte de 1990) și broșurile: în afara zidului, doar numărate în notă.
    if (part === 'BO' || part === 'Broşură' || part === 'Broșură') {
      info.buletinOficial++;
      continue;
    }
    if (part && part !== 'I') {
      info.parteaV++;
      continue;
    }
    // „GUVERNUL NEPUBLICAT”, „CONSILIUL DE STAT NEPUBLICAT”: acte care n-au apărut în Monitor.
    if ((nd.issuers ?? []).some((i) => /nepublicat/i.test(i))) {
      info.unpublished++;
      continue;
    }
    if (nd.mo && !part) info.partNull++;
    const s = sampleById.get(nd.portalId);
    const a = s
      ? {
          ...nd,
          type: s.type || nd.type,
          typeLabel: s.typeLabel || nd.typeLabel,
          title: s.title || null,
          designation: s.designation || null,
          issuers: s.issuers?.length ? s.issuers : nd.issuers,
          number: nd.number ?? s.number,
          numberRaw: nd.numberRaw ?? s.numberRaw,
          year: nd.year ?? s.year,
          actDate: nd.actDate ?? s.actDate,
          mo: nd.mo?.date ? nd.mo : s.mo,
          inForceFrom: nd.inForceFrom ?? s.inForceFrom,
          links: s.links ?? {},
        }
      : { ...nd, title: null, links: {} };
    place(a);
  }
  // Actele din listele pe zile pe care tabelul nu le are încă (cele mai noi zile).
  for (const d of days)
    for (const a of d.acts)
      if (a.portalId && !seenIds.has(a.portalId)) {
        info.fromDayListsOnly++;
        place({ ...a });
      }
  const last = [...byDate.keys()].sort().at(-1);
  to = last > to ? last : to;
  const rebuilt = [];
  for (let d = FROM; d <= to; d = addDays(d, 1)) rebuilt.push({ date: d, status: 'ok', acts: byDate.get(d) ?? [] });
  days.length = 0;
  days.push(...rebuilt);
  tableInfo = info;
  console.log(`[mo] tabelul întreg (${path.relative(MO_DIR, ACTS_FILE)}, ${meta.generatedAt}): ${JSON.stringify(info)}`);
}
console.log(`[mo] ${days.length} zile citite (${days[0].date} … ${to}); format vechi: ${completed} din ${unread} acte completate din cache`);
if (unusable.length) console.log(`[mo] zile cu partea-i.json lipsă sau stricat (numărate ca necitite): ${unusable.join(', ')}`);

const stats = aggregate(days, { from: FROM, to, undated, quality: TABLE });
const generatedAt = new Date().toISOString();
const source = {
  name: 'Portalul Legislativ (legislatie.just.ro), Ministerul Justiției',
  note: 'Indexul portalului, nu Monitorul Oficial însuși: actele apar cu întârziere și nu orice element al unui număr e indexat. Doar Monitorul Oficial tipărit e autentic.',
};
const statsText = JSON.stringify({ generatedAt, source, mode: TABLE ? 'tabel' : 'zile', table: tableInfo, legacyCompleted: { unread, completed }, unusableDays: unusable, ...stats }) + '\n';

// Legăturile cu proiectele: fișele Camerei și, pentru Senat, fișa Camerei a proiectului legat.
const bills = [];
const cdepDir = path.join(ROOT, 'data', 'cdep', 'proiecte');
for (const f of fs.readdirSync(cdepDir).filter((x) => x.endsWith('.json'))) {
  const b = readJson(path.join(cdepDir, f));
  if (b?.fisa) bills.push({ slug: b.slug, chamber: 'camera', law: lawOfSheet(b.fisa, b.stadiu) });
}
const camDir = path.join(ROOT, 'data', 'camera');
for (const f of fs.existsSync(camDir) ? fs.readdirSync(camDir).filter((x) => x.endsWith('.json')) : []) {
  const b = readJson(path.join(camDir, f));
  if (b?.fisa) bills.push({ slug: b.slug, chamber: 'senat', law: lawOfSheet(b.fisa, b.stadiu) });
}
const allActs = days.flatMap((d) => d.acts);
const index = lawIndex(allActs);
const covered = new Set(stats.coverage.filter((c) => c.ok + c.partial > 0).map((c) => c.year));
// Legile fără dată de publicare n-au Monitor de arătat: indexul legilor folosește doar actele datate.
const { matched, misses } = matchBills(bills, index, { coveredYear: (y) => covered.has(y), decrees: decreeIndex(allActs) });
const withLaw = bills.filter((b) => b.law).length;
const legiText = JSON.stringify({ generatedAt, source, samplesTo: to, billsWithLaw: withLaw, matchedCount: Object.keys(matched).length, bills: matched, misses }, null, 1) + '\n';
// Ambele fișiere din aceeași rulare, scrise abia după ce s-au calculat amândouă.
writeFileAtomic(path.join(OUT, 'stats.json'), statsText);
writeFileAtomic(path.join(OUT, 'legi.json'), legiText);
console.log(`[mo] proiecte devenite lege: ${withLaw}; găsite în Monitor: ${Object.keys(matched).length}; nepotriviri: ${misses.length}`);
for (const m of misses) console.log(`[mo]   ${m.slug} ${m.law}: ${m.reason}`);
