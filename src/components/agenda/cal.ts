// Calculele calendarului, fără acces la fișiere (rulează și în browser): zile, luni, săptămâni, ce știm despre o zi.
import type { AgendaChamber } from '@/lib/agenda';
import type { CalendarData, CalSession } from '@/lib/agenda-calendar';
import { countWord } from '@/lib/format';

export const CHAMBERS: AgendaChamber[] = ['senat', 'camera'];
export const CHAMBER_NAME: Record<AgendaChamber, string> = { senat: 'Senat', camera: 'Camera Deputaților' };
export const CHAMBER_SHORT: Record<AgendaChamber, string> = { senat: 'S', camera: 'C' };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
export const isDay = (s: string | null): s is string => !!s && DAY.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));
export const isMonth = (s: string | null): s is string => !!s && MONTH.test(s) && Number(s.slice(5)) >= 1 && Number(s.slice(5)) <= 12;

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);
export function shift(iso: string, n: number) {
  const d = at(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function shiftMonth(month: string, n: number) {
  const d = at(`${month}-01`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
}
/** 0 = luni … 6 = duminică. */
export const weekday = (iso: string) => (at(iso).getUTCDay() + 6) % 7;
export const mondayOf = (iso: string) => shift(iso, -weekday(iso));

/** Săptămânile (luni–duminică) care acoperă luna, ca liste de câte 7 zile. */
export function monthWeeks(month: string) {
  const last = shift(`${shiftMonth(month, 1)}-01`, -1);
  const weeks: string[][] = [];
  for (let d = mondayOf(`${month}-01`); d <= last; d = shift(d, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => shift(d, i)));
  return weeks;
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('ro-RO', { timeZone: 'UTC', ...opts });
const LONG = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const MEDIUM = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const SHORT = fmt({ day: 'numeric', month: 'short' });
const MONTH_NAME = fmt({ month: 'long', year: 'numeric' });
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** „Marți, 17 noiembrie 2026” */
export const longDay = (iso: string) => upper(LONG.format(at(iso)));
/** „marți, 17 noiembrie” */
export const mediumDay = (iso: string) => MEDIUM.format(at(iso));
/** „17 nov.” */
export const shortDay = (iso: string) => SHORT.format(at(iso));
/** „Noiembrie 2026” */
export const monthName = (month: string) => upper(MONTH_NAME.format(at(`${month}-01`)));
export const WEEKDAYS = [
  ['Lu', 'luni'],
  ['Ma', 'marți'],
  ['Mi', 'miercuri'],
  ['Jo', 'joi'],
  ['Vi', 'vineri'],
  ['Sâ', 'sâmbătă'],
  ['Du', 'duminică'],
] as const;

/** Ce știm despre o cameră într-o zi: citită (cu sau fără proiecte), încă nepublicată sau dinainte să citim. */
export type Coverage = 'read' | 'pending' | 'none';

export interface DaySummary {
  zi: string;
  bills: number;
  by: Record<AgendaChamber, { bills: number; plen: number; com: number; coverage: Coverage }>;
  red: number;
  sessions: number;
  appearances: number;
}

export interface CalIndex {
  data: CalendarData;
  readSets: Record<AgendaChamber, Set<string>>;
  start: Record<AgendaChamber, string | null>;
  first: string | null;
  last: string | null;
}

export function indexCalendar(data: CalendarData): CalIndex {
  const readSets = { senat: new Set(data.read.senat), camera: new Set(data.read.camera) };
  const start = { senat: data.read.senat[0] ?? null, camera: data.read.camera[0] ?? null };
  const all = [...data.read.senat, ...data.read.camera, ...Object.keys(data.days)].sort();
  return { data, readSets, start, first: all[0] ?? null, last: all.at(-1) ?? null };
}

/**
 * O zi fără ordine de zi citită: până azi inclusiv înseamnă că nu s-a publicat niciuna (ordinile de zi apar cu zile
 * înainte, iar cititorul a trecut pe acolo), de mâine încolo că nu s-a publicat încă. Înainte de prima zi citită a camerei nu avem date deloc.
 */
export function coverage(ix: CalIndex, chamber: AgendaChamber, zi: string, today: string): Coverage {
  const start = ix.start[chamber];
  if (!start || zi < start) return 'none';
  if (ix.readSets[chamber].has(zi) || zi <= today) return 'read';
  return 'pending';
}

export function summarize(ix: CalIndex, zi: string, today: string): DaySummary {
  const sessions = ix.data.days[zi] ?? [];
  const all = new Set<number>();
  const red = new Set<number>();
  let appearances = 0;
  const by = {} as DaySummary['by'];
  for (const c of CHAMBERS) {
    const bills = new Set<number>();
    const plen = new Set<number>();
    const com = new Set<number>();
    for (const s of sessions.filter((s) => s.chamber === c)) {
      for (const it of s.items) {
        bills.add(it.b);
        all.add(it.b);
        (s.plen ? plen : com).add(it.b);
        if (ix.data.bills[it.b].risk?.level === 'red') red.add(it.b);
        appearances++;
      }
    }
    by[c] = { bills: bills.size, plen: plen.size, com: com.size, coverage: coverage(ix, c, zi, today) };
  }
  return { zi, bills: all.size, by, red: red.size, sessions: sessions.length, appearances };
}

const projects = (n: number) => countWord(n, 'proiect urmărit', 'proiecte urmărite');

/** Eticheta completă a unei zile din grilă, pentru cititoarele de ecran. */
export function dayAriaLabel(s: DaySummary, today: string) {
  const parts = [longDay(s.zi) + (s.zi === today ? ', azi' : '')];
  if (CHAMBERS.every((c) => s.by[c].coverage === 'none')) return `${parts[0]}. Nu avem date pentru această zi.`;
  if (!s.bills && CHAMBERS.every((c) => s.by[c].coverage !== 'read')) return `${parts[0]}. Ordinea de zi nu e publicată încă.`;
  if (!s.bills) return `${parts[0]}. Niciun proiect urmărit pe ordinea de zi.`;
  for (const c of CHAMBERS) {
    const b = s.by[c];
    if (b.bills) {
      const split = [b.plen && `${b.plen} în plen`, b.com && `${b.com} în comisii`].filter(Boolean).join(', ');
      parts.push(`${CHAMBER_NAME[c]}: ${projects(b.bills)} (${split})`);
    } else if (b.coverage === 'pending') parts.push(`${CHAMBER_NAME[c]}: ordinea de zi nu e publicată încă`);
  }
  if (s.red) parts.push(`${countWord(s.red, 'proiect', 'proiecte')} cu risc ridicat`);
  return `${parts.join('. ')}.`;
}

export const sessionHasPlenary = (sessions: CalSession[], c: AgendaChamber) => sessions.some((s) => s.chamber === c && s.plen);
