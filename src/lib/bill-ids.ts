/**
 * Normalizare, recunoaștere și rezolvare deterministă a numerelor de proiecte parlamentare (Senat și Camera
 * Deputaților), a adreselor oficiale (senat.ro, cdep.ro, destraja.ro) și a datelor calendaristice.
 *
 * Modul fără dependențe de Node, Next sau Cloudflare Worker: folosit identic la build (src/lib/open-data.ts),
 * în Worker (worker/mcp.ts) și în teste (scripts/lib/mcp.test.mjs).
 */

const DIACRITICS = /[\u0300-\u036f]/g;
const UNICODE_DASHES = /[\u2010-\u2015\u2212]/g;

/** Elimină diacriticele, normalizează liniuțele Unicode și trece la litere mici. */
export function foldText(s: string): string {
  return s.normalize('NFD').replace(DIACRITICS, '').replace(UNICODE_DASHES, '-').toLowerCase();
}

/**
 * „PL-x nr. 110/2026” → „plx1102026”, „Pl–x 110/2026” → „plx1102026”, „L630/22.12.2025” → „l6302025”.
 * Scoate „nr.” și data (zz.ll.) dintre bară și an, apoi spațiile, punctele, liniuțele și barele.
 */
export function normalizeId(s: string): string {
  return foldText(s)
    .replace(/\bnr\.?\s*/g, '')
    .replace(/\/(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g, '/$3')
    .replace(/[\s.\-_/]+/g, '');
}

/**
 * Ca normalizeId, dar păstrează data completă (zz.ll.aaaa, cu zerouri) când există:
 * „L50/8.3.2021” → „l5008032021”, pentru dezambiguizarea numerelor L refolosite în același an.
 */
export function normalizeIdExact(s: string): string {
  return foldText(s)
    .replace(/\bnr\.?\s*/g, '')
    .replace(/\/(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g, (_, d: string, m: string, y: string) => `/${d.padStart(2, '0')}${m.padStart(2, '0')}${y}`)
    .replace(/[\s.\-_/]+/g, '');
}

/** „L630/22.12.2025” → „L630/2025”; păstrează doar prefixul, numărul și anul. */
export function shortSenateNumber(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = foldText(s)
    .trim()
    .match(/^([a-z]+)\s*(?:nr\.?\s*)?(\d+)\s*\/\s*(?:\d{1,2}\.\d{1,2}\.)?(\d{4})$/);
  return m ? `${m[1].toUpperCase()}${m[2]}/${m[3]}` : null;
}

export type ParsedBillUrl =
  | { kind: 'slug'; value: string }
  | { kind: 'idp'; value: string }
  | { kind: 'cod'; value: string }
  | { kind: 'number'; value: string };

const SITE_HOSTS = new Set(['destraja.ro', 'www.destraja.ro', 'lastraja.ro', 'www.lastraja.ro', 'destraja.md', 'www.destraja.md']);
const CDEP_HOSTS = new Set(['cdep.ro', 'www.cdep.ro']);
const SENAT_HOSTS = new Set(['senat.ro', 'www.senat.ro']);

/**
 * Extrage local un identificator de proiect dintr-un URL de pe destraja.ro, cdep.ro sau senat.ro.
 * Nu face niciodată cereri HTTP.
 */
export function parseBillUrl(input: string): ParsedBillUrl | null {
  const trimmed = input.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (SITE_HOSTS.has(host)) {
    const m = url.pathname.match(/^\/(?:legi|camera)\/([a-z0-9-]+)\/?$/i);
    if (m) return { kind: 'slug', value: m[1].toLowerCase() };
    return null;
  }
  if (CDEP_HOSTS.has(host)) {
    const idp = url.searchParams.get('idp')?.trim();
    if (idp && /^\d+$/.test(idp)) return { kind: 'idp', value: `idp:${idp}` };
    const nr = url.searchParams.get('nr_cls')?.trim();
    const an = url.searchParams.get('an_cls')?.trim();
    if (nr && an && /^\d{4}$/.test(an)) return { kind: 'number', value: `${nr}/${an}` };
    return null;
  }
  if (SENAT_HOSTS.has(host)) {
    const cod = url.searchParams.get('cod')?.trim();
    if (cod && /^[a-z0-9-]+$/i.test(cod)) return { kind: 'cod', value: `cod:${cod.toLowerCase()}` };
    return null;
  }
  return null;
}

const PREFIXED_NUMBER_RE = /^\s*(?:b|l|pl-?x|bp)\s*(?:nr\.?\s*)?\d{1,5}\s*\/\s*(?:\d{1,2}\.\d{1,2}\.)?\d{4}\s*$/;
const BILL_SLUG_RE = /^(?:b|l|bp)\d{1,5}-\d{4}$|^plx-\d{1,5}-\d{4}$/;
const PREFIXLESS_NUMBER_RE = /^\s*(\d{1,5})\s*\/\s*((?:19|20)\d{2})\s*$/;
const EMBEDDED_BILL_REF_RE = /\b((?:pl-?x|bp|b|l)\s*(?:nr\.?\s*)?\d{1,5}\s*\/\s*(?:\d{1,2}\.\d{1,2}\.)?(?:19|20)\d{2}|(?:plx-\d{1,5}|(?:b|l|bp)\d{1,5})-(?:19|20)\d{4})\b/i;

/** Adevărat dacă textul întreg arată ca un număr de proiect parlamentar, un slug de proiect sau un URL oficial. */
export function isBillRef(q: string): boolean {
  if (parseBillUrl(q)) return true;
  const f = foldText(q).trim();
  return PREFIXED_NUMBER_RE.test(f) || BILL_SLUG_RE.test(f) || PREFIXLESS_NUMBER_RE.test(f);
}

/** Extrage prima referință de proiect parlamentar dintr-o interogare mixtă („B563/2026 avocat divorț”). */
export function extractBillRef(q: string): string | null {
  const f = foldText(q);
  const m = f.match(EMBEDDED_BILL_REF_RE);
  return m ? m[1].trim() : null;
}

export type AliasIndex = Record<string, string | string[]>;

export type BillIdResolution =
  | { status: 'found'; slugs: string[]; key: string }
  | { status: 'not_found'; recognized: boolean };

function ownLookup(index: AliasIndex, key: string): string[] | null {
  if (!key || !Object.hasOwn(index, key)) return null;
  const val = index[key];
  if (typeof val === 'string') return [val];
  if (Array.isArray(val) && val.length > 0) return val.filter((x): x is string => typeof x === 'string');
  return null;
}

/**
 * Rezolvă un număr de proiect, slug sau URL oficial folosind exclusiv chei proprii ale indexului
 * (niciodată Object.prototype: „constructor”, „toString” etc. nu se potrivesc).
 */
export function resolveBillId(input: string, index: AliasIndex): BillIdResolution {
  const raw = input.trim();
  if (!raw) return { status: 'not_found', recognized: false };

  const parsedUrl = parseBillUrl(raw);
  if (parsedUrl) {
    const key = parsedUrl.kind === 'number' ? normalizeId(parsedUrl.value) : parsedUrl.kind === 'slug' ? normalizeId(parsedUrl.value) : parsedUrl.value;
    const hit = ownLookup(index, key);
    if (hit) return { status: 'found', slugs: hit, key };
    if (parsedUrl.kind === 'number') {
      const exactKey = normalizeIdExact(parsedUrl.value);
      const exactHit = ownLookup(index, exactKey);
      if (exactHit) return { status: 'found', slugs: exactHit, key: exactKey };
    }
    return { status: 'not_found', recognized: true };
  }

  // 1. Formă exactă cu dată completă (ex. L50/08.03.2021) înainte de forma fără zi/lună.
  const exactKey = normalizeIdExact(raw);
  const shortKey = normalizeId(raw);
  if (exactKey && exactKey !== shortKey) {
    const exactHit = ownLookup(index, exactKey);
    if (exactHit) return { status: 'found', slugs: exactHit, key: exactKey };
  }

  // 2. Formă normalizată standard (PL-x nr. 110/2026, B563/2026, plx-110-2026 etc.).
  const hit = ownLookup(index, shortKey);
  if (hit) return { status: 'found', slugs: hit, key: shortKey };

  // 3. Număr fără prefix („563/2026”): verifică B, L, PL-x, BP în index.
  const f = foldText(raw).trim();
  const bare = f.match(PREFIXLESS_NUMBER_RE);
  if (bare) {
    const [, num, year] = bare;
    const matches: string[] = [];
    for (const prefix of ['b', 'l', 'plx', 'bp']) {
      const found = ownLookup(index, `${prefix}${num}${year}`);
      if (found) {
        for (const s of found) if (!matches.includes(s)) matches.push(s);
      }
    }
    if (matches.length) return { status: 'found', slugs: matches, key: `${num}/${year}` };
    return { status: 'not_found', recognized: true };
  }

  return { status: 'not_found', recognized: isBillRef(raw) };
}

/**
 * Validează și convertește o dată (YYYY-MM-DD, DD-MM-YYYY, DD.MM.YYYY, DD/MM/YYYY) în YYYY-MM-DD.
 * Respinge date imposibile din calendar (ex. 30.02.2026, 2026-13-01).
 */
export function parseIsoDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.trim();
  let y: number;
  let m: number;
  let d: number;
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    y = Number(isoMatch[1]);
    m = Number(isoMatch[2]);
    d = Number(isoMatch[3]);
  } else {
    const dmyMatch = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (!dmyMatch) return null;
    d = Number(dmyMatch[1]);
    m = Number(dmyMatch[2]);
    y = Number(dmyMatch[3]);
  }
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Data curentă în fusul orar al României (Europe/Bucharest, EET/EEST corect la schimbarea orei). */
export function todayBucharest(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(now);
}

/** Adaugă N zile calendaristice la o dată YYYY-MM-DD. */
export function addCalendarDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Permite doar adrese oficiale ale Parlamentului României (@senat.ro sau @cdep.ro). */
export function isOfficialParliamentEmail(email: string): boolean {
  return /^[a-z0-9._+-]+@(senat|cdep)\.ro$/i.test(email.trim());
}
