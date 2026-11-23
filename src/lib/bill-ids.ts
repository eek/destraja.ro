/**
 * Numerele proiectelor, scrise oricum: „PL-x 110/2026”, „PL-x nr. 110/2026”, „Pl‑x 110 / 2026”, „B563/2026”,
 * „L630/22.12.2025”, „BP692/2026”, slug-ul („plx-110-2026”) sau o adresă (destraja.ro, cdep.ro, senat.ro). Fără importuri:
 * același cod rulează la build (src/lib/open-data.ts scrie /date/index-id.json) și în Worker (worker/mcp-tools.ts).
 */

/** „PL-x nr. 110/2026” → „plx1102026”; „L630/22.12.2025” → „l6302025” (data înregistrării de la Senat nu face parte din cheie). */
export function normalizeId(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‐-―−]/g, '-')
    .replace(/\bnr\.?\s*(?=\d)/g, '')
    .replace(/\/\s*\d{1,2}\.\d{1,2}\.(\d{4})\b/g, '/$1')
    .replace(/[\s.\-_/]/g, '');
}

/** Un număr de proiect întreg, cu prefixul lui (B, L, BP, PL-x, Pl-x), cu sau fără „nr.” și data de la Senat. */
const NUMBER = /^(b|l|bp|pl\s*-?\s*x)\s*(?:nr\.?\s*)?(\d{1,5})\s*\/\s*(?:\d{1,2}\.\d{1,2}\.)?(\d{4})$/i;
/** Fără prefix („110/2026”): poate fi la oricare dintre camere. */
const BARE = /^(?:nr\.?\s*)?(\d{1,5})\s*\/\s*(?:\d{1,2}\.\d{1,2}\.)?(\d{4})$/i;
const SLUG = /^(?:b|l|bp|pl-?x)-?\d{1,5}-\d{4}$/;
export const BARE_PREFIXES = ['b', 'l', 'plx', 'bp'] as const;

export type BillRef =
  /** Chei de căutat în index, în ordine; prima găsită câștigă (un număr fără prefix le încearcă pe toate). */
  | { kind: 'keys'; keys: string[]; any: boolean }
  | { kind: 'url-unknown' };

/**
 * Dacă textul e doar o referință la un proiect (număr, slug sau adresă), cheile de index pentru el; altfel null (atunci e
 * o căutare după cuvinte). Adresele nu se deschid niciodată: doar se citesc din ele numerele cunoscute.
 */
export function parseBillRef(input: string): BillRef | null {
  const q = input.trim().replace(/[‐-―−]/g, '-');
  if (!q || q.length > 300) return null;
  if (/^https?:\/\//i.test(q) || /^(www\.)?(destraja\.ro|lastraja\.ro|cdep\.ro|senat\.ro)\//i.test(q)) {
    let url: URL;
    try {
      url = new URL(/^https?:/i.test(q) ? q : `https://${q}`);
    } catch {
      return { kind: 'url-unknown' };
    }
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const on = (domain: string) => host === domain || host.endsWith(`.${domain}`);
    const page = url.pathname.match(/^\/(?:legi|camera)\/([a-z0-9-]+?)(?:\.html)?\/?$/i);
    if ((host === 'destraja.ro' || host === 'lastraja.ro' || host === 'xn--destraj-f4a.ro') && page) return { kind: 'keys', keys: [normalizeId(page[1])], any: false };
    const p = new Map([...url.searchParams].map(([k, v]) => [k.toLowerCase(), v]));
    if (on('cdep.ro') && /^\d+$/.test(p.get('idp') ?? '')) return { kind: 'keys', keys: [`idp:${Number(p.get('idp'))}`], any: false };
    if (on('senat.ro')) {
      const keys: string[] = [];
      if (/^\d+$/.test(p.get('cod') ?? '')) keys.push(`cod:${Number(p.get('cod'))}`);
      const nr = p.get('nr') ?? p.get('nr_cls');
      const an = p.get('an') ?? p.get('an_cls');
      if (nr && an && /^[a-z]{1,2}\d{1,5}$/i.test(nr) && /^\d{4}$/.test(an)) keys.push(normalizeId(`${nr}/${an}`));
      if (keys.length) return { kind: 'keys', keys, any: false };
    }
    return { kind: 'url-unknown' };
  }
  const n = q.match(NUMBER);
  if (n) return { kind: 'keys', keys: [normalizeId(`${n[1]}${n[2]}/${n[3]}`)], any: false };
  const bare = q.match(BARE);
  if (bare) return { kind: 'keys', keys: BARE_PREFIXES.map((p) => `${p}${Number(bare[1])}${bare[2]}`), any: true };
  if (SLUG.test(q.toLowerCase())) return { kind: 'keys', keys: [normalizeId(q)], any: false };
  return null;
}

/** „20-11-2026”, „20.11.2026”, „5.3.2026” sau „2026-11-20” → „2026-11-20”; orice altceva (sau o dată imposibilă) → null. */
export function isoDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  let y: number, m: number, d: number;
  const a = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const b = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (a) [y, m, d] = [Number(a[1]), Number(a[2]), Number(a[3])];
  else if (b) [y, m, d] = [Number(b[3]), Number(b[2]), Number(b[1])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Ziua de azi la București (ora de vară inclusă), YYYY-MM-DD. */
export function bucharestToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(now);
}
