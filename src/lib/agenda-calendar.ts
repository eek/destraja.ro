// Datele calendarului de pe /agenda, pregătite la build într-o formă compactă pentru componenta din browser: proiectele
// o singură dată (după index), ședințele pe zile (plenul întâi, apoi comisiile, după oră), punctele în ordinea oficială,
// fiecare cu rezultatele găsite după ziua ședinței (agenda-outcomes.ts), și zilele citite pe fiecare cameră.
import { type AgendaAppearance, type AgendaChamber, getAgenda } from './agenda';
import { type AgendaOutcome, loadOutcomeSources, nextAtSameBody, outcomesFor } from './agenda-outcomes';
import type { RiskLevel } from './types';
import { purpose } from '@/components/agenda/parts';

export interface CalBill {
  id: string;
  title: string;
  href: string;
  risk: { level: RiskLevel; score: number } | null;
}

export interface CalItem {
  /** Indexul proiectului în `bills`. */
  b: number;
  /** Numărul de pe ordinea de zi, când diferă de cel al proiectului („L617/2026” pentru B581/2026). */
  numar: string | null;
  /** De ce e pe ordinea de zi: „Raport, termen: 17.11.2026”. */
  purpose: string;
  outcomes: AgendaOutcome[];
}

export interface CalSession {
  key: string;
  chamber: AgendaChamber;
  comisie: string;
  plen: boolean;
  ora: string | null;
  oraFinal: string | null;
  loc: string | null;
  url: string | null;
  items: CalItem[];
}

export interface CalendarData {
  /** Ziua build-ului (ora României): până la ea inclusiv nu căutăm rezultate. */
  builtFor: string;
  cititLa: string | null;
  bills: CalBill[];
  /** Zilele cu proiecte urmărite pe ordinea de zi, după YYYY-MM-DD. */
  days: Record<string, CalSession[]>;
  /** Zilele cu ordini de zi citite, pe cameră (cu sau fără proiecte urmărite). */
  read: Record<AgendaChamber, string[]>;
}

const nrOf = (s: string) => Number(s.match(/\d+/)?.[0] ?? 9999);

export async function getCalendarData(today: string): Promise<CalendarData> {
  const { appearances, read, cititLa } = await getAgenda();
  const sources = await loadOutcomeSources(appearances.map((a) => a.bill));
  const next = nextAtSameBody(appearances);

  const bills: CalBill[] = [];
  const billIndex = new Map<string, number>();
  const billOf = (a: AgendaAppearance) => {
    let i = billIndex.get(a.bill.href);
    if (i === undefined) {
      i = bills.push({ id: a.bill.id, title: a.bill.title, href: a.bill.href, risk: a.bill.risk }) - 1;
      billIndex.set(a.bill.href, i);
    }
    return i;
  };

  const sessions = new Map<string, CalSession & { zi: string; nr: Map<CalItem, string> }>();
  appearances.forEach((a, i) => {
    const key = `${a.zi}|${a.chamber}|${a.comisieId}`;
    let s = sessions.get(key);
    if (!s) {
      s = { key: `${a.chamber}-${a.comisieId}`, zi: a.zi, chamber: a.chamber, comisie: a.comisie, plen: a.plen, ora: a.ora, oraFinal: a.oraFinal, loc: a.loc, url: a.url, items: [], nr: new Map() };
      sessions.set(key, s);
    }
    const item: CalItem = {
      b: billOf(a),
      numar: /\d/.test(a.punct.numar) && a.punct.numar !== a.bill.id ? a.punct.numar : null,
      purpose: purpose(a),
      outcomes: outcomesFor(a, sources.get(a.bill.href)!, today, next[i]),
    };
    s.items.push(item);
    s.nr.set(item, a.punct.nr);
  });

  const days: Record<string, CalSession[]> = {};
  for (const { zi, nr, ...s } of sessions.values()) {
    // Punctele în ordinea de pe ordinea de zi (numărul punctului), ca pe pagina oficială.
    s.items.sort((x, y) => nrOf(nr.get(x)!) - nrOf(nr.get(y)!));
    (days[zi] ??= []).push(s);
  }
  // Plenul întâi (Senat, apoi Camera), apoi comisiile după oră (fără oră la urmă) și nume.
  for (const list of Object.values(days)) {
    list.sort(
      (a, b) =>
        Number(b.plen) - Number(a.plen) ||
        (a.plen && b.plen ? a.chamber.localeCompare(b.chamber) * -1 : 0) ||
        (a.ora ?? '99').localeCompare(b.ora ?? '99') ||
        a.comisie.localeCompare(b.comisie, 'ro'),
    );
  }

  const readBy: Record<AgendaChamber, string[]> = { senat: [], camera: [] };
  for (const r of read) if (!readBy[r.chamber].includes(r.zi)) readBy[r.chamber].push(r.zi);
  readBy.senat.sort();
  readBy.camera.sort();

  return { builtFor: today, cititLa, bills, days, read: readBy };
}
