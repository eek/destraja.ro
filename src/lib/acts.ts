// Actele normative pe care le modifică un proiect, citite din titlul lui oficial, fără model și fără rețea.
// „pentru modificarea Legii nr.51/1995 pentru organizarea și exercitarea profesiei de avocat” → lege-51-1995, cu numele
// scris după număr. Un proiect care aprobă o ordonanță o modifică și el („pentru aprobarea Ordonanței de urgență…”), deci
// o luăm și pe ea. Fără importuri: scriptul de verificare (ops/) îl rulează direct cu Node.

export type ActKind = 'lege' | 'oug' | 'og' | 'hg' | 'decret-lege' | 'decret';

export interface ActRef {
  /** „lege-51-1995”, „oug-81-2021”. */
  key: string;
  kind: ActKind;
  number: number;
  year: number;
  /** Numele scris după număr, curățat: „pentru organizarea și exercitarea profesiei de avocat”; null dacă lipsește. */
  name: string | null;
  /** Numele scris înaintea numărului, la nominativ: „Legea învățământului preuniversitar”. */
  prefixName: string | null;
}

/** Cum se cheamă actul la nominativ, înaintea numărului. */
export const KIND_LABEL: Record<ActKind, string> = {
  lege: 'Legea',
  oug: 'Ordonanța de urgență',
  og: 'Ordonanța Guvernului',
  hg: 'Hotărârea Guvernului',
  'decret-lege': 'Decretul-lege',
  decret: 'Decretul',
};

/** Codurile, numite des fără număr: „modificarea art.113 din Codul penal”. Numele scurt ține loc de titlu. */
export const CODES: { match: RegExp; kind: ActKind; number: number; year: number; short: string }[] = [
  { match: /\bcod(?:ul|ului)\s+fiscal\b/iu, kind: 'lege', number: 227, year: 2015, short: 'Codul fiscal' },
  { match: /\bcod(?:ul|ului)\s+de\s+procedur[ăa]\s+fiscal[ăa]/iu, kind: 'lege', number: 207, year: 2015, short: 'Codul de procedură fiscală' },
  { match: /\bcod(?:ul|ului)\s+civil\b/iu, kind: 'lege', number: 287, year: 2009, short: 'Codul civil' },
  { match: /\bcod(?:ul|ului)\s+penal\b/iu, kind: 'lege', number: 286, year: 2009, short: 'Codul penal' },
  { match: /\bcod(?:ul|ului)\s+de\s+procedur[ăa]\s+penal[ăa]/iu, kind: 'lege', number: 135, year: 2010, short: 'Codul de procedură penală' },
  { match: /\bcod(?:ul|ului)\s+de\s+procedur[ăa]\s+civil[ăa]/iu, kind: 'lege', number: 134, year: 2010, short: 'Codul de procedură civilă' },
  { match: /\bcod(?:ul|ului)\s+muncii\b/iu, kind: 'lege', number: 53, year: 2003, short: 'Codul muncii' },
  { match: /\bcod(?:ul|ului)\s+administrativ\b/iu, kind: 'oug', number: 57, year: 2019, short: 'Codul administrativ' },
];

export const actKey = (kind: ActKind, number: number, year: number) => `${kind}-${number}-${year}`;

/** Numele scurt al unui cod („Codul fiscal”), dacă actul e unul dintre ele. */
export const codeName = (key: string) => CODES.find((c) => actKey(c.kind, c.number, c.year) === key)?.short ?? null;

// Senatul scrie uneori cu sedilă (ţ, ş); titlurile de la Cameră, cu virgulă. Spațiile ne-sparte devin spații.
const normalise = (s: string) => s.replace(/ţ/g, 'ț').replace(/Ţ/g, 'Ț').replace(/ş/g, 'ș').replace(/Ş/g, 'Ș').replace(/\s+/g, ' ');

const MONTH = '(?:ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie)';
// „nr.51/1995”, „nr. 51 / 1995”, „nr.155 din 12 iulie 2010”, „nr.198 din 2023”; uneori fără „nr.”: „Legea 36/1995”.
const NUMBER = `(?:nr\\.?\\s*(?<nr>\\d{1,4})\\s*(?:\\/|din\\s+(?:\\d{1,2}\\s+${MONTH}\\s+)?)|(?<bare>\\d{1,4})\\s*\\/)\\s*(?<year>\\d{4})\\b`;
const HEADS: [string, ActKind][] = [
  ['Ordonanț(?:ei|a)\\s+de\\s+urgență(?:\\s+a\\s+Guvernului(?:\\s+României)?)?', 'oug'],
  // „Ordonanța nr.2/2001”, fără „Guvernului”: tot o ordonanță simplă.
  ['Ordonanț(?:ei|a)(?:\\s+Guvernului(?:\\s+României)?)?', 'og'],
  ['Hotărâr(?:ii|ea)\\s+Guvernului(?:\\s+României)?', 'hg'],
  ['Decret(?:ului|ul)-lege', 'decret-lege'],
  ['Decret(?:ului|ul)', 'decret'],
  ['Leg(?:ii|ea)(?:-cadru)?', 'lege'],
];
// Între cuvântul „Legii” și număr poate sta numele legii („Legii învățământului preuniversitar nr.198/2023”, „Legii privind
// Codul fiscal nr.227/2015”), dar nu alt act, cifre sau virgule.
const MID = '(?<mid>(?:\\s+(?!nr\\b)(?!Leg(?:ii|ea)\\b)(?!Ordonanț)(?!Hotărâr)(?!Decret)[^\\s\\d,;()]+){0,8}?)';
const FULL = new RegExp(`\\b(?<head>${HEADS.map(([h]) => `(?:${h})`).join('|')})${MID}\\s+${NUMBER}`, 'giu');
// Prescurtările, scrise cu majuscule: „OUG 57/2019”, „O.U.G. nr. 57/2019”, „HG nr. 1/2020”.
const ABBR = /\b(?<abbr>OUG|O\.U\.G\.|OG|O\.G\.|HG|H\.G\.)\s*(?:nr\.?\s*)?(?<nr>\d{1,4})\s*\/\s*(?<year>\d{4})\b/gu;
const ABBR_KIND: Record<string, ActKind> = { OUG: 'oug', 'O.U.G.': 'oug', OG: 'og', 'O.G.': 'og', HG: 'hg', 'H.G.': 'hg' };

const VIA = /(?:aprobat|modificat|completat)[ăe]?(?:\s+(?:cu|și)\s+(?:modificări|completări|modificat[ăe]?|completat[ăe]?)(?:\s+și\s+completări)?)?\s+prin\s*$/iu;

function headKind(head: string): ActKind {
  for (const [re, kind] of HEADS) if (new RegExp(`^(?:${re})$`, 'iu').test(head)) return kind;
  return 'lege';
}

// Numele se termină unde începe altceva: o virgulă, un alt act, „precum și”, „cu modificările…”, „republicată”.
const NAME_STOP = new RegExp(
  [
    // Virgula închide numele, afară de o enumerare cu literă mică: „Codul amenajării teritoriului, urbanismului și construcțiilor”.
    ',(?!\\s*(?!(?:republicat|publicat|aprobat|modificat|completat|cu|în|prin|astfel|iar|care|inclusiv|precum|respectiv|ca|potrivit|conform|pentru|privind|art)\\p{L}*(?!\\p{L}))\\p{Ll}{3,})',
    '[;()]',
    '\\s+(?:precum\\s+și|cum\\s+și)\\b',
    // „și a Legii…”, „și pentru…”; dar „privind alegerea Senatului și a Camerei Deputaților” rămâne întreg.
    '(?<!modificarea|completarea)\\s+și\\s+(?:a\\s+|al\\s+|ale\\s+)?(?:(?:pentru|privind|completarea|modificarea|abrogarea|aprobarea|unor|altor|art)(?!\\p{L})|Leg(?:ii|ea|ilor)|Ordonanț|Hotărâr|Decret|Cod)',
    '\\s+(?:cu\\s+modificările|republicat|în\\s+sensul|în\\s+vederea|în\\s+scopul|în\\s+ceea\\s+ce)',
    '\\s+[-–—]\\s+',
    '\\s+din\\s+\\d',
  ].join('|'),
  'iu',
);
const NAME_START = /^(?:privind|pentru|cu\s+privire\s+la|asupra|referitoare\s+la|a|al|[-–—]|Codul)\s/iu;

/** Numele scris după referință, dacă e curat: începe cu „privind”, „pentru”, „a”…, nu trimite la alt act și nu e prea lung. */
function nameAfter(rest: string): string | null {
  let s = rest.replace(/^\s*,?\s*(?:republicat[ăa]?\s*,?\s*)?/iu, '');
  if (/^[-–—]\s*Cod/iu.test(s)) s = s.replace(/^[-–—]\s*/u, '– ');
  else if (/^Cod(?:ul)?\s/iu.test(s)) s = `– ${s}`;
  if (!NAME_START.test(s) && !s.startsWith('– ')) return null;
  const head = s.startsWith('– ') ? '– ' : '';
  const body = s.slice(head.length);
  const stop = body.slice(1).search(NAME_STOP);
  let name = (head + (stop < 0 ? body : body.slice(0, stop + 1))).trim().replace(/\.$/, '');
  // O enumerare prea lungă: păstrăm doar până la prima virgulă.
  if (name.length > 160 && name.includes(',')) name = name.slice(0, name.indexOf(',')).trim();
  if (name.length < 8 || name.length > 160) return null;
  if (/\bnr\.|\bart\.|\balin\./iu.test(name)) return null;
  // Doar „pentru” sau „privind”, fără nimic după: numele s-a rupt.
  if (name.split(/\s+/).length < 2) return null;
  return name;
}

/** Numele dintre „Legii” și număr, la nominativ; „privind Codul fiscal” e un nume de după, nu de dinainte. */
function prefixName(kind: ActKind, mid: string): { prefix: string | null; after: string | null } {
  const m = mid.trim();
  if (!m) return { prefix: null, after: null };
  if (NAME_START.test(`${m} `) || /^(?:privind|pentru)\b/iu.test(m)) return { prefix: null, after: m };
  // „Legii învățământului preuniversitar” → „Legea învățământului preuniversitar”; numele rămâne în genitiv, cum e scris.
  if (kind !== 'lege' || !/^\p{Ll}/u.test(m)) return { prefix: null, after: null };
  return { prefix: `Legea ${m}`, after: null };
}

/** Actele pe care le modifică (sau le aprobă) proiectul, în ordinea din titlu, fără dubluri. */
export function extractActs(rawTitle: string): ActRef[] {
  const title = normalise(rawTitle);
  const found: (ActRef & { at: number })[] = [];
  const add = (ref: ActRef, at: number) => {
    const old = found.find((f) => f.key === ref.key);
    if (!old) return void found.push({ ...ref, at });
    old.name ??= ref.name;
    old.prefixName ??= ref.prefixName;
  };

  for (const m of title.matchAll(FULL)) {
    const g = m.groups!;
    const kind = headKind(g.head);
    const number = Number(g.nr ?? g.bare);
    const year = Number(g.year);
    if (!number || year < 1860 || year > 2100) continue;
    // „Ordonanța … nr.155/2024 …, aprobată cu modificări prin Legea nr.124/2025”: legea de aprobare nu e modificată.
    if (VIA.test(title.slice(Math.max(0, m.index! - 70), m.index!))) continue;
    const { prefix, after } = prefixName(kind, g.mid ?? '');
    const name = after ? (nameAfter(after) ?? after) : nameAfter(title.slice(m.index! + m[0].length));
    add({ key: actKey(kind, number, year), kind, number, year, name, prefixName: prefix }, m.index!);
  }
  for (const m of title.matchAll(ABBR)) {
    const g = m.groups!;
    const kind = ABBR_KIND[g.abbr];
    add({ key: actKey(kind, +g.nr, +g.year), kind, number: +g.nr, year: +g.year, name: nameAfter(title.slice(m.index! + m[0].length)), prefixName: null }, m.index!);
  }
  for (const c of CODES) {
    const m = title.match(c.match);
    if (m) add({ key: actKey(c.kind, c.number, c.year), kind: c.kind, number: c.number, year: c.year, name: null, prefixName: null }, m.index!);
  }
  return found.sort((a, b) => a.at - b.at).map(({ at: _, ...r }) => r);
}

/**
 * Cum scriem actul deasupra grupului: „Codul fiscal (Legea nr. 227/2015)”, „Legea învățământului preuniversitar
 * nr. 198/2023”, „Legea nr. 51/1995 pentru organizarea și exercitarea profesiei de avocat”.
 */
export function actLabel(ref: Pick<ActRef, 'key' | 'kind' | 'number' | 'year'>, name: string | null, prefix: string | null) {
  const nr = `nr. ${ref.number}/${ref.year}`;
  const code = codeName(ref.key);
  if (code) return { title: code, detail: `${KIND_LABEL[ref.kind]} ${nr}`, code: true };
  if (prefix) return { title: `${prefix} ${nr}`, detail: null, code: false };
  return { title: `${KIND_LABEL[ref.kind]} ${nr}`, detail: name, code: false };
}
