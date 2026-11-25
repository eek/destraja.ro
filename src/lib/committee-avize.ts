// Avizele comisiilor în derularea procedurii unui proiect al Camerei: ce document ține de fiecare rând „primire aviz de
// la:” și câte avize au venit, de care fel, și câte se mai așteaptă. Funcții fără efecte, pe fișă și pe
// data/avize/comisii/<slug>.json.
import type { CommitteeAviz, CommitteeVerdict } from './avize';
import type { CdepSheet } from './cdep';

type Row = CdepSheet['timeline'][number];

// „Comisia pentru învățământ” scrisă la fel în fișă și în HTML, dar comparăm fără diacritice și majuscule, ca să nu
// depindem de ș/ş.
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
// „18.03.2026” → „2026-03-18”.
const iso = (d: string) => d.split('.').reverse().join('-');

export const isAvizRow = (t: Row) => t.camera === 'Camera Deputaților' && /^primire aviz de la:/i.test(t.actiune);

/** Comisiile din rândul „primire aviz de la: A; B — Anexa 3/14” sau „trimis pentru aviz la: A; B”. */
export function rowCommittees(actiune: string): string[] {
  const list = actiune.replace(/^[^:]*:\s*/, '').split(' — ')[0];
  return list
    .split(/;\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Documentele unui rând „primire aviz de la:”, în ordinea comisiilor din rând: cele primite în aceeași zi, de la una
 * dintre comisiile rândului. O comisie fără document (HTML-ul fișei, mai vechi decât rândul) rămâne cu `doc: null`.
 */
export function rowAvize(t: Row, docs: CommitteeAviz[]): { committee: string; doc: CommitteeAviz | null }[] {
  const day = iso(t.data);
  const sameDay = docs.filter((d) => d.receivedAt === day);
  const out: { committee: string; doc: CommitteeAviz | null }[] = [];
  const used = new Set<CommitteeAviz>();
  for (const name of rowCommittees(t.actiune)) {
    const n = norm(name);
    const doc = sameDay.find((d) => d.committees.some((c) => norm(c.nume) === n));
    // Un aviz comun ține de mai multe comisii din rând: îl arătăm o singură dată, la prima.
    if (doc && used.has(doc)) continue;
    if (doc) used.add(doc);
    out.push({ committee: doc ? doc.committees.map((c) => c.nume).join(', ') : name, doc: doc ?? null });
  }
  return out;
}

export interface AvizSummary {
  counts: Record<CommitteeVerdict, number>;
  /** Avize primite, cu PDF-ul încă necitit de noi. */
  unread: number;
  /** Comisiile sesizate pentru aviz (ultima trimitere) care nu au răspuns după ea. */
  waiting: string[];
  received: number;
}

/**
 * Bilanțul avizelor: câte au venit și de care fel (un aviz comun se numără o dată), câte nu le-am citit încă și ce
 * comisii sesizate la ultima trimitere „trimis pentru aviz la:” n-au trimis avizul după ea.
 */
export function avizSummary(timeline: Row[], docs: CommitteeAviz[]): AvizSummary {
  const counts: Record<CommitteeVerdict, number> = { favorabil: 0, favorabil_cu_amendamente: 0, negativ: 0, neclar: 0 };
  let unread = 0;
  let received = 0;
  const repliedAt = new Map<string, string>();
  for (const t of timeline.filter(isAvizRow)) {
    for (const { committee, doc } of rowAvize(t, docs)) {
      received++;
      if (doc?.verdict) counts[doc.verdict]++;
      else unread++;
      for (const c of doc ? doc.committees.map((x) => x.nume) : [committee]) repliedAt.set(norm(c), iso(t.data));
    }
  }
  const sent = timeline.filter((t) => t.camera === 'Camera Deputaților' && /^trimis pentru aviz la:/i.test(t.actiune)).at(-1);
  const waiting = sent ? rowCommittees(sent.actiune).filter((c) => (repliedAt.get(norm(c)) ?? '') < iso(sent.data)) : [];
  return { counts, unread, waiting, received };
}
