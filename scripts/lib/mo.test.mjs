import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actKey, aggregate, categoryOf, dayStatus, decreeIndex, lawIndex, lawOfSheet, matchBills, ordinanceAction } from './mo.mjs';

const act = (over = {}) => ({
  portalId: 1,
  type: 'ORDIN',
  number: 10,
  numberRaw: '10',
  year: 2025,
  title: 'privind ceva',
  issuers: ['Ministerul Sănătății'],
  mo: { number: 100, bis: false, date: '2025-03-04' },
  inForceFrom: '2025-03-04',
  designation: 'ORDIN nr. 10 din 1 martie 2025',
  links: {},
  ...over,
});

test('categoriile: etichetele vechi și cele noi ale portalului ajung în aceeași categorie', () => {
  assert.equal(categoryOf({ type: 'OUG' }), 'oug');
  assert.equal(categoryOf({ type: 'ORD DE URGENTA' }), 'oug');
  assert.equal(categoryOf({ type: 'OG' }), 'og');
  assert.equal(categoryOf({ type: 'ORDONANTA' }), 'og');
  assert.equal(categoryOf({ type: 'HG' }), 'hg');
  assert.equal(categoryOf({ type: 'HOTARARE', issuers: ['Guvernul'] }), 'hg');
  assert.equal(categoryOf({ type: 'HOTARARE', issuers: ['Senatul'] }), 'altele');
  assert.equal(categoryOf({ type: 'RECTIFICARE' }), 'altele');
});

test('un act listat de două ori se numără o dată: același Monitor, aceeași familie de tip, același număr', () => {
  const a = act({ portalId: 1 });
  const b = act({ portalId: 2, issuers: ['Ministerul Finanțelor'] });
  // Același ordin din import: alt id, fără titlu, numărul scris cu punct.
  const imported = act({ portalId: 3, title: null, numberRaw: '10', source: 'scriptogre-2026-11-23', issuers: ['MINISTERUL SĂNĂTĂȚII'] });
  const other = act({ portalId: 4, number: 11, numberRaw: '11' });
  assert.equal(actKey(a), actKey(b));
  assert.equal(actKey(a), actKey(imported));
  assert.notEqual(actKey(a), actKey(other));
  assert.equal(actKey(act({ numberRaw: '6.434' })), actKey(act({ numberRaw: '6434' })));
  // Fără număr, titlul deosebește actele.
  assert.notEqual(actKey(act({ numberRaw: null, number: null, title: 'norme' })), actKey(act({ numberRaw: null, number: null, title: 'regulament' })));
  assert.equal(actKey({ portalId: 9, mo: null }), 'id:9');
});

test('importul romanian-law-data: ordonanțele nedeosebite, emitentul Guvernului scris altfel, copia din listele pe zile câștigă', () => {
  assert.equal(categoryOf({ type: 'ORDONANTA', typeLabel: 'ORDONANȚĂ', source: 'scriptogre-2026-11-23' }), 'ord');
  assert.equal(categoryOf({ type: 'ORDONANTA', typeLabel: 'ORDONANȚĂ', source: null }), 'og');
  assert.equal(categoryOf({ type: 'HOTARARE', issuers: ['GUVERNUL ROMÂNIEI'] }), 'hg');
  assert.equal(categoryOf({ type: 'HOTARARE', issuers: ['GUVERN'] }), 'hg');
  const listed = act({ portalId: 1, title: 'privind ceva' });
  const imported = act({ portalId: 2, title: null, source: 'scriptogre-2026-11-23' });
  const s = aggregate([{ date: '2025-03-04', status: 'ok', acts: [imported, listed] }], { from: '2025-01-01', to: '2025-12-31' });
  assert.equal(s.byYear.find((r) => r.year === 2025).ordin, 1);
});

test('tabelul întreg: anul complet după seria legilor și a hotărârilor, actele fără dată în totalurile anului', () => {
  const days = [];
  for (let d = new Date('2024-01-01T00:00:00Z'); d <= new Date('2025-12-31T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) days.push({ date: d.toISOString().slice(0, 10), status: 'ok', acts: [] });
  const put = (a) => days.find((x) => x.date === a.mo.date).acts.push(a);
  // 2024: legile 1–20, toate; hotărârile 1–10, toate. 2025: legile 1 și 20 (2 din 20).
  for (let n = 1; n <= 20; n++) put(act({ portalId: n, type: 'LEGE', number: n, numberRaw: String(n), year: 2024, title: `legea ${n}`, mo: { number: n, bis: false, date: '2024-02-01' } }));
  for (let n = 1; n <= 10; n++) put(act({ portalId: 100 + n, type: 'HG', number: n, numberRaw: String(n), year: 2024, title: `hg ${n}`, mo: { number: 50 + n, bis: false, date: '2024-03-01' } }));
  for (const n of [1, 20]) put(act({ portalId: 200 + n, type: 'LEGE', number: n, numberRaw: String(n), year: 2025, title: `legea ${n}`, mo: { number: n, bis: false, date: '2025-02-01' } }));
  put(act({ portalId: 300, type: 'HG', number: 1, numberRaw: '1', year: 2025, title: 'hg', mo: { number: 99, bis: false, date: '2025-03-01' } }));
  const undated = [act({ portalId: 400, type: 'ORDIN', year: 2024, mo: null }), act({ portalId: 400, type: 'ORDIN', year: 2024, mo: null })];
  // `to` în 2026, ca 2025 să nu fie anul în curs.
  const s = aggregate(days, { from: '2024-01-01', to: '2026-01-05', undated, quality: true });
  const c = Object.fromEntries(s.coverage.map((x) => [x.year, x]));
  assert.equal(c[2024].complete, true);
  assert.equal(c[2025].complete, false, 'doar 2 din 20 de numere de lege');
  assert.deepEqual([c[2024].lawFound, c[2024].lawMax, c[2024].hgFound, c[2024].hgMax, c[2024].undated], [20, 20, 10, 10, 1]);
  const r24 = s.byYear.find((r) => r.year === 2024);
  assert.equal(r24.undated, 1, 'un singur act fără dată, deși apare de două ori');
  assert.equal(r24.total, 31);
});

test('starea zilei: refuzată doar când fiecare parte a pierdut prima pagină', () => {
  assert.equal(dayStatus({ parts: { 'partea-i': { gaps: [1] }, 'partea-v': { gaps: [1] } } }), 'refuzată');
  assert.equal(dayStatus({ parts: { 'partea-i': { gaps: [3] }, 'partea-v': { gaps: [] } } }), 'parțială');
  assert.equal(dayStatus({ parts: { 'partea-i': { gaps: [] }, 'partea-v': { gaps: [] } } }), 'ok');
  assert.equal(dayStatus(null), 'lipsă');
});

test('legea care aprobă sau respinge o ordonanță, din titlu', () => {
  assert.equal(ordinanceAction('privind aprobarea Ordonanței de urgență a Guvernului nr. 7/2008'), 'aprobă');
  assert.equal(ordinanceAction('pentru aprobarea Ordonantei Guvernului nr. 2/2001'), 'aprobă');
  assert.equal(ordinanceAction('privind respingerea Ordonanţei de urgenţă a Guvernului nr. 1/2020'), 'respinge');
  assert.equal(ordinanceAction('pentru modificarea Legii nr. 95/2006'), null);
});

const sheet = (rows, stadiu = '') => ({ stadiu, timeline: rows.map(([data, actiune]) => ({ data, actiune, camera: null })) });

test('legea din fișă: numărul, decretul, promulgarea și ultimul vot de adoptare de dinaintea ei', () => {
  const f = sheet([
    ['11.03.2026', 'adoptata de Senat'],
    ['27.05.2026', 'adoptat de Camera Deputatilor titlu: Legea ... rezultat vot pentru=194'],
    ['02.06.2026', 'depunere la Secretarul general'],
    ['24.06.2026', 'promulgata prin Decret nr. 339/2026'],
    ['24.06.2026', 'devine Legea nr. 100/2026'],
  ]);
  assert.deepEqual(lawOfSheet(f), { law: '100/2026', decree: '339/2026', promulgatedOn: '2026-06-24', finalVoteOn: '2026-05-27' });
  // Fără rândul „devine Legea”, numărul vine din stadiul fișei; „Legea nr.218/2026” fără spațiu merge și el.
  assert.equal(lawOfSheet(sheet([['13.06.2026', 'promulgata prin Decret nr. 345/2026']], 'Lege 106/2026'))?.law, '106/2026');
  assert.equal(lawOfSheet(sheet([['19.11.2026', 'devine Legea nr.218/2026']]))?.law, '218/2026');
  assert.equal(lawOfSheet(sheet([['01.02.2026', 'adoptat de Camera Deputatilor']])), null);
});

test('potrivirea cu Monitorul: decretul trebuie să fie același; fără lege în index, numărul vine de la decret', () => {
  const law = act({ portalId: 50, type: 'LEGE', number: 100, year: 2026, mo: { number: 520, bis: false, date: '2026-06-24' }, links: { promulgationDecree: '339/2026' } });
  const republished = { ...law, portalId: 51, mo: { number: 900, bis: false, date: '2026-10-01' } };
  const decree = act({ portalId: 60, type: 'DECRET', number: 379, year: 2026, title: 'privind promulgarea Legii pentru ...', mo: { number: 550, bis: false, date: '2026-07-03' } });
  const index = lawIndex([republished, law]);
  assert.equal(index.get('100/2026').portalId, 50, 'prima publicare, nu republicarea');
  const bills = [
    { slug: 'a', chamber: 'camera', law: { law: '100/2026', decree: '339/2026', promulgatedOn: '2026-06-24', finalVoteOn: '2026-05-27' } },
    { slug: 'b', chamber: 'camera', law: { law: '100/2026', decree: '999/2026', promulgatedOn: null, finalVoteOn: null } },
    { slug: 'c', chamber: 'camera', law: { law: '125/2026', decree: '379/2026', promulgatedOn: '2026-07-03', finalVoteOn: '2026-06-10' } },
    { slug: 'd', chamber: 'camera', law: { law: '5/2026', decree: '1/2026', promulgatedOn: null, finalVoteOn: null } },
    { slug: 'e', chamber: 'camera', law: null },
  ];
  const { matched, misses } = matchBills(bills, index, { decrees: decreeIndex([decree]) });
  assert.equal(matched.a.mo.number, 520);
  assert.equal(matched.a.moFrom, 'lege');
  assert.match(matched.a.url, /DetaliiDocument\/50\?isFormaDeBaza=True$/);
  assert.match(matched.a.consolidatedUrl, /DetaliiDocument\/50$/);
  assert.equal(matched.c.moFrom, 'decret');
  assert.equal(matched.c.mo.number, 550);
  assert.equal(matched.c.inForceFrom, null);
  assert.equal(matched.b, undefined);
  assert.deepEqual(
    misses.map((m) => [m.slug, m.reason.split(':')[0]]),
    [
      ['b', 'decret diferit'],
      ['d', 'nu e în indexul portalului (încă)'],
    ],
  );
});

test('agregatele: acoperirea pe ani, zile necitite, zilele încă neindexate și anul în curs', () => {
  const days = [];
  // 2024: fiecare zi citită, câte un act în zilele lucrătoare; 2025: doar ianuarie; 2026: până pe 20 ianuarie, ultima zi lucrătoare goală.
  const push = (from, to, acts = (d) => d) => {
    for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      const wk = ![0, 6].includes(d.getUTCDay());
      days.push({ date: iso, status: 'ok', acts: wk ? acts(iso) : [] });
    }
  };
  let id = 0;
  const one = (iso) => [act({ portalId: ++id, numberRaw: String(id), number: id, mo: { number: id, bis: false, date: iso } })];
  push('2024-01-01', '2024-12-31', one);
  push('2025-01-01', '2025-01-31', one);
  push('2026-01-01', '2026-01-19', one);
  push('2026-01-20', '2026-01-20', () => []);
  days.push({ date: '2025-02-01', status: 'refuzată', acts: [] });
  const s = aggregate(days, { from: '2024-01-01', to: '2026-01-20', lagDays: 5 });
  const cov = Object.fromEntries(s.coverage.map((c) => [c.year, c]));
  assert.equal(cov[2024].complete, true);
  assert.equal(cov[2025].complete, false);
  assert.equal(cov[2025].refused, 1);
  assert.equal(cov[2025].missing, 333);
  assert.equal(cov[2026].inProgress, true);
  assert.equal(cov[2026].complete, false, 'anul în curs nu e complet');
  assert.deepEqual(s.totals.completeYears, [2024]);
  assert.deepEqual(s.pendingDays, ['2026-01-20']);
  const cal2026 = s.calendar.find((c) => c.year === 2026).values;
  assert.equal(cal2026[19], null, 'ziua lucrătoare goală din ultimele zile e „încă neindexată”');
  assert.equal(cal2026[17], 0, 'sâmbăta citită rămâne zero');
  assert.equal(cal2026[25], null, 'viitorul e gol');
  assert.equal(s.byYear.find((r) => r.year === 2024).ordin, 262);
  assert.equal(s.medianActsPerPublishingDay, 1);
});

test('agregatele: seriile de numere, legile despre ordonanțe și intrarea în vigoare', () => {
  const laws = [
    act({ portalId: 1, type: 'LEGE', number: 1, year: 2024, numberRaw: '1', title: 'privind aprobarea Ordonanței de urgență a Guvernului nr. 3/2023', mo: { number: 1, bis: false, date: '2024-01-05' }, inForceFrom: '2024-01-08' }),
    act({ portalId: 2, type: 'LEGE', number: 4, year: 2024, numberRaw: '4', title: 'privind respingerea Ordonanței Guvernului nr. 9/2023', mo: { number: 2, bis: false, date: '2024-01-05' }, inForceFrom: '2024-01-05' }),
    act({ portalId: 3, type: 'LEGE', number: 5, year: 2024, numberRaw: '5', title: 'pentru modificarea Codului fiscal', mo: { number: 3, bis: false, date: '2024-12-30' }, inForceFrom: '2025-01-15' }),
  ];
  const days = [
    { date: '2024-01-05', status: 'ok', acts: laws.slice(0, 2) },
    { date: '2024-12-30', status: 'ok', acts: [laws[2]] },
  ];
  const s = aggregate(days, { from: '2024-01-01', to: '2025-01-31' });
  const l24 = s.laws.find((l) => l.year === 2024);
  assert.deepEqual([l24.laws, l24.approveOrdinance, l24.rejectOrdinance, l24.inForce3, l24.inForceSooner, l24.inForceLater], [3, 2, 1, 1, 1, 1]);
  assert.equal(l24.enteredInForce, 2);
  assert.equal(s.laws.find((l) => l.year === 2025).enteredInForce, 1);
  assert.deepEqual(s.lawNumbering, [{ year: 2024, found: 3, maxNumber: 5 }]);
});

test('republicările: același număr de lege, publicat din nou, nu se mai numără ca lege și nu devine „prima publicare”', () => {
  const original = act({ portalId: 1, type: 'LEGE', number: 7, year: 2024, numberRaw: '7', actDate: '2024-01-02', title: 'privind ceva', mo: { number: 5, bis: false, date: '2024-01-05' }, inForceFrom: '2024-01-08' });
  const republished = act({ portalId: 2, type: 'LEGE', number: 7, year: 2024, numberRaw: '7', actDate: '2024-01-02', title: 'privind ceva (republicată)', mo: { number: 900, bis: false, date: '2024-10-01' }, inForceFrom: '2024-01-08' });
  const s = aggregate([{ date: '2024-01-05', status: 'ok', acts: [original] }, { date: '2024-10-01', status: 'ok', acts: [republished] }], { from: '2024-01-01', to: '2024-12-31' });
  const row = s.byYear.find((r) => r.year === 2024);
  assert.equal(row.lege, 1);
  assert.equal(row.altele, 1);
  assert.equal(s.laws.find((l) => l.year === 2024).enteredInForce, 1);
  // Fără original în index, republicarea nu e luată drept publicarea legii.
  assert.equal(lawIndex([republished]).size, 0);
});
