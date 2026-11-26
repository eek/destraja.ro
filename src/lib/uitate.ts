// Pagina /uitate: de cât timp așteaptă proiectele aflate la Camera Deputaților, unde așteaptă și ce s-a întâmplat cu
// proiectele înregistrate în fiecare an. Toate definițiile sunt aici, într-un singur loc; pagina doar le afișează, iar
// scripts/check-uitate.mjs verifică sumele.
// Designul: destraja-eval/uitate (Sol și Carbon, 19 noiembrie 2026). Pe scurt:
//   - „pas procedural”: un pas din fișă care mută proiectul (sesizarea comisiilor, un raport, o dezbatere sau un vot în
//     plen, trimiterea la cealaltă cameră, la promulgare sau înapoi). Avizele primite, termenele și înscrierile pe ordinea
//     de zi nu sunt pași: un proiect poate apărea ani la rând pe ordinea de zi „sub rezerva raportului” fără să se miște.
//     Retrimiterea la comisii pentru un raport suplimentar e un pas: ceasul pornește din nou.
//   - „în dezbatere la Cameră”: aceleași stadii ca pe /camera (la comisii, cu raport, pe ordinea de zi, avize sau
//     reexaminare), din resolveStatus.
//   - zilele se numără calendaristic, cu vacanțele parlamentare, ca oricine să le poată verifica pe cdep.ro; un proiect
//     trece de „un an” a doua zi după aniversarea ultimului pas.
import fs from 'node:fs/promises';
import path from 'node:path';
import { getCdepBill, getCdepIndex, getCdepSlugs, registeredYear, type CdepBill, type CdepRow, type CdepSheet } from './cdep';
import { resolveStatus } from './bill-status';
import { shortCommittee, stageOf, type StageKey } from './cdep-text';
import { countWord } from './format';

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const isoOf = (ddmmyyyy: string) => ddmmyyyy.split('.').reverse().join('-');
const DAY = 86_400_000;
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

// ─── Pasul procedural ──────────────────────────────────────────────────────────────────────────────────────────────

/** Ce fel de pas e un rând din „derularea procedurii”; null = nu mută proiectul (aviz, termen, ordine de zi…). */
export type StepKind = 'sosire' | 'comisii' | 'retrimis' | 'raport' | 'plen' | 'vot' | 'transfer' | 'reexaminare' | 'ccr' | 'promulgare' | 'incheiat';

// În ordine: prima regulă care se potrivește decide. Cele care NU sunt pași stau primele, ca un „aviz” care pomenește un
// vot să nu treacă drept vot.
const STEP_RULES: { re: RegExp; kind: StepKind | null }[] = [
  // Nu sunt pași: avizele și punctele de vedere primite sau cerute, termenele, ordinea de zi, retragerea unei semnături.
  { re: /^(primire (aviz|punct de vedere|hotarare)|solicitare (aviz|punct)|aviz |trimis pentru aviz)/, kind: null },
  { re: /^inscris pe ordinea de zi/, kind: null },
  { re: /modificarea termenului|prelungirea termenului|aproba modificarea termen/, kind: null },
  { re: /^retragerea semnaturii|^adresa administratiei/, kind: null },
  // Pașii.
  { re: /^(prezentare in birou|inregistrat la camera|primit de la senat|plenul senatului a aprobat trimiterea)/, kind: 'sosire' },
  { re: /^trimis pentru (raport suplimentar|un nou raport)|aproba retransmiterea la comisii/, kind: 'retrimis' },
  { re: /^trimis pentru raport|^biroul permanent aproba solicitarea de sesizare in fond/, kind: 'comisii' },
  { re: /^primire raport/, kind: 'raport' },
  { re: /^dezbatere in plen/, kind: 'plen' },
  { re: /solicita reexaminarea|reexaminare la (senat|camer)|cererea de reexaminare/, kind: 'reexaminare' },
  { re: /^curtea constitutionala decide|^sesizare de neconstitu/, kind: 'ccr' },
  { re: /^(depunere la secretarul general|trimitere la presedintele)|promulgat[a]? prin decret|devine legea/, kind: 'promulgare' },
  { re: /^incetarea procedurii|respingere definitiva|^retras/, kind: 'incheiat' },
  { re: /^inaintat la (senat|camer)/, kind: 'transfer' },
  { re: /(^|\s)(adoptat[a]?|respins[a]?) de (catre )?(senat|camera)|^vot final|depasirii termenului|^legea .* (adoptata|respinsa)|^adoptat in sedinta comuna/, kind: 'vot' },
];

export function stepKind(actiune: string): StepKind | null {
  const p = plain(actiune).trim();
  return STEP_RULES.find((r) => r.re.test(p))?.kind ?? null;
}

const STEP_LABEL: Record<StepKind, string> = {
  sosire: 'Ajuns la Cameră',
  comisii: 'Trimis la comisii pentru raport',
  retrimis: 'Retrimis la comisii pentru raport suplimentar',
  raport: 'Raportul comisiei',
  plen: 'Dezbatere în plen',
  vot: 'Vot',
  transfer: 'Trimis la cealaltă cameră',
  reexaminare: 'Întors pentru reexaminare',
  ccr: 'Curtea Constituțională',
  promulgare: 'Spre promulgare',
  incheiat: 'Procedură încheiată',
};

export interface LastStep {
  /** YYYY-MM-DD */
  date: string;
  kind: StepKind;
  label: string;
}

/**
 * Ultimul pas procedural din fișă. Data înregistrării la Cameră (din lista Camerei) e și ea un pas („Ajuns la
 * Cameră”), pentru fișele în care sosirea nu apare ca rând. null când nu avem nicio dată sigură.
 */
export function lastProceduralStep(timeline: CdepSheet['timeline'], inregistrat: string | null): LastStep | null {
  let best: LastStep | null = inregistrat && /^\d{4}-\d{2}-\d{2}$/.test(inregistrat) ? { date: inregistrat, kind: 'sosire', label: STEP_LABEL.sosire } : null;
  for (const t of timeline) {
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(t.data)) continue;
    const kind = stepKind(t.actiune);
    if (!kind) continue;
    const date = isoOf(t.data);
    // La aceeași dată, rândul de mai jos din fișă e cel mai nou.
    if (!best || date >= best.date) best = { date, kind, label: kind === 'sosire' && chamberIsSenate(t.camera) ? 'Ajuns la Senat' : STEP_LABEL[kind] };
  }
  return best;
}
const chamberIsSenate = (c: string | null) => /senat/.test(plain(c ?? '')) && !/camer/.test(plain(c ?? ''));

// ─── Vechimea ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** Aniversarea a `years` ani de la `iso`; 29 februarie devine 28 februarie în anii nebisecți. */
export function anniversary(iso: string, years: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const ty = y + years;
  const leap = (ty % 4 === 0 && ty % 100 !== 0) || ty % 400 === 0;
  const day = m === 2 && d === 29 && !leap ? 28 : d;
  return `${ty}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** „Peste `years` ani”: a trecut de aniversare (din ziua de după ea). */
export const olderThan = (iso: string, years: number, today: string) => today > anniversary(iso, years);

export type BandKey = 'pana1' | 'ani1_2' | 'ani2_4' | 'peste4' | 'necunoscut';
export const BANDS: { key: BandKey; label: string; short: string }[] = [
  { key: 'pana1', label: 'Cel mult un an', short: '≤ 1 an' },
  { key: 'ani1_2', label: 'Între 1 și 2 ani', short: '1–2 ani' },
  { key: 'ani2_4', label: 'Între 2 și 4 ani', short: '2–4 ani' },
  { key: 'peste4', label: 'Peste 4 ani', short: '> 4 ani' },
  { key: 'necunoscut', label: 'Dată neconfirmată', short: 'neconfirmat' },
];

export function bandOf(last: string | null, today: string): BandKey {
  if (!last) return 'necunoscut';
  if (olderThan(last, 4, today)) return 'peste4';
  if (olderThan(last, 2, today)) return 'ani2_4';
  if (olderThan(last, 1, today)) return 'ani1_2';
  return 'pana1';
}

// ─── Unde așteaptă ─────────────────────────────────────────────────────────────────────────────────────────────────

export type WaitKey = 'avize' | 'comisii' | 'suplimentar' | 'raport' | 'plen' | 'reexaminare';
export const WAITS: { key: WaitKey; label: string; hint: string }[] = [
  { key: 'avize', label: 'Așteaptă avizele', hint: 'Proiect nou: așteaptă avizul Consiliului Legislativ, al CES sau punctul de vedere al Guvernului.' },
  { key: 'comisii', label: 'La comisii, fără raport', hint: 'Comisia care trebuie să facă raportul nu l-a depus încă.' },
  { key: 'suplimentar', label: 'Retrimis pentru raport suplimentar', hint: 'Plenul l-a întors la comisii după primul raport.' },
  { key: 'raport', label: 'Cu raport, așteaptă plenul', hint: 'Comisia a depus raportul; urmează înscrierea pe ordinea de zi și votul.' },
  { key: 'plen', label: 'Pe ordinea de zi', hint: 'Înscris pe ordinea de zi a plenului după raport; votul nu apare încă în fișă.' },
  { key: 'reexaminare', label: 'În reexaminare', hint: 'Întors de Președinte sau după o decizie a Curții Constituționale.' },
];

/** De aici încep fișele citite (scripts/lib/cdep-index.mjs, FIRST_YEAR). */
export const FIRST_YEAR = 2020;

/** Partea din stadiile resolveStatus care înseamnă „acum la Cameră” (ca pe /camera). */
export const AT_CHAMBER_STAGES: StageKey[] = ['comisii', 'raport', 'plen', 'altele'];

// ─── Proiectele ────────────────────────────────────────────────────────────────────────────────────────────────────

export interface WaitingBill {
  slug: string;
  numar: string;
  titlu: string;
  /** Anul înregistrării la Cameră. */
  an: number;
  inregistrat: string;
  /** Pagina de pe site (/camera/<slug>, sau /legi/<slug> pentru proiectele urmărite de la Senat); altfel fișa de pe cdep.ro. */
  href: string;
  internal: boolean;
  wait: WaitKey;
  /** Înscris pe ordinea de zi „sub rezerva depunerii raportului” (stadiul „-” din lista Camerei). */
  subRezerva: boolean;
  last: LastStep | null;
  /** Zile de la ultimul pas; null când data nu e sigură. */
  days: number | null;
  /** Zile de la înregistrarea la Cameră. */
  totalDays: number;
  band: BandKey;
  /** Aprobă sau respinge o ordonanță (de urgență sau simplă): ordonanța se aplică deja, de la publicare. */
  ordonanta: boolean;
  initiator: 'guvern' | 'parlamentari';
  /** Senatul, ca primă cameră, l-a adoptat tacit: i-a trecut termenul constituțional fără vot (art. 75 alin. 2). */
  tacit: boolean;
  /** Comisiile sesizate pentru raport (numele scurte). */
  comisii: string[];
  /** Camera e camera decizională (are ultimul cuvânt). */
  decizionala: boolean | null;
}

export type OutcomeKey = 'lege' | 'incheiat' | 'altundeva' | 'activ' | 'nemiscat' | 'necunoscut';
export const OUTCOMES: { key: OutcomeKey; label: string; hint: string }[] = [
  { key: 'lege', label: 'Au devenit legi', hint: 'Stadiul din lista Camerei: „Lege nr./an” (promulgată).' },
  { key: 'incheiat', label: 'Respinse sau încheiate', hint: 'Respinse definitiv, retrase, clasate sau cu procedura încetată.' },
  { key: 'altundeva', label: 'La Senat sau la promulgare', hint: 'Au plecat de la Cameră și nu s-au încheiat încă.' },
  { key: 'activ', label: 'La Cameră, cu un pas în ultimul an', hint: 'În dezbatere la Cameră, cu cel puțin un pas procedural în ultimele 12 luni.' },
  { key: 'nemiscat', label: 'La Cameră, fără niciun pas de peste un an', hint: 'În dezbatere la Cameră, fără pas procedural de peste un an.' },
  { key: 'necunoscut', label: 'Stadiu necunoscut', hint: 'Rândul din listă nu are un stadiu pe care să-l recunoaștem.' },
];

export interface Cohort {
  an: number;
  /** Proiectele înregistrate la Cameră în acel an (rândurile listei, fără BP). */
  inregistrate: number;
  counts: Record<OutcomeKey, number>;
  /** Unde ne-am luat rezultatul: lista completă a anului (toate rândurile) sau doar proiectele încă urmărite. */
  complet: boolean;
  /** Rânduri din lista anului pe care nu le urmărim încă (apărute la Cameră după ultima citire a fișelor): „necunoscut”. */
  neurmarite: number;
  /** Data listei din care vin stadiile. */
  cititLa: string | null;
}

export interface CommitteeQueue {
  nume: string;
  /** Proiecte la comisii (fără raport sau cu raport suplimentar cerut) unde comisia e sesizată pentru raport. */
  asteapta: number;
  pestUnAn: number;
}

export interface UitateData {
  today: string;
  /** Când a fost citită lista anului curent (data/cdep/index.json). */
  cititLa: string | null;
  total: number;
  over1: number;
  over2: number;
  over4: number;
  bands: { key: BandKey; count: number }[];
  byWait: { key: WaitKey; count: number; over1: number; subRezerva: number }[];
  /** Toate proiectele aflate la Cameră, de la cel care așteaptă de cel mai mult timp (lista cu filtre de pe pagină). */
  all: WaitingBill[];
  /** Cele mai vechi, după zilele de la ultimul pas (apoi după vechimea totală). */
  longest: WaitingBill[];
  oldest: WaitingBill | null;
  /** Câte dintre cele mai vechi au venit adoptate tacit de Senat. */
  tacitInLongest: number;
  /** Proiectele de aprobare a unei ordonanțe, dintre cele aflate la Cameră. */
  ordonante: { total: number; over1: number };
  initiators: { key: 'guvern' | 'parlamentari'; total: number; over1: number; ordonante: number }[];
  /** Camera decizională vs. prima cameră, dintre cele fără pas de peste un an. */
  decisional: { decizionala: number; prima: number; neclar: number };
  committees: CommitteeQueue[];
  cohorts: Cohort[];
  /**
   * Proiectele înregistrate înainte de 2020 încă la Cameră după lista anului (fără fișe citite: nu știm de când stau).
   * Doar anii pentru care avem lista în data/cdep/stadii; restul rămân necitiți.
   */
  older: { years: { an: number; atChamber: number; randuri: number; cititLa: string }[]; atChamber: number };
  /**
   * De ce totalul diferă de numărătoarea după lista Camerei: lista rămâne uneori în urmă față de fișe (un proiect adoptat
   * apare încă „raport”). `listAtChamber`: la Cameră după stadiul din listă; `sheetLeft`: dintre ele, plecate după fișă;
   * `sheetBack`: la Cameră după fișă, deși lista spune altceva. `trackedRows`: rândurile fișierelor anilor trecuți
   * (data/cdep/ani), cu tot cu proiectele care au plecat între timp de la Cameră și pe care le urmărim mai departe.
   */
  reconcile: { trackedRows: number; trackedLeft: number; listAtChamber: number; sheetLeft: number; sheetBack: number; duplicates: number };
}

const OUTCOME_OF_STAGE: Record<StageKey, OutcomeKey> = {
  comisii: 'activ',
  raport: 'activ',
  plen: 'activ',
  altele: 'activ',
  senat: 'altundeva',
  promulgare: 'altundeva',
  lege: 'lege',
  incheiat: 'incheiat',
};

const ordinance = (titlu: string) => /aprobarea (ordonantei|o\.?u\.?g)|respingerea ordonantei/.test(plain(titlu));

function waitOf(status: ReturnType<typeof resolveStatus>): WaitKey {
  if (status.key === 'avize') return 'avize';
  if (status.key === 'reexaminare' || status.key === 'ccr_admis') return 'reexaminare';
  if (status.stage === 'raport') return 'raport';
  if (status.stage === 'plen') return 'plen';
  // „Retrimis la comisii pentru un raport suplimentar / un nou raport”, „Retrimis de plen la comisii” (resolveStatus).
  if (status.key === 'comisii' && /^Retrimis/.test(status.title)) return 'suplimentar';
  if (status.stage === 'altele') return 'reexaminare';
  return 'comisii';
}

/** Rândul unei liste pe an (data/cdep/stadii/<an>.json, scripts/straja-cdep-stadii.mjs). */
export interface StadiuRow {
  slug: string;
  numar: string;
  inregistrat: string;
  stadiu: string;
  stadiuData: string | null;
}
export interface StadiiYear {
  an: number;
  cititLa: string;
  randuri: number;
  proiecte: StadiuRow[];
}

export interface UitateInput {
  today: string;
  cititLa: string | null;
  /** Anul listei curente (data/cdep/index.json). */
  an: number;
  /** Toate rândurile urmărite (getCdepIndex: anul curent + anii trecuți). */
  rows: CdepRow[];
  /** Câte rânduri au fișierele anilor trecuți, cu tot cu cele care apar și în lista curentă. */
  trackedRows: number;
  sheets: Map<string, CdepBill>;
  pages: Set<string>;
  /** Listele complete pe an, când le avem. */
  stadii: Map<number, StadiiYear>;
  /** Câte rânduri are lista fiecărui an trecut (din data/cdep/ani, `randuri`). */
  yearRows: Map<number, { randuri: number; cititLa: string }>;
}

const LONGEST = 30;

/** Calculul paginii, fără fișiere: îl folosesc și pagina, și scripts/check-uitate.mjs. */
export function computeUitate(input: UitateInput): UitateData {
  const { today, rows, sheets, pages } = input;
  const waiting: WaitingBill[] = [];
  /** Rezultatul fiecărui proiect urmărit, după slug, pentru graficul pe ani. */
  const outcome = new Map<string, OutcomeKey>();

  for (const row of rows) {
    const bill = sheets.get(row.slug);
    const status = bill ? resolveStatus({ ...bill, stadiu: row.stadiu, titlu: row.titlu }, today) : null;
    const stage = status?.stage ?? stageOf(row.stadiu);
    let out = OUTCOME_OF_STAGE[stage];
    if (AT_CHAMBER_STAGES.includes(stage)) {
      const last = bill ? lastProceduralStep(bill.fisa.timeline, row.inregistrat) : null;
      const band = bandOf(last?.date ?? null, today);
      if (band !== 'pana1' && band !== 'necunoscut') out = 'nemiscat';
      if (band === 'necunoscut') out = 'necunoscut';
      const senat = row.senat ?? bill?.senat;
      const href = senat ? `/legi/${senat}` : pages.has(row.slug) ? `/camera/${row.slug}` : row.url;
      const dec = bill?.fisa.cameraDecizionala ? plain(bill.fisa.cameraDecizionala) : '';
      waiting.push({
        slug: row.slug,
        numar: row.numar,
        titlu: row.titlu,
        an: registeredYear(row),
        inregistrat: row.inregistrat,
        href,
        internal: href.startsWith('/'),
        wait: status ? waitOf(status) : 'comisii',
        subRezerva: /^-$/.test(row.stadiu.trim()),
        last,
        days: last ? daysBetween(last.date, today) : null,
        totalDays: daysBetween(row.inregistrat, today),
        band,
        ordonanta: ordinance(row.titlu),
        initiator: bill && bill.fisa.initiatori.length === 0 ? 'guvern' : 'parlamentari',
        tacit: !!bill?.fisa.timeline.some((t) => /senat/.test(plain(t.camera ?? '')) && /depasirii termenului/.test(plain(t.actiune))),
        comisii: (bill?.fisa.comisii?.raport ?? []).map((c) => shortCommittee(c.nume)),
        decizionala: !dec ? null : /camer/.test(dec) && !/senat/.test(dec) ? true : /senat/.test(dec) && !/camer/.test(dec) ? false : null,
      });
    }
    outcome.set(row.slug, out);
  }

  const total = waiting.length;
  const count = (f: (b: WaitingBill) => boolean) => waiting.filter(f).length;
  const isOver = (b: WaitingBill, y: number) => b.last !== null && olderThan(b.last.date, y, today);
  const stale = waiting.filter((b) => isOver(b, 1));

  // Toate, de la cel care așteaptă de cel mai mult timp; cele fără dată sigură la coadă.
  const all = [...waiting].sort(
    (a, b) => (b.days ?? -1) - (a.days ?? -1) || b.totalDays - a.totalDays || a.numar.localeCompare(b.numar, 'ro', { numeric: true }),
  );
  const longest = all.filter((b) => b.days !== null).slice(0, LONGEST);

  // Comisiile: doar proiectele care așteaptă raportul (sau raportul suplimentar); un raport comun contează la fiecare.
  const queues = new Map<string, CommitteeQueue>();
  for (const b of waiting) {
    if (b.wait !== 'comisii' && b.wait !== 'suplimentar') continue;
    for (const c of new Set(b.comisii)) {
      const q = queues.get(c) ?? { nume: c, asteapta: 0, pestUnAn: 0 };
      q.asteapta++;
      if (isOver(b, 1)) q.pestUnAn++;
      queues.set(c, q);
    }
  }

  // Pe ani: lista completă a anului dacă o avem (toate rândurile), altfel doar rândurile urmărite.
  const years = new Set<number>([...rows.map(registeredYear), ...[...input.stadii.keys()].filter((y) => y >= FIRST_YEAR)]);
  const cohorts: Cohort[] = [...years]
    .sort((a, b) => a - b)
    .map((an) => {
      const counts = Object.fromEntries(OUTCOMES.map((o) => [o.key, 0])) as Record<OutcomeKey, number>;
      const isCurrent = an === input.an;
      // Anul curent are deja toate rândurile în data/cdep/index.json, cu fișele lor.
      const full = isCurrent ? null : input.stadii.get(an);
      if (full) {
        let neurmarite = 0;
        for (const r of full.proiecte) {
          // Pentru proiectele urmărite, stadiul din fișă (mai nou decât lista); pentru celelalte, stadiul din listă. Unul
          // aflat la Cameră pe care nu-l urmărim încă n-are fișă citită: nu știm de când n-a mai avut un pas.
          const tracked = outcome.get(r.slug);
          const k = tracked ?? OUTCOME_OF_STAGE[stageOf(r.stadiu ?? '')];
          if (!tracked && k === 'activ') neurmarite++;
          counts[!tracked && k === 'activ' ? 'necunoscut' : k]++;
        }
        // Proiectele urmărite care lipsesc din listă (n-ar trebui să existe): le numărăm, ca suma să rămână adevărată.
        const inList = new Set(full.proiecte.map((r) => r.slug));
        for (const r of rows) if (registeredYear(r) === an && !inList.has(r.slug)) counts[outcome.get(r.slug)!]++;
        return { an, inregistrate: Object.values(counts).reduce((s, n) => s + n, 0), counts, complet: true, neurmarite, cititLa: full.cititLa };
      }
      for (const r of rows) if (registeredYear(r) === an) counts[outcome.get(r.slug)!]++;
      const yr = input.yearRows.get(an);
      return {
        neurmarite: 0,
        an,
        inregistrate: isCurrent ? Object.values(counts).reduce((s, n) => s + n, 0) : (yr?.randuri ?? 0),
        counts,
        complet: isCurrent,
        cititLa: isCurrent ? input.cititLa : (yr?.cititLa ?? null),
      };
    });

  const slugs = rows.map((r) => r.slug);
  const here = (r: CdepRow) => ['activ', 'nemiscat', 'necunoscut'].includes(outcome.get(r.slug)!);
  const listHere = (r: CdepRow) => AT_CHAMBER_STAGES.includes(stageOf(r.stadiu));
  return {
    today,
    cititLa: input.cititLa,
    total,
    over1: stale.length,
    over2: count((b) => isOver(b, 2)),
    over4: count((b) => isOver(b, 4)),
    bands: BANDS.map((b) => ({ key: b.key, count: count((w) => w.band === b.key) })),
    byWait: WAITS.map((w) => ({
      key: w.key,
      count: count((b) => b.wait === w.key),
      over1: count((b) => b.wait === w.key && isOver(b, 1)),
      subRezerva: count((b) => b.wait === w.key && b.subRezerva),
    })),
    all,
    longest,
    oldest: longest[0] ?? null,
    ordonante: { total: count((b) => b.ordonanta), over1: stale.filter((b) => b.ordonanta).length },
    initiators: (['guvern', 'parlamentari'] as const).map((key) => ({
      key,
      total: count((b) => b.initiator === key),
      over1: stale.filter((b) => b.initiator === key).length,
      ordonante: count((b) => b.initiator === key && b.ordonanta),
    })),
    tacitInLongest: longest.filter((b) => b.tacit).length,
    decisional: {
      decizionala: stale.filter((b) => b.decizionala === true).length,
      prima: stale.filter((b) => b.decizionala === false).length,
      neclar: stale.filter((b) => b.decizionala === null).length,
    },
    committees: [...queues.values()].sort((a, b) => b.pestUnAn - a.pestUnAn || b.asteapta - a.asteapta || a.nume.localeCompare(b.nume)),
    cohorts,
    older: (() => {
      const ys = [...input.stadii.values()]
        .filter((y) => y.an < FIRST_YEAR)
        .sort((a, b) => a.an - b.an)
        .map((y) => ({ an: y.an, randuri: y.randuri, cititLa: y.cititLa, atChamber: y.proiecte.filter((r) => AT_CHAMBER_STAGES.includes(stageOf(r.stadiu ?? ''))).length }));
      return { years: ys, atChamber: ys.reduce((s, y) => s + y.atChamber, 0) };
    })(),
    reconcile: {
      trackedRows: input.trackedRows,
      trackedLeft: rows.filter((r) => registeredYear(r) !== input.an && !here(r)).length,
      listAtChamber: rows.filter(listHere).length,
      sheetLeft: rows.filter((r) => listHere(r) && !here(r)).length,
      sheetBack: rows.filter((r) => !listHere(r) && here(r)).length,
      duplicates: slugs.length - new Set(slugs).size,
    },
  };
}

// ─── Citirea fișierelor ────────────────────────────────────────────────────────────────────────────────────────────

const DIR = path.join(process.cwd(), 'data', 'cdep');
async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

export async function loadUitateInput(today: string): Promise<UitateInput | null> {
  const index = await getCdepIndex();
  if (!index) return null;
  const [pages, sheetList] = await Promise.all([getCdepSlugs(), Promise.all(index.proiecte.map((r) => getCdepBill(r.slug)))]);
  const sheets = new Map<string, CdepBill>();
  sheetList.forEach((b, i) => b && sheets.set(index.proiecte[i].slug, b));
  const stadii = new Map<number, StadiiYear>();
  const yearRows = new Map<number, { randuri: number; cititLa: string }>();
  let trackedRows = 0;
  const yearFiles = (await fs.readdir(path.join(DIR, 'ani')).catch(() => [] as string[])).filter((f) => /^\d{4}\.json$/.test(f));
  for (const f of yearFiles) {
    const y = await readJson<{ an: number; cititLa: string; randuri: number; proiecte: unknown[] }>(path.join(DIR, 'ani', f));
    if (!y) continue;
    yearRows.set(y.an, { randuri: y.randuri, cititLa: y.cititLa });
    trackedRows += y.proiecte.length;
  }
  const stadiiFiles = (await fs.readdir(path.join(DIR, 'stadii')).catch(() => [] as string[])).filter((f) => /^\d{4}\.json$/.test(f));
  for (const f of stadiiFiles) {
    const y = await readJson<StadiiYear>(path.join(DIR, 'stadii', f));
    if (y?.proiecte?.length) stadii.set(y.an, y);
  }
  return { today, cititLa: index.cititLa, an: index.an, rows: index.proiecte, trackedRows, sheets, pages: new Set(pages), stadii, yearRows };
}

export async function getUitate(today: string): Promise<UitateData | null> {
  const input = await loadUitateInput(today);
  return input ? computeUitate(input) : null;
}

// ─── Pe pagina proiectului ─────────────────────────────────────────────────────────────────────────────────────────
// Același pas procedural și aceleași zile ca pe /uitate, pentru un singur proiect: pagina lui spune că stă pe loc, că
// fișa e la zi și când am verificat-o. scripts/check-uitate.mjs verifică că cele două socoteli nu se despart.

/** De la câte luni fără pas procedural arată pagina proiectului că stă pe loc. /uitate numără de la un an; pagina, mai devreme. */
export const STILL_MONTHS = 6;
/** De la câte zile spunem „verificată ultima dată pe …”: fișele se recitesc la câteva săptămâni (scripts/lib/cdep-reread.mjs). */
export const CHECK_OLD_DAYS = 14;

/** Data aflată la `months` luni după `iso`; ziua se oprește la ultima zi a lunii (31 august + 6 luni = 28 februarie). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const ty = Math.floor(total / 12);
  const tm = (total % 12) + 1;
  const last = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return `${ty}-${String(tm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** Ani și luni întregi de la `from` la `to`: „1 an și 9 luni”, „2 ani”, „7 luni”. */
export function spanRo(from: string, to: string): string {
  let months = 0;
  while (addMonths(from, months + 1) <= to) months++;
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts = [y ? countWord(y, 'an', 'ani') : null, m ? countWord(m, 'lună', 'luni') : null].filter(Boolean);
  return parts.join(' și ') || 'mai puțin de o lună';
}

// Rândurile care nu mută proiectul, ca să spunem ce a apărut în fișă după ultimul pas.
const QUIET_KINDS: { re: RegExp; label: string }[] = [
  { re: /^(primire (aviz|punct de vedere|hotarare)|solicitare (aviz|punct)|aviz |trimis pentru aviz)/, label: 'avize și puncte de vedere' },
  { re: /^inscris pe ordinea de zi/, label: 'înscrieri pe ordinea de zi' },
  { re: /termen/, label: 'termene mutate' },
];

export interface Stillness {
  last: LastStep;
  /** Zile de la ultimul pas procedural, ca pe /uitate. */
  days: number;
  /** „1 an și 9 luni”. */
  span: string;
  band: BandKey;
  wait: WaitKey;
  /** Ce a mai apărut în fișă după ultimul pas, fără să-l mute, și data ultimului astfel de rând; null când nimic. */
  quiet: { kinds: string[]; lastDate: string } | null;
  /** Ziua în care am citit ultima dată fișa de pe cdep.ro (YYYY-MM-DD). */
  checkedOn: string;
  /** Citirea e mai veche de CHECK_OLD_DAYS. */
  checkedLongAgo: boolean;
  url: string;
}

/**
 * De cât timp stă pe loc un proiect aflat la Cameră (aceleași stadii ca /uitate), sau null când nu e la Cameră, nu are o
 * dată sigură sau a avut un pas în ultimele STILL_MONTHS luni.
 */
export function stillness(bill: CdepBill, today: string, status: ReturnType<typeof resolveStatus> = resolveStatus(bill, today)): Stillness | null {
  if (!AT_CHAMBER_STAGES.includes(status.stage)) return null;
  const last = lastProceduralStep(bill.fisa.timeline, bill.inregistrat);
  if (!last || today <= addMonths(last.date, STILL_MONTHS)) return null;
  const after = bill.fisa.timeline.filter((t) => /^\d{2}\.\d{2}\.\d{4}$/.test(t.data) && isoOf(t.data) > last.date);
  const kinds = QUIET_KINDS.filter((k) => after.some((t) => k.re.test(plain(t.actiune).trim()))).map((k) => k.label);
  const checkedOn = bill.cititLa.slice(0, 10);
  return {
    last,
    days: daysBetween(last.date, today),
    span: spanRo(last.date, today),
    band: bandOf(last.date, today),
    wait: waitOf(status),
    quiet: after.length ? { kinds, lastDate: after.map((t) => isoOf(t.data)).sort().at(-1)! } : null,
    checkedOn,
    checkedLongAgo: daysBetween(checkedOn, today) > CHECK_OLD_DAYS,
    url: bill.url,
  };
}

/** Același calcul pentru fișa Camerei legată de un proiect al Senatului („PL-x 755/2026” → plx-755-2026). */
export async function stillnessOfNumber(numar: string | null | undefined, today: string): Promise<Stillness | null> {
  const m = numar?.match(/^\s*pl-?x\s*(\d+)\/(\d{4})/i);
  if (!m) return null;
  const bill = await getCdepBill(`plx-${m[1]}-${m[2]}`);
  return bill ? stillness(bill, today) : null;
}
