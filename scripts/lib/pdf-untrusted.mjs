// Textul unui PDF descărcat de pe web, citit într-un proces separat. Un PDF străin poate fi făcut să blocheze
// sau să umfle memoria cititorului, așa că pdf-parse rulează într-un copil cu memorie limitată, fără variabile
// de mediu și cu limită de timp; pdf.js nu are voie să compileze cod (isEvalSupported = false). Ce iese e doar
// text, tratat mai departe ca date.
//
// Citim cel mult MAX_PAGES pagini (până pe 10 noiembrie 2026 erau 60, iar anexele cu amendamente ale rapoartelor lungi
// rămâneau pe dinafară). Cititorul se oprește singur, între pagini, și când textul trece de MAX_CHARS sau când s-au dus
// trei sferturi din timp, și spune câte pagini a apucat (`pagesRead`): cine primește textul știe dacă e întreg.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const MAX_PAGES = 300;
const MAX_CHARS = 4_000_000;

/** Diacriticele cu sedilă devin cu virgulă; spațiile multiple dispar, rândurile rămân. */
export function cleanPdfText(text) {
  return text
    .replace(/ş/g, 'ș')
    .replace(/Ş/g, 'Ș')
    .replace(/ţ/g, 'ț')
    .replace(/Ţ/g, 'Ț')
    .replace(/\r\n?/g, '\n')
    .replace(/\f/g, '\n')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

/** „D:20261026142219+00'00'” → „2026-10-26”. */
export function pdfDate(raw) {
  const m = /^D?:?(\d{4})(\d{2})(\d{2})/.exec(String(raw ?? ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * `pages` sunt paginile documentului, `pagesRead` cele citite: mai puține când documentul trece de `maxPages`, de
 * MAX_CHARS sau de timpul lăsat.
 * @param {Buffer} buffer
 * @returns {Promise<{ text: string, pages: number, pagesRead: number, created: string | null, modified: string | null }>}
 */
export function readUntrustedPdf(buffer, { timeoutMs = 90000, maxPages = MAX_PAGES } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--max-old-space-size=768', SELF, '--worker', String(maxPages), String(Math.round(timeoutMs * 0.75))], {
      env: {},
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`PDF-ul nu s-a citit în ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (err = (err + c).slice(-500)));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`PDF ilizibil (cod ${code}): ${err.trim().split('\n').pop() ?? ''}`.slice(0, 200)));
      try {
        const r = JSON.parse(out);
        resolve({ text: cleanPdfText(r.text ?? ''), pages: r.pages ?? 0, pagesRead: r.pagesRead ?? 0, created: pdfDate(r.created), modified: pdfDate(r.modified) });
      } catch {
        reject(new Error('PDF ilizibil: răspuns stricat de la cititor'));
      }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(buffer);
  });
}

// Textul unei pagini, cu rândurile despărțite ca în pdf-parse (render_page): rând nou când se schimbă ordonata.
const pageText = (page) =>
  page.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false }).then((content) => {
    let lastY;
    let text = '';
    for (const item of content.items) {
      text += lastY === item.transform[5] || !lastY ? item.str : `\n${item.str}`;
      lastY = item.transform[5];
    }
    return text;
  });

// Aceiași pași ca pdf-parse, pagină cu pagină, ca să ne putem opri la timp și să știm unde am ajuns.
async function worker(maxPages, softMs) {
  const started = Date.now();
  const require = createRequire(SELF);
  const pdfjs = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
  pdfjs.isEvalSupported = false;
  pdfjs.verbosity = 0;
  pdfjs.disableWorker = true;
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const doc = await pdfjs.getDocument(Buffer.concat(chunks));
  const pages = doc.numPages;
  const info = (await doc.getMetadata().catch(() => null))?.info;
  const last = Math.min(pages, maxPages);
  let text = '';
  let pagesRead = 0;
  while (pagesRead < last && text.length < MAX_CHARS && Date.now() - started < softMs) {
    text += `\n\n${await doc.getPage(pagesRead + 1).then(pageText).catch(() => '')}`;
    pagesRead++;
  }
  doc.destroy();
  process.stdout.write(JSON.stringify({ text, pages, pagesRead, created: info?.CreationDate, modified: info?.ModDate }));
}

if (process.argv[1] === SELF && process.argv.includes('--worker')) {
  // pdf.js scrie avertismente despre fonturi pe stdout; le mutăm pe stderr ca să nu strice JSON-ul.
  console.log = (...a) => process.stderr.write(`${a.join(' ')}\n`);
  const [maxPages, softMs] = process.argv.slice(process.argv.indexOf('--worker') + 1).map(Number);
  worker(maxPages > 0 ? maxPages : MAX_PAGES, softMs > 0 ? softMs : 60_000).catch((e) => {
    process.stderr.write(String(e?.message || e));
    process.exit(1);
  });
}
