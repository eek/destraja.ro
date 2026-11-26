#!/usr/bin/env node
// Tabelele de semnături ale inițiatorilor, din expunerile de motive: pagina din PDF a fiecărui tabel și, pentru rândurile
// pe care textul recunoscut nu le lămurește, citirea pe imagine. Scrie data/texts/<slug>/_semnaturi.json, pe care pagina
// proiectului îl dă tabelului (src/lib/tidy-tables.ts).
//
// Tabelele sunt completate de mână, iar MinerU citește din ele „Dezwateu GuoTeu” în loc de Bejinariu Eugen. Pagina pune
// fiecare rând pe lista oficială a inițiatorilor de pe senat.ro, cu o potrivire globală (src/lib/initiator-match.ts).
// Rândurile care rămân nesigure după potrivire merg aici la Gemini (implicit gemini-4-hydrogen-low, prin agy), cu
// imaginea tabelului de pe pagina lor și lista inițiatorilor încă nefolosiți: un apel pe pagină, pentru toate rândurile
// ei. Primim răspunsul doar dacă numele e din lista oficială și nu e deja al altui rând sigur. Răspunsurile stau în
// .cache/tabel-semnaturi, după imagine și cerere, deci o rulare nouă nu mai cheamă modelul pentru aceleași rânduri.
//
//   node scripts/straja-tabel-semnaturi.mjs              # toate proiectele cu tabele de semnături
//   node scripts/straja-tabel-semnaturi.mjs b660-2026    # unul sau câteva
//   node scripts/straja-tabel-semnaturi.mjs --due        # doar documentele noi sau schimbate de la ultima rulare
//   node scripts/straja-tabel-semnaturi.mjs --dry-run    # spune câte apeluri ar face, fără model și fără scriere
//   node scripts/straja-tabel-semnaturi.mjs --no-model   # doar paginile tabelelor, fără citirea pe imagine
//
// Cota Gemini e una singură pentru Mac și VM (agy-shared-quota): --max=N oprește după N apeluri noi.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import zlib from 'node:zlib';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import { parseHtmlTable, textName } from './lib/pdf-text.mjs';
import { runModel, SANDBOX_DIR } from './lib/ai-cli.mjs';
import { writeFileAtomic } from './lib/atomic.mjs';

register('./lib/ts-resolve.mjs', import.meta.url);
const { fixPipeTables, signatureReport } = await import('../src/lib/tidy-tables.ts');
const { fold, similarity } = await import('../src/lib/initiator-match.ts');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PDF_DIR = path.join(ROOT, 'data', 'pdfs');
const TEXT_DIR = path.join(ROOT, 'data', 'texts');
// Rezultatele MinerU (scripts/lib/pdf-text.mjs); MINERU_CACHE_DIRS adaugă alte dosare (despărțite de „:”), de exemplu
// cache-ul recitirii din octombrie, făcută în alt dosar de lucru.
const MINERU_CACHES = [path.join(ROOT, '.cache', 'ocr', 'mineru'), ...(process.env.MINERU_CACHE_DIRS ?? '').split(':').filter(Boolean)];
const CACHE = path.join(ROOT, '.cache', 'tabel-semnaturi');
const OUT_NAME = '_semnaturi.json';
export const VISION_MODEL = process.env.SEMNATURI_MODEL || 'gemini-4-hydrogen-low';
// Rezoluția paginii pentru model: la 200 dpi scrisul de mână se citește, iar imaginea tabelului rămâne sub 2.000 px.
const DPI = 200;
// Sub atât, modelul însuși spune că nu e sigur: rândul rămâne în cursiv.
const MIN_CONFIDENCE = 0.6;

const args = process.argv.slice(2);
const due = args.includes('--due');
const dry = args.includes('--dry-run');
const noModel = args.includes('--no-model');
const maxCalls = Number(args.find((a) => a.startsWith('--max='))?.slice(6) ?? Infinity);
const only = args.filter((a) => !a.startsWith('--')).map((s) => s.toLowerCase());

const sha1 = (x) => crypto.createHash('sha1').update(x).digest('hex');
const readJson = (f, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return fallback;
  }
};

/** Arborele HTML al unui text, pe același drum ca pe pagină (DocumentText), fără filtrul de securitate (nu schimbă textul). */
function treeOf(markdown) {
  const md = fixPipeTables(markdown);
  const proc = unified().use(remarkParse).use(remarkGfm).use(remarkRehype, { allowDangerousHtml: true }).use(rehypeRaw);
  return proc.runSync(proc.parse(md));
}

/** Paginile MinerU ale unui PDF (cache-ul din .cache/ocr), cu tabelele fiecăreia: rândurile pliate și cutia tabelului. */
function mineruTables(pdfPath) {
  const hash = sha1(fs.readFileSync(pdfPath));
  const files = MINERU_CACHES.flatMap((dir) => {
    try {
      return fs.readdirSync(dir).filter((f) => f.startsWith(`${hash}-`)).map((f) => path.join(dir, f));
    } catch {
      return [];
    }
  });
  if (!files.length) return null;
  const newest = files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(newest)).toString('utf8'));
  const out = [];
  (data.pages ?? []).forEach((page, i) => {
    const visit = (b) => {
      if (b?.type === 'table') {
        const html = JSON.stringify(b.content ?? '').includes('<table') ? collectHtml(b.content) : '';
        const cells = new Set(parseHtmlTable(html).flatMap((r) => r.cells.map((c) => fold(c.text))).filter(Boolean));
        if (cells.size) out.push({ page: i + 1, bbox: b.bbox, cells });
      }
      for (const c of Array.isArray(b?.blocks) ? b.blocks : []) visit(c);
    };
    for (const b of page?.blocks ?? []) visit(b);
  });
  return out;
}
const collectHtml = (node) =>
  typeof node === 'string' ? (node.includes('<table') ? node : '') : Array.isArray(node) ? node.map(collectHtml).join('') : node && typeof node === 'object' ? collectHtml(node.content) : '';

/**
 * Imaginea tabelelor de pe o pagină (cutiile lor, unite, cu o margine), în tonuri de gri, ca PNG. Fără metadate (data
 * creării), ca aceeași pagină să dea mereu aceiași octeți: după ei ține minte cache-ul răspunsurile.
 */
function cropTables(pdfPath, page, boxes) {
  const x0 = Math.max(0, Math.min(...boxes.map((b) => b[0])) - 0.01), y0 = Math.max(0, Math.min(...boxes.map((b) => b[1])) - 0.01);
  const x1 = Math.min(1, Math.max(...boxes.map((b) => b[2])) + 0.01), y1 = Math.min(1, Math.max(...boxes.map((b) => b[3])) + 0.01);
  const geom = `${((x1 - x0) * 100).toFixed(2)}%x${((y1 - y0) * 100).toFixed(2)}%`;
  // magick nu primește decalajul în procente: îl socotim după dimensiunea paginii la DPI-ul ales.
  const size = spawnSync('magick', ['-density', String(DPI), `${pdfPath}[${page - 1}]`, '-format', '%w %h', 'info:'], { encoding: 'utf8' });
  const [w, h] = (size.stdout || '').trim().split(/\s+/).map(Number);
  if (!w || !h) throw new Error(`nu pot randa pagina ${page} din ${path.basename(pdfPath)}: ${size.stderr?.trim()}`);
  const crop = `${Math.round((x1 - x0) * w)}x${Math.round((y1 - y0) * h)}+${Math.round(x0 * w)}+${Math.round(y0 * h)}`;
  const res = spawnSync('magick', ['-density', String(DPI), `${pdfPath}[${page - 1}]`, '-colorspace', 'gray', '-crop', crop, '+repage', '-strip', '-define', 'png:exclude-chunks=date,time', 'png:-'], { maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0 || !res.stdout?.length) throw new Error(`nu pot decupa pagina ${page}: ${String(res.stderr).trim()} (${geom})`);
  return res.stdout;
}

/** Cererea pentru model: rândurile de citit și numele dintre care alege. */
function promptFor(imagePath, rows, open, all) {
  const line = (r) =>
    r.nr
      ? `- rândul cu nr. ${r.nr} (textul recunoscut automat, de obicei greșit: „${r.ocr}”${r.ocrGroup ? `, grup „${r.ocrGroup}”` : ''})`
      : `- rândul ${r.id}, fără număr în tabel: cel al cărui nume a fost recunoscut automat ca „${r.ocr}”${r.ocrGroup ? `, grup „${r.ocrGroup}”` : ''}`;
  return [
    `Deschide imaginea ${imagePath}. E un tabel de semnături dintr-o expunere de motive a unui proiect de lege: pe fiecare rând sunt numărul curent, numele și prenumele unui parlamentar scrise de mână, grupul parlamentar și semnătura (acoperită cu gri).`,
    '',
    'Pentru fiecare rând de mai jos, spune ce parlamentar e scris pe el. Alege numele exact din LISTA A (inițiatorii încă nepotriviți ai proiectului); doar dacă nu e niciunul de acolo, din LISTA B (toți inițiatorii). Alege după ce vezi scris, nu după eliminare. Dacă nu se poate citi sau numele nu e în liste, pune null.',
    '',
    'Rândurile:',
    ...rows.map(line),
    '',
    `LISTA A: ${open.join('; ')}`,
    `LISTA B: ${all.join('; ')}`,
    '',
    'Răspunde doar cu JSON, fără alt text:',
    '{"rows":[{"nr":"numărul rândului ca în listă (sau R1, R2… pentru rândurile fără număr)","read":"ce scrie de mână, literă cu literă","name":"numele exact din listă sau null","group":"grupul cum e scris","confidence":0.0}]}',
  ].join('\n');
}

let calls = 0, cached = 0, planned = 0;

/** Rândurile unei pagini, citite de model; răspunsul vine din cache dacă imaginea și cererea sunt aceleași. */
async function readPage(slug, pdfPath, page, boxes, rows, open, all) {
  const png = cropTables(pdfPath, page, boxes);
  const key = sha1(Buffer.concat([png, Buffer.from(JSON.stringify({ model: VISION_MODEL, rows: rows.map((r) => [r.nr || r.id, r.ocr]), open, all }))]));
  const cacheFile = path.join(CACHE, `${key}.json`);
  const hit = readJson(cacheFile, null);
  if (hit) {
    cached++;
    return hit;
  }
  planned++;
  if (dry || noModel || calls >= maxCalls) return null;
  const dir = path.join(SANDBOX_DIR, 'semnaturi');
  fs.mkdirSync(dir, { recursive: true });
  const image = path.join(dir, `${key}.png`);
  fs.writeFileSync(image, png);
  calls++;
  try {
    const res = await runModel('agy', promptFor(image, rows, open, all), { mode: 'vision', agyModel: VISION_MODEL, timeoutMs: 180_000, label: `semnaturi-${slug}-p${page}` });
    if (res.status !== 'ok') {
      console.log(`  ⚠️ ${slug} p. ${page}: ${res.error}`);
      return null;
    }
    const out = { model: VISION_MODEL, page, at: new Date().toISOString(), rows: Array.isArray(res.data?.rows) ? res.data.rows : [] };
    fs.mkdirSync(CACHE, { recursive: true });
    writeFileAtomic(cacheFile, JSON.stringify(out, null, 2) + '\n');
    return out;
  } finally {
    fs.rmSync(image, { force: true });
  }
}

/** Un document: rândurile, paginile tabelelor și, pentru rândurile nesigure, citirea pe imagine. */
async function doDoc(bill, pdfPath, markdown) {
  const known = bill.initiators;
  const rows = signatureReport(treeOf(markdown), known);
  if (!rows.length) return null;
  const out = { md: sha1(markdown).slice(0, 12), names: sha1(JSON.stringify(known)).slice(0, 12), pages: [], read: {}, model: null, unsure: 0 };
  const tables = fs.existsSync(pdfPath) ? mineruTables(pdfPath) : null;
  // Pagina fiecărui rând: tabelul MinerU în care apare textul lui.
  const where = new Map();
  for (const r of rows) {
    const f = fold(r.ocr);
    const t = tables?.find((x) => x.cells.has(f));
    if (t) where.set(r, t);
  }
  const byPage = new Map();
  for (const [r, t] of where) {
    if (!byPage.has(t.page)) byPage.set(t.page, { boxes: new Set(), rows: [] });
    byPage.get(t.page).boxes.add(t.bbox);
    byPage.get(t.page).rows.push(r);
  }
  out.pages = [...byPage].sort((a, b) => a[0] - b[0]).map(([page, x]) => ({ page, rows: [...new Set(x.rows.map((r) => fold(r.ocr)))] }));
  const sure = new Set(rows.filter((r) => r.k !== null).map((r) => r.k));
  const open = known.filter((_, k) => !sure.has(k)).map((k) => k.name);
  const all = known.map((k) => k.name);
  const pending = rows.filter((r) => r.k === null);
  const byFold = new Map(known.map((k, i) => [fold(k.name), i]));
  const picks = [];
  for (const [page, x] of byPage) {
    // Rândurile fără număr curent primesc o etichetă (R1, R2…), ca răspunsul să se poată lega de ele.
    let unnumbered = 0;
    const todo = x.rows.filter((r) => r.k === null).map((r) => ({ ...r, id: r.nr || `R${++unnumbered}` }));
    if (!todo.length || !open.length) continue;
    const res = await readPage(bill.slug, pdfPath, page, [...x.boxes], todo, open, all);
    if (!res) continue;
    out.model = res.model;
    for (const r of todo) {
      const ans = res.rows.find((a) => String(a?.nr ?? '').replace(/^nr\.?\s*/i, '').replace(/[.)]$/, '').trim().toUpperCase() === r.id.toUpperCase());
      const k = ans?.name ? byFold.get(fold(String(ans.name))) : undefined;
      const confidence = Number(ans?.confidence ?? 0);
      if (k === undefined || confidence < MIN_CONFIDENCE) continue;
      // Unii parlamentari semnează de două ori în același tabel (B616/2026: Orban Carmen la rândurile 31 și 78). Un nume
      // deja al altui rând îl primim doar cu dovadă dublă: modelul e foarte sigur și ce spune că scrie seamănă cu numele.
      const strong = confidence >= 0.9 && similarity(String(ans.read ?? ''), known[k].name) >= 0.75;
      if (sure.has(k) && !strong) continue;
      picks.push({ r, k, strong });
    }
  }
  // Același nume ales pentru mai multe rânduri: rămân doar alegerile cu dovadă dublă.
  const count = new Map();
  for (const p of picks) count.set(p.k, (count.get(p.k) ?? 0) + 1);
  for (const p of picks) if (count.get(p.k) === 1 || p.strong) out.read[fold(p.r.ocr)] = known[p.k].name;
  out.unsure = pending.length - Object.keys(out.read).length;
  return { out, rows: rows.length, pending: pending.length };
}

const bills = readJson(path.join(ROOT, 'data', 'senat-bills.json'), []);
let docs = 0, rowsAll = 0, pendingAll = 0, readAll = 0;
for (const bill of bills) {
  if (!bill.initiators?.length || (only.length && !only.some((s) => bill.slug.includes(s)))) continue;
  const dir = path.join(TEXT_DIR, bill.slug);
  if (!fs.existsSync(dir)) continue;
  const outFile = path.join(dir, OUT_NAME);
  const prev = readJson(outFile, {});
  const next = {};
  for (const pdf of bill.pdfs ?? []) {
    const file = `${pdf.type}_${path.basename(pdf.url)}`;
    const name = textName(file);
    const md = (() => {
      try {
        return fs.readFileSync(path.join(dir, `${name}.md`), 'utf8');
      } catch {
        return null;
      }
    })();
    if (!md || !/\|.*\||<table/.test(md)) continue;
    if (due && prev[name] && prev[name].md === sha1(md).slice(0, 12) && prev[name].names === sha1(JSON.stringify(bill.initiators)).slice(0, 12)) {
      next[name] = prev[name];
      continue;
    }
    // Fișierul local poate avea alt număr decât adresa de pe fișă (26L622EM.PDF pentru 26b523EM.PDF): îl căutăm după nume.
    const local = (() => {
      try {
        return fs.readdirSync(path.join(PDF_DIR, bill.slug)).find((f) => textName(f) === name);
      } catch {
        return undefined;
      }
    })();
    const res = await doDoc(bill, path.join(PDF_DIR, bill.slug, local ?? file), md);
    if (!res) continue;
    docs++;
    rowsAll += res.rows;
    pendingAll += res.pending;
    readAll += Object.keys(res.out.read).length;
    next[name] = { ...res.out, pdfUrl: pdf.url };
    console.log(`${bill.slug}/${name}: ${res.rows} rânduri, ${res.pending} nesigure din text, ${Object.keys(res.out.read).length} citite pe imagine, pagini ${res.out.pages.map((p) => p.page).join(', ') || '—'}`);
  }
  if (dry) continue;
  if (Object.keys(next).length) {
    const body = JSON.stringify(next, null, 2) + '\n';
    if (!fs.existsSync(outFile) || fs.readFileSync(outFile, 'utf8') !== body) writeFileAtomic(outFile, body);
  } else if (fs.existsSync(outFile)) fs.rmSync(outFile);
}
console.log(
  `✅ semnături: ${docs} documente, ${rowsAll} rânduri, ${pendingAll} nesigure din text, ${readAll} citite pe imagine; ` +
    `apeluri ${VISION_MODEL}: ${calls} noi, ${cached} din cache${dry || noModel || calls >= maxCalls ? `, ${planned - calls} de făcut` : ''}`,
);
