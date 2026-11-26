// Trimiterile la articole: parserul și rezolvarea (src/lib/citari.ts), extragerea alineatelor (src/lib/citari-text.ts) și
// curățarea textelor portalului (scripts/lib/citari.mjs). TypeScript rulează direct în Node 24, prin ts-resolve.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { cleanUnit, strings } from './citari.mjs';

register('./ts-resolve.mjs', import.meta.url);
const { findRefs, findMentions, refIds, resolve, billSections, locate, actAt } = await import('../../src/lib/citari.ts');
const { extract, idLabel, anchorFor } = await import('../../src/lib/citari-text.ts');

const refs = (t) => findRefs(t).map((r) => [t.slice(r.start, r.end), refIds(r).join(' + ')]);

test('trimiterile, cu alineate, litere, liste și intervale', () => {
  assert.deepEqual(refs('3. La articolul 54, alineatele (3) și (4) se abrogă.'), [['articolul 54, alineatele (3) și (4)', 'art-54/alin-3 + art-54/alin-4']]);
  assert.deepEqual(refs('art. 47 alin. (1^1) lit. d)'), [['art. 47 alin. (1^1) lit. d)', 'art-47/alin-1^1/lit-d']]);
  assert.deepEqual(refs('art. 52 alin. (5¹)'), [['art. 52 alin. (5¹)', 'art-52/alin-5^1']]);
  assert.deepEqual(refs('art. 47 alin. (3) lit. f)-h)')[0][1], 'art-47/alin-3/lit-f + art-47/alin-3/lit-g + art-47/alin-3/lit-h');
  assert.deepEqual(refs('art. 47, 52 și 54'), [['art. 47', 'art-47'], ['52', 'art-52'], ['54', 'art-54']]);
  assert.deepEqual(refs('litera c) a alineatului (1) al articolului 47'), [['litera c) a alineatului (1) al articolului 47', 'art-47/alin-1/lit-c']]);
  assert.deepEqual(refs('anexa nr. 2'), [['anexa nr. 2', 'anexa-2']]);
  assert.deepEqual(refs('art. 1.270 din Codul civil')[0][1], 'art-1270');
  assert.deepEqual(refs('art. I pct. 2 (art. 52 alin. (1))').map((r) => r[1]), ['art-i/pct-2', 'art-52/alin-1']);
  assert.deepEqual(refs('Articolul unic pct. 3')[0][1], 'art-unic/pct-3');
  assert.deepEqual(refs('art. 1 alin. 5 Constituție')[0][1], 'art-1/alin-5');
});

test('ce nu e o trimitere', () => {
  assert.deepEqual(refs('Legea nr. 227/2015 și 5% din art'), []);
  assert.deepEqual(refs('arta 5 și partea 7'), []);
  assert.deepEqual(refs('art. 227/2015'), []);
});

const ACTS = [
  {
    key: 'LEGE 227/2015',
    cite: 'Legea nr. 227/2015',
    aliases: ['Codul fiscal'],
    available: true,
    units: { 'art-47': { text: '', src: 'baseline' }, 'art-52': { text: '', src: 'baseline' }, 'art-54': { text: '', src: 'baseline' }, 'art-138': { text: '', src: 'acte' } },
  },
];
const IDX = { acts: ACTS, own: { initiator: { 'art-i/pct-3': { label: 'Art. I pct. 3', text: '3. …', act: 0 }, 'art-i/pct-7': { label: 'Art. I pct. 7', text: '7. …', act: 0 }, 'art-i': { label: 'Art. I', text: '', act: 0 } } }, numbering: 'roman', approval: false };
const spans = (t, idx = IDX, scope = { form: 'initiator' }) =>
  resolve(t, idx, scope).map((s) => [t.slice(s.start, s.end), s.target.t === 'act' ? `${s.target.act}:${s.target.ids.join('+')}` : `own:${s.target.ids.join('+')}`]);

test('o lege de modificare a unui singur act: trimiterile fără act sunt ale lui', () => {
  assert.deepEqual(spans('Se abrogă art. 54 alin. (3).'), [['art. 54 alin. (3)', '0:art-54/alin-3']]);
  assert.deepEqual(spans('art. I pct. 3'), [['art. I pct. 3', 'own:art-i/pct-3']]);
});

test('actul numit după trimitere, și pentru toată lista', () => {
  assert.deepEqual(spans('art. 111 alin. (1) și art. 138 alin. (5) din Constituție'), []);
  assert.deepEqual(spans('art. 138 alin. (5) din Codul fiscal'), [['art. 138 alin. (5)', '0:art-138/alin-5']]);
  assert.deepEqual(spans('art. 54 din Legea nr. 227/2015'), [['art. 54', '0:art-54']]);
  assert.deepEqual(spans('art. 54 din Legea nr. 500/2002'), []);
  assert.deepEqual(spans('art. 54 din lege'), []);
});

test('după un alt act numit în text, trimiterile fără act rămân text simplu', () => {
  assert.deepEqual(spans('Contravine art. 138 alin. (5) din Constituție. Art. 52 alin. (1) e rescris.'), []);
  assert.deepEqual(spans('În Codul fiscal, art. 52 alin. (1) e rescris.'), [['art. 52 alin. (1)', '0:art-52/alin-1']]);
});

test('fără act numit, doar articolele pe care proiectul le modifică', () => {
  // art. 138 există în act, dar proiectul nu-l modifică: „art. 138” singur poate fi din Constituție.
  assert.deepEqual(spans('Contravine art. 138 alin. (5).'), []);
  assert.deepEqual(spans('art. 16 și 29 din Carta europeană a autonomiei locale'), []);
  assert.deepEqual(spans('art. I pct. 7, lit. k) și art. I pct. 3').map((s) => s[1]), ['own:art-i/pct-7', 'own:art-i/pct-3']);
});

test('actul numit într-o propoziție de dinainte și Curtea Constituțională', () => {
  assert.deepEqual(spans('Nu e corelat cu restul Legii nr. 227/2015. În forma actuală riscă neconstituționalitatea la CCR (art. 138 alin. 5).'), []);
  assert.deepEqual(spans('Nu e corelat cu Legea nr. 227/2015. Art. 138 alin. (5) rămâne.'), []);
  assert.deepEqual(spans('Nu e corelat cu Legea nr. 227/2015. Art. 54 alin. (3) se abrogă.'), [['Art. 54 alin. (3)', '0:art-54/alin-3']]);
  assert.deepEqual(spans('Codul fiscal, la art. 138 alin. (5), cere asta.'), [['art. 138 alin. (5)', '0:art-138/alin-5']]);
});

test('un articol care lipsește din act sau un act fără text nu devin trimiteri', () => {
  assert.deepEqual(spans('art. 999'), []);
  assert.deepEqual(spans('art. 54', { ...IDX, acts: [{ ...ACTS[0], available: false }] }), []);
});

test('mai multe acte modificate: doar contextul decide', () => {
  const two = { ...IDX, acts: [ACTS[0], { key: 'LEGE 207/2015', cite: 'Legea nr. 207/2015', available: true, units: { 'art-54': { text: '' } } }] };
  assert.deepEqual(spans('art. 54', two), []);
  assert.deepEqual(spans('art. I pct. 3 (art. 54 alin. (3))', two).map((s) => s[1]), ['own:art-i/pct-3', '0:art-54/alin-3']);
  assert.deepEqual(spans('art. 54', two, { form: 'initiator', billAct: 1 }), [['art. 54', '1:art-54']]);
});

test('legea de aprobare a unei ordonanțe nu are un act implicit', () => {
  assert.deepEqual(spans('art. 54', { ...IDX, approval: true }), []);
});

test('actele numite în text', () => {
  const t = 'Legea nr. 227/2015 privind Codul fiscal și OUG nr. 8/2026, art. 1 din Constituția României';
  assert.deepEqual(
    findMentions(t, ACTS).map((m) => [t.slice(m.start, m.end), m.act]),
    [
      ['Legea nr. 227/2015', 0],
      ['Codul fiscal', 0],
      ['OUG nr. 8/2026', 'other'],
      ['Constituția', 'other'],
    ],
  );
});

const BILL = `LEGE pentru modificarea Legii nr. 227/2015 privind Codul fiscal
Art. I - Legea nr. 227/2015 privind Codul fiscal, publicată în Monitorul Oficial, se modifică după cum urmează:
1. La articolul 47, litera c) se modifică și va avea următorul cuprins:
„c) a realizat venituri care nu au depășit 500.000 euro;”
2. La articolul 52, alineatul (1) se modifică:
"(1) Dacă în cursul unui an fiscal ...
3. o enumerare din citat, nu un punct"
3. La articolul 54, alineatele (3) și (4) se abrogă.
Art. II - Prezenta lege intră în vigoare la 1 ianuarie.`;

test('structura proiectului: articolele romane, punctele și actul fiecăruia', () => {
  const { numbering, sections } = billSections(BILL, ACTS);
  assert.equal(numbering, 'roman');
  assert.deepEqual(
    sections.map((s) => [s.id, s.act, s.points.map((p) => p.id)]),
    [
      ['art-i', 0, ['art-i/pct-1', 'art-i/pct-2', 'art-i/pct-3']],
      ['art-ii', null, []],
    ],
  );
  const at = locate(BILL, 'a realizat venituri care nu au depasit 500.000 euro');
  assert.ok(at > 0);
  assert.equal(actAt(sections, at), 0);
});

const ART47 = `(1) În sensul prezentului titlu, o microîntreprindere îndeplinește condițiile:
a) Abrogată.
c) a realizat venituri care nu au depășit 100.000 euro;
d) capitalul social este deținut de persoane private;
(1^1) Persoana juridică este legată dacă:
a) deține peste 25%;
c) este legată prin a treia persoană;
(2) Al doilea alineat.`;

test('extragerea unui alineat sau a unei litere; fără ghicit', () => {
  assert.deepEqual(extract({ text: ART47 }, ['alin-2']), { ok: true, text: '(2) Al doilea alineat.', whole: false });
  assert.equal(extract({ text: ART47 }, ['alin-1', 'lit-c']).text, 'c) a realizat venituri care nu au depășit 100.000 euro;');
  assert.equal(extract({ text: ART47 }, ['alin-1^1', 'lit-a']).text, 'a) deține peste 25%;');
  // „art. 47 lit. c)” fără alineat: litera c) e în două alineate, deci tot articolul, cu motivul.
  assert.equal(extract({ text: ART47 }, ['lit-c']).why, 'ambiguous');
  assert.equal(extract({ text: ART47 }, ['lit-d']).text, 'd) capitalul social este deținut de persoane private;');
  assert.equal(extract({ text: ART47 }, ['alin-9']).why, 'missing');
});

test('etichete și ancore', () => {
  assert.equal(idLabel('art-54/alin-3/lit-b'), 'art. 54 alin. (3) lit. b)');
  assert.equal(idLabel('art-i/pct-3'), 'art. I pct. 3');
  assert.equal(anchorFor('art-5^1/alin-2', true), '#art-5^1/alin-2');
  assert.equal(anchorFor('art-5^1/alin-2', false), '#art-5^1');
});

test('textul de pe portal, fără note', () => {
  const raw = `Reguli de determinare
(1) Pentru încadrarea în condiții se iau în calcul veniturile.
(la 25-02-2026,
Alineatul (1) , Articolul 54 a fost modificat de OUG nr. 8/2026
)
Notă ...
Potrivit alin. (3) al art. 10 din OUG nr. 8/2026, prevederile se aplică din 2026.
(2) Verificarea se face pe baza unei proceduri;...
...`;
  assert.deepEqual(cleanUnit(raw, 'Articolul 54'), {
    title: 'Reguli de determinare',
    text: '(1) Pentru încadrarea în condiții se iau în calcul veniturile.\n(2) Verificarea se face pe baza unei proceduri;',
  });
  assert.deepEqual(cleanUnit('Articolul 47\nDefiniția microîntreprinderii\n(1) Text.', 'Articolul 47'), { title: 'Definiția microîntreprinderii', text: '(1) Text.' });
});

test('șirurile din care vin trimiterile', () => {
  assert.deepEqual(strings({ a: 'art. 54', b: [{ c: 'fără trimiteri' }, 'anexa nr. 2'], n: 3 }), ['art. 54', 'anexa nr. 2']);
});
