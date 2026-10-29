// Cifrele despre Camera Deputaților pentru ediția specială a alertelor (straja-digest --anunt=camera) și pentru imaginea
// de share (straja-share): aceleași numere în ambele.
import fs from 'node:fs';
import path from 'node:path';

const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);

// Proiectele aflate acum în dezbatere la Cameră (aceeași regulă ca în scripts/straja-council.mjs).
const AT_CHAMBER = /^(la comisii|raport|pe ordinea de zi|în reexaminare|aviz|sesizare)/i;
const nameKey = (name) => name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Cifrele despre Cameră din datele de azi: proiecte, analize, forme comparate, parlamentari. `senateBills` sunt proiectele
 * Senatului cu analiză (pentru numărul parlamentarilor, ca pe /parlamentari).
 */
export function cameraStats(DATA, senateBills) {
  const index = readJson(path.join(DATA, 'cdep', 'index.json'), { proiecte: [] });
  const rows = index.proiecte.filter((p) => !p.senat);
  const bills = rows
    .map((p) => ({ ...p, analysis: readJson(path.join(DATA, 'analyses', `${p.slug}.json`), null), sheet: readJson(path.join(DATA, 'cdep', 'proiecte', `${p.slug}.json`), null) }))
    .filter((b) => b.analysis)
    .map((b) => ({ ...b, level: b.analysis.consensus.riskLevel, score: b.analysis.consensus.riskScore, title: b.analysis.consensus.plainTitle }));
  const levels = { red: 0, yellow: 0, green: 0 };
  for (const b of bills) levels[b.level]++;
  const here = bills.filter((b) => AT_CHAMBER.test(b.stadiu));
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
    top: here.filter((b) => b.level === 'red').sort((a, b) => b.score - a.score),
    government,
    compared: versions.length,
    direction,
    riskier,
    mps: mps.size,
  };
}
