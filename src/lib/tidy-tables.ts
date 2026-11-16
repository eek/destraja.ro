// Tabelele din textele recunoscute din PDF-uri (MinerU) vin cu rânduri goale, coloane goale, antetul repetat la fiecare
// pagină, „tabele” cu o singură coloană care sunt de fapt paragrafe și, în Markdown, tabele fără rândul de separare (pe
// care GFM nu le recunoaște și le lasă ca text cu bare verticale). Aici le curățăm înainte de randare:
// - fixPipeTables: repară Markdown-ul (separatorul lipsă; o celulă pe rând devine paragraf);
// - rehypeTidyTables: curăță arborele HTML (rânduri și coloane goale, tabele de o coloană, antet, coloane înguste).

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

function walk(node: Node) {
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
    } else walk(child);
    next.push(child);
  }
  node.children = next;
}

/** Pluginul rehype: rulează după sanitize, ca clasele adăugate aici să rămână. */
export default function rehypeTidyTables() {
  return (tree: Node) => walk(tree);
}
