import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextAtSameBody, outcomesFor, senateResolution, stenoNote, totalsText } from '../../src/lib/agenda-outcomes.ts';

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

// —— Plenul Camerei din stenogramă și voturile zilei; documentele comisiilor ——

const STENO_URL = 'https://www.cdep.ro/ords/pls/steno/steno2015.data?cam=2&dat=20261111&idl=1';
const day = (puncte, over = {}) => ({ plen: new Map([['2026-11-18', { zi: '2026-11-18', stenograma: { url: STENO_URL, tip: 'camera', puncte }, ...over }]]), comisii: new Map() });
const item = (nr, numere, nota, votFinal = false) => ({ ids: 9087, idm: nr.replace('.', '.00'), nr, numere, nota, votFinal });

test('stenograma: dezbătut și rămas pentru votul final, apoi adoptat la votul final, cu votul nominal ca a doua sursă', () => {
  const rec = day([item('4', ['PLX 1/2026'], 'rămas pentru votul final'), item('7.1', ['PLX 1/2026'], 'adoptat', true)]);
  const src = { ...none, votes: [{ chamber: 'cdep', url: 'https://www.cdep.ro/ords/pls/steno/evot2015.Nominal?idv=37516', date: '2026-11-18', question: 'adoptare', result: 'adoptat', totals: { pentru: 215, contra: 0, abtineri: 0 }, subject: 'Vot final' }] };
  const o = outcomesFor(app(), src, TODAY, null, rec);
  assert.equal(o.length, 1, 'votul final face redundantă dezbaterea');
  assert.equal(o[0].text, 'Adoptat de Camera Deputaților');
  assert.equal(o[0].detail, '215 pentru, 0 contra, nicio abținere');
  assert.deepEqual(o[0].sources.map((s) => s.label), ['Stenograma ședinței pe cdep.ro', 'Votul pe cdep.ro']);
  assert.match(o[0].sources[0].url, /steno2015\.stenograma\?ids=9087&idm=7\.001/);
});

test('stenograma: retrimisă comisiei, rămasă pentru votul final, adoptată tacit', () => {
  assert.equal(outcomesFor(app(), none, TODAY, null, day([item('10', ['PLX 1/2026'], 'retrimisă comisiei')]))[0].text, 'Retrimis la comisie');
  const [d] = outcomesFor(app(), none, TODAY, null, day([item('3', ['PLX 1/2026'], 'rămasă pentru votul final')]));
  assert.deepEqual([d.kind, d.text, d.later], ['dezbatut', 'Dezbătut, rămas pentru votul final', false]);
  assert.equal(outcomesFor(app(), none, TODAY, null, day([item('8', ['PLX 1/2026'], 'adoptată ca urmare a depășirii termenului constituțional')]))[0].text, 'Adoptat tacit de Camera Deputaților (termenul a expirat)');
});

test('nedezbătut doar cu sumarul stenogramei, doar pentru un punct cu număr și doar fără alt pas în aceeași zi', () => {
  const rec = day([item('4', ['PLX 9/2026'], 'rămas pentru votul final')]);
  const [o] = outcomesFor(app(), none, TODAY, null, rec);
  assert.deepEqual([o.kind, o.text, o.sources[0].url], ['nedezbatut', 'Nu a fost dezbătut în această ședință', STENO_URL]);
  assert.deepEqual(outcomesFor(app(), none, TODAY, null, null), [], 'fără stenogramă nu spunem nimic');
  assert.deepEqual(outcomesFor(app({ punct: { ...app().punct, numar: '' } }), none, TODAY, null, rec), [], 'fără număr nu putem ști');
  const comuna = day([], { stenograma: { url: STENO_URL, tip: 'comuna', puncte: [] } });
  assert.deepEqual(outcomesFor(app(), none, TODAY, null, comuna), [], 'ședința comună nu e plenul Camerei');
  const sheet = camera([{ camera: 'Camera Deputaților', data: '18.11.2026', actiune: 'adoptat de Camera Deputatilor' }]);
  assert.deepEqual(outcomesFor(app(), sheet, TODAY, null, rec).map((x) => x.kind), ['adoptat'], 'fișa contrazice sumarul: nu spunem „nedezbătut”');
  assert.deepEqual(outcomesFor(app({ zi: TODAY }), none, TODAY, null, rec), [], 'nici azi');
});

test('„dezbatere în plenul … pentru ședințele din zilele de …” e programarea, nu dezbaterea', () => {
  const src = camera([{ camera: 'Camera Deputaților', data: '18.11.2026', actiune: 'dezbatere în plenul Camerei Deputatilor pentru ședințele Camerei Deputaților din zilele de 16 și 18 noiembrie 2026' }]);
  assert.deepEqual(outcomesFor(app(), src, TODAY), []);
  const real = camera([{ camera: 'Camera Deputaților', data: '18.11.2026', actiune: 'dezbatere în plenul Camerei Deputatilor consultati stenograma sedintei' }]);
  assert.equal(outcomesFor(app(), real, TODAY)[0].text, 'Dezbătut în plen');
});

test('voturile zilei, până la stenogramă: ce s-a votat, fără să spunem dacă a trecut; votul cunoscut nu se repetă', () => {
  const vot = (over) => ({ idv: 37518, descriere: 'Vot final', detaliu: 'adoptare', numar: 'PLX 1/2026', idp: null, pentru: 234, contra: 0, abtineri: 1, ...over });
  const rec = (voturi) => ({ plen: new Map([['2026-11-18', { zi: '2026-11-18', voturi: { url: 'https://www.cdep.ro/evot', voturi } }]]), comisii: new Map() });
  const [o] = outcomesFor(app(), none, TODAY, null, rec([vot()]));
  assert.deepEqual([o.kind, o.text, o.detail], ['alt', 'Supus votului final', '234 pentru, 0 contra, 1 abținere']);
  assert.match(o.sources[0].url, /evot2015\.Nominal\?idv=37518$/);
  const sheet = camera([{ camera: 'Camera Deputaților', data: '18.11.2026', actiune: 'adoptat de Camera Deputatilor rezultat vot pentru=234, contra=0, abtineri=1' }]);
  const both = outcomesFor(app(), sheet, TODAY, null, rec([vot()]));
  assert.deepEqual(both.map((x) => x.text), ['Adoptat de Camera Deputaților']);
  assert.equal(both[0].sources.length, 2);
  const idp = outcomesFor(app({ punct: { ...app().punct, cod: '22901' } }), none, TODAY, null, rec([vot({ numar: 'PLX 20/2026', idp: 22901 })]));
  assert.equal(idp.length, 1, 'după idp-ul fișei');
  const back = outcomesFor(app(), none, TODAY, null, rec([vot({ descriere: 'PL-x 1/2026 Retrimitere la comisie', detaliu: '' }), vot({ idv: 1, descriere: 'Stabilire timpi dezbatere' })]));
  assert.deepEqual(back.map((x) => x.text), ['Vot asupra retrimiterii la comisie']);
});

test('comisiile Camerei: avizul de pe pagina comisiei e al ei; raportul din fișă primește documentul ca sursă', () => {
  const com = app({ comisieId: '11', comisie: 'Comisia juridică, de disciplină și imunități', plen: false, zi: '2026-11-17' });
  const doc = (over) => ({ tip: 'aviz', data: '2026-11-19', pdf: 'https://www.cdep.ro/comisii/juridica/pdf/2026/av1.pdf', idp: 1, numar: 'PLX 1/2026', comune: [], ...over });
  const rec = (docs, idc = '11') => ({ plen: new Map(), comisii: new Map([[idc, docs]]) });
  const [a] = outcomesFor(com, none, TODAY, null, rec([doc()]));
  assert.deepEqual([a.kind, a.text, a.later, a.date], ['aviz', 'Aviz al comisiei', true, '2026-11-19']);
  assert.deepEqual(outcomesFor(com, none, TODAY, null, rec([doc()], '5')), [], 'avizul altei comisii');
  assert.deepEqual(outcomesFor(com, none, TODAY, null, rec([doc({ data: '2026-11-16' })])), [], 'document de dinaintea ședinței');
  assert.deepEqual(outcomesFor(com, none, TODAY, '2026-11-18', rec([doc()])), [], 'după următoarea ședință a comisiei cu proiectul');
  const rows = [{ camera: 'Camera Deputaților', data: '18.11.2026', actiune: 'primire raport favorabil de la:' }];
  const r = outcomesFor(com, camera(rows, ['11']), TODAY, null, rec([doc({ tip: 'raport', data: '2026-11-18', pdf: 'https://www.cdep.ro/rp1.pdf' })]));
  assert.equal(r.length, 1);
  assert.equal(r[0].text, 'Raport favorabil, primit de Cameră');
  assert.deepEqual(r[0].sources.map((s) => s.label), ['Fișa proiectului pe cdep.ro', 'Raportul comisiei pe cdep.ro']);
  const joint = outcomesFor(com, none, TODAY, null, rec([doc({ tip: 'raport', comune: ['3', '11'] })]));
  assert.equal(joint[0].text, 'Raport comun al comisiilor');
});

test('dezbătut luni, adoptat miercuri: dezbaterea de luni rămâne și nu devine „nedezbătut”', () => {
  const rec = day([item('4', ['PLX 1/2026'], 'rămas pentru votul final')]);
  rec.plen.set('2026-11-16', { ...rec.plen.get('2026-11-18'), zi: '2026-11-16' });
  const sheet = camera([{ camera: 'Camera Deputaților', data: '18.11.2026', actiune: 'adoptat de Camera Deputatilor' }]);
  const o = outcomesFor(app({ zi: '2026-11-16' }), sheet, TODAY, null, rec);
  assert.deepEqual(o.map((x) => [x.kind, x.date]), [['dezbatut', '2026-11-16'], ['adoptat', '2026-11-18']]);
});

test('un proiect doar pomenit (declarații politice) sau un sumar citit pe jumătate nu dovedesc nimic', () => {
  const mention = day([{ ...item('1.3', ['PLX 1/2026'], ''), mentiune: true }, item('4', ['PLX 9/2026'], 'adoptat')]);
  assert.deepEqual(outcomesFor(app(), none, TODAY, null, mention), []);
  const partial = day([item('4', ['PLX 9/2026'], 'adoptat')]);
  partial.plen.get('2026-11-18').stenograma.complet = false;
  assert.deepEqual(outcomesFor(app(), none, TODAY, null, partial), []);
});

test('notele despre o cerere nu sunt hotărârea asupra proiectului', () => {
  assert.equal(stenoNote('adoptată propunerea de respingere').kind, 'alt');
  assert.equal(stenoNote('respinsă cererea de retrimitere la comisie').kind, 'alt');
  assert.equal(stenoNote('rămase pentru votul final').kind, 'dezbatut');
  assert.equal(stenoNote('').text, 'Luat în dezbatere, fără o hotărâre notată în sumar');
});

test('voturile zilei: două voturi finale rămân două; „respingerea” din titlu nu e o întrebare de respingere; idp doar la legi', () => {
  const vot = (over) => ({ idv: 1, descriere: 'Vot final', detaliu: 'adoptare', numar: 'PLX 1/2026', idp: null, pentru: 100, contra: 90, abtineri: 3, ...over });
  const rec = (voturi) => ({ plen: new Map([['2026-11-18', { zi: '2026-11-18', voturi: { url: 'https://www.cdep.ro/evot', voturi } }]]), comisii: new Map() });
  const two = outcomesFor(app(), none, TODAY, null, rec([vot({ detaliu: 'respingere' }), vot({ idv: 2, pentru: 200, contra: 5 })]));
  assert.deepEqual(two.map((x) => x.text), ['Supus votului final (pentru respingere)', 'Supus votului final']);
  const title = outcomesFor(app(), none, TODAY, null, rec([vot({ detaliu: '- Proiectul de Lege pentru respingerea OUG nr. 1/2026' })]));
  assert.equal(title[0].text, 'Supus votului final');
  const phcd = app({ punct: { ...app().punct, numar: 'PHCD 79/2026', cod: '1455' } });
  assert.deepEqual(outcomesFor(phcd, none, TODAY, null, rec([vot({ numar: 'PLX 5/2026', idp: 1455 })])), []);
});

// Rândurile cu numele comisiei și pașii din aceeași zi, cum îi citește parseSheet din 23 noiembrie 2026 (PL-x 429/2026).
test('fișa Camerei: avizul și raportul se leagă de comisie după numele de pe rând', () => {
  const com = app({ comisieId: '3', comisie: 'Comisia pentru industrii şi servicii', plen: false, zi: '2026-06-24' });
  const rows = [
    { camera: 'Camera Deputaților', data: '30.06.2026', actiune: 'primire aviz de la: Comisia pentru industrii și servicii' },
    { camera: 'Camera Deputaților', data: '30.06.2026', actiune: 'primire aviz de la: Comisia pentru politică economică, reformă și privatizare' },
    {
      camera: 'Camera Deputaților',
      data: '30.06.2026',
      actiune: 'primire raport favorabil (3 amend. admise) de la: Comisia pentru apărare, ordine publică și siguranță națională; Comisia pentru industrii și servicii — face parte din categoria legilor organice',
    },
  ];
  const o = outcomesFor(com, camera(rows, ['12']), '2026-07-20');
  assert.deepEqual(
    o.map((x) => [x.kind, x.text, x.date]),
    [
      ['aviz', 'Aviz al comisiei', '2026-06-30'],
      ['raport', 'Raport favorabil, cu 3 amendamente admise, primit de Cameră', '2026-06-30'],
    ],
    'raportul comun e și al ei, deși nu e printre comisiile ultimei trimiteri',
  );
  const other = outcomesFor({ ...com, comisieId: '2', comisie: 'Comisia pentru buget, finanțe și bănci' }, camera(rows, ['2']), '2026-07-20');
  assert.deepEqual(other, [], 'cu nume pe rând, idc-ul raportului nu mai decide');
  // Avizul din fișă și același aviz de pe pagina comisiei: un singur rând, cu amândouă sursele.
  const rec = { plen: new Map(), comisii: new Map([['3', [{ tip: 'aviz', data: '2026-06-29', pdf: 'https://www.cdep.ro/av429.pdf', idp: 1, numar: 'PLX 1/2026', comune: [] }]]]) };
  const merged = outcomesFor(com, camera(rows.slice(0, 1)), '2026-07-20', null, rec);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].sources.map((s) => s.label), ['Fișa proiectului pe cdep.ro', 'Avizul comisiei pe cdep.ro']);
});

test('plenul Camerei: votul final fără majoritate cu retrimitere, dezbaterea cu nota din paranteză, respingerea definitivă', () => {
  const vote = camera([
    { camera: 'Camera Deputaților', data: '30.06.2026', actiune: 'dezbatere în plenul Camerei Deputatilor' },
    {
      camera: 'Camera Deputaților',
      data: '30.06.2026',
      actiune:
        'vot final adoptare - nu a fost întrunită majoritatea absolută (majoritatea absolută = jumătate plus unu din numărul total al deputaților/deputaților și senatorilor) rezultat vot : pentru=110 contra=16 abtineri=107 (prezenti=292) s-a dispus retrimiterea la comisie pentru un nou raport Comisia pentru apărare, ordine publică și siguranță națională — consultati stenograma sedintei sau înregistrarea video',
    },
  ]);
  const o = outcomesFor(app({ zi: '2026-06-30' }), vote, '2026-07-20');
  assert.deepEqual(
    o.map((x) => [x.kind, x.text, x.detail]),
    [
      ['dezbatut', 'Dezbătut în plen', null],
      ['retrimis', 'Retrimis la comisie după votul final', '110 pentru, 16 contra, 107 abțineri'],
    ],
  );
  const failed = camera([{ camera: 'Camera Deputaților', data: '18.11.2026', actiune: 'vot final respingere - fără majoritate calificată rezultat vot (pentru respingere): pentru=115 contra=149 abtineri=25' }]);
  assert.deepEqual(outcomesFor(app(), failed, TODAY).map((x) => [x.kind, x.text]), [['alt', 'Vot fără majoritatea cerută în Camera Deputaților']]);
  const back = camera([{ camera: 'Camera Deputaților', data: '18.11.2026', actiune: 'dezbatere în plenul Camerei Deputatilor( retrimis comisiilor ) consultati stenograma sedintei sau înregistrarea video' }]);
  assert.deepEqual(outcomesFor(app(), back, TODAY).map((x) => [x.kind, x.text]), [['retrimis', 'Retrimis la comisie']]);
  const end = camera([{ camera: 'Camera Deputaților', data: '18.11.2026', actiune: 'încetarea procedurii legislative prin respingere definitiva de catre Camera Deputatilor' }]);
  assert.deepEqual(outcomesFor(app(), end, TODAY).map((x) => [x.kind, x.text]), [['respins', 'Respins definitiv de Camera Deputaților']]);
});
