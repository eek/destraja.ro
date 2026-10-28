import type { BillLite, RiskLevel, Signed } from './types';
import { MODELS, OPOZITIE, PUTERE, partyFullName, type ModelKey } from './site';
import { addDays, slugify, todayISO } from './format';

export function oneLiner(b: BillLite) {
  return b.analysis.consensus.citizenOneLiner || b.analysis.consensus.summaryTlDr;
}

export function byRiskDesc(a: Signed, b: Signed) {
  return b.analysis.consensus.riskScore - a.analysis.consensus.riskScore || a.id.localeCompare(b.id, 'ro', { numeric: true });
}

/** Deschise întâi, cele mai apropiate termene primele; la egalitate, riscul mai mare. */
export function byDeadline(a: BillLite, b: BillLite) {
  const ac = a.daysRemaining < 0;
  const bc = b.daysRemaining < 0;
  if (ac !== bc) return ac ? 1 : -1;
  if (ac) return b.daysRemaining - a.daysRemaining || byRiskDesc(a, b);
  return a.daysRemaining - b.daysRemaining || byRiskDesc(a, b);
}

export function byNewest(a: BillLite, b: BillLite) {
  return b.id.localeCompare(a.id, 'ro', { numeric: true });
}

/**
 * Câte articole au fost publicate în ultima săptămână: azi și cele 6 zile dinainte, ora României.
 * Contează data publicării, nu ziua în care le-am găsit noi: un articol vechi găsit azi nu e o noutate.
 */
export const PRESS_RECENT_DAYS = 7;
export function recentPress(dates: string[], today = todayISO()) {
  const since = addDays(today, 1 - PRESS_RECENT_DAYS);
  return dates.filter((d) => d >= since && d <= today).length;
}

export function modelScore(b: BillLite, key: ModelKey) {
  return b.analysis.council?.[key]?.riskScore ?? b.analysis.consensus.riskScore;
}

export type Agreement = { spread: number; label: string; tone: 'strong' | 'partial' | 'split' };

export function agreement(b: BillLite): Agreement {
  const scores = MODELS.map((m) => modelScore(b, m.key));
  const spread = Math.max(...scores) - Math.min(...scores);
  if (spread <= 1.5) return { spread, label: 'Modelele sunt de acord', tone: 'strong' };
  if (spread <= 3) return { spread, label: 'Acord parțial', tone: 'partial' };
  return { spread, label: 'Modelele nu sunt de acord', tone: 'split' };
}

export function camps(parties: string[]) {
  const power = parties.some((p) => PUTERE.has(p));
  const opposition = parties.some((p) => OPOZITIE.has(p));
  return { power, opposition, bridge: power && opposition };
}

export function isBridgePair(a: string, b: string) {
  return (PUTERE.has(a) && OPOZITIE.has(b)) || (OPOZITIE.has(a) && PUTERE.has(b));
}

export interface PartyStat {
  party: string;
  fullName: string;
  billsCount: number;
  redCount: number;
  yellowCount: number;
  greenCount: number;
  emergencyCount: number;
  crossPartyCount: number;
  totalSignatures: number;
  avgRiskScore: number;
  topBill: { id: string; slug: string; plainTitle: string; riskScore: number } | null;
}

export interface MpStat {
  slug: string;
  name: string;
  party: string;
  role: string;
  billsCount: number;
  redCount: number;
  yellowCount: number;
  greenCount: number;
  avgRiskScore: number;
  billIds: string[];
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : 0);
const levelCount = (bills: Signed[], level: RiskLevel) => bills.filter((b) => b.analysis.consensus.riskLevel === level).length;

/**
 * Cheia și slug-ul unui parlamentar: numele fără diacritice, cratime și majuscule. Așa „Federovici Doina Elena” de pe
 * fișa Camerei și „Federovici Doina-Elena” de la Senat sunt aceeași persoană, cu aceeași pagină.
 */
export const mpKey = (name: string) => slugify(name) || 'parlamentar';

/** Numele exact, așa cum apare într-un proiect → slug-ul paginii parlamentarului. */
export function mpSlugs(bills: Signed[]) {
  const seen = new Map<string, string>();
  for (const b of bills) for (const i of b.initiators) seen.set(i.name.trim(), mpKey(i.name));
  return seen;
}

/**
 * Statisticile fiecărui parlamentar din proiectele primite: cele de la Senat și, pe paginile parlamentarilor, și cele
 * analizate la Cameră. Numele, partidul și camera vin din primul proiect care le are, deci Senatul (dat primul) are
 * întâietate, apoi proiectele Camerei de la cel mai nou.
 */
export function computeMpStats(bills: Signed[]): MpStat[] {
  const mpMap = new Map<string, { name: string; party: string; role: string; bills: Signed[] }>();
  for (const bill of bills) {
    for (const init of bill.initiators) {
      const key = mpKey(init.name);
      if (!mpMap.has(key)) mpMap.set(key, { name: init.name.trim(), party: '', role: '', bills: [] });
      const mp = mpMap.get(key)!;
      mp.party ||= init.party;
      mp.role ||= init.role;
      if (!mp.bills.some((b) => b.id === bill.id)) mp.bills.push(bill);
    }
  }
  const mpStats: MpStat[] = [...mpMap.entries()].map(([slug, mp]) => ({
    slug,
    name: mp.name,
    party: mp.party || 'Neafiliați',
    role: mp.role,
    billsCount: mp.bills.length,
    redCount: levelCount(mp.bills, 'red'),
    yellowCount: levelCount(mp.bills, 'yellow'),
    greenCount: levelCount(mp.bills, 'green'),
    avgRiskScore: avg(mp.bills.map((b) => b.analysis.consensus.riskScore)),
    billIds: [...mp.bills].sort(byRiskDesc).map((b) => b.id),
  }));
  return mpStats.sort((a, b) => b.redCount - a.redCount || b.billsCount - a.billsCount || a.name.localeCompare(b.name, 'ro'));
}

export function computeStats(bills: BillLite[]) {
  const partyBills = new Map<string, BillLite[]>();
  const partySignatures = new Map<string, number>();

  for (const bill of bills) {
    for (const p of new Set(bill.parties)) {
      if (!partyBills.has(p)) partyBills.set(p, []);
      partyBills.get(p)!.push(bill);
    }
    for (const init of bill.initiators) {
      const party = init.party || 'Neafiliați';
      partySignatures.set(party, (partySignatures.get(party) ?? 0) + 1);
    }
  }

  const partyStats: PartyStat[] = [...partyBills.entries()].map(([party, list]) => {
    const top = [...list].sort(byRiskDesc)[0];
    return {
      party,
      fullName: partyFullName(party),
      billsCount: list.length,
      redCount: levelCount(list, 'red'),
      yellowCount: levelCount(list, 'yellow'),
      greenCount: levelCount(list, 'green'),
      emergencyCount: list.filter((b) => b.emergencyRequested).length,
      crossPartyCount: list.filter((b) => b.isCrossParty).length,
      totalSignatures: partySignatures.get(party) ?? 0,
      avgRiskScore: avg(list.map((b) => b.analysis.consensus.riskScore)),
      topBill: top
        ? { id: top.id, slug: top.slug, plainTitle: top.analysis.consensus.plainTitle, riskScore: top.analysis.consensus.riskScore }
        : null,
    };
  });
  partyStats.sort((a, b) => b.avgRiskScore - a.avgRiskScore || b.billsCount - a.billsCount);

  return {
    partyStats,
    mpStats: computeMpStats(bills),
    crossPartyBills: bills.filter((b) => b.isCrossParty).sort(byRiskDesc),
    // Întâi cele încă în consultare: acolo avizul CES mai poate susține o obiecție.
    cesNegativeBills: bills.filter((b) => b.cesNegative).sort((a, b) => Number(a.daysRemaining < 0) - Number(b.daysRemaining < 0) || byRiskDesc(a, b)),
  };
}

export type Stats = ReturnType<typeof computeStats>;

export function riskCounts(bills: BillLite[]) {
  const c = { red: 0, yellow: 0, green: 0, open: 0, closingSoon: 0, emergency: 0, bridge: 0, split: 0, opinions: 0, pressRecent: 0 };
  for (const b of bills) {
    c[b.analysis.consensus.riskLevel] += 1;
    if (b.daysRemaining >= 0) c.open += 1;
    if (b.daysRemaining >= 0 && b.daysRemaining <= 7) c.closingSoon += 1;
    if (b.emergencyRequested) c.emergency += 1;
    if (camps(b.parties).bridge) c.bridge += 1;
    if (agreement(b).tone === 'split') c.split += 1;
    c.opinions += b.opinionsCount || 0;
    if (b.press.recent > 0) c.pressRecent += 1;
  }
  return c;
}

export type RiskCounts = ReturnType<typeof riskCounts>;
