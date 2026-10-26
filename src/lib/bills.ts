import fs from 'node:fs/promises';
import path from 'node:path';
import type { BillAnalysis, BillLite, BillNews, EnrichedBill } from './types';
import { daysUntil } from './format';

const ROOT = process.cwd();
const SENAT_BILLS_PATH = path.join(ROOT, 'data', 'senat-bills.json');
const ONE_LINERS_PATH = path.join(ROOT, 'data', 'citizen-one-liners.json');
const ANALYSES_DIR = path.join(ROOT, 'data', 'analyses');
const TEXTS_DIR = path.join(ROOT, 'data', 'texts');
const NEWS_DIR = path.join(ROOT, 'data', 'news');

type RawBill = Omit<EnrichedBill, 'daysRemaining' | 'analysis' | 'cesNegative'> & { syncedAt?: string };

let cache: Promise<{ bills: EnrichedBill[]; syncedAt: string | null }> | null = null;

async function load() {
  const raw = JSON.parse(await fs.readFile(SENAT_BILLS_PATH, 'utf8'));
  const list: RawBill[] = Array.isArray(raw) ? raw : raw.bills;
  const oneLiners: Record<string, string> = JSON.parse(await fs.readFile(ONE_LINERS_PATH, 'utf8'));

  let syncedAt: string | null = null;
  const bills: EnrichedBill[] = [];
  for (const { syncedAt: synced, ...bill } of list) {
    let analysis: BillAnalysis;
    try {
      analysis = JSON.parse(await fs.readFile(path.join(ANALYSES_DIR, `${bill.slug}.json`), 'utf8'));
    } catch {
      // Un proiect nou apare pe site abia după ce are analiza celor trei modele.
      console.warn(`[bills] ${bill.id} nu are analiză; nu îl afișăm încă`);
      continue;
    }
    analysis.consensus.citizenOneLiner ??= oneLiners[bill.slug];
    if (synced && (!syncedAt || synced > syncedAt)) syncedAt = synced;
    bills.push({
      ...bill,
      daysRemaining: daysUntil(bill.consultationDeadline),
      cesNegative: bill.timeline.some((t) => /consiliul economic/i.test(t.action) && /negativ/i.test(t.action)),
      analysis,
    });
  }

  bills.sort((a, b) => b.analysis.consensus.riskScore - a.analysis.consensus.riskScore || a.id.localeCompare(b.id, 'ro', { numeric: true }));
  return { bills, syncedAt };
}

function data() {
  cache ??= load();
  return cache;
}

export async function getAllBills(): Promise<EnrichedBill[]> {
  return (await data()).bills;
}

export async function getDataSyncedAt(): Promise<string | null> {
  return (await data()).syncedAt;
}

export async function getBillBySlug(slug: string): Promise<EnrichedBill | null> {
  return (await getAllBills()).find((b) => b.slug === slug) ?? null;
}

export function toLite(b: EnrichedBill): BillLite {
  const c = b.analysis.consensus;
  const verdict = (k: 'agy' | 'claude' | 'codex') => {
    const v = b.analysis.council[k];
    return { riskScore: v.riskScore, riskLevel: v.riskLevel, verdictShort: v.verdictShort };
  };
  return {
    id: b.id,
    slug: b.slug,
    cod: b.cod,
    officialTitle: b.officialTitle,
    consultationDeadline: b.consultationDeadline,
    daysRemaining: b.daysRemaining,
    opinionsCount: b.opinionsCount,
    sheetUrl: b.sheetUrl,
    initiators: b.initiators.map(({ name, role, party }) => ({ name, role, party })),
    parties: [...new Set(b.parties)],
    isCrossParty: b.isCrossParty,
    emergencyRequested: b.emergencyRequested,
    emergencyApproved: b.emergencyApproved,
    cesNegative: b.cesNegative,
    analysis: {
      consensus: {
        riskScore: c.riskScore,
        riskLevel: c.riskLevel,
        plainTitle: c.plainTitle,
        citizenOneLiner: c.citizenOneLiner,
        summaryTlDr: c.summaryTlDr,
        affectedGroups: c.affectedGroups,
      },
      council: { agy: verdict('agy'), claude: verdict('claude'), codex: verdict('codex') },
    },
  };
}

export async function getAllBillsLite(): Promise<BillLite[]> {
  return (await getAllBills()).map(toLite);
}

// Titlurile vin din pagina publicației și se termină des cu numele ei („… - B1TV.ro”).
function cleanTitle(title: string, outlet: string, domain: string) {
  const site = domain.replace(/^www\./, '').split('.')[0].toLowerCase();
  const tail = title.match(/\s+[-–|·]\s*([^-–|·]+)$/);
  if (tail && (tail[1].toLowerCase().includes(site) || tail[1].trim().toLowerCase() === outlet.toLowerCase())) return title.slice(0, tail.index).trim();
  return title.trim();
}

// Doar câmpurile afișate; propunerile neverificate („pending”) rămân în fișier, pentru operator.
export async function getBillNews(slug: string): Promise<BillNews | null> {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(NEWS_DIR, `${slug}.json`), 'utf8'));
    const seen = new Set<string>();
    const articles: BillNews['articles'] = [];
    for (const { url, title, outlet, domain, publishedAt } of raw.articles ?? []) {
      const clean = cleanTitle(title, outlet, domain);
      // Aceeași publicație republică uneori articolul la altă adresă.
      const key = `${domain.replace(/^(www|m|amp)\./, '')}|${clean.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      articles.push({ url, title: clean, outlet, domain, publishedAt: publishedAt ?? null });
    }
    articles.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
    return { checkedAt: raw.checkedAt, articles };
  } catch {
    return null;
  }
}

export async function getBillExtractedTexts(slug: string): Promise<{ filename: string; content: string }[]> {
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
