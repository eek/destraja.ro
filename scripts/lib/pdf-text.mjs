// Textul din PDF-urile Senatului. Toate sunt scanări (Epson Scan, OmniPage, Xerox), iar stratul de text pus de scaner
// nu e de încredere („institu~iile”, „destina!iei”), așa că recitim mereu imaginea paginii:
//   1. MinerU 4 (tier „standard”, cu modelul MinerU2.5-Pro de 1,2 miliarde de parametri, local și offline) citește tot
//      PDF-ul și păstrează structura: titluri, paragrafe, tabele, note. Antetele, subsolurile, numerele de pagină,
//      ștampilele și imaginile nu intră în text.
//   2. Tesseract în română (ocrmypdf) citește aceleași pagini și verifică fiecare pagină a lui MinerU. Când MinerU
//      intră în buclă („de la Partei de la Partei …”) sau pierde mai mult de 15% din textul citit de Tesseract,
//      pagina aceea vine de la Tesseract, iar jurnalul o spune.
// Fără MinerU (scripts/install-ocr.sh) citim doar cu Tesseract; fără ocrmypdf rămânem la stratul de text al PDF-ului.
// Pentru fiecare PDF scriem <nume>.md (Markdown, afișat pe pagina proiectului) și <nume>.txt (text simplu, pentru
// analizele modelelor și verificarea citatelor), iar _meta.json spune cum a fost citit fiecare.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const OCR_HOME = process.env.LASTRAJA_OCR_HOME || path.join(os.homedir(), '.local', 'share', 'lastraja-ocr');
const MINERU_BIN = process.env.MINERU_BIN || path.join(OCR_HOME, 'venv', 'bin', 'mineru-kit');
// Limbile Tesseract stau într-un folder al nostru: cele din Cellar-ul Homebrew dispar la `brew upgrade tesseract`.
const OWN_TESSDATA = path.join(OCR_HOME, 'tessdata');
const MINERU_ARGS = ['--tier', 'standard', '--ocr-mode', 'ocr'];
const MINERU_ENV = { ...process.env, MINERU_MODEL_SOURCE: 'local', HF_HUB_OFFLINE: '1' };
// Cât așteptăm MinerU: ~7 s pe pagină pe un Mac liber, de câteva ori mai mult când mașina e ocupată.
const mineruTimeout = (pages) => 10 * 60_000 + 60_000 * Math.max(1, pages);
// Câte pagini dăm odată lui MinerU (o rulare ține 4–9 GB de RAM, în funcție de numărul de pagini).
const BATCH_PAGES = 80;

// Verificarea pe pagină. O buclă e aceeași secvență repetată de cel puțin 7 ori la rând.
const LOOP = /((?=\S*\p{L})\S.{2,60}?)(?:\s+\1){6,}/u;
const MIN_COVERAGE = 0.85;

// ─── nume și text ────────────────────────────────────────────────────────────────────────────────────────────────

/** Fișierul .txt al unui PDF: tipurile unice își păstrează numele, avizele primesc emitentul (aviz_ES, aviz_LG). */
export function textName(pdfFile) {
  const base = path.basename(pdfFile).replace(/\.pdf$/i, '');
  const [type, ...rest] = base.split('_');
  if (/^(forma|expunere|adresa)$/.test(type)) return base.replace(/_[^_]+$/, '');
  const code = rest.join('_').replace(/^\d{2}b\d+/i, '') || rest.join('_');
  return `${type}_${code}`;
}

/** Diacriticele cu sedilă devin cu virgulă (ş → ș, ţ → ț). */
const commaBelow = (s) => s.replace(/ş/g, 'ș').replace(/Ş/g, 'Ș').replace(/ţ/g, 'ț').replace(/Ţ/g, 'Ț');

/** Diacriticele cu sedilă devin cu virgulă, iar spațiile multiple din scanări dispar. */
export function normalizeRo(text) {
  return commaBelow(text.normalize('NFC'))
    .replace(/\r\n?/g, '\n')
    .replace(/\f/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Textul unui fragment: NFC, ș/ț cu virgulă, ghilimelele românești închise corect („…“ → „…”). */
const clean = (s) => commaBelow(s.normalize('NFC')).replace(/\u00a0/g, ' ');
const closeQuotes = (s) => s.replace(/„([^„“”\n]*)“/g, '„$1”');

/** Forma de comparat: fără diacritice, litere mici, doar litere și cifre. */
function plain(s) {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// ─── Markdown ────────────────────────────────────────────────────────────────────────────────────────────────────

/** Caracterele care ar schimba sensul în Markdown sunt scăpate; textul afișat rămâne cel din document. */
const escInline = (s) => s.replace(/[\\`*_~<[\]]/g, '\\$&').replace(/&(?=#?[a-z0-9]+;)/gi, '\\&');
/** „1. Text” sau „- text” la început de paragraf ar deveni listă, „# ” titlu, „> ” citat: păstrăm textul așa cum e. */
const escStart = (md) => md.replace(/^(\d{1,9})([.)])(?=\s|$)/, '$1\\$2').replace(/^([#>+=-])/, '\\$1');
const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', ' ': ' ', '*': '*' };
const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };
const toSup = (s) => ([...s].every((c) => c in SUP) ? [...s].map((c) => SUP[c]).join('') : s);

/** MinerU scrie trimiterile la note ca LaTeX („^{132}”); le facem cifre superioare, restul rămâne text. */
function latexToText(tex) {
  return tex
    .replace(/\\[ ,;:!]/g, ' ')
    .replace(/\^\{([^{}]*)\}|\^(\d)/g, (_, a, b) => toSup((a ?? b).trim()))
    .replace(/_\{(\d+)\}|_(\d)/g, (_, a, b) => [...(a ?? b)].map((c) => SUB[c]).join(''))
    .replace(/\\(?:mathrm|text|textbf|mathbf|operatorname)\s*/g, '')
    .replace(/\\([%&$#_{}])/g, '$1')
    .replace(/[{}]/g, '');
}

/** Fragmentele unui bloc MinerU → text simplu și Markdown (aldin, cursiv, indici). */
function inline(spans) {
  let text = '';
  let md = '';
  for (const s of spans ?? []) {
    if (!s || typeof s !== 'object') continue;
    if (s.type === 'hyperlink') {
      const r = inline(s.content);
      text += r.text;
      md += r.md;
      continue;
    }
    let t = clean(String(s.content ?? ''));
    if (s.type === 'equation_inline') t = latexToText(t);
    if (!t) continue;
    const styles = s.styles ?? [];
    if (styles.includes('superscript')) t = toSup(t.trim());
    text += t;
    let m = escInline(t);
    const mark = styles.includes('bold') ? '**' : styles.includes('italic') || styles.includes('emphasis') ? '*' : '';
    if (mark && m.trim()) {
      const [, lead, core, trail] = m.match(/^(\s*)([\s\S]*?)(\s*)$/);
      m = `${lead}${mark}${core}${mark}${trail}`;
    }
    md += m;
  }
  return { text, md };
}

const oneLine = (s) => s.replace(/\s+/g, ' ').trim();

/** O notă de subsol începe cu numărul ei („132 Curtea…”, „¹³² Curtea…”). */
const NOTE_START = /^\s*(?:\d{1,3}|[⁰¹²³⁴⁵⁶⁷⁸⁹]{1,4})\s+\S/u;

/** Un bloc de text MinerU, pe rânduri (MinerU pune rareori \n, mai ales între notele de subsol). */
function textLines(spans) {
  const { text, md } = inline(spans);
  const t = text.split('\n');
  const m = md.split('\n');
  if (t.length !== m.length) return [{ text: oneLine(text), md: oneLine(md) }];
  return t.map((line, i) => ({ text: line, md: m[i] })).filter((l) => l.text.trim());
}

/**
 * Rândurile rupte de lățimea paginii se lipesc la loc. În note (`notes`), un rând care începe cu un număr e o notă nouă.
 */
function joinLines(lines, { notes = false } = {}) {
  const out = [];
  for (const l of lines) {
    const prev = out.at(-1);
    if (prev && !(notes && NOTE_START.test(l.text))) {
      const glue = /\p{L}-$/u.test(prev.text.trimEnd()) ? '' : ' ';
      prev.text = prev.text.trimEnd() + glue + l.text.trimStart();
      prev.md = prev.md.trimEnd() + glue + l.md.trimStart();
    } else out.push({ ...l });
  }
  return out.map((l) => ({ text: closeQuotes(oneLine(l.text)), md: closeQuotes(oneLine(l.md)) })).filter((l) => l.text);
}

// ─── tabele ──────────────────────────────────────────────────────────────────────────────────────────────────────

const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…' };
const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITY[e.toLowerCase()] ?? m,
  );

/** Tabelul HTML dat de MinerU → rânduri de celule cu text simplu. Imaginile (base64) și orice alt marcaj dispar. */
export function parseHtmlTable(html) {
  const rows = [];
  let row = null;
  let cell = null;
  let inHead = false;
  const span = (attrs, name) => Math.max(1, Math.min(50, parseInt(attrs.match(new RegExp(`${name}\\s*=\\s*["']?(\\d+)`, 'i'))?.[1] ?? '1', 10) || 1));
  for (const m of String(html).matchAll(/<!--[\s\S]*?-->|<(\/?)([a-z][a-z0-9]*)\b([^>]*)>|([^<]+)|</gi)) {
    if (m[0].startsWith('<!--')) continue;
    if (m[4] !== undefined || m[0] === '<') {
      if (cell) cell.text += m[4] ?? '<';
      continue;
    }
    const [, close, rawTag, attrs] = m;
    const tag = rawTag.toLowerCase();
    if (tag === 'thead') inHead = !close;
    else if (tag === 'tr') {
      cell = null;
      row = close ? null : { head: inHead, cells: [] };
      if (row) rows.push(row);
    } else if (tag === 'td' || tag === 'th') {
      if (close) cell = null;
      else {
        if (!row) rows.push((row = { head: inHead, cells: [] }));
        cell = { text: '', head: tag === 'th' || inHead, colspan: span(attrs, 'colspan'), rowspan: span(attrs, 'rowspan') };
        row.cells.push(cell);
      }
    } else if (/^(br|p|div|li)$/.test(tag) && cell) cell.text += ' ';
  }
  for (const r of rows) for (const c of r.cells) c.text = closeQuotes(oneLine(clean(latexToText(decode(c.text.replace(/<\/?eq>/gi, ''))))));
  return rows.filter((r) => r.cells.length && r.cells.some((c) => c.text));
}

const isSimple = (rows) => rows.length > 1 && rows.every((r) => r.cells.every((c) => c.colspan === 1 && c.rowspan === 1));

/** Tabel simplu → GFM; cu celule unite → HTML curat, doar table/thead/tbody/tr/th/td cu colspan/rowspan. */
function tableToMd(rows) {
  if (isSimple(rows)) {
    const width = Math.max(...rows.map((r) => r.cells.length));
    const cells = (r) => [...r.cells.map((c) => escInline(c.text).replace(/\|/g, '\\|')), ...Array(width - r.cells.length).fill('')];
    const line = (cs) => `| ${cs.join(' | ')} |`;
    return [line(cells(rows[0])), line(Array(width).fill('---')), ...rows.slice(1).map((r) => line(cells(r)))].join('\n');
  }
  const head = [];
  let i = 0;
  while (i < rows.length - 1 && rows[i].head) head.push(rows[i++]);
  const tr = (r) =>
    '<tr>' +
    r.cells
      .map((c) => {
        const tag = c.head ? 'th' : 'td';
        const attrs = (c.colspan > 1 ? ` colspan="${c.colspan}"` : '') + (c.rowspan > 1 ? ` rowspan="${c.rowspan}"` : '');
        return `<${tag}${attrs}>${escHtml(c.text)}</${tag}>`;
      })
      .join('') +
    '</tr>';
  return ['<table>', ...(head.length ? ['<thead>', ...head.map(tr), '</thead>'] : []), '<tbody>', ...rows.slice(i).map(tr), '</tbody>', '</table>'].join('\n');
}

const tableToText = (rows) => rows.map((r) => r.cells.map((c) => c.text).filter(Boolean).join(' | ')).filter(Boolean).join('\n');

// ─── paginile MinerU ─────────────────────────────────────────────────────────────────────────────────────────────

// Blocurile documentului: { kind: 'h', level, text, md } | { kind: 'p', text, md, note?, lead? } | { kind: 'table', rows }.
const AUX = new Set(['header', 'footer', 'page_number', 'aside_text']);

/**
 * O pagină MinerU → blocurile ei, plus `ref` (tot textul citit pe pagină, inclusiv antete și subsoluri, pentru
 * comparația cu Tesseract) și `prose` (textul paragrafelor, pentru căutarea buclelor).
 */
export function pageBlocks(page) {
  const blocks = [];
  const ref = [];
  const para = (spans, { note = false, cont = false } = {}) => {
    const lines = textLines(spans);
    ref.push(lines.map((l) => l.text).join(' '));
    // Într-o notă, primul rând urmat de alte rânduri poate fi un rest dublat al blocului de dinainte (vezi dropEcho).
    const lead = note && lines.length > 1 ? { text: closeQuotes(oneLine(lines[0].text)), md: closeQuotes(oneLine(lines[0].md)) } : null;
    joinLines(lines, { notes: note }).forEach((l, i) => blocks.push({ kind: 'p', ...l, note, cont: cont && i === 0, lead: i === 0 ? lead : null }));
  };
  const visit = (b, cont = false) => {
    if (!b || typeof b !== 'object') return;
    const kids = Array.isArray(b.content) ? b.content : [];
    switch (b.type) {
      case 'doc_title':
      case 'paragraph_title': {
        const r = inline(b.content);
        const text = closeQuotes(oneLine(r.text));
        ref.push(text);
        if (text) blocks.push({ kind: 'h', level: b.type === 'doc_title' ? 1 : Math.min(6, Math.max(2, b.level ?? 2)), text, md: closeQuotes(oneLine(r.md)) });
        return;
      }
      case 'text':
      case 'ref_text':
        return para(b.content, { cont: cont || !!b.continues_prev, note: b.type === 'ref_text' });
      case 'page_footnote':
        return para(b.content, { note: true });
      case 'list':
        return kids.forEach((k, i) => visit(k, i === 0 && !!b.continues_prev));
      case 'index':
        return kids.forEach((k) => visit(k));
      case 'table':
        for (const k of kids) {
          if (k.type === 'table_body') {
            const rows = parseHtmlTable(k.content ?? '');
            ref.push(tableToText(rows));
            if (rows.length === 1 && rows[0].cells.length === 1) blocks.push({ kind: 'p', text: rows[0].cells[0].text, md: escInline(rows[0].cells[0].text) });
            else if (rows.length) blocks.push({ kind: 'table', rows, cont: !!b.continues_prev });
          } else para(k.content);
        }
        return;
      case 'image':
      case 'chart':
      case 'code':
        // Imaginea, graficul, ștampila nu intră în text; legenda și sursa lor, da.
        for (const k of kids) {
          if (/_(caption|footnote)$/.test(k.type)) para(k.content);
          else if (k.type === 'code_body' || k.type === 'algorithm_body') para(typeof k.content === 'string' ? [{ type: 'text', content: k.content }] : k.content);
          else if (typeof k.content === 'string' && k.content.trim()) ref.push(k.content);
        }
        return;
      case 'equation':
        if (typeof b.content === 'string' && b.content.trim()) para([{ type: 'text', content: latexToText(b.content) }]);
        return;
      default:
        if (AUX.has(b.type)) {
          ref.push(inline(b.content).text);
          return;
        }
        if (kids.length && kids.every((k) => typeof k?.content === 'string' && !k.bbox)) para(kids);
    }
  };
  for (const b of page?.blocks ?? []) visit(b);
  const prose = blocks.filter((b) => b.kind !== 'table').map((b) => b.text).join('\n');
  return { blocks, ref: ref.join('\n'), prose, figures: figureShare(page) };
}

/** Paragrafele unei pagini citite de Tesseract (rândurile tipărite se lipesc; numerele de pagină dispar). */
export function tesseractBlocks(pageText) {
  const PAGE_NO = /^(?:[-–—\s]*\d{1,3}[-–—\s]*|pag(?:ina|\.)?\s*\d+(?:\s*(?:din|\/)\s*\d+)?)$/i;
  return normalizeRo(pageText)
    .split(/\n{2,}/)
    .flatMap((p) => joinLines(p.split('\n').map((t) => ({ text: t, md: escInline(t) })).filter((l) => l.text.trim())))
    .filter((l) => !PAGE_NO.test(l.text))
    .map((l) => ({ kind: 'p', text: l.text, md: l.md }));
}

// ─── diacriticele ────────────────────────────────────────────────────────────────────────────────────────────────

const RO_MARKED = { ă: 'a', â: 'a', î: 'i', ș: 's', ț: 't' };
const bare = (s) => s.normalize('NFKD').replace(/\p{M}/gu, '').normalize('NFC');
/** O literă cu un semn diacritic care nu e românesc (ç, ã, é, ñ…). */
const foreignMark = (w) => [...w.toLowerCase()].some((c) => !(c in RO_MARKED) && bare(c) !== c);
// Doar ș, ț și ă: pe acestea le scapă MinerU, iar î și â le citește mai bine decât Tesseract („introduce”, nu „întroduce”).
const REPAIRABLE = new Set(['ș', 'ț', 'ă']);
/** `to` se obține din `from` doar adăugând ș, ț sau ă, fără să scoată sau să schimbe alte litere. */
function onlyAdds(from, to) {
  const a = [...from.toLowerCase()];
  const b = [...to.toLowerCase()];
  if (a.length !== b.length) return false;
  let added = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (!REPAIRABLE.has(b[i]) || bare(a[i]) !== RO_MARKED[b[i]]) return false;
    if (a[i] in RO_MARKED) return false;
    added++;
  }
  return added > 0;
}
const sameCase = (model, w) => (model === model.toUpperCase() && model.length > 1 ? w.toUpperCase() : model[0] === model[0].toUpperCase() ? w[0].toUpperCase() + w.slice(1) : w);

/**
 * MinerU scapă uneori diacriticele („sanctiune”, „obiectiile”) sau pune unele străine („infraçțiune”), pe când
 * Tesseract în română nu le scapă aproape niciodată. Un cuvânt MinerU de cel puțin 5 litere ia forma citită de
 * Tesseract pe aceeași pagină când cele două diferă doar prin diacritice, Tesseract are în plus doar ș/ț/ă și nu
 * a citit nicăieri pe pagină cuvântul la fel ca MinerU. Pe paginile de test ale comparației OCR, WER-ul lui MinerU
 * a scăzut astfel de la 0,82% la 0,50%, iar diacriticele corecte au urcat de la 98,9% la 99,8%.
 * Întoarce o funcție care corectează un text (se aplică la fel pe text și pe Markdown).
 */
export function diacriticFixer(tessText) {
  const forms = new Map();
  for (const w of normalizeRo(tessText ?? '').match(/\p{L}+/gu) ?? []) {
    if (w.length < 5) continue;
    const key = bare(w).toLowerCase();
    const m = forms.get(key) ?? new Map();
    m.set(w.toLowerCase(), (m.get(w.toLowerCase()) ?? 0) + 1);
    forms.set(key, m);
  }
  const fix = (w) => {
    if (w.length < 5) return w;
    const m = forms.get(bare(w).toLowerCase());
    if (!m || m.has(w.toLowerCase())) return w;
    const [best] = [...m.entries()].sort((x, y) => y[1] - x[1])[0];
    if (foreignMark(best)) return w;
    if (onlyAdds(w, best) || (foreignMark(w) && bare(w).toLowerCase() === bare(best))) return sameCase(w, best);
    return w;
  };
  return (s) => s.replace(/\p{L}+/gu, fix);
}

// ─── verificarea cu Tesseract ────────────────────────────────────────────────────────────────────────────────────

/** Distanța de editare minimă dintre `needle` și orice bucată din `hay` (aliniere semi-globală). */
function fuzzyDistance(needle, hay) {
  const m = needle.length;
  let prev = new Int32Array(m + 1);
  let cur = new Int32Array(m + 1);
  for (let i = 0; i <= m; i++) prev[i] = i;
  let best = m;
  for (let j = 1; j <= hay.length; j++) {
    cur[0] = 0;
    const h = hay.charCodeAt(j - 1);
    for (let i = 1; i <= m; i++) {
      const sub = prev[i - 1] + (needle.charCodeAt(i - 1) === h ? 0 : 1);
      const del = prev[i] + 1;
      const ins = cur[i - 1] + 1;
      cur[i] = sub < del ? (sub < ins ? sub : ins) : del < ins ? del : ins;
    }
    if (cur[m] < best) best = cur[m];
    [prev, cur] = [cur, prev];
  }
  return best;
}

/** Un cuvânt „adevărat” al lui Tesseract: litere obișnuite, nu gunoiul din ștampile, steme și grafice („QRib”, „Apl6l”). */
const REAL_WORD = /^(?:\p{Ll}{3,}|\p{Lu}\p{Ll}{2,}|\p{Lu}{3,})$/u;
const strip = (w) => w.replace(/^[„"“”'(«[]+|[”"“',.;:!?)»\]]+$/g, '');
const deletions = (w) => Array.from(w, (_, i) => w.slice(0, i) + w.slice(i + 1));

/**
 * Cât din textul citit de Tesseract pe o pagină se regăsește la MinerU, ca număr de cuvinte și fără să conteze
 * ordinea (Tesseract amestecă rândurile când pagina are două coloane sau legende alăturate). Un cuvânt cu o
 * singură literă diferită contează ca regăsit: e de obicei o greșeală de recunoaștere a unuia dintre ei.
 * `vocab` (cuvintele citite de MinerU în tot documentul) lasă deoparte ce Tesseract „citește” din semnături și
 * scris de mână („Mocteavr”, „olliruitar”): un paragraf sărit are cuvinte care apar și în restul documentului.
 */
export function wordCoverage(tessText, mineruText, vocab = null) {
  const realWords = (line) =>
    line
      .split(/[\s\-–—/]+/)
      .map(strip)
      .filter((w) => REAL_WORD.test(w))
      .map(plain)
      .filter((w) => w.length >= 3 && (!vocab || vocab.has(w)));
  const tessLines = normalizeRo(tessText).split('\n');
  const words = tessLines.flatMap(realWords);
  if (words.length < 15) return null;
  const bag = new Map();
  for (const w of plain(mineruText).split(' ')) if (w) bag.set(w, (bag.get(w) ?? 0) + 1);
  const near = new Map();
  for (const w of bag.keys()) if (w.length >= 4) for (const d of deletions(w)) near.set(d, [...(near.get(d) ?? []), w]);
  const fuzzy = (w) =>
    w.length >= 5 && ((near.get(w) ?? []).some((x) => x !== w) || deletions(w).some((d) => (d !== w && bag.has(d)) || (near.get(d) ?? []).some((x) => x !== w)));
  // Rândurile de text continuu (cel puțin 6 cuvinte, dintre care 4 adevărate) din care MinerU nu are aproape nicio
  // pereche de cuvinte alăturate: un paragraf sărit. Perechile sunt mult mai rare decât cuvintele luate separat.
  const own = plain(mineruText).split(' ');
  const pairs = new Set(own.slice(1).map((w, i) => `${own[i]} ${w}`));
  const lostLines = tessLines.filter((line) => {
    const ws = plain(line).split(' ').filter(Boolean);
    if (ws.length < 6 || realWords(line).length < 4) return false;
    const found = ws.slice(1).filter((w, i) => pairs.has(`${ws[i]} ${w}`)).length;
    return found < 0.4 * (ws.length - 1);
  }).length;
  const missing = [];
  for (const w of words) {
    const c = bag.get(w);
    if (c) bag.set(w, c - 1);
    else if (!fuzzy(w)) missing.push(w);
  }
  return { coverage: 1 - missing.length / words.length, words: words.length, missing, lostLines };
}

/** Cât din conținutul paginii e grafic sau imagine pentru MinerU: textul de acolo (titluri, etichete, axe) nu îl transcrie. */
function figureShare(page) {
  let figures = 0;
  let all = 0;
  for (const b of page?.blocks ?? []) {
    if (AUX.has(b.type) || !Array.isArray(b.bbox)) continue;
    const area = Math.max(0, b.bbox[2] - b.bbox[0]) * Math.max(0, b.bbox[3] - b.bbox[1]);
    all += area;
    if (b.type === 'chart' || b.type === 'image') figures += area;
  }
  return all ? Math.min(1, figures / all) : 0;
}

/**
 * Pagina MinerU e bună dacă nu buclează, nu e mult mai lungă decât ce a citit Tesseract, nu sare peste rânduri întregi
 * de text și conține cel puțin 85% din cuvintele citite de Tesseract (proporțional mai puțin pe paginile cu grafice,
 * al căror text MinerU nu îl transcrie).
 */
export function checkPage(mine, tessText, vocab = null) {
  const loop = mine.prose.match(LOOP);
  if (loop) return { ok: false, reason: `buclă („${loop[1].slice(0, 40)}” ×${Math.round(loop[0].length / (loop[1].length + 1))})` };
  if (tessText == null) return { ok: true };
  const tess = plain(tessText);
  const own = plain(mine.blocks.map((b) => (b.kind === 'table' ? tableToText(b.rows) : b.text)).join(' '));
  if (own.length > 3 * tess.length + 4000) return { ok: false, reason: `text de ${Math.round(own.length / Math.max(1, tess.length))}× mai lung decât la Tesseract` };
  const cov = wordCoverage(tessText, mine.ref, vocab);
  if (!cov) return { ok: true };
  // Pe paginile cu grafice, titlurile și legendele lor (transcrise doar de Tesseract) arată și ele ca rânduri lipsă.
  if (cov.lostLines >= (mine.figures > 0.1 ? 6 : 3)) return { ok: false, reason: `a sărit ${cov.lostLines} rânduri de text`, coverage: cov.coverage };
  const need = MIN_COVERAGE * (1 - mine.figures);
  if (cov.coverage < need && cov.missing.length >= 8) {
    return { ok: false, reason: `are doar ${Math.round(cov.coverage * 100)}% din cuvintele citite de Tesseract (lipsesc: ${cov.missing.slice(0, 6).join(', ')}…)`, coverage: cov.coverage };
  }
  return { ok: true, coverage: cov.coverage };
}

// ─── documentul ──────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Pe paginile dese de note, MinerU repetă uneori la începutul unui bloc ultimul rând al blocului de dinainte,
 * de obicei stricat („Oficial nr. 517 din 8 iulie 2016, par. 06-09.”). Rândul acela cade dacă seamănă cu finalul
 * unuia dintre ultimele două blocuri.
 */
function dropEcho(block, recent) {
  const { lead } = block;
  if (!lead || lead.text.length > 120 || !block.text.startsWith(lead.text)) return block;
  const needle = plain(lead.text);
  if (needle.length < 4) return block;
  const tail = plain(recent.slice(-2).map((b) => b.text).join(' ')).slice(-(needle.length + 160));
  const tolerance = needle.length < 12 ? 0.4 : 0.35;
  if (!tail || fuzzyDistance(needle, tail) > tolerance * needle.length) return block;
  const text = block.text.slice(lead.text.length).trim();
  if (!text) return null;
  const md = block.md.startsWith(lead.md) ? block.md.slice(lead.md.length).trim() : escInline(text);
  return { ...block, text, md, lead: null, echo: lead.text };
}

class DocBuilder {
  blocks = [];
  /** Ultimul bloc din corpul paginii (nu notă), dacă pagina lui vine de la MinerU: aici se lipește continuarea. */
  tail = null;

  addMineru(blocks) {
    let tail = this.tail;
    let first = true;
    for (let b of blocks) {
      if (b.kind === 'p') {
        b = dropEcho(b, this.blocks);
        if (!b) continue;
      }
      // Paragraful rupt de sfârșitul paginii, pe care MinerU nu l-a marcat: pagina nouă începe cu literă mică,
      // iar cea veche nu s-a terminat cu punct („…cu o durată medie a” / „arestului preventiv…”).
      const runOn = first && b.kind === 'p' && !b.note && tail?.kind === 'p' && /^\p{Ll}{2,}/u.test(b.text) && !/[.:;!?”"»)]$/.test(tail.text);
      if (!b.note) first = false;
      if ((b.cont || runOn) && b.kind === 'p' && tail?.kind === 'p') {
        const glue = /\p{L}-$/u.test(tail.text) ? '' : ' ';
        tail.text += glue + b.text;
        tail.md += glue + b.md;
        continue;
      }
      if (b.cont && b.kind === 'table' && tail?.kind === 'table') {
        const same = (a, c) => a.cells.map((x) => x.text).join('|') === c.cells.map((x) => x.text).join('|');
        tail.rows.push(...(same(b.rows[0], tail.rows[0]) ? b.rows.slice(1) : b.rows));
        continue;
      }
      this.blocks.push(b);
      if (!b.note) tail = b;
    }
    this.tail = tail;
  }

  addTesseract(blocks) {
    this.blocks.push(...blocks);
    this.tail = null;
  }

  render() {
    const md = this.blocks
      .map((b) => (b.kind === 'h' ? `${'#'.repeat(b.level)} ${b.md.replace(/#+$/, '\\$&')}` : b.kind === 'table' ? tableToMd(b.rows) : escStart(b.md)))
      .join('\n\n');
    const text = this.blocks.map((b) => (b.kind === 'table' ? tableToText(b.rows) : b.text)).join('\n\n');
    return { markdown: md.trim() + '\n', text: text.trim() + '\n' };
  }
}

/** Aplică aceeași corectură de diacritice pe text, Markdown și celulele tabelelor. */
function fixBlocks(blocks, fix) {
  return blocks.map((b) =>
    b.kind === 'table'
      ? { ...b, rows: b.rows.map((r) => ({ ...r, cells: r.cells.map((c) => ({ ...c, text: fix(c.text) })) })) }
      : { ...b, text: fix(b.text), md: fix(b.md), lead: b.lead && { text: fix(b.lead.text), md: fix(b.lead.md) } },
  );
}

/** MinerU + Tesseract pagină cu pagină. `tess` poate lipsi (Tesseract indisponibil): atunci rămâne doar căutarea buclelor. */
export function assemble(mineruPages, tess, label = '') {
  const doc = new DocBuilder();
  const fallbacks = [];
  const n = mineruPages.length;
  const byPage = tess && tess.length === n ? tess : null;
  if (tess && !byPage) console.warn(`⚠️ ${label}: MinerU are ${n} pagini, Tesseract ${tess.length}; verificăm doar buclele`);
  const pages = mineruPages.map(pageBlocks);
  const vocab = new Set(plain(pages.map((p) => p.ref).join(' ')).split(' '));
  for (let i = 0; i < n; i++) {
    const page = pages[i];
    const verdict = checkPage(page, byPage ? byPage[i] : null, vocab);
    if (verdict.ok) doc.addMineru(byPage ? fixBlocks(page.blocks, diacriticFixer(byPage[i])) : page.blocks);
    else if (byPage) {
      fallbacks.push({ page: i + 1, reason: verdict.reason });
      console.warn(`⚠️ ${label} p. ${i + 1}: MinerU ${verdict.reason}; pagina vine de la Tesseract`);
      doc.addTesseract(tesseractBlocks(byPage[i]));
    } else {
      // Fără Tesseract nu avem cu ce înlocui pagina: păstrăm o singură dată secvența repetată.
      console.warn(`⚠️ ${label} p. ${i + 1}: MinerU ${verdict.reason}; fără Tesseract, scurtăm repetiția`);
      const unloop = (s) => s.replace(new RegExp(LOOP.source, 'gu'), '$1 […]');
      doc.addMineru(page.blocks.map((b) => (b.kind === 'p' ? { ...b, text: unloop(b.text), md: unloop(b.md) } : b)));
      fallbacks.push({ page: i + 1, reason: verdict.reason, kept: true });
    }
  }
  const replaced = fallbacks.filter((f) => !f.kept).length;
  const method = replaced === 0 ? 'mineru' : replaced === n ? 'ocr' : 'mineru+ocr';
  return { ...doc.render(), method, pages: n, fallbacks };
}

function fromTesseract(tess) {
  const doc = new DocBuilder();
  for (const page of tess) doc.addTesseract(tesseractBlocks(page));
  return { ...doc.render(), method: 'ocr', pages: tess.length, fallbacks: [] };
}

// ─── uneltele ────────────────────────────────────────────────────────────────────────────────────────────────────

const children = new Set();
const workDirs = new Set();
function killChildren() {
  for (const c of children) {
    try {
      process.kill(-c.pid, 'SIGKILL');
    } catch {
      // deja oprit
    }
  }
  for (const d of workDirs) fs.rmSync(d, { recursive: true, force: true });
}
/** Un folder de lucru în cache, șters la final sau dacă procesul e oprit. */
function workDir(cacheDir, prefix) {
  const d = fs.mkdtempSync(path.join(cacheDir, prefix));
  workDirs.add(d);
  return d;
}
function dropWorkDir(d) {
  fs.rmSync(d, { recursive: true, force: true });
  workDirs.delete(d);
}
let exitHooked = false;
function hookExit() {
  if (exitHooked) return;
  exitHooked = true;
  process.once('exit', killChildren);
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.once(sig, () => {
      killChildren();
      process.exit(sig === 'SIGINT' ? 130 : 143);
    });
  }
}

/** Rulează o unealtă externă cu limită de timp; o oprește cu tot cu procesele ei la timeout sau la ieșirea noastră. */
function runTool(cmd, args, { env = process.env, timeoutMs = 60_000 } = {}) {
  hookExit();
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    children.add(child);
    let out = '';
    let err = '';
    let timedOut = false;
    child.stdout.on('data', (c) => (out = (out + c).slice(-256 * 1024)));
    child.stderr.on('data', (c) => (err = (err + c).slice(-32 * 1024)));
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        // deja oprit
      }
    }, timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      children.delete(child);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      children.delete(child);
      if (code === 0 && !timedOut) return resolve({ stdout: out, stderr: err });
      const last = err.split('\n').map((l) => l.trim()).filter((l) => l && !/it\/s\]|s\/it\]/.test(l)).at(-1) ?? '';
      reject(Object.assign(new Error(timedOut ? `${path.basename(cmd)}: oprit după ${Math.round(timeoutMs / 60_000)} min` : `${path.basename(cmd)} cod ${code}: ${last.slice(0, 300)}`), { stderr: err }));
    });
  });
}

const loud = (msg) => console.error(`\n🛑 EROARE OCR: ${msg}\n`);
const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');

let toolsPromise = null;
/** Ce unelte OCR avem pe mașina asta (verificat o singură dată pe proces). */
export function ocrTools() {
  return (toolsPromise ??= detectTools());
}

async function detectTools() {
  const tools = { tesseract: null, mineru: null };
  const env = { ...process.env };
  if (fs.existsSync(path.join(OWN_TESSDATA, 'ron.traineddata'))) env.TESSDATA_PREFIX = OWN_TESSDATA;
  else console.warn(`⚠️ Nu există ${path.join(OWN_TESSDATA, 'ron.traineddata')}: Tesseract folosește limbile sistemului, pe care un \`brew upgrade\` le poate șterge. Rulează sh scripts/install-ocr.sh.`);
  try {
    const langs = await runTool('tesseract', ['--list-langs'], { env, timeoutMs: 30_000 });
    if (!(langs.stdout + langs.stderr).split(/\s+/).includes('ron')) {
      loud(`Tesseract nu are limba română (TESSDATA_PREFIX=${env.TESSDATA_PREFIX ?? 'implicit'}). Rulează sh scripts/install-ocr.sh.`);
    } else {
      await runTool('ocrmypdf', ['--version'], { timeoutMs: 60_000 });
      const v = (await runTool('tesseract', ['--version'], { env, timeoutMs: 30_000 })).stdout.split('\n')[0].trim();
      const ron = path.join(env.TESSDATA_PREFIX ?? '', 'ron.traineddata');
      const ronId = fs.existsSync(ron) ? sha1(fs.readFileSync(ron)).slice(0, 8) : 'sistem';
      tools.tesseract = { env, id: `${v.replace(/\s+/g, '-')}-ron-${ronId}` };
    }
  } catch (err) {
    console.warn(`⚠️ Fără Tesseract/ocrmypdf (${err.code === 'ENOENT' ? 'neinstalat' : err.message}): textele scanate nu pot fi verificate pagină cu pagină.`);
  }
  if (fs.existsSync(MINERU_BIN)) {
    try {
      const v = (await runTool(MINERU_BIN, ['--version'], { env: MINERU_ENV, timeoutMs: 60_000 })).stdout.match(/MinerU version:\s*(\S+)/)?.[1];
      tools.mineru = { id: `mineru-${v ?? 'x'}-${MINERU_ARGS.filter((a) => !a.startsWith('--')).join('-')}`, failures: 0 };
    } catch (err) {
      loud(`MinerU e instalat, dar nu pornește (${err.message}). Citim doar cu Tesseract. Rulează sh scripts/install-ocr.sh.`);
    }
  } else {
    console.warn(`ℹ️ MinerU nu e instalat (${MINERU_BIN}); citim scanările doar cu Tesseract. Pentru structură și tabele: sh scripts/install-ocr.sh`);
  }
  return tools;
}

// ─── cache ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Rezultatele OCR se păstrează după conținutul PDF-ului și versiunea uneltei, așa că refacerea textelor (de exemplu
// după o schimbare în felul în care scriem Markdown-ul) nu mai recitește paginile.

const cacheFile = (cacheDir, kind, key) => path.join(cacheDir, kind, `${key}.json.gz`);
function readCache(file) {
  try {
    return JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));
  } catch {
    return null;
  }
}
function writeCache(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, zlib.gzipSync(JSON.stringify(data)));
  fs.renameSync(tmp, file);
}

/** Imaginile (ștampile, grafice) vin ca base64; nu ne trebuie și ar umfla cache-ul. */
function dropImages(node) {
  if (Array.isArray(node)) return node.map(dropImages);
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) if (k !== 'image_base64') out[k] = dropImages(v);
  return out;
}

// ─── Tesseract ───────────────────────────────────────────────────────────────────────────────────────────────────

async function tesseractPages(pdfPath, hash, { cacheDir, fresh, tool }) {
  const file = cacheFile(cacheDir, 'tesseract', `${hash}-${tool.id}`);
  const cached = !fresh && readCache(file);
  if (cached) return cached;
  const work = workDir(cacheDir, 'tess-');
  try {
    const sidecar = path.join(work, 'text.txt');
    try {
      await runTool('ocrmypdf', ['-q', '--force-ocr', '-l', 'ron', '--output-type', 'none', '--sidecar', sidecar, pdfPath, '-'], { env: tool.env, timeoutMs: 20 * 60_000 });
    } catch (err) {
      if (/language|traineddata|tessdata/i.test(err.stderr ?? err.message)) loud(`ocrmypdf -l ron a eșuat (limba română lipsește?): ${err.message}. Rulează sh scripts/install-ocr.sh.`);
      throw err;
    }
    const pages = fs.readFileSync(sidecar, 'utf8').split('\f');
    if (pages.length > 1 && !pages.at(-1).trim()) pages.pop();
    writeCache(file, pages);
    return pages;
  } finally {
    dropWorkDir(work);
  }
}

// ─── MinerU ──────────────────────────────────────────────────────────────────────────────────────────────────────

// Un singur MinerU odată în proces: o rulare ține 4–9 GB de RAM.
let mineruQueue = Promise.resolve();
function withMineruLock(fn) {
  const next = mineruQueue.then(fn, fn);
  mineruQueue = next.catch(() => {});
  return next;
}

/**
 * Rulează MinerU o dată pe mai multe PDF-uri (modelele se încarcă o singură dată) și pune paginile fiecăruia în cache.
 * `docs`: [{ pdfPath, hash, pages }]. Întoarce numărul de documente citite.
 */
async function runMineru(docs, { cacheDir, tool, label }) {
  if (!docs.length) return 0;
  return withMineruLock(async () => {
    const work = workDir(cacheDir, 'mineru-');
    const started = Date.now();
    try {
      const inputs = docs.map((d, i) => {
        const p = path.join(work, `in-${i}.pdf`);
        fs.copyFileSync(d.pdfPath, p);
        return p;
      });
      const out = path.join(work, 'out');
      const pages = docs.reduce((s, d) => s + (d.pages || 30), 0);
      let error = null;
      try {
        await runTool(MINERU_BIN, ['parse', ...inputs, '-o', out, ...MINERU_ARGS, '-f', 'middle_json'], { env: MINERU_ENV, timeoutMs: mineruTimeout(pages) });
      } catch (err) {
        error = err;
      }
      let read = 0;
      docs.forEach((d, i) => {
        const json = path.join(out, `in-${i}.json`);
        if (!fs.existsSync(json)) return;
        try {
          const mid = JSON.parse(fs.readFileSync(json, 'utf8'));
          const list = [...(mid.pages ?? mid.pdf_info ?? [])].sort((a, b) => (a.page_idx ?? 0) - (b.page_idx ?? 0));
          writeCache(cacheFile(cacheDir, 'mineru', `${d.hash}-${tool.id}`), { producer: mid.metadata?.producer ?? null, pages: dropImages(list) });
          read++;
        } catch (err) {
          console.warn(`⚠️ ${label}: ieșirea MinerU pentru ${path.basename(d.pdfPath)} nu se poate citi (${err.message})`);
        }
      });
      if (error) {
        tool.failures++;
        console.warn(`⚠️ ${label}: MinerU a eșuat (${error.message}); ${read}/${docs.length} documente citite`);
      } else tool.failures = 0;
      console.log(`  MinerU ${label}: ${docs.length} PDF, ${pages} pagini, ${Math.round((Date.now() - started) / 1000)} s`);
      return read;
    } finally {
      dropWorkDir(work);
    }
  });
}

const mineruCached = (cacheDir, hash, tool) => readCache(cacheFile(cacheDir, 'mineru', `${hash}-${tool.id}`));

// ─── extragerea ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Numărul de pagini, fără să extragem textul (pentru limita de timp a lui MinerU). */
async function pageCount(buf, pdfParse) {
  if (!pdfParse) return 0;
  try {
    return (await pdfParse(buf, { pagerender: () => '' }))?.numpages ?? 0;
  } catch {
    return 0;
  }
}

async function layerText(buf, pdfParse) {
  if (!pdfParse) return { text: '', pages: 0 };
  try {
    const r = await pdfParse(buf);
    return { text: normalizeRo(r?.text ?? ''), pages: r?.numpages ?? 0 };
  } catch {
    // PDF fără strat de text sau stricat.
    return { text: '', pages: 0 };
  }
}

/**
 * Textul unui PDF și cum l-am obținut: { text, markdown, method, pages, fallbacks }.
 * method: 'mineru' | 'mineru+ocr' (unele pagini de la Tesseract) | 'ocr' (doar Tesseract) | 'text' (stratul PDF-ului).
 * `pdfParse` e pdf-parse încărcat de apelant (poate lipsi); `fresh` ignoră cache-ul OCR.
 */
export async function extractPdfText(pdfPath, { pdfParse, cacheDir, fresh = false, label = path.basename(pdfPath) }) {
  const buf = fs.readFileSync(pdfPath);
  const hash = sha1(buf);
  const layer = await layerText(buf, pdfParse);
  const tools = await ocrTools();
  fs.mkdirSync(cacheDir, { recursive: true });

  const tessP = tools.tesseract
    ? tesseractPages(pdfPath, hash, { cacheDir, fresh, tool: tools.tesseract }).catch((err) => {
        console.warn(`⚠️ ${label}: Tesseract a eșuat (${err.message})`);
        return null;
      })
    : Promise.resolve(null);

  let mine = null;
  if (tools.mineru) {
    mine = !fresh && mineruCached(cacheDir, hash, tools.mineru);
    if (!mine && tools.mineru.failures < 3) {
      await runMineru([{ pdfPath, hash, pages: layer.pages }], { cacheDir, tool: tools.mineru, label });
      mine = mineruCached(cacheDir, hash, tools.mineru);
    }
    if (tools.mineru.failures >= 3 && !tools.mineru.disabled) {
      tools.mineru.disabled = true;
      loud('MinerU a eșuat de 3 ori la rând; restul documentelor se citesc doar cu Tesseract.');
    }
  }
  const tess = await tessP;

  if (mine?.pages?.length) return assemble(mine.pages, tess, label);
  if (tess?.some((p) => p.trim())) return fromTesseract(tess);
  if (tools.tesseract || tools.mineru) console.warn(`⚠️ ${label}: OCR indisponibil, rămâne stratul de text al PDF-ului`);
  return { text: layer.text, markdown: null, method: 'text', pages: layer.pages, fallbacks: [] };
}

/** Citește dinainte cu MinerU, într-o singură rulare, PDF-urile care nu sunt încă în cache. */
async function warmMineru(pdfPaths, { pdfParse, cacheDir, fresh, label }) {
  const tools = await ocrTools();
  if (!tools.mineru || tools.mineru.failures >= 3 || !pdfPaths.length) return;
  fs.mkdirSync(cacheDir, { recursive: true });
  const docs = [];
  for (const pdfPath of pdfPaths) {
    const buf = fs.readFileSync(pdfPath);
    const hash = sha1(buf);
    if (!fresh && mineruCached(cacheDir, hash, tools.mineru)) continue;
    docs.push({ pdfPath, hash, pages: await pageCount(buf, pdfParse) });
  }
  // Loturi de cel mult BATCH_PAGES pagini (un PDF mai mare merge singur).
  let batch = [];
  let size = 0;
  for (const d of docs) {
    if (batch.length && size + (d.pages || 30) > BATCH_PAGES) {
      await runMineru(batch, { cacheDir, tool: tools.mineru, label });
      batch = [];
      size = 0;
    }
    batch.push(d);
    size += d.pages || 30;
  }
  await runMineru(batch, { cacheDir, tool: tools.mineru, label });
}

const META = '_meta.json';
// Numele de dinainte de textName: un singur aviz.txt pentru toate avizele, plus dubluri vechi.
const LEGACY = ['adresa.txt', 'expunere.txt', 'forma.txt', 'aviz.txt', 'other.txt'];
// Un text citit mai bine nu e înlocuit de unul citit mai prost (de exemplu --force pe o mașină fără MinerU).
const RANK = { text: 0, ocr: 1, 'mineru+ocr': 2, mineru: 2 };

/**
 * Scrie pentru fiecare PDF al proiectului <nume>.txt și, când avem OCR, <nume>.md, și notează metoda în _meta.json.
 * Fără `force`, un PDF care are deja text și meta e lăsat în pace. Nu aruncă erori pentru un PDF care nu se poate
 * citi: îl sare și păstrează textul vechi. Întoarce textele după nume (forma_initiatorului, expunere_motive, aviz_ES...).
 * `onDoc(name, result)` primește rezultatul fiecărui PDF citit acum (pentru statistici).
 */
export async function writeBillTexts(pdfDir, textDir, { pdfParse, cacheDir, force = false, fresh = false, onDoc } = {}) {
  const texts = {};
  if (!fs.existsSync(pdfDir)) return texts;
  fs.mkdirSync(textDir, { recursive: true });
  const metaPath = path.join(textDir, META);
  let meta = {};
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch {
    // fără meta sau stricat: îl refacem
  }
  const slug = path.basename(pdfDir);
  const files = fs.readdirSync(pdfDir).filter((f) => /\.pdf$/i.test(f)).sort();
  const todo = files.filter((f) => force || !meta[textName(f)] || !fs.existsSync(path.join(textDir, `${textName(f)}.txt`)));
  try {
    await warmMineru(todo.map((f) => path.join(pdfDir, f)), { pdfParse, cacheDir, fresh, label: slug });
  } catch (err) {
    console.warn(`⚠️ ${slug}: MinerU nu a putut citi lotul (${err.message})`);
  }

  for (const file of files) {
    const name = textName(file);
    const txtPath = path.join(textDir, `${name}.txt`);
    const mdPath = path.join(textDir, `${name}.md`);
    const old = fs.existsSync(txtPath) ? fs.readFileSync(txtPath, 'utf8') : null;
    if (!todo.includes(file)) {
      if (old) texts[name] = old;
      continue;
    }
    let res;
    try {
      res = await extractPdfText(path.join(pdfDir, file), { pdfParse, cacheDir, fresh, label: `${slug}/${name}` });
    } catch (err) {
      console.warn(`⚠️ ${slug}/${name}: textul nu a putut fi citit (${err.message}); rămâne cel vechi`);
      if (old) texts[name] = old;
      continue;
    }
    if (old && meta[name] in RANK && RANK[res.method] < RANK[meta[name]]) {
      console.warn(`⚠️ ${slug}/${name}: citit acum doar cu „${res.method}”, păstrăm textul „${meta[name]}” de dinainte`);
      texts[name] = old;
      continue;
    }
    if (res.text.trim().length < 20) continue;
    fs.writeFileSync(txtPath, res.text, 'utf8');
    if (res.markdown) fs.writeFileSync(mdPath, res.markdown, 'utf8');
    else fs.rmSync(mdPath, { force: true });
    meta[name] = res.method;
    texts[name] = res.text;
    onDoc?.(name, res);
  }
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');
  for (const f of LEGACY) fs.rmSync(path.join(textDir, f), { force: true });
  return texts;
}
