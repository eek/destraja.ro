#!/usr/bin/env node
// Textul în vigoare al articolelor pe care le modifică fiecare proiect, ca bază pentru analiză. Determinist, fără modele:
// citește din forma inițiatorului actul modificat („Legea nr. 51/1995 … se modifică”) și articolele atinse („1. La
// articolul 3…”), apoi ia forma consolidată la zi a acelor articole de pe legislatie.just.ro (scripts/lib/legislatie.mjs).
// Ce nu se găsește apare explicit ca negăsit, nu se ghicește. Dacă portalul nu răspunde, proiectul nu se scrie și rămâne
// pentru rularea următoare. Rulează: node scripts/straja-baseline.mjs [--force] [--dry-run] [b563]
// --dry-run arată doar ce s-a citit din texte, fără cereri către portal.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { fetchAct, PortalError } from './lib/legislatie.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BILLS_FILE = path.join(ROOT, 'data', 'senat-bills.json');
const TEXT_DIR = path.join(ROOT, 'data', 'texts');
const OUT_DIR = path.join(ROOT, 'data', 'baseline');
const MAX_PORTAL_FAILURES = 3;

const args = process.argv.slice(2);
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');
const only = args.find((a) => !a.startsWith('--'))?.toLowerCase();

const NOTE =
  'Forma consolidată de pe legislatie.just.ro are caracter informativ; textul oficial este cel publicat în Monitorul Oficial.';

// Numărul unui articol, ca pe portal: „7^1”, „1270” (scris „1.270”).
const NUM = String.raw`(\d{1,3}(?:\.\d{3})+|\d+)(?:\s*\^\s*(\d+))?`;
const ART_REF = new RegExp(String.raw`\b(?:articol(?:ul|ului)|art\.)\s*${NUM}`, 'gi');
const AMENDS = /\bse\s+(?:modific[ăa]|completeaz[ăa]|abrog[ăa]|introduc)|va\s+avea\s+urm[ăa]torul\s+cuprins/i;
// Un rând care deschide modificările unui act se termină ca o instrucțiune; „se completează cu prevederile Legii …”
// (trimitere, nu modificare) nu se termină așa.
const INSTRUCTION = /dup[ăa]\s+cum\s+urmeaz[ăa]|urm[ăa]torul\s+(?:cuprins|con[țţ]inut)|se\s+abrog[ăa]/i;
const NEW_ARTICLE = /\bse\s+introduc\w*\s+\S+\s+no(?:u|i)\s+articol/i;
// Articolul proiectului de la început de rând: „Art. I –”, „Articolul unic.”, „Art. 50. —” (legile noi numerotează arab).
// Numărul arab e urmat de punct sau liniuță; „Articolul 65 din Legea nr. …” e un articol al legii modificate.
const LABEL = /^\s*Art(?:icol(?:ul)?)?\.?\s*(?:([IVXL]+|unic)\b\.?|(\d+)(?:\.|\s*[-–—]))\s*[-–—:]?\s*/i;
const labelOf = (line) => {
  const m = LABEL.exec(line);
  return m ? (m[1] ?? m[2]) : null;
};
const POINT = /^\s*(?:\d+\.\s|[-–—•]\s*\S)/;
const ACT = new RegExp(
  String.raw`\b(?<kind>Leg(?:ea|ii)(?:-cadru)?|Ordonan[țţ](?:a|ei)\s+de\s+urgen[țţ][ăa]\s+a\s+Guvernului|Ordonan[țţ](?:a|ei)\s+Guvernului|` +
    String.raw`Hot[ăa]r[âa]r(?:ea|ii)\s+Guvernului|O\.?U\.?G\.?|O\.?G\.?|H\.?G\.?)` +
    String.raw`(?:\s+[^\s,;.()\d]+){0,6}?\s+nr\.\s*(?<numar>\d{1,4})` +
    String.raw`(?:\s*\/\s*(?<an>(?:19|20)\d{2})|\s+din\s+(?:\d{1,2}\s+\p{L}+\s+)?(?<an2>(?:19|20)\d{2}))\b`,
  'iu',
);

const SUPERSCRIPT = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
const normalize = (text) => text.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (s) => `^${[...s].map((c) => SUPERSCRIPT[c]).join('')}`);

const articleNum = (m) => `${m[1].replace(/\./g, '')}${m[2] ? `^${m[2]}` : ''}`;

function tipAct(kind) {
  const k = kind.toLowerCase();
  if (/urgen|^o\.?u/.test(k)) return 'ORDONANȚĂ DE URGENȚĂ';
  if (/^ordonan|^o\.?g/.test(k)) return 'ORDONANȚĂ';
  if (/^hot|^h\.?g/.test(k)) return 'HOTĂRÂRE';
  return 'LEGE';
}

function findAct(line) {
  const m = ACT.exec(line);
  if (!m) return null;
  const { kind, numar, an, an2 } = m.groups;
  return { tipAct: tipAct(kind), numar, an: an ?? an2, reference: m[0].replace(/\s+/g, ' '), index: m.index };
}

// Actul pe care îl modifică rândul, dacă rândul deschide modificări: actul e numit înaintea verbului.
function headerAct(line) {
  if (POINT.test(line) || !INSTRUCTION.test(line)) return null;
  const act = findAct(line);
  const verb = AMENDS.exec(line);
  return act && verb && verb.index > act.index ? act : null;
}

const short = (line) => (line.length > 300 ? `${line.slice(0, 300)}…` : line).trim();

/**
 * Actele modificate și articolele atinse, din forma inițiatorului. O secțiune începe la rândul care numește actul și
 * spune ce se schimbă („Art. I – Legea nr. … se modifică după cum urmează:”) și se termină la următorul articol al
 * proiectului („Art. II – …”). În fiecare secțiune, punctele („3. La articolul 8, alineatul (2) se modifică…”) dau
 * articolele. Un punct fără articol („1. Alineatul (2) se modifică…”) ține de articolul din rândul de început
 * („Articolul 183 din Legea nr. … se modifică”); fără puncte, rândul de început e chiar instrucțiunea.
 */
function amendedArticles(text) {
  const lines = normalize(text).split('\n').map((l) => l.trim()).filter(Boolean);
  const sections = [];
  let current = null;
  for (const line of lines) {
    const act = headerAct(line);
    // Secțiunea se termină la următorul articol al proiectului. Cu numerotare arabă, doar la numărul următor: textele
    // introduse încep și ele cu „Art. 7^1. —”.
    const label = labelOf(line);
    const closes = label && (/^\d+$/.test(label) ? current?.next === label : !/^\d+$/.test(label));
    if (act) {
      const header = line.replace(LABEL, '');
      const next = /^\d+$/.test(label ?? '') ? String(Number(label) + 1) : null;
      sections.push((current = { header, act: headerAct(header) ?? act, body: [], next }));
    } else if (closes) current = null;
    else current?.body.push(line);
  }

  const acts = new Map();
  for (const { header, act, body } of sections) {
    const key = `${act.tipAct} ${act.numar}/${act.an}`;
    if (!acts.has(key)) acts.set(key, { ...act, index: undefined, articles: new Map(), unresolved: [] });
    const entry = acts.get(key);
    const add = (num, status, instruction) => {
      if (!entry.articles.has(num)) entry.articles.set(num, { num, status, instructions: [] });
      entry.articles.get(num).instructions.push(short(instruction));
    };
    const headerArt = [...header.slice(0, act.index).matchAll(ART_REF)].pop();
    const headerNum = headerArt ? articleNum(headerArt) : null;
    const points = body.filter((l) => POINT.test(l) && AMENDS.test(l));
    if (!points.length) {
      if (headerNum) add(headerNum, 'amended', header);
      else entry.unresolved.push(short(header));
      continue;
    }
    for (const point of points) {
      if (NEW_ARTICLE.test(point)) {
        // „După articolul 7^1 se introduce un nou articol, art. 7^2”: articolul nou nu există încă în lege. Un număr nou
        // egal cu cel după care se introduce e o greșeală de recunoaștere („art. 30t” în loc de „art. 30¹”).
        const [anchor, ...created] = [...point.matchAll(ART_REF)].map(articleNum);
        const valid = created.filter((num) => num !== anchor);
        if (valid.length) for (const num of valid) add(num, 'new', point);
        else entry.unresolved.push(short(point));
        continue;
      }
      const ref = [...point.matchAll(ART_REF)][0];
      const num = ref ? articleNum(ref) : headerNum;
      if (num) add(num, 'amended', point);
      else entry.unresolved.push(short(point));
    }
  }
  return [...acts.values()].map(({ articles, unresolved, ...act }) => ({ ...act, articles: [...articles.values()], unresolved }));
}

function readText(slug) {
  const file = path.join(TEXT_DIR, slug, 'forma_initiatorului.txt');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

// Același act apare în mai multe proiecte (Codul fiscal, Codul rutier): îl cerem o singură dată pe rulare.
const actCache = new Map();
function cachedAct(act) {
  const key = `${act.tipAct} ${act.numar}/${act.an}`;
  if (!actCache.has(key)) actCache.set(key, fetchAct(act));
  return actCache.get(key);
}

async function baselineFor(bill, text) {
  const acts = [];
  for (const act of amendedArticles(text)) {
    const res = await cachedAct(act);
    const base = { reference: act.reference, tipAct: act.tipAct, numar: act.numar, an: act.an };
    if (!res.found) {
      acts.push({ ...base, status: 'not-found', reason: res.reason, articles: act.articles, unresolved: act.unresolved });
      continue;
    }
    const byNum = new Map(res.articles.map((a) => [a.num, a]));
    const articles = act.articles.map((a) => {
      if (a.status === 'new') return a;
      const found = byNum.get(a.num);
      if (!found) return { ...a, status: 'not-found' };
      return { ...a, status: 'found', label: found.label, text: found.content, notes: found.notes };
    });
    acts.push({ ...base, status: 'found', url: res.url, title: res.title, articles, unresolved: act.unresolved });
  }
  return acts;
}

async function main() {
  const bills = JSON.parse(fs.readFileSync(BILLS_FILE, 'utf8'));
  const selected = bills.filter((b) => !only || b.slug === only || b.slug.startsWith(`${only}-`));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let written = 0;
  let skipped = 0;
  let portalFailures = 0;
  const failed = [];
  for (const bill of selected) {
    const text = readText(bill.slug);
    if (!text) continue;
    if (dryRun) {
      const acts = amendedArticles(text);
      console.log(`${bill.id}: ${acts.length ? '' : 'nu modifică un act'}`);
      for (const a of acts) {
        const list = (s) => a.articles.filter((x) => x.status === s).map((x) => x.num).join(', ') || '-';
        console.log(`  ${a.reference} → modificate: ${list('amended')} · noi: ${list('new')}${a.unresolved.length ? ` · fără articol: ${a.unresolved.length}` : ''}`);
      }
      continue;
    }
    const textHash = crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
    const outPath = path.join(OUT_DIR, `${bill.slug}.json`);
    if (!force && fs.existsSync(outPath)) {
      const prev = JSON.parse(fs.readFileSync(outPath, 'utf8'));
      if (prev.textHash === textHash) {
        skipped++;
        continue;
      }
    }
    try {
      const acts = await baselineFor(bill, text);
      const out = { billId: bill.id, slug: bill.slug, textHash, fetchedAt: new Date().toISOString(), source: 'legislatie.just.ro', note: NOTE, acts };
      fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
      written++;
      portalFailures = 0;
      const arts = acts.flatMap((a) => a.articles);
      const count = (s) => arts.filter((a) => a.status === s).length;
      console.log(
        `${bill.id}: ${acts.length ? acts.map((a) => `${a.reference}${a.status === 'found' ? '' : ' (negăsit)'}`).join('; ') : 'nu modifică un act'}` +
          (arts.length ? ` · articole: ${count('found')} găsite, ${count('not-found')} negăsite, ${count('new')} noi` : ''),
      );
    } catch (err) {
      if (!(err instanceof PortalError)) throw err;
      failed.push(bill.id);
      console.error(`${bill.id}: legislatie.just.ro nu a răspuns (${err.message}); rămâne pentru rularea următoare`);
      if (++portalFailures >= MAX_PORTAL_FAILURES) {
        console.error(`Opresc: ${MAX_PORTAL_FAILURES} erori la rând de la legislatie.just.ro.`);
        break;
      }
    }
  }
  console.log(`Gata: ${written} scrise, ${skipped} neschimbate${failed.length ? `, ${failed.length} cu portalul indisponibil (${failed.join(', ')})` : ''}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
