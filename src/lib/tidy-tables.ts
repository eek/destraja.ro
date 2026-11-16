// Tabelele din textele recunoscute din PDF-uri (MinerU) vin cu rânduri goale, coloane goale, antetul repetat la fiecare
// pagină, „tabele” cu o singură coloană care sunt de fapt paragrafe și, în Markdown, tabele fără rândul de separare (pe
// care GFM nu le recunoaște și le lasă ca text cu bare verticale). Aici le curățăm înainte de randare:
// - fixPipeTables: repară Markdown-ul (separatorul lipsă; o celulă pe rând devine paragraf);
// - rehypeTidyTables: curăță arborele HTML (rânduri și coloane goale, tabele de o coloană, antet, coloane înguste) și,
//   când primește lista oficială a inițiatorilor, corectează numele din tabelele de semnături (OCR-ul le strică des:
//   „AUNCA HARIUS” e Dunca Marius-Alexandru).

type Node = { type: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: Node[] };

const PIPE_ROW = /^\s*\|.*\|\s*$/;
const SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const cellsOf = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

/** Repară tabelele Markdown fără rândul de separare și transformă blocurile de câte o celulă în paragrafe. */
export function fixPipeTables(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!PIPE_ROW.test(lines[i]) || (i > 0 && PIPE_ROW.test(lines[i - 1]))) {
      out.push(lines[i]);
      continue;
    }
    let end = i;
    while (end + 1 < lines.length && (PIPE_ROW.test(lines[end + 1]) || SEPARATOR.test(lines[end + 1]))) end++;
    const block = lines.slice(i, end + 1);
    const rows = block.filter((l) => !SEPARATOR.test(l));
    if (rows.every((l) => cellsOf(l).length <= 1)) {
      for (const l of rows) out.push(cellsOf(l)[0] ?? '', '');
    } else if (block.length > 1 && SEPARATOR.test(block[1])) {
      out.push(...block);
    } else {
      const n = Math.max(...rows.map((l) => cellsOf(l).length));
      out.push(rows[0], `|${' --- |'.repeat(n)}`, ...rows.slice(1));
    }
    i = end;
  }
  return out.join('\n');
}

const text = (n: Node): string => (n.type === 'text' ? (n.value ?? '') : (n.children ?? []).map(text).join(''));
const isEl = (n: Node, ...tags: string[]) => n.type === 'element' && tags.includes(n.tagName ?? '');
const empty = (s: string) => /^[\s\-–—.·_]*$/.test(s);
const addClass = (n: Node, c: string) => {
  n.properties ??= {};
  const cur = n.properties.className;
  n.properties.className = [...(Array.isArray(cur) ? cur : cur ? [String(cur)] : []), c];
};

function rowsOf(table: Node): { row: Node; parent: Node }[] {
  const out: { row: Node; parent: Node }[] = [];
  for (const sec of table.children ?? []) {
    if (isEl(sec, 'tr')) out.push({ row: sec, parent: table });
    else if (isEl(sec, 'thead', 'tbody', 'tfoot')) for (const r of sec.children ?? []) if (isEl(r, 'tr')) out.push({ row: r, parent: sec });
  }
  return out;
}
const cellsIn = (row: Node) => (row.children ?? []).filter((c) => isEl(c, 'td', 'th'));
const spans = (table: Node) => rowsOf(table).some(({ row }) => cellsIn(row).some((c) => Number(c.properties?.colSpan ?? 1) > 1 || Number(c.properties?.rowSpan ?? 1) > 1));

/** Ce facem cu un tabel: null = îl scoatem, o listă de noduri = îl înlocuim (paragrafe), altfel îl lăsăm curățat. */
function tidy(table: Node): Node[] | null | undefined {
  for (const { row, parent } of rowsOf(table)) {
    // Gol: nicio celulă cu text, sau doar numărul curent („23.”) și restul goale (rândurile nefolosite ale unui tabel
    // de semnături scanat).
    const filled = cellsIn(row).filter((c) => !empty(text(c)));
    if (!filled.length || (cellsIn(row).length >= 2 && filled.every((c) => /^\d{1,3}[.)]?$/.test(text(c).trim()))))
      parent.children = (parent.children ?? []).filter((x) => x !== row);
  }
  let rows = rowsOf(table);
  if (!rows.length) return null;
  // O singură coloană: e text așezat în chenar, nu un tabel. Fiecare rând devine un paragraf.
  if (rows.every(({ row }) => cellsIn(row).length <= 1)) {
    return rows.map(({ row }) => ({ type: 'element', tagName: 'p', properties: {}, children: cellsIn(row)[0]?.children ?? [] }));
  }
  const hasSpans = spans(table);
  // Coloanele goale de sus până jos (doar fără celule unite, ca indicii coloanelor să fie aceiași pe fiecare rând).
  if (!hasSpans) {
    const width = Math.max(...rows.map(({ row }) => cellsIn(row).length));
    const keep = Array.from({ length: width }, (_, i) => rows.some(({ row }) => !empty(text(cellsIn(row)[i] ?? { type: 'text', value: '' }))));
    if (keep.some((k) => !k)) {
      for (const { row } of rows) {
        let i = -1;
        row.children = (row.children ?? []).filter((c) => (isEl(c, 'td', 'th') ? keep[++i] : true));
      }
    }
  }
  rows = rowsOf(table);
  // Antetul: fără niciun <th>, primul rând cu celule scurte (și fără un număr curent, care ar fi un rând de date dintr-un
  // tabel continuat) devine antet; rândurile identice cu el mai jos (antetul
  // repetat pe fiecare pagină a PDF-ului) se arată tot ca antet.
  const first = cellsIn(rows[0].row);
  const head = first.map((c) => text(c).trim());
  const noTh = rows.every(({ row }) => cellsIn(row).every((c) => c.tagName === 'td'));
  if (noTh && rows.length >= 2 && first.length >= 2 && head.every((h) => h.length <= 60 && !/^\d+[.)]?$/.test(h)) && head.some((h) => /\p{L}/u.test(h))) {
    for (const c of first) c.tagName = 'th';
  }
  // Antetul repetat: același text ca primul rând, sau un rând care începe cu „Nr. crt.” și are doar etichete scurte
  // (PDF-urile îl scriu puțin diferit pe fiecare pagină: „Nr.Crt.”, „Nume și prenume” / „Nume Prenume”).
  const headerLike = (cells: Node[]) => /^nr\.?\s*crt\.?$/i.test(text(cells[0] ?? { type: 'text', value: '' }).trim()) && cells.every((c) => text(c).trim().length <= 40 && !/^\d/.test(text(c).trim()));
  if (first.every((c) => c.tagName === 'th') || headerLike(first)) {
    if (headerLike(first)) for (const c of first) c.tagName = 'th';
    for (const { row } of rows.slice(1)) {
      const cells = cellsIn(row);
      if ((cells.length === head.length && cells.every((c, i) => text(c).trim() === head[i])) || headerLike(cells)) {
        for (const c of cells) c.tagName = 'th';
        addClass(row, 'repeat');
      }
    }
  }
  // Coloanele scurte (numere curente, „Nr. crt.”) rămân înguste, ca restul să aibă loc. Cu celule unite nu știm sigur
  // ce coloană e fiecare celulă, cu excepția primei, dacă ea însăși nu e unită.
  const firstCells = rows.map(({ row }) => cellsIn(row)[0]).filter(Boolean) as Node[];
  if (hasSpans && firstCells.every((c) => Number(c.properties?.colSpan ?? 1) === 1 && text(c).trim().length <= 12)) for (const c of firstCells) addClass(c, 'narrow');
  if (!hasSpans) {
    const width = Math.max(...rows.map(({ row }) => cellsIn(row).length));
    for (let i = 0; i < width; i++) {
      const col = rows.map(({ row }) => cellsIn(row)[i]).filter(Boolean) as Node[];
      if (col.length && col.every((c, k) => text(c).trim().length <= (k === 0 ? 12 : 8))) for (const c of col) addClass(c, 'narrow');
    }
  }
  return undefined;
}


// --- Numele din tabelele de semnături, după lista oficială a inițiatorilor (senat.ro) ---

export type KnownName = { name: string; party?: string | null };

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/-/g, ' ').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
function lev(a: string, b: string) {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length];
}
const ratio = (a: string, b: string) => 1 - lev(a, b) / Math.max(a.length, b.length, 1);
const sortWords = (s: string) => s.split(' ').sort().join(' ');
/** Formele în care poate apărea un nume în tabel: întreg, numele de familie cu fiecare prenume, în ambele ordini. */
function forms(name: string) {
  const w = fold(name.replace(/\([^)]*\)/g, ' ')).split(' ').filter(Boolean);
  const out = new Set([w.join(' '), [...w].reverse().join(' ')]);
  for (let i = 1; i < w.length; i++) out.add(`${w[0]} ${w[i]}`).add(`${w[i]} ${w[0]}`);
  return [...out];
}
/** Cât de aproape e celula de un nume: ca atare, cu cuvintele sortate și fără spații (OCR-ul lipește cuvintele). */
const closeness = (cell: string, vs: string[]) =>
  Math.max(...vs.map((v) => Math.max(ratio(cell, v), ratio(sortWords(cell), sortWords(v)), ratio(cell.replace(/ /g, ''), v.replace(/ /g, '')))));
const nameLike = (s: string) => s.length >= 5 && s.length <= 60 && /\p{L}{2}/u.test(s) && !/\d{2}/.test(s);
const PARTY = /^(PSD|PNL|USR|AUR|UDMR|SOS|POT|PMP|PRO|minorit|neafilia|independent)/i;

/** Scorul fiecărei celule față de fiecare nume cunoscut, apoi potrivire lacomă: fiecare inițiator cel mult o dată. */
function correctNames(table: Node, known: KnownName[]): { fixed: number; unsure: number } | null {
  const rows = rowsOf(table).map(({ row }) => cellsIn(row)).filter((cells) => cells.every((c) => c.tagName !== 'th'));
  const width = Math.max(0, ...rows.map((r) => r.length));
  const variants = known.map((k) => forms(k.name));
  let fixed = 0, unsure = 0, any = false;
  for (let col = 0; col < width; col++) {
    const cells = rows.map((r) => ({ cell: r[col], row: r })).filter((x) => x.cell && nameLike(text(x.cell).trim()));
    if (cells.length < 3) continue;
    const scored = cells.map(({ cell, row }) => {
      const c = fold(text(cell));
      const party = row.map((x) => text(x).trim()).find((s) => s !== text(cell).trim() && PARTY.test(s));
      return { cell, party, scores: variants.map((vs) => closeness(c, vs)) };
    });
    // O coloană de nume: cel puțin jumătate din celule se potrivesc sigur cu un inițiator.
    if (scored.filter((s) => Math.max(...s.scores) >= 0.72).length < cells.length / 2) continue;
    any = true;
    const pairs = scored.flatMap((s, i) => s.scores.map((score, k) => ({ i, k, score }))).sort((a, b) => b.score - a.score);
    const usedCell = new Set<number>(), usedName = new Set<number>();
    for (const { i, k, score } of pairs) {
      if (usedCell.has(i) || usedName.has(k) || score < 0.6) continue;
      const s = scored[i];
      const second = Math.max(0, ...s.scores.filter((_, j) => j !== k && !usedName.has(j)));
      const partyOk = !s.party || !known[k].party || fold(s.party).startsWith(fold(known[k].party!).slice(0, 3));
      // Sigur: aproape identic, sau destul de aproape și clar mai aproape decât următorul nume; partidul din rând contează.
      if (!(score >= 0.72 || score - second >= 0.12) || (!partyOk && score < 0.85)) continue;
      usedCell.add(i);
      usedName.add(k);
      // Numărăm doar numele chiar schimbate (nu „Mazilu Liviu” scris întreg ca „Mazilu Liviu-Lucian”).
      if (score < 0.97 && !variants[k].includes(fold(text(s.cell)))) fixed++;
      s.cell.children = [{ type: 'text', value: known[k].name }];
    }
    scored.forEach((s, i) => {
      if (!usedCell.has(i)) {
        addClass(s.cell, 'unsure');
        unsure++;
      }
    });
  }
  return any ? { fixed, unsure } : null;
}

// „22 de nume”, nu „22 nume”: de la 20 în sus, numeralul cere „de” (cu excepția celor terminate în 01–19).
const deNume = (n: number) => (n % 100 >= 1 && n % 100 <= 19 ? `${n} nume` : `${n} de nume`);
const note = (r: { fixed: number; unsure: number }): Node => ({
  type: 'element',
  tagName: 'p',
  properties: { className: ['table-note'] },
  children: [
    {
      type: 'text',
      value: [
        r.fixed ? 'Numele din tabel sunt scrise după lista oficială a inițiatorilor de pe senat.ro; textul recunoscut din PDF le stricase.' : null,
        r.unsure === 1
          ? 'Numele în cursiv nu se potrivește sigur cu niciun inițiator de pe senat.ro și a rămas cum e în PDF.'
          : r.unsure > 1
            ? `Cele ${deNume(r.unsure)} în cursiv nu se potrivesc sigur cu niciun inițiator de pe senat.ro și au rămas cum sunt în PDF.`
            : null,
      ].filter(Boolean).join(' '),
    },
  ],
});

function walk(node: Node, known: KnownName[]) {
  if (!node.children) return;
  const next: Node[] = [];
  for (const child of node.children) {
    if (isEl(child, 'table')) {
      const r = tidy(child);
      if (r === null) continue;
      if (r) {
        next.push(...r);
        continue;
      }
      const names = known.length ? correctNames(child, known) : null;
      next.push(child);
      if (names && (names.fixed || names.unsure)) next.push(note(names));
      continue;
    } else walk(child, known);
    next.push(child);
  }
  node.children = next;
}

/** Pluginul rehype: rulează după sanitize, ca clasele adăugate aici să rămână. */
export default function rehypeTidyTables(options: { names?: KnownName[] } = {}) {
  return (tree: Node) => walk(tree, options.names ?? []);
}
