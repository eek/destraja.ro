import fs from 'node:fs/promises';
import path from 'node:path';
import type { AnalysisCorrection } from './types';

export type ReportTarget = 'consensus' | 'agy' | 'claude' | 'codex';

/**
 * Un raport verificat, cum îl scrie scripts/straja-reports.mjs în data/reports/<slug>.json: fraza noastră contestată și
 * citatul oficial, ambele găsite literal, plus corectura. Textul cititorului nu e aici; numele, doar dacă l-a lăsat.
 */
export interface PublicReport {
  ids: string[];
  /** Când s-a decis, ISO. */
  date: string;
  status: 'fixed' | 'rejected';
  targets: ReportTarget[];
  claim: string;
  quote: string;
  before?: string;
  after?: string;
  name?: string;
  /** Legătura dintre citat și fraza noastră sau corectură, scrisă fără raportul cititorului. */
  why?: string;
}

/** Rapoartele verificate ale unui proiect, cele mai noi primele. */
export async function getBillReports(slug: string): Promise<PublicReport[]> {
  try {
    const data = JSON.parse(await fs.readFile(path.join(process.cwd(), 'data', 'reports', `${slug}.json`), 'utf8')) as { items: PublicReport[] };
    return [...data.items].sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return [];
  }
}

/** Corecturile făcute de mână (cu notă), care nu au intrare în data/reports. */
export const manualCorrections = (corrections: AnalysisCorrection[] | undefined, reports: PublicReport[]) =>
  (corrections ?? []).filter((c) => c.note && !reports.some((r) => r.ids.includes(c.reportId)));

const MODEL_NAMES: Record<Exclude<ReportTarget, 'consensus'>, string> = { agy: 'Gemini', claude: 'Claude', codex: 'ChatGPT' };

/** „concluzia comună și analizele Gemini, Claude și ChatGPT” (la fel ca în e-mailul cu rezultatul). */
export function targetsLabel(targets: ReportTarget[]) {
  const models = (Object.keys(MODEL_NAMES) as (keyof typeof MODEL_NAMES)[]).filter((t) => targets.includes(t)).map((t) => MODEL_NAMES[t]);
  const list = models.length > 1 ? `${models.slice(0, -1).join(', ')} și ${models.at(-1)}` : models[0];
  const part = list ? `${models.length > 1 ? 'analizele' : 'analiza'} ${list}` : '';
  return [targets.includes('consensus') ? 'concluzia comună' : '', part].filter(Boolean).join(' și ');
}
