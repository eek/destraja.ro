import fs from 'node:fs/promises';
import path from 'node:path';
import type { BillAnalysis, BillLite, BillNews, BillPdf, BillPositions, CameraLink, CesOpinion, EnrichedBill, InstitutionalEmail, PressSummary } from './types';
import { daysUntil } from './format';
import { getBalanceSummary } from './balance';
import { recentPress } from './stats';
import { positionsSummary } from './positions';
import { pressArticle, stanceCounts, type RawPressItem } from './press';

const ROOT = process.cwd();
const SENAT_BILLS_PATH = path.join(ROOT, 'data', 'senat-bills.json');
const ONE_LINERS_PATH = path.join(ROOT, 'data', 'citizen-one-liners.json');
const ANALYSES_DIR = path.join(ROOT, 'data', 'analyses');
const TEXTS_DIR = path.join(ROOT, 'data', 'texts');
const NEWS_DIR = path.join(ROOT, 'data', 'news');
const CES_DIR = path.join(ROOT, 'data', 'ces');
const POSITIONS_DIR = path.join(ROOT, 'data', 'positions');
const CAMERA_DIR = path.join(ROOT, 'data', 'camera');
const SENAT_COMMITTEES_PATH = path.join(ROOT, 'data', 'senat', 'comisii.json');

// Adresele @senat.ro scrise de modele din memorie întorc des 550 RecipientNotFound (issue #2). Păstrăm doar adresele
// de pe paginile comisiilor (scripts/straja-senat-comisii.mjs); greșelile văzute deja le corectăm, restul le scoatem.
const SENAT_ALIASES: Record<string, string> = {
  'juridica@senat.ro': 'com.juridica@senat.ro',
  'comisia.juridica@senat.ro': 'com.juridica@senat.ro',
  'comisia.it@senat.ro': 'comunicatii@senat.ro',
};

async function senatEmails() {
  const raw = JSON.parse(await fs.readFile(SENAT_COMMITTEES_PATH, 'utf8')) as { generale: string[]; comisii: { email: string | null }[] };
  return new Set([...raw.generale, ...raw.comisii.map((c) => c.email).filter((e): e is string => !!e)]);
}

function checkSenatEmails(emails: InstitutionalEmail[] | undefined, valid: Set<string>, billId: string) {
  const fix = (list: string[] = []) =>
    [
      ...new Set(
        list.flatMap((raw) => {
          const e = raw.trim().toLowerCase();
          if (!e.endsWith('@senat.ro') || valid.has(e)) return [e];
          if (SENAT_ALIASES[e]) return [SENAT_ALIASES[e]];
          console.warn(`[bills] ${billId}: scot adresa necunoscută ${e}`);
          return [];
        }),
      ),
    ];
  return emails
    ?.map((m) => ({ ...m, to: fix(m.to), cc: m.cc && fix(m.cc) }))
    .filter((m) => m.to.length > 0);
}

type RawBill = Omit<EnrichedBill, 'daysRemaining' | 'analysis' | 'cesNegative' | 'ces' | 'news' | 'positions'> & { syncedAt?: string };

let cache: Promise<{ bills: EnrichedBill[]; syncedAt: string | null }> | null = null;

async function load() {
  const raw = JSON.parse(await fs.readFile(SENAT_BILLS_PATH, 'utf8'));
  const list: RawBill[] = Array.isArray(raw) ? raw : raw.bills;
  const oneLiners: Record<string, string> = JSON.parse(await fs.readFile(ONE_LINERS_PATH, 'utf8'));

  const validSenat = await senatEmails();

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
    analysis.consensus.institutionalEmails = checkSenatEmails(analysis.consensus.institutionalEmails, validSenat, bill.id);
    if (synced && (!syncedAt || synced > syncedAt)) syncedAt = synced;
    bills.push({
      ...bill,
      daysRemaining: daysUntil(bill.consultationDeadline),
      cesNegative: !!cesEntry(bill),
      ces: await getCesOpinion(bill),
      analysis,
      news: await getBillNews(bill.slug),
      positions: await getBillPositions(bill.slug),
      camera: await getBillCamera(bill.slug),
      balance: await getBalanceSummary(bill.slug),
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

function pressSummary(news: BillNews | null): PressSummary {
  const articles = news?.articles ?? [];
  const dates = articles.flatMap((a) => (a.publishedAt ? [a.publishedAt] : []));
  return { count: articles.length, dates, recent: recentPress(dates), latest: articles[0] ?? null, stances: stanceCounts(articles) };
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
    ces: b.ces,
    press: pressSummary(b.news),
    positions: positionsSummary(b.positions?.positions ?? []),
    balance: b.balance,
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
const cesEntry = (bill: Pick<RawBill, 'timeline'>) =>
  bill.timeline.find((t) => /consiliul economic/i.test(t.action) && /negativ/i.test(t.action));

async function getCesOpinion(bill: RawBill): Promise<CesOpinion | null> {
  const entry = cesEntry(bill);
  if (!entry) return null;
  try {
    const { number, date, pdfUrl, reasons } = JSON.parse(await fs.readFile(path.join(CES_DIR, `${bill.slug}.json`), 'utf8'));
    return { number, date, pdfUrl, reasons: reasons ?? [] };
  } catch {
    // Încă nerezumat: numărul și data tot le avem din cronologie.
    const m = entry.action.match(/nr\.\s*(\d+)\s*\/\s*(\d{2})\.(\d{2})\.(\d{4})/);
    const pdf = bill.pdfs.find((p) => p.type === 'aviz' && /economic/i.test(p.label));
    return { number: m?.[1] ?? null, date: m ? `${m[4]}-${m[3]}-${m[2]}` : null, pdfUrl: pdf?.url ?? null, reasons: [] };
  }
}

export async function getBillNews(slug: string): Promise<BillNews | null> {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(NEWS_DIR, `${slug}.json`), 'utf8'));
    const seen = new Set<string>();
    const articles: BillNews['articles'] = [];
    // Întâi publicațiile din listă, apoi celelalte linkuri verificate, dacă Clef le-a clasificat ca fiind despre proiect.
    const items: [RawPressItem, boolean][] = [
      ...(raw.articles ?? []).map((it: RawPressItem) => [it, true] as [RawPressItem, boolean]),
      ...(raw.pending ?? []).map((it: RawPressItem) => [it, false] as [RawPressItem, boolean]),
    ];
    for (const [item, listed] of items) {
      const clean = cleanTitle(item.title, item.outlet, item.domain);
      // Aceeași publicație republică uneori articolul la altă adresă.
      const key = `${item.domain.replace(/^(www|m|amp)\./, '')}|${clean.toLowerCase()}`;
      if (seen.has(key)) continue;
      const article = pressArticle(item, listed, clean);
      if (!article) continue;
      seen.add(key);
      articles.push(article);
    }
    articles.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
    return { checkedAt: raw.checkedAt, articles };
  } catch {
    return null;
  }
}

/** Fișa proiectului la Camera Deputaților, doar ce se afișează; fără fișier, proiectul n-are încă legătură verificată. */
export async function getBillCamera(slug: string): Promise<CameraLink | null> {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(CAMERA_DIR, `${slug}.json`), 'utf8'));
    const { idp, numar, tip, inregistrat, url, cameraDecizionala, stadiu, stadiuData } = raw;
    return { idp, numar, tip, inregistrat, url, cameraDecizionala, stadiu, stadiuData };
  } catch {
    return null;
  }
}

// Doar pozițiile verificate și câmpurile afișate; candidații neverificați („pending”) rămân în fișier, pentru operator.
export async function getBillPositions(slug: string): Promise<BillPositions | null> {
  let raw;
  try {
    raw = JSON.parse(await fs.readFile(path.join(POSITIONS_DIR, `${slug}.json`), 'utf8'));
  } catch {
    return null;
  }
  const positions: BillPositions['positions'] = (raw.positions ?? []).map((p: BillPositions['positions'][number]) => ({
    issuer: p.issuer,
    stance: p.stance,
    ...(p.removesProvisions && { removesProvisions: true }),
    documentType: p.documentType ?? null,
    title: p.title ?? null,
    quote: p.quote,
    date: p.date ?? null,
    pageUrl: p.pageUrl ?? null,
    documentUrl: p.documentUrl ?? null,
    domain: p.domain,
    viaPress: !!p.viaPress,
    ownSite: !!p.ownSite,
    signatories: p.signatories
      ? { organizations: p.signatories.organizations, individuals: p.signatories.individuals, names: p.signatories.names ?? [] }
      : null,
    verifiedAt: p.verifiedAt,
  }));
  return { checkedAt: raw.checkedAt ?? null, positions };
}

export interface BillText {
  label: string;
  url: string;
  /** Textul simplu (.txt): pentru analize și pentru documentele fără Markdown. */
  content: string;
  /** Textul cu structură (.md: titluri, paragrafe, tabele), când PDF-ul a fost citit cu OCR. */
  markdown: string | null;
  /** Text recunoscut automat din scanare (MinerU, Tesseract sau Apple Vision), nu luat din stratul de text al PDF-ului. */
  ocr: boolean;
}

/** Metodele din _meta.json: 'mineru', 'mineru+ocr', 'ocr', 'vision' (OCR) sau 'text' (stratul PDF-ului); textele vechi pot lipsi din meta. */
const isOcr = (method: string | undefined) => !!method && method !== 'text';

const TEXT_ORDER = ['forma_initiatorului', 'expunere_motive', 'aviz', 'adresa_inaintare', 'other'];

/** Același nume ca textName din scripts/lib/pdf-text.mjs: tipurile unice rămân așa, avizele primesc emitentul (aviz_ES). */
function textName(pdf: BillPdf) {
  if (pdf.type !== 'aviz' && pdf.type !== 'other') return pdf.type;
  const base = path.basename(pdf.url).replace(/\.pdf$/i, '');
  return `${pdf.type}_${base.replace(/^\d{2}b\d+/i, '') || base}`;
}

export async function getBillExtractedTexts(bill: Pick<EnrichedBill, 'slug' | 'pdfs'>): Promise<BillText[]> {
  const dir = path.join(TEXTS_DIR, bill.slug);
  let meta: Record<string, string> = {};
  try {
    meta = JSON.parse(await fs.readFile(path.join(dir, '_meta.json'), 'utf8'));
  } catch {
    // Texte vechi, fără meta: le arătăm oricum.
  }
  const out: (BillText & { order: number })[] = [];
  for (const pdf of bill.pdfs) {
    const name = textName(pdf);
    try {
      const content = (await fs.readFile(path.join(dir, `${name}.txt`), 'utf8')).trim();
      if (!content) continue;
      const markdown = (await fs.readFile(path.join(dir, `${name}.md`), 'utf8').catch(() => '')).trim() || null;
      out.push({ label: pdf.label, url: pdf.url, content, markdown, ocr: isOcr(meta[name]), order: TEXT_ORDER.indexOf(pdf.type) });
    } catch {
      // PDF fără text extras (încă nedescărcat sau gol).
    }
  }
  return out.sort((a, b) => a.order - b.order).map(({ order: _, ...t }) => t);
}
