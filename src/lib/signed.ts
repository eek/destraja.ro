// Toate proiectele semnate de fiecare parlamentar, nu doar cele analizate: fișele Camerei pe care le avem (toate din 2026
// și cele din anii trecuți, din 2020, aflate încă la Cameră sau urmărite deja) și proiectele Senatului din consultare.
// Statisticile (src/lib/stats.ts) rămân doar pe proiectele analizate; lista aceasta arată și restul, cu riscul doar unde
// există analiza. Cine e cine între legislaturi: scripts/lib/semnaturi.mjs (fișa de pe cdep.ro sau numele, cu reguli
// care lasă nelegată orice semnătură nesigură); legislatura semnăturilor vechi vine din data/cdep/semnaturi.json.
import fs from 'node:fs/promises';
import path from 'node:path';
import { CURRENT_LEG, linkSigners } from '../../scripts/lib/semnaturi.mjs';
import { getAllBills } from './bills';
import { getBillVersions, getCdepAnalysis, getCdepBill, getCdepIndex, type CdepRow } from './cdep';
import { resolveStatus } from './bill-status';
import { isoDate } from './bill-ids';
import { plausibleLink } from './open-data-stage';
import { todayISO } from './format';
import type { RiskLevel } from './types';

export type SignedOutcome = 'dezbatere' | 'adoptat' | 'oprit';

export interface SignedRow {
  key: string;
  /** „PL-x 703/2026”, „B589/2026”. */
  id: string;
  href: string;
  /** Titlul pe înțeles când avem analiza, altfel titlul oficial. */
  title: string;
  analysed: boolean;
  /** Data înregistrării (YYYY-MM-DD). */
  registered: string;
  stage: string;
  /** Data stadiului (YYYY-MM-DD), când o știm. */
  stageDate: string | null;
  outcome: SignedOutcome;
  risk: { level: RiskLevel; score: number } | null;
  /** Încotro a mers textul la ultima schimbare de fond și după ce cameră (din comparația formelor, la Cameră). */
  textChange: { direction: 'mai_riscant' | 'mai_putin_riscant'; after: 'senat' | 'camera' } | null;
  /** Legislatura mandatului cu care a semnat (2024 = 2024–2028). */
  leg: number;
}

export interface SignedSummary {
  rows: number;
  linked: number;
  /** Semnături din legislaturi trecute lăsate nelegate (nume nesigure) și câte nume distincte. */
  unlinked: { signatures: number; names: number };
}

type Side = { legislaturi: Record<string, number | Record<string, number>>; mandate: Record<string, string[]> };

const camOf = (role?: string | null) => (role === 'senator' ? 1 : role === 'deputat' ? 2 : null);
/** „18.10.2021” sau „18-10-2021” → „2021-10-18”. */
const isoDay = (d: string | null | undefined) => {
  const m = d?.match(/^(\d{2})[.-](\d{2})[.-](\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Stările Camerei (src/lib/bill-status.ts) în cele trei grupe ale filtrului.
const ADOPTED = new Set(['adoptat_parlament', 'depus_ccr', 'la_presedinte', 'ccr_respins', 'promulgat', 'lege']);
const STOPPED = new Set(['respins_definitiv', 'incheiat']);

// Stadiul de pe fișa Senatului, scurt, ca etichetele Camerei.
const SENATE_STAGE: [RegExp, string][] = [
  [/^înregistrat la senat/i, 'Înregistrat la Senat'],
  [/comisiile permanente/i, 'La comisiile Senatului'],
  [/ordinea de zi/i, 'Pe ordinea de zi la Senat'],
  [/^trimis la camer/i, 'Trimis la Cameră'],
  [/^retras/i, 'Retras de inițiator'],
];
const senateStage = (stage: string) => SENATE_STAGE.find(([re]) => re.test(stage))?.[1] ?? capital(stage);

function senateOutcome(stage: string): SignedOutcome {
  if (/retras|respins|clasat/i.test(stage)) return 'oprit';
  if (/promulg|^lege/i.test(stage)) return 'adoptat';
  return 'dezbatere';
}

interface Entry {
  cam: number | null;
  leg: number | null;
  idm: number | null;
  name: string;
  party: string | null;
  row: string;
}

async function load() {
  const side: Side = await fs
    .readFile(path.join(process.cwd(), 'data', 'cdep', 'semnaturi.json'), 'utf8')
    .then((raw) => JSON.parse(raw) as Side)
    .catch(() => ({ legislaturi: {}, mandate: {} }));
  const index = await getCdepIndex();
  const senate = await getAllBills();
  const today = todayISO();

  const rows = new Map<string, SignedRow>();
  const entries: Entry[] = [];
  // Același proiect la Senat și la Cameră: un singur rând, al Senatului (are pagina și analiza lui), cu stadiul Camerei.
  const byNumber = new Map((index?.proiecte ?? []).map((r) => [r.numar, r]));
  const senateOf = new Map<string, string>();
  for (const b of senate) {
    const chamberRow = b.camera ? byNumber.get(b.camera.numar) : undefined;
    if (chamberRow) senateOf.set(chamberRow.slug, b.slug);
  }
  // Legătura scrisă de straja-cdep.mjs după numărul Senatului de pe fișa Camerei trece doar plauzibilă, ca în
  // src/lib/open-data.ts (fișa scrie uneori anul greșit); altfel cele două rămân rânduri separate.
  for (const r of index?.proiecte ?? []) {
    const b = r.senat ? senate.find((x) => x.slug === r.senat) : undefined;
    const bill = b && !senateOf.has(r.slug) ? await getCdepBill(r.slug) : null;
    if (!b || !bill) continue;
    const registered = isoDate((b.timeline.find((x) => /înregistrat la senat/i.test(x.action)) ?? b.timeline[0])?.date);
    const ok = plausibleLink({ senateRegistered: registered, senateStage: b.stage, chamberRegistered: isoDate(r.inregistrat), chamberNumber: r.numar, chamberTimeline: bill.fisa.timeline });
    if (ok) senateOf.set(r.slug, b.slug);
  }
  // Două proiecte ale Camerei legate de același proiect al Senatului: nu alegem, fiecare rămâne cu rândul lui (ca în open-data).
  const perSenate = new Map<string, number>();
  for (const s of senateOf.values()) perSenate.set(s, (perSenate.get(s) ?? 0) + 1);
  for (const [slug, s] of senateOf) if ((perSenate.get(s) ?? 0) > 1) senateOf.delete(slug);

  for (const b of senate) {
    const c = b.analysis.consensus;
    const first = b.timeline[0]?.date;
    const last = b.timeline.at(-1)?.date;
    rows.set(b.slug, {
      key: b.slug,
      id: b.id,
      href: `/legi/${b.slug}`,
      title: c.plainTitle,
      analysed: true,
      registered: isoDay(first) ?? `${b.id.slice(-4)}-01-01`,
      stage: senateStage(b.stage ?? 'la Senat'),
      stageDate: isoDay(last),
      outcome: senateOutcome(b.stage ?? ''),
      risk: { level: c.riskLevel, score: c.riskScore },
      textChange: null,
      leg: CURRENT_LEG,
    });
    for (const i of b.initiators) entries.push({ cam: camOf(i.role), leg: CURRENT_LEG, idm: null, name: i.name, party: i.party, row: b.slug });
  }

  // Cele mai noi întâi: partidul de acum al fiecăruia e primul găsit (linkSigners).
  const chamber = [...(index?.proiecte ?? [])].sort((a, b) => b.inregistrat.localeCompare(a.inregistrat));
  for (const r of chamber) {
    const bill = await getCdepBill(r.slug);
    if (!bill?.fisa.initiatori.length) continue;
    const merged = senateOf.get(r.slug);
    const status = resolveStatus({ ...bill, stadiu: r.stadiu }, today);
    const outcome: SignedOutcome = ADOPTED.has(status.key) ? 'adoptat' : STOPPED.has(status.key) ? 'oprit' : 'dezbatere';
    if (merged) {
      // Stadiul Camerei e mai nou decât al Senatului: proiectul a trecut deja de Senat.
      const row = rows.get(merged)!;
      rows.set(merged, { ...row, stage: status.chip, stageDate: isoDay(r.stadiuData) ?? row.stageDate, outcome });
    } else {
      const c = (await getCdepAnalysis(r.slug))?.consensus;
      const last = c ? (await getBillVersions(r.slug))?.changes.at(-1) : undefined;
      const textChange = last && last.direction !== 'la_fel' && last.to !== 'initiator' && last.to !== 'actualizata' ? { direction: last.direction, after: last.to } : null;
      rows.set(r.slug, { ...rowOf(r, status.chip, outcome, c ? { title: c.plainTitle, level: c.riskLevel, score: c.riskScore } : null), textChange });
    }
    const s = side.legislaturi[r.slug];
    for (const i of bill.fisa.initiatori) {
      let cam = camOf(i.rol);
      let leg: number | null = (i as { leg?: number }).leg ?? (typeof s === 'number' ? s : null);
      if (!leg && s && typeof s === 'object') {
        for (const c of cam ? [cam] : [1, 2]) {
          if (s[`${c}:${i.idm}`]) {
            leg = s[`${c}:${i.idm}`];
            cam = c;
          }
        }
      }
      entries.push({ cam, leg, idm: i.idm, name: i.nume, party: i.partid, row: merged ?? r.slug });
    }
  }

  const links: { person: string | null; why: string }[] = linkSigners(entries, side.mandate);
  const byMp = new Map<string, Map<string, SignedRow>>();
  const unlinkedNames = new Set<string>();
  let unlinked = 0;
  links.forEach((l, i) => {
    const e = entries[i];
    if (!l.person) {
      if (l.why !== 'fost') {
        unlinked++;
        unlinkedNames.add(`${e.name}|${e.cam}:${e.leg}`);
      }
      return;
    }
    const own = byMp.get(l.person) ?? new Map<string, SignedRow>();
    const row = rows.get(e.row)!;
    // Pe același proiect, legislatura cea mai nouă (un rând dublat la Senat și la Cameră e tot al legislaturii de acum).
    const leg = Math.max(e.leg ?? CURRENT_LEG, own.get(e.row)?.leg ?? 0);
    own.set(e.row, { ...row, leg });
    byMp.set(l.person, own);
  });
  const sorted = new Map([...byMp].map(([slug, own]) => [slug, [...own.values()].sort((a, b) => b.registered.localeCompare(a.registered) || b.id.localeCompare(a.id, 'ro', { numeric: true }))]));
  const summary: SignedSummary = {
    rows: rows.size,
    linked: links.filter((l) => l.person).length,
    unlinked: { signatures: unlinked, names: unlinkedNames.size },
  };
  return { byMp: sorted, summary };
}

function rowOf(r: CdepRow, stage: string, outcome: SignedOutcome, a: { title: string; level: RiskLevel; score: number } | null): SignedRow {
  return {
    key: r.slug,
    id: r.numar,
    href: `/camera/${r.slug}`,
    title: a?.title ?? r.titlu,
    analysed: !!a,
    registered: r.inregistrat,
    stage,
    stageDate: isoDay(r.stadiuData),
    outcome,
    risk: a ? { level: a.level, score: a.score } : null,
    textChange: null,
    leg: CURRENT_LEG,
  };
}

// Paginile tuturor parlamentarilor o cer; o calculăm o singură dată pe build.
let signed: ReturnType<typeof load> | null = null;
export function getSignedByMp() {
  signed ??= load();
  return signed;
}
