import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isEvotDayPage, numberKey, parseCommitteeDocs, parseEvotDay, parseStenoCalendar, parseStenoDay, stenoDayDate, stenoDayKind } from './cdep-plen.mjs';

// Bucăți din paginile reale (cdep.ro, noiembrie 2026), scurtate.
const row = (idm, nr, text, sub = false) => `<tr valign="top" bgcolor="#ffffff">
  ${sub ? '<td>&nbsp;</td>' : ''}<td align="center"><b>&nbsp;&nbsp;<a href="/ords/pls/steno/steno2015.stenograma?ids=9087&idm=${idm}&idl=1">${nr}</a>&nbsp;&nbsp;</b></td>
  <td ${sub ? '' : 'colspan=2 '}width="90%">
${text}
</td>
</tr>`;
const STENO = `<html><head><title>&#350;edin&#355;a Camerei Deputa&#355;ilor din 11 noiembrie  2026</title></head><body><table>
${row('1', '1', 'Declaraţii politice şi intervenţii ale deputaţilor:')}
${row('1.001', '1.1', '<a href="/ords/pls/parlam/structura2015.mp?idm=168&cam=2&leg=2024">Remus Lăpuşan</a> - declaraţie politică;', true)}
${row('4', '4', 'Dezbaterea Proiectului de Lege pentru modificarea Legii nr. 185/2016 (PL-x 488/2026<I>) (rămas pentru votul final)</I>.')}
${row('5', '5', 'Propunerea legislativă pentru modificarea art. 113 din Codul penal (Pl-x 352/2026<I>) (retrimisă comisiei </I>).')}
${row('7', '7', 'Supunerea la votul final a:')}
${row('7.001', '7.1', 'Proiectului de Hotărâre privind înfiinţarea comisiei de anchetă (PHCD 74/2026<I>) (adoptat)</I>;', true)}
${row('7.002', '7.2', 'Proiectului de Lege pentru modificarea Legii nr. 185/2016 (PL-x 488/2026<I>) (adoptat)</I>.', true)}
${row('8', '8', 'Propunerea legislativă privind SRI (Pl-x 495/2026<I>) (adoptată ca urmare a depăşirii termenului constituţional)</I>.')}
</table></body></html>`;

test('sumarul stenogramei: punctele, numerele, nota din italice și votul final', () => {
  assert.equal(stenoDayKind(STENO), 'camera');
  const { sedinte, puncte } = parseStenoDay(STENO);
  assert.deepEqual(sedinte, [9087]);
  const byNr = Object.fromEntries(puncte.map((p) => [p.nr, p]));
  assert.deepEqual(byNr['4'].numere, ['PLX 488/2026']);
  assert.equal(byNr['4'].nota, 'rămas pentru votul final');
  assert.equal(byNr['4'].votFinal, false);
  assert.equal(byNr['5'].nota, 'retrimisă comisiei');
  assert.deepEqual([byNr['7.1'].numere, byNr['7.1'].nota, byNr['7.1'].votFinal], [['PHCD 74/2026'], 'adoptat', true]);
  assert.equal(byNr['7.2'].votFinal, true);
  assert.equal(byNr['8'].votFinal, false, 'după votul final, la primul nivel');
  assert.equal(byNr['8'].nota, 'adoptată ca urmare a depășirii termenului constituțional');
  assert.deepEqual(byNr['1.1'].numere, []);
});

test('ziua comună cu Senatul și ziua fără stenogramă nu sunt plenul Camerei', () => {
  assert.equal(stenoDayKind('<title>Şedinţa comună a Camerei Deputaţilor şi Senatului din 10 noiembrie  2026</title>'), 'comuna');
  assert.equal(stenoDayKind('<title>Şedinţele Camerei Deputaţilor din 18 noiembrie  2026</title>'), 'lista');
  assert.equal(stenoDayKind('<title>Firewall Captcha Authentication</title>'), null);
  assert.deepEqual(parseStenoDay('<title>Şedinţele Camerei Deputaţilor din 18 noiembrie  2026</title>').puncte, []);
});

test('calendarul stenogramelor: doar zilele plenului Camerei (cam=2)', () => {
  const html = '<a href="/ords/pls/steno/steno2015.data?cam=2&dat=20261116&idl=1">16</a><a href="/ords/pls/steno/steno2015.data?cam=2&amp;dat=20261111&idl=1">11</a><a href="steno2015.data?cam=1&dat=20261112">12</a>';
  assert.deepEqual(parseStenoCalendar(html), ['2026-11-11', '2026-11-16']);
});

test('numerele Camerei, în toate felurile în care le scrie', () => {
  assert.equal(numberKey('PL-x 488/2026'), 'PLX 488/2026');
  assert.equal(numberKey('Pl-x 495/2026'), 'PLX 495/2026');
  assert.equal(numberKey('PL 445/2026'), 'PLX 445/2026');
  assert.equal(numberKey('PH CD 79/2026'), 'PHCD 79/2026');
  assert.equal(numberKey('PL nr. 614/2026'), 'PLX 614/2026');
  assert.equal(numberKey('L631/2026'), null);
});

const vote = (idv, desc, cells = ['136', '<b>85', '1', '49', '1']) => `<tr bgcolor=#ffffff>
<td data-label="#"><u><a href="/ords/pls/steno/evot2015.nominal?idv=${idv}&idl=1">1</a></u></td>
<td data-label="Ora">
<a href="/ords/pls/steno/evot2015.nominal?idv=${idv}&idl=1"><u>10:08</u></a>
</td>
<td data-label="Descriere">
${desc}
</td>
<td data-label="Prezenta">${cells[0]}</td>
<td data-label="Pentru">${cells[1]}</td>
<td data-label="Împotriva">${cells[2]}</td>
<td data-label="Abtineri">${cells[3]}</td>
<td data-label="Nu au votat*">${cells[4]}</td>
</tr>`;
const header = (idp, nr) => `<tr><td data-label="Titlu PL" bgcolor=#E0E0E0 colspan=9 style="text-align: left"><a href="/ords/pls/proiecte/upl_pck2015.proiect?idp=${idp}" target="PROIECTE">${nr}</a>&nbsp;pentru modificarea Legii</td></tr>`;

test('voturile zilei: proiectul din rândul gri de deasupra, până la un vot care nu ține de niciun proiect', () => {
  const html = `<table>${vote(37512, 'PL-x 447/2025 Retrimitere la comisie')}${header(23319, 'PL 445/2026')}${vote(37514, 'Stabilire timpi dezbatere')}${vote(37515, 'Prezenta', ['188', '-', '-', '-', '-'])}${header(23511, 'PL 594/2026')}${vote(37526, 'Vot final\nadoptare', ['246', '<b>245', '0', '0', '1'])}</table>`;
  const v = parseEvotDay(html);
  assert.deepEqual(v.map((x) => [x.idv, x.numar, x.idp]), [
    [37512, 'PLX 447/2025', null],
    [37514, 'PLX 445/2026', 23319],
    [37515, null, null],
    [37526, 'PLX 594/2026', 23511],
  ]);
  assert.deepEqual([v[3].descriere, v[3].detaliu, v[3].pentru, v[3].contra, v[3].abtineri], ['Vot final', 'adoptare', 245, 0, 0]);
  assert.equal(v[2].pentru, null);
});

test('documentele comisiei: avizele și rapoartele, cu proiectul și comisiile raportului comun', () => {
  const html = `<p>înregistrări găsite: 582</p><table>
<tr><td>1.</td><td><a href="/comisii/juridica/pdf/2026/av614.pdf"><img></a></td><td>19.11.2026</td><td><b>AVIZ</b> asupra PL nr. <a href="upl_pck2015.proiect?idp=23564">614/2026</a> Propunere legislativă pentru modificarea OUG nr.57/2007</td><td>-</td></tr>
<tr><td>2.</td><td><a href="/comisii/industrii/pdf/2026/rp506.pdf"><img></a></td><td>18.11.2026</td><td><b>RAPORT</b> asupra PL nr. <a href="upl_pck2015.proiect?idp=23392">506/2026</a> Proiect de Lege</td><td><a href="/ords/pls/parlam/structura2015.co?idc=3&leg=2024&cam=2">Industrii</a> <a href="/ords/pls/parlam/structura2015.co?idc=34&leg=2024&cam=2">Transport</a></td></tr>
<tr><td>3.</td><td><a href="/comisii/abuzuri/pdf/2026/sz1020.pdf"><img></a></td><td>20.11.2026</td><td>SINTEZA lucrarilor Comisiei din 20.10.2026</td><td>-</td></tr>
</table>`;
  const d = parseCommitteeDocs(html);
  assert.equal(d.length, 2);
  assert.deepEqual([d[0].tip, d[0].data, d[0].numar, d[0].idp, d[0].comune], ['aviz', '2026-11-19', 'PLX 614/2026', 23564, []]);
  assert.equal(d[0].pdf, 'https://www.cdep.ro/comisii/juridica/pdf/2026/av614.pdf');
  assert.deepEqual([d[1].tip, d[1].comune], ['raport', ['3', '34']]);
});

test('sumarul: proiectele pomenite în declarații sunt doar mențiuni; ziua din titlu; un rând necitit face sumarul incomplet', () => {
  const html = STENO.replace('Remus Lăpuşan</a> - declaraţie politică;', 'Remus Lăpuşan</a> - declaraţie politică despre PL-x 9/2026;');
  const { puncte, complet } = parseStenoDay(html);
  assert.equal(complet, true);
  const m = puncte.find((p) => p.nr === '1.1');
  assert.deepEqual([m.numere, m.mentiune], [['PLX 9/2026'], true]);
  assert.equal(stenoDayDate(STENO), '2026-11-11');
  const broken = STENO.replace('</table>', '<p><a href="/ords/pls/steno/steno2015.stenograma?ids=9087&idm=9&idl=1">9</a></p></table>');
  assert.equal(parseStenoDay(broken).complet, false);
});

test('voturile zilei: votul final după retrimitere păstrează proiectul; o zi fără voturi e tot o pagină cunoscută', () => {
  const html = `<table>${header(22723, 'PL-x 447/2025')}${vote(1, 'Retrimitere la comisie')}${vote(2, 'Vot final\nadoptare')}</table>`;
  assert.deepEqual(parseEvotDay(html).map((v) => v.numar), ['PLX 447/2025', 'PLX 447/2025']);
  assert.equal(isEvotDayPage('<title>VOT ELECTRONIC</title><a href="/ords/pls/steno/evot2015.xml">xml</a>'), true);
  assert.deepEqual(parseEvotDay('<title>VOT ELECTRONIC</title>'), []);
});
