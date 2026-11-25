import { test } from 'node:test';
import assert from 'node:assert/strict';
import { designation, eraOf, issuerName, pre1990, pre1990Date, subjectOf, typeGroup } from './mo-pre1990.mjs';

const act = (over = {}) => ({
  portalId: 1,
  type: 'DECRET',
  number: 31,
  year: 1954,
  actDate: '1954-01-30',
  mo: { part: 'BO', number: 9, date: '1954-01-31' },
  issuers: ['Consiliul de Stat'],
  hasText: true,
  ...over,
});

test('înainte de 1990: după data Monitorului; un act semnat înainte, dar publicat după, nu intră', () => {
  assert.equal(pre1990Date(act()), '1954-01-31');
  assert.equal(pre1990Date(act({ mo: null })), '1954-01-30');
  assert.equal(pre1990Date(act({ actDate: '1989-12-28', mo: { date: '1990-01-05' } })), null);
  assert.equal(pre1990Date(act({ actDate: null, mo: null })), null);
});

test('perioadele: granițele de stat (30 decembrie 1947, 21 august 1965, 22 decembrie 1989)', () => {
  assert.equal(eraOf('1866-07-13'), 'principate');
  assert.equal(eraOf('1938-02-27'), 'regat');
  assert.equal(eraOf('1947-12-30'), 'rpr');
  assert.equal(eraOf('1965-08-21'), 'rsr');
  assert.equal(eraOf('1989-12-21'), 'rsr');
  assert.equal(eraOf('1989-12-22'), 'revolutie');
});

test('emitenții: variantele portalului duc la același nume, „nepublicat” separat, Carol după domnie', () => {
  assert.deepEqual(issuerName('MAREA ADUNARE NAȘIONALĂ', '1953-12-05'), { name: 'Marea Adunare Națională', unpublished: false });
  assert.deepEqual(issuerName('Marea Adunare Natională', '1953-04-04'), { name: 'Marea Adunare Națională', unpublished: false });
  assert.deepEqual(issuerName('CONSILIUL DE STAT NEPUBLICAT', '1970-01-01'), { name: 'Consiliul de Stat', unpublished: true });
  assert.equal(issuerName('Regele Carol', '1866-06-30').name, 'Carol I');
  assert.equal(issuerName('Regele Carol', '1938-02-27').name, 'Regele Carol al II-lea');
  assert.equal(issuerName('MINISTERUL SĂNĂTĂȘII', '1980-01-01').name, 'Ministerul Sănătății');
  assert.equal(issuerName('Ministerul Justiției', '1910-04-09').name, 'Ministerul Justiției');
});

test('tipurile: variantele cu sedilă sau fără diacritice se strâng', () => {
  assert.equal(typeGroup('CONVENŢIE'), 'convenții');
  assert.equal(typeGroup('CONVENTIA'), 'convenții');
  assert.equal(typeGroup('HOTĂRÂRE'), 'hotărâri');
  assert.equal(typeGroup('DECRET-LEGE'), 'decrete-lege');
  assert.equal(typeGroup('COD PR. CIVILA'), 'coduri');
  assert.equal(typeGroup('PROTOCOL ADITIONAL'), 'protocoale');
});

test('desemnarea: număr cu punct la mii, codurile cu numele lor', () => {
  assert.equal(designation(act()), 'Decretul nr. 31/1954');
  assert.equal(designation(act({ type: 'CIRCULARA', number: 1481, actDate: '1837-12-07' })), 'Circulara nr. 1.481/1837');
  assert.equal(designation(act({ type: 'LEGE', number: null, actDate: '1879-05-02', mo: null })), 'Legea din 2 mai 1879');
  assert.equal(designation(act({ type: 'COD COMERCIAL', number: null, actDate: '1840-01-01', mo: null })), 'Codul comercial din 1 ianuarie 1840');
});

test('obiectul din titlu: fără notele portalului; primul rând al textului nu e titlu', () => {
  assert.equal(subjectOf('DECRET nr. 31 din 30 ianuarie 1954 privitor la persoanele fizice și persoanele juridice'), 'privitor la persoanele fizice și persoanele juridice');
  assert.equal(subjectOf('LEGE nr. 23 din 18 noiembrie 1969 (**republicată**) (*actualizata*) privind executarea pedepselor'), 'privind executarea pedepselor');
  assert.equal(subjectOf('DECRET-LEGE Nr. 115 din 27 aprilie 1938 *1) pentru unificarea dispozițiilor privitoare la cărțile funciare *2)'), 'pentru unificarea dispozițiilor privitoare la cărțile funciare');
  assert.equal(subjectOf('LEGE nr. 10 din 25 noiembrie 1972 CODUL MUNCII'), 'CODUL MUNCII');
  assert.equal(subjectOf('LEGE nr. 21 din 6 februarie 1924 Persoanele juridice de drept public se creează numai prin lege.'), null);
  assert.equal(subjectOf('PROCLAMATIE nr. 1 din 2 mai 1864 Romaniloru!'), null);
  assert.equal(subjectOf(null), null);
});

test('agregatele: decenii cu golurile lor, perioade, citate doar dintre actele vechi, obiect din citări când titlul nu are', () => {
  const acts = [
    act({ portalId: 1, type: 'LEGE', number: null, actDate: '1864-11-26', mo: { date: '1864-12-04' }, issuers: ['Parlamentul'] }),
    act({ portalId: 2 }),
    act({ portalId: 3, issuers: ['CONSILIUL DE STAT NEPUBLICAT'], actDate: '1970-03-01', mo: null, hasText: false }),
    act({ portalId: 4, actDate: '1989-12-28', mo: { date: '1990-01-05' } }),
    act({ portalId: 5, type: 'DECRET-LEGE', number: 1, actDate: '1989-12-27', mo: { date: '1989-12-27' }, issuers: ['Consiliul Frontului Salvării Naționale'] }),
  ];
  const citari = { generatedAt: 'x', docsScanned: 10, citedAtLeastOnce: 2, cited: [[2, 83], [999, 50]], titles: { 2: 'DECRET nr. 31 din 30 ianuarie 1954 privitor la persoanele fizice' }, subjects: { 3: 'privind ceva' } };
  const p = pre1990(acts, citari);
  assert.equal(p.totals.acts, 4);
  assert.equal(p.totals.withText, 3);
  assert.equal(p.totals.unpublished, 1);
  assert.equal(p.totals.publishedLater, 1);
  assert.equal(p.decades[0].decade, 1860);
  assert.equal(p.decades.at(-1).decade, 1980);
  assert.equal(p.decades.find((d) => d.decade == 1890).acts, 0);
  assert.equal(p.eras.find((e) => e.key === 'revolutie').acts, 1);
  assert.deepEqual(p.unpublishedBy, [['Consiliul de Stat', 1]]);
  assert.equal(p.cited.top.length, 1);
  assert.equal(p.cited.top[0].citedBy, 83);
  assert.equal(p.cited.top[0].subject, 'privitor la persoanele fizice');
  assert.equal(p.oldest[0].id, 1);
  assert.equal(p.longLived.length, 2);
  assert.equal(pre1990(acts, null).cited, null);
});
