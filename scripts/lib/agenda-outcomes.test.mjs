import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextAtSameBody, outcomesFor, senateResolution, totalsText } from '../../src/lib/agenda-outcomes.ts';

const bill = { chamber: 'camera', slug: 'plx-1-2026', href: '/camera/plx-1-2026', id: 'PL-x 1/2026', title: 'Un proiect', risk: null };
const app = (over = {}) => ({
  chamber: 'camera',
  zi: '2026-11-18',
  ora: '10:00',
  oraFinal: null,
  comisieId: 'plen',
  comisie: 'Plenul Camerei Deputaților',
  plen: true,
  loc: null,
  url: 'https://www.cdep.ro/odz',
  punct: { nr: '1', numar: 'PL-x 1/2026', capitol: '', scop: '', termen: '', rezolutie: '' },
  bill,
  ...over,
});
const none = { senat: null, camera: null, votes: [] };
const camera = (timeline, raport = []) => ({ ...none, camera: { url: 'https://www.cdep.ro/fisa', timeline, raport } });
const TODAY = '2026-11-20';

test('votul din plen din aceeași zi dă rezultatul, cu cifrele și cu fișa ca a doua sursă', () => {
  const src = {
    ...camera([{ camera: 'Camera Deputaților', data: '18.11.2026', actiune: 'adoptat de Camera Deputatilor rezultat vot pentru=245, contra=0, abtineri=0, nu au votat=2' }]),
    votes: [{ chamber: 'cdep', url: 'https://www.cdep.ro/vot', date: '2026-11-18', question: 'adoptare', result: 'adoptat', totals: { pentru: 245, contra: 0, abtineri: 0 }, subject: 'Vot final' }],
  };
  const [o, ...rest] = outcomesFor(app(), src, TODAY);
  assert.equal(rest.length, 0);
  assert.equal(o.text, 'Adoptat de Camera Deputaților');
  assert.equal(o.detail, '245 pentru, 0 contra, nicio abținere');
  assert.deepEqual(o.sources.map((s) => s.label), ['Fișa proiectului pe cdep.ro', 'Votul pe cdep.ro']);
});

test('o respingere votată „pentru respingere” spune asta în cifre', () => {
  assert.equal(totalsText({ pentru: 217, contra: 34, abtineri: 10 }, 'respingere'), '217 pentru respingere, 34 contra, 10 abțineri');
  const src = camera([{ camera: 'Camera Deputaților', data: '18.11.2026', actiune: 'respinsa de catre Camera Deputatilor rezultat vot (pentru respingere): pentru=217, contra=34, abtineri=10' }]);
  const [o] = outcomesFor(app(), src, TODAY);
  assert.equal(o.text, 'Respins de Camera Deputaților');
  assert.equal(o.detail, '217 pentru respingere, 34 contra, 10 abțineri');
});

test('fără niciun rând potrivit nu inventăm nimic, nici „amânat”', () => {
  const src = camera([{ camera: 'Camera Deputaților', data: '16.11.2026', actiune: 'înscris pe ordinea de zi a plenului Camerei Deputatilor pentru ședințele din 16 și 18 noiembrie 2026' }]);
  assert.deepEqual(outcomesFor(app(), src, TODAY), []);
});

test('ziua de azi și zilele viitoare n-au rezultat', () => {
  const src = camera([{ camera: 'Camera Deputaților', data: '20.11.2026', actiune: 'adoptat de Camera Deputatilor' }]);
  assert.deepEqual(outcomesFor(app({ zi: TODAY }), src, TODAY), []);
});

test('un vot de după următoarea apariție la plen ține de ședința aceea, nu de cea dinainte', () => {
  const src = camera([{ camera: 'Camera Deputaților', data: '18.11.2026', actiune: 'adoptat de Camera Deputatilor rezultat vot pentru=200, contra=10, abtineri=0' }]);
  assert.deepEqual(outcomesFor(app({ zi: '2026-11-16' }), src, TODAY, '2026-11-18'), []);
  assert.equal(outcomesFor(app({ zi: '2026-11-18' }), src, TODAY, null).length, 1);
});

test('plenul aprobă retrimiterea la comisii', () => {
  const src = camera([{ camera: 'Camera Deputaților', data: '18.11.2026', actiune: 'plenul Camerei Deputatilor aproba retransmiterea la comisii' }]);
  assert.equal(outcomesFor(app(), src, TODAY)[0].text, 'Retrimis la comisie');
});

test('raportul primit de Cameră se leagă doar de comisiile raportului (după idc), în două săptămâni', () => {
  const com = app({ comisieId: '11', comisie: 'Comisia juridică, de disciplină și imunități', plen: false, zi: '2026-11-10' });
  const rows = [{ camera: 'Camera Deputaților', data: '17.11.2026', actiune: 'primire raport favorabil (61 amend. admise) de la:' }];
  const [r] = outcomesFor(com, camera(rows, ['11']), TODAY);
  assert.equal(r.text, 'Raport favorabil, cu 61 de amendamente admise, primit de Cameră');
  assert.equal(r.later, true, 'primit după ziua ședinței');
  assert.deepEqual(outcomesFor(com, camera(rows, ['5']), TODAY), [], 'comisie pentru aviz: raportul nu e al ei');
  assert.equal(outcomesFor({ ...com, zi: '2026-11-03' }, camera(rows, ['11']), TODAY).length, 1, 'exact 14 zile');
  assert.deepEqual(outcomesFor({ ...com, zi: '2026-11-02' }, camera(rows, ['11']), TODAY), [], 'peste 14 zile');
});

test('Senatul: rezoluția comisiei de pe ordinea de zi, iar „Adoptat” la o comisie e avizul sau raportul ei', () => {
  const com = app({ chamber: 'senat', comisieId: 'x', comisie: 'Comisia pentru constituționalitate', plen: false, url: 'https://www.senat.ro/odz' });
  const o = outcomesFor({ ...com, punct: { ...com.punct, scop: 'Aviz de competență', rezolutie: 'Adoptat' } }, none, TODAY);
  assert.equal(o[0].text, 'Aviz adoptat în comisie');
  assert.equal(o[0].sources[0].label, 'Ordinea de zi pe senat.ro');
  assert.equal(senateResolution('Amânat').kind, 'amanat');
});

test('Senatul: avizul transmis de aceeași comisie, cu diacriticele cu sedilă din fișă', () => {
  const com = app({ chamber: 'senat', comisieId: 'x', comisie: 'Comisia pentru transporturi și infrastructură', plen: false, zi: '2026-11-10' });
  const src = {
    ...none,
    senat: {
      url: 'https://www.senat.ro/fisa',
      timeline: [
        { date: '12-11-2026', action: 'Comisia pentru transporturi şi infrastructură transmite avizul cu nr. XXIV/123-FAVORABIL aviz - Comisia pentru transporturi şi infrastructură' },
        { date: '12-11-2026', action: 'Comisia pentru buget, finanţe, activitate bancară şi piaţă de capital transmite avizul cu nr. 5-NEGATIV' },
      ],
    },
  };
  const o = outcomesFor(com, src, TODAY);
  assert.equal(o.length, 1);
  assert.equal(o[0].text, 'Aviz favorabil transmis');
  assert.equal(o[0].date, '2026-11-12');
});

test('Senatul, plenul: „Respins” pe ordinea de zi și votul din aceeași zi devin un singur rezultat', () => {
  const plen = app({ chamber: 'senat', comisieId: 'p', comisie: 'Plenul Senatului', url: 'https://www.senat.ro/odz', zi: '2026-11-02' });
  const src = { ...none, votes: [{ chamber: 'senat', url: 'https://www.senat.ro/vot', date: '2026-11-02', question: 'adoptare', result: 'respins', totals: { pentru: 18, contra: 59, abtineri: 26 }, subject: 'vot final' }] };
  const o = outcomesFor({ ...plen, punct: { ...plen.punct, scop: 'Respins' } }, src, TODAY);
  assert.equal(o.length, 1);
  assert.equal(o[0].text, 'Respins de Senat');
  assert.equal(o[0].detail, '18 pentru, 59 contra, 26 de abțineri');
  assert.equal(o[0].sources.length, 2);
});

test('următoarea apariție la același organ', () => {
  const list = [app({ zi: '2026-11-16' }), app({ zi: '2026-11-18' }), app({ zi: '2026-11-18', comisieId: '11', plen: false })];
  assert.deepEqual(nextAtSameBody(list), ['2026-11-18', null, null]);
});

test('un vot fără majoritate nu e numărat ca respingere', () => {
  const src = { ...none, votes: [{ chamber: 'cdep', url: 'https://www.cdep.ro/vot', date: '2026-11-18', question: 'adoptare', result: 'fara-majoritate', totals: { pentru: 150, contra: 20, abtineri: 5 }, subject: 'Vot final' }] };
  const [o] = outcomesFor(app(), src, TODAY);
  assert.equal(o.kind, 'alt');
  assert.match(o.text, /fără majoritatea cerută/);
});

test('adoptarea tacită păstrează precizarea, iar abținerile lipsă nu devin „nicio abținere”', () => {
  const plen = app({ chamber: 'senat', comisieId: 'p', comisie: 'Plenul Senatului', url: 'https://www.senat.ro/odz', zi: '2026-11-02', punct: { ...app().punct, scop: 'Adoptat' } });
  const src = { ...none, camera: { url: 'https://www.cdep.ro/fisa', raport: [], timeline: [{ camera: 'Senat', data: '02.11.2026', actiune: 'adoptat de Senat ca urmare a depasirii termenului de adoptare, potrivit art.75 alin.(2) teza a III-a din Constitutie' }] } };
  const o = outcomesFor(plen, src, TODAY);
  assert.equal(o.length, 1);
  assert.equal(o[0].text, 'Adoptat tacit de Senat (termenul a expirat)');
  assert.equal(o[0].later, false);
  assert.equal(totalsText({ pentru: 62, contra: 46, abtineri: null }), '62 pentru, 46 contra');
});

test('„Respins” la o comisie a Senatului e hotărârea comisiei, nu respingerea proiectului', () => {
  assert.deepEqual(senateResolution('Respins', 'RAPORT'), { kind: 'alt', text: 'Respins în comisie' });
  assert.deepEqual(senateResolution('Adoptat cu amendamente', 'RAPORT comun'), { kind: 'raport', text: 'Raport adoptat în comisie cu amendamente' });
});
