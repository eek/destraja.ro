import type { PressArticle, PressSource, PressStance } from './types';

// Pragurile pentru clasificarea făcută de cei trei cititori (scripts/straja-stance.mjs): Clef, d1-3B și GPT-6 Luna.
// Punem o etichetă doar unde cel puțin doi aleg aceeași variantă, fiecare cu cel puțin 60% siguranță (cu un singur
// răspuns, doar el): „neclar” e mai cinstit decât o ghicire.
const AGREE_MIN = 0.6;
const ABOUT_MIN = 0.5;
const RELEASE_MIN = 0.5;

export const STANCES: PressStance[] = ['critical', 'supportive', 'neutral', 'mixed'];

export const STANCE: Record<PressStance, { label: string; one: string; many: string }> = {
  critical: { label: 'Critic', one: 'critic', many: 'critice' },
  supportive: { label: 'Favorabil', one: 'favorabil', many: 'favorabile' },
  neutral: { label: 'Neutru', one: 'neutru', many: 'neutre' },
  mixed: { label: 'Mixt', one: 'mixt', many: 'mixte' },
};

export const SOURCE: Record<PressSource, string> = {
  national_news: 'presă națională',
  local_news: 'presă locală',
  trade_press: 'presă de specialitate',
  party_or_politician: 'site de partid sau de politician',
  aggregator: 'preluare',
  opinion_blog: 'blog sau opinie',
  ngo_or_institution: 'ONG sau instituție',
};

interface ModelAnswer {
  stance: PressStance;
  stanceP: number;
  source: PressSource;
  sourceP: number;
  about: number;
  release: number;
}

export interface RawPressItem {
  url: string;
  title: string;
  outlet: string;
  domain: string;
  publishedAt?: string | null;
  decision?: { models: Record<string, ModelAnswer> };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

// Varianta aleasă de cel puțin doi cititori (de unul, dacă doar el a răspuns), fiecare peste prag; altfel null.
function agreed<T>(answers: ModelAnswer[], pick: (a: ModelAnswer) => T, confidence: (a: ModelAnswer) => number): T | null {
  const votes = new Map<T, number>();
  for (const a of answers) if (confidence(a) >= AGREE_MIN) votes.set(pick(a), (votes.get(pick(a)) ?? 0) + 1);
  const need = Math.min(2, answers.length);
  for (const [choice, n] of votes) if (n >= need) return choice;
  return null;
}

/**
 * Un link verificat, așa cum îl afișăm. Publicațiile din listă apar mereu; celelalte doar dacă cititorii spun, în medie,
 * că articolul e chiar despre proiect, și nu cad de acord că e o simplă preluare.
 */
export function pressArticle(raw: RawPressItem, listed: boolean, title: string): PressArticle | null {
  const answers = Object.values(raw.decision?.models ?? {});
  const about = answers.length > 0 && mean(answers.map((a) => a.about)) >= ABOUT_MIN;
  const source = answers.length ? agreed(answers, (a) => a.source, (a) => a.sourceP) : null;
  if (!listed && (!about || source === 'aggregator')) return null;
  return {
    url: raw.url,
    title,
    outlet: raw.outlet,
    domain: raw.domain,
    publishedAt: raw.publishedAt ?? null,
    listed,
    stance: about ? agreed(answers, (a) => a.stance, (a) => a.stanceP) : null,
    source,
    release: answers.length > 0 && mean(answers.map((a) => a.release)) >= RELEASE_MIN,
  };
}

export function stanceCounts(articles: PressArticle[]): Record<PressStance, number> {
  const counts = { critical: 0, supportive: 0, neutral: 0, mixed: 0 };
  for (const a of articles) if (a.stance) counts[a.stance]++;
  return counts;
}

/** „14 critice, 2 favorabile”: doar pozițiile luate, fără neutre, în ordinea critic → favorabil → mixt. */
export function stanceLine(counts: Record<PressStance, number>): string {
  return (['critical', 'supportive', 'mixed'] as const)
    .filter((s) => counts[s] > 0)
    .map((s) => `${counts[s]} ${counts[s] === 1 ? STANCE[s].one : STANCE[s].many}`)
    .join(', ');
}
