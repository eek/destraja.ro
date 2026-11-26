// Trimiterile la articole de pe pagina unui proiect (data/citari/<slug>.json, scripts/straja-citari.mjs): tipurile
// fișierului și extragerea unui alineat sau a unei litere din textul unui articol. Fără importuri de Node: modulul
// rulează și în browser (popover-ul), și la build, și în script.

/** O formă a proiectului: a inițiatorului, adoptată de Senat, adoptată de Cameră. */
export type CiteForm = 'initiator' | 'senat' | 'camera';

export const FORM_LABEL: Record<CiteForm, string> = {
  initiator: 'forma inițiatorului',
  senat: 'forma adoptată de Senat',
  camera: 'forma adoptată de Camera Deputaților',
};

/** Un articol (sau o anexă) al actului modificat, cum era în forma consolidată folosită de analiză. */
export interface CiteUnit {
  label: string;
  /** Denumirea marginală („Definiția microîntreprinderii”), dacă are. */
  title?: string;
  /** Textul, rând cu rând: „(1) …”, „a) …”. Notele portalului sunt scoase. */
  text: string;
  /** De unde e textul: din baza analizei (data/baseline) sau din API-ul destraja.ro/acte, la aceeași dată. */
  src: 'baseline' | 'acte';
  /** Articolul arată altfel în forma cea mai nouă (doar când există una mai nouă și am comparat-o). */
  changed?: boolean;
  /** Textul a fost tăiat (anexele lungi). */
  cut?: boolean;
}

export interface CiteAct {
  /** „LEGE 227/2015”, ca în data/baseline. */
  key: string;
  /** „Legea nr. 227/2015”. */
  cite: string;
  /** Numele scurt, dacă actul e un cod („Codul fiscal”). */
  name?: string;
  /** Formele flexionate ale numelui, pentru recunoașterea în text („Codul fiscal”, „Codului fiscal”). */
  aliases?: string[];
  /** Actul are text la noi (pe portal și pe destraja.ro/acte). */
  available: boolean;
  portalId?: number;
  portalUrl?: string;
  /** Slugul de pe destraja.ro/acte („cod-fiscal-2015”). */
  acte?: string;
  /** Ziua formei folosite (AAAA-LL-ZZ): când a citit analiza textul consolidat. */
  asOf?: string;
  /** De când e în vigoare forma de la `asOf`, după destraja.ro/acte. */
  formFrom?: string;
  /** De când e în vigoare cea mai nouă formă, dacă e mai nouă decât cea folosită. */
  newerFrom?: string;
  units: Record<string, CiteUnit>;
}

/** O unitate a proiectului însuși („Art. I pct. 3”), într-o formă. */
export interface OwnUnit {
  label: string;
  text: string;
  /** Actul modificat de articolul din care face parte (indice în `acts`). */
  act?: number;
  /** Trimiterile din instrucțiune („La articolul 54, alineatele (3) și (4) se abrogă”), rezolvate la actul modificat. */
  refs?: { act: number; ids: string[]; label: string }[];
  cut?: boolean;
}

export interface CiteFile {
  v: 1;
  slug: string;
  billId: string;
  /** Cum își numerotează proiectul articolele: romane (lege de modificare), arabe (lege nouă) sau articol unic. */
  numbering: 'roman' | 'arabic' | 'unic' | null;
  /** Lege de aprobare a unei ordonanțe: „art. 3” poate fi al ordonanței, deci nu ghicim actul. */
  approval: boolean;
  /** Formele analizate: a analizei (și a „Ce e bine și ce strică”) și cea primită de Cameră (avize, raport). */
  forms: { analysis: CiteForm | null; balance: CiteForm | null; review: CiteForm | null };
  /** Legăturile spre destraja.ro/acte pot ținti alineatul și litera (altfel doar articolul). */
  deepAnchors: boolean;
  acts: CiteAct[];
  own: Partial<Record<CiteForm, Record<string, OwnUnit>>>;
}

// ─── Text ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const SUPERSCRIPT: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
/** „5¹”, „5 ^ 1” → „5^1”. */
export const supNorm = (s: string) =>
  s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (m) => `^${[...m].map((c) => SUPERSCRIPT[c]).join('')}`).replace(/\s*\^\s*/g, '^');

/** Un segment de id: litere mici, cifre și „^” (contract §4.3). */
export const idPart = (s: string) => supNorm(s).toLowerCase().replace(/[^a-z0-9^]+/g, '');

const ALIN_LINE = /^\((\d+(?:\^\d+)?)\)\s?/;
const LIT_LINE = /^([a-z](?:\^\d+)?)\)\s/;
const PCT_LINE = /^(\d+(?:\^\d+)?)\.\s/;

interface Node {
  id: string;
  lines: string[];
  children: Node[];
}

/**
 * Structura unui articol din rândurile lui: alineate „(1)”, litere „a)”, puncte „1.”. Literele stau sub alineatul
 * dinainte (sau direct sub articol), punctele sub litera sau alineatul dinainte. Rândurile fără marcaj continuă unitatea
 * curentă (notele, frazele de după enumerare).
 */
function structure(text: string): Node {
  const root: Node = { id: '', lines: [], children: [] };
  let alin: Node | null = null;
  let lit: Node | null = null;
  let pct: Node | null = null;
  for (const line of text.split('\n')) {
    const l = line.trim();
    if (!l) continue;
    let m;
    if ((m = ALIN_LINE.exec(l))) {
      alin = { id: `alin-${m[1]}`, lines: [l], children: [] };
      root.children.push(alin);
      lit = pct = null;
    } else if ((m = LIT_LINE.exec(l))) {
      lit = { id: `lit-${m[1]}`, lines: [l], children: [] };
      (alin ?? root).children.push(lit);
      pct = null;
    } else if ((m = PCT_LINE.exec(l)) && (lit || alin)) {
      pct = { id: `pct-${m[1]}`, lines: [l], children: [] };
      (lit ?? alin)!.children.push(pct);
    } else {
      (pct ?? lit ?? alin ?? root).lines.push(l);
    }
  }
  return root;
}

const flatten = (n: Node): string[] => [...n.lines, ...n.children.flatMap(flatten)];

/** Toate nodurile cu un anumit segment, oriunde sub `n` (pentru „lit. c)” fără alineat). */
function findAll(n: Node, seg: string): Node[] {
  return n.children.flatMap((c) => (c.id === seg ? [c] : findAll(c, seg)));
}

export type Extract =
  | { ok: true; text: string; whole: false }
  | { ok: true; text: string; whole: true; why: 'missing' | 'ambiguous' | null };

/**
 * Textul unei unități dintr-un articol, după calea de sub articol (`["alin-3"]`, `["alin-1", "lit-c"]`, `[]` = tot
 * articolul). Dacă unitatea nu se găsește sau apare în mai multe locuri („lit. c)” fără alineat, când două alineate au
 * litera c), întoarce tot articolul și spune de ce: nu ghicim.
 */
export function extract(unit: Pick<CiteUnit, 'text'>, path: string[]): Extract {
  if (!path.length) return { ok: true, text: unit.text, whole: true, why: null };
  const root = structure(unit.text);
  let cur: Node[] = [root];
  for (let i = 0; i < path.length; i++) {
    const seg = path[i];
    const direct = cur.flatMap((n) => n.children.filter((c) => c.id === seg));
    // Primul segment poate sări alineatul („art. 47 lit. c)”): îl căutăm oriunde, dar doar dacă e unic.
    const found = direct.length ? direct : i === 0 && !seg.startsWith('alin-') ? findAll(root, seg) : [];
    if (!found.length) return { ok: true, text: unit.text, whole: true, why: 'missing' };
    if (found.length > 1) return { ok: true, text: unit.text, whole: true, why: 'ambiguous' };
    cur = found;
  }
  return { ok: true, text: flatten(cur[0]).join('\n'), whole: false };
}

/** „art-54/alin-3” → [„art-54”, [„alin-3”]]. */
export const splitId = (id: string): [string, string[]] => {
  const [top, ...rest] = id.split('/');
  return [top, rest];
};

const SEG_NAME: Record<string, [string, string]> = { alin: ['alin.', 'alineatul'], lit: ['lit.', 'litera'], pct: ['pct.', 'punctul'] };

/** Eticheta unei căi: „art-54/alin-3/lit-b” → „art. 54 alin. (3) lit. b)”. */
export function idLabel(id: string): string {
  return id
    .split('/')
    .map((seg) => {
      const [kind, ...v] = seg.split('-');
      const val = v.join('-');
      if (kind === 'art') return val === 'unic' ? 'articolul unic' : `art. ${/^[ivxl]+(\^\d+)?$/.test(val) ? val.toUpperCase() : val}`;
      if (kind === 'anexa') return val ? `anexa nr. ${val}` : 'anexa';
      if (kind === 'alin') return `alin. (${val})`;
      if (kind === 'lit') return `lit. ${val})`;
      if (kind === 'pct') return `pct. ${val}`;
      return SEG_NAME[kind]?.[0] ?? seg;
    })
    .join(' ');
}

/** Ancora de pe destraja.ro/acte: doar articolul, dacă serverul n-are încă ancore pentru alineate. */
export function anchorFor(id: string, deep: boolean) {
  const target = deep ? id : id.split('/')[0];
  return `#${encodeURIComponent(target).replace(/%2F/g, '/').replace(/%5E/g, '^')}`;
}

/** „2026-11-19” → „19 noiembrie 2026”. */
const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
export const dayRo = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
