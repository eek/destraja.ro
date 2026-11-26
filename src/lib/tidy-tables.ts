// Tabelele din textele recunoscute din PDF-uri (MinerU) vin cu rânduri goale, coloane goale, antetul repetat la fiecare
// pagină, „tabele” cu o singură coloană care sunt de fapt paragrafe și, în Markdown, tabele fără rândul de separare (pe
// care GFM nu le recunoaște și le lasă ca text cu bare verticale). Aici le curățăm înainte de randare:
// - fixPipeTables: repară Markdown-ul (separatorul lipsă; o celulă pe rând devine paragraf);
// - rehypeTidyTables: curăță arborele HTML (rânduri și coloane goale, tabele de o coloană, antet, coloane înguste) și,
//   când primește lista oficială a inițiatorilor, pune numele din tabelele de semnături pe lista aceea (OCR-ul le strică
//   des: „AUNCA HARIUS” e Dunca Marius-Alexandru; potrivirea e în initiator-match.ts) și grupul din aceeași listă.

import { assignRows, fold, similarity, type KnownName } from './initiator-match';

export type { KnownName };

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




// --- Tabelele de semnături: numele după lista oficială a inițiatorilor (senat.ro), grupul din aceeași listă ---

/** Ce știm din afara textului despre tabelele de semnături ale unui document (scripts/straja-tabel-semnaturi.mjs). */
export type SignatureInfo = {
  /** PDF-ul oficial, pentru legătura spre pagina tabelului. */
  pdfUrl?: string;
  /** Pagina din PDF a fiecărui tabel de semnături, cu numele recunoscute în el (pliate cu fold). */
  pages?: { page: number; rows: string[] }[];
  /** Rândurile citite de un model pe imaginea paginii: textul recunoscut (pliat) → numele oficial. */
  read?: Record<string, string>;
};

const nameLike = (s: string) => s.length >= 4 && s.length <= 60 && /\p{L}{2}/u.test(s) && !/\d{2}/.test(s);
const PARTY_HINT = /ps|pnl|usr|aur|udmr|sos|pot|neaf|minor|pmp|pro/i;
const STRONG = 0.72;

type SigRow = {
  name: Node;
  group?: Node;
  /** Numărul curent („23”), textul recunoscut al numelui și al grupului, înainte de corectare. */
  nr: string;
  ocr: string;
  ocrGroup: string;
  /** Inițiatorul ales (indice în lista oficială) și de unde vine alegerea, după correctNames. */
  k?: number | null;
  via?: 'text' | 'fixed' | null;
};

/**
 * Celulele fiecărui rând pe coloanele lor adevărate: o celulă unită pe verticală (coloana „Semnătura”, cu rowspan pe tot
 * tabelul) ține locul ei și în rândurile de dedesubt, iar una unită pe orizontală ocupă mai multe coloane.
 */
function grid(table: Node): Node[][] {
  const out: Node[][] = [];
  const carry: number[] = [];
  for (const { row } of rowsOf(table)) {
    const line: Node[] = [];
    let col = 0;
    for (const cell of cellsIn(row)) {
      while (carry[col] > 0) col++;
      const cs = Math.max(1, Number(cell.properties?.colSpan ?? 1)), rs = Math.max(1, Number(cell.properties?.rowSpan ?? 1));
      for (let k = 0; k < cs; k++) {
        line[col + k] = cell;
        if (rs > 1) carry[col + k] = rs;
      }
      col += cs;
    }
    for (let c = 0; c < carry.length; c++) if (carry[c] > 0) carry[c]--;
    out.push(line);
  }
  // Rândurile pot ieși cu goluri (sub o celulă unită): golurile rămân undefined.
  return out;
}
type SigTable = { table: Node; parent: Node; rows: SigRow[] };

/** Coloana numelor și a grupului dintr-un tabel de semnături, sau null dacă tabelul nu e unul. */
function signatureRows(table: Node, known: KnownName[]): SigRow[] | null {
  const all = grid(table);
  const head = all.find((cells) => cells.some((c) => c.tagName === 'th'))?.map((c) => fold(text(c))) ?? [];
  const data = all.filter((cells) => cells.every((c) => c.tagName !== 'th'));
  const width = Math.max(0, ...data.map((r) => r.length));
  if (!data.length || width < 2) return null;
  const best = (s: string) => Math.max(0, ...known.map((k) => similarity(s, k.name)));
  // Coloana numelor: cea cu „nume” în antet, altfel cea cu cele mai multe celule care arată a nume.
  let nameCol = head.findIndex((h) => /\bnume/.test(h));
  const filledIn = (col: number) => data.map((r) => r[col]).filter((c): c is Node => !!c && nameLike(text(c).trim()));
  if (nameCol < 0) {
    let most = 0;
    for (let col = 0; col < width; col++) {
      const n = filledIn(col).length;
      if (n > most) [most, nameCol] = [n, col];
    }
  }
  if (nameCol < 0) return null;
  const names = filledIn(nameCol);
  if (!names.length) return null;
  const scores = names.map((c) => best(text(c)));
  const strong = scores.filter((s) => s >= STRONG).length;
  // Un tabel de semnături: antetul o spune („Nume și prenume”, „Semnătura”/„Grup”) și măcar un nume seamănă cu un
  // inițiator, sau cel puțin jumătate din nume (minimum trei) se potrivesc sigur.
  const headerSays = head.some((h) => /\bnume/.test(h)) && head.some((h) => /semn|grup|partid|formatiun/.test(h));
  if (!((headerSays && Math.max(...scores) >= 0.55) || (names.length >= 3 && strong >= names.length / 2))) return null;
  // Coloana grupului: după antet, altfel o coloană scurtă în care apar inițialele partidelor.
  let groupCol = head.findIndex((h, i) => i !== nameCol && /grup|partid|formatiun|apartenen/.test(h));
  if (groupCol < 0) {
    for (let col = 1; col < width && groupCol < 0; col++) {
      if (col === nameCol) continue;
      const cells = data.map((r) => text(r[col] ?? { type: 'text', value: '' }).trim()).filter(Boolean);
      if (cells.length && cells.filter((t) => t.length <= 12 && !/\d/.test(t)).length >= cells.length / 2 && cells.some((t) => PARTY_HINT.test(t))) groupCol = col;
    }
  }
  const nrCol = nameCol > 0 ? 0 : -1;
  return data
    .filter((r) => r[nameCol] && nameLike(text(r[nameCol]).trim()))
    .map((r) => {
      const group = groupCol >= 0 ? r[groupCol] : undefined;
      const nr = nrCol >= 0 && r[nrCol] ? text(r[nrCol]).trim().replace(/[.)]$/, '') : '';
      return { name: r[nameCol], group, nr, ocr: text(r[nameCol]).trim(), ocrGroup: group ? text(group).trim() : '' };
    });
}

type SigResult = { total: number; fixed: number; groups: number; byModel: number; unsure: number };

/** Potrivirea pentru toate tabelele de semnături ale documentului deodată: un inițiator apare o singură dată în tot documentul. */
function correctNames(tables: SigTable[], known: KnownName[], info: SignatureInfo): SigResult {
  const rows = tables.flatMap((t) => t.rows);
  const cells = rows.map((r) => text(r.name).trim());
  const byFold = new Map(known.map((k, i) => [fold(k.name), i]));
  const fixed = new Map<number, number>();
  cells.forEach((c, i) => {
    const official = info.read?.[fold(c)];
    const k = official ? byFold.get(fold(official)) : undefined;
    if (k !== undefined) fixed.set(i, k);
  });
  const result = assignRows(cells, known, { fixed });
  const r: SigResult = { total: rows.length, fixed: 0, groups: 0, byModel: 0, unsure: 0 };
  result.forEach((a, i) => {
    const row = rows[i];
    row.k = a.k;
    row.via = a.via;
    if (a.k === null) {
      addClass(row.name, 'unsure');
      if (row.group && !empty(text(row.group))) addClass(row.group, 'unsure');
      r.unsure++;
      return;
    }
    const k = known[a.k];
    // Numărăm doar numele chiar schimbate (nu „Mazilu Liviu” scris întreg ca „Mazilu Liviu-Lucian”).
    if (similarity(cells[i], k.name) < 0.97) r.fixed++;
    if (a.via === 'fixed') r.byModel++;
    row.name.children = [{ type: 'text', value: k.name }];
    if (row.group) {
      if (k.party) {
        if (fold(text(row.group)) !== fold(k.party)) r.groups++;
        row.group.children = [{ type: 'text', value: k.party }];
      } else if (!empty(text(row.group))) addClass(row.group, 'unsure');
    }
  });
  return r;
}

// „22 de nume”, nu „22 nume”: de la 20 în sus, numeralul cere „de” (cu excepția celor terminate în 01–19).
const deNume = (n: number) => (n % 100 >= 1 && n % 100 <= 19 ? `${n} nume` : `${n} de nume`);
const para = (children: Node[]): Node => ({ type: 'element', tagName: 'p', properties: { className: ['table-note'] }, children });
const t = (value: string): Node => ({ type: 'text', value });

function note(r: SigResult): Node | null {
  // Scris de mână: textul recunoscut a stricat cel puțin o treime din nume (tabelele tipărite ies aproape curate).
  const handwritten = r.fixed >= Math.max(2, r.total * 0.3);
  const parts = [
    handwritten
      ? 'Tabelul e completat de mână, iar textul recunoscut automat din scanare îi strică numele. De aceea numele și grupurile sunt scrise după lista oficială a inițiatorilor de pe senat.ro.'
      : r.fixed || r.groups
        ? 'Numele din tabel sunt scrise după lista oficială a inițiatorilor de pe senat.ro; textul recunoscut din PDF le stricase.'
        : null,
    r.byModel === 1
      ? 'Un nume pe care textul recunoscut nu-l lămurea l-a citit un model AI (Gemini) pe imaginea paginii, alegând tot din lista oficială.'
      : r.byModel > 1
        ? `${deNume(r.byModel)} pe care textul recunoscut nu le lămurea le-a citit un model AI (Gemini) pe imaginea paginii, alegând tot din lista oficială.`.replace(/^./, (c) => c.toUpperCase())
        : null,
    r.unsure === 1
      ? 'Numele în cursiv nu se potrivește sigur cu niciun inițiator de pe senat.ro și a rămas cum e în PDF, cu grupul citit tot de acolo.'
      : r.unsure > 1
        ? `Cele ${deNume(r.unsure)} în cursiv nu se potrivesc sigur cu niciun inițiator de pe senat.ro și au rămas cum sunt în PDF, cu grupul citit tot de acolo.`
        : null,
  ].filter(Boolean);
  return parts.length ? para([t(parts.join(' '))]) : null;
}

/** „Tabelul semnat, în PDF: pagina 10”, cu legătura spre pagina din PDF-ul oficial. */
function pageLink(sig: SigTable, info: SignatureInfo): Node | null {
  if (!info.pdfUrl || !info.pages?.length) return null;
  const names = new Set(sig.rows.map((r) => fold(r.ocr)));
  let best: { page: number; hits: number } | null = null;
  for (const p of info.pages) {
    const hits = p.rows.filter((x) => names.has(x)).length;
    if (hits && (!best || hits > best.hits)) best = { page: p.page, hits };
  }
  if (!best) return null;
  const href = `${info.pdfUrl.split('#')[0]}#page=${best.page}`;
  return para([
    t('Tabelul semnat, în PDF: '),
    { type: 'element', tagName: 'a', properties: { href, target: '_blank', rel: ['noopener', 'noreferrer'] }, children: [t(`pagina ${best.page}`)] },
  ]);
}

function walk(node: Node, known: KnownName[], found: SigTable[]) {
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
      const rows = known.length ? signatureRows(child, known) : null;
      if (rows?.length) found.push({ table: child, parent: node, rows });
      next.push(child);
      continue;
    } else walk(child, known, found);
    next.push(child);
  }
  node.children = next;
}

/** Pune un nod chiar înainte (offset 0) sau chiar după (offset 1) un tabel. */
const insertAt = (parent: Node, ref: Node, offset: 0 | 1, node: Node) => {
  const list = parent.children ?? [];
  const i = list.indexOf(ref);
  if (i >= 0) list.splice(i + offset, 0, node);
};

function tidyTree(tree: Node, known: KnownName[], info: SignatureInfo) {
  const found: SigTable[] = [];
  walk(tree, known, found);
  if (!found.length) return [];
  // Rândurile semnate apar în ordine pe toate paginile, deci le potrivim împreună (eliminarea lucrează pe tot documentul).
  const r = correctNames(found, known, info);
  // Pagina din PDF deasupra fiecărui tabel (fiecare pagină are tabelul ei), nota o singură dată, sub ultimul.
  found.forEach((sig, i) => {
    const link = pageLink(sig, info);
    if (link) insertAt(sig.parent, sig.table, 0, link);
    const n = i === found.length - 1 ? note(r) : null;
    if (n) insertAt(sig.parent, sig.table, 1, n);
  });
  return found;
}

export type SignatureRow = { nr: string; ocr: string; ocrGroup: string; table: number; k: number | null; via: 'text' | 'fixed' | null };

/**
 * Rândurile tabelelor de semnături dintr-un arbore HTML (același drum ca pe pagină), cu inițiatorul ales pentru fiecare.
 * Pentru scripts/straja-tabel-semnaturi.mjs: ce nu se lămurește din text merge la citirea pe imagine. Arborele se schimbă.
 */
export function signatureReport(tree: Node, known: KnownName[], info: SignatureInfo = {}): SignatureRow[] {
  return tidyTree(tree, known, info).flatMap((sig, table) =>
    sig.rows.map((row) => ({ nr: row.nr, ocr: row.ocr, ocrGroup: row.ocrGroup, table, k: row.k ?? null, via: row.via ?? null })),
  );
}

/** Pluginul rehype: rulează după sanitize, ca clasele și legăturile adăugate aici să rămână. */
export default function rehypeTidyTables(options: { names?: KnownName[]; signatures?: SignatureInfo } = {}) {
  return (tree: Node) => void tidyTree(tree, options.names ?? [], options.signatures ?? {});
}
