// Prospețimea rezultatelor derivate: tot ce facem dintr-o analiză sau din textul unui proiect („ce e bine și ce strică”,
// scorurile pe forme, comparațiile formelor, amendamentele legate de ele, memoriile .docx) ține minte din ce a fost
// făcut (`basis`): amprenta textului, cheia textului în vigoare din prompt, ce a luat din analiza principală și versiunea
// instrucțiunilor. Aici se compară ce a ținut minte cu intrările de acum.
//
// De ce: pe 24 noiembrie 2026 analizele principale au fost refăcute cu tot textul și cu legea în vigoare, dar listele
// „ce e bine și ce strică” (799 din 934) și scorurile pe forme (356 din 375) au rămas de dinainte, iar site-ul le arăta ca
// actuale. De acum: scripts/check-fresh.mjs le numără în rularea zilnică, înaintea pașilor care le fac; fiecare pas își ia
// coada de aici (cele mai riscante întâi), iar site-ul arată un rezultat învechit doar cu nota „din analiza anterioară,
// se actualizează” (src/lib/fresh.ts).
//
// Un rezultat fără `basis` (făcut înainte de 26 noiembrie 2026) se judecă după ce a ținut minte atunci: metoda, schema,
// ziua și cheia lui de intrare. Când schimbi instrucțiunile unui pas, crește-i versiunea de mai jos: tot ce a făcut cu
// versiunea veche devine învechit și se reface în bugetul lui zilnic.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { BASELINE_METHOD, baselinePrompt, textHashOf } from './baseline.mjs';

export const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// ─── Versiunile instrucțiunilor ─────────────────────────────────────────────────────────────────────────────────
/** Analiza consiliului (principală și pe forme): tot textul normativ (din 18 noiembrie 2026). */
export const COUNCIL_METHOD = 'whole-text-v1';
/** Ce intră în promptul analizei: metoda citirii și a textului în vigoare. */
export const ANALYSIS_PROMPT = `${COUNCIL_METHOD}+${BASELINE_METHOD}`;
/** Comparația a două forme (straja-council --versions); istoria ei e lângă compareVersions. */
export const COMPARE_SCHEMA = 4;
/** „Ce e bine și ce strică” (straja-balance): 2 = cu legea în vigoare (26 noiembrie 2026). */
export const BALANCE_SCHEMA = 2;
/** Amendamentele din rapoartele comisiilor (straja-amendments). */
export const AMENDMENTS_SCHEMA = 3;
/** Memoriul .docx pentru Senat (straja-docx). */
export const DOCX_VERSION = 1;

export const TYPES = ['analysis', 'forms', 'versions', 'balance', 'amendments', 'docx'];
/** Numele pe înțeles, pentru jurnal și /admin. */
export const TYPE_LABEL = {
  analysis: 'analize principale',
  forms: 'scoruri pe forme',
  versions: 'comparațiile formelor',
  balance: 'ce e bine și ce strică',
  amendments: 'amendamente legate de schimbări',
  docx: 'memorii .docx',
};

const sha = (s, n = 16) => crypto.createHash('sha256').update(s).digest('hex').slice(0, n);
const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};
const senate = (slug) => /^b\d/.test(slug);

/** Codul de la finalul textului din prompt (councilInput în straja-council): amprenta textului citit de modele. */
export const markerOf = (fg) => (fg ? `SF-${sha(fg, 8).toUpperCase()}` : null);
/** Textul dat modelelor: forma, cu ordonanța după ea la legile de aprobare. */
export const withOrdinance = (main, oug) => (oug ? `${main}\n\n[TEXTUL ORDONANȚEI]\n${oug}` : main);

const CHAMBER_TEXT = { camera: 'forma_camera', senat: 'forma_senat', initiator: 'forma_initiatorului' };
/**
 * Fișierul de text al unei forme. `versionFile`: analiza unei forme din data/analyses/versions, unde la Senat
 * „initiator” e forma inițială, înlocuită de cea actualizată (B563/2026).
 */
export function textNameOf(slug, form, { versionFile = false } = {}) {
  if (form === 'actualizata' || form === 'proiect') return 'forma_initiatorului';
  if (versionFile && form === 'initiator' && senate(slug)) return 'forma_initiatorului_initiala';
  return CHAMBER_TEXT[form] ?? null;
}
/** Forma sub care e salvată baza (data/baseline) pentru un fișier de text. */
export const baselineFormOf = (textName) =>
  ({ forma_initiatorului_initiala: 'initiala', forma_initiatorului: 'initiator', forma_senat: 'senat', forma_camera: 'camera' })[textName] ?? null;

/** Ce a ținut minte o analiză despre textul în vigoare: cheia secțiunii, „no-acts”, „missing” sau „none” (fără bază). */
export function recordedBaseline(meta) {
  if (!meta) return 'none';
  if (meta.key) return meta.key;
  if (meta.included === false && /nu modifică/.test(meta.reason ?? '')) return 'no-acts';
  return 'missing';
}

/** Constatările unei forme pe care le primește comparația: ale lui Claude, altfel ale primului model care a răspuns. */
export function compareFindings(an) {
  return (an?.council?.claude?.keyFindings ?? Object.values(an?.council ?? {}).find((r) => r?.status === 'ok')?.keyFindings ?? [])
    .slice(0, 4)
    .map((f) => `- ${f}`)
    .join('\n');
}

/** Ce intră din proiect și din analiză într-un memoriu .docx. */
export const docxDigest = (bill, analysis) =>
  sha(JSON.stringify([bill.id, bill.cod, bill.officialTitle, bill.consultationDeadline, analysis.consensus]));

/** Schimbările făcute de Cameră, din comparația formelor, cum le citește straja-amendments (cu id-ul lor stabil). */
export function chamberChanges(summary) {
  return (summary?.changes ?? []).flatMap((c, ci) =>
    c.to === 'camera'
      ? (c.changes ?? []).map((x, ii) => ({ id: `${ci}:${ii}`, article: x.article, title: x.title, effect: x.effect, after: x.after, before: x.before }))
      : [],
  );
}
export const changesDigest = (changes) => sha(JSON.stringify(changes));

/** Diferențele dintre ce a ținut minte un rezultat și intrările de acum, ca listă de motive ([] = la zi). */
export function basisReasons(stored, current) {
  if (!stored) return ['fără-amprentă'];
  return Object.keys(current).filter((k) => current[k] !== undefined && String(stored[k]) !== String(current[k]));
}

// ─── Intrările unui proiect, citite o dată ──────────────────────────────────────────────────────────────────────
export class Inputs {
  constructor(root = DEFAULT_ROOT) {
    this.root = root;
    this.cache = new Map();
  }
  memo(key, fn) {
    if (!this.cache.has(key)) this.cache.set(key, fn());
    return this.cache.get(key);
  }
  file(...parts) {
    return path.join(this.root, ...parts);
  }
  json(...parts) {
    return this.memo(`json:${parts.join('/')}`, () => readJson(this.file(...parts)));
  }
  analysis(slug) {
    return this.json('data', 'analyses', `${slug}.json`);
  }
  texts(slug) {
    return this.memo(`texts:${slug}`, () => {
      const dir = this.file('data', 'texts', slug);
      if (!fs.existsSync(dir)) return {};
      return Object.fromEntries(fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).map((f) => [f.slice(0, -4), fs.readFileSync(path.join(dir, f), 'utf8')]));
    });
  }
  /** Textul dat modelelor pentru un fișier de text (cu ordonanța), sau null. */
  formText(slug, textName) {
    const t = this.texts(slug);
    const main = textName && t[textName];
    return main?.trim() ? withOrdinance(main, t.forma_ordonanta ?? '') : null;
  }
  /**
   * Cheia textului în vigoare pe care l-ar primi acum promptul pentru un text: ca baselineForAnalysis, întâi baza
   * principală, apoi cea a formei (versionFallback). „no-acts” când textul nu modifică un act, „missing” fără bază salvată.
   */
  baselineKey(slug, textName, { versionFallback = true } = {}) {
    const form = baselineFormOf(textName);
    const text = this.formText(slug, textName);
    if (!form || !text) return 'missing';
    return this.memo(`bl:${slug}:${textName}:${versionFallback}`, () => {
      const th = textHashOf(text);
      const files = [this.file('data', 'baseline', `${slug}.json`), ...(versionFallback ? [this.file('data', 'baseline', 'versions', slug, `${form}.json`)] : [])];
      for (const file of files) {
        const b = readJson(file);
        if (b && b.method === BASELINE_METHOD && b.form === form && b.textHash === th) return baselinePrompt(b, file).meta.key ?? 'no-acts';
      }
      return 'missing';
    });
  }
  risk(slug) {
    return this.analysis(slug)?.consensus?.riskScore ?? 0;
  }
  slugsIn(...parts) {
    const dir = this.file(...parts);
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_')).map((f) => f.slice(0, -5)) : [];
  }
}

// ─── Fiecare tip de rezultat ────────────────────────────────────────────────────────────────────────────────────
// check(slug) întoarce null (nu există rezultatul), [] (la zi) sau motivele pentru care e învechit.

/** Analiza principală: textul formei analizate și textul în vigoare de acum, față de cele din prompt. */
export function checkAnalysis(inp, slug) {
  const a = inp.analysis(slug);
  if (!a?.consensus) return null;
  const reasons = [];
  if (a.coverage?.method !== COUNCIL_METHOD || !a.baseline) reasons.push('metoda');
  const name = textNameOf(slug, a.coverage?.form ?? a.version ?? 'initiator');
  const text = inp.formText(slug, name);
  // Fără textul pe disc (proiecte vechi ale Guvernului) nu avem ce compara.
  if (!text) return reasons;
  if (a.coverage?.marker && markerOf(text) !== a.coverage.marker) reasons.push('text');
  const had = recordedBaseline(a.baseline);
  const now = inp.baselineKey(slug, name);
  // Fără bază salvată acum nu putem spune că s-a schimbat; straja-baseline o face, apoi se compară.
  if (had !== 'none' && now !== 'missing' && had !== now) reasons.push('legea-în-vigoare');
  return reasons;
}

/** Forma analizei principale din dosarul formelor: la Cameră cea analizată acum, la Senat cea actualizată. */
export const mainFormKey = (slug, main) => (senate(slug) ? 'actualizata' : (main?.version ?? null));

/**
 * O formă din data/analyses/versions/<slug>/: cea a analizei principale e o copie a ei (la zi doar dacă e aceeași
 * analiză); celelalte se judecă după textul, textul în vigoare și metoda lor.
 */
export function checkForm(inp, slug, key) {
  const an = inp.json('data', 'analyses', 'versions', slug, `${key}.json`);
  if (!an?.consensus) return null;
  const main = inp.analysis(slug);
  if (main && key === mainFormKey(slug, main)) return an.updatedAt === main.updatedAt ? [] : ['analiza'];
  const reasons = [];
  if (an.coverage?.method !== COUNCIL_METHOD || !an.baseline) reasons.push('metoda');
  const name = textNameOf(slug, key, { versionFile: true });
  const text = inp.formText(slug, name);
  if (!text) return reasons;
  if (an.coverage?.marker && markerOf(text) !== an.coverage.marker) reasons.push('text');
  const had = recordedBaseline(an.baseline);
  const now = inp.baselineKey(slug, name);
  if (had !== 'none' && now !== 'missing' && had !== now) reasons.push('legea-în-vigoare');
  return reasons;
}

export function formKeys(inp, slug) {
  const dir = inp.file('data', 'analyses', 'versions', slug);
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : [];
}

/** Amprenta unei comparații: cele două texte (fără ordonanță, cum le citește comparația), constatările primite și schema. */
export const compareBasisFrom = (ta, tb, A, B) => ({
  a: ta ? sha(ta) : null,
  b: tb ? sha(tb) : null,
  findings: sha(`${compareFindings(A)}\n--\n${compareFindings(B)}`),
  prompt: COMPARE_SCHEMA,
});
export function compareBasis(inp, slug, from, to) {
  const form = (k) => inp.json('data', 'analyses', 'versions', slug, `${k}.json`);
  const raw = (k) => inp.texts(slug)[textNameOf(slug, k, { versionFile: true })] ?? null;
  return compareBasisFrom(raw(from), raw(to), form(from), form(to));
}

/**
 * Comparația formelor (data/analyses/versions/<slug>.json): învechită dacă e învechită o formă, dacă o schimbare a fost
 * făcută din alte texte sau constatări, ori dacă scorurile din rezumat nu mai sunt ale formelor.
 */
export function checkVersions(inp, slug) {
  const sum = inp.json('data', 'analyses', 'versions', `${slug}.json`);
  if (!sum?.versions) return null;
  const reasons = new Set();
  for (const key of formKeys(inp, slug)) if (checkForm(inp, slug, key)?.length) reasons.add('forme');
  const form = (k) => inp.json('data', 'analyses', 'versions', slug, `${k}.json`);
  for (const c of sum.changes ?? []) {
    if (c.basis) {
      for (const r of basisReasons(c.basis, compareBasis(inp, slug, c.from, c.to))) reasons.add(r === 'findings' ? 'constatări' : r === 'prompt' ? 'metoda' : 'text');
    } else {
      if (c.schema !== COMPARE_SCHEMA) reasons.add('metoda');
      if ([form(c.from), form(c.to)].some((an) => an && an.updatedAt > c.updatedAt)) reasons.add('constatări');
    }
  }
  for (const v of sum.versions) {
    const an = form(v.key);
    if (an && an.consensus.riskScore !== v.riskScore) reasons.add('scoruri');
  }
  return [...reasons];
}

/**
 * „Ce e bine și ce strică”: forma analizei principale, textul ei în vigoare (doar baza principală, ca straja-balance),
 * scorul analizei și schema. Rezultatele cu `basis` se compară câmp cu câmp; cele din schema 2 după inputHash-ul lor
 * (aceeași regulă ca straja-balance); cele din schema 1 au fost făcute fără legea în vigoare.
 */
export function balanceInputs(inp, slug) {
  const a = inp.analysis(slug);
  if (!a?.consensus) return null;
  const t = inp.texts(slug);
  const formKey = senate(slug) ? 'initiator' : [a.version, ...Object.keys(CHAMBER_TEXT)].find((k) => CHAMBER_TEXT[k] && t[CHAMBER_TEXT[k]]?.trim().length > 200);
  const name = formKey && CHAMBER_TEXT[formKey];
  const text = inp.formText(slug, name);
  if (!text || text.trim().length < 200) return null;
  const key = inp.baselineKey(slug, name, { versionFallback: false });
  return { text, name, baseline: key, riskScore: a.consensus.riskScore };
}
export const balanceBasis = (b) => ({ text: markerOf(b.text), baseline: b.baseline, analysis: b.riskScore, prompt: BALANCE_SCHEMA });

export function checkBalance(inp, slug) {
  const out = inp.json('data', 'analyses', 'balance', `${slug}.json`);
  if (!out) return null;
  const b = balanceInputs(inp, slug);
  if (!b) return [];
  if (out.basis) return basisReasons(out.basis, balanceBasis(b)).map((r) => ({ text: 'text', baseline: 'legea-în-vigoare', analysis: 'scor', prompt: 'metoda' })[r] ?? r);
  if ((out.schema ?? 1) < BALANCE_SCHEMA) return ['metoda'];
  // straja-balance (schema 2): inputHash = text, scor, cheia bazei (sau „no-acts”/„missing”), schema.
  const hash = sha(`${b.text}\n${b.riskScore}\n${b.baseline}\n${out.schema}`, 12);
  if (hash === out.inputHash) return [];
  const reasons = [];
  if (out.riskScore !== b.riskScore) reasons.push('scor');
  const had = typeof out.baseline === 'object' && out.baseline ? out.baseline.key : out.baseline;
  if (had !== b.baseline) reasons.push('legea-în-vigoare');
  return reasons.length ? reasons : ['text'];
}

/** Amendamentele (data/cdep/amendamente): legate de schimbările Camerei din comparație; dacă acestea s-au schimbat, legăturile nu mai țin. */
export function checkAmendments(inp, slug) {
  const out = inp.json('data', 'cdep', 'amendamente', `${slug}.json`);
  if (!out) return null;
  const sum = inp.json('data', 'analyses', 'versions', `${slug}.json`);
  if (out.basis) return basisReasons(out.basis, { changes: changesDigest(chamberChanges(sum)), prompt: AMENDMENTS_SCHEMA }).map((r) => (r === 'changes' ? 'schimbări' : 'metoda'));
  const reasons = [];
  if ((out.schema ?? 0) < AMENDMENTS_SCHEMA) reasons.push('metoda');
  if ((sum?.changes ?? []).some((c) => c.to === 'camera' && c.updatedAt > out.updatedAt)) reasons.push('schimbări');
  return reasons;
}

/** Memoriul .docx al unui proiect de la Senat (public/docs), cu amprenta în data/docs-basis.json. */
export function checkDocx(inp, slug) {
  const bill = (inp.json('data', 'senat-bills.json') ?? []).find((b) => b.slug === slug);
  const a = inp.analysis(slug);
  if (!bill || !a?.consensus) return null;
  if (!fs.existsSync(inp.file('public', 'docs', `Punct_de_vedere_${slug.toUpperCase()}.docx`))) return null;
  const stored = inp.json('data', 'docs-basis.json')?.[slug];
  return basisReasons(stored, { analysis: docxDigest(bill, a), prompt: DOCX_VERSION }).map((r) => (r === 'analysis' ? 'analiza' : r === 'prompt' ? 'metoda' : r));
}

const CHECKS = { analysis: checkAnalysis, versions: checkVersions, balance: checkBalance, amendments: checkAmendments, docx: checkDocx };

/** Toate rezultatele unui proiect: { tip: null | [] | [motive] }; formele, ca { cheie: … }. Pentru paginile site-ului. */
export function staleForSlug(inp, slug) {
  const out = Object.fromEntries(Object.entries(CHECKS).map(([type, fn]) => [type, fn(inp, slug)]));
  out.forms = Object.fromEntries(formKeys(inp, slug).map((k) => [k, checkForm(inp, slug, k)]));
  return out;
}

/** Proiectele care au sau ar trebui să aibă un rezultat de tipul dat. */
function slugsFor(inp, type) {
  switch (type) {
    case 'analysis':
      return inp.slugsIn('data', 'analyses');
    case 'versions':
    case 'forms':
      return inp.slugsIn('data', 'analyses', 'versions');
    case 'balance':
      // Ca straja-balance: proiectele de la Senat și de la Cameră; ale Guvernului n-au listă.
      return [...new Set([...inp.slugsIn('data', 'analyses'), ...inp.slugsIn('data', 'analyses', 'balance')])].filter((s) => !s.startsWith('guv-'));
    case 'amendments':
      return inp.slugsIn('data', 'cdep', 'amendamente');
    case 'docx':
      return (inp.json('data', 'senat-bills.json') ?? []).map((b) => b.slug);
    default:
      throw new Error(`tip necunoscut: ${type}`);
  }
}

/**
 * Raportul pentru un tip: câte rezultate există, care sunt învechite (cu motivele) și, la „ce e bine și ce strică”,
 * analizele care încă n-au deloc rezultat. Listele sunt cu proiectele cele mai riscante întâi.
 */
export function freshness(type, inp = new Inputs()) {
  const stale = [];
  const missing = [];
  let total = 0;
  for (const slug of slugsFor(inp, type)) {
    if (type === 'forms') {
      for (const key of formKeys(inp, slug)) {
        const r = checkForm(inp, slug, key);
        if (r === null) continue;
        total++;
        if (r.length) stale.push({ slug, key, reasons: r, risk: inp.risk(slug) });
      }
      continue;
    }
    const r = CHECKS[type](inp, slug);
    if (r === null) {
      if (type === 'balance' && balanceInputs(inp, slug)) missing.push({ slug, risk: inp.risk(slug) });
      continue;
    }
    total++;
    if (r.length) stale.push({ slug, reasons: r, risk: inp.risk(slug) });
  }
  const byRisk = (a, b) => b.risk - a.risk || a.slug.localeCompare(b.slug, 'ro', { numeric: true });
  return { type, total, stale: stale.sort(byRisk), missing: missing.sort(byRisk) };
}

/** Coada unui pas: întâi rezultatele învechite, apoi cele lipsă, fiecare listă cu cele mai riscante întâi. */
export function queue(type, max = Infinity, inp = new Inputs()) {
  const r = freshness(type, inp);
  return [...new Set([...r.stale, ...r.missing].map((x) => x.slug))].slice(0, max);
}

/** Un rând pentru jurnal: „ce e bine și ce strică 799/934 · …”. */
export function summaryLine(reports) {
  return reports.map((r) => `${TYPE_LABEL[r.type]} ${r.stale.length}/${r.total}${r.missing.length ? ` (+${r.missing.length} lipsă)` : ''}`).join(' · ');
}
