import fs from 'node:fs/promises';
import path from 'node:path';
import type { BillAnalysis, EnrichedBill } from './types';

const ROOT = process.cwd();
const SENAT_BILLS_PATH = path.join(ROOT, 'data', 'senat-bills.json');
const ANALYSES_DIR = path.join(ROOT, 'data', 'analyses');
const TEXTS_DIR = path.join(ROOT, 'data', 'texts');

function computeDaysRemaining(ddmmyyyy: string): number {
  const parts = ddmmyyyy.split('-').map(Number);
  if (parts.length !== 3) return 0;
  const [day, month, year] = parts;
  const deadline = new Date(year, month - 1, day, 23, 59, 59);
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

export async function getAllBills(): Promise<EnrichedBill[]> {
  const raw = JSON.parse(await fs.readFile(SENAT_BILLS_PATH, 'utf8'));
  const billsList = Array.isArray(raw) ? raw : raw.bills;

  const enriched: EnrichedBill[] = [];

  for (const bill of billsList) {
    const analysisFile = path.join(ANALYSES_DIR, `${bill.slug}.json`);
    const analysis: BillAnalysis = JSON.parse(await fs.readFile(analysisFile, 'utf8'));

    enriched.push({
      ...bill,
      daysRemaining: computeDaysRemaining(bill.consultationDeadline),
      analysis,
    });
  }

  // Sort by riskScore descending, with B563/2026 always first if tied
  enriched.sort((a, b) => {
    if (a.slug === 'b563-2026') return -1;
    if (b.slug === 'b563-2026') return 1;
    return b.analysis.consensus.riskScore - a.analysis.consensus.riskScore;
  });

  return enriched;
}

export async function getBillBySlug(slug: string): Promise<EnrichedBill | null> {
  const all = await getAllBills();
  return all.find((b) => b.slug === slug) ?? null;
}

export async function getBillExtractedTexts(
  slug: string
): Promise<{ filename: string; content: string }[]> {
  const dir = path.join(TEXTS_DIR, slug);
  try {
    const files = await fs.readdir(dir);
    const out: { filename: string; content: string }[] = [];
    for (const f of files.sort()) {
      if (!f.endsWith('.txt')) continue;
      const content = await fs.readFile(path.join(dir, f), 'utf8');
      out.push({ filename: f.replace(/\.txt$/, ''), content: content.trim() });
    }
    return out;
  } catch {
    return [];
  }
}
