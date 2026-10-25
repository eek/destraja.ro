'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, BarChart3, ChevronDown, ChevronRight, Flame, Layers, Scale, ShieldAlert, Sparkles, Users } from 'lucide-react';
import type { BillLite } from '@/lib/types';
import { ARC_DATE, OPOZITIE, PUTERE } from '@/lib/site';
import { RISK, levelFromScore } from '@/lib/risk';
import { countWord, fmt } from '@/lib/format';
import { byRiskDesc, camps, type MpStat, type PartyStat, type RiskCounts, type Stats } from '@/lib/stats';
import { CopyButton, PartyTag, RiskDot, btnPrimary, btnSecondary } from '@/components/ui';
import { trackAttrs } from '@/lib/analytics';

export function PanelTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      {sub && <p className="mt-1 text-sm leading-6 text-muted">{sub}</p>}
    </div>
  );
}

export function buildHeadlines(stats: Stats, counts: RiskCounts) {
  const out: { key: string; icon: typeof ShieldAlert; text: string }[] = [];
  const byRed = [...stats.partyStats].sort((a, b) => b.redCount - a.redCount || b.avgRiskScore - a.avgRiskScore);
  const lead = byRed[0];
  if (lead && lead.redCount > 0) {
    const tied = byRed.filter((p) => p.redCount === lead.redCount);
    out.push({
      key: 'red-party',
      icon: ShieldAlert,
      text:
        tied.length > 1
          ? `${tied.map((p) => p.party).join(', ').replace(/, ([^,]*)$/, ' și $1')} au inițiatori pe câte ${countWord(lead.redCount, 'proiect', 'proiecte')} cu risc ridicat aflate acum la Senat.`
          : `${lead.party} are inițiatori pe ${countWord(lead.redCount, 'proiect', 'proiecte')} cu risc ridicat aflate acum la Senat, mai multe decât orice alt partid.`,
    });
  }
  const pool = stats.partyStats.filter((p) => p.billsCount >= 3);
  const riskiest = [...(pool.length ? pool : stats.partyStats)].sort((a, b) => b.avgRiskScore - a.avgRiskScore)[0];
  if (riskiest) {
    out.push({
      key: 'avg',
      icon: BarChart3,
      text: `Proiectele cu inițiatori din ${riskiest.party} au cel mai mare scor mediu de risc: ${fmt(riskiest.avgRiskScore)} din 10, pe ${countWord(riskiest.billsCount, 'proiect', 'proiecte')}.`,
    });
  }
  if (counts.bridge > 0) {
    out.push({ key: 'bridge', icon: Layers, text: `${countWord(counts.bridge, 'proiect poartă', 'proiecte poartă')} semnături atât de la putere, cât și de la opoziție.` });
  }
  const ces = stats.cesNegativeBills.length;
  if (ces > 0) {
    out.push({
      key: 'ces',
      icon: AlertTriangle,
      text: `${countWord(ces, 'proiect aflat', 'proiecte aflate')} în consultare ${ces === 1 ? 'are' : 'au'} aviz negativ de la Consiliul Economic și Social.`,
    });
  }
  const mp = [...stats.mpStats].sort((a, b) => b.redCount - a.redCount || b.billsCount - a.billsCount)[0];
  if (mp && mp.redCount > 0) {
    out.push({
      key: 'mp',
      icon: Users,
      text: `${mp.name} (${mp.party}) a semnat ${countWord(mp.redCount, 'proiect', 'proiecte')} cu risc ridicat din ${countWord(mp.billsCount, 'inițiativă', 'inițiative')} aflate în consultare.`,
    });
  }
  if (counts.split > 0) {
    out.push({
      key: 'split',
      icon: Sparkles,
      text: `La ${countWord(counts.split, 'proiect', 'proiecte')}, Gemini, Claude și ChatGPT nu cad de acord asupra riscului; merită verificate de un jurist.`,
    });
  }
  if (counts.emergency > 0) {
    out.push({
      key: 'urgent',
      icon: Flame,
      text: `Pentru ${countWord(counts.emergency, 'proiect', 'proiecte')} s-a cerut procedură de urgență, care scurtează timpul de dezbatere.`,
    });
  }
  return out;
}

export function Headlines({ items, copied, onCopy }: { items: ReturnType<typeof buildHeadlines>; copied: string | null; onCopy: (key: string, text: string) => void }) {
  return (
    <div>
      <PanelTitle title="Titluri gata de verificat" sub="Generate automat din date. Verifică-le în documentele oficiale înainte de publicare." />
      <ul className="mt-3 divide-y divide-line">
        {items.map((h) => (
          <li key={h.key} className="flex items-start gap-4 py-4">
            <h.icon className="mt-1 h-5 w-5 shrink-0 text-link" aria-hidden />
            <p className="font-display flex-1 text-lg leading-snug text-ink">{h.text}</p>
            <CopyButton
              compact
              label="Copiază titlul"
              active={copied === h.key}
              onClick={() => onCopy(h.key, `${h.text} (Sursa: lastraja.ro)`)}
              track={trackAttrs('press_copy', { item: 'headline', headline: h.key })}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PartyDetail({ party, mps, onDossier }: { party?: PartyStat; mps: MpStat[]; onDossier: (parties: string[]) => void }) {
  if (!party) return <p className="text-sm text-muted">Alege un partid din grafic.</p>;
  const topMps = mps
    .filter((m) => m.party === party.party)
    .sort((a, b) => b.redCount - a.redCount || b.billsCount - a.billsCount)
    .slice(0, 5);
  const share = party.billsCount ? Math.round((party.redCount / party.billsCount) * 100) : 0;
  const facts = [
    { label: 'Proiecte', value: String(party.billsCount) },
    { label: 'Risc ridicat', value: String(party.redCount), tone: party.redCount ? 'text-risk-red-text' : '' },
    { label: 'Scor mediu', value: fmt(party.avgRiskScore), tone: RISK[levelFromScore(party.avgRiskScore)].text },
    { label: 'Cu alte partide', value: String(party.crossPartyCount) },
    { label: 'Urgențe cerute', value: String(party.emergencyCount) },
    { label: 'Semnături', value: String(party.totalSignatures) },
  ];
  return (
    <div className="flex h-full flex-col" aria-live="polite">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <PartyTag party={party.party} />
          <h3 className="font-display mt-3 text-2xl leading-tight text-ink">{party.fullName}</h3>
          <p className="mt-1 text-xs text-muted">
            {PUTERE.has(party.party) ? 'Arcul guvernamental' : OPOZITIE.has(party.party) ? 'Opoziție' : 'Fără tabără'} ({ARC_DATE})
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-4xl font-semibold tabular-nums text-ink">{share}%</p>
          <p className="max-w-[8.5rem] text-xs leading-tight text-muted">din proiectele lui au risc ridicat</p>
        </div>
      </div>
      <dl className="mt-6 grid grid-cols-3 gap-x-4 border-y border-line py-4">
        {facts.map((f) => (
          <div key={f.label} className="flex flex-col-reverse py-1.5">
            <dt className="text-[11px] text-muted">{f.label}</dt>
            <dd className={`text-lg font-semibold tabular-nums ${f.tone || 'text-ink'}`}>{f.value}</dd>
          </div>
        ))}
      </dl>
      {party.topBill && (
        <Link href={`/legi/${party.topBill.slug}`} className="group mt-4 block border-b border-line pb-4">
          <p className="text-sm leading-snug text-body">
            Cel mai riscant proiect semnat:{' '}
            <span className="font-semibold text-ink group-hover:underline group-hover:underline-offset-4">{party.topBill.plainTitle}</span>
          </p>
          <p className="mt-1.5 flex items-center gap-2 text-xs text-muted">
            <RiskDot level={levelFromScore(party.topBill.riskScore)} />
            <span className="tabular-nums">{party.topBill.id}</span>· scor {fmt(party.topBill.riskScore)}
          </p>
        </Link>
      )}
      {topMps.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-semibold text-muted">Semnături frecvente</p>
          <ul className="mt-2 space-y-1">
            {topMps.map((m) => (
              <li key={m.slug}>
                <Link href={`/parlamentari/${m.slug}`} className="flex items-center justify-between gap-3 rounded-md py-1 text-sm hover:underline hover:underline-offset-4">
                  <span className="truncate text-ink">{m.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    {countWord(m.billsCount, 'proiect', 'proiecte')} · <span className={m.redCount ? 'text-risk-red-text' : ''}>{m.redCount} cu risc ridicat</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-auto pt-6">
        <button type="button" onClick={() => onDossier([party.party])} className={`${btnPrimary} min-h-11 w-full px-4 text-sm`}>
          Vezi proiectele {party.party} în tabel
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function CrossPartyList({ bills }: { bills: BillLite[] }) {
  const list = useMemo(() => [...bills].sort((a, b) => Number(camps(b.parties).bridge) - Number(camps(a.parties).bridge) || byRiskDesc(a, b)), [bills]);
  const [all, setAll] = useState(false);
  const shown = all ? list : list.slice(0, 5);
  return (
    <div className="flex h-full flex-col">
      <PanelTitle title="Proiecte semnate de mai multe partide" sub={`${countWord(list.length, 'proiect', 'proiecte')}; întâi cele unde semnează împreună puterea și opoziția.`} />
      <ul className="mt-3 divide-y divide-line border-y border-line">
        {shown.map((b) => (
          <li key={b.id}>
            <Link href={`/legi/${b.slug}`} className="group block py-3.5">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <RiskDot level={b.analysis.consensus.riskLevel} />
                <span className="tabular-nums text-muted">{b.id}</span>
                <span className={`font-semibold tabular-nums ${RISK[b.analysis.consensus.riskLevel].text}`}>{fmt(b.analysis.consensus.riskScore)}</span>
                {camps(b.parties).bridge && <span className="font-semibold text-cross">Putere și opoziție</span>}
              </div>
              <p className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug text-ink group-hover:underline group-hover:underline-offset-4">{b.analysis.consensus.plainTitle}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {b.parties.map((p) => (
                  <PartyTag key={p} party={p} />
                ))}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {list.length > 5 && (
        <button type="button" onClick={() => setAll((v) => !v)} className={`${btnSecondary} mt-4 min-h-10 self-start px-4 text-xs`}>
          {all ? 'Arată mai puține' : `Arată toate cele ${countWord(list.length, 'proiect', 'proiecte')}`}
          <ChevronDown className={`h-4 w-4 transition-transform ${all ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      )}
    </div>
  );
}

export function CesList({ bills }: { bills: BillLite[] }) {
  return (
    <div className="flex h-full flex-col">
      <PanelTitle title="Aviz negativ de la CES" sub="Consiliul Economic și Social a dat aviz negativ, dar proiectele merg mai departe la Senat." />
      {bills.length === 0 ? (
        <p className="mt-5 text-sm text-muted">Niciun proiect din consultare nu are aviz negativ CES.</p>
      ) : (
        <ol className="mt-4 space-y-1">
          {bills.map((b) => (
            <li key={b.id}>
              <Link href={`/legi/${b.slug}`} className="group flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-sunken">
                <RiskDot level={b.analysis.consensus.riskLevel} className="mt-1.5 h-2.5 w-2.5" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-snug text-ink">{b.analysis.consensus.plainTitle}</span>
                  <span className="mt-1 block text-xs tabular-nums text-muted">
                    {b.id} · scor {fmt(b.analysis.consensus.riskScore)} · {b.parties.join(', ')}
                  </span>
                </span>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-auto flex items-start gap-2 pt-5 text-xs leading-5 text-muted">
        <Scale className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Avizul CES e consultativ: nu blochează legea, dar arată că partenerii sociali au obiecții.
      </p>
    </div>
  );
}
