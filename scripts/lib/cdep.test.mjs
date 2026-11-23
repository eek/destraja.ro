import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseSheet, procedureRows } from './cdep.mjs';

// Fișe reale din .cache/cdep-html (cdep.ro, noiembrie 2026), întregi.
const sheet = (slug) => parseSheet(fs.readFileSync(new URL(`./fixtures/cdep/${slug}.html`, import.meta.url), 'utf8'));

test('PL-x 429/2026: pașii din aceeași zi (celula datei goală) au data și camera rândului de deasupra', () => {
  const { timeline } = sheet('plx-429-2026');
  const day = timeline.filter((t) => t.data === '30.06.2026');
  assert.deepEqual(
    day.slice(0, 4).map((t) => t.actiune.split(' — ')[0]),
    [
      'primire aviz de la: Comisia pentru industrii și servicii',
      'primire aviz de la: Comisia pentru politică economică, reformă și privatizare',
      'primire raport favorabil aprobarii ordonantei de urgenta de la: Comisia pentru apărare, ordine publică și siguranță națională',
      'dezbatere în plenul Camerei Deputatilor',
    ],
  );
  assert.equal(day.length, 5);
  assert.match(day[4].actiune, /^vot final adoptare - nu a fost întrunită majoritatea absolută/);
  assert.ok(day.every((t) => t.camera === 'Camera Deputaților'));
  const vote = day.at(-1);
  assert.equal(vote.idv, 37177);
  assert.match(vote.actiune, /pentru=110 contra=16 abtineri=107/);
  assert.match(vote.actiune, /retrimiterea la comisie pentru un nou raport Comisia pentru apărare, ordine publică și siguranță națională/);
  assert.equal(day[2].actiune, 'primire raport favorabil aprobarii ordonantei de urgenta de la: Comisia pentru apărare, ordine publică și siguranță națională — face parte din categoria legilor organice');
  // Ziua sosirii: prezentarea are data, înregistrarea și trimiterile la comisii nu.
  assert.deepEqual(
    timeline.filter((t) => t.data === '02.06.2026').map((t) => t.actiune.split(/ (?:la:|pentru dezbatere)/)[0]),
    ['prezentare în Biroul Permanent al Camerei Deputatilor', 'înregistrat la Camera Deputatilor', 'trimis pentru raport', 'trimis pentru aviz'],
  );
  assert.equal(
    timeline.find((t) => /^trimis pentru raport/.test(t.actiune)).actiune,
    'trimis pentru raport la: Comisia pentru apărare, ordine publică și siguranță națională — termen depunere amendamente: 05.06.2026 termen depunere raport: 09.06.2026',
  );
  assert.equal(timeline.length, 12);
});

test('rândurile citite corect și înainte rămân la fel: data, camera, textul fără tabelul cu PDF-uri', () => {
  const { timeline } = sheet('plx-429-2026');
  assert.deepEqual(timeline[0], { camera: 'Senat', data: '26.05.2026', actiune: 'adoptat de Senat adoptare cu respectarea prevederilor art.76 alin.(1) din Constitutia României' });
  assert.deepEqual(timeline[1], { camera: 'Camera Deputaților', data: '02.06.2026', actiune: 'prezentare în Biroul Permanent al Camerei Deputatilor' });
  assert.equal(
    timeline.find((t) => t.data === '29.06.2026').actiune,
    'înscris pe ordinea de zi a plenului Camerei Deputatilor (sub rezerva depunerii raportului) pentru ședințele Camerei Deputaților din 29 și 30 iunie 2026',
  );
});

test('PL-x 184/2026: „de la:” cu una sau mai multe comisii, rândurile ședinței comune fără cameră', () => {
  const { timeline } = sheet('plx-184-2026');
  const avize = timeline.filter((t) => /^primire aviz de la:/.test(t.actiune));
  assert.ok(avize.length > 20);
  assert.ok(avize.every((t) => /de la: Comisia /.test(t.actiune) && t.data === '16.03.2026' && t.camera === 'Camera Deputaților'));
  assert.ok(
    avize.some(
      (t) =>
        t.actiune ===
        'primire aviz de la: Comisia pentru drepturile omului, culte și problemele minorităților naționale; Comisia pentru muncă și protecție socială; Comisia pentru tineret și sport',
    ),
  );
  assert.ok(!timeline.some((t) => /de la:$/.test(t.actiune)));
  assert.equal(timeline.find((t) => /^primire raport/.test(t.actiune)).actiune, 'primire raport de la: Comisia pentru buget, finanțe și bănci');
  // După votul final celulele sunt galben pal: nu sunt ale niciunei camere, iar rândurile fără dată nu se mai pierd.
  assert.deepEqual(timeline.at(-1), { camera: null, data: '27.03.2026', actiune: 'devine Legea nr. 43/2026' });
  assert.deepEqual(timeline.find((t) => t.idv), {
    camera: null,
    data: '20.03.2026',
    actiune: 'adoptat în sedinta comuna a celor doua Camere rezultat vot pentru=319, contra=104, abtineri=1, nu au votat=2 consultati stenograma sedintei sau înregistrarea video',
    idv: 36807,
  });
  assert.equal(timeline.filter((t) => t.data === '13.03.2026').length, 4);
});

test('procedureRows: tabelele din celule rămân întregi, iar tabelul se termină la </table>-ul lui', () => {
  const rows = procedureRows(
    '<p>înainte</p><table><tr><td bgcolor="#fff0d8">01.02.2026</td><td colspan=2>primire aviz de la:<dd><table><td><a href="x.pdf">PDF</a></td><td>A</td></table> notă</td></tr>' +
      '<tr><td>&nbsp;</td><td>al doilea</td></tr></table><table><tr><td>alt tabel</td></tr></table>',
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].length, 2);
  assert.match(rows[0][1].html, /<table>.*<\/table> notă$/);
  assert.match(rows[0][0].open, /bgcolor/);
  assert.equal(rows[1][1].html, 'al doilea');
});
