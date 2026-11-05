// Ce spun instituțiile despre un proiect, din data/avize/<slug>.json (scripts/straja-avize.mjs): punctul de vedere al
// Guvernului, raportul comisiei sesizate în fond, avizul Consiliului Legislativ și opinia Consiliului Fiscal. Fiecare
// document are un verdict și observații, fiecare cu un citat găsit în document.
import fs from 'node:fs/promises';
import path from 'node:path';

export type AvizKind = 'guvern' | 'raport' | 'cl' | 'cf';

export interface AvizQuoted {
  text: string;
  quote: string;
}

export interface AvizDoc {
  kind: AvizKind;
  /** „Guvernul”, „Consiliul Legislativ”, „Consiliul Fiscal” sau comisiile raportului, despărțite de „; ”. */
  institution: string;
  /** „punct de vedere”, „aviz”, „opinie”, „raport”, „raport suplimentar”, „raport de înlocuire”. */
  docType: string;
  pdfUrl: string | null;
  source: 'senat.ro' | 'cdep.ro' | null;
  /** Guvern: sustine | nu_sustine | sustine_cu_amendamente | la_aprecierea_parlamentului; CL: favorabil |
   * favorabil_cu_observatii | negativ; CF: estimat | fara_impact | necuantificat | neevaluat; raport: adoptare |
   * adoptare_cu_amendamente | respingere. Oricare poate fi „neclar”. */
  verdict: string;
  /** Formula care arată verdictul: din document (`verdictFrom: 'text'`) sau din fișa Camerei (`'fisa'`). */
  verdictQuote: string | null;
  verdictFrom: 'text' | 'fisa' | null;
  /** Când verdictul vine din fișă: formula din document care îl confirmă, dacă modelul a găsit-o. */
  textQuote?: string;
  /** Data documentului (AAAA-LL-ZZ), dacă e scrisă în el. */
  date: string | null;
  observations: AvizQuoted[];
  committees?: string[];
  /** Raport: ziua în care Camera l-a primit. */
  receivedAt?: string | null;
  amendamente?: { admise: number; respinse: number };
  vote?: { statement: string | null; pentru: number | null; contra: number | null; abtineri: number | null; quote: string };
  fundingSource?: boolean | null;
  fundingQuote?: string | null;
}

export interface BillAvize {
  slug: string;
  billId: string;
  updatedAt: string;
  documents: AvizDoc[];
}

export async function getBillAvize(slug: string): Promise<BillAvize | null> {
  try {
    const data = JSON.parse(await fs.readFile(path.join(process.cwd(), 'data', 'avize', `${slug}.json`), 'utf8')) as BillAvize;
    return data.documents?.length ? data : null;
  } catch {
    return null;
  }
}
