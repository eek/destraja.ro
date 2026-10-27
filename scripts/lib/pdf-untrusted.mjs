// Textul unui PDF descărcat de pe web, citit într-un proces separat. Un PDF străin poate fi făcut să blocheze
// sau să umfle memoria cititorului, așa că pdf-parse rulează într-un copil cu memorie limitată, fără variabile
// de mediu și cu limită de timp; pdf.js nu are voie să compileze cod (isEvalSupported = false). Ce iese e doar
// text, tratat mai departe ca date.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);

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
 * @param {Buffer} buffer
 * @returns {Promise<{ text: string, pages: number, created: string | null, modified: string | null }>}
 */
export function readUntrustedPdf(buffer, { timeoutMs = 90000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--max-old-space-size=768', SELF, '--worker'], {
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
        resolve({ text: cleanPdfText(r.text ?? ''), pages: r.pages ?? 0, created: pdfDate(r.created), modified: pdfDate(r.modified) });
      } catch {
        reject(new Error('PDF ilizibil: răspuns stricat de la cititor'));
      }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(buffer);
  });
}

async function worker() {
  const require = createRequire(SELF);
  const pdfjs = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
  pdfjs.isEvalSupported = false;
  pdfjs.verbosity = 0;
  const pdfParse = require('pdf-parse/lib/pdf-parse.js');
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const data = await pdfParse(Buffer.concat(chunks), { max: 60 });
  process.stdout.write(JSON.stringify({ text: data.text, pages: data.numpages, created: data.info?.CreationDate, modified: data.info?.ModDate }));
}

if (process.argv[1] === SELF && process.argv.includes('--worker')) {
  // pdf.js scrie avertismente despre fonturi pe stdout; le mutăm pe stderr ca să nu strice JSON-ul.
  console.log = (...a) => process.stderr.write(`${a.join(' ')}\n`);
  worker().catch((e) => {
    process.stderr.write(String(e?.message || e));
    process.exit(1);
  });
}
