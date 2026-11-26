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

export type MoCategory = 'lege' | 'oug' | 'og' | 'ord' | 'hg' | 'decret' | 'decizie' | 'ordin' | 'altele';

export interface MoCoverageYear {
  year: number;
  days: number;
  ok: number;
  partial: number;
  refused: number;
  missing: number;
  inProgress: boolean;
  complete: boolean;
  /** Doar din tabelul întreg: acte cu dată și fără, legi și hotărâri ale Guvernului găsite față de cel mai mare număr. */
  acts?: number;
  undated?: number;
  lawFound?: number;
  lawMax?: number;
  hgFound?: number;
  hgMax?: number;
}

export type MoYearRow = { year: number; total: number; undated?: number } & Record<MoCategory, number>;

export interface MoSeries {
  year: number;
  found: number;
  maxNumber: number;
}

export interface MoStats {
  generatedAt: string;
  source: { name: string; note: string };
  /** „tabel”: tabelul întreg al actelor (din 1990); „zile”: listele pe zile (din 2003). */
  mode?: 'tabel' | 'zile';
  table?: {
    generatedAt: string | null;
    rows: number;
    buletinOficial: number;
    before1990: number;
    parteaV: number;
    unpublished: number;
    partNull: number;
    undatedWithYear: number;
    undatedNoYear: number;
    fromDayListsOnly: number;
  } | null;
  from: string;
  to: string;
  totals: { acts: number; laws: number; daysWithData: number; days: number; completeYears: number[] };
  coverage: MoCoverageYear[];
  calendar: { year: number; values: (number | null)[] }[];
  byYear: MoYearRow[];
  issues: { year: number; issues: number; bis: number; maxNumber: number }[];
  laws: { year: number; laws: number; titled?: number; approveOrdinance: number; rejectOrdinance: number; inForce3: number; inForceSooner: number; inForceLater: number; inForceUnknown: number; enteredInForce: number }[];
  ytd?: { through: string; years: { year: number; total: number; lege: number; oug: number }[] };
  lawsByMonth: Record<string, number>;
  lawNumbering: MoSeries[];
  ougNumbering: MoSeries[];
  hgNumbering?: MoSeries[];
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

// ---------- Înainte de 1990 (data/mo/pre1990.json, scris de scripts/straja-mo.mjs cu scripts/lib/mo-pre1990.mjs)

export interface MoOldAct {
  /** Id-ul din Portalul Legislativ (legislatie.just.ro/Public/DetaliiDocument/<id>). */
  id: number;
  date: string;
  /** „Decretul nr. 167/1958” */
  designation: string;
  /** Obiectul actului („privind prescripția extinctivă”), din titlu sau, când titlul lipsește, din textele care îl citează. */
  subject: string | null;
  subjectFrom: 'titlu' | 'citari' | null;
  issuer: string | null;
  /** Câte acte distincte îl citează (doar în lista celor mai citate). */
  citedBy?: number;
}

export interface MoPre1990 {
  generatedAt: string;
  tableGeneratedAt: string | null;
  citationsGeneratedAt: string | null;
  totals: { acts: number; withText: number; unpublished: number; publishedLater: number; first: string | null; last: string | null };
  decades: { decade: number; acts: number; years: number[] }[];
  eras: { key: string; label: string; span: string; acts: number; first: string | null; last: string | null; issuers: [string, number][]; types: [string, number][] }[];
  types: [string, number][];
  unpublishedBy: [string, number][];
  oldest: MoOldAct[];
  cited: { docsScanned: number | null; citedAtLeastOnce: number | null; method: string | null; top: MoOldAct[] } | null;
  longLived: { id: number; name: string; date: string; until: string; by: string; issuer: string }[];
}

export async function getMoPre1990(): Promise<MoPre1990 | null> {
  return readJson<MoPre1990>('pre1990.json');
}

/** Pagina actului în Portalul Legislativ. */
// TODO: când paginile de acte de pe destraja.ro/acte se lansează, legăturile spre actele vechi trec acolo (/acte/p/<id>).
export const portalUrl = (id: number) => `https://legislatie.just.ro/Public/DetaliiDocument/${id}`;
