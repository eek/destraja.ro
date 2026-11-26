// Adresele copiilor noastre ale documentelor parlamentare: https://destraja.ro/documente/<slug>/<fișier>, servite din R2
// de worker/documente.ts. Aceleași funcții le folosesc paginile (src/lib/documente.ts), Worker-ul și scripturile
// (scripts/lib/documente.mjs), fără nimic din Node, ca să meargă în toate trei.
//
// O adresă nu-și schimbă conținutul: originalul rămâne la <fișier>, iar o versiune nouă a documentului oficial primește
// <nume>@<AAAA-LL-ZZ>.<ext> (lângă el, în același dosar).

export const PUBLIC_ORIGIN = 'https://destraja.ro';
export const PUBLIC_PREFIX = '/documente/';

/**
 * Adresa copiei noastre pentru `slug` și `file` (numele din data/pdfs/<slug>/), cu `page` pentru #page=N (cititoarele
 * de PDF din browser deschid documentul la pagina aceea). Relativă, sau absolută cu `absolute`.
 *   ourCopyUrl('b563-2026', 'forma_initiatorului_26b563FG.PDF', { page: 3 })
 *   → /documente/b563-2026/forma_initiatorului_26b563FG.PDF#page=3
 */
export function ourCopyUrl(slug: string, file: string, opts: { page?: number; absolute?: boolean } = {}): string {
  const enc = (p: string) => encodeURIComponent(p).replace(/%40/g, '@');
  return `${opts.absolute ? PUBLIC_ORIGIN : ''}${PUBLIC_PREFIX}${enc(slug)}/${enc(file)}${opts.page ? `#page=${opts.page}` : ''}`;
}

/** Ca ourCopyUrl, pentru o cale <slug>/<fișier> din manifest. */
export const ourCopyPathUrl = (relPath: string, opts: { page?: number; absolute?: boolean } = {}) => {
  const i = relPath.indexOf('/');
  return ourCopyUrl(relPath.slice(0, i), relPath.slice(i + 1), opts);
};

/** Calea <slug>/<fișier> dintr-o adresă /documente/…, sau null dacă nu e a unui document (un slug și un PDF, fără „..”). */
export function keyFromPath(pathname: string): string | null {
  if (!pathname.startsWith(PUBLIC_PREFIX)) return null;
  let key: string;
  try {
    key = decodeURIComponent(pathname.slice(PUBLIC_PREFIX.length));
  } catch {
    return null;
  }
  return /^[a-z0-9][a-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9_.@-]*\.pdf$/i.test(key) && !key.includes('..') ? key : null;
}

/** Ziua unei versiuni din numele ei (…@2026-12-03.PDF), sau null pentru un document fără versiuni. */
export function versionDay(file: string): string | null {
  return /@(\d{4}-\d{2}-\d{2})(?:-\d+)?\.[^.]+$/.exec(file)?.[1] ?? null;
}
