// Lista cu filtre de pe /uitate: rândul compact (scris la build în /uitate/proiecte.json și folosit pentru prima pagină,
// randată pe server), filtrele, ordinea și adresa lor din #. Fără acces la fișiere: o folosește și browserul.
import type { BandKey, WaitKey, WaitingBill } from './uitate';

export interface ListRow {
  /** slug */
  s: string;
  /** număr („PL-x 39/2020”) */
  n: string;
  /** titlul, scurtat */
  t: string;
  /** pagina: „/camera/…”, „/legi/…” sau fișa de pe cdep.ro */
  h: string;
  /** înregistrat la Cameră (YYYY-MM-DD) */
  r: string;
  /** ultimul pas: data și eticheta; lipsesc când data nu e sigură */
  l: string | null;
  lk: string | null;
  /** zile fără pas (null = dată neconfirmată) și zile de la înregistrare */
  d: number | null;
  a: number;
  w: WaitKey;
  b: BandKey;
  /** comisiile sesizate pentru raport (numele scurte) */
  c: string[];
  /** 1 = Senatul n-a votat la termen (adoptare tacită); 1 = aprobă sau respinge o ordonanță; 1 = Guvernul */
  tc: 0 | 1;
  o: 0 | 1;
  g: 0 | 1;
  /** Camera decide la final: 1, prima cameră: 0, neclar: null */
  dc: 0 | 1 | null;
  /** pe ordinea de zi sub rezerva raportului */
  sr: 0 | 1;
}

/** Ce înseamnă „Senatul n-a votat la termen” (eticheta din listă și metodologia). */
export const TACIT_TEXT =
  'Senatul nu l-a votat în 45 de zile (60 pentru coduri), așa că se consideră adoptat de Senat (adoptare tacită, art. 75 din Constituție). Decizia finală e a Camerei, care nu are termen.';

const TITLE_MAX = 120;
const clip = (s: string) => (s.length <= TITLE_MAX ? s : `${s.slice(0, TITLE_MAX).replace(/[\s,;:]+\S*$/, '')}…`);

export function toListRow(b: WaitingBill): ListRow {
  return {
    s: b.slug,
    n: b.numar,
    t: clip(b.titlu),
    h: b.href,
    r: b.inregistrat,
    l: b.last?.date ?? null,
    lk: b.last?.label ?? null,
    d: b.days,
    a: b.totalDays,
    w: b.wait,
    b: b.band,
    c: b.comisii,
    tc: b.tacit ? 1 : 0,
    o: b.ordonanta ? 1 : 0,
    g: b.initiator === 'guvern' ? 1 : 0,
    dc: b.decizionala === null ? null : b.decizionala ? 1 : 0,
    sr: b.subRezerva ? 1 : 0,
  };
}

/**
 * Fișierul /uitate/proiecte.json, mai mic decât rândurile întregi: comisiile ca indici într-o listă comună, iar adresa
 * lipsește când e pagina obișnuită de la Cameră (/camera/<slug>).
 */
export interface ListFile {
  azi: string;
  comisii: string[];
  proiecte: (Omit<ListRow, 'c' | 'h'> & { c: number[]; h?: string })[];
}

export function packRows(rows: ListRow[], azi: string): ListFile {
  const comisii = [...new Set(rows.flatMap((r) => r.c))].sort((a, b) => a.localeCompare(b, 'ro'));
  const at = new Map(comisii.map((c, i) => [c, i]));
  return {
    azi,
    comisii,
    proiecte: rows.map(({ c, h, ...r }) => ({ ...r, c: c.map((x) => at.get(x)!), ...(h === `/camera/${r.s}` ? {} : { h }) })),
  };
}

export const unpackRows = (f: ListFile): ListRow[] => f.proiecte.map(({ c, h, ...r }) => ({ ...r, c: c.map((i) => f.comisii[i]), h: h ?? `/camera/${r.s}` }));

export type SortKey = 'zile' | 'noi' | 'vechi' | 'numar';
export const SORTS: { key: SortKey; label: string }[] = [
  { key: 'zile', label: 'Cele mai multe zile fără pas' },
  { key: 'vechi', label: 'Înregistrate cel mai demult' },
  { key: 'noi', label: 'Înregistrate cel mai recent' },
  { key: 'numar', label: 'După număr' },
];

export interface ListFilters {
  etapa: string;
  comisie: string;
  an: string;
  vechime: string;
  init: '' | 'guvern' | 'parlamentari';
  tacit: boolean;
  ord: boolean;
  q: string;
  ordine: SortKey;
  pe: 10 | 20;
  pag: number;
}

export const EMPTY: ListFilters = { etapa: '', comisie: '', an: '', vechime: '', init: '', tacit: false, ord: false, q: '', ordine: 'zile', pe: 10, pag: 1 };
/** Adresa listei: #proiecte, cu filtrele după „?” (ca să se poată trimite o vedere filtrată). */
export const LIST_ID = 'proiecte';

export function toHash(f: ListFilters): string {
  const q = new URLSearchParams();
  for (const k of ['etapa', 'comisie', 'an', 'vechime', 'init', 'q'] as const) if (f[k]) q.set(k, f[k]);
  if (f.tacit) q.set('tacit', '1');
  if (f.ord) q.set('ord', '1');
  if (f.ordine !== 'zile') q.set('ordine', f.ordine);
  if (f.pe !== 10) q.set('pe', String(f.pe));
  if (f.pag > 1) q.set('pag', String(f.pag));
  return `#${LIST_ID}${q.size ? `?${q}` : ''}`;
}

export function fromHash(hash: string): ListFilters | null {
  const h = decodeURIComponent(hash.replace(/^#/, '')).startsWith(LIST_ID) ? hash.replace(/^#/, '') : null;
  if (h === null) return null;
  const q = new URLSearchParams(h.slice(LIST_ID.length).replace(/^\?/, ''));
  const init = q.get('init');
  const ordine = q.get('ordine');
  return {
    etapa: q.get('etapa') ?? '',
    comisie: q.get('comisie') ?? '',
    an: q.get('an') ?? '',
    vechime: q.get('vechime') ?? '',
    init: init === 'guvern' || init === 'parlamentari' ? init : '',
    tacit: q.get('tacit') === '1',
    ord: q.get('ord') === '1',
    q: q.get('q') ?? '',
    ordine: SORTS.some((s) => s.key === ordine) ? (ordine as SortKey) : 'zile',
    pe: q.get('pe') === '20' ? 20 : 10,
    pag: Math.max(1, Number(q.get('pag')) || 1),
  };
}

export const isFiltered = (f: ListFilters) => !!(f.etapa || f.comisie || f.an || f.vechime || f.init || f.tacit || f.ord || f.q.trim());

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const num = (n: string) => {
  const m = n.match(/(\d+)\/(\d{4})/);
  return m ? Number(m[2]) * 100_000 + Number(m[1]) : 0;
};

// Un termen care începe cu o cifră („58/2020”) se potrivește doar de la începutul unui număr: altfel „58/2020” ar găsi și
// PL-x 158/2020.
const matches = (hay: string, term: string) =>
  /^\d/.test(term) ? new RegExp(`(^|\\D)${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(hay) : hay.includes(term);

export function applyFilters(rows: ListRow[], f: ListFilters): ListRow[] {
  const terms = plain(f.q.trim()).split(/\s+/).filter(Boolean);
  const out = rows.filter(
    (r) =>
      (!f.etapa || r.w === f.etapa) &&
      (!f.comisie || r.c.includes(f.comisie)) &&
      (!f.an || r.r.startsWith(f.an)) &&
      (!f.vechime || r.b === f.vechime) &&
      (!f.init || (f.init === 'guvern' ? r.g === 1 : r.g === 0)) &&
      (!f.tacit || r.tc === 1) &&
      (!f.ord || r.o === 1) &&
      (!terms.length || terms.every((t) => matches(plain(`${r.n} ${r.t}`), t))),
  );
  const by: Record<SortKey, (a: ListRow, b: ListRow) => number> = {
    zile: (a, b) => (b.d ?? -1) - (a.d ?? -1) || b.a - a.a,
    vechi: (a, b) => a.r.localeCompare(b.r) || num(a.n) - num(b.n),
    noi: (a, b) => b.r.localeCompare(a.r) || num(b.n) - num(a.n),
    numar: (a, b) => num(a.n) - num(b.n),
  };
  return out.sort(by[f.ordine]);
}
