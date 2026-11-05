// „Alte proiecte care modifică aceeași lege”: indexul se face la build, din titlurile oficiale (src/lib/acts.ts), peste
// proiectele de la Senat (data/senat-bills.json) și de la Cameră (data/cdep). Același proiect apare des pe ambele părți:
// îl unim după legăturile pe care le folosește deja codul (`senat` pe rândul Camerei, numărul de la Senat de pe fișa
// Camerei, legătura verificată din data/camera, numărul BPI), ca să nu apară de două ori și nici ca rudă cu el însuși.
import fs from 'node:fs/promises';
import path from 'node:path';
import type { EnrichedBill, RiskLevel } from './types';
import { getAllBills } from './bills';
import { getCdepAnalysis, getCdepBill, getCdepIndex, getCdepSlugs, type CdepRow } from './cdep';
import { stageLabel, stageOf } from './cdep-text';
import { actLabel, extractActs, type ActRef } from './acts';

const CAMERA_DIR = path.join(process.cwd(), 'data', 'camera');

export interface RelatedRow {
  /** Nodul proiectului în index („s:b563-2026”, „c:plx-400-2025”); cheie React. */
  id: string;
  /** „B563/2026” sau „B563/2026 · PL-x 12/2026” când e același proiect la ambele camere. */
  number: string;
  href: string;
  title: string;
  risk: { level: RiskLevel; score: number } | null;
  /** Stadiul pe înțeles: „În consultare publică”, „La comisii”, „Respins”. */
  stage: string;
  /** Încă în dezbatere (nu respins, retras, încetat sau ajuns lege). */
  active: boolean;
  /** Data înregistrării (YYYY-MM-DD), pentru ordine. */
  date: string;
}

export interface RelatedAct {
  key: string;
  /** „Legea nr. 51/1995”, „Codul fiscal”, „Legea învățământului preuniversitar nr. 198/2023”. */
  title: string;
  /** Numele scris după număr („pentru organizarea și exercitarea profesiei de avocat”) sau numărul codului. */
  detail: string | null;
  /** Un cod („Codul fiscal”): `detail` e atunci numărul legii, scris după virgulă. */
  code: boolean;
  rows: RelatedRow[];
}

interface Member {
  node: string;
  side: 'senat' | 'camera';
  number: string;
  title: string;
  href: string | null;
  risk: RelatedRow['risk'];
  plainTitle: string | null;
  stage: string;
  active: boolean;
  date: string;
  keys: string[];
}

interface Group {
  members: Member[];
  acts: ActRef[];
  row: RelatedRow | null;
}

interface Index {
  groupOf: Map<string, Group>;
  byAct: Map<string, Group[]>;
  labels: Map<string, ReturnType<typeof actLabel>>;
}

// „B262/29.04.2026” → „B262/2026”; „L129/2026” rămâne.
const senatNo = (s: string | null | undefined) => {
  const m = s?.trim().match(/^([BL])\s*(\d+)\s*\/\s*(?:\d{1,2}\.\d{1,2}\.)?(\d{4})$/i);
  return m ? `${m[1].toUpperCase()}${+m[2]}/${m[3]}` : null;
};
// „692/21.09.2026” → „692/2026”.
const bpiNo = (s: string | null | undefined) => {
  const m = s?.trim().match(/^(\d+)\s*\/\s*(?:\d{1,2}\.\d{1,2}\.)?(\d{4})$/);
  return m ? `${+m[1]}/${m[2]}` : null;
};
// „07-10-2026” (Senatul) → „2026-10-07”.
const isoFromSenat = (d?: string) => (d && /^\d{2}-\d{2}-\d{4}$/.test(d) ? d.split('-').reverse().join('-') : '');

const OFFICIAL_PREFIX = /^(?:propunere legislativă|proiect de lege|proiectul legii)\s+/iu;
/** Titlul oficial fără „Propunere legislativă”, tăiat cât încape pe un rând sau două. */
export function shortTitle(t: string, max = 140) {
  const s = t.replace(OFFICIAL_PREFIX, '').trim();
  const c = s.charAt(0).toUpperCase() + s.slice(1);
  return c.length <= max ? c : `${c.slice(0, max).replace(/[\s,;:]+\S*$/, '')}…`;
}

function senatStage(b: EnrichedBill): { stage: string; active: boolean } {
  if (/retras/i.test(b.stage)) return { stage: 'Retras', active: false };
  if (/respins/i.test(b.stage)) return { stage: 'Respins', active: false };
  if (b.daysRemaining >= 0) return { stage: 'În consultare publică', active: true };
  if (/adoptat|trimis la camer/i.test(b.stage)) return { stage: 'Adoptat de Senat', active: true };
  return { stage: 'La Senat', active: true };
}

function cdepStage(stadiu: string): { stage: string; active: boolean } {
  const key = stageOf(stadiu);
  if (key === 'incheiat') {
    const stage = /respins/i.test(stadiu) ? 'Respins' : /retras/i.test(stadiu) ? 'Retras' : /încetat|incetat/i.test(stadiu) ? 'Procedură încetată' : 'Încheiat';
    return { stage, active: false };
  }
  if (key === 'lege') return { stage: 'Adoptat, lege', active: false };
  if (key === 'promulgare') return { stage: 'La promulgare', active: false };
  return { stage: stageLabel(key), active: true };
}

async function senatMembers(): Promise<Member[]> {
  const bills = await getAllBills();
  return Promise.all(
    bills.map(async (b) => {
      const keys = [`s:${b.slug}`, `sen:${senatNo(b.id) ?? b.id}`];
      const nr = senatNo(b.senatNr);
      if (nr) keys.push(`sen:${nr}`);
      // Legătura cu Camera verificată de scripts/straja-camera.mjs (titlu și inițiatori), nu doar BPI-ul din istoric.
      const cam = await fs
        .readFile(path.join(CAMERA_DIR, `${b.slug}.json`), 'utf8')
        .then((s) => JSON.parse(s) as { idp?: number; fisa?: { bpi?: string | null } })
        .catch(() => null);
      if (cam?.idp) keys.push(`idp:${cam.idp}`);
      const bpi = bpiNo(cam?.fisa?.bpi);
      if (bpi) keys.push(`bpi:${bpi}`);
      const registered = b.timeline.find((t) => /înregistrat la senat/i.test(t.action)) ?? b.timeline[0];
      const c = b.analysis.consensus;
      return {
        node: `s:${b.slug}`,
        side: 'senat' as const,
        number: b.id,
        title: b.officialTitle,
        href: `/legi/${b.slug}`,
        risk: { level: c.riskLevel, score: c.riskScore },
        plainTitle: c.plainTitle || null,
        ...senatStage(b),
        date: isoFromSenat(registered?.date),
        keys,
      };
    }),
  );
}

async function cdepMembers(): Promise<Member[]> {
  const index = await getCdepIndex();
  if (!index) return [];
  const pages = new Set(await getCdepSlugs());
  return Promise.all(
    index.proiecte.map(async (row: CdepRow) => {
      const [bill, analysis] = await Promise.all([getCdepBill(row.slug), getCdepAnalysis(row.slug)]);
      const fisa = bill?.fisa as (NonNullable<typeof bill>['fisa'] & { titlu?: string | null }) | undefined;
      const keys = [`c:${row.slug}`, `idp:${row.idp}`];
      const senat = row.senat ?? bill?.senat;
      if (senat) keys.push(`s:${senat}`);
      const nr = senatNo(fisa?.numarSenat);
      if (nr) keys.push(`sen:${nr}`);
      const bpi = bpiNo(fisa?.bpi);
      if (bpi) keys.push(`bpi:${bpi}`);
      const st = cdepStage(bill?.stadiu ?? row.stadiu);
      const c = analysis?.consensus;
      return {
        node: `c:${row.slug}`,
        side: 'camera' as const,
        number: row.numar,
        title: bill?.titlu || fisa?.titlu || row.titlu,
        href: pages.has(row.slug) ? `/camera/${row.slug}` : null,
        risk: c ? { level: c.riskLevel, score: c.riskScore } : null,
        plainTitle: c?.plainTitle || null,
        stage: st.stage,
        active: st.active,
        date: row.inregistrat,
        keys,
      };
    }),
  );
}

const words = (t: string) =>
  new Set(
    t
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4),
  );
function similar(a: string, b: string) {
  const x = words(a);
  const y = words(b);
  const common = [...x].filter((w) => y.has(w)).length;
  return common / Math.max(1, x.size + y.size - common) >= 0.5;
}

/**
 * Uniune după chei comune: două noduri cu aceeași cheie (idp, slug Senat, BPI, nr. Senat) sunt același proiect. Numărul
 * de la Senat de pe fișa Camerei e uneori greșit (PL-x 34/2026 și PL-x 35/2026 au amândouă L588/2025), deci pe el unim
 * doar când și titlurile seamănă.
 */
function unite(members: Member[]): Member[][] {
  const parent = members.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const owners = new Map<string, number[]>();
  members.forEach((m, i) => {
    for (const k of m.keys) {
      const seen = owners.get(k) ?? [];
      for (const j of seen) if (!k.startsWith('sen:') || similar(m.title, members[j].title)) parent[find(i)] = find(j);
      owners.set(k, [...seen, i]);
    }
  });
  const out = new Map<number, Member[]>();
  members.forEach((m, i) => out.set(find(i), [...(out.get(find(i)) ?? []), m]));
  return [...out.values()];
}

function toRow(members: Member[]): RelatedRow | null {
  // Pagina proiectului: a Senatului dacă există (acolo trimite și lista Camerei), altfel cea mai nouă de la Cameră.
  const byDate = (a: Member, b: Member) => b.date.localeCompare(a.date);
  const senat = members.filter((m) => m.side === 'senat' && m.href);
  const camera = members.filter((m) => m.side === 'camera').sort(byDate);
  const rep = senat[0] ?? camera.find((m) => m.href);
  if (!rep?.href) return null;
  const analysed = [rep, ...senat, ...camera].find((m) => m.risk);
  // Proiectul Senatului ajuns la Cameră: stadiul de acum e cel de la Cameră, după ce s-a încheiat consultarea.
  const later = rep.side === 'senat' && rep.stage !== 'În consultare publică' ? camera[0] : undefined;
  const numbers = [rep.number, ...members.filter((m) => m !== rep && m.side !== rep.side).map((m) => m.number)].slice(0, 2);
  return {
    id: rep.node,
    number: numbers.join(' · '),
    href: rep.href,
    title: analysed?.plainTitle ?? shortTitle(rep.title),
    risk: analysed?.risk ?? null,
    stage: (later ?? rep).stage,
    active: (later ?? rep).active,
    date: rep.date,
  };
}

async function build(): Promise<Index> {
  const members = [...(await senatMembers()), ...(await cdepMembers())];
  const groupOf = new Map<string, Group>();
  const byAct = new Map<string, Group[]>();
  const names = new Map<string, { ref: ActRef; names: string[]; prefixes: string[] }>();

  for (const ms of unite(members)) {
    const acts = new Map<string, ActRef>();
    for (const m of ms) {
      for (const a of extractActs(m.title)) {
        if (!acts.has(a.key)) acts.set(a.key, a);
        const n = names.get(a.key) ?? { ref: a, names: [], prefixes: [] };
        if (a.name) n.names.push(a.name);
        if (a.prefixName) n.prefixes.push(a.prefixName);
        names.set(a.key, n);
      }
    }
    const group: Group = { members: ms, acts: [...acts.values()], row: toRow(ms) };
    for (const m of ms) groupOf.set(m.node, group);
    for (const k of acts.keys()) byAct.set(k, [...(byAct.get(k) ?? []), group]);
  }

  // Numele afișat: cea mai scurtă formă curată găsită în titluri (minim trei cuvinte, ca să nu ia un nume rupt).
  const shortest = (list: string[]) => [...list].sort((a, b) => a.length - b.length || a.localeCompare(b, 'ro'))[0] ?? null;
  const labels = new Map<string, ReturnType<typeof actLabel>>();
  for (const [key, n] of names) {
    const clean = n.names.filter((s) => s.split(/\s+/).length >= 3);
    labels.set(key, actLabel(n.ref, shortest(clean.length ? clean : n.names), shortest(n.prefixes)));
  }
  return { groupOf, byAct, labels };
}

let cache: Promise<Index> | null = null;
const index = () => (cache ??= build());

const byStage = (a: RelatedRow, b: RelatedRow) => Number(b.active) - Number(a.active) || b.date.localeCompare(a.date) || a.number.localeCompare(b.number, 'ro', { numeric: true });

/**
 * Celelalte proiecte care modifică actele proiectului de pe pagină, câte un grup pe act (în ordinea din titlu): întâi cele
 * încă în dezbatere, apoi după dată, cele mai noi primele. Doar proiectele care au pagină la noi; fără el însuși.
 */
export async function getRelatedActs(page: { senat: string } | { camera: string }): Promise<RelatedAct[]> {
  const { groupOf, byAct, labels } = await index();
  const own = groupOf.get('senat' in page ? `s:${page.senat}` : `c:${page.camera}`);
  if (!own) return [];
  return own.acts.flatMap((a) => {
    const rows = (byAct.get(a.key) ?? [])
      .filter((g) => g !== own && g.row)
      .map((g) => g.row!)
      .sort(byStage);
    if (!rows.length) return [];
    const label = labels.get(a.key) ?? actLabel(a, a.name, a.prefixName);
    return [{ key: a.key, ...label, rows }];
  });
}

/** Câte proiecte diferite modifică aceleași acte (un proiect cu două acte comune se numără o dată). */
export const relatedCount = (acts: RelatedAct[]) => new Set(acts.flatMap((a) => a.rows.map((r) => r.id))).size;

/** Pentru raport și verificare: câte proiecte (unite) are fiecare act, cele mai multe primele. */
export async function actTotals(): Promise<{ key: string; title: string; detail: string | null; code: boolean; bills: number }[]> {
  const { byAct, labels } = await index();
  return [...byAct.entries()]
    .map(([key, groups]) => ({ key, ...(labels.get(key) ?? { title: key, detail: null, code: false }), bills: groups.length }))
    .sort((a, b) => b.bills - a.bills || a.key.localeCompare(b.key));
}

/** Pentru verificare: proiectele găsite la ambele camere (sau de două ori la Cameră) și unite într-unul. */
export async function mergedBills(): Promise<string[][]> {
  const { groupOf } = await index();
  return [...new Set(groupOf.values())].filter((g) => g.members.length > 1).map((g) => g.members.map((m) => `${m.number}${m.href ? '' : ' (fără pagină)'}`));
}
