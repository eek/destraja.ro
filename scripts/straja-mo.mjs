#!/usr/bin/env node
// Monitorul Oficial, Partea I → data/mo/stats.json (agregatele pentru /monitorul-oficial) și data/mo/legi.json
// (publicarea legilor în care s-au transformat proiectele noastre). Citește doar fișierele setului de date
// ~/work/monitorul-oficial (samples/<zi>/, din indexul Portalului Legislativ, și, pentru actele afișate de portal în
// formatul vechi, paginile păstrate în .cache/http); nu cere nimic din rețea. Fără setul de date iese liniștit.
//
//   node scripts/straja-mo.mjs            # MO_DIR=~/work/monitorul-oficial
//
// Rulat zilnic de straja-daily.mjs. Când se completează anii lipsă din setul de date, o rulare nouă refăcută totul.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeFileAtomic } from './lib/atomic.mjs';
import { aggregate, dayStatus, decreeIndex, lawIndex, lawOfSheet, matchBills } from './lib/mo.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MO_DIR = process.env.MO_DIR || path.join(os.homedir(), 'work', 'monitorul-oficial');
const SAMPLES = path.join(MO_DIR, 'samples');
const OUT = path.join(ROOT, 'data', 'mo');
const FROM = '2003-01-01';

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
const to = days.at(-1).date;
console.log(`[mo] ${days.length} zile citite (${days[0].date} … ${to}); format vechi: ${completed} din ${unread} acte completate din cache`);
if (unusable.length) console.log(`[mo] zile cu partea-i.json lipsă sau stricat (numărate ca necitite): ${unusable.join(', ')}`);

const stats = aggregate(days, { from: FROM, to });
const generatedAt = new Date().toISOString();
const source = {
  name: 'Portalul Legislativ (legislatie.just.ro), Ministerul Justiției',
  note: 'Indexul portalului, nu Monitorul Oficial însuși: actele apar cu întârziere și nu orice element al unui număr e indexat. Doar Monitorul Oficial tipărit e autentic.',
};
const statsText = JSON.stringify({ generatedAt, source, legacyCompleted: { unread, completed }, unusableDays: unusable, ...stats }) + '\n';

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
const { matched, misses } = matchBills(bills, index, { coveredYear: (y) => covered.has(y), decrees: decreeIndex(allActs) });
const withLaw = bills.filter((b) => b.law).length;
const legiText = JSON.stringify({ generatedAt, source, samplesTo: to, billsWithLaw: withLaw, matchedCount: Object.keys(matched).length, bills: matched, misses }, null, 1) + '\n';
// Ambele fișiere din aceeași rulare, scrise abia după ce s-au calculat amândouă.
writeFileAtomic(path.join(OUT, 'stats.json'), statsText);
writeFileAtomic(path.join(OUT, 'legi.json'), legiText);
console.log(`[mo] proiecte devenite lege: ${withLaw}; găsite în Monitor: ${Object.keys(matched).length}; nepotriviri: ${misses.length}`);
for (const m of misses) console.log(`[mo]   ${m.slug} ${m.law}: ${m.reason}`);
