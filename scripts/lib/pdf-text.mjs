// Textul din PDF-urile Senatului. Multe sunt scanări cu un strat de text recunoscut prost
// („destina!iei”, „Si”, „§i”, „asigur5rii”). Când stratul arată așa, recitim paginile cu
// Tesseract în română (ocrmypdf) și păstrăm varianta mai curată.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const LETTER = 'a-zăâîșşțţ';
const BAD_WORD = new RegExp(`[${LETTER}][0-9!§€\\]\\[{}|\`~^\\\\@$][${LETTER}]|^(Si|§i|\\$i|fl|Sl)$|[§€]`, 'i');
// Peste 1,5 cuvinte stricate la sută sau aproape fără diacritice: merită recitit.
const BAD_RATE = 1.5;
const MIN_DIACRITICS = 1;

/** Fișierul .txt al unui PDF: tipurile unice își păstrează numele, avizele primesc emitentul (aviz_ES, aviz_LG). */
export function textName(pdfFile) {
  const base = path.basename(pdfFile).replace(/\.pdf$/i, '');
  const [type, ...rest] = base.split('_');
  if (/^(forma|expunere|adresa)$/.test(type)) return base.replace(/_[^_]+$/, '');
  const code = rest.join('_').replace(/^\d{2}b\d+/i, '') || rest.join('_');
  return `${type}_${code}`;
}

/** Diacriticele cu sedilă devin cu virgulă, iar spațiile multiple din scanări dispar. */
export function normalizeRo(text) {
  return text
    .replace(/ş/g, 'ș')
    .replace(/Ş/g, 'Ș')
    .replace(/ţ/g, 'ț')
    .replace(/Ţ/g, 'Ț')
    .replace(/\r\n?/g, '\n')
    .replace(/\f/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function textQuality(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const letters = (text.match(/\p{L}/gu) ?? []).length || 1;
  const diacritics = (text.match(/[ăâîșşțţĂÂÎȘŞȚŢ]/g) ?? []).length;
  const bad = words.filter((w) => BAD_WORD.test(w.replace(/^[„"(.,;:]+|[”".,;:)]+$/g, ''))).length;
  return {
    words: words.length,
    badRate: (100 * bad) / Math.max(1, words.length),
    diacriticRate: (100 * diacritics) / letters,
  };
}

function needsOcr(q) {
  return q.words < 30 || q.badRate > BAD_RATE || q.diacriticRate < MIN_DIACRITICS;
}

async function ocr(pdfPath, sidecar) {
  await run('ocrmypdf', ['-q', '--force-ocr', '-l', 'ron', '--output-type', 'none', '--sidecar', sidecar, pdfPath, '-'], {
    timeout: 15 * 60 * 1000,
    maxBuffer: 16 * 1024 * 1024,
  });
  return fs.readFileSync(sidecar, 'utf8');
}

/**
 * Textul unui PDF și cum l-am obținut. `pdfParse` e pdf-parse încărcat de apelant; fără ocrmypdf
 * instalat rămânem la stratul de text, oricât de prost ar fi.
 */
export async function extractPdfText(pdfPath, { pdfParse, cacheDir }) {
  let layer = '';
  try {
    layer = normalizeRo((await pdfParse(fs.readFileSync(pdfPath)))?.text ?? '');
  } catch {
    // PDF fără strat de text sau stricat: încercăm direct OCR.
  }
  const layerQ = textQuality(layer);
  if (!needsOcr(layerQ)) return { text: layer, method: 'text' };

  fs.mkdirSync(cacheDir, { recursive: true });
  const sidecar = path.join(cacheDir, `${path.basename(pdfPath)}.txt`);
  try {
    const read = normalizeRo(await ocr(pdfPath, sidecar));
    const ocrQ = textQuality(read);
    if (read.length > 50 && (ocrQ.badRate < layerQ.badRate || layerQ.words < 30)) return { text: read, method: 'ocr' };
  } catch (err) {
    console.warn(`⚠️ OCR eșuat pentru ${path.basename(pdfPath)}: ${err.message.split('\n')[0]}`);
  } finally {
    fs.rmSync(sidecar, { force: true });
  }
  return { text: layer, method: 'text' };
}

const META = '_meta.json';
// Numele de dinainte de textName: un singur aviz.txt pentru toate avizele, plus dubluri vechi.
const LEGACY = ['adresa.txt', 'expunere.txt', 'forma.txt', 'aviz.txt', 'other.txt'];

/**
 * Scrie câte un .txt pentru fiecare PDF al proiectului și notează în _meta.json care au fost
 * recitite cu OCR. Fără `force`, un PDF care are deja text și meta e lăsat în pace.
 * Întoarce textele după nume (forma_initiatorului, expunere_motive, aviz_ES...).
 */
export async function writeBillTexts(pdfDir, textDir, { pdfParse, cacheDir, force = false }) {
  const texts = {};
  if (!fs.existsSync(pdfDir)) return texts;
  fs.mkdirSync(textDir, { recursive: true });
  const metaPath = path.join(textDir, META);
  const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};

  for (const file of fs.readdirSync(pdfDir).sort()) {
    if (!/\.pdf$/i.test(file)) continue;
    const name = textName(file);
    const txtPath = path.join(textDir, `${name}.txt`);
    if (!force && meta[name] && fs.existsSync(txtPath)) {
      texts[name] = fs.readFileSync(txtPath, 'utf8');
      continue;
    }
    const { text, method } = await extractPdfText(path.join(pdfDir, file), { pdfParse, cacheDir });
    if (text.length < 20) continue;
    fs.writeFileSync(txtPath, text, 'utf8');
    meta[name] = method;
    texts[name] = text;
  }
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');
  for (const f of LEGACY) fs.rmSync(path.join(textDir, f), { force: true });
  return texts;
}
