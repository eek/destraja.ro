import test from 'node:test';
import assert from 'node:assert/strict';
import { committeeAvizRows, committeeVerdict } from './avize.mjs';

// Bucăți din derularea procedurii de pe cdep.ro (noiembrie 2026), cu structura păstrată: un rând fără dată (aceeași zi),
// un aviz cu PDF și DOC, unul comun pentru două comisii și unul al Senatului, care nu se numără.
const row = (color, date, body) =>
  `<tr valign="top"><td align="center" bgcolor="#${color}">\n${date || '&nbsp;'}\n</td><td align="center" nowrap>&nbsp;</td><td colspan=2>\n${body}\n</td></tr>`;
const com = (idc, name) => `<a href="/ords/pls/parlam/structura2015.co?idc=${idc}&leg=2024&cam=2&pag=comp20260318">${name}</a>`;
const files = (dir, n) =>
  `<td nowrap valign=top> <a href="/comisii/${dir}/pdf/2026/av${n}.pdf" target="PDF"><img src="/img/icon_pdf_small.gif" alt="PDF format"></a> <a href="/comisii/${dir}/doc/2026/av${n}.docx"><img alt="DOC format"></a></td>`;
const HTML = `<b>Derularea procedurii</b><table>
${row('fff0d8', '09.03.2026', `trimis pentru aviz la:<dd><table><td>${com(5, 'Comisia pentru drepturile omului')}</td></table>`)}
${row('fff0d8', '18.03.2026', `primire aviz de la:<dd><table>${files('drepturile_omului', 156)}<td>${com(5, 'Comisia pentru drepturile omului')}</td></table>`)}
${row('fff0d8', '', `primire aviz de la:<dd><table>${files('economica', 156)}<td>${com(1, 'Comisia pentru politică economică')}<br>- <i>Anexa 3/14</i><br>${com(3, 'Comisia pentru industrii şi servicii')}</td></table>`)}
${row('dfefff', '19.03.2026', `primire aviz de la:<dd><table><td>${com(99, 'Comisia de la Senat')}</td></table>`)}
</table></html>`;

test('committeeAvizRows: un document pe aviz, cu ziua, comisiile și PDF-ul', () => {
  const rows = committeeAvizRows(HTML);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    receivedAt: '2026-03-18',
    committees: [{ idc: 5, nume: 'Comisia pentru drepturile omului' }],
    pdfUrl: 'https://www.cdep.ro/comisii/drepturile_omului/pdf/2026/av156.pdf',
    docUrl: 'https://www.cdep.ro/comisii/drepturile_omului/doc/2026/av156.docx',
  });
  // Rândul fără dată ia ziua de deasupra; avizul comun are ambele comisii.
  assert.equal(rows[1].receivedAt, '2026-03-18');
  assert.deepEqual(
    rows[1].committees.map((c) => c.idc),
    [1, 3],
  );
  assert.equal(rows[1].committees[1].nume, 'Comisia pentru industrii și servicii');
});

test('committeeVerdict: formula comisiei, nu avizul Consiliului Legislativ citat mai sus', () => {
  const v = committeeVerdict(
    'Consiliul Legislativ a avizat negativ propunerea. În ședința din 17 martie 2026, membrii Comisiei au hotărât, cu unanimitate de voturi, avizarea favorabilă a proiectului de lege în forma adoptată de Senat.',
  );
  assert.equal(v.verdict, 'favorabil');
  assert.match(v.verdictQuote, /^În ședința din 17 martie 2026, membrii Comisiei au hotărât/);
  assert.equal(v.vote.statement, 'cu unanimitate de voturi');
  assert.equal(v.date, '2026-03-17');
});

test('committeeVerdict: favorabil cu amendamente, negativ, respingere, voturi numărate', () => {
  assert.equal(committeeVerdict('Comisia a hotărât să avizeze favorabil propunerea legislativă, cu amendamentele admise prezentate în anexă.').verdict, 'favorabil_cu_amendamente');
  assert.equal(committeeVerdict('Comisia a hotărât avizarea favorabilă, fără amendamente, a proiectului.').verdict, 'favorabil');
  const neg = committeeVerdict('Membrii comisiei au hotărât, cu 12 voturi pentru, 3 împotrivă și 2 abțineri, să avizeze nega-\ntiv propunerea legislativă. Avizul favorabil al Consiliului Legislativ.');
  assert.equal(neg.verdict, 'negativ');
  assert.deepEqual([neg.vote.pentru, neg.vote.contra, neg.vote.abtineri], [12, 3, 2]);
  const v2 = committeeVerdict('Comisia, cu 14 voturi pentru și 4 voturi împotrivă, a hotărât să emită aviz negativ asupra propunerii legislative.');
  assert.equal(v2.verdict, 'negativ');
  assert.deepEqual([v2.vote.pentru, v2.vote.contra], [14, 4]);
  assert.equal(committeeVerdict('Comisia propune comisiei sesizate în fond respingerea propunerii legislative.').verdict, 'negativ');
  assert.equal(committeeVerdict('Urmare a votului exprimat, nu a fost întrunită majoritatea pentru avizarea favorabilă a propunerii.').verdict, 'negativ');
  assert.equal(committeeVerdict('Text fără nicio formulă.').verdict, 'neclar');
});
