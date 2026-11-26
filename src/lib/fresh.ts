// Ce rezultat derivat e învechit, la build (scripts/lib/fresh.mjs, aceeași regulă ca verificarea din rularea zilnică).
// Un rezultat învechit nu apare ca actual: pe pagina proiectului are nota „din analiza anterioară, se actualizează”
// (StaleNote), iar pe carduri și în statistici nu apare deloc până se reface.
import { Inputs, freshness, TYPES, TYPE_LABEL, staleForSlug } from '../../scripts/lib/fresh.mjs';

type Reasons = string[] | null;
export type Staleness = {
  analysis: Reasons;
  versions: Reasons;
  balance: Reasons;
  amendments: Reasons;
  docx: Reasons;
  forms: Record<string, Reasons>;
};

let inputs: Inputs | null = null;
const bySlug = new Map<string, Staleness>();

export function staleness(slug: string): Staleness {
  inputs ??= new Inputs(process.cwd());
  let s = bySlug.get(slug);
  if (!s) {
    s = staleForSlug(inputs, slug) as unknown as Staleness;
    bySlug.set(slug, s);
  }
  return s;
}

/** Există și e învechit (null = nu există, [] = la zi). */
export const isStale = (r: Reasons | undefined): boolean => Array.isArray(r) && r.length > 0;

/** Câte rezultate sunt învechite, pe tipuri, pentru /admin. */
export function freshnessCounts() {
  const inp = new Inputs(process.cwd());
  return TYPES.map((t: string) => {
    const r = freshness(t, inp);
    return { type: t, label: (TYPE_LABEL as Record<string, string>)[t], stale: r.stale.length, total: r.total, missing: r.missing.length };
  });
}
