import fs from 'node:fs/promises';
import path from 'node:path';
import type { BalanceSummary, BillBalance } from './types';
import { summarize } from './balance-summary';
import { isStale, staleness } from './fresh';

const DIR = path.join(process.cwd(), 'data', 'analyses', 'balance');

/** Ce e bine și ce strică tot, pentru proiectele la care am rulat deja scripts/straja-balance.mjs. */
export async function getBalance(slug: string): Promise<BillBalance | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(DIR, `${slug}.json`), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Doar cât intră pe o casetă din listă: greutățile punctelor, problema cea mai gravă și reparația. O listă învechită
 * (făcută din altă analiză, alt text sau fără legea în vigoare) nu apare pe casetă: acolo n-are loc nota.
 */
export async function getBalanceSummary(slug: string): Promise<BalanceSummary> {
  if (isStale(staleness(slug).balance)) return null;
  const b = await getBalance(slug);
  return b ? summarize(b) : null;
}
