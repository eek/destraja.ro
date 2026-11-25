#!/usr/bin/env node
// Legislatura fiecărei semnături de pe fișele Camerei și mandatele trecute ale deputaților de acum, citite din HTML-ul
// păstrat (.cache/cdep-html și .cache/mps), fără nicio cerere la cdep.ro. Scrie data/cdep/semnaturi.json, din care
// src/lib/signed.ts pune pe pagina fiecărui parlamentar toate proiectele semnate (regulile în scripts/lib/semnaturi.mjs).
//
//   node scripts/straja-semnaturi.mjs [--cache=<folder .cache>] [--dry]
//
// Din 25 noiembrie 2026 parseSheet păstrează legislatura pe fiecare inițiator (`leg`), deci fișele citite de atunci nu mai
// au nevoie de fișierul acesta; aici rămân doar cele citite înainte. Se poate rula oricând din nou: citește tot din cache.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileAtomic } from './lib/atomic.mjs';
import { CURRENT_LEG, linkSigners, nameKey, profileMandates, sheetSigners } from './lib/semnaturi.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const CACHE = path.resolve(argv.find((a) => a.startsWith('--cache='))?.slice(8) ?? path.join(ROOT, '.cache'));
const DRY = argv.includes('--dry');
const SHEETS = path.join(ROOT, 'data', 'cdep', 'proiecte');
const OUT = path.join(ROOT, 'data', 'cdep', 'semnaturi.json');
const camOf = (rol) => (rol === 'senator' ? 1 : rol === 'deputat' ? 2 : null);

const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};

// 1. Legislatura semnăturilor de pe fișele citite înainte de `leg`: doar inițiatorii regăsiți în HTML (același idm, aceeași
// cameră, același nume), ca un HTML mai vechi sau mai nou decât fișa să nu dea legislatura altcuiva.
const legislaturi = {};
const n = { fise: 0, cuLeg: 0, faraHtml: 0, potrivite: 0, nepotrivite: 0 };
const sheets = fs
  .readdirSync(SHEETS)
  .filter((f) => f.endsWith('.json'))
  .map((f) => readJson(path.join(SHEETS, f), null))
  .filter((b) => b?.fisa?.initiatori?.length);
for (const bill of sheets) {
  n.fise++;
  const list = bill.fisa.initiatori;
  if (list.every((i) => i.leg)) {
    n.cuLeg++;
    continue;
  }
  const file = path.join(CACHE, 'cdep-html', `${bill.slug}.html`);
  if (!fs.existsSync(file)) {
    n.faraHtml++;
    continue;
  }
  const signers = sheetSigners(fs.readFileSync(file, 'utf8'));
  const found = {};
  for (const i of list) {
    const cam = camOf(i.rol);
    const hits = signers.filter((s) => s.idm === i.idm && (!cam || s.cam === cam) && nameKey(s.nume) === nameKey(i.nume));
    if (hits.length === 1 && hits[0].leg && hits[0].cam) {
      found[`${hits[0].cam}:${i.idm}`] = hits[0].leg;
      n.potrivite++;
    } else n.nepotrivite++;
  }
  const legs = new Set(Object.values(found));
  if (!legs.size) continue;
  // Aproape mereu toți semnatarii sunt din aceeași legislatură: atunci ajunge anul; altfel (sau când fișa nu spune camera
  // fiecăruia), fiecare cu cheia „cameră:idm”.
  legislaturi[bill.slug] = legs.size === 1 && Object.keys(found).length === list.length && list.every((i) => i.rol) ? [...legs][0] : found;
}

// 2. Mandatele trecute de pe fișele deputaților de acum.
const mandate = {};
const mpsDir = path.join(CACHE, 'mps');
for (const f of fs.existsSync(mpsDir) ? fs.readdirSync(mpsDir) : []) {
  const m = f.match(/structura2015_mp_idm_(\d+)_cam_2_leg_(\d{4})\.html$/);
  if (!m || Number(m[2]) !== CURRENT_LEG) continue;
  const list = profileMandates(fs.readFileSync(path.join(mpsDir, f), 'utf8'));
  if (list) mandate[`2:${CURRENT_LEG}:${m[1]}`] = list.filter((k) => !k.endsWith(`:${CURRENT_LEG}:${m[1]}`));
}

const out = {
  nota: 'Legislatura semnăturilor de pe fișele Camerei citite înainte de 25.11.2026 („leg” pe fiecare inițiator de atunci) și mandatele trecute de pe fișele deputaților; scris de scripts/straja-semnaturi.mjs.',
  legislaturi: Object.fromEntries(Object.entries(legislaturi).sort(([a], [b]) => a.localeCompare(b))),
  mandate: Object.fromEntries(Object.entries(mandate).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))),
};

// 3. Raportul legăturilor, cu aceleași reguli ca site-ul (Senatul intră doar cu numele, din legislatura de acum).
const entries = [];
const legOf = (bill, i) => {
  const side = out.legislaturi[bill.slug];
  return i.leg ?? (typeof side === 'number' ? side : side?.[`${camOf(i.rol) ?? ''}:${i.idm}`] ?? side?.[`1:${i.idm}`] ?? side?.[`2:${i.idm}`] ?? null);
};
for (const bill of [...sheets].sort((a, b) => b.inregistrat.localeCompare(a.inregistrat))) {
  for (const i of bill.fisa.initiatori) {
    const leg = legOf(bill, i);
    const side = out.legislaturi[bill.slug];
    const cam = camOf(i.rol) ?? (side && typeof side === 'object' ? (side[`1:${i.idm}`] ? 1 : side[`2:${i.idm}`] ? 2 : null) : null);
    entries.push({ cam, leg, idm: i.idm, name: i.nume, party: i.partid, bill: bill.slug });
  }
}
for (const bill of readJson(path.join(ROOT, 'data', 'senat-bills.json'), [])) {
  for (const i of bill.initiators ?? []) entries.push({ cam: camOf(i.role), leg: CURRENT_LEG, idm: null, name: i.name, party: i.party, bill: bill.slug });
}
const links = linkSigners(entries, out.mandate);
const why = {};
const unlinked = new Map();
links.forEach((l, idx) => {
  why[l.why] = (why[l.why] ?? 0) + 1;
  if (!l.person && l.why !== 'fost') {
    const e = entries[idx];
    const k = `${e.name} (${e.cam === 1 ? 'senator' : 'deputat'} ${e.leg})`;
    unlinked.set(k, { why: l.why, n: (unlinked.get(k)?.n ?? 0) + 1 });
  }
});

console.log(`fișe cu inițiatori: ${n.fise} (cu leg deja: ${n.cuLeg}, fără HTML: ${n.faraHtml}); semnături potrivite în HTML: ${n.potrivite}, nepotrivite: ${n.nepotrivite}`);
console.log(`fișe ale deputaților cu mandatele citite: ${Object.keys(mandate).length}`);
console.log('semnături după regulă:', why);
console.log(`nume nelegate (ambigue): ${unlinked.size}`);
for (const [k, v] of [...unlinked].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${k}: ${v.why}, ${v.n} semnături`);
if (!DRY) {
  writeFileAtomic(OUT, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`scris ${path.relative(ROOT, OUT)}`);
}
