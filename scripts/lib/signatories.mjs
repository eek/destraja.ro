// Lista semnatarilor dintr-o scrisoare sau petiție, citită determinist din text: un titlu de tipul
// „Organizații semnatare:”, apoi rânduri numerotate 1, 2, 3… Numărăm intrările, verificăm că numerotarea
// nu are goluri și păstrăm doar numele organizațiilor, exact cum apar în text. Persoanele fizice nu
// ajung în date cu numele, doar numărate. Textul e nesigur: îl citim, nu îl executăm și nu îl interpretăm.

import { norm } from './web.mjs';

const ENTRY = /^(\d{1,4})\s*[.)]\s*(\p{L}.*|[„"“«(\[].*|\d\S*\s.*)$/u;
const HEADING = /semnatar|semneaz|au\s+semnat|semnat\s+de|lista\s+(organiza|semnat)|s-au\s+al[ăa]turat|organiza[țţt]ii(le)?\s+care\s+(sus[țţt]in|cer|solicit)/i;
const HEADING_ORGS = /organiza[țţt]i|asocia[țţt]i|\bONG|entit[ăa][țţt]i|federa[țţt]i|confedera|sindicat|patronat|institu[țţt]i|companii|firme|organisations/i;
const HEADING_PEOPLE = /persoane|cet[ăa][țţt]eni|individual|nume\s+propriu|semnatari\s+individuali|specialiș?ti|exper[țţt]i/i;

// Formele juridice și cuvintele care arată că o intrare e o organizație, nu un om. Primele sunt începuturi de
// cuvânt („asocia” prinde Asociația, Asociatia, Asociației), ultimele sunt cuvinte întregi. În JavaScript, \b
// nu știe de ș sau ț, de aceea granițele de cuvânt sunt scrise cu \p{L}.
const ORG_PREFIX =
  /(?<![\p{L}\p{N}])(asocia|funda[țţt]i|federa[țţt]i|confedera|uniun|sindicat|patronat|camer[ae]|consiliul|centr|club|societ|institu|alian[țţt]|organiza[țţt]i|lig[ai]|re[țţt]ea|coali[țţt]i|grup|colegi|ordinul|corpul|academi|universit|facult|[șşs]coal|liceu|biseric|parohi|episcop|mitropoli|cooperativ|agen[țţt]i|birou|platform|ini[țţt]iativ|mi[șşs]car|comunit|forum|network|associa|foundation|institute|council|union|federation|allian|societ|initiative|movement|coalition|partnership|teatr|muze|bibliotec|editur|revist|radio|compan|cabinet|[îi]ntreprinder|farmaci|spital|clinic|fond|trust)/iu;
const ORG_WORD = /(?<![\p{L}\p{N}])(ong|srl|s\.r\.l|s\.a|sa|ra|ifn|fund|center|centre|group|society)(?![\p{L}\p{N}])/iu;
const ORG_WORDS = { test: (s) => ORG_PREFIX.test(s) || ORG_WORD.test(s) };
// „Ion POPESCU”, „POPESCU Ion”, „Ion-Mihai Popescu, cetățean”: semne de persoană fizică.
const PERSON =
  /^(\p{Lu}\p{Ll}+(?:-\p{Lu}\p{Ll}+)?\s+){1,2}\p{Lu}{2,}(?:-\p{Lu}{2,})?$|^\p{Lu}{2,}(?:-\p{Lu}{2,})?(\s+\p{Lu}\p{Ll}+(?:-\p{Lu}\p{Ll}+)?){1,2}$|persoan[ăa]\s+fizic|[îi]n\s+nume\s+propriu|(?<!\p{L})cet[ăa][țţt]ean|(?<!\p{L})PFA(?!\p{L})/u;
const CONNECTOR = /(,|-|–|(?<!\p{L})(și|si|de|din|pentru|a|al|ale|la|în|in|cu|pe))$/iu;
const FOOTER = /^\d{1,3}$|^pagin|^page\b|^\d+\s*\/\s*\d+$|www\.|@|^https?:/i;

/** Un nume sigur de afișat: text simplu, fără caractere de control, spații unice, cel mult 200 de caractere. */
export function plainName(s) {
  return String(s)
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[;,.]$/, '')
    .slice(0, 200);
}

export function looksLikeOrganization(name) {
  return ORG_WORDS.test(name) || /(?<!\p{L})\p{Lu}{3,}(?!\p{L})/u.test(name.replace(PERSON, ''));
}

export function looksLikePerson(name) {
  return PERSON.test(name.trim()) && !ORG_WORDS.test(name);
}

function headingKind(line) {
  if (HEADING_PEOPLE.test(line) && !HEADING_ORGS.test(line)) return 'persoane';
  if (HEADING_ORGS.test(line)) return 'organizatii';
  return 'mixt';
}

/** Rândurile care se repetă des (antete, subsoluri) nu pot fi continuarea unui nume. */
function boilerplate(lines) {
  const seen = new Map();
  for (const l of lines) if (l.trim()) seen.set(l.trim(), (seen.get(l.trim()) ?? 0) + 1);
  return new Set([...seen].filter(([, n]) => n >= 3).map(([l]) => l));
}

/**
 * Citește o listă numerotată care începe la rândul `from`. Se oprește când numerotarea o ia de la capăt,
 * sare prea mult sau când urmează mai mult de trei rânduri care nu sunt intrări.
 */
function readNumbered(lines, from, repeated) {
  const entries = [];
  const gaps = [];
  let expected = 1;
  let block = [];
  let loose = 0;
  for (let i = from; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const m = ENTRY.exec(line);
    const n = m ? Number(m[1]) : NaN;
    if (m && (n === expected || (entries.length > 0 && n > expected && n <= expected + 25))) {
      // Rândurile dintre două intrări continuă numele de dinainte (de pildă un oraș trecut pe rândul următor).
      const prev = entries.at(-1);
      if (prev && block.length && block.length <= 2) {
        const keep = block.filter((b) => !FOOTER.test(b) && !repeated.has(b) && (b.length <= 40 || CONNECTOR.test(prev.raw) || /^\p{Ll}/u.test(b)));
        if (keep.length === block.length) prev.raw = `${prev.raw} ${keep.join(' ')}`;
      }
      for (let k = expected; k < n; k++) gaps.push(k);
      entries.push({ n, raw: m[2], line: i });
      expected = n + 1;
      block = [];
      loose = 0;
      continue;
    }
    if (m && entries.length === 0) return { entries, gaps };
    if (m) break;
    if (!entries.length) {
      if (++loose > 3) break;
      continue;
    }
    block.push(line);
    if (block.length > 3) break;
  }
  return { entries, gaps };
}

/** Numere de tipul „peste 370 de organizații” din propozițiile despre semnatari. */
export function claimedTotals(text) {
  const claims = [];
  const flat = text.replace(/\s+/g, ' ');
  const re =
    /(?:\b(peste|mai\s+mult\s+de|aproape|circa|aproximativ|[îi]n\s+jur\s+de|cel\s+pu[țţt]in)\s+)?\b(\d{1,3}(?:[.\s]\d{3})+|\d{1,5})\s+(?:de\s+)?(organiza[țţt]ii(?:\s+neguvernamentale)?|ONG-uri|asocia[țţt]ii|entit[ăa][țţt]i|federa[țţt]ii|semnatari|organisations)\b/giu;
  for (const m of flat.matchAll(re)) {
    const dot = flat.lastIndexOf('. ', m.index);
    const start = dot === -1 ? 0 : dot + 2;
    const endDot = flat.indexOf('. ', m.index);
    const sentence = flat.slice(start, endDot === -1 ? undefined : endDot + 1).trim();
    if (!/semn|al[ăa]tur|subscri|sus[țţt]in|\bcer\b|solicit/i.test(sentence)) continue;
    const value = Number(m[2].replace(/[.\s]/g, ''));
    const qual = norm(m[1] ?? '');
    const relation = /peste|mai mult/.test(qual) ? 'peste' : /aproape/.test(qual) ? 'aproape' : /cel putin/.test(qual) ? 'cel-putin' : qual ? 'circa' : 'exact';
    claims.push({ text: sentence.slice(0, 240), value, relation, of: /semnatari/i.test(m[3]) ? 'semnatari' : 'organizatii' });
  }
  return claims;
}

export function claimHolds(claim, count) {
  const v = claim.value;
  if (claim.relation === 'peste') return count > v;
  if (claim.relation === 'cel-putin') return count >= v;
  if (claim.relation === 'aproape') return count <= v && count >= v * 0.9;
  if (claim.relation === 'circa') return Math.abs(count - v) <= Math.max(5, v * 0.1);
  return count === v;
}

/** Listele numerotate din text, cu rândul de dinaintea lor: pentru când nu găsim un titlu clar. */
export function numberedRuns(text) {
  const lines = text.split('\n');
  const repeated = boilerplate(lines);
  const runs = [];
  for (let i = 0; i < lines.length; i++) {
    const m = ENTRY.exec(lines[i].trim());
    if (!m || m[1] !== '1') continue;
    const r = readNumbered(lines, i, repeated);
    if (r.entries.length >= 5) runs.push({ line: i, before: lines.slice(Math.max(0, i - 3), i).map((l) => l.trim()).filter(Boolean), ...r });
  }
  return runs;
}

/**
 * Lista semnatarilor din text. `headingLine` (opțional) e rândul de titlu ales de un model când nu găsim
 * unul clar; trebuie să existe literal în text. Întoarce null dacă nu e nicio listă numerotată.
 */
export function parseSignatories(text, { headingLine = null } = {}) {
  const lines = text.split('\n');
  const repeated = boilerplate(lines);
  let best = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const chosen = headingLine && norm(line) === norm(headingLine);
    if (!chosen && (line.length > 120 || !HEADING.test(line) || ENTRY.test(line))) continue;
    // Lista începe în primele rânduri de după titlu.
    let start = i + 1;
    while (start < lines.length && start <= i + 4 && !ENTRY.test(lines[start].trim())) start++;
    const r = readNumbered(lines, start, repeated);
    if (r.entries.length && (!best || r.entries.length > best.entries.length)) best = { heading: line, kind: headingKind(line), ...r };
  }
  if (!best) return null;

  const organizations = [];
  let individuals = 0;
  for (const e of best.entries) {
    const name = plainName(e.raw);
    const org =
      best.kind === 'organizatii' ? !looksLikePerson(name) : best.kind === 'mixt' ? looksLikeOrganization(name) && !looksLikePerson(name) : false;
    if (org && name.length >= 3 && norm(text).includes(norm(name))) organizations.push(name);
    else individuals++;
  }
  const last = best.entries.at(-1).n;
  return {
    heading: plainName(best.heading),
    kind: best.kind,
    entries: best.entries.length,
    numberedTo: last,
    gaps: best.gaps,
    organizations,
    individuals,
  };
}
