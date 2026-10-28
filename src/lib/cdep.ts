// Proiectele de la Camera Deputaților, din data/cdep (scripts/straja-cdep.mjs): lista anului, fișele citite și adresele
// comisiilor. Analizele modelelor, când există, stau ca la Senat în data/analyses/<slug>.json; acolo `senatForm`
// ține propunerea de amendament pentru comisie (aceleași patru câmpuri: articol, text propus, motivare, observații).
import fs from 'node:fs/promises';
import path from 'node:path';
import type { BillAnalysis } from './types';
import { stageOf, type StageKey } from './cdep-text';

export type { StageKey };

const DIR = path.join(process.cwd(), 'data', 'cdep');
const ANALYSES_DIR = path.join(process.cwd(), 'data', 'analyses');

export interface CdepCommittee {
  idc: number;
  nume: string;
}

export interface CdepSheet {
  bpi: string | null;
  numarCamera: string | null;
  numarSenat: string | null;
  cameraDecizionala: string | null;
  caracter: string | null;
  urgenta: string | null;
  stadiu: string | null;
  initiatori: { idm: number; nume: string; partid: string | null }[];
  obiect: string | null;
  timeline: { camera: string | null; data: string; actiune: string }[];
  documente?: { url: string; eticheta: string }[];
  comisii?: { raport: CdepCommittee[]; aviz: CdepCommittee[]; termenAmendamente: string | null; termenRaport: string | null } | null;
}

export interface CdepRow {
  slug: string;
  idp: number;
  /** „PL-x 703/2026” sau „Pl-x 668/2026”. */
  numar: string;
  tip: string;
  /** Data înregistrării la Cameră (YYYY-MM-DD). */
  inregistrat: string;
  titlu: string;
  /** Stadiul din lista Camerei („la comisii”, „raport”, „pe ordinea de zi”…) și data lui (ZZ.LL.AAAA). */
  stadiu: string;
  stadiuData: string | null;
  url: string;
  /** Slug-ul proiectului urmărit de la Senat, când e același proiect: atunci are deja pagina lui. */
  senat?: string;
}

export interface CdepBill extends CdepRow {
  cititLa: string;
  fisa: CdepSheet;
}

/** Rândul din listă, cu ce afișăm din fișă și din analiză, pentru pagina /camera. */
export interface CdepListItem extends CdepRow {
  stage: StageKey;
  cameraDecizionala: string | null;
  initiator: string | null;
  raport: string[];
  termenAmendamente: string | null;
  termenRaport: string | null;
  risk: { level: BillAnalysis['consensus']['riskLevel']; score: number; plainTitle: string } | null;
}

/** „Guvernul” sau „12 parlamentari”: fișa Camerei scrie „Initiator: Guvern” fără nume, altfel listează parlamentarii. */
export function initiatorLabel(fisa: CdepSheet): string | null {
  const n = fisa.initiatori.length;
  if (!n) return fisa.timeline.length ? 'Guvernul' : null;
  return n === 1 ? '1 parlamentar' : `${n} parlamentari`;
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

export async function getCdepIndex(): Promise<{ an: number; cititLa: string; proiecte: CdepRow[] } | null> {
  return readJson(path.join(DIR, 'index.json'));
}

export async function getCdepBill(slug: string): Promise<CdepBill | null> {
  return readJson(path.join(DIR, 'proiecte', `${slug}.json`));
}

export async function getCdepAnalysis(slug: string): Promise<BillAnalysis | null> {
  return readJson(path.join(ANALYSES_DIR, `${slug}.json`));
}

export async function getCommittees(): Promise<Record<string, { nume: string; url: string; email: string | null }>> {
  return (await readJson(path.join(DIR, 'comisii.json'))) ?? {};
}

/** Proiectele care primesc pagină la noi: fișa citită și neurmărite deja de la Senat. */
export async function getCdepSlugs(): Promise<string[]> {
  const index = await getCdepIndex();
  if (!index) return [];
  const read = new Set((await fs.readdir(path.join(DIR, 'proiecte')).catch(() => [])).map((f) => f.replace(/\.json$/, '')));
  return index.proiecte.filter((p) => !p.senat && read.has(p.slug)).map((p) => p.slug);
}

export async function getCdepList(): Promise<CdepListItem[]> {
  const index = await getCdepIndex();
  if (!index) return [];
  return Promise.all(
    index.proiecte.map(async (row) => {
      const bill = await getCdepBill(row.slug);
      const analysis = row.senat ? null : await getCdepAnalysis(row.slug);
      const c = analysis?.consensus;
      return {
        ...row,
        senat: row.senat ?? bill?.senat,
        stage: stageOf(row.stadiu),
        cameraDecizionala: bill?.fisa.cameraDecizionala ?? null,
        initiator: bill ? initiatorLabel(bill.fisa) : null,
        raport: bill?.fisa.comisii?.raport.map((c) => c.nume) ?? [],
        termenAmendamente: bill?.fisa.comisii?.termenAmendamente ?? null,
        termenRaport: bill?.fisa.comisii?.termenRaport ?? null,
        risk: c ? { level: c.riskLevel, score: c.riskScore, plainTitle: c.plainTitle } : null,
      };
    }),
  );
}
