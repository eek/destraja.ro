import fs from 'node:fs/promises';
import path from 'node:path';
import type { BalanceSummary, BillBalance } from './types';
import { summarize } from './balance-summary';

const DIR = path.join(process.cwd(), 'data', 'analyses', 'balance');

/** Ce e bine și ce strică tot, pentru proiectele la care am rulat deja scripts/straja-balance.mjs. */
export async function getBalance(slug: string): Promise<BillBalance | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(DIR, `${slug}.json`), 'utf8'));
  } catch {
    return null;
  }
}

/** Doar cât intră pe o casetă din listă: greutățile punctelor, problema cea mai gravă și reparația. */
export async function getBalanceSummary(slug: string): Promise<BalanceSummary> {
  const b = await getBalance(slug);
  return b ? summarize(b) : null;
}
