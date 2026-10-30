// Proiectele de la Camera Deputaților, din data/cdep (scripts/straja-cdep.mjs): lista anului, fișele citite și adresele
// comisiilor. Analizele modelelor, când există, stau ca la Senat în data/analyses/<slug>.json; acolo `senatForm`
// ține propunerea de amendament pentru comisie (aceleași patru câmpuri: articol, text propus, motivare, observații).
import fs from 'node:fs/promises';
import path from 'node:path';
import type { BalanceSummary, BillAnalysis, BillVersions, CdepSigned } from './types';
import { getBalanceSummary } from './balance';
import { getMpContacts } from './mp-contacts';
import { slugify } from './format';
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
  /** rol: din eticheta grupului („deputati - PSD:”); lipsește pe fișele citite înainte să-l păstrăm. */
  initiatori: { idm: number; nume: string; partid: string | null; rol?: 'deputat' | 'senator' }[];
  obiect: string | null;
  timeline: { camera: string | null; data: string; actiune: string }[];
  documente?: { url: string; eticheta: string }[];
  comisii?: { raport: CdepCommittee[]; aviz: CdepCommittee[]; termenAmendamente: string | null; termenRaport: string | null } | null;
  /** Consultarea publică de la Cameră (când e prima sesizată): termenul, câte propuneri s-au trimis și formularul de pe cdep.ro. */
  consultare?: { termen: string; propuneri: number; formular: string | null } | null;
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
  /** oneLiner: rezumatul modelelor, tăiat cât încape pe un card. */
  risk: { level: BillAnalysis['consensus']['riskLevel']; score: number; plainTitle: string; oneLiner: string } | null;
  /** Încotro a mers textul la ultima schimbare de fond și după ce cameră (din comparația formelor). */
  textChange: { direction: 'mai_riscant' | 'mai_putin_riscant'; after: 'senat' | 'camera' } | null;
  /** Ce e bine și ce strică în textul proiectului, pe scurt (scripts/straja-balance.mjs). */
  balance: BalanceSummary;
  /** Consultarea publică de la Cameră, dacă proiectul a avut una: termenul și câte propuneri s-au trimis. */
  consultare: { termen: string; propuneri: number } | null;
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

/** Formele textului și comparațiile lor, dacă proiectul are cel puțin două forme analizate. */
export async function getBillVersions(slug: string): Promise<BillVersions | null> {
  const v = await readJson<BillVersions>(path.join(ANALYSES_DIR, 'versions', `${slug}.json`));
  return v && v.versions.length >= 2 ? v : null;
}

/** Cât mai e de comparat între forme (data/cdep/versions-status.json, scris de straja-council.mjs --versions). */
export async function getVersionsStatus(): Promise<{ comparable: number; compared: number; pending: string[] } | null> {
  return readJson(path.join(DIR, 'versions-status.json'));
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

// Pe card intră trei rânduri; restul rezumatului e pe pagina proiectului.
const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max).replace(/[\s,;:]+\S*$/, '')}…`);

export async function getCdepList(): Promise<CdepListItem[]> {
  const index = await getCdepIndex();
  if (!index) return [];
  return Promise.all(
    index.proiecte.map(async (row) => {
      const bill = await getCdepBill(row.slug);
      const analysis = row.senat ? null : await getCdepAnalysis(row.slug);
      const versions = row.senat ? null : await getBillVersions(row.slug);
      const c = analysis?.consensus;
      const last = versions?.changes.at(-1);
      return {
        ...row,
        senat: row.senat ?? bill?.senat,
        stage: stageOf(row.stadiu),
        cameraDecizionala: bill?.fisa.cameraDecizionala ?? null,
        initiator: bill ? initiatorLabel(bill.fisa) : null,
        raport: bill?.fisa.comisii?.raport.map((c) => c.nume) ?? [],
        termenAmendamente: bill?.fisa.comisii?.termenAmendamente ?? null,
        termenRaport: bill?.fisa.comisii?.termenRaport ?? null,
        risk: c ? { level: c.riskLevel, score: c.riskScore, plainTitle: c.plainTitle, oneLiner: clip(c.citizenOneLiner || c.summaryTlDr, 260) } : null,
        textChange:
          last && last.direction !== 'la_fel' && last.to !== 'initiator' ? { direction: last.direction, after: last.to } : null,
        balance: row.senat ? null : await getBalanceSummary(row.slug),
        consultare: bill?.fisa.consultare ? { termen: bill.fisa.consultare.termen, propuneri: bill.fisa.consultare.propuneri } : null,
      };
    }),
  );
}

/** Partidul de pe fișa Camerei, cu numele de pe site: „neafiliati” → Neafiliați, „Minoritati” → Minorități, „SOS RO” → SOS. */
export function cdepParty(raw: string | null): string {
  const p = raw?.trim() ?? '';
  if (!p) return '';
  if (/^neafilia/i.test(p)) return 'Neafiliați';
  if (/^minorit/i.test(p)) return 'Minorități';
  if (/^SOS\b/i.test(p)) return 'SOS';
  return p.toUpperCase();
}

/**
 * Proiectele de la Cameră care au analiză, cu inițiatorii, pentru statisticile parlamentarilor (cele mai noi întâi).
 * Pe fișele citite înainte să păstrăm camera fiecăruia, rolul vine din datele de contact; un partid lipsă rămâne gol,
 * iar computeMpStats îl ia din alt proiect al aceluiași parlamentar.
 */
export async function getCdepSigned(): Promise<CdepSigned[]> {
  const index = await getCdepIndex();
  if (!index) return [];
  const contacts = await getMpContacts();
  // Camera o știm doar când numele s-a potrivit pe lista oficială (în funcție sau cu mandat încetat).
  const chamberOf = new Map(
    Object.entries(contacts)
      .filter(([, c]) => c.matched || c.endedOn)
      .map(([name, c]) => [slugify(name), c.chamber === 'senat' ? 'senator' : 'deputat']),
  );
  const rows = [...index.proiecte].filter((r) => !r.senat).sort((a, b) => b.inregistrat.localeCompare(a.inregistrat));
  const out = await Promise.all(
    rows.map(async (row): Promise<CdepSigned | null> => {
      const [bill, analysis] = await Promise.all([getCdepBill(row.slug), getCdepAnalysis(row.slug)]);
      if (!bill || !analysis || !bill.fisa.initiatori.length) return null;
      const c = analysis.consensus;
      return {
        id: row.numar,
        slug: row.slug,
        officialTitle: row.titlu,
        stadiu: row.stadiu,
        initiators: bill.fisa.initiatori.map((i) => ({
          name: i.nume,
          role: i.rol ?? chamberOf.get(slugify(i.nume)) ?? '',
          party: cdepParty(i.partid),
        })),
        analysis: { consensus: { riskScore: c.riskScore, riskLevel: c.riskLevel, plainTitle: c.plainTitle } },
      };
    }),
  );
  return out.filter((b) => b !== null);
}
