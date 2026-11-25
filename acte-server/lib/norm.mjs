// Normalizarea textului pentru căutare (contractul actelor, §3.2): aceeași funcție pe NAS (title_norm, cite_norm) și
// aici (interogări). Fără importuri, ca s-o poată rula și testele, și pachetul serverului.

/** norm(): litere mici, fără diacritice (ş/ș, ţ/ț, ă, â, î), doar a–z și 0–9, fără „nr”. */
export function norm(s) {
  if (s == null) return '';
  let t = String(s).normalize('NFC').toLowerCase();
  t = t.replace(/ş/g, 'ș').replace(/ţ/g, 'ț');
  t = t.replace(/[ăâ]/g, 'a').replace(/î/g, 'i').replace(/ș/g, 's').replace(/ț/g, 't');
  t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
  t = t.replace(/[^a-z0-9]+/g, ' ');
  return t
    .split(' ')
    .filter((w) => w && w !== 'nr')
    .join(' ');
}

/** Numărul ca text, pliat: „15.114” → „15114”, „2.284/C” → „2284c”. */
export const numberNorm = (s) => (s == null ? null : norm(s).replace(/ /g, '') || null);

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Primele segmente de cale care nu pot fi sluguri (contract §2.4). */
export const RESERVED = new Set(['api', 'date', 'p', 'cauta', '_static', 'robots.txt', 'sitemap.xml', 'favicon.ico', 'urmaresc', 'despre', 'metodologie']);

export function isValidSlug(s) {
  if (typeof s !== 'string' || s.length > 120 || !SLUG_RE.test(s)) return false;
  if (RESERVED.has(s) || s.startsWith('sitemap-')) return false;
  return /\d/.test(s) || s.startsWith('cod-');
}
