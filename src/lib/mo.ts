import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Monitorul Oficial, Partea I, din indexul Portalului Legislativ: data/mo/legi.json (publicarea legilor în care s-au
 * transformat proiectele noastre) și data/mo/stats.json (agregatele pentru /monitorul-oficial), scrise de
 * scripts/straja-mo.mjs. Fără fișiere, paginile arată ca înainte.
 */

export interface MoIssue {
  number: number;
  bis: boolean;
  /** YYYY-MM-DD */
  date: string;
}

export interface MoLaw {
  chamber: 'camera' | 'senat';
  /** „100/2026” */
  law: string;
  title: string | null;
  actDate: string | null;
  mo: MoIssue;
  /** De unde știm numărul de Monitor: actul legii din index sau, când lipsește, decretul ei de promulgare (același număr). */
  moFrom: 'lege' | 'decret';
  decree: string | null;
  decreeFrom: 'monitor' | 'fisa' | null;
  promulgatedOn: string | null;
  finalVoteOn: string | null;
  /** Data intrării în vigoare din indexul portalului. */
  inForceFrom: string | null;
  portalId: number | null;
  /** Textul publicat (forma de bază). */
  url: string | null;
  /** Forma consolidată, la zi. */
  consolidatedUrl: string | null;
  decreeUrl?: string;
}

interface LegiFile {
  generatedAt: string;
  samplesTo: string;
  billsWithLaw: number;
  matchedCount: number;
  bills: Record<string, MoLaw>;
  misses: { slug: string; chamber: string; law: string; reason: string }[];
}

const ROOT = process.cwd();
let legi: Promise<LegiFile | null> | null = null;

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'mo', file), 'utf8')) as T;
  } catch {
    return null;
  }
}

export async function getMoLaws(): Promise<LegiFile | null> {
  legi ??= readJson<LegiFile>('legi.json');
  return legi;
}

/** Publicarea legii unui proiect (slugul Camerei, „plx-105-2026”, sau al Senatului, „b528-2026”), cu data citirii. */
export async function getMoLaw(slug: string): Promise<{ law: MoLaw; readOn: string } | null> {
  const f = await getMoLaws();
  const law = f?.bills[slug];
  return law ? { law, readOn: f.samplesTo } : null;
}

// ---------- Agregatele

export type MoCategory = 'lege' | 'oug' | 'og' | 'hg' | 'decret' | 'decizie' | 'ordin' | 'altele';

export interface MoCoverageYear {
  year: number;
  days: number;
  ok: number;
  partial: number;
  refused: number;
  missing: number;
  inProgress: boolean;
  complete: boolean;
}

export type MoYearRow = { year: number; total: number } & Record<MoCategory, number>;

export interface MoSeries {
  year: number;
  found: number;
  maxNumber: number;
}

export interface MoStats {
  generatedAt: string;
  source: { name: string; note: string };
  from: string;
  to: string;
  totals: { acts: number; laws: number; daysWithData: number; days: number; completeYears: number[] };
  coverage: MoCoverageYear[];
  calendar: { year: number; values: (number | null)[] }[];
  byYear: MoYearRow[];
  issues: { year: number; issues: number; bis: number; maxNumber: number }[];
  laws: { year: number; laws: number; approveOrdinance: number; rejectOrdinance: number; inForce3: number; inForceSooner: number; inForceLater: number; inForceUnknown: number; enteredInForce: number }[];
  ytd?: { through: string; years: { year: number; total: number; lege: number; oug: number }[] };
  lawsByMonth: Record<string, number>;
  lawNumbering: MoSeries[];
  ougNumbering: MoSeries[];
  ogNumbering: MoSeries[];
  pendingDays: string[];
  busiest: ({ date: string; count: number; topTitle: string | null; topCount: number } & Record<MoCategory, number>)[];
  yearEnd: { year: number; avgPublishingDay: number; publishingDays: number; lastDays: number }[];
  issuers: { name: string; total: number; byYear: Record<string, number> }[];
  medianActsPerPublishingDay: number | null;
}

export async function getMoStats(): Promise<MoStats | null> {
  return readJson<MoStats>('stats.json');
}

/** Regula generală (art. 78 din Constituție): legea intră în vigoare la 3 zile de la publicare. */
export function ruleInForce(moDate: string): string {
  const d = new Date(`${moDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 3);
  return d.toISOString().slice(0, 10);
}
