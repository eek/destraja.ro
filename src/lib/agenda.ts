// Ordinile de zi ale comisiilor și ale plenului, potrivite la build cu proiectele care au pagină pe site.
//
// Senatul: scripts/straja-agenda.mjs rulează pe VM din 2 în 2 ore și scrie data/agenda/senat/<zi>/<comisieId>.json, un
// fișier pe comisie și zi, cu forma din parseDay (scripts/lib/senat-agenda.mjs). Camera Deputaților n-are încă cititor;
// când va avea, scrie data/agenda/camera/<zi>/<comisie>.json cu aceeași formă și apare aici fără alt cod (cerințele sunt
// în cloud-status/agende.md). Fără fișiere (la un contribuitor, înainte de prima citire) totul e gol și nu se afișează nimic.
//
// Modulul importă doar tipuri, ca scripturile Node să-l poată folosi direct, fără compilare (ca press.ts în
// straja-digest.mjs): upcomingAgenda() dă aparițiile din următoarele zile, pentru e-mailuri. AGENDA_DIR schimbă dosarul
// citit, pentru teste cu date de probă ținute în afara depozitului.
import fs from 'node:fs/promises';
import path from 'node:path';
import type { RiskLevel } from './types';

export type AgendaChamber = 'senat' | 'camera';

/** O ședință din antetul ordinii de zi, cum apare pe pagină: descriere, „De la”, „Până la”, etaj, sală. */
interface RawSession {
  descriere?: string;
  deLa?: string;
  panaLa?: string;
  etaj?: string;
  sala?: string;
}

/**
 * Fișierul unei zile a unei comisii (straja-agenda.mjs). Un punct are `capitol`, `nr`, `numar`, `cod`, `b`, `titlu`, `scop`,
 * `termen` și `rezolutie`: la Senat `cod` e codul fișei (Legis/Lista.aspx?cod=…, ca în data/senat-bills.json), `numar` textul
 * linkului („L512/2026”) și `b` numărul de înregistrare pentru dezbatere („b543”); la Cameră `cod` va fi idp-ul fișei.
 */
interface RawDay {
  comisieId?: unknown;
  comisie?: unknown;
  zi?: unknown;
  url?: unknown;
  sedinte?: unknown;
  puncte?: unknown;
  cititLa?: unknown;
}

/** Proiectul de pe site la care trimite o apariție. */
export interface AgendaBill {
  /** Pagina lui: /legi (consultarea Senatului) sau /camera. */
  chamber: AgendaChamber;
  slug: string;
  href: string;
  /** „B543/2026” sau „PL-x 1/2026”. */
  id: string;
  title: string;
  risk: { level: RiskLevel; score: number } | null;
}

/** Un proiect urmărit, pe ordinea de zi a unei ședințe. */
export interface AgendaAppearance {
  /** A cui e ședința: Senatul sau Camera Deputaților. */
  chamber: AgendaChamber;
  /** YYYY-MM-DD, ora României. */
  zi: string;
  /** „10:00”, când pagina o scrie. */
  ora: string | null;
  oraFinal: string | null;
  comisieId: string;
  /** Numele comisiei, „Plenul Senatului” sau „Ședința comună a Camerei Deputaților și Senatului”. */
  comisie: string;
  plen: boolean;
  /** „sala 2135, etaj 2”, când pagina o scrie. */
  loc: string | null;
  /** Ordinea de zi oficială. */
  url: string | null;
  punct: { nr: string; numar: string; capitol: string; scop: string; termen: string; rezolutie: string };
  bill: AgendaBill;
}

export interface AgendaData {
  appearances: AgendaAppearance[];
  /** Zilele citite (cu sau fără proiecte de-ale noastre), ca să deosebim „nimic programat” de „încă necitit”. */
  read: { chamber: AgendaChamber; zi: string }[];
  /** Cea mai nouă citire, ISO. */
  cititLa: string | null;
}

const CHAMBERS: AgendaChamber[] = ['senat', 'camera'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PLEN = /^(plenul|ședința comună)/i;

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** Data de azi în România, ca „YYYY-MM-DD” (aceeași regulă ca todayISO din format.ts). */
export function agendaToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(now);
}

const shift = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Săptămâna (luni–duminică) în care cade ziua dată. */
export function weekOf(day = agendaToday()) {
  const back = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
  const start = shift(day, -back);
  return { start, end: shift(start, 6) };
}

/** „marți, 3 noiembrie” */
export const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));

/**
 * Numărul unui proiect, ca să-l putem compara între surse: „PL-x 1/2026” → „PLX1/2026”, „L477/10.11.2025” → „L477/2025”
 * (fișele Camerei scriu uneori data înregistrării la Senat), „B543/2026” rămâne la fel.
 */
export function billKey(raw: string | null | undefined): string | null {
  const m = raw
    ?.toUpperCase()
    .replace(/\s+/g, '')
    .match(/^([A-Z][A-Z-]*?)(\d+)\/(?:\d{1,2}\.\d{1,2}\.)?(\d{4})$/);
  return m ? `${m[1].replace(/-/g, '')}${Number(m[2])}/${m[3]}` : null;
}

// „10:00”, „9:30” sau „10.00” singur în celulă; o dată („03.11.2026 10:00”) nu e oră.
function hour(s?: string) {
  const m = s?.match(/\b(\d{1,2}):(\d{2})\b/) ?? s?.trim().match(/^(\d{1,2})[.,](\d{2})$/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

function place(s?: RawSession) {
  const sala = s?.sala?.trim();
  const etaj = s?.etaj?.trim();
  // În mijlocul rândului: „sala 2135, etaj 2”, oricum le-ar scrie pagina („Sala 2135”, „2135”, „Etaj 2”).
  const label = (word: string, v?: string) => v && (new RegExp(`^${word}\\b`, 'i').test(v) ? word + v.slice(word.length) : `${word} ${v}`);
  return [label('sala', sala), label('etaj', etaj)].filter(Boolean).join(', ') || null;
}

// Câmpurile vin din HTML-ul altui site: orice nu e text devine gol, ca un fișier ciudat să nu oprească build-ul.
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const session = (s: Record<string, unknown>): RawSession => ({ descriere: str(s.descriere), deLa: str(s.deLa), panaLa: str(s.panaLa), etaj: str(s.etaj), sala: str(s.sala) });
const item = (p: Record<string, unknown>) => ({
  capitol: str(p.capitol),
  nr: str(p.nr),
  numar: str(p.numar),
  cod: str(p.cod) || null,
  b: str(p.b) || null,
  titlu: str(p.titlu),
  scop: str(p.scop),
  termen: str(p.termen),
  rezolutie: str(p.rezolutie),
});
type Item = ReturnType<typeof item>;

async function readDays(dir: string) {
  const out: { chamber: AgendaChamber; zi: string; comisieId: string; comisie: string; url: string | null; sedinte: RawSession[]; puncte: Item[]; cititLa: string }[] = [];
  for (const chamber of CHAMBERS) {
    const base = path.join(dir, chamber);
    const days = (await fs.readdir(base).catch(() => [] as string[])).filter((d) => DAY.test(d)).sort();
    for (const zi of days) {
      const files = (await fs.readdir(path.join(base, zi)).catch(() => [] as string[])).filter((f) => f.endsWith('.json')).sort();
      for (const f of files) {
        // Un fișier stricat sau pe jumătate copiat nu oprește build-ul: îl sărim.
        const raw = await readJson<RawDay>(path.join(base, zi, f));
        if (!raw || !str(raw.comisie) || !Array.isArray(raw.puncte)) continue;
        // Dosarul spune ziua; o zi diferită în fișier înseamnă un fișier mutat de mână.
        if (raw.zi && raw.zi !== zi) continue;
        out.push({
          chamber,
          zi,
          comisieId: str(raw.comisieId) || f.replace(/\.json$/, ''),
          comisie: str(raw.comisie),
          url: str(raw.url) || null,
          sedinte: Array.isArray(raw.sedinte) ? raw.sedinte.filter(isObj).map(session) : [],
          puncte: raw.puncte.filter(isObj).map(item),
          cititLa: str(raw.cititLa),
        });
      }
    }
  }
  return out;
}

interface Tracked {
  bills: AgendaBill[];
  byKey: Map<string, AgendaBill[]>;
}

interface SenatRow {
  id: string;
  slug: string;
  cod: string;
}
interface CdepRow {
  slug: string;
  idp: number;
  numar: string;
  titlu: string;
  senat?: string;
}
interface Analysis {
  consensus: { plainTitle: string; riskLevel: RiskLevel; riskScore: number };
}

/**
 * Proiectele cu pagină, după aceleași reguli ca bills.ts și cdep.ts: de la Senat, cele cu analiză; de la Cameră, cele cu
 * fișa citită și neurmărite deja de la Senat. Cheile: codul fișei Senatului, idp-ul fișei Camerei și numerele (B…, L…, PL-x…).
 */
async function loadTracked(root: string): Promise<Tracked> {
  const data = path.join(root, 'data');
  const bills: AgendaBill[] = [];
  const byKey = new Map<string, AgendaBill[]>();
  const add = (bill: AgendaBill, keys: (string | null)[]) => {
    bills.push(bill);
    for (const k of new Set(keys.filter((k): k is string => !!k))) byKey.set(k, [...(byKey.get(k) ?? []), bill]);
  };
  const risk = (a: Analysis | null) => (a ? { level: a.consensus.riskLevel, score: a.consensus.riskScore } : null);

  const senat = (await readJson<SenatRow[] | { bills: SenatRow[] }>(path.join(data, 'senat-bills.json'))) ?? [];
  for (const b of Array.isArray(senat) ? senat : senat.bills) {
    const analysis = await readJson<Analysis>(path.join(data, 'analyses', `${b.slug}.json`));
    if (!analysis) continue;
    // Legătura cu fișa Camerei (scripts/straja-camera.mjs), pentru ordinile de zi ale Camerei.
    const camera = await readJson<{ idp: number; numar: string }>(path.join(data, 'camera', `${b.slug}.json`));
    add(
      { chamber: 'senat', slug: b.slug, href: `/legi/${b.slug}`, id: b.id, title: analysis.consensus.plainTitle, risk: risk(analysis) },
      [`senat:${b.cod}`, `nr:${billKey(b.id)}`, camera && `camera:${camera.idp}`, camera && billKey(camera.numar) && `nr:${billKey(camera.numar)}`],
    );
  }

  const index = await readJson<{ proiecte: CdepRow[] }>(path.join(data, 'cdep', 'index.json'));
  // Și proiectele din anii trecuți încă în dezbatere (data/cdep/ani/<an>.json, scripts/straja-cdep-vechi.mjs), ca în getCdepIndex.
  const oldFiles = (await fs.readdir(path.join(data, 'cdep', 'ani')).catch(() => [] as string[])).filter((f) => /^\d{4}\.json$/.test(f));
  const oldYears = await Promise.all(oldFiles.map((f) => readJson<{ proiecte: CdepRow[] }>(path.join(data, 'cdep', 'ani', f))));
  for (const row of [...(index?.proiecte ?? []), ...oldYears.flatMap((y) => y?.proiecte ?? [])]) {
    if (row.senat) continue;
    const sheet = await readJson<{ fisa: { numarSenat: string | null } }>(path.join(data, 'cdep', 'proiecte', `${row.slug}.json`));
    if (!sheet) continue;
    const analysis = await readJson<Analysis>(path.join(data, 'analyses', `${row.slug}.json`));
    const senatNr = billKey(sheet.fisa?.numarSenat);
    add(
      { chamber: 'camera', slug: row.slug, href: `/camera/${row.slug}`, id: row.numar, title: analysis?.consensus.plainTitle ?? row.titlu, risk: risk(analysis) },
      [`camera:${row.idp}`, billKey(row.numar) && `nr:${billKey(row.numar)}`, senatNr && `nr:${senatNr}`],
    );
  }
  return { bills, byKey };
}

/** Proiectele noastre dintr-un punct: întâi după cod și număr; doar dacă nu se găsește nimic, după numărul „b” (fără an). */
function matchItem(p: Item, chamber: AgendaChamber, zi: string, tracked: Tracked): AgendaBill[] {
  const found = new Set<AgendaBill>();
  for (const key of [p.cod && `${chamber}:${p.cod}`, billKey(p.numar) && `nr:${billKey(p.numar)}`]) {
    for (const b of (key && tracked.byKey.get(key)) || []) found.add(b);
  }
  const b = p.b?.match(/^b(\d+)$/i)?.[1];
  if (!found.size && b) {
    // Numărul b e pe an; o ordine de zi din ianuarie poate avea un proiect înregistrat în decembrie.
    const year = Number(zi.slice(0, 4));
    for (const y of [year, year - 1]) {
      const hit = tracked.byKey.get(`nr:B${Number(b)}/${y}`);
      if (hit) {
        hit.forEach((h) => found.add(h));
        break;
      }
    }
  }
  return [...found];
}

async function load(dir: string, root: string): Promise<AgendaData> {
  const days = await readDays(dir);
  const read = days.map((d) => ({ chamber: d.chamber, zi: d.zi }));
  const cititLa = days.reduce<string | null>((max, d) => (d.cititLa && (!max || d.cititLa > max) ? d.cititLa : max), null);
  // Fără nicio ordine de zi nu mai citim proiectele.
  if (!days.some((d) => d.puncte.length)) return { appearances: [], read, cititLa };

  const tracked = await loadTracked(root);
  const seen = new Set<string>();
  const appearances: AgendaAppearance[] = [];
  for (const d of days) {
    const when = d.sedinte.find((s) => hour(s.deLa)) ?? d.sedinte[0];
    for (const p of d.puncte) {
      for (const bill of matchItem(p, d.chamber, d.zi, tracked)) {
        // Același proiect de două ori în aceeași ședință (la raport și la aviz): păstrăm primul punct.
        const key = `${d.chamber}|${d.comisieId}|${d.zi}|${bill.href}`;
        if (seen.has(key)) continue;
        seen.add(key);
        appearances.push({
          chamber: d.chamber,
          zi: d.zi,
          ora: hour(when?.deLa),
          oraFinal: hour(when?.panaLa),
          comisieId: d.comisieId,
          comisie: d.comisie,
          plen: PLEN.test(d.comisie),
          loc: place(when),
          url: d.url,
          punct: { nr: p.nr, numar: p.numar, capitol: p.capitol, scop: p.scop, termen: p.termen, rezolutie: p.rezolutie },
          bill,
        });
      }
    }
  }
  // Pe zile, apoi pe oră (fără oră la urmă), comisiile înaintea plenului.
  appearances.sort(
    (a, b) =>
      a.zi.localeCompare(b.zi) ||
      (a.ora ?? '99').localeCompare(b.ora ?? '99') ||
      Number(a.plen) - Number(b.plen) ||
      a.comisie.localeCompare(b.comisie, 'ro') ||
      a.bill.id.localeCompare(b.bill.id, 'ro', { numeric: true }),
  );
  return { appearances, read, cititLa };
}

const cache = new Map<string, Promise<AgendaData>>();

/** Toate aparițiile proiectelor noastre în ordinile de zi citite; o singură citire pe build. */
export function getAgenda(root = process.cwd()): Promise<AgendaData> {
  const dir = process.env.AGENDA_DIR ? path.resolve(process.env.AGENDA_DIR) : path.join(root, 'data', 'agenda');
  const key = `${dir}|${root}`;
  if (!cache.has(key)) cache.set(key, load(dir, root));
  return cache.get(key)!;
}

/** Ședințele de azi încolo în care e programat proiectul de la `href` (/legi/… sau /camera/…). */
export async function getBillAgenda(href: string, from = agendaToday()): Promise<AgendaAppearance[]> {
  return (await getAgenda()).appearances.filter((a) => a.bill.href === href && a.zi >= from);
}

/**
 * Pentru e-mailuri: aparițiile proiectelor noastre în următoarele `days` zile, de la `from` inclusiv, în ordinea ședințelor.
 *
 *   import { upcomingAgenda } from '../src/lib/agenda.ts';
 *   const items = await upcomingAgenda({ days: 7, root: ROOT });
 */
export async function upcomingAgenda({ days = 7, from = agendaToday(), root }: { days?: number; from?: string; root?: string } = {}) {
  const until = shift(from, days);
  return (await getAgenda(root)).appearances.filter((a) => a.zi >= from && a.zi < until);
}
