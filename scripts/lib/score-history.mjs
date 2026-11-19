// Istoria scorului unei analize: când consiliul reface o analiză, rezultatul de dinainte rămâne în `history` (cel mai
// nou primul), cu motivele schimbării față de rezultatul care a urmat. Pagina proiectului arată din ele traiectoria
// scorului și de ce s-a mișcat: o formă nouă a textului, citirea întregului text (metoda), alt model Gemini sau o
// corectură. Designul: ~/work/destraja-eval/istoric-scor (Carbon și Sol, 19 noiembrie 2026).

/** Metoda analizelor de dinainte de 19 noiembrie 2026: modelele primeau doar primele 14.000 de caractere. */
export const FIRST_CHARS_METHOD = 'first-14k';
/** Cât din text primeau modelele înainte de whole-text-v1: un text mai scurt era citit tot și atunci. */
export const FIRST_CHARS = 14_000;
/** Câte rezultate vechi păstrăm într-o analiză. */
export const HISTORY_MAX = 6;
// Analizele de dinainte de 13 noiembrie 2026 n-au modelId: Gemini era Argon High.
const ARGON_UNTIL = '2026-11-13';

/** Modelul Gemini al unei analize (null dacă Gemini n-a răspuns). */
export function agyModelOf(an) {
  const agy = an?.council?.agy;
  if (agy?.status !== 'ok') return null;
  return agy.modelId ?? ((an.updatedAt ?? '') < ARGON_UNTIL ? 'gemini-4-argon-high' : null);
}

const scoresOf = (an) => Object.fromEntries(['agy', 'claude', 'codex'].map((m) => [m, an?.council?.[m]?.status === 'ok' ? an.council[m].riskScore : null]));

/**
 * Ce păstrăm dintr-o analiză care e înlocuită. `form`: forma textului analizată (initiator, senat, camera la Cameră;
 * initiator sau actualizata la Senat), dacă se știe.
 */
export function snapshot(an, form = an?.coverage?.form ?? an?.version ?? null) {
  return {
    riskScore: an.consensus.riskScore,
    riskLevel: an.consensus.riskLevel,
    analyzedAt: an.updatedAt,
    method: an.coverage?.method ?? FIRST_CHARS_METHOD,
    // Lungimea textului citit (proiectul plus ordonanța), cunoscută de la whole-text-v1.
    textChars: an.coverage ? (an.coverage.billChars ?? 0) + (an.coverage.ordinanceChars ?? 0) : null,
    form,
    agyModel: agyModelOf(an),
    scores: scoresOf(an),
    corrections: (an.corrections ?? []).length,
  };
}

/**
 * De ce diferă rezultatul `next` (o analiză sau un snapshot) de `prev` (un snapshot):
 * - text: altă formă oficială a textului (formele cunoscute amândouă și diferite);
 * - metoda: altă metodă de citire, care a schimbat ce au văzut modelele: de la primele 14.000 de caractere la tot textul
 *   doar dacă textul e mai lung de atât (un text scurt era citit tot și înainte);
 * - model: alt model Gemini (doar când îl știm la amândouă);
 * - corectura: aceeași rulare a modelelor, dar o corectură nouă (scorurile modelelor neschimbate);
 * - reluare: niciuna dintre ele, adică aceeași analiză refăcută (diferența e în marja dintre două rulări).
 */
export function changeReasons(prev, next) {
  const n = next.consensus ? snapshot(next) : next;
  const reasons = [];
  if (prev.form && n.form && prev.form !== n.form) reasons.push('text');
  // Metoda contează doar dacă a schimbat ce au văzut modelele: un text sub 14.000 de caractere era citit tot și înainte.
  const cut = (snap) => snap.method === FIRST_CHARS_METHOD;
  const shortText = [prev, n].some((snap) => snap.textChars != null && snap.textChars <= FIRST_CHARS);
  if (prev.method !== n.method && (cut(prev) === cut(n) || !shortText)) reasons.push('metoda');
  if (prev.agyModel && n.agyModel && prev.agyModel !== n.agyModel) reasons.push('model');
  const sameRun = ['agy', 'claude', 'codex'].every((m) => prev.scores?.[m] === n.scores?.[m]);
  if (!reasons.length && sameRun && n.corrections > prev.corrections) reasons.push('corectura');
  return reasons.length ? reasons : ['reluare'];
}

/** Istoria analizei noi, care o înlocuiește pe `prev` (null dacă nu era nimic de înlocuit). */
export function nextHistory(prev, next) {
  if (!prev?.consensus || !Number.isFinite(prev.consensus.riskScore)) return prev?.history ?? null;
  const entry = { ...snapshot(prev), replacedAt: next.updatedAt, reasons: changeReasons(snapshot(prev), next) };
  return [entry, ...(prev.history ?? [])].slice(0, HISTORY_MAX);
}
