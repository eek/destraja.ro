#!/usr/bin/env node
// Reface textele tuturor PDF-urilor descărcate (data/pdfs → data/texts), cu OCR în română unde
// stratul de text al scanării e stricat. Rulează: node scripts/straja-texts.mjs [--force] [b543]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeBillTexts } from './lib/pdf-text.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PDF_DIR = path.join(ROOT, 'data', 'pdfs');
const TEXT_DIR = path.join(ROOT, 'data', 'texts');
const PARALLEL = 3;

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.find((a) => !a.startsWith('--'))?.toLowerCase();
const mod = await import('pdf-parse/lib/pdf-parse.js');
const pdfParse = mod.default || mod;

const slugs = fs.readdirSync(PDF_DIR).filter((s) => !only || s.includes(only)).sort();
let done = 0;
async function worker() {
  for (let slug = slugs.shift(); slug; slug = slugs.shift()) {
    const started = Date.now();
    const texts = await writeBillTexts(path.join(PDF_DIR, slug), path.join(TEXT_DIR, slug), {
      pdfParse,
      cacheDir: path.join(ROOT, '.cache', 'ocr'),
      force,
    });
    const meta = JSON.parse(fs.readFileSync(path.join(TEXT_DIR, slug, '_meta.json'), 'utf8'));
    const ocr = Object.entries(meta).filter(([, m]) => m === 'ocr').map(([n]) => n);
    console.log(`${++done} ${slug}: ${Object.keys(texts).length} texte, OCR: ${ocr.join(', ') || '-'} (${Math.round((Date.now() - started) / 1000)} s)`);
  }
}
await Promise.all(Array.from({ length: PARALLEL }, worker));
