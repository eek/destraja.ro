// Textul în vigoare al articolelor pe care le modifică un proiect, ca bază pentru analiză. Determinist, fără modele:
// citește din forma analizată actele modificate („Legea nr. 51/1995 … se modifică”) și articolele atinse („1. La
// articolul 3…”), apoi ia forma consolidată la zi a acelor articole de pe legislatie.just.ro (lib/legislatie.mjs).
// Ce nu se găsește apare explicit ca negăsit, cu motivul; nu se ghicește.
//
// Unde stau datele:
// - data/baseline/<slug>.json: baza proiectului, pentru forma pe care o analizează straja-council (FORMS de mai jos);
//   data/baseline/versions/<slug>/<formă>.json: formele mai vechi, cerute doar de comparații (--versions).
// - data/baseline/_acts.json: actele citite, cu adresa lor pe portal, ziua în care au fost verificate ultima dată și o
//   amprentă a textului; după ea știe rularea zilnică ce proiecte trebuie refăcute când se schimbă o lege.
// - .cache/legislatie/acts/: actele întregi, așa cum le-a dat portalul, cel mult o zi. Codul fiscal sau Codul
//   administrativ au sute de articole și le modifică zeci de proiecte: le cerem o dată pe zi, nu o dată pe proiect, și nu
//   le ținem în git (doar articolele folosite ajung în data/baseline).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { fetchAct, PortalError } from './legislatie.mjs';
import { writeFileAtomic } from './atomic.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const BASELINE_DIR = path.join(ROOT, 'data', 'baseline');
export const ACTS_INDEX = path.join(BASELINE_DIR, '_acts.json');
const TEXT_DIR = path.join(ROOT, 'data', 'texts');
const ACT_CACHE = path.join(ROOT, '.cache', 'legislatie', 'acts');

// baseline-v2 (19 noiembrie 2026): toate proiectele (Senat și Cameră), pe forma analizată, cu actele cerute o dată pe zi.
// Fișierele baseline-v1 (PR #5) n-au câmpul și se refac la prima rulare.
export const BASELINE_METHOD = 'baseline-v2';

export const NOTE =
  'Forma consolidată de pe legislatie.just.ro are caracter informativ; textul oficial este cel publicat în Monitorul Oficial.';

// Formele unui proiect, de la cea mai nouă, ca în straja-council (FORMS, latestVersion): la Cameră modelele analizează
// forma aflată acum în dezbatere, la Senat forma inițiatorului.
export const FORMS = { camera: 'forma_camera', senat: 'forma_senat', initiator: 'forma_initiatorului' };

// ─── Citirea proiectului ────────────────────────────────────────────────────────────────────────────────────────

// Numărul unui articol, ca pe portal: „7^1”, „1270” (scris „1.270”).
const NUM = String.raw`(\d{1,3}(?:\.\d{3})+|\d+)(?:\s*\^\s*(\d+))?`;
// „art 183” fără punct (Pl-x 150/2026) e tot un articol, dacă urmează cifre.
const ART_REF = new RegExp(String.raw`\b(?:articol(?:ul|ului|ele|elor)?|art\.?)\s*${NUM}`, 'gi');
// „se aprobă … cu următoarele modificări” e legea de aprobare a unei ordonanțe: punctele ei modifică ordonanța.
const AMENDS = /\bse\s+(?:modific[ăa]|completeaz[ăa]|abrog[ăa]|introduc|aprob[ăa])|va\s+avea\s+urm[ăa]torul\s+cuprins/i;
// Un rând care deschide modificările unui act se termină ca o instrucțiune; „se completează cu prevederile Legii …”
// (trimitere, nu modificare) nu se termină așa. „cum urmează” fără „după” și „ćum” sunt din texte reale (PL-x 104/2026,
// Pl-x 96/2026); „se completează cu următorul alineat” din Pl-x 456/2026.
const INSTRUCTION =
  /(?:dup[ăa]\s+)?[cć]\u0301?um\s+urmeaz[ăa]|urm[ăa]torul\s+(?:cuprins|con[țţ]inut)|se\s+abrog[ăa]|cu\s+urm[ăa]to(?:rul|arele|area)\s+(?:modific|alineat|articol|liter|punct)/i;
// „se completează după articolul 47, cu un nou articol, articolul 47^1” (Pl-x 54/2026) e tot un articol nou.
const NEW_ARTICLE = /\b(?:se\s+introduc\w*|cu)\s+\S+\s+no(?:u|i)\s+articol/i;
// „După articolul 7 se introduce articolul 7^1” (fără „nou”): articolul numit după verb e cel nou.
const INSERTS_AFTER = /\bdup[ăa]\s+(?:articolul|art\.)\s*[\d.]+(?:\s*\^\s*\d+)?\s*,?\s*se\s+introduc/i;
// Articolele cu cifre romane sunt ale actelor de modificare: „La articolul I punctul 6, alineatul (8) al articolului 6^1…”
// (legea de aprobare modifică articolul I al ordonanței, care modifică altă lege), „Articolul III din Legea nr. 141/2025
// … se modifică”. Articolul atins e cel roman (pe portal „Articolul III”, ca „iii”); articolul 6^1 e al celeilalte legi,
// nu al actului modificat, deci nu-l luăm. Fără „i”: „art. în…” nu e un număr roman.
// „La articolul unic punctul 2, articolul 8…” (PL-x 340/2026): articolul atins e articolul unic al ordonanței.
const ROMAN_REF = /\b[Aa]rt(?:icolul|icolului|icolele|\.)\s*([IVXL]+|unic)\b(?:\s*\^\s*(\d+))?/g;
// Un articol numit poate fi primul dintr-o listă: „art. 5, 7 și 9^1”, „art.10 alin.(4) și 17^1 din …” (PL-x 485/2025),
// „articolul 3 alineatul (2) și articolul 4”. După număr vin calificativele lui (alineatele, pe care le ținem minte,
// literele și punctele, pe care le sărim) și apoi, după „,” sau „și”, alt număr, cu sau fără „art.”. Un număr gol după
// „pct. 3 și” e tot un punct, nu un articol. Lista se oprește la orice altceva („din”, „se abrogă”, „, la articolul”).
const LINK = String.raw`\s*(?:,|și|sau|ori|precum\s+și)\s*`;
const ART_WORD = String.raw`(?:articol(?:ul|ului|ele|elor)?|art\.?)\s*`;
const RUN = {
  alin: /\s*,?\s*alin(?:eat(?:ul|ele|ului|elor)?|\.)?\s*(?=\()/iy,
  par: /\s*(?:,|și|sau|ori|[-–])?\s*\(\s*(\d+(?:\s*\^\s*\d+)?)\s*\)/y,
  lit: /\s*,?\s*lit(?:era|erele|erei|\.)?\s*[a-zăâîșț](?:\s*\^\s*\d+)?\)(?:\s*(?:,|și|sau|ori|[-–])\s*[a-zăâîșț](?:\s*\^\s*\d+)?\))*/iy,
  pct: /\s*,?\s*(?:pct\.?|punct(?:ul|ele|ului|elor))\s*\d+(?:\s*\^\s*\d+)?\.?(?:\s*(?:,|și|sau|ori|[-–])\s*\d+(?:\s*\^\s*\d+)?\.?)*/iy,
  next: new RegExp(String.raw`${LINK}(?:${ART_WORD})?${NUM}(?![\d/%)])(?!\s*\/)`, 'iy'),
  nextRoman: new RegExp(String.raw`${LINK}(?:${ART_WORD})?([IVXL]+)\b`, 'y'),
};
const sticky = (re, text, at) => {
  re.lastIndex = at;
  return re.exec(text);
};
const parNum = (s) => s.replace(/\s+/g, '');
/**
 * Listele de articole dintr-un text, după poziție: { index, end, items: [{ num, paragraphs }] }. `paragraphs` sunt
 * alineatele numite chiar lângă articol („art.10 alin.(4)”), dacă sunt.
 */
export function articleRuns(text) {
  const refs = [
    ...[...text.matchAll(ART_REF)].map((m) => ({ index: m.index, end: m.index + m[0].length, num: articleNum(m), roman: false })),
    ...[...text.matchAll(ROMAN_REF)].map((m) => ({ index: m.index, end: m.index + m[0].length, num: `${m[1].toLowerCase()}${m[2] ? `^${m[2]}` : ''}`, roman: true })),
  ].sort((a, b) => a.index - b.index);
  const runs = [];
  let consumed = 0;
  for (const ref of refs) {
    if (ref.index < consumed) continue;
    const items = [{ num: ref.num, paragraphs: [] }];
    let at = ref.end;
    for (;;) {
      const cur = items.at(-1);
      let m;
      if ((m = sticky(RUN.alin, text, at))) {
        let p = m.index + m[0].length;
        let q;
        const before = cur.paragraphs.length;
        while ((q = sticky(RUN.par, text, p))) {
          cur.paragraphs.push(parNum(q[1]));
          p = q.index + q[0].length;
        }
        if (cur.paragraphs.length === before) break;
        at = p;
      } else if ((m = sticky(RUN.lit, text, at)) || (m = sticky(RUN.pct, text, at))) at = m.index + m[0].length;
      else if (!ref.roman && (m = sticky(RUN.next, text, at))) {
        items.push({ num: articleNum([m[0], m[1], m[2]]), paragraphs: [] });
        at = m.index + m[0].length;
      } else if (ref.roman && (m = sticky(RUN.nextRoman, text, at))) {
        items.push({ num: m[1].toLowerCase(), paragraphs: [] });
        at = m.index + m[0].length;
      } else break;
    }
    runs.push({ index: ref.index, end: at, items });
    consumed = at;
  }
  return runs;
}
/** Articolele primei liste numite, arabe sau romane; ale ultimei, cu `last`. */
function articleNums(text, { last = false } = {}) {
  const runs = articleRuns(text);
  return (last ? runs.at(-1) : runs[0])?.items.map((i) => i.num) ?? [];
}
// Articolul proiectului de la început de rând: „Art. I –”, „Articolul unic.”, „Art. 50. —” (legile noi numerotează arab).
// Numărul arab e urmat de punct sau liniuță; „Articolul 65 din Legea nr. …” e un articol al legii modificate.
const LABEL = /^\s*Art(?:icol(?:ul)?)?\.?\s*(?:([IVXL]+|unic)\b\.?|(\d+)(?:\.|\s*[-–—]))\s*[-–—:]?\s*/i;
const labelOf = (line) => {
  const m = LABEL.exec(line);
  return m ? (m[1] ?? m[2]) : null;
};
// „1.După articolul 399…” (fără spațiu, Pl-x 701/2026) e tot un punct; „1.270” nu.
const POINT = /^\s*(?:\d+\.\s|\d+\.(?=[A-ZĂÂÎȘȚ])|[-–—•]\s*\S)/;
// Instrucțiunile nenumerotate („Articolul 1 se modifică și va avea următorul cuprins:”, PL-x 317/2026).
// „La Titlul IV …, după articolul 60 se introduce…” (PL-x 117/2026) începe tot cu „La”.
const STEP = /^\s*(?:La\s|Dup[ăa]\s|(?:Articolul|Art\.)\s*\d|Alineatul|Alin\.|Litera|Lit\.|Punctul|Pct\.)/i;
const isStep = (line) => {
  const head = instructionPart(line);
  if (!AMENDS.test(head)) return false;
  return POINT.test(line) || (STEP.test(line) && INSTRUCTION.test(head));
};
// În citat, doar o instrucțiune limpede închide citatul: începe ca o instrucțiune („3. La articolul 20…”) și se termină
// ca una („…următorul cuprins:”, „se abrogă”). „2. Contractul se modifică prin act adițional” e text citat.
const clearStep = (line) => STEP.test(line.replace(/^\s*\d+\.\s*/, '')) && INSTRUCTION.test(instructionPart(line)) && AMENDS.test(instructionPart(line));
// „Legea nr. 51/1995”, „Legea nr 51/1995” și „Legea nr. nr. 227/2015” (OCR, greșeli de redactare), „Legea 200/2006” (fără
// „nr.”, doar cu bară), „Legea nr. 227 din 8 septembrie 2015”, „O.U.G. nr. 57/2019”, „Ordonanța de urgență nr. 57/2019”
// (fără „a Guvernului”), „Ordonanța nr. 2/2001”, „Ordonanță de urgență nr. 195/2002”, „Guvermului” (OCR), „Decretul-lege
// nr. 118/1990”. Ordonanța de urgență e încercată înaintea celei simple, ca „de urgență” să nu treacă drept cuvinte oarecare.
const ORD = String.raw`Ordonan[țţ](?:a|ei|[ăa])`;
const ACT = new RegExp(
  String.raw`\b(?<kind>Leg(?:ea|ii)(?:-cadru)?|${ORD}\s+de\s+urgen[țţ][ăa](?:\s+a\s+Guv\p{L}+)?|${ORD}\s+(?:a\s+)?Guv\p{L}+|${ORD}(?=\s+nr)|` +
    String.raw`Hot[ăa]r[âa]r(?:ea|ii)\s+(?:a\s+)?Guv\p{L}+|Decret(?:ul|ului)-lege|O\.?U\.?G\.?|O\.?G\.?|H\.?G\.?)` +
    String.raw`(?:\s+[^\s,;.()\d]+){0,6}?\s+(?:(?:nr\.?\s*){1,2}(?<numar>\d{1,4})` +
    String.raw`(?:\s*\/\s*(?<an>(?:19|20)\d{2})|\s+din\s+(?:\d{1,2}\s+\p{L}+\s+)?(?<an2>(?:19|20)\d{2}))|(?<numar2>\d{1,4})\s*\/\s*(?<an3>(?:19|20)\d{2}))\b`,
  'iu',
);

const SUPERSCRIPT = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
export const normalize = (text) => text.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (s) => `^${[...s].map((c) => SUPERSCRIPT[c]).join('')}`);

const articleNum = (m) => `${m[1].replace(/\./g, '')}${m[2] ? `^${m[2]}` : ''}`;

function tipAct(kind) {
  const k = kind.toLowerCase();
  if (/urgen|^o\.?u/.test(k)) return 'ORDONANȚĂ DE URGENȚĂ';
  if (/^ordonan|^o\.?g/.test(k)) return 'ORDONANȚĂ';
  if (/^hot|^h\.?g/.test(k)) return 'HOTĂRÂRE';
  if (/^decret/.test(k)) return 'DECRET-LEGE';
  return 'LEGE';
}

// „…, aprobată cu modificări prin Legea nr. 55/2024, se modifică…”: legea de aprobare nu e actul modificat. Pe rândurile
// rupte la scanare (PL-x 78/2026) ea e primul act de pe rând și ar fi luată drept subiect.
const APPROVED_BY = /aprobat[ăa](?:\s+cu\s+modific[ăa]ri(?:\s+și\s+complet[ăa]ri)?)?\s+prin\s*$/i;
const ACT_G = new RegExp(ACT.source, 'giu');
const approvalAt = (line, m) => APPROVED_BY.test(line.slice(Math.max(0, m.index - 60), m.index));
function actOf(m) {
  const { kind, numar, numar2, an, an2, an3 } = m.groups;
  return { tipAct: tipAct(kind), numar: numar ?? numar2, an: an ?? an2 ?? an3, reference: m[0].replace(/\s+/g, ' '), index: m.index };
}
function findAct(line) {
  const m = [...line.matchAll(ACT_G)].find((x) => !approvalAt(line, x));
  return m ? actOf(m) : null;
}

// Abrogarea care numește mai multe acte: „art.10 alin.(4) și 17^1 din Ordonanța de urgență … nr.30/2007 privind …,
// aprobată cu modificări prin Legea nr.15/2008 și Ordonanța de urgență … nr.120/2005 privind …, se abrogă” (PL-x
// 485/2025). Primul act e al secțiunii; celelalte sunt legate de cel dinainte prin „,” sau „și”, fie cu articolele lor
// („… și art. 5 din Legea nr. …”), fie singure, și atunci se abrogă tot actul. Un act legat de o lege de aprobare
// („aprobată prin Legea nr. 15/2008 și Legea nr. 20/2009”) e tot o lege de aprobare, dacă nu are titlul lui („privind…”).
// Între act și „se abrogă” stă doar descrierea actului (titlul, Monitorul Oficial, „aprobată prin…”). Un alt alineat sau
// o altă propoziție (PL-x 286/2026: „(1) … potrivit Legii nr. 98/2016 … . (2) … se abrogă art. 2 alin. (1) din
// Normele…”) înseamnă că se abrogă altceva.
function wholeRepeal(header, actIndex) {
  const head = instructionPart(header);
  const verb = /\bse\s+abrog/i.exec(head.slice(actIndex));
  if (!verb || /\banex/i.test(head)) return false;
  return !/;|\.\s+[A-ZĂÂÎȘȚ(„]|\(\d+\)/.test(head.slice(actIndex, actIndex + verb.index));
}
const LINKED = /(?:,|(?:^|\s)(?:precum\s+)?și)\s*$/i;
const TITLED = /^\s*,?\s*(?:privind|pentru|referitoare|publicat)/i;
function repealedWith(header) {
  const head = instructionPart(header);
  const verb = /\bse\s+abrog/i.exec(head);
  if (!verb) return [];
  const upTo = head.slice(0, verb.index);
  const out = [];
  let prev = null;
  let prevApproval = false;
  for (const m of upTo.matchAll(ACT_G)) {
    const approval = approvalAt(upTo, m);
    if (prev && !approval) {
      const seg = upTo.slice(prev.index + prev[0].length, m.index);
      const run = articleRuns(seg).at(-1);
      if (run) {
        if (LINKED.test(seg.slice(0, run.index)) && /^\s*(?:din|al|ale)\s*$/i.test(seg.slice(run.end))) out.push({ act: actOf(m), nums: run.items.map((i) => i.num) });
      } else if (LINKED.test(seg) && (!prevApproval || TITLED.test(upTo.slice(m.index + m[0].length)))) out.push({ act: actOf(m), nums: [] });
    }
    prev = m;
    prevApproval = approval || (prevApproval && LINKED.test(upTo.slice(0, m.index)) && !TITLED.test(upTo.slice(m.index + m[0].length)));
  }
  return out;
}

// Instrucțiunea fără textul nou: „…, cu următorul cuprins: „Art. 40^1. – (1) Prin derogare de la art. 8…”” stă uneori pe
// același rând, iar articolele citate în textul nou (art. 8, art. 30) nu sunt articole modificate (B629/2026).
const QUOTE_OPEN = /[„“«]|"(?=\S)/;
// Tăiem doar după două puncte: ghilimelele dinaintea lor țin de instrucțiune („Programul „Rabla” se modifică…”).
export function instructionPart(line) {
  const cut = /(?:cuprins|con[țţ]inut|urmeaz[ăa])\s*:|:\s*(?=[„“«"])/i.exec(line);
  return cut ? line.slice(0, cut.index + cut[0].length) : line;
}

// Actul pe care îl modifică rândul, dacă rândul deschide modificări: actul e numit înaintea verbului.
function headerAct(line) {
  if (POINT.test(line) || !INSTRUCTION.test(line)) return null;
  const head = instructionPart(line);
  const act = findAct(head);
  // „Se aprobă Ordonanța … nr. 4/2026 …, cu următoarea modificare:”: la legile de aprobare verbul vine înaintea actului.
  if (act && /^\s*se\s+aprob[ăa]\s/i.test(head.replace(LABEL, ''))) return act;
  const verb = AMENDS.exec(head);
  return act && verb && verb.index > act.index ? act : null;
}

const short = (line) => (line.length > 300 ? `${line.slice(0, 300)}…` : line).trim();

/**
 * Rândurile proiectului fără textul nou citat. Textul introdus („„Art. 13. – (1) …”) are propriile puncte numerotate
 * („1. modifica structura…”) și propriile „se modifică”; le sărim de la rândul care începe cu ghilimele până la cel care
 * le închide. Ghilimelele pierdute la scanare nu strică nimic: rândul rămâne de citit, ca înainte.
 */
export function instructionLines(text) {
  const out = [];
  let quoted = false;
  for (const raw of normalize(text).split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    // Ghilimelele se închid la finalul rândului, urmate cel mult de punctuație; „“” apare în texte și ca ghilimea de închidere.
    const closes = /[”“»"]\s*[.;,]?\s*$/.test(line);
    if (!quoted) {
      // Textul nou pornește pe rândul instrucțiunii („…cu următorul cuprins: „Art. 7^1. – (1) …”) și continuă dedesubt.
      // Doar la instrucțiuni: în preambul („jalonul îl reprezintă: „Dispoziție legală…”) ghilimelele nu deschid un text nou.
      const head = instructionPart(line);
      const opensInline = head.length < line.length && AMENDS.test(head) && QUOTE_OPEN.test(line.slice(head.length));
      if (/^[„“«"]/.test(line)) quoted = !closes;
      else {
        out.push(line);
        if (opensInline && !closes) quoted = true;
        continue;
      }
      if (!quoted) continue;
    }
    if (quoted) {
      if (closes) quoted = false;
      // Un rând de instrucțiune nu poate fi în citat: „5. La articolul 40…” sau „Art. II. – Legea nr. … se modifică după
      // cum urmează:” după un citat neînchis (ghilimele pierdute la scanare) închid citatul.
      else if (clearStep(line) || headerAct(line) || (LABEL.test(line) && headerAct(line.replace(LABEL, '')))) {
        quoted = false;
        out.push(line);
      }
      continue;
    }
    out.push(line);
  }
  return out;
}

// Rândul de început rupt în două la scanare („…publicată în Monitorul” / „Oficial al României…, se modifică după cum
// urmează:”, PL-x 504/2025): un rând care numește un act, dar nu e instrucțiune, se lipește de cel mult două rânduri
// următoare, dacă împreună dau un rând de început și niciunul nu e un punct sau un alt articol al proiectului.
const ACT_START = /^\s*(?:Leg|Ordonan|Hot[ăa]r|O\.?U\.?G|O\.?G|H\.?G|Decret|Articolul\s+\d|Art\.\s*\d)/i;
function joinHeaders(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (!headerAct(line) && !POINT.test(line) && (LABEL.test(line) || ACT_START.test(line)) && findAct(line)) {
      let joined = line;
      for (let j = 1; j <= 2 && i + j < lines.length; j++) {
        const next = lines[i + j];
        // O propoziție nouă care e singură rând de început („Art. 25 – Modificarea O.G. nr. 2/2001” / „La data desființării,
        // articolul 18 din Ordonanța Guvernului nr. 2/2001 se modifică…”) nu se lipește de titlul de deasupra. Una care
        // continuă rândul („…Ordonanței Guvernului nr.” / „12/2024 …, aprobată prin Legea nr. 314/2024, se modifică…”,
        // PL-x 171/2026) se lipește: actul modificat e cel de pe primul rând, nu legea de aprobare.
        if (POINT.test(next) || LABEL.test(next) || isStep(next) || (headerAct(next) && /^[A-ZĂÂÎȘȚ„]/.test(next))) break;
        joined = `${joined} ${next}`;
        if (headerAct(joined.replace(LABEL, ''))) {
          line = joined;
          i += j;
          break;
        }
      }
    }
    out.push(line);
  }
  return out;
}

/**
 * Actele modificate și articolele atinse. O secțiune începe la rândul care numește actul și spune ce se schimbă
 * („Art. I – Legea nr. … se modifică după cum urmează:”) și se termină la următorul articol al proiectului
 * („Art. II – …”). În fiecare secțiune, punctele („3. La articolul 8, alineatul (2) se modifică…”) dau articolele. Un
 * punct fără articol („1. Alineatul (2) se modifică…”) ține de articolul din rândul de început („Articolul 183 din
 * Legea nr. … se modifică”); fără puncte, rândul de început e chiar instrucțiunea. Un act abrogat în întregime
 * („Legea nr. … se abrogă”) are `repealed: true`.
 * @returns {{ tipAct, numar, an, reference, repealed?: true, articles: { num, status: 'amended'|'new', instructions: string[] }[],
 *   unresolved: { instruction: string, reason: string }[] }[]}
 */
export function amendedArticles(text) {
  const lines = joinHeaders(instructionLines(text));
  const sections = [];
  let current = null;
  for (const line of lines) {
    const act = headerAct(line);
    // Secțiunea se termină la următorul articol al proiectului. Cu numerotare arabă, doar la numărul următor: textele
    // introduse încep și ele cu „Art. 7^1. —”.
    const label = labelOf(line);
    const closes = label && (/^\d+$/.test(label) ? current?.next === label : !/^\d+$/.test(label));
    if (act) {
      // „Articolul VIII din Ordonanța … se abrogă” (PL-x 523/2026) arată ca articolul proiectului, dar e al actului.
      const header = /^\s*(?:din|al|ale)\s/i.test(line.replace(LABEL, '')) ? line : line.replace(LABEL, '');
      const next = /^\d+$/.test(label ?? '') ? String(Number(label) + 1) : null;
      sections.push((current = { header, act: headerAct(header) ?? act, body: [], next }));
    } else if (closes) current = null;
    else current?.body.push(line);
  }

  const acts = new Map();
  const entryOf = (act) => {
    const key = actKey(act);
    if (!acts.has(key)) acts.set(key, { ...act, index: undefined, articles: new Map(), unresolved: [] });
    return acts.get(key);
  };
  const addTo = (entry, num, status, instruction) => {
    if (!entry.articles.has(num)) entry.articles.set(num, { num, status, instructions: [] });
    const a = entry.articles.get(num);
    // Același articol, o dată modificat și o dată „nou”, e un articol care există: îl arătăm.
    if (status === 'amended') a.status = 'amended';
    a.instructions.push(short(instruction));
  };
  for (const { header, act, body } of sections) {
    const entry = entryOf(act);
    const add = (num, status, instruction) => addTo(entry, num, status, instruction);
    const unresolved = (instruction, reason) => entry.unresolved.push({ instruction: short(instruction), reason });
    const before = instructionPart(header).slice(0, act.index);
    const headerNums = articleNums(before, { last: true });
    // „La anexa nr. 1 la Legea nr. …, … se modifică după cum urmează: 1. Articolul 5…”: toată secțiunea e a anexei.
    const headerAnnex = /\banex/i.test(before);
    const points = body.filter(isStep);
    if (!points.length || headerAnnex) {
      if (headerAnnex) unresolved(header, 'anexă');
      else if (headerNums.length) for (const num of headerNums) add(num, 'amended', header);
      // Abrogarea întregului act: niciun articol, capitol sau anexă numit înaintea lui.
      else if (wholeRepeal(header, act.index) && !STRUCTURE.test(before)) entry.repealed = true;
      // Anexele și capitolele nu au un articol de arătat; le spunem pe nume.
      else unresolved(header, /\banex/i.test(header) ? 'anexă' : /\bcapitol|\bsec[țţ]iun|\btitl/i.test(header) ? NOT_ARTICLE : NO_ARTICLE);
      if (!headerAnnex) {
        for (const extra of repealedWith(header).filter((x) => x.nums.length || wholeRepeal(header, x.act.index))) {
          const e = entryOf(extra.act);
          if (extra.nums.length) for (const num of extra.nums) addTo(e, num, 'amended', header);
          else e.repealed = true;
        }
      }
      continue;
    }
    for (const point of points) {
      const head = instructionPart(point);
      // Anexele au articolele lor, cu aceleași numere ca ale legii („La anexa nr. 1, articolul 5”): nu le confundăm.
      if (/\banex/i.test(head)) {
        unresolved(point, 'anexă');
        continue;
      }
      const refs = [...head.matchAll(ART_REF)].map(articleNum);
      if (NEW_ARTICLE.test(head) || INSERTS_AFTER.test(head)) {
        // „După articolul 7^1 se introduce un nou articol, art. 7^2”: articolul nou nu există încă în lege. Un număr nou
        // egal cu cel după care se introduce e o greșeală de recunoaștere („art. 30t” în loc de „art. 30¹”).
        const [anchor, ...created] = refs;
        const valid = created.filter((num) => num !== anchor);
        if (valid.length) for (const num of valid) add(num, 'new', point);
        else unresolved(point, 'articolul nou nu are număr citibil');
        continue;
      }
      // „Articolele 10 și 11 se abrogă”, „La articolul 3 alineatul (2) și articolul 4…”: toată lista.
      const own = articleNums(head);
      const nums = own.length ? own : headerNums;
      if (nums.length) for (const num of nums) add(num, 'amended', point);
      // „Titlul legii se modifică”, „La capitolul II, titlul…”: nu e un articol.
      else unresolved(point, /\btitl|\bcapitol|\bsec[țţ]iun|\bpartea\b|\bcartea\b|\bmen[țţ]iun|\bnota\b/i.test(head) ? NOT_ARTICLE : 'punctul nu numește un articol');
    }
  }
  // „Legea nr. … se modifică după cum urmează:” urmat de „Articol unic” și abia apoi de „La articolul 24 din Legea nr. …”
  // (Pl-x 43/2026): rândul de început fără articol nu e o instrucțiune pierdută dacă actul are articole din alt rând.
  return [...acts.values()].map(({ articles, unresolved, repealed, ...act }) => ({
    ...act,
    ...(repealed && { repealed: true }),
    articles: [...articles.values()],
    unresolved: articles.size ? unresolved.filter((u) => u.reason !== NO_ARTICLE) : unresolved,
  }));
}
const NO_ARTICLE = 'instrucțiunea nu numește un articol';
// „Capitolul II din Legea nr. …”, „Titlul III al Codului…” se abrogă: o parte a actului, nu actul întreg.
const STRUCTURE = /\b(?:anex\w*|capitol\w*|sec[țţ]iun\w*|titl\w*|part(?:ea|ii)|cart(?:ea|ii)|punct\w*|pct\.|alin\w*|lit\.|liter\w*)\s+(?:nr\.\s*)?(?:[IVXL]+\b|\d|[a-z]\)|a\s)/i;
const NOT_ARTICLE = 'nu e un articol (titlu, capitol, secțiune, mențiunea de transpunere)';

export const actKey = (act) => `${act.tipAct} ${act.numar}/${act.an}`;

/**
 * Forma pe care o analizează straja-council: la Senat a inițiatorului, la Cameră cea mai nouă dintre cele citite.
 * La legile de aprobare, textul ordonanței vine după lege, ca în prompt: și ordonanța poate modifica alte legi.
 * @returns {{ form: string, textFile: string, text: string } | null}
 */
export function analysedForm(slug, { chamber, form: wanted } = {}) {
  const dir = path.join(TEXT_DIR, slug);
  const texts = {};
  for (const name of [...Object.values(FORMS), 'forma_ordonanta']) {
    const file = path.join(dir, `${name}.txt`);
    if (fs.existsSync(file)) texts[name] = fs.readFileSync(file, 'utf8');
  }
  const form = wanted ?? (chamber ? Object.keys(FORMS).find((k) => texts[FORMS[k]]?.trim()) : 'initiator');
  return form ? formText(texts, form) : null;
}

/** Textul unei forme din textele proiectului ({ forma_…: text }), cu ordonanța după el, ca în councilInput. */
export function formText(texts, form) {
  const main = texts[FORMS[form]] ?? '';
  if (!main.trim()) return null;
  const oug = texts.forma_ordonanta ?? '';
  return { form, textFile: FORMS[form], text: oug ? `${main}\n\n[TEXTUL ORDONANȚEI]\n${oug}` : main };
}

export const textHashOf = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);

// ─── Actele, o dată pe zi ───────────────────────────────────────────────────────────────────────────────────────

export const bucharestDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(d);
const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};
const cacheFile = (key) => path.join(ACT_CACHE, `${key.normalize('NFD').replace(/[^\w]+/g, '_')}.json`);

/** Amprenta unor articole: aceeași doar dacă textul, eticheta și notele sunt aceleași. */
export const articlesHash = (articles) =>
  crypto.createHash('sha256').update(JSON.stringify(articles.map((a) => [a.num, a.label, a.content ?? a.text, a.notes]))).digest('hex').slice(0, 16);

// Citirea și scrierea indexului, sub un lacăt (un dosar: mkdir e atomic), ca două procese care salvează deodată să nu-și
// piardă actele unul altuia. Un lacăt mai vechi de 30 de secunde e al unui proces oprit la mijloc.
const INDEX_LOCK = path.join(ROOT, '.cache', 'legislatie', 'index-lock');
function withIndexLock(fn) {
  fs.mkdirSync(path.dirname(INDEX_LOCK), { recursive: true });
  for (let i = 0; ; i++) {
    try {
      fs.mkdirSync(INDEX_LOCK);
      break;
    } catch {
      try {
        if (Date.now() - fs.statSync(INDEX_LOCK).mtimeMs > 30_000) fs.rmSync(INDEX_LOCK, { recursive: true, force: true });
      } catch {}
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
  try {
    return fn();
  } finally {
    fs.rmSync(INDEX_LOCK, { recursive: true, force: true });
  }
}

export function readActsIndex() {
  return readJson(ACTS_INDEX) ?? {};
}

/**
 * Actele cerute în rularea asta, cu numărul de cereri. Un act găsit sau negăsit azi nu se mai cere până mâine (și
 * între procese, prin .cache); o eroare a portalului nu se ține minte, ca rularea următoare să încerce din nou.
 */
export function actStore({ refresh = false } = {}) {
  const index = readActsIndex();
  const memo = new Map();
  const touched = new Set();
  const stats = { cached: 0, fetched: 0, failed: 0 };
  const today = bucharestDay();
  async function load(act) {
    const key = actKey(act);
    const cached = readJson(cacheFile(key));
    if (cached && cached.day === today && !(refresh && !cached.refreshed)) {
      stats.cached++;
      return cached;
    }
    // Adresa găsită o dată nu se mai caută: o singură cerere, pagina actului.
    const known = index[key]?.url;
    let res;
    try {
      res = await fetchAct(act, known ? { url: known } : {});
    } catch (err) {
      stats.failed++;
      throw err;
    }
    stats.fetched++;
    const entry = {
      key,
      day: today,
      fetchedAt: new Date().toISOString(),
      found: res.found,
      ...(res.found ? { url: res.url, title: res.title ?? index[key]?.title ?? null, hash: articlesHash(res.articles), articles: res.articles } : { reason: res.reason }),
      ...(refresh && { refreshed: true }),
    };
    writeFileAtomic(cacheFile(key), JSON.stringify(entry));
    const prev = index[key];
    touched.add(key);
    index[key] = {
      tipAct: act.tipAct,
      numar: act.numar,
      an: act.an,
      found: res.found,
      ...(res.found ? { url: entry.url, title: entry.title, hash: entry.hash, articles: res.articles.length } : { reason: res.reason }),
      checkedAt: entry.fetchedAt,
      // Ziua în care s-a văzut ultima dată un text schimbat: rularea zilnică reface proiectele care țin de act.
      changedAt: !prev || prev.hash !== entry.hash ? entry.fetchedAt : (prev.changedAt ?? prev.checkedAt),
    };
    return entry;
  }
  return {
    index,
    stats,
    get(act) {
      const key = actKey(act);
      if (!memo.has(key)) memo.set(key, load(act).catch((err) => (memo.delete(key), Promise.reject(err))));
      return memo.get(key);
    },
    // Doar actele cerute de procesul ăsta, peste indexul de pe disc: analizele Camerei pot rula în paralel cu altele.
    saveIndex() {
      if (!touched.size) return;
      withIndexLock(() => {
        const current = readActsIndex();
        for (const k of touched) current[k] = index[k];
        const sorted = Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b, 'ro')));
        writeFileAtomic(ACTS_INDEX, `${JSON.stringify(sorted, null, 2)}\n`);
      });
    },
  };
}

// Articolele cu același număr (o lege care aprobă un regulament are „Art. 1” și în anexă): luăm primul, din corpul
// legii, dar spunem că mai sunt; instrucțiunile despre anexe sunt deja deoparte (amendedArticles).
function articleMap(articles) {
  const map = new Map();
  for (const a of articles) {
    if (map.has(a.num)) map.get(a.num).duplicates++;
    else map.set(a.num, { ...a, duplicates: 0 });
  }
  return map;
}

/** Baza unui text: actele modificate, fiecare cu articolele găsite. Aruncă PortalError dacă portalul nu răspunde. */
export async function baselineForText(text, store) {
  const acts = [];
  for (const act of amendedArticles(text)) {
    const res = await store.get(act);
    const base = { reference: act.reference, tipAct: act.tipAct, numar: act.numar, an: act.an, ...(act.repealed && { repealed: true }) };
    if (!res.found) {
      acts.push({ ...base, status: 'not-found', reason: res.reason, fetchedAt: res.fetchedAt, articles: act.articles, unresolved: act.unresolved });
      continue;
    }
    const byNum = articleMap(res.articles);
    const articles = act.articles.map((a) => {
      const found = byNum.get(a.num);
      if (a.status === 'new') return found ? { ...a, exists: true } : a;
      if (!found) return { ...a, status: 'not-found', reason: 'articolul nu apare în forma consolidată' };
      return { ...a, status: 'found', label: found.label, text: found.content, notes: found.notes, ...(found.duplicates && { duplicates: found.duplicates }) };
    });
    // Un act abrogat în întregime: câte articole are și, dacă e scurt, tot textul lui (în prompt intră doar dacă e loc).
    let whole = {};
    if (act.repealed) {
      const chars = res.articles.reduce((n, a) => n + a.content.length, 0);
      whole = { actArticles: res.articles.length, actChars: chars, ...(chars <= REPEALED_KEEP && { actText: res.articles.map((a) => ({ num: a.num, label: a.label, text: a.content })) }) };
    }
    acts.push({ ...base, status: 'found', url: res.url, title: res.title, fetchedAt: res.fetchedAt, hash: res.hash, ...whole, articles, unresolved: act.unresolved });
  }
  return acts;
}

export const baselineFile = (slug, form, { version = false } = {}) =>
  version ? path.join(BASELINE_DIR, 'versions', slug, `${form}.json`) : path.join(BASELINE_DIR, `${slug}.json`);

// Ce se compară când se reface o bază: fără datele cererilor, ca un act recitit, dar neschimbat, să nu rescrie fișierul.
const content = (acts) => JSON.stringify(acts.map(({ fetchedAt, ...a }) => a));

/**
 * Baza unui proiect pentru o formă, scrisă în `file` doar dacă s-a schimbat ceva. Întoarce obiectul scris (sau cel de
 * dinainte, dacă e același) și dacă s-a scris.
 */
export async function buildBaseline({ billId, slug, form, textFile, text }, store, file = baselineFile(slug, form)) {
  const textHash = textHashOf(text);
  const acts = await baselineForText(text, store);
  const prev = readJson(file);
  if (prev && prev.method === BASELINE_METHOD && prev.textHash === textHash && prev.form === form && content(prev.acts) === content(acts)) {
    return { baseline: prev, written: false };
  }
  const out = { billId, slug, form, textFile, textHash, method: BASELINE_METHOD, fetchedAt: new Date().toISOString(), source: 'legislatie.just.ro', note: NOTE, acts };
  writeFileAtomic(file, `${JSON.stringify(out, null, 2)}\n`);
  return { baseline: out, written: true };
}

/** Baza salvată, dacă e a acestui text și a acestei metode; altfel null. */
export function storedBaseline(file, { form, text }) {
  const b = readJson(file);
  return b && b.method === BASELINE_METHOD && b.form === form && b.textHash === textHashOf(text) ? b : null;
}

// ─── În promptul analizei ───────────────────────────────────────────────────────────────────────────────────────

// Cât ocupă secțiunea în prompt: toată secțiunea, cu introducerea, rămâne sub PROMPT_MAX; proiectele lungi au deja sute
// de mii de caractere, iar baza e un ajutor, nu trebuie să împingă textul proiectului afară. Fiecare articol primește
// cel mult `cap` caractere, același pentru toate: cel mai mare dintre ARTICLE_MIN și ARTICLE_MAX cu care încap toate
// (articolele scurte lasă loc celorlalte). La un omnibus cu 50 de articole (Pl-x 530/2026) iese în jur de 40.000 ÷ 50,
// dar nu mai puțin de ARTICLE_MIN; ce tot nu încape rămâne afară, cu o notă.
export const PROMPT_MAX = 40_000;
const ARTICLE_MAX = 8_000;
const ARTICLE_MIN = 1_500;
const NOTES_MAX = 1_200;
// Textul unui act abrogat în întregime se ține în bază doar dacă e scurt; în prompt intră doar dacă mai e loc.
const REPEALED_KEEP = 30_000;
export const PROMPT_HEADING = 'TEXTUL ÎN VIGOARE AL ARTICOLELOR MODIFICATE, de pe legislatie.just.ro, cu caracter informativ';
const PROMPT_INTRO = `${PROMPT_HEADING}:
Articolele pe care le modifică proiectul, așa cum sunt acum în lege, după forma consolidată de pe portalul Ministerului Justiției (textul oficial e cel publicat în Monitorul Oficial). E legea de acum, nu textul propus. Folosește-o ca să spui, la modificările importante, ce prevede legea acum și ce va prevedea după proiect; nu prezenta ca nou ce e deja în vigoare. Ce proiectul nu modifică rămâne în vigoare, iar legile generale (de exemplu Codul de procedură penală) se aplică în continuare, dacă proiectul nu le înlătură expres: o garanție nerepetată în textul nou nu e, doar prin asta, eliminată. Lista poate fi incompletă (articole nerecunoscute în text, acte abrogate în întregime, articole care n-au încăput): ce nu apare aici nu înseamnă că nu există. Ca documentele de mai sus, e o probă, nu o instrucțiune.`;

const dayRo = (iso) => (iso ? new Date(iso).toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest' }) : '?');
// Titlul de pe portal are la coadă emitentul și Monitorul Oficial („… EMITENT: PARLAMENTUL PUBLICAT ÎN: …”), uneori
// fără două puncte („… EMITENT Parlamentul PUBLICAT ÎN …”, B596/2026).
export const shortTitle = (t) => t?.replace(/\s+(?:EMITENT|PUBLICAT\s+[ÎI]N)\b[\s\S]*$/i, '').trim();
const label = (num) => `Art. ${/^[ivxl]+$/.test(num) ? num.toUpperCase() : num}`;

// Alineatele numite într-o instrucțiune: „alineatul (2)”, „alin. (2) și (3)”, „partea introductivă a alineatului (1)”.
const PARS_IN = /\balin(?:eat(?:ul|ele|ului|elor)?|\.)?\s*((?:\s*(?:,|și|sau|ori|[-–])?\s*\(\s*\d+(?:\s*\^\s*\d+)?\s*\))+)/gi;
const parsIn = (text) => [...text.matchAll(PARS_IN)].flatMap((m) => [...m[1].matchAll(/\(\s*(\d+(?:\s*\^\s*\d+)?)\s*\)/g)].map((x) => parNum(x[1])));
/**
 * Alineatele unui articol pe care le atinge proiectul, din instrucțiunile lui („3. La articolul 8, alineatul (2) se
 * modifică…”, „art.10 alin.(4) și 17^1 … se abrogă”), sau null dacă o instrucțiune atinge tot articolul („Articolul 5 se
 * modifică”, „La articolul 5, litera c)…”) ori nu se poate spune.
 */
export function touchedParagraphs(instructions, num) {
  const out = new Set();
  for (const ins of instructions ?? []) {
    const head = instructionPart(normalize(ins));
    const items = articleRuns(head).flatMap((r) => r.items);
    const item = items.find((i) => i.num === num);
    const pars = item?.paragraphs.length ? item.paragraphs : items.length <= 1 ? parsIn(head) : [];
    if (!pars.length) return null;
    for (const p of pars) out.add(p);
  }
  return out.size ? [...out] : null;
}

// „(2^1) …”: începutul unui alineat în textul de pe portal.
const PAR_LINE = /^\((\d+(?:\^\d+)?)\)/;
/**
 * Articolul tăiat la `cap` caractere, la margine de alineat (sau de rând, dacă nu are alineate). Alineatele pe care le
 * atinge proiectul (`touched`) intră primele; locul rămas se umple cu celelalte, în ordine. Ce lipsește e marcat cu „[…]”.
 */
export function cutArticle(text, cap, touched = null) {
  if (text.length <= cap) return text;
  const lines = text.split('\n');
  const hasPars = lines.some((l) => PAR_LINE.test(l));
  const units = [];
  for (const line of lines) {
    const m = PAR_LINE.exec(line);
    if (!hasPars || m || !units.length) units.push({ par: m ? m[1] : null, text: line });
    else units.at(-1).text += `\n${line}`;
  }
  const want = new Set(touched ?? []);
  const kept = units.map(() => null);
  let room = cap;
  const take = (i) => {
    if (units[i].text.length + 1 > room) return false;
    kept[i] = units[i].text;
    room -= units[i].text.length + 1;
    return true;
  };
  // Începutul unui alineat prea lung: rândurile care încap, sau primele cuvinte.
  const partial = (i) => {
    if (room < 200) return;
    const lines = units[i].text.split('\n');
    const out = [];
    for (const line of lines) {
      if (line.length + 1 <= room) {
        out.push(line);
        room -= line.length + 1;
        continue;
      }
      const words = line.slice(0, room - 4).replace(/\s+\S*$/, '');
      if (!out.length && words.length >= 100) {
        out.push(`${words} […]`);
        room -= words.length + 5;
      }
      break;
    }
    if (out.length) kept[i] = out.length < lines.length && !out.at(-1).endsWith('[…]') ? `${out.join('\n')}\n[…]` : out.join('\n');
  };
  const touchedIdx = units.map((u, i) => (u.par && want.has(u.par) ? i : -1)).filter((i) => i >= 0);
  if (touchedIdx.length) {
    if (units[0].par === null && units[0].text.length <= 300) take(0);
    for (const i of touchedIdx) if (!take(i)) partial(i);
    for (let i = 0; i < units.length; i++) if (kept[i] === null) take(i);
  } else {
    for (let i = 0; i < units.length; i++) {
      if (take(i)) continue;
      partial(i);
      break;
    }
  }
  const out = [];
  let shown = 0;
  units.forEach((u, i) => {
    if (kept[i] !== null) {
      out.push(kept[i]);
      shown += kept[i].length;
    } else if (!out.at(-1)?.endsWith('[…]')) out.push('[…]');
  });
  const pars = touchedIdx.map((i) => `(${units[i].par})`).join(', ');
  out.push(`[ARTICOL PRESCURTAT: lipsesc ${Math.max(0, text.length - shown)} de caractere, marcate cu […]${pars ? `; s-au păstrat întâi alineatele atinse de proiect: ${pars}` : ''}]`);
  return out.join('\n');
}

// Notele de modificare de sub articol („(la 31-08-2026, Articolul 2 … a fost modificat de …)”), întregi, cât încap.
function notesBlock(notes, cap) {
  if (!notes?.length) return '';
  const out = [];
  let used = 0;
  for (const n of notes) {
    if (used + n.length + 1 > cap) break;
    out.push(n);
    used += n.length + 1;
  }
  const left = notes.length - out.length;
  if (left) out.push(`[încă ${left} ${left === 1 ? 'notă' : 'note'} de modificare]`);
  return `\n${out.join('\n')}`;
}

function articleBlock(a, cap) {
  // Textul de pe portal începe cu eticheta („Articolul 3”), pe care o scriem deja în rândul de deasupra.
  const own = a.label && a.text.startsWith(a.label) ? a.text.slice(a.label.length).replace(/^\s*\n/, '') : a.text;
  const body = cutArticle(own, cap, touchedParagraphs(a.instructions, a.num));
  // Când nu e loc, textul articolului contează mai mult decât istoria lui: notele primesc o parte mică din cap.
  const notes = notesBlock(a.notes, cap >= ARTICLE_MAX ? NOTES_MAX : Math.min(NOTES_MAX, Math.floor(cap / 8)));
  return `--- ${a.label || label(a.num)}, în vigoare:\n${body}${notes}`;
}

/**
 * Secțiunea din prompt și ce se înregistrează în analiză. `text` e null când proiectul nu modifică un act găsit în text.
 * @returns {{ text: string|null, meta: object }}
 */
export function baselinePrompt(baseline, file, { max: total = PROMPT_MAX } = {}) {
  // Loc pentru introducere și nota de la final, ca toată secțiunea să rămână sub limită.
  const max = total - PROMPT_INTRO.length - 100;
  const meta = {
    method: baseline.method,
    file: path.relative(ROOT, file),
    form: baseline.form,
    textHash: baseline.textHash,
    fetchedAt: baseline.fetchedAt,
    acts: baseline.acts.length,
    actsFound: baseline.acts.filter((a) => a.status === 'found').length,
    actsRepealed: baseline.acts.filter((a) => a.repealed).length,
    articlesFound: baseline.acts.flatMap((a) => a.articles).filter((a) => a.status === 'found').length,
    articlesShown: 0,
    articleCap: ARTICLE_MAX,
    articlesCut: 0,
    chars: 0,
    truncated: false,
  };
  if (!baseline.acts.length) return { text: null, meta: { ...meta, included: false, reason: 'proiectul nu modifică un act numit în text' } };

  // Bucățile secțiunii, în ordine; ale articolelor găsite depind de cap.
  const pieces = [];
  for (const act of baseline.acts) {
    const name = `${act.reference}${act.title ? ` (${shortTitle(act.title)})` : ''}`;
    // Și rândurile actelor intră în limită: un proiect-omnibus modifică zeci de acte (PL-x 41/2026).
    const head = act.status === 'found' ? `\n=== ${name}, forma consolidată preluată pe ${dayRo(act.fetchedAt)}: ${act.url}` : `\n=== ${name}: actul nu a fost găsit pe legislatie.just.ro (${act.reason}).`;
    pieces.push({ kind: 'head', act, text: () => head });
    if (act.repealed) {
      const n = act.actArticles;
      pieces.push({ kind: 'repealed', act, text: () => `--- Proiectul abrogă actul în întregime${n ? ` (${n} ${n === 1 ? 'articol' : 'articole'})` : ''}.` });
    }
    if (act.status !== 'found') continue;
    for (const a of act.articles) {
      if (a.status === 'found') pieces.push({ kind: 'article', act, a, text: (cap) => articleBlock(a, cap) });
      else if (a.status === 'new') pieces.push({ kind: 'other', act, text: () => `--- ${label(a.num)}: articol nou, introdus de proiect; nu există încă în lege.` });
      else pieces.push({ kind: 'other', act, text: () => `--- ${label(a.num)}: nu apare în forma consolidată de pe portal.` });
    }
  }
  const size = (cap) => pieces.reduce((n, p) => n + p.text(cap).length + 1, 0);
  let cap = ARTICLE_MAX;
  if (size(ARTICLE_MAX) > max) {
    let lo = ARTICLE_MIN;
    let hi = ARTICLE_MAX - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (size(mid) <= max) lo = mid;
      else hi = mid - 1;
    }
    cap = lo;
  }
  meta.articleCap = cap;

  const parts = [];
  const repealedAt = [];
  let used = 0;
  let left = 0;
  let skipAct = null;
  for (const p of pieces) {
    if (p.act === skipAct) continue;
    const s = p.text(cap);
    if (used + s.length + 1 > max) {
      meta.truncated = true;
      // Fără rândul actului nu are rost nimic din el.
      if (p.kind === 'head') {
        left += p.act.articles.length;
        skipAct = p.act;
      } else if (p.kind !== 'repealed') left++;
      continue;
    }
    parts.push(s);
    used += s.length + 1;
    if (p.kind === 'article') {
      meta.articlesShown++;
      if (s.includes('[ARTICOL PRESCURTAT:')) meta.articlesCut++;
    }
    if (p.kind === 'repealed') repealedAt.push({ index: parts.length - 1, act: p.act });
  }
  // Textul actelor abrogate în întregime, doar în locul rămas după articolele modificate.
  for (const { index, act } of repealedAt) {
    if (act.status !== 'found') continue;
    const body = act.actText?.length ? ` Textul lui în vigoare:\n${act.actText.map((x) => x.text).join('\n')}` : null;
    const add = body && used + body.length <= max ? body : ` Textul lui${act.actChars ? ` (${act.actChars} de caractere)` : ''} nu a încăput aici.`;
    parts[index] += add;
    used += add.length;
  }
  if (left) parts.push(`\n[NU AU ÎNCĂPUT: încă ${left} articole din actele de mai sus]`);
  const text = `${PROMPT_INTRO}\n${parts.join('\n')}`;
  meta.chars = text.length;
  meta.included = true;
  meta.key = crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
  return { text, meta };
}

/**
 * Baza pentru analiza unui proiect (straja-council, COUNCIL_BASELINE=1): cea salvată, dacă e a acestui text, altfel o
 * face acum (actele din cache-ul zilei sau de pe portal, cu aceeași pauză între procese). `version`: forma cerută de o
 * comparație (--versions), salvată separat. Dacă portalul nu răspunde, analiza merge mai departe fără bază.
 */
export async function baselineForAnalysis({ billId, slug, form, textFile, text }, { version = false } = {}) {
  const main = baselineFile(slug, form);
  const file = version ? baselineFile(slug, form, { version: true }) : main;
  const mainStored = storedBaseline(main, { form, text });
  if (mainStored) return baselinePrompt(mainStored, main);
  const versionStored = version ? storedBaseline(file, { form, text }) : null;
  if (versionStored) return baselinePrompt(versionStored, file);
  try {
    const store = actStore();
    const { baseline } = await buildBaseline({ billId, slug, form, textFile, text }, store, file);
    store.saveIndex();
    return baselinePrompt(baseline, file);
  } catch (err) {
    if (!(err instanceof PortalError)) throw err;
    return { text: null, meta: { method: BASELINE_METHOD, form, included: false, reason: `legislatie.just.ro nu a răspuns: ${err.message}` } };
  }
}

export { PortalError };
