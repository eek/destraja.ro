'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import type { BillLite } from '@/lib/types';
import { PARTY_ORDER, partyFullName } from '@/lib/site';
import { RISK, levelFromScore } from '@/lib/risk';
import { countWord, fmt, normalize } from '@/lib/format';
import { computeStats, type MpStat } from '@/lib/stats';
import { EmptyState, PartyTag, RiskDot, btnSecondary, inputCls, segCls } from '@/components/ui';
import { trackAttrs } from '@/lib/analytics';

type SortKey = 'ridicat' | 'proiecte' | 'medie' | 'nume';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'ridicat', label: 'Risc ridicat' },
  { key: 'proiecte', label: 'Nr. proiecte' },
  { key: 'medie', label: 'Scor mediu' },
  { key: 'nume', label: 'Nume' },
];
const PAGE = 40;

const roleLabel = (role: string) => (role === 'senator' ? 'Senator' : role === 'deputat' ? 'Deputat' : role);

export default function MpDirectory({ bills }: { bills: BillLite[] }) {
  const { mpStats } = useMemo(() => computeStats(bills), [bills]);
  const levelById = useMemo(() => new Map(bills.map((b) => [b.id, b.analysis.consensus.riskLevel])), [bills]);

  const parties = useMemo(() => {
    const n = new Map<string, number>();
    mpStats.forEach((m) => n.set(m.party, (n.get(m.party) ?? 0) + 1));
    const known = PARTY_ORDER.filter((p) => n.has(p));
    return [...known, ...[...n.keys()].filter((p) => !known.includes(p)).sort()].map((p) => ({ party: p, count: n.get(p)! }));
  }, [mpStats]);

  const [query, setQuery] = useState('');
  const [party, setParty] = useState('all');
  const [role, setRole] = useState<'all' | 'senator' | 'deputat'>('all');
  const [sort, setSort] = useState<SortKey>('ridicat');
  const [visible, setVisible] = useState(PAGE);

  const list = useMemo(() => {
    const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
    const val = (m: MpStat) => (sort === 'ridicat' ? m.redCount : sort === 'proiecte' ? m.billsCount : m.avgRiskScore);
    return mpStats
      .filter((m) => (party === 'all' || m.party === party) && (role === 'all' || m.role === role))
      .filter((m) => {
        const text = normalize(m.name);
        return terms.every((t) => text.includes(t));
      })
      .sort((a, b) =>
        sort === 'nume'
          ? a.name.localeCompare(b.name, 'ro')
          : val(b) - val(a) || b.redCount - a.redCount || b.billsCount - a.billsCount || a.name.localeCompare(b.name, 'ro'),
      );
  }, [mpStats, query, party, role, sort]);

  const set = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setVisible(PAGE);
  };
  const hasFilters = query.trim() !== '' || party !== 'all' || role !== 'all';

  return (
    <div>
      <div className="space-y-3 border-b border-line pb-5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <label className="relative block">
            <span className="sr-only">Caută un parlamentar după nume</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => set(setQuery)(e.target.value)}
              placeholder="Numele senatorului sau deputatului"
              className={`${inputCls} pl-11 pr-4`}
              autoComplete="off"
            />
          </label>
          <div role="group" aria-label="Camera" className="flex rounded-lg bg-sunken p-1">
            {(['all', 'senator', 'deputat'] as const).map((r) => (
              <button key={r} type="button" aria-pressed={role === r} onClick={() => set(setRole)(r)} {...trackAttrs('mp_filter', { filter: 'chamber', value: r })} className={`${segCls(role === r)} flex-1 justify-center px-4 text-sm`}>
                {r === 'all' ? 'Toți' : r === 'senator' ? 'Senatori' : 'Deputați'}
              </button>
            ))}
          </div>
        </div>

        <div role="group" aria-label="Partid" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0">
          {[{ party: 'all', count: mpStats.length }, ...parties].map((p) => {
            const on = party === p.party;
            return (
              <button
                key={p.party}
                type="button"
                aria-pressed={on}
                onClick={() => set(setParty)(p.party)}
                {...trackAttrs('mp_filter', { filter: 'party', value: p.party })}
                title={p.party === 'all' ? undefined : partyFullName(p.party)}
                className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition-colors ${
                  on ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface text-body hover:border-line-strong hover:text-ink'
                }`}
              >
                {p.party === 'all' ? 'Toate partidele' : p.party}
                <span className="font-normal tabular-nums opacity-75">{p.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 py-3">
        <p role="status" aria-live="polite" className="text-sm text-muted">
          <strong className="font-semibold text-ink">{countWord(list.length, 'parlamentar', 'parlamentari')}</strong>
          {hasFilters ? ' corespund căutării' : ' au semnat proiectele urmărite'}
        </p>
        <div className="flex max-w-full items-center gap-2 text-sm text-muted">
          <span className="hidden sm:inline">Ordine:</span>
          <div role="group" aria-label="Ordonează" className="flex max-w-full overflow-x-auto rounded-lg bg-sunken p-1 no-scrollbar">
            {SORTS.map((s) => (
              <button key={s.key} type="button" aria-pressed={sort === s.key} onClick={() => setSort(s.key)} {...trackAttrs('mp_filter', { filter: 'sort', value: s.key })} className={segCls(sort === s.key)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState
          title="Nu am găsit acest parlamentar"
          text="Încearcă doar o parte din nume, fără diacritice, sau caută în toate partidele. Lista cuprinde doar inițiatorii proiectelor aflate în consultare."
          action={
            hasFilters ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setParty('all');
                  setRole('all');
                }}
                className={`${btnSecondary} min-h-11 px-5 text-sm`}
              >
                <X className="h-4 w-4" aria-hidden />
                Șterge filtrele
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {list.slice(0, visible).map((m) => (
              <li key={m.slug}>
                <Link href={`/parlamentari/${m.slug}`} className="group grid gap-3 px-4 py-4 transition-colors hover:bg-sunken/50 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-6 sm:px-6">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink group-hover:underline group-hover:underline-offset-4">{m.name}</span>
                      <PartyTag party={m.party} />
                      <span className="text-xs text-muted">{roleLabel(m.role)}</span>
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-1" aria-label={`${m.redCount} cu risc ridicat, ${m.yellowCount} moderat, ${m.greenCount} redus`}>
                      {m.billIds.slice(0, 14).map((id) => (
                        <RiskDot key={id} level={levelById.get(id) ?? 'green'} className="h-2.5 w-2.5" />
                      ))}
                      {m.billIds.length > 14 && <span className="ml-1 text-[11px] text-muted">+{m.billIds.length - 14}</span>}
                    </span>
                  </span>
                  <dl className="flex gap-6 text-right sm:gap-8">
                    <div>
                      <dt className="text-[11px] text-muted">proiecte</dt>
                      <dd className="text-base font-semibold tabular-nums text-ink">{m.billsCount}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-muted">risc ridicat</dt>
                      <dd className={`text-base font-semibold tabular-nums ${m.redCount ? 'text-risk-red-text' : 'text-ink'}`}>{m.redCount}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-muted">scor mediu</dt>
                      <dd className={`text-base font-semibold tabular-nums ${RISK[levelFromScore(m.avgRiskScore)].text}`}>{fmt(m.avgRiskScore)}</dd>
                    </div>
                  </dl>
                  <ChevronRight className="hidden h-5 w-5 text-muted transition-transform group-hover:translate-x-0.5 sm:block" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-sm tabular-nums text-muted">
              Afișați {Math.min(visible, list.length)} din {list.length}
            </p>
            {visible < list.length && (
              <button type="button" onClick={() => setVisible((v) => v + PAGE)} className={`${btnSecondary} min-h-12 px-5 text-sm`}>
                Arată încă {Math.min(PAGE, list.length - visible)}
                <ChevronDown className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
