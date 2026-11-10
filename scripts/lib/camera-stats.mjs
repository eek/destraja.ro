// Cifrele despre Camera Deputaților pentru ediția specială a alertelor (straja-digest --anunt=camera) și pentru imaginea
// de share (straja-share): aceleași numere în ambele.
import fs from 'node:fs';
import path from 'node:path';
import { AT_CHAMBER, readCdepIndex } from './cdep-index.mjs';

const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);

const nameKey = (name) => name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Cifrele despre Cameră din datele de azi: proiecte, analize, forme comparate, parlamentari. `senateBills` sunt proiectele
 * Senatului cu analiză (pentru numărul parlamentarilor, ca pe /parlamentari). `today` (AAAA-LL-ZZ) e ziua față de care
 * numărăm termenele încă deschise, ca pe cardul Camerei de pe prima pagină.
 */
export function cameraStats(DATA, senateBills, today = new Date().toISOString().slice(0, 10)) {
  // Totalurile („toate cele N proiecte din 2026”) sunt ale anului listei; „în dezbatere acum” (here) cuprinde și
  // proiectele din anii trecuți încă la Cameră (data/cdep/ani, scripts/straja-cdep-vechi.mjs).
  const index = readCdepIndex(DATA);
  const all = index.proiecte
    .filter((p) => !p.senat)
    .map((p) => ({ ...p, analysis: readJson(path.join(DATA, 'analyses', `${p.slug}.json`), null), sheet: readJson(path.join(DATA, 'cdep', 'proiecte', `${p.slug}.json`), null) }))
    .filter((b) => b.analysis)
    .map((b) => ({ ...b, level: b.analysis.consensus.riskLevel, score: b.analysis.consensus.riskScore, title: b.analysis.consensus.plainTitle }));
  const thisYear = (p) => !index.an || p.inregistrat?.startsWith(String(index.an));
  const rows = index.proiecte.filter((p) => !p.senat && thisYear(p));
  const bills = all.filter(thisYear);
  const levels = { red: 0, yellow: 0, green: 0 };
  for (const b of bills) levels[b.level]++;
  const here = all.filter((b) => AT_CHAMBER.test(b.stadiu));
  // Termenele încă deschise: amendamentele și consultarea publică a Camerei (src/app/page.tsx).
  const amend = here.map((b) => b.sheet?.fisa.comisii?.termenAmendamente).filter((d) => d && d >= today);
  const consult = here.map((b) => b.sheet?.fisa.consultare?.termen).filter((d) => d && d >= today);
  // Primul termen de amendamente încă deschis, pentru „Pe scurt” din e-mail.
  const amendTerm = (b) => b.sheet?.fisa.comisii?.termenAmendamente ?? '';
  const nextAmend = here.filter((b) => amendTerm(b) >= today).sort((a, b) => amendTerm(a).localeCompare(amendTerm(b)))[0];
  const government = bills.filter((b) => b.sheet && !b.sheet.fisa.initiatori.length).length;

  // Comparația formelor: direcția ultimei schimbări, ca în lista de pe site.
  const versions = fs.existsSync(path.join(DATA, 'analyses', 'versions'))
    ? fs
        .readdirSync(path.join(DATA, 'analyses', 'versions'))
        .filter((f) => f.endsWith('.json'))
        .map((f) => readJson(path.join(DATA, 'analyses', 'versions', f), null))
        .filter((v) => v?.changes?.length)
    : [];
  const direction = { mai_riscant: 0, mai_putin_riscant: 0, la_fel: 0 };
  for (const v of versions) direction[v.changes.at(-1).direction]++;
  const riskier = versions
    .filter((v) => v.changes.at(-1).direction === 'mai_riscant')
    .map((v) => ({ v, delta: v.versions.at(-1).riskScore - v.versions[0].riskScore }))
    .sort((a, b) => b.delta - a.delta)[0]?.v;

  // Cât mai e de comparat (scripts/straja-council.mjs --versions scrie fișierul la fiecare rulare).
  const status = readJson(path.join(DATA, 'cdep', 'versions-status.json'), null);

  // Parlamentarii cu cel puțin un proiect analizat, la Senat sau la Cameră (ca pe /parlamentari).
  const mps = new Set();
  for (const b of senateBills) for (const i of b.initiators) mps.add(nameKey(i.name));
  for (const b of bills) for (const i of b.sheet?.fisa.initiatori ?? []) mps.add(nameKey(i.nume));
  mps.delete('');

  return {
    total: rows.length,
    analysed: bills.length,
    levels,
    here: here.length,
    hereRed: here.filter((b) => b.level === 'red').length,
    hereLevels: { red: 0, yellow: 0, green: 0, ...Object.fromEntries(['red', 'yellow', 'green'].map((l) => [l, here.filter((b) => b.level === l).length])) },
    top: here
      .filter((b) => b.level === 'red')
      .sort((a, b) => b.score - a.score)
      .map((b) => ({ ...b, bad: readJson(path.join(DATA, 'analyses', 'balance', `${b.slug}.json`), null)?.bad.toSorted((x, y) => y.weight - x.weight)[0]?.text ?? null })),
    amendOpen: amend.length,
    nextAmend: nextAmend ? { slug: nextAmend.slug, numar: nextAmend.numar, termen: amendTerm(nextAmend) } : null,
    lastTerm: [...amend, ...consult].sort().at(-1) ?? null,
    government,
    compared: versions.length,
    comparePending: status?.pending.length ?? 0,
    direction,
    riskier,
    mps: mps.size,
  };
}
