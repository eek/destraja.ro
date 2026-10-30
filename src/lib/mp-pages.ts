import { getAllBillsLite } from './bills';
import { getCdepSigned } from './cdep';
import { computeMpStats } from './stats';

let cache: Promise<Set<string>> | null = null;

/** Slug-urile parlamentarilor cu pagină pe site: cei care au semnat cel puțin un proiect urmărit. */
export function getMpPageSlugs() {
  cache ??= Promise.all([getAllBillsLite(), getCdepSigned()]).then(([bills, chamber]) => new Set(computeMpStats([...bills, ...chamber]).map((m) => m.slug)));
  return cache;
}
