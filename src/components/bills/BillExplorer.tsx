'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Clock, Newspaper, Search, Users, Wrench, X } from 'lucide-react';
import type { BillLite, RiskLevel } from '@/lib/types';
import { countWord, initialRows, normalize } from '@/lib/format';
import { byDeadline, byNewest, byRiskDesc, oneLiner, type RiskCounts } from '@/lib/stats';
import { EmptyState, btnPrimary, btnSecondary, inputCls } from '@/components/ui';
import BillCard from './BillCard';
import RiskFilter, { chipCls } from './RiskFilter';
import { track, trackAttrs } from '@/lib/analytics';

type SortKey = 'risc' | 'termen' | 'noi';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'risc', label: 'Riscul cel mai mare' },
  { key: 'termen', label: 'Termenul cel mai apropiat' },
  { key: 'noi', label: 'Cele mai noi proiecte' },
];
const PAGE = 9;

export default function BillExplorer({
  bills,
  counts,
  parties,
  onPartiesChange,
  initialRisk = 'all',
  initialSoon = false,
}: {
  bills: BillLite[];
  counts: RiskCounts;
  parties: string[];
  onPartiesChange: (parties: string[]) => void;
  initialRisk?: RiskLevel | 'all';
  initialSoon?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [risk, setRisk] = useState<RiskLevel | 'all'>(initialRisk);
  const [group, setGroup] = useState('all');
  const [soonOnly, setSoonOnly] = useState(initialSoon);
  const [pressOnly, setPressOnly] = useState(false);
  // Doar proiectele la care o schimbare punctuală ar face legea acceptabilă (scripts/straja-balance.mjs).
  const [fixOnly, setFixOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('risc');
  const [visible, setVisible] = useState(PAGE);

  const haystack = useMemo(
    () =>
      new Map(
        bills.map((b) => [
          b.id,
          normalize(
            [b.id, b.cod, b.analysis.consensus.plainTitle, b.officialTitle, oneLiner(b), b.parties.join(' '), b.initiators.map((i) => i.name).join(' '), b.analysis.consensus.affectedGroups.join(' ')].join(' '),
          ),
        ]),
      ),
    [bills],
  );

  const groups = useMemo(() => {
    const n = new Map<string, number>();
    bills.forEach((b) => b.analysis.consensus.affectedGroups.forEach((g) => n.set(g, (n.get(g) ?? 0) + 1)));
    return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ro'));
  }, [bills]);

  const filtered = useMemo(() => {
    const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
    const list = bills.filter((b) => {
      if (risk !== 'all' && b.analysis.consensus.riskLevel !== risk) return false;
      if (group !== 'all' && !b.analysis.consensus.affectedGroups.includes(group)) return false;
      if (soonOnly && !(b.daysRemaining >= 0 && b.daysRemaining <= 7)) return false;
      if (pressOnly && b.press.recent === 0) return false;
      if (fixOnly && !b.balance?.fix) return false;
      if (parties.length && !parties.every((p) => b.parties.includes(p))) return false;
      const text = haystack.get(b.id) ?? '';
      return terms.every((t) => text.includes(t));
    });
    return list.sort(sort === 'termen' ? byDeadline : sort === 'noi' ? byNewest : byRiskDesc);
  }, [bills, haystack, query, risk, group, soonOnly, pressOnly, fixOnly, parties, sort]);
  const fixable = useMemo(() => bills.filter((b) => b.balance?.fix).length, [bills]);

  const shown = initialRows(filtered.length, visible);
  const hasFilters = query.trim() !== '' || risk !== 'all' || group !== 'all' || soonOnly || pressOnly || fixOnly || parties.length > 0;
  const reset = () => {
    setQuery('');
    setRisk('all');
    setGroup('all');
    setSoonOnly(false);
    setPressOnly(false);
    setFixOnly(false);
    onPartiesChange([]);
    setVisible(PAGE);
  };
  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setVisible(PAGE);
  };


  return (
    <div>
      <div className="mt-8 space-y-3 border-b border-line pb-5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,320px)]">
          <label className="relative block">
            <span className="sr-only">Caută după subiect, număr de proiect sau inițiator</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => touch(setQuery)(e.target.value)}
              placeholder="Caută: avocați, impozit, pensii, B563…"
              className={`${inputCls} pl-11 pr-4`}
            />
          </label>
          <label className="relative block">
            <span className="sr-only">Pe cine afectează</span>
            <Users className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" aria-hidden />
            <select
              value={group}
              onChange={(e) => {
                touch(setGroup)(e.target.value);
                track('bill_filter', { filter: 'affected_group', value: e.target.value });
              }}
              className={`${inputCls} appearance-none pl-11 pr-10`}>
              <option value="all">Pe cine afectează? Toate categoriile</option>
              {groups.map(([g, n]) => (
                <option key={g} value={g}>
                  {g} ({n})
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          </label>
        </div>

        <RiskFilter
          counts={counts}
          value={risk === 'all' ? null : risk}
          onChange={(l) => {
            touch(setRisk)(l ?? 'all');
            track('bill_filter', { filter: 'risk', value: l ?? 'all' });
          }}
        />

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {counts.closingSoon > 0 && (
              <button
                type="button"
                aria-pressed={soonOnly}
                onClick={() => touch(setSoonOnly)(!soonOnly)}
                {...trackAttrs('bill_filter', { filter: 'closing_soon', value: soonOnly ? 'off' : 'on' })}
                className={chipCls(soonOnly)}
              >
                <Clock className="h-4 w-4" aria-hidden />
                Se închid în 7 zile
                <span className="font-normal tabular-nums opacity-80">{counts.closingSoon}</span>
              </button>
            )}
            {counts.pressRecent > 0 && (
              <button
                type="button"
                aria-pressed={pressOnly}
                onClick={() => touch(setPressOnly)(!pressOnly)}
                {...trackAttrs('bill_filter', { filter: 'press_recent', value: pressOnly ? 'off' : 'on' })}
                title="Proiecte despre care a apărut cel puțin un articol în ultimele 7 zile"
                className={chipCls(pressOnly)}
              >
                <Newspaper className="h-4 w-4" aria-hidden />
                În presă în ultima săptămână
                <span className="font-normal tabular-nums opacity-80">{counts.pressRecent}</span>
              </button>
            )}
            {fixable > 0 && (
              <button
                type="button"
                aria-pressed={fixOnly}
                onClick={() => touch(setFixOnly)(!fixOnly)}
                {...trackAttrs('bill_filter', { filter: 'fixable', value: fixOnly ? 'off' : 'on' })}
                title="Proiecte la care o schimbare punctuală ar face legea acceptabilă"
                className={chipCls(fixOnly)}
              >
                <Wrench className="h-4 w-4" aria-hidden />
                Se pot repara
                <span className="font-normal tabular-nums opacity-80">{fixable}</span>
              </button>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-muted">
            Ordine:
            <span className="relative">
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as SortKey);
                  track('bill_filter', { filter: 'sort', value: e.target.value });
                }}
                className="h-10 appearance-none rounded-lg border border-line bg-surface pl-3 pr-9 text-sm font-semibold text-ink focus:border-brand focus:outline-none"
              >
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            </span>
          </label>
        </div>
      </div>

      <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 py-3">
        <p role="status" aria-live="polite" className="text-sm text-muted">
          <strong className="font-semibold text-ink">{countWord(filtered.length, 'proiect', 'proiecte')}</strong>
          {hasFilters ? ' corespund alegerilor tale' : ' urmărite'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {parties.length > 0 && (
            <button
              type="button"
              onClick={() => onPartiesChange([])}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-brand-soft px-3 text-xs font-semibold text-ink"
            >
              Inițiatori: {parties.join(' + ')}
              <X className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">Elimină filtrul de partid</span>
            </button>
          )}
          {hasFilters && (
            <button type="button" onClick={reset} {...trackAttrs('bill_filter', { filter: 'reset' })} className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-link underline underline-offset-4">
              Șterge filtrele
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Niciun proiect nu se potrivește"
          text="Încearcă un cuvânt mai general sau renunță la unul dintre filtre."
          action={
            <button type="button" onClick={reset} {...trackAttrs('bill_filter', { filter: 'reset' })} className={`${btnPrimary} min-h-11 px-5 text-sm`}>
              Arată toate proiectele
            </button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.slice(0, shown).map((b) => (
              <BillCard key={b.id} bill={b} onParty={(p) => onPartiesChange([p])} />
            ))}
          </div>
          <div className="mt-8 flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-sm tabular-nums text-muted">
              Afișate {shown} din {filtered.length}
            </p>
            {shown < filtered.length && (
              <button type="button" onClick={() => setVisible((v) => v + PAGE)} className={`${btnSecondary} min-h-12 px-5 text-sm`}>
                Arată încă {initialRows(filtered.length, visible + PAGE) - shown} proiecte
                <ChevronDown className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
