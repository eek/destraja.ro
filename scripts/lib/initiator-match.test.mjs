// Tabelele de semnături: potrivirea rândurilor cu lista oficială a inițiatorilor (src/lib/initiator-match.ts) și ce
// arată pagina (src/lib/tidy-tables.ts). Cazul de probă e B660/2026: tabel completat de mână, citit de MinerU ca
// „Dezwateu GuoTeu” (Bejinariu Eugen) sau „Saudu Jez,rico” (Sandu Viorica), cu „PSA” în loc de PSD.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { register } from 'node:module';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';

register('./ts-resolve.mjs', import.meta.url);
const { assignRows, distance, fold, hungarian, similarity } = await import('../../src/lib/initiator-match.ts');
const { default: rehypeTidyTables, fixPipeTables, signatureReport } = await import('../../src/lib/tidy-tables.ts');

const FIX = new URL('./fixtures/semnaturi/', import.meta.url);
const md = fs.readFileSync(new URL('b660-2026.md', FIX), 'utf8');
const known = JSON.parse(fs.readFileSync(new URL('b660-2026-initiatori.json', FIX), 'utf8'));
const rows = md.split('\n').filter((l) => /^\|\s*\d+\.?\s*\|/.test(l)).map((l) => l.split('|')[2].trim());

// Ce scrie de mână pe fiecare rând (verificat pe PDF, paginile 9 și 10).
const TRUTH = {
  1: 'Manta Claudiu', 2: 'Andruşcă Lucian-Nicolae', 3: 'Plopeanu Rodica', 4: 'Borş George-Mădălin', 5: 'Bucur Ariana-Oana',
  6: 'Cojocaru Petru-Bogdan', 7: 'Szőke Ecaterina-Mariana', 8: 'Gavrilescu Graţiela-Leocadia', 9: 'Samoilă Ion', 10: 'Rinder Ana-Smaranda', 11: 'Răducanu Sebastian',
  12: 'Mihalcea Silvia-Claudia', 13: 'Peţa-Ştefănescu Eliza-Mădălina', 14: 'Chirilă Virgil Alin', 15: 'Cotea (Geamănu) Aurora-Adela',
  16: 'Stoenică Irina-Florentina', 17: 'Matichescu Mirela-Florenţa', 18: 'Hagiu Augustin-Florin', 19: 'Lăpuşan Remus-Gabriel',
  20: 'Cîmpan Cristian-Emanuel', 21: 'Neaţă Eugen', 22: 'Georgescu Gheorghe-Daniel', 23: 'Bejinariu Eugen', 24: 'Popa Maricel',
  25: 'Drinceanu Vlad-Florentin', 26: 'Chilat Crina-Fiorela', 27: 'Toader Bogdan-Andrei', 28: 'Sandu Viorica', 29: 'Furtună Mirela',
};

const tree = (markdown) => {
  const proc = unified().use(remarkParse).use(remarkGfm).use(remarkRehype);
  return proc.runSync(proc.parse(fixPipeTables(markdown)));
};
const text = (n) => (n.type === 'text' ? n.value : (n.children ?? []).map(text).join(''));
const all = (n, pred, out = []) => {
  if (pred(n)) out.push(n);
  for (const c of n.children ?? []) all(c, pred, out);
  return out;
};
const cls = (n) => (Array.isArray(n.properties?.className) ? n.properties.className : []);

test('literele confundate în scrisul de mână costă jumătate', () => {
  assert.equal(distance('saudu', 'sandu'), 0.5);
  assert.equal(distance('abc', 'abc'), 0);
  assert.equal(distance('abc', 'axc'), 1);
  assert.equal(fold('Peţa-Ştefănescu'), 'peta stefanescu');
});

test('similaritatea: ordinea cuvintelor și prenumele lipsă nu contează', () => {
  assert.ok(similarity('Popa Marèel', 'Popa Maricel') > 0.85);
  assert.ok(similarity('Ion Samoilă', 'Samoilă Ion') > 0.95);
  assert.ok(similarity('Cotea Idela', 'Cotea (Geamănu) Aurora-Adela') > 0.85);
  assert.ok(similarity('Saudu Jez,rico', 'Sandu Viorica') > similarity('Saudu Jez,rico', 'Andruşcă Lucian-Nicolae'));
});

test('algoritmul ungar găsește suma minimă', () => {
  assert.deepEqual(hungarian([[4, 1, 3], [2, 0, 5], [3, 2, 2]]), [1, 0, 2]);
  assert.deepEqual(hungarian([[1, 0]]), [1]);
  assert.deepEqual(hungarian([]), []);
});

test('B660: fiecare nume primit e cel scris de mână, iar rândurile clare sunt toate primite', () => {
  const res = assignRows(rows, known);
  assert.equal(rows.length, 29);
  const got = new Map();
  res.forEach((a, i) => {
    if (a.k === null) return;
    assert.equal(known[a.k].name, TRUTH[i + 1], `rândul ${i + 1} („${rows[i]}”)`);
    assert.ok(!got.has(a.k), `${known[a.k].name} de două ori`);
    got.set(a.k, i);
  });
  // „Saudu Jez,rico” e Sandu Viorica; din 29 de rânduri, cel mult patru rămân pentru citirea pe imagine.
  assert.equal(known[res[27].k].name, 'Sandu Viorica');
  assert.ok(got.size >= 25, `${got.size} din 29`);
});

test('B660: un rând hotărât dinainte (citit pe imagine) iese din joc cu numele lui', () => {
  const bej = known.findIndex((k) => k.name === 'Bejinariu Eugen');
  const res = assignRows(rows, known, { fixed: new Map([[22, bej]]) });
  assert.equal(res[22].k, bej);
  assert.equal(res[22].via, 'fixed');
  assert.equal(res.filter((a) => a.k === bej).length, 1);
  // Un nume dat dinainte de două ori (cineva care a semnat de două ori) rămâne pe ambele rânduri, dar nu pe al treilea.
  const twice = assignRows(rows, known, { fixed: new Map([[22, bej], [7, bej]]) });
  assert.deepEqual(twice.map((a, i) => (a.k === bej ? i : -1)).filter((i) => i >= 0), [7, 22]);
});

test('eliminarea: rândul rămas își alege numele dintre cei încă nefolosiți', () => {
  const names = [{ name: 'Popescu Ion' }, { name: 'Ionescu Maria-Elena' }, { name: 'Vasilescu Dan' }, { name: 'Georgescu Ana' }];
  // „Vosilecu Dau” seamănă cu Vasilescu Dan; ceilalți trei sunt limpezi și ies primii din joc.
  const res = assignRows(['Popescu Ion', 'Ionescu Maria', 'Georgescu Ana', 'Vosilecu Dau'], names);
  assert.deepEqual(res.map((a) => a.k), [0, 1, 3, 2]);
});

test('un nume care nu e pe listă rămâne nesigur', () => {
  const res = assignRows(['Popescu Ion', 'Xyzw Qrtp'], [{ name: 'Popescu Ion' }, { name: 'Ionescu Maria' }, { name: 'Vasilescu Dan' }]);
  assert.equal(res[0].k, 0);
  assert.equal(res[1].k, null);
});

test('B660 pe pagină: numele și grupul după lista oficială, legătura spre pagina din PDF', () => {
  const t = tree(md);
  const read = { [fold('Dezwateu GuoTeu')]: 'Bejinariu Eugen' };
  const pdfUrl = 'https://www.senat.ro/legis/PDF/2026/26b660EM.PDF';
  rehypeTidyTables({ names: known, signatures: { pdfUrl, read, pages: [{ page: 9, rows: [fold('Manda Claudun')] }, { page: 10, rows: [fold('Popa Marèel'), fold('Saudu Jez,rico')] }] } })(t);
  const byNr = new Map(all(t, (n) => n.tagName === 'tr').map((tr) => {
    const cells = all(tr, (n) => n.tagName === 'td');
    return [text(cells[0] ?? { type: 'text', value: '' }).replace(/\.$/, ''), cells];
  }));
  const row = (nr) => byNr.get(String(nr)).map(text);
  assert.deepEqual(row(23).slice(1, 3), ['Bejinariu Eugen', 'PSD']);
  assert.deepEqual(row(28).slice(1, 3), ['Sandu Viorica', 'PSD']);
  for (const nr of [25, 26, 27]) assert.equal(row(nr)[2], 'PSD', `grupul rândului ${nr}`);
  const links = all(t, (n) => n.tagName === 'a').map((a) => [text(a), a.properties.href]);
  assert.deepEqual(links, [['pagina 9', `${pdfUrl}#page=9`], ['pagina 10', `${pdfUrl}#page=10`]]);
  const notes = all(t, (n) => cls(n).includes('table-note')).map(text).join(' ');
  assert.match(notes, /Tabelul semnat, în PDF: pagina 10/);
  assert.match(notes, /completat de mână/);
  assert.match(notes, /Gemini/);
  // Rândurile rămase nesigure au numele și grupul din PDF, în cursiv.
  for (const td of all(t, (n) => cls(n).includes('unsure'))) assert.ok(!Object.values(TRUTH).includes(text(td)));
});

test('signatureReport dă rândurile cu numărul curent și alegerea fiecăruia', () => {
  const report = signatureReport(tree(md), known);
  assert.equal(report.length, 29);
  assert.deepEqual(report[22], { nr: '23', ocr: 'Dezwateu GuoTeu', ocrGroup: 'PSA', table: 1, k: report[22].k, via: report[22].via });
  assert.equal(report.filter((r) => r.table === 0).length, 22);
});

test('un tabel care nu e de semnături rămâne neatins', () => {
  const t = tree('| Instituția | Avizul |\n| --- | --- |\n| Consiliul Legislativ | favorabil |\n| Guvernul | negativ |\n');
  rehypeTidyTables({ names: known })(t);
  assert.equal(all(t, (n) => cls(n).includes('table-note') || cls(n).includes('unsure')).length, 0);
});
