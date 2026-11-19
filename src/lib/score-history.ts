import type { BillAnalysis, BillVersions, RiskLevel } from './types';
import type { ModelKey } from './site';

/**
 * De ce s-a mișcat scorul față de analiza de dinainte (scripts/lib/score-history.mjs): o formă nouă a textului, citirea
 * metoda actualizată, alt model Gemini, o corectură sau doar o reluare a analizei.
 */
export type ScoreReason = 'text' | 'metoda' | 'model' | 'corectura' | 'reluare';

/** Un rezultat vechi al analizei, păstrat când a fost refăcută (`history` din data/analyses/<slug>.json, cel mai nou primul). */
export interface ScoreHistoryEntry {
  riskScore: number;
  riskLevel: RiskLevel;
  analyzedAt: string;
  method: string;
  textChars: number | null;
  form: string | null;
  agyModel: string | null;
  scores: Record<ModelKey, number | null>;
  corrections: number;
  /** Când l-a înlocuit rezultatul următor și de ce s-a schimbat față de el. */
  replacedAt: string;
  reasons: ScoreReason[];
  backfilled?: boolean;
}

export const REASON_LABEL: Record<ScoreReason, string> = {
  text: 'Formă nouă',
  metoda: 'Metodă actualizată',
  model: 'Alt model',
  corectura: 'Corectură',
  reluare: 'Reanaliză',
};

export const FIRST_CHARS = 14_000;
const r1 = (n: number) => Math.round(n * 10) / 10;
/** Ziua din București a unui moment ISO (o analiză de la 23:30 UTC e deja a doua zi în România). */
export const bucharestDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(iso));

export interface ScoreMove {
  from: number;
  fromLevel: RiskLevel;
  to: number;
  toLevel: RiskLevel;
  delta: number;
  /** Ziua analizei noi (AAAA-LL-ZZ) și a celei de dinainte. */
  date: string;
  fromDate: string;
  /** Motivele arătate cititorului (modelul doar când explică ceva, vezi shownReasons); `all` le are pe toate. */
  reasons: ScoreReason[];
  all: ScoreReason[];
  /** text = proiectul s-a schimbat; recalc = același text, citit altfel (metodă, model, corectură, reluare). */
  kind: 'text' | 'recalc';
  /** Peste prag: cel puțin un punct, sau o jumătate de punct care trece scorul în altă zonă de risc. */
  notable: boolean;
  /** Cât din text citea analiza de dinainte, dacă era tăiat (caractere citite din total). */
  readBefore: { read: number; total: number } | null;
  /** Modelul Gemini de dinainte și de acum, când s-a schimbat. */
  models: { before: string; after: string } | null;
}

// Analizele de dinainte de 13 noiembrie 2026 n-au modelId: Gemini era Argon (ca în scripts/lib/score-history.mjs).
export const agyOf = (an: BillAnalysis) =>
  an.council.agy?.status === 'ok' ? (an.council.agy.modelId ?? (an.updatedAt < '2026-11-13' ? 'gemini-4-argon-high' : null)) : null;
const scoresOf = (an: BillAnalysis): Record<ModelKey, number | null> => ({
  agy: an.council.agy?.status === 'ok' ? an.council.agy.riskScore : null,
  claude: an.council.claude?.status === 'ok' ? an.council.claude.riskScore : null,
  codex: an.council.codex?.status === 'ok' ? an.council.codex.riskScore : null,
});

/**
 * „Alt model” îl arătăm doar când explică schimbarea: e singurul motiv cunoscut, sau doar Gemini (modelul schimbat) s-a
 * mișcat mult (cel puțin 2,5 puncte), iar Claude și ChatGPT sub un punct. Când toate trei reacționează la textul citit
 * acum întreg, schimbarea e a citirii; modelul rămâne în istoricul detaliat. Regula: Carbon (destraja-eval/istoric-scor).
 */
function shownReasons(all: ScoreReason[], before: Record<ModelKey, number | null>, after: Record<ModelKey, number | null>) {
  if (!all.includes('model')) return all;
  const others = all.filter((r) => r !== 'model' && r !== 'reluare');
  if (!others.length) return ['model' as const];
  // În zecimi, ca 2,5 sau 1,0 să nu cadă pe partea greșită din cauza virgulei mobile; Claude și ChatGPT trebuie să fi
  // răspuns amândoi de fiecare dată, altfel nu știm dacă doar Gemini s-a mișcat.
  const moved = (k: ModelKey) => (before[k] != null && after[k] != null ? Math.abs(Math.round(after[k]! * 10) - Math.round(before[k]! * 10)) : null);
  const g = moved('agy');
  const rest = (['claude', 'codex'] as const).map(moved);
  return g !== null && g >= 25 && rest.every((x) => x !== null && x < 10) ? all : others;
}

/** Ultima mișcare a scorului unei analize, din `history[0]`; null fără istorie. */
export function scoreMove(an: BillAnalysis | null | undefined): ScoreMove | null {
  const prev = (an as (BillAnalysis & { history?: ScoreHistoryEntry[] }) | null | undefined)?.history?.[0];
  if (!an || !prev) return null;
  const to = an.consensus.riskScore;
  const delta = r1(to - prev.riskScore);
  const crossed = prev.riskLevel !== an.consensus.riskLevel;
  const total = an.coverage ? (an.coverage.billChars ?? 0) + (an.coverage.ordinanceChars ?? 0) : null;
  const after = agyOf(an);
  return {
    from: prev.riskScore,
    fromLevel: prev.riskLevel,
    to,
    toLevel: an.consensus.riskLevel,
    delta,
    date: bucharestDay(prev.replacedAt ?? an.updatedAt),
    fromDate: bucharestDay(prev.analyzedAt),
    reasons: shownReasons(prev.reasons, prev.scores, scoresOf(an)),
    all: prev.reasons,
    kind: prev.reasons.includes('text') ? 'text' : 'recalc',
    notable: Math.abs(delta) >= 1 || (crossed && Math.abs(delta) >= 0.5),
    readBefore: prev.reasons.includes('metoda') && total && total > FIRST_CHARS ? { read: FIRST_CHARS, total } : null,
    models: prev.agyModel && after && prev.agyModel !== after ? { before: prev.agyModel, after } : null,
  };
}

/** Pe pagina proiectului: mișcările peste prag și orice formă nouă (chiar cu același scor, e o veste). */
export const showOnPage = (m: ScoreMove | null): m is ScoreMove => Boolean(m && (m.notable || m.kind === 'text'));

/** Cât stă mișcarea pe listele de proiecte. */
export const LIST_DAYS = 30;
/** Pe rândurile din liste: doar mișcările peste prag, în primele LIST_DAYS zile. */
export function listMove(an: BillAnalysis | null | undefined, today: string) {
  const m = scoreMove(an);
  if (!m || !m.notable) return null;
  const age = (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${m.date}T12:00:00Z`)) / 86_400_000;
  return age >= 0 && age <= LIST_DAYS ? { from: m.from, kind: m.kind, reasons: m.reasons } : null;
}
export type ListMove = NonNullable<ReturnType<typeof listMove>>;

/**
 * Scorurile celor două forme din traiectorie (`from` → `to`), citite la fel: aceeași metodă, același Gemini și toate trei
 * modelele pe amândouă. null dacă formele comparate nu sunt exact cele din traiectorie sau n-au fost citite la fel.
 */
export function sameMethodPair(v: BillVersions | null, from: string | null, to: string | null) {
  const a = v?.versions.find((x) => x.key === from);
  const b = v?.versions.find((x) => x.key === to);
  if (!a || !b || a === b || !a.method || a.method !== b.method || (a.agyModel ?? null) !== (b.agyModel ?? null)) return null;
  const all = (x: typeof a) => Object.values(x.scores).every((s) => s !== null);
  return all(a) && all(b) ? { from: a, to: b } : null;
}
