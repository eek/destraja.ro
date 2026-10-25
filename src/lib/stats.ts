import type { BillLite, RiskLevel } from './types';
import { MODELS, OPOZITIE, PUTERE, partyFullName, type ModelKey } from './site';
import { slugify } from './format';

export function oneLiner(b: BillLite) {
  return b.analysis.consensus.citizenOneLiner || b.analysis.consensus.summaryTlDr;
}

export function byRiskDesc(a: BillLite, b: BillLite) {
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
const levelCount = (bills: BillLite[], level: RiskLevel) => bills.filter((b) => b.analysis.consensus.riskLevel === level).length;

/** Slug stabil per parlamentar; la nume identice se adaugă partidul. */
export function mpSlugs(bills: BillLite[]) {
  const byName = new Map<string, Set<string>>();
  for (const b of bills) for (const i of b.initiators) {
    const name = i.name.trim();
    if (!byName.has(name)) byName.set(name, new Set());
    byName.get(name)!.add(slugify(name));
  }
  const seen = new Map<string, string>();
  const taken = new Set<string>();
  for (const name of [...byName.keys()].sort((a, b) => a.localeCompare(b, 'ro'))) {
    let slug = slugify(name) || 'parlamentar';
    let n = 2;
    while (taken.has(slug)) slug = `${slugify(name)}-${n++}`;
    taken.add(slug);
    seen.set(name, slug);
  }
  return seen;
}

export function computeStats(bills: BillLite[]) {
  const partyBills = new Map<string, BillLite[]>();
  const partySignatures = new Map<string, number>();
  const mpMap = new Map<string, { name: string; party: string; role: string; bills: BillLite[] }>();

  for (const bill of bills) {
    for (const p of new Set(bill.parties)) {
      if (!partyBills.has(p)) partyBills.set(p, []);
      partyBills.get(p)!.push(bill);
    }
    for (const init of bill.initiators) {
      const party = init.party || 'Neafiliați';
      partySignatures.set(party, (partySignatures.get(party) ?? 0) + 1);
      const name = init.name.trim();
      if (!mpMap.has(name)) mpMap.set(name, { name, party, role: init.role, bills: [] });
      const mp = mpMap.get(name)!;
      if (!mp.bills.some((b) => b.id === bill.id)) mp.bills.push(bill);
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

  const slugs = mpSlugs(bills);
  const mpStats: MpStat[] = [...mpMap.values()].map((mp) => ({
    slug: slugs.get(mp.name)!,
    name: mp.name,
    party: mp.party,
    role: mp.role,
    billsCount: mp.bills.length,
    redCount: levelCount(mp.bills, 'red'),
    yellowCount: levelCount(mp.bills, 'yellow'),
    greenCount: levelCount(mp.bills, 'green'),
    avgRiskScore: avg(mp.bills.map((b) => b.analysis.consensus.riskScore)),
    billIds: [...mp.bills].sort(byRiskDesc).map((b) => b.id),
  }));
  mpStats.sort((a, b) => b.redCount - a.redCount || b.billsCount - a.billsCount || a.name.localeCompare(b.name, 'ro'));

  return {
    partyStats,
    mpStats,
    crossPartyBills: bills.filter((b) => b.isCrossParty).sort(byRiskDesc),
    cesNegativeBills: bills.filter((b) => b.cesNegative).sort(byRiskDesc),
  };
}

export type Stats = ReturnType<typeof computeStats>;

export function riskCounts(bills: BillLite[]) {
  const c = { red: 0, yellow: 0, green: 0, open: 0, closingSoon: 0, emergency: 0, bridge: 0, split: 0, opinions: 0 };
  for (const b of bills) {
    c[b.analysis.consensus.riskLevel] += 1;
    if (b.daysRemaining >= 0) c.open += 1;
    if (b.daysRemaining >= 0 && b.daysRemaining <= 7) c.closingSoon += 1;
    if (b.emergencyRequested) c.emergency += 1;
    if (camps(b.parties).bridge) c.bridge += 1;
    if (agreement(b).tone === 'split') c.split += 1;
    c.opinions += b.opinionsCount || 0;
  }
  return c;
}

export type RiskCounts = ReturnType<typeof riskCounts>;
