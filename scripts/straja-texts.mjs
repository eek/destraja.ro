#!/usr/bin/env node
// Reface textele PDF-urilor descărcate (data/pdfs → data/texts, câte un .md și un .txt pe PDF), cu MinerU verificat
// pagină cu pagină de Tesseract (vezi scripts/lib/pdf-text.mjs).
//
//   node scripts/straja-texts.mjs [--force] [--fresh] [b543]
//
//   --force   recitește și PDF-urile care au deja text
//   --fresh   nu folosește rezultatele OCR din .cache/ocr (altfel o recitire după o schimbare de cod durează secunde)
//
// Recitirea tuturor PDF-urilor cu MinerU durează 1,5–2 ore pe un Mac M2 (~7 s pe pagină). Rulează în afara
// actualizării zilnice; MinerU rulează câte unul odată (4–9 GB de RAM).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeBillTexts } from './lib/pdf-text.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PDF_DIR = path.join(ROOT, 'data', 'pdfs');
const TEXT_DIR = path.join(ROOT, 'data', 'texts');
// Două proiecte în paralel: Tesseract pe unul cât MinerU citește celălalt.
const PARALLEL = 2;

const args = process.argv.slice(2);
const force = args.includes('--force');
const fresh = args.includes('--fresh');
const only = args.find((a) => !a.startsWith('--'))?.toLowerCase();
const mod = await import('pdf-parse/lib/pdf-parse.js');
const pdfParse = mod.default || mod;

const slugs = fs.readdirSync(PDF_DIR).filter((s) => !s.startsWith('.') && (!only || s.includes(only))).sort();
const total = slugs.length;
const methods = {};
const fallbacks = [];
let pages = 0;
let done = 0;
const started = Date.now();

async function worker() {
  for (let slug = slugs.shift(); slug; slug = slugs.shift()) {
    const t0 = Date.now();
    const read = [];
    const texts = await writeBillTexts(path.join(PDF_DIR, slug), path.join(TEXT_DIR, slug), {
      pdfParse,
      cacheDir: path.join(ROOT, '.cache', 'ocr'),
      force,
      fresh,
      onDoc: (name, res) => {
        methods[res.method] = (methods[res.method] ?? 0) + 1;
        pages += res.pages || 0;
        for (const f of res.fallbacks) fallbacks.push({ doc: `${slug}/${name}`, ...f });
        read.push(`${name}: ${res.method}${res.fallbacks.length ? ` (p. ${res.fallbacks.map((f) => f.page).join(', ')})` : ''}`);
      },
    });
    console.log(`${++done}/${total} ${slug}: ${Object.keys(texts).length} texte, ${read.join('; ') || 'neschimbate'} (${Math.round((Date.now() - t0) / 1000)} s)`);
  }
}
await Promise.all(Array.from({ length: PARALLEL }, worker));

const minutes = ((Date.now() - started) / 60_000).toFixed(1);
console.log(`\nGata în ${minutes} min: ${pages} pagini; metode: ${Object.entries(methods).map(([m, n]) => `${m} ${n}`).join(', ') || '-'}`);
if (fallbacks.length) {
  console.log(`Pagini luate de la Tesseract sau corectate: ${fallbacks.length}`);
  for (const f of fallbacks) console.log(`  ${f.doc} p. ${f.page}: ${f.reason}${f.kept ? ' (păstrată, fără Tesseract)' : ''}`);
}
