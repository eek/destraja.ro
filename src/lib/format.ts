const DAY_MS = 24 * 60 * 60 * 1000;

export const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(1).replace('.', ',') : '–');

/** „1 proiect”, „5 proiecte”, „20 de proiecte” — regula lui „de” din română. */
export function countWord(n: number, one: string, many: string) {
  if (n === 1) return `1 ${one}`;
  const rest = Math.abs(n) % 100;
  return `${n}${(rest === 0 && n !== 0) || rest >= 20 ? ' de' : ''} ${many}`;
}

export function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function slugify(s: string) {
  return normalize(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Data de azi în România, ca „YYYY-MM-DD”, identică pe server și în browser. */
export function todayISO(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(now);
}

function parseDeadline(ddmmyyyy: string) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(ddmmyyyy);
  return m ? Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : NaN;
}

/** Zile calendaristice până la termen: 0 = azi e ultima zi, negativ = consultare încheiată. */
export function daysUntil(ddmmyyyy: string, today = todayISO()) {
  const deadline = parseDeadline(ddmmyyyy);
  const [y, mo, d] = today.split('-').map(Number);
  if (!Number.isFinite(deadline)) return 0;
  return Math.round((deadline - Date.UTC(y, mo - 1, d)) / DAY_MS);
}

export function formatDeadline(ddmmyyyy: string, month: 'short' | 'long' = 'long') {
  const t = parseDeadline(ddmmyyyy);
  if (!Number.isFinite(t)) return ddmmyyyy;
  return new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month, year: 'numeric', timeZone: 'UTC' }).format(t);
}

export type DeadlineTone = 'urgent' | 'soon' | 'calm' | 'closed';

export function deadlineInfo(days: number): { label: string; short: string; tone: DeadlineTone; open: boolean } {
  if (days < 0) return { label: 'Consultare încheiată', short: 'încheiată', tone: 'closed', open: false };
  if (days === 0) return { label: 'Ultima zi: azi', short: 'azi', tone: 'urgent', open: true };
  if (days === 1) return { label: 'Ultima zi: mâine', short: 'mâine', tone: 'urgent', open: true };
  return {
    label: `Mai ai ${countWord(days, 'zi', 'zile')}`,
    short: countWord(days, 'zi', 'zile'),
    tone: days <= 3 ? 'urgent' : days <= 7 ? 'soon' : 'calm',
    open: true,
  };
}

export const DEADLINE_TONE: Record<DeadlineTone, string> = {
  urgent: 'text-ink',
  soon: 'text-body',
  calm: 'text-muted',
  closed: 'text-muted',
};

export function formatDateRo(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Bucharest' }).format(d);
}
