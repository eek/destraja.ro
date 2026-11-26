import fs from 'node:fs/promises';
import path from 'node:path';
import { type BillSection, type CiteScope, type CiteSpan, actAt, billSections, locate, resolve } from './citari';
import type { CiteFile, CiteForm } from './citari-text';

// Trimiterile la articole, la build: fișierul proiectului (data/citari/<slug>.json, scris de scripts/straja-citari.mjs)
// și, pentru citatele din proiect, textul formei, ca să știm din ce articol al proiectului vin.

const DIR = path.join(process.cwd(), 'data', 'citari');
const TEXTS = path.join(process.cwd(), 'data', 'texts');
const FORM_FILES: Record<CiteForm, string> = { initiator: 'forma_initiatorului', senat: 'forma_senat', camera: 'forma_camera' };

const files = new Map<string, Promise<CiteFile | null>>();
export function getCiteFile(slug: string): Promise<CiteFile | null> {
  let p = files.get(slug);
  if (!p) {
    p = fs.readFile(path.join(DIR, `${slug}.json`), 'utf8').then(
      (s) => JSON.parse(s) as CiteFile,
      () => null,
    );
    files.set(slug, p);
  }
  return p;
}

export async function getCiteSlugs(): Promise<string[]> {
  const names = await fs.readdir(DIR).catch(() => [] as string[]);
  return names.filter((f) => f.endsWith('.json') && !f.startsWith('_')).map((f) => f.replace(/\.json$/, ''));
}

const forms = new Map<string, Promise<{ text: string; sections: BillSection[] } | null>>();
function billForm(slug: string, form: CiteForm, file: CiteFile) {
  const key = `${slug}:${form}`;
  let p = forms.get(key);
  if (!p) {
    p = fs.readFile(path.join(TEXTS, slug, `${FORM_FILES[form]}.txt`), 'utf8').then(
      (text) => ({ text, sections: billSections(text, file.acts).sections }),
      () => null,
    );
    forms.set(key, p);
  }
  return p;
}

/** La ce se referă textul: forma analizei, a „Ce e bine și ce strică”, cea primită de Cameră sau una anume. */
export interface CiteWhere {
  role?: keyof CiteFile['forms'];
  form?: CiteForm | null;
  /** Textul e citat din proiect (din forma de mai sus). */
  quote?: boolean;
  /** Textul e citat din legea în vigoare (lawQuote din „Ce e bine și ce strică”): trimiterile lui sunt ale acelei legi. */
  law?: boolean;
}

const BASELINE = path.join(process.cwd(), 'data', 'baseline');
const baselines = new Map<string, Promise<{ acts?: { articles?: { text?: string }[] }[] } | null>>();
function baselineOf(slug: string) {
  let p = baselines.get(slug);
  if (!p) {
    p = fs.readFile(path.join(BASELINE, `${slug}.json`), 'utf8').then(
      (s) => JSON.parse(s),
      () => null,
    );
    baselines.set(slug, p);
  }
  return p;
}

/** Actul din baseline (același indice ca în data/citari) în al cărui text apare citatul; null dacă niciunul sau mai multe. */
export async function lawActOf(slug: string, quote: string): Promise<number | null> {
  const b = await baselineOf(slug);
  const hits = (b?.acts ?? []).flatMap((a, i) => ((a.articles ?? []).some((x) => x.text && locate(x.text, quote) >= 0) ? [i] : []));
  return hits.length === 1 ? hits[0] : null;
}

/** Trimiterile rezolvate dintr-un text de pe pagina proiectului `slug`. */
export async function citeSpans(slug: string, text: string, where: CiteWhere = {}): Promise<CiteSpan[]> {
  if (!text || !/art|anex/i.test(text)) return [];
  const file = await getCiteFile(slug);
  if (!file) return [];
  const form = where.form !== undefined ? where.form : file.forms[where.role ?? 'analysis'];
  const scope: CiteScope = { form };
  if (where.law) {
    const act = await lawActOf(slug, text);
    if (act != null) scope.billAct = act;
  } else if (where.quote && form) {
    const bill = await billForm(slug, form, file);
    const at = bill ? locate(bill.text, text) : -1;
    if (bill && at >= 0) scope.billAct = actAt(bill.sections, at);
  }
  return resolve(text, file, scope);
}
