// Datele paginii /cum-functioneaza: ce rulează, unde și cu ce. Cifrele se calculează la build din aceleași
// date ca restul site-ului (getAllBills); ce nu se poate număra din date nu apare pe pagină.
import fs from 'node:fs/promises';
import path from 'node:path';
import { getAllBills, getBillExtractedTexts } from './bills';
import { countOrganisations } from './positions';
import { FEATURED_ID } from './site';

/**
 * Motorul OCR folosit de scripts/lib/pdf-text.mjs când stratul de text al unei scanări e stricat.
 * Un singur loc de schimbat dacă se schimbă motorul.
 */
export const OCR_ENGINE = { name: 'Tesseract', via: 'ocrmypdf', language: 'română' } as const;

/**
 * Modelele de decizie care rulează local, pe Mac-ul întreținătorului (scripts/local-models). Răspund la întrebările
 * fixe din PRESS_QUESTIONS, cu o probabilitate pentru fiecare variantă.
 */
export const LOCAL_MODELS = [
  { name: 'Clef', maker: 'Cloudflare', license: 'Apache-2.0', params: '27 de miliarde', runtime: 'MLX, pe 8 biți', engine: 'MLX', weights: 'mlx-community/clef-8bit' },
  { name: 'd1-3B', maker: 'Liquid AI', license: 'LFM Open License v1.0', params: '3 miliarde', runtime: 'PyTorch, pe GPU-ul Mac-ului', engine: 'PyTorch', weights: 'LiquidAI/d1-3B' },
] as const;

/** Al treilea cititor al presei: nu e local, rulează prin Codex, în același mediu izolat ca Gemini, Claude și ChatGPT. */
export const REMOTE_READER = { name: 'GPT-6 Luna', maker: 'OpenAI', runtime: 'prin Codex CLI, fără unelte' } as const;

/** Eticheta apare doar unde cel puțin doi din trei cititori aleg aceeași variantă, fiecare cu atâta încredere (src/lib/press.ts). */
export const LABEL_MIN_CONFIDENCE = 0.6;

export const PRESS_QUESTIONS = [
  { q: 'Ce poziție are față de proiect?', options: ['critic', 'favorabil', 'neutru', 'mixt'] },
  { q: 'Ce fel de sursă e?', options: ['presă națională', 'presă locală', 'de specialitate', 'partid sau politician', 'preluare', 'blog', 'ONG sau instituție'] },
  { q: 'Vorbește chiar despre proiect?', options: ['da', 'nu'] },
  { q: 'E comunicatul de presă al unui partid?', options: ['da', 'nu'] },
] as const;

const ROOT = process.cwd();

/** Versiunea instalată a unui pachet npm, ca „15.5”; null dacă nu se poate citi. */
async function installed(pkg: string) {
  try {
    const { version } = JSON.parse(await fs.readFile(path.join(ROOT, 'node_modules', pkg, 'package.json'), 'utf8'));
    return String(version).split('.').slice(0, 2).join('.');
  } catch {
    return null;
  }
}

export async function getTechFacts() {
  const bills = await getAllBills();

  let documents = 0;
  let ocr = 0;
  for (const b of bills) {
    for (const t of await getBillExtractedTexts(b)) {
      documents += 1;
      if (t.ocr) ocr += 1;
    }
  }

  const articles = bills.flatMap((b) => b.news?.articles ?? []);
  const positions = bills.flatMap((b) => b.positions?.positions ?? []);

  let allowlisted: number | null = null;
  try {
    allowlisted = Object.keys(JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'news-outlets.json'), 'utf8'))).length;
  } catch {
    allowlisted = null;
  }

  const example = bills.find((b) => b.id === FEATURED_ID) ?? bills[0] ?? null;

  const versions = Object.fromEntries(
    await Promise.all(
      ['next', 'react', 'tailwindcss', 'typescript', 'three', 'docx', 'wrangler', 'pdf-parse'].map(async (p) => [p, await installed(p)] as const),
    ),
  ) as Record<string, string | null>;

  return {
    bills: bills.length,
    open: bills.filter((b) => b.daysRemaining >= 0).length,
    documents,
    ocr,
    articles: articles.length,
    outlets: new Set(articles.map((a) => a.outlet)).size,
    allowlisted,
    positions: positions.length,
    organisations: countOrganisations(positions),
    corrected: bills.filter((b) => (b.analysis.corrections?.length ?? 0) > 0).length,
    example,
    versions,
  };
}

export type TechFacts = Awaited<ReturnType<typeof getTechFacts>>;
