import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { BASELINE_METHOD, baselinePrompt, textHashOf } from './baseline.mjs';
import {
  BALANCE_SCHEMA,
  COMPARE_SCHEMA,
  COUNCIL_METHOD,
  DOCX_VERSION,
  Inputs,
  balanceBasis,
  balanceInputs,
  chamberChanges,
  changesDigest,
  compareBasis,
  docxDigest,
  freshness,
  markerOf,
  queue,
  staleForSlug,
  textNameOf,
  withOrdinance,
} from './fresh.mjs';

// Un depozit mic, într-un dosar temporar: textele, baza, analizele și rezultatele derivate ale câtorva proiecte.
function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-'));
  const put = (rel, data) => {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data));
  };
  return { root, put, inp: () => new Inputs(root) };
}

const TEXT = 'Art. I. — Legea nr. 1/2020 se modifică după cum urmează: '.repeat(10);
const baselineOf = (slug, form, text, reason = 'nu e pe portal') => ({
  billId: slug, slug, form, textFile: 'x', textHash: textHashOf(text), method: BASELINE_METHOD, fetchedAt: '2026-11-20T00:00:00Z',
  acts: [{ reference: 'Legea nr. 1/2020', status: 'missing', reason, articles: [] }],
});
const keyOf = (b) => baselinePrompt(b, '/x.json').meta.key;
const council = (score, findings = ['ceva']) =>
  Object.fromEntries(['agy', 'claude', 'codex'].map((m) => [m, { model: m, status: 'ok', riskScore: score, keyFindings: findings }]));
const analysis = ({ slug, form = 'camera', text = TEXT, key, score = 5, at = '2026-11-24T10:00:00Z', method = COUNCIL_METHOD, version = form }) => ({
  billId: slug, slug, version, updatedAt: at,
  coverage: { method, form, marker: markerOf(text) },
  baseline: key === undefined ? undefined : key === 'no-acts' ? { included: false, reason: 'proiectul nu modifică un act numit în text' } : { included: true, key },
  consensus: { riskScore: score, riskLevel: score >= 6.8 ? 'red' : score >= 3.8 ? 'yellow' : 'green', plainTitle: 't' },
  council: council(score),
});

test('analiza principală: la zi, apoi text schimbat, apoi legea în vigoare schimbată, apoi metoda veche', () => {
  const r = repo();
  const bl = baselineOf('plx-1-2026', 'camera', TEXT);
  r.put('data/texts/plx-1-2026/forma_camera.txt', TEXT);
  r.put('data/baseline/plx-1-2026.json', bl);
  r.put('data/analyses/plx-1-2026.json', analysis({ slug: 'plx-1-2026', key: keyOf(bl) }));
  assert.deepEqual(staleForSlug(r.inp(), 'plx-1-2026').analysis, []);

  // Legea modificată s-a schimbat pe portal: alt conținut al bazei, altă cheie.
  r.put('data/baseline/plx-1-2026.json', baselineOf('plx-1-2026', 'camera', TEXT, 'alt motiv'));
  assert.deepEqual(staleForSlug(r.inp(), 'plx-1-2026').analysis, ['legea-în-vigoare']);

  // Textul recitit (altă amprentă): baza veche nu mai e a lui, deci doar textul e motivul.
  r.put('data/texts/plx-1-2026/forma_camera.txt', `${TEXT} Art. II.`);
  assert.deepEqual(staleForSlug(r.inp(), 'plx-1-2026').analysis, ['text']);

  r.put('data/analyses/plx-1-2026.json', analysis({ slug: 'plx-1-2026', text: `${TEXT} Art. II.`, method: 'first-14k' }));
  assert.deepEqual(staleForSlug(r.inp(), 'plx-1-2026').analysis, ['metoda']);
});

test('analiza principală: fără bază salvată acum nu e declarată învechită', () => {
  const r = repo();
  r.put('data/texts/plx-2-2026/forma_camera.txt', TEXT);
  r.put('data/analyses/plx-2-2026.json', analysis({ slug: 'plx-2-2026', key: 'abc' }));
  assert.deepEqual(staleForSlug(r.inp(), 'plx-2-2026').analysis, []);
});

test('formele: copia analizei principale e la zi doar dacă e aceeași analiză; forma veche, după metodă și bază', () => {
  const r = repo();
  const slug = 'plx-3-2026';
  const init = `${TEXT} inițial`;
  r.put(`data/texts/${slug}/forma_camera.txt`, TEXT);
  r.put(`data/texts/${slug}/forma_initiatorului.txt`, init);
  const main = analysis({ slug, key: 'no-acts', at: '2026-11-24T10:00:00Z' });
  r.put(`data/analyses/${slug}.json`, main);
  // Copia din 30 octombrie: altă analiză decât cea de acum.
  r.put(`data/analyses/versions/${slug}/camera.json`, { ...analysis({ slug, at: '2026-10-30T09:00:00Z', method: 'first-14k' }) });
  r.put(`data/analyses/versions/${slug}/initiator.json`, analysis({ slug, form: 'initiator', text: init, at: '2026-10-30T09:00:00Z', method: 'first-14k' }));
  let s = staleForSlug(r.inp(), slug);
  assert.deepEqual(s.forms, { camera: ['analiza'], initiator: ['metoda'] });

  // Refăcute: copia e analiza de acum, forma inițiatorului cu metoda de acum și baza ei.
  const bl = baselineOf(slug, 'initiator', init);
  r.put(`data/baseline/versions/${slug}/initiator.json`, bl);
  r.put(`data/analyses/versions/${slug}/camera.json`, main);
  r.put(`data/analyses/versions/${slug}/initiator.json`, analysis({ slug, form: 'initiator', text: init, key: keyOf(bl) }));
  s = staleForSlug(r.inp(), slug);
  assert.deepEqual(s.forms, { camera: [], initiator: [] });
});

test('comparația: la zi cu aceleași texte și constatări; învechită când se schimbă constatările, schema sau scorurile', () => {
  const r = repo();
  const slug = 'plx-4-2026';
  const init = `${TEXT} inițial`;
  r.put(`data/texts/${slug}/forma_camera.txt`, TEXT);
  r.put(`data/texts/${slug}/forma_initiatorului.txt`, init);
  const bl = baselineOf(slug, 'initiator', init);
  r.put(`data/baseline/versions/${slug}/initiator.json`, bl);
  const main = analysis({ slug, key: 'no-acts', score: 5 });
  r.put(`data/analyses/${slug}.json`, main);
  r.put(`data/analyses/versions/${slug}/camera.json`, main);
  r.put(`data/analyses/versions/${slug}/initiator.json`, analysis({ slug, form: 'initiator', text: init, key: keyOf(bl), score: 3 }));
  const summary = (change) => ({
    slug,
    versions: [{ key: 'initiator', riskScore: 3 }, { key: 'camera', riskScore: 5 }],
    changes: [{ from: 'initiator', to: 'camera', schema: COMPARE_SCHEMA, updatedAt: '2026-11-26T00:00:00Z', changes: [], ...change }],
  });
  r.put(`data/analyses/versions/${slug}.json`, summary({ basis: compareBasis(r.inp(), slug, 'initiator', 'camera') }));
  assert.deepEqual(staleForSlug(r.inp(), slug).versions, []);

  // Claude a găsit altceva în forma Camerei (analiza refăcută): comparația nu mai e a constatărilor de acum.
  const redone = { ...main, council: council(5, ['altceva']), updatedAt: '2026-11-27T00:00:00Z' };
  r.put(`data/analyses/${slug}.json`, redone);
  r.put(`data/analyses/versions/${slug}/camera.json`, redone);
  assert.deepEqual(staleForSlug(r.inp(), slug).versions, ['constatări']);

  // O comparație veche, fără basis, cu altă schemă; și un scor din rezumat care nu mai e al formei.
  r.put(`data/analyses/versions/${slug}.json`, { ...summary({ schema: 3, updatedAt: '2026-11-28T00:00:00Z' }), versions: [{ key: 'initiator', riskScore: 3 }, { key: 'camera', riskScore: 4 }] });
  assert.deepEqual(staleForSlug(r.inp(), slug).versions.sort(), ['metoda', 'scoruri']);
});

test('„ce e bine și ce strică”: schema 1 fără legea în vigoare, schema 2 după inputHash, basis câmp cu câmp', () => {
  const r = repo();
  const slug = 'b600-2026';
  r.put(`data/texts/${slug}/forma_initiatorului.txt`, TEXT);
  r.put(`data/analyses/${slug}.json`, analysis({ slug, form: 'initiator', version: undefined, key: 'no-acts', score: 4 }));
  r.put(`data/analyses/balance/${slug}.json`, { slug, schema: 1, riskScore: 4, inputHash: 'x' });
  assert.deepEqual(staleForSlug(r.inp(), slug).balance, ['metoda']);

  // Ca straja-balance (schema 2): sha256(text, scor, cheia bazei sau „no-acts”/„missing”, schema).
  const b = balanceInputs(r.inp(), slug);
  assert.equal(b.baseline, 'missing');
  const hash = crypto.createHash('sha256').update(`${withOrdinance(TEXT, '')}\n4\nmissing\n${BALANCE_SCHEMA}`).digest('hex').slice(0, 12);
  r.put(`data/analyses/balance/${slug}.json`, { slug, schema: 2, riskScore: 4, inputHash: hash, baseline: 'missing' });
  assert.deepEqual(staleForSlug(r.inp(), slug).balance, []);

  // Scorul analizei s-a schimbat după reanaliză.
  r.put(`data/analyses/${slug}.json`, analysis({ slug, form: 'initiator', version: undefined, key: 'no-acts', score: 6 }));
  assert.deepEqual(staleForSlug(r.inp(), slug).balance, ['scor']);

  // Cu basis (cum ar trebui să scrie de acum straja-balance): la zi, apoi legea în vigoare apare.
  r.put(`data/analyses/balance/${slug}.json`, { slug, schema: 2, basis: balanceBasis(balanceInputs(r.inp(), slug)) });
  assert.deepEqual(staleForSlug(r.inp(), slug).balance, []);
  r.put(`data/baseline/${slug}.json`, baselineOf(slug, 'initiator', TEXT));
  assert.deepEqual(staleForSlug(r.inp(), slug).balance, ['legea-în-vigoare']);
});

test('amendamentele: legate de schimbările Camerei din comparație', () => {
  const r = repo();
  const slug = 'plx-5-2026';
  const sum = { slug, versions: [], changes: [{ from: 'senat', to: 'camera', updatedAt: '2026-11-01T00:00:00Z', changes: [{ title: 'a', text: 'b', effect: 'mai_bine', after: 'x' }] }] };
  r.put(`data/analyses/versions/${slug}.json`, sum);
  r.put(`data/cdep/amendamente/${slug}.json`, { slug, schema: 3, updatedAt: '2026-11-02T00:00:00Z', basis: { changes: changesDigest(chamberChanges(sum)), prompt: 3 } });
  assert.deepEqual(staleForSlug(r.inp(), slug).amendments, []);
  r.put(`data/analyses/versions/${slug}.json`, { ...sum, changes: [{ ...sum.changes[0], changes: [{ title: 'alt', text: 'b', effect: 'mai_rau' }] }] });
  assert.deepEqual(staleForSlug(r.inp(), slug).amendments, ['schimbări']);
  // Fără basis: o schimbare a Camerei refăcută după amendamente.
  r.put(`data/cdep/amendamente/${slug}.json`, { slug, schema: 3, updatedAt: '2026-10-01T00:00:00Z' });
  assert.deepEqual(staleForSlug(r.inp(), slug).amendments, ['schimbări']);
});

test('memoriul .docx: fără amprentă e învechit; cu amprenta analizei de acum, la zi', () => {
  const r = repo();
  const slug = 'b601-2026';
  const bill = { id: 'B601/2026', slug, cod: '1', officialTitle: 'T', consultationDeadline: '01-12-2026' };
  const a = analysis({ slug, form: 'initiator', key: 'no-acts' });
  r.put('data/senat-bills.json', [bill]);
  r.put(`data/analyses/${slug}.json`, a);
  r.put('public/docs/Punct_de_vedere_B601-2026.docx', 'x');
  assert.deepEqual(staleForSlug(r.inp(), slug).docx, ['fără-amprentă']);
  r.put('data/docs-basis.json', { [slug]: { analysis: docxDigest(bill, a), prompt: DOCX_VERSION } });
  assert.deepEqual(staleForSlug(r.inp(), slug).docx, []);
  r.put(`data/analyses/${slug}.json`, { ...a, consensus: { ...a.consensus, plainTitle: 'alt titlu' } });
  assert.deepEqual(staleForSlug(r.inp(), slug).docx, ['analiza']);
});

test('coada: întâi cele învechite, apoi cele lipsă, fiecare cu cele mai riscante întâi', () => {
  const r = repo();
  for (const [slug, score, balance] of [['plx-6-2026', 2, true], ['plx-7-2026', 8, true], ['plx-8-2026', 9, false], ['plx-9-2026', 5, true]]) {
    r.put(`data/texts/${slug}/forma_camera.txt`, TEXT);
    r.put(`data/analyses/${slug}.json`, analysis({ slug, key: 'no-acts', score }));
    if (balance) r.put(`data/analyses/balance/${slug}.json`, { slug, schema: 1 });
  }
  const report = freshness('balance', r.inp());
  assert.deepEqual(report.stale.map((s) => s.slug), ['plx-7-2026', 'plx-9-2026', 'plx-6-2026']);
  assert.deepEqual(report.missing.map((s) => s.slug), ['plx-8-2026']);
  assert.deepEqual(queue('balance', 3, r.inp()), ['plx-7-2026', 'plx-9-2026', 'plx-6-2026']);
});

test('la Senat, forma inițială din dosarul formelor e textul inițial, nu cel actualizat', () => {
  assert.equal(textNameOf('b563-2026', 'initiator', { versionFile: true }), 'forma_initiatorului_initiala');
  assert.equal(textNameOf('b563-2026', 'initiator'), 'forma_initiatorului');
  assert.equal(textNameOf('b563-2026', 'actualizata', { versionFile: true }), 'forma_initiatorului');
  assert.equal(textNameOf('plx-1-2026', 'initiator', { versionFile: true }), 'forma_initiatorului');
});
