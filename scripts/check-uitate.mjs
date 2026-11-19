#!/usr/bin/env node
// Verifică cifrele paginii /uitate (src/lib/uitate.ts) pe datele de azi: sumele se închid și regulile pasului procedural
// se poartă cum spune metodologia. Rulează: node scripts/check-uitate.mjs [--azi=2026-11-19] [--detalii]
// Compilează src/lib/uitate.ts cu esbuild (vine cu wrangler) într-un fișier temporar și îl încarcă.
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const arg = (name, def) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? def;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// --date=<director>: datele altei copii (de exemplu copia principală), cu codul de aici.
const DATA_ROOT = path.resolve(arg('date', ROOT));
const today = arg('azi', new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date()));

const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'uitate-')), 'uitate.mjs');
await build({
  entryPoints: [path.join(ROOT, 'src/lib/uitate.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  tsconfig: path.join(ROOT, 'tsconfig.json'),
  logLevel: 'error',
});
process.chdir(DATA_ROOT);
const U = await import(pathToFileURL(out).href);

let failures = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL ${name}\n     ${err.message.split('\n').join('\n     ')}`);
  }
};

// ─── Regulile, pe rânduri reale din fișe ───────────────────────────────────────────────────────────────────────────
check('avizele, termenele și ordinea de zi nu sunt pași', () => {
  for (const a of [
    'primire aviz de la: Consiliul Legislativ',
    'primire punct de vedere de la Guvern',
    'înscris pe ordinea de zi a Camerei Deputatilor sub rezerva depunerii raportului',
    'plenul aproba modificarea termenului de adoptare la 60 de zile pentru Camera Deputatilor',
    'Biroul permanent a aprobat prelungirea termenului de depunere a raportului',
    'retragerea semnăturii',
    'trimis pentru aviz la: Comisia juridică',
  ])
    assert.equal(U.stepKind(a), null, a);
});
check('sesizarea, raportul, retrimiterea, plenul și votul sunt pași', () => {
  const cases = [
    ['prezentare în Biroul Permanent al Camerei Deputatilor', 'sosire'],
    ['trimis pentru raport la: Comisia pentru muncă', 'comisii'],
    ['trimis pentru raport suplimentar la: Comisia juridică', 'retrimis'],
    ['plenul Camerei Deputatilor aproba retransmiterea la comisii', 'retrimis'],
    ['primire raport de respingere de la: Comisia pentru muncă', 'raport'],
    ['dezbatere în plenul Camerei Deputatilor consultati stenograma', 'plen'],
    ['adoptat de Camera Deputatilor rezultat vot pentru=200', 'vot'],
    ['respinsa de catre Senat', 'vot'],
    ['adoptat de Senat ca urmare a depasirii termenului de adoptare', 'vot'],
    ['vot final adoptare - fără majoritate calificată', 'vot'],
    ['Biroul permanent aproba solicitarea de sesizare în fond primita de la: Comisia pentru agricultură', 'comisii'],
    ['încetarea procedurii legislative prin respingere definitiva de catre Senat', 'incheiat'],
  ];
  for (const [a, k] of cases) assert.equal(U.stepKind(a), k, a);
});
check('pragul de un an: din ziua de după aniversare; 29 februarie → 28 februarie', () => {
  assert.equal(U.olderThan('2025-11-19', 1, '2026-11-19'), false);
  assert.equal(U.olderThan('2025-11-19', 1, '2026-11-20'), true);
  assert.equal(U.anniversary('2024-02-29', 1), '2025-02-28');
  assert.equal(U.anniversary('2024-02-29', 4), '2028-02-29');
  assert.equal(U.bandOf(null, today), 'necunoscut');
});
check('retrimiterea pentru raport suplimentar repornește ceasul', () => {
  const tl = [
    { camera: 'Camera Deputaților', data: '01.03.2021', actiune: 'prezentare în Biroul Permanent al Camerei Deputatilor' },
    { camera: 'Camera Deputaților', data: '01.06.2021', actiune: 'primire raport favorabil de la: Comisia juridică' },
    { camera: 'Camera Deputaților', data: '01.07.2021', actiune: 'înscris pe ordinea de zi a Camerei Deputatilor' },
    { camera: 'Camera Deputaților', data: '10.07.2021', actiune: 'trimis pentru raport suplimentar la: Comisia juridică' },
    { camera: 'Camera Deputaților', data: '01.02.2025', actiune: 'primire aviz de la: Comisia pentru buget' },
    { camera: 'Camera Deputaților', data: '01.03.2026', actiune: 'înscris pe ordinea de zi a Camerei Deputatilor sub rezerva depunerii raportului' },
  ];
  const last = U.lastProceduralStep(tl, '2021-03-01');
  assert.equal(last.date, '2021-07-10');
  assert.equal(last.kind, 'retrimis');
});

// ─── Sumele, pe datele de azi ──────────────────────────────────────────────────────────────────────────────────────
const d = await U.getUitate(today);
assert.ok(d, 'lipsesc datele Camerei');
const sum = (xs) => xs.reduce((s, x) => s + x, 0);

check('benzile de vechime + data neconfirmată = totalul de la Cameră', () => assert.equal(sum(d.bands.map((b) => b.count)), d.total));
check('stadiile („unde așteaptă”) = totalul', () => assert.equal(sum(d.byWait.map((w) => w.count)), d.total));
check('peste un an pe stadii = peste un an în total', () => assert.equal(sum(d.byWait.map((w) => w.over1)), d.over1));
check('benzile cumulate: > 1 an = 1–2 + 2–4 + > 4', () => {
  const b = Object.fromEntries(d.bands.map((x) => [x.key, x.count]));
  assert.equal(b.ani1_2 + b.ani2_4 + b.peste4, d.over1);
  assert.equal(b.ani2_4 + b.peste4, d.over2);
  assert.equal(b.peste4, d.over4);
});
check('inițiatorii (Guvern + parlamentari) = totalul', () => assert.equal(sum(d.initiators.map((i) => i.total)), d.total));
check('camera decizională + prima cameră + neclar = cele peste un an', () => assert.equal(d.decisional.decizionala + d.decisional.prima + d.decisional.neclar, d.over1));
check('pe ani: segmentele = proiectele înregistrate, la fiecare an complet', () => {
  for (const c of d.cohorts.filter((x) => x.complet)) assert.equal(sum(Object.values(c.counts)), c.inregistrate, `anul ${c.an}`);
});
check('pe ani: „la Cameră” (cu pas, fără pas, neconfirmat) = totalul de la Cameră', () => {
  assert.equal(sum(d.cohorts.map((c) => c.counts.activ + c.counts.nemiscat + c.counts.necunoscut - c.neurmarite)), d.total);
});
check('pe ani: „fără pas de peste un an” = cele peste un an', () => assert.equal(sum(d.cohorts.map((c) => c.counts.nemiscat)), d.over1));
check('cele mai vechi sunt în ordine și au link', () => {
  for (let i = 1; i < d.longest.length; i++) assert.ok(d.longest[i - 1].days >= d.longest[i].days);
  for (const b of d.longest) assert.ok(b.href, b.numar);
});
check('fără proiecte numărate de două ori', () => assert.equal(d.reconcile.duplicates, 0));

const n = (x) => x.toLocaleString('ro-RO');
console.log(`\nLa ${today}: ${n(d.total)} proiecte la Cameră; fără pas de peste 1 an: ${n(d.over1)}, 2 ani: ${n(d.over2)}, 4 ani: ${n(d.over4)}`);
console.log(`Benzi: ${d.bands.map((b) => `${b.key} ${b.count}`).join(', ')}`);
console.log(`Cel mai vechi: ${d.oldest?.numar}, ${d.oldest?.days} zile de la „${d.oldest?.last?.label}” (${d.oldest?.last?.date})`);
console.log(`Unde: ${d.byWait.map((w) => `${w.key} ${w.count} (${w.over1} > 1 an, ${w.subRezerva} sub rezervă)`).join('; ')}`);
console.log(`Ordonanțe: ${d.ordonante.total} (${d.ordonante.over1} > 1 an); inițiatori: ${d.initiators.map((i) => `${i.key} ${i.total}/${i.over1}`).join(', ')}`);
console.log(`Decizională (peste 1 an): ${JSON.stringify(d.decisional)}`);
console.log(`Reconciliere: ${JSON.stringify(d.reconcile)}`);
for (const c of d.cohorts) console.log(`  ${c.an}${c.complet ? '' : ' (doar urmărite)'}: ${c.inregistrate} — ${Object.entries(c.counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
if (process.argv.includes('--detalii')) {
  console.log('\nComisii:', d.committees.slice(0, 12).map((c) => `${c.nume}: ${c.asteapta}/${c.pestUnAn}`).join('\n  '));
  console.log('\nCele mai vechi:');
  for (const b of d.longest.slice(0, 15)) console.log(`  ${b.numar} ${b.days}z ${b.last?.label} ${b.last?.date} [${b.wait}] ${b.titlu.slice(0, 80)}`);
}
if (failures) {
  console.log(`\n${failures} verificări au picat`);
  process.exit(1);
}
