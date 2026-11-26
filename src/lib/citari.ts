// Trimiterile la articole dintr-un text („art. 54 alin. (3)”, „articolul 47, litera c)”, „anexa nr. 2”, „art. I pct.
// 3”): unde sunt în text și la ce act duc. Același cod rulează la build (paginile), în scriptul care adună textele
// (scripts/straja-citari.mjs) și în teste; fără importuri de Node.
//
// Regula de bază: nu ghicim. O trimitere duce la actul modificat doar când e limpede care e: actul e numit chiar după
// ea („din Legea nr. 227/2015”, „din Codul fiscal”), e numit înaintea ei în același text, ea stă într-un punct al
// proiectului care modifică acel act, sau proiectul modifică un singur act și textul nu a pomenit între timp alt act
// (Constituția, o directivă, altă lege). Orice altceva rămâne text simplu.

import { type CiteFile, type CiteForm, idPart, supNorm } from './citari-text';

const SUPC = String.raw`(?:\s*\^\s*\d+|[⁰¹²³⁴⁵⁶⁷⁸⁹]+)`;
const LSEP = String.raw`\s*(?:,|și|şi|sau|ori|respectiv)\s*`;
const RANGE = String.raw`\s*[-–]\s*`;

// Cuvântul „articol” și forma lui; numărul îl citim separat, ca să știm dacă e arab, roman sau „unic”.
const ART_KW = /(?<![\p{L}\d])(?:art(?:icol(?:ului|ul|elor|ele|e)?)?\.?)\s*/giu;
const ANEXA_KW = /(?<![\p{L}\d])anex(?:a|ei|ele|elor|ă)\s+(?:nr\.\s*)?/giu;
const ROMAN = new RegExp(String.raw`([IVXL]+)(${SUPC})?(?![\p{L}\d])`, 'uy');
const UNIC = /unic(?![\p{L}])/iuy;
// „1.270” (Codul civil) e articolul 1270; „227/2015”, „5%”, „4,5” nu sunt articole.
const ARABIC = new RegExp(String.raw`(\d{1,3}(?:\.\d{3})+|\d{1,4})(${SUPC})?(?![\d/%]|[.,]\d|\s*\/\s*\d)`, 'uy');

const ALIN_KW = /\s*,?\s*alin(?:eat(?:ului|ul|elor|ele)?)?\.?\s*/iuy;
const LIT_KW = /\s*,?\s*lit(?:er(?:elor|ele|ei|a))?\.?\s*/iuy;
const PCT_KW = /\s*,?\s*(?:pct\.?|punct(?:ului|ul|elor|ele))\s*/iuy;
const PAR = new RegExp(String.raw`\(\s*(\d{1,3}${SUPC}?)\s*\)`, 'uy');
const PAR_BARE = new RegExp(String.raw`(\d{1,3}${SUPC}?)(?![\d/%]|[.,]\d)`, 'uy');
const LET = new RegExp(String.raw`([a-z]${SUPC}?)\)`, 'uy');
const PT = new RegExp(String.raw`(\d{1,3}${SUPC}?)(?![\d/%]|[.,]\d)`, 'uy');
const SEP = new RegExp(`(${LSEP}|${RANGE})`, 'uy');
// Un număr gol după listă e alt articol („art. 47, 52 și 54”) doar dacă nu e o sumă, o durată sau un an.
const NEXT_ART = new RegExp(String.raw`${LSEP}(?:art(?:icol(?:ul|ele)?)?\.?\s*)?(\d{1,4})(${SUPC})?(?=\s*(?:[,;.)]|și|sau|alin|lit|din|al\b|$))`, 'iuy');

const sticky = (re: RegExp, s: string, at: number) => {
  re.lastIndex = at;
  return re.exec(s);
};

const ROMAN_VAL: Record<string, number> = { I: 1, V: 5, X: 10, L: 50 };
export function romanValue(r: string) {
  let n = 0;
  for (let i = 0; i < r.length; i++) {
    const v = ROMAN_VAL[r[i]];
    const next = ROMAN_VAL[r[i + 1]] ?? 0;
    n += v < next ? -v : v;
  }
  return n;
}

export interface RawRef {
  start: number;
  end: number;
  kind: 'art' | 'anexa';
  /** Numărul articolului ca segment de id: „54”, „5^1”, „i”, „unic”. */
  num: string;
  roman: boolean;
  /** Căile de sub articol: [] = tot articolul, [„alin-3”], [„alin-1”, „lit-c”]. */
  paths: string[][];
}

/** O listă „(3) și (4)”, „f)-i)”, „1, 2 și 3”; intervalele se desfac. */
function list(s: string, at: number, item: RegExp, first: RegExp = item): { values: string[]; end: number } | null {
  const m = sticky(first, s, at);
  if (!m) return null;
  const values = [supNorm(m[1])];
  let end = m.index + m[0].length;
  for (;;) {
    const sep = sticky(SEP, s, end);
    if (!sep) break;
    const n = sticky(item, s, sep.index + sep[0].length);
    if (!n) break;
    const v = supNorm(n[1]);
    if (/[-–]/.test(sep[1])) {
      const from = values[values.length - 1];
      const a = /^\d+$/.test(from) ? Number(from) : from.length === 1 ? from.charCodeAt(0) : NaN;
      const b = /^\d+$/.test(v) ? Number(v) : v.length === 1 ? v.charCodeAt(0) : NaN;
      if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a || b - a > 30) break;
      const letters = !/^\d+$/.test(from);
      for (let x = a + 1; x <= b; x++) values.push(letters ? String.fromCharCode(x) : String(x));
    } else values.push(v);
    end = n.index + n[0].length;
  }
  return { values, end };
}

type Group = { alin: string[]; lit: string[]; pct: string[] };

/** Alineatele, literele și punctele de după numărul articolului; „și alin. (3)” deschide alt grup sub același articol. */
function subChain(s: string, at: number): { groups: Group[]; end: number } {
  const groups: Group[] = [];
  let end = at;
  for (let g = 0; g < 4; g++) {
    const grp: Group = { alin: [], lit: [], pct: [] };
    let pos = end;
    if (g > 0) {
      const sep = sticky(new RegExp(LSEP, 'uy'), s, pos);
      if (!sep) break;
      pos = sep.index + sep[0].length;
    }
    let k;
    if ((k = sticky(ALIN_KW, s, pos))) {
      const l = list(s, k.index + k[0].length, PAR, PAR) ?? list(s, k.index + k[0].length, PAR_BARE);
      if (l) {
        grp.alin = l.values;
        pos = l.end;
      }
    }
    if ((k = sticky(LIT_KW, s, pos))) {
      const l = list(s, k.index + k[0].length, LET);
      if (l) {
        grp.lit = l.values;
        pos = l.end;
      }
    }
    if ((k = sticky(PCT_KW, s, pos))) {
      const l = list(s, k.index + k[0].length, PT);
      if (l) {
        grp.pct = l.values;
        pos = l.end;
      }
    }
    if (!grp.alin.length && !grp.lit.length && !grp.pct.length) break;
    // Un grup nou trebuie să înceapă cu alineatul sau litera: „, pct. 3” după un articol roman e tot primul grup.
    groups.push(grp);
    end = pos;
  }
  return { groups, end };
}

// Unitățile scrise înaintea articolului: „litera c) a alineatului (1) al articolului 47”, „alin. (3) din art. 54”.
const PRE_LIT = String.raw`lit(?:er(?:elor|ele|ei|a))?\.?\s*([a-z]${SUPC}?\)(?:(?:${LSEP}|${RANGE})[a-z]${SUPC}?\))*)`;
const PRE_ALIN = String.raw`alin(?:eat(?:ului|ul|elor|ele)?)?\.?\s*(\(\s*\d{1,3}${SUPC}?\s*\)(?:(?:${LSEP}|${RANGE})\(\s*\d{1,3}${SUPC}?\s*\))*)`;
const PRE_PCT = String.raw`(?:pct\.?|punct(?:ului|ul|elor|ele))\s*(\d{1,3}${SUPC}?(?:${LSEP}\d{1,3}${SUPC}?)*)`;
const LINKW = String.raw`(?:al|a|ale|din|de\s+la)`;
const PREFIX = new RegExp(
  String.raw`(?<![\p{L}])(?:${PRE_LIT}\s*,?\s*(?:${LINKW}\s+)?)?(?:${PRE_ALIN}\s*,?\s*(?:${LINKW}\s+)?)?(?:${PRE_PCT}\s*,?\s*)?${LINKW}\s+$`,
  'iu',
);

function prefixAt(s: string, start: number): { start: number; alin: string[]; lit: string[]; pct: string[] } | null {
  const from = Math.max(0, start - 160);
  const m = PREFIX.exec(s.slice(from, start));
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  const vals = (raw: string | undefined, item: RegExp) => (raw ? (list(raw, 0, item)?.values ?? []) : []);
  return { start: from + m.index, lit: vals(m[1], LET), alin: vals(m[2], PAR), pct: vals(m[3], PT) };
}

function pathsOf(groups: Group[], pre: { alin: string[]; lit: string[]; pct: string[] } | null): string[][] {
  const all = groups.length ? groups : [{ alin: [], lit: [], pct: [] }];
  const out: string[][] = [];
  for (const g of all) {
    const alin = g.alin.length ? g.alin : (pre?.alin ?? []);
    const lit = g.lit.length ? g.lit : (pre?.lit ?? []);
    const pct = g.pct.length ? g.pct : (pre?.pct ?? []);
    for (const a of alin.length ? alin : [null])
      for (const l of lit.length ? lit : [null])
        for (const p of pct.length ? pct : [null])
          out.push([a && `alin-${idPart(a)}`, l && `lit-${idPart(l)}`, p && `pct-${idPart(p)}`].filter((x): x is string => Boolean(x)));
  }
  return out;
}

/** Toate trimiterile la articole și anexe din text, în ordine, fără suprapuneri. */
export function findRefs(text: string): RawRef[] {
  const refs: RawRef[] = [];
  const s = text;
  ART_KW.lastIndex = 0;
  for (let m = ART_KW.exec(s); m; m = ART_KW.exec(s)) {
    if (refs.length && m.index < refs[refs.length - 1].end) continue;
    const at = m.index + m[0].length;
    let num: string | null = null;
    let roman = false;
    let end = at;
    let n;
    if ((n = sticky(ROMAN, s, at))) {
      num = `${n[1].toLowerCase()}${n[2] ? supNorm(n[2]) : ''}`;
      roman = true;
      end = n.index + n[0].length;
    } else if ((n = sticky(UNIC, s, at))) {
      num = 'unic';
      roman = true;
      end = n.index + n[0].length;
    } else if ((n = sticky(ARABIC, s, at))) {
      num = `${n[1].replace(/\./g, '')}${n[2] ? supNorm(n[2]) : ''}`;
      end = n.index + n[0].length;
    }
    // „art” fără punct cere cifre imediat („art 183”); „Art. I” cere punctul sau cuvântul întreg.
    if (!num || (roman && /^art\s*$/i.test(m[0]))) continue;
    const found = prefixAt(s, m.index);
    const pre = found && (!refs.length || found.start >= refs[refs.length - 1].end) ? found : null;
    const chain = subChain(s, end);
    refs.push({ start: pre?.start ?? m.index, end: chain.end, kind: 'art', num, roman, paths: pathsOf(chain.groups, pre) });
    // „art. 47, 52 și 54”: numerele goale de după listă sunt articole noi, fiecare cu trimiterea lui.
    let pos = chain.end;
    while (!roman) {
      const next = sticky(NEXT_ART, s, pos);
      if (!next) break;
      const kw = next[0].search(/art/i);
      const numStart = next.index + (kw >= 0 ? kw : next[0].search(/\d/));
      const sub = subChain(s, next.index + next[0].length);
      refs.push({ start: numStart, end: sub.end, kind: 'art', num: `${next[1]}${next[2] ? supNorm(next[2]) : ''}`, roman: false, paths: pathsOf(sub.groups, null) });
      pos = sub.end;
      ART_KW.lastIndex = pos;
    }
    ART_KW.lastIndex = Math.max(ART_KW.lastIndex, pos);
  }
  ANEXA_KW.lastIndex = 0;
  for (let m = ANEXA_KW.exec(s); m; m = ANEXA_KW.exec(s)) {
    const n = sticky(ARABIC, s, m.index + m[0].length);
    if (!n) continue;
    const start = m.index;
    const end = n.index + n[0].length;
    if (refs.some((r) => start < r.end && end > r.start)) continue;
    refs.push({ start, end, kind: 'anexa', num: `${n[1]}${n[2] ? supNorm(n[2]) : ''}`, roman: false, paths: [[]] });
  }
  return refs.sort((a, b) => a.start - b.start);
}

export const topId = (r: Pick<RawRef, 'kind' | 'num'>) => (r.kind === 'anexa' ? `anexa-${idPart(r.num)}` : `art-${idPart(r.num)}`);
export const refIds = (r: RawRef) => r.paths.map((p) => [topId(r), ...p].join('/'));

// ─── Actele numite în text ────────────────────────────────────────────────────────────────────────────────────────

// Aceeași formă a citării ca în scripts/lib/baseline.mjs (ACT): „Legea nr. 227/2015”, „Legea 200/2006”, „OUG nr.
// 57/2019”, „Ordonanța de urgență a Guvernului nr. 8 din 24 februarie 2026”, „H.G. nr. 1/2016”.
const ORD = String.raw`Ordonan[țţ](?:a|ei|[ăa])`;
const ACT = String.raw`\b(?<kind>Leg(?:ea|ii)(?:-cadru)?|${ORD}\s+de\s+urgen[țţ][ăa](?:\s+a\s+Guv\p{L}+)?|${ORD}\s+(?:a\s+)?Guv\p{L}+|${ORD}(?=\s+nr)|Hot[ăa]r[âa]r(?:ea|ii)\s+(?:a\s+)?Guv\p{L}+|Decret(?:ul|ului)-lege|O\.?U\.?G\.?|O\.?G\.?|H\.?G\.?)(?:\s+[^\s,;.()\d]+){0,6}?\s+(?:(?:nr\.?\s*){1,2}(?<numar>\d{1,4})(?:\s*\/\s*(?<an>(?:19|20)\d{2})|\s+din\s+(?:\d{1,2}\s+\p{L}+\s+)?(?<an2>(?:19|20)\d{2}))|(?<numar2>\d{1,4})\s*\/\s*(?<an3>(?:19|20)\d{2}))\b`;
// Alte acte, care nu sunt modificate de proiect: o trimitere la ele nu e niciodată a noastră.
const OTHER =
  /(?<![\p{L}])(?:Constitu[țţ]i(?:e|a|ei)(?![\p{L}])|CCR\b|Cur[țţ]i[il]?\s+Constitu|Curtea\s+Constitu|(?:ne)?constitu[țţ]ional\p{L}*|Directiv(?:elor|ele|ei|a)\s+(?:\(UE\)|\(CE\)|UE|CE|nr\.|\d)|Regulament(?:ul|ului)\s+(?:\(UE\)|\(CE\)|UE|CE|delegat|de\s+punere|nr\.\s*\d)|TFUE|Tratatul|Conven[țţ]i(?:a|ei)\s+(?:europeană|pentru|privind|ONU|de\s+la)|Cart(?:a|ei)\s+(?:drepturilor|european[ăe]|social[ăe])|Decizi(?:a|ei)\s+(?:CCR\s+)?nr\.\s*\d)/giu;
// Un act numit generic, imediat după trimitere („din lege”, „din proiect”, „al Codului penal”): tot alt act, sau neclar.
const GENERIC = /(?:Leg(?:ea|ii|e)\b|Cod(?:ul|ului)\b|Constitu[țţ]i|Cart(?:a|ei)\b|Conven[țţ]i|Tratat|Directiv|Decizi|Pact(?:ul|ului)\b|Ordonan[țţ]|Hot[ăa]r[âa]r|Ordin(?:ul|ului)\b|Norm(?:ele|elor)\b|Regulament|proiect|prezent(?:a|ei)\s+leg|O\.?U\.?G\b|H\.?G\b|O\.?G\b|Decret)/iuy;

function tipAct(kind: string) {
  const k = kind.toLowerCase();
  if (/urgen|^o\.?u/.test(k)) return 'ORDONANȚĂ DE URGENȚĂ';
  if (/^ordonan|^o\.?g/.test(k)) return 'ORDONANȚĂ';
  if (/^hot|^h\.?g/.test(k)) return 'HOTĂRÂRE';
  if (/^decret/.test(k)) return 'DECRET-LEGE';
  return 'LEGE';
}

/** Forma flexionată a numelui unui cod: „Codul fiscal” → /Cod(?:ul|ului)\s+fiscal/. */
export function aliasPattern(name: string) {
  const rest = name.replace(/^Cod(?:ul|ului)?\s+/i, '');
  const words = rest
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[șş]/gi, '[șş]').replace(/[țţ]/gi, '[țţ]').replace(/[ăâ]/gi, '[ăâa]').replace(/î/gi, '[îi]'));
  return String.raw`Cod(?:ul|ului)\s+${words.join(String.raw`\s+`)}(?![\p{L}])`;
}

export interface Mention {
  start: number;
  end: number;
  /** Indicele actului din `acts`, sau „other” pentru un act pe care proiectul nu-l modifică. */
  act: number | 'other';
}

type ActLike = Pick<CiteFile['acts'][number], 'key' | 'aliases'>;

/** Actele numite în text (cu număr, prin numele codului, Constituția, actele UE), cu poziția lor. */
export function findMentions(text: string, acts: ActLike[]): Mention[] {
  const out: Mention[] = [];
  const byKey = new Map(acts.map((a, i) => [a.key, i]));
  for (const m of text.matchAll(new RegExp(ACT, 'giu'))) {
    const g = m.groups!;
    const key = `${tipAct(g.kind)} ${g.numar ?? g.numar2}/${g.an ?? g.an2 ?? g.an3}`;
    // „aprobată prin Legea nr. 55/2024” e legea de aprobare, nu actul: tot alt act decât cel modificat, dacă nu e el.
    out.push({ start: m.index!, end: m.index! + m[0].length, act: byKey.get(key) ?? 'other' });
  }
  acts.forEach((a, i) => {
    for (const name of a.aliases ?? []) {
      for (const m of text.matchAll(new RegExp(aliasPattern(name), 'giu'))) out.push({ start: m.index!, end: m.index! + m[0].length, act: i });
    }
  });
  for (const m of text.matchAll(OTHER)) out.push({ start: m.index!, end: m.index! + m[0].length, act: 'other' });
  out.sort((a, b) => a.start - b.start || b.end - a.end);
  // La suprapuneri („Legea nr. 227/2015 privind Codul fiscal”) rămâne prima, cea mai lungă.
  return out.filter((m, i) => !out.slice(0, i).some((o) => m.start < o.end && m.end > o.start));
}

// ─── Rezolvarea ───────────────────────────────────────────────────────────────────────────────────────────────────

export type CiteTarget = { t: 'act'; act: number; ids: string[] } | { t: 'own'; form: CiteForm; ids: string[] };
export interface CiteSpan {
  start: number;
  end: number;
  target: CiteTarget;
}

export interface CiteScope {
  /** Forma proiectului la care se referă „art. I pct. 3” în acest text. */
  form?: CiteForm | null;
  /** Textul e citat din proiect, dintr-un articol care modifică acest act. */
  billAct?: number | null;
}

type Index = Pick<CiteFile, 'acts' | 'own' | 'numbering' | 'approval'>;

// Între trimitere și actul ei: „ din ”, „ al ”, „, prevăzut de ”, sau nimic („art. 1 alin. 5 Constituție”).
const TAIL_GAP = /\s*,?\s*(?:(?:din|al|ale|a|la|de\s+la|prevăzut(?:ă|e|ele|ul)?\s+(?:de|în|la))\s+)?/iuy;
const LIST_GAP = new RegExp(String.raw`^${LSEP}(?:(?:ale?|la|și\s+ale?|de\s+la)\s+)?$`, 'iu');

// Capătul unei propoziții: punct, apoi majusculă; „art. I”, „nr. 5”, „alin. (2)” nu închid propoziția.
const SENTENCE_END = /(?<![\p{L}](?:art|alin|lit|pct|nr|Nr|Art|Alin|lit|ș\.a|etc|resp|cf|al))[.!?;]["”»)]?\s+(?=[\p{Lu}„"(])/gu;
function sameSentence(text: string, from: number, to: number) {
  SENTENCE_END.lastIndex = from;
  const m = SENTENCE_END.exec(text);
  return !m || m.index >= to;
}

/** Trimiterile din text care duc sigur undeva, cu ținta lor. */
export function resolve(text: string, idx: Index, scope: CiteScope = {}): CiteSpan[] {
  const refs = findRefs(text);
  if (!refs.length) return [];
  const mentions = findMentions(text, idx.acts);
  // Listele („art. 111 alin. (1) și art. 138 alin. (5) din Constituție”) au același act, numit după ultima trimitere.
  const tails: (Mention | 'generic' | null)[] = new Array(refs.length).fill(null);
  let groupStart = 0;
  for (let i = 0; i < refs.length; i++) {
    const last = i === refs.length - 1 || !LIST_GAP.test(text.slice(refs[i].end, refs[i + 1].start));
    if (!last) continue;
    const gap = sticky(TAIL_GAP, text, refs[i].end)!;
    const at = gap.index + gap[0].length;
    const m = mentions.find((x) => x.start === at);
    const tail = m ?? (gap[0].trim() && sticky(GENERIC, text, at) ? 'generic' : null);
    for (let j = groupStart; j <= i; j++) tails[j] = tail;
    groupStart = i + 1;
  }

  const ownForm = scope.form ?? null;
  const own = ownForm ? idx.own[ownForm] : undefined;
  const ownAct = (ids: string[]) => own?.[ids[0].split('/').slice(0, 2).join('/')]?.act ?? own?.[ids[0].split('/')[0]]?.act;
  const out: CiteSpan[] = [];
  // Actul „în discuție” până la fiecare poziție: ultimul act numit, sau actul punctului de proiect numit.
  const context: { pos: number; act: number | 'other' }[] = mentions.map((m) => ({ pos: m.start, act: m.act }));

  const ownHas = (ids: string[]) =>
    own && ids.every((id) => own[id] || own[id.split('/').slice(0, 2).join('/')] || own[id.split('/')[0]]);

  refs.forEach((r, i) => {
    const tail = tails[i];
    let ids = refIds(r);
    if (r.roman) {
      // „Art. I pct. 7, lit. k^4)”: după punct vin unitățile legii modificate, nu ale proiectului; rămâne punctul.
      const pts = ids.map((id) => id.split('/').find((x) => x.startsWith('pct-'))).filter(Boolean);
      const top = topId(r);
      ids = pts.length ? [...new Set(pts.map((p) => `${top}/${p}`))] : [...new Set(ids.map((id) => id.split('/').slice(0, 2).join('/')))];
      // „art. I din Legea nr. 141/2025” e articolul altui act de modificare.
      if (tail && tail !== 'generic') return;
      if (!ownForm || !ownHas(ids)) return;
      out.push({ start: r.start, end: r.end, target: { t: 'own', form: ownForm, ids } });
      const a = ownAct(ids);
      if (a != null) context.push({ pos: r.start, act: a });
      return;
    }
    let act: number | null = null;
    // Fără act numit și fără context, trimiterea duce la actul modificat doar dacă articolul e chiar unul pe care proiectul
    // îl modifică (din baseline): „art. 16 și 29” într-o analiză poate fi la fel de bine din Constituție.
    let implicit = false;
    if (tail === 'generic') return;
    if (tail) {
      if (tail.act === 'other') return;
      act = tail.act;
    } else {
      const prev = context.filter((c) => c.pos < r.start).sort((a, b) => b.pos - a.pos)[0];
      if (prev) {
        if (prev.act === 'other') return;
        act = prev.act;
        // Actul numit într-o propoziție de dinainte nu mai e sigur „în discuție”: doar articolele pe care proiectul le modifică.
        implicit = !sameSentence(text, prev.pos, r.start);
      } else if (scope.billAct != null) act = scope.billAct;
      else if (idx.numbering === 'arabic' && !idx.acts.length && r.kind === 'art') {
        // O lege nouă, care nu modifică nimic: „art. 5” e al ei.
        if (ownForm && ownHas(ids)) out.push({ start: r.start, end: r.end, target: { t: 'own', form: ownForm, ids } });
        return;
      } else if ((idx.numbering === 'roman' || idx.numbering === 'unic') && !idx.approval && idx.acts.length === 1) {
        act = 0;
        implicit = true;
      } else return;
    }
    const a = idx.acts[act];
    const unit = a?.units[topId(r)];
    if (!a?.available || !unit || (implicit && unit.src !== 'baseline')) return;
    out.push({ start: r.start, end: r.end, target: { t: 'act', act, ids } });
  });
  return out.sort((a, b) => a.start - b.start);
}

// ─── Proiectul însuși ─────────────────────────────────────────────────────────────────────────────────────────────

const LABEL = new RegExp(
  String.raw`^\s*(?:(?:Art|ART)(?:icol(?:ul)?|ICOL(?:UL)?)?\.?\s*(?:([IVXL]+)(${SUPC})?(?![\p{L}\d])\.?|(unic)\b\.?|(\d{1,3})(${SUPC})?(?:\.|\s*[-–—]))|(ARTICOL\s+UNIC|Articol\s+unic))`,
  'u',
);
const POINT = new RegExp(String.raw`^\s*(\d{1,3})(${SUPC})?\.\s*(?=\S)`, 'u');
const STEP =
  /^\s*\d{1,3}(?:\^\d+|[⁰¹²³⁴⁵⁶⁷⁸⁹]+)?\.\s*(?:La\s|Dup[ăa]\s|Articolul|Art\.|Alineatul|Alin\.|Litera|Lit\.|Punctul|Pct\.|Anexa|Titlul|Capitolul|Sec[țţ]iunea|Partea|[ÎI]n\s|Denumirea|Pretutindeni|Textul|Se\s)|se\s+(?:modific|abrog|introduc|complet|[îi]nlocui|renumerot)|urm[ăa]torul\s+cuprins/i;

export interface BillSection {
  id: string;
  label: string;
  start: number;
  end: number;
  act: number | null;
  points: { id: string; label: string; start: number; end: number }[];
}

/**
 * Articolele de vârf ale proiectului („Art. I”, „Articol unic”, „Art. 5.”), cu punctele lor și actul pe care îl modifică
 * fiecare (primul act numit în antetul articolului). Într-o lege de modificare doar articolele romane sunt ale
 * proiectului; „Articolul 47^1 – …” dintr-un citat e al legii modificate. Într-o lege nouă, articolele vin la rând.
 */
export function billSections(text: string, acts: ActLike[]): { numbering: CiteFile['numbering']; sections: BillSection[] } {
  const lines: { start: number; text: string }[] = [];
  let pos = 0;
  for (const l of text.split('\n')) {
    lines.push({ start: pos, text: l });
    pos += l.length + 1;
  }
  const sections: BillSection[] = [];
  let numbering: CiteFile['numbering'] = null;
  let lastRoman = 0;
  let lastArabic = 0;
  for (const l of lines) {
    const m = LABEL.exec(l.text);
    if (!m) continue;
    let id: string | null = null;
    let label = '';
    if (m[1]) {
      if (numbering && numbering !== 'roman') continue;
      const v = romanValue(m[1]);
      if (v < lastRoman || (v === lastRoman && !m[2])) continue;
      numbering = 'roman';
      lastRoman = v;
      id = `art-${m[1].toLowerCase()}${m[2] ? supNorm(m[2]) : ''}`;
      label = `Art. ${m[1]}${m[2] ? supNorm(m[2]) : ''}`;
    } else if (m[3] || m[6]) {
      if (numbering) continue;
      numbering = 'unic';
      id = 'art-unic';
      label = 'Articolul unic';
    } else if (m[4]) {
      if (numbering && numbering !== 'arabic') continue;
      const v = Number(m[4]);
      if (v !== lastArabic + 1 && !(v === lastArabic && m[5])) continue;
      numbering = 'arabic';
      lastArabic = v;
      id = `art-${v}${m[5] ? supNorm(m[5]) : ''}`;
      label = `Art. ${v}${m[5] ? supNorm(m[5]) : ''}`;
    }
    if (!id) continue;
    if (sections.length) sections[sections.length - 1].end = l.start;
    sections.push({ id, label, start: l.start, end: text.length, act: null, points: [] });
  }
  // Textul ordonanței aprobate vine după lege („[TEXTUL ORDONANȚEI]”); articolele ei nu sunt ale proiectului.
  const oug = text.indexOf('[TEXTUL ORDONANȚEI]');
  for (const s of sections) {
    if (oug >= 0 && s.start > oug) s.end = s.start;
    if (oug >= 0 && s.end > oug) s.end = oug;
    const body = text.slice(s.start, s.end);
    // Actul articolului: primul act numit în antet, până la primul citat sau la două puncte.
    const head = body.slice(0, Math.min(body.length, 700)).split(/[„“"]|:\s*\n/)[0];
    const m = findMentions(head, acts).find((x) => x.act !== 'other');
    s.act = m ? (m.act as number) : null;
    let last = 0;
    for (const l of lines) {
      if (l.start <= s.start || l.start >= s.end) continue;
      const p = POINT.exec(l.text);
      if (!p || !STEP.test(l.text)) continue;
      const v = Number(p[1]);
      if (v !== last + 1 && !(v === last && p[2])) continue;
      last = v;
      const pid = `${v}${p[2] ? supNorm(p[2]) : ''}`;
      if (s.points.length) s.points[s.points.length - 1].end = l.start;
      s.points.push({ id: `${s.id}/pct-${pid}`, label: `${s.label} pct. ${pid}`, start: l.start, end: s.end });
    }
  }
  return { numbering, sections: sections.filter((s) => s.end > s.start) };
}

/** Actul modificat de articolul proiectului în care stă poziția `at` (pentru citatele din proiect). */
export function actAt(sections: BillSection[], at: number): number | null {
  return sections.find((s) => at >= s.start && at < s.end)?.act ?? null;
}

const fold = (s: string) =>
  s
    .replace(/[„“”"«»]/g, '')
    .replace(/[șş]/g, 's')
    .replace(/[țţ]/g, 't')
    .replace(/[ăâ]/g, 'a')
    .replace(/î/g, 'i')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** Unde apare un citat în textul proiectului (spațiile, ghilimelele și sedilele nu contează); -1 dacă nu apare. */
export function locate(haystack: string, quote: string): number {
  const q = fold(supNorm(quote)).slice(0, 120);
  if (q.length < 12) return -1;
  // Indexul din textul pliat trebuie dus înapoi în textul original: pliem caracter cu caracter.
  const map: number[] = [];
  let folded = '';
  const src = haystack;
  let prevSpace = false;
  for (let i = 0; i < src.length; i++) {
    let c = src[i];
    if ('„“”"«»'.includes(c)) continue;
    if (/\s/.test(c)) {
      if (prevSpace) continue;
      c = ' ';
      prevSpace = true;
    } else prevSpace = false;
    const sup = '⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c);
    const piece = sup >= 0 ? (folded.endsWith('^') || /\^\d$/.test(folded) ? String(sup) : `^${sup}`) : c.toLowerCase().replace(/[șş]/, 's').replace(/[țţ]/, 't').replace(/[ăâ]/, 'a').replace('î', 'i');
    for (const ch of piece) {
      folded += ch;
      map.push(i);
    }
  }
  const at = folded.indexOf(q);
  return at < 0 ? -1 : map[at];
}
