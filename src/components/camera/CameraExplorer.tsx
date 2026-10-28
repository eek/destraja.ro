'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, ExternalLink, Search, X } from 'lucide-react';
import type { CdepListItem } from '@/lib/cdep';
import { dayDiff, shortCommittee, shortDate, stageLabel, type StageKey } from '@/lib/cdep-text';
import { countWord, initialRows, normalize, todayISO } from '@/lib/format';
import { trackAttrs } from '@/lib/analytics';
import { EmptyState, RiskChip, btnSecondary, inputCls, segCls } from '@/components/ui';

type Filter = 'acum' | 'comisii' | 'raport' | 'plen' | 'toate';
const FILTERS: { key: Filter; label: string; stages: StageKey[] | null }[] = [
  { key: 'acum', label: 'La Cameră acum', stages: ['comisii', 'raport', 'plen', 'altele'] },
  { key: 'comisii', label: 'La comisii', stages: ['comisii'] },
  { key: 'raport', label: 'Cu raport', stages: ['raport'] },
  { key: 'plen', label: 'Pe ordinea de zi', stages: ['plen'] },
  { key: 'toate', label: 'Toate din an', stages: null },
];
const PAGE = 40;

const hrefOf = (p: CdepListItem) => (p.senat ? `/legi/${p.senat}` : `/camera/${p.slug}`);

export default function CameraExplorer({ items, pages, builtOn }: { items: CdepListItem[]; pages: string[]; builtOn: string }) {
  const [today, setToday] = useState(builtOn);
  useEffect(() => setToday(todayISO()), []);
  const withPage = useMemo(() => new Set(pages), [pages]);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('acum');
  const [openOnly, setOpenOnly] = useState(false);
  const [sort, setSort] = useState<'noi' | 'termen'>('noi');
  const [visible, setVisible] = useState(PAGE);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, f.stages ? items.filter((p) => f.stages!.includes(p.stage)).length : items.length])) as Record<Filter, number>,
    [items],
  );

  const list = useMemo(() => {
    const stages = FILTERS.find((f) => f.key === filter)!.stages;
    const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
    const deadline = (p: CdepListItem) => (p.termenAmendamente && p.termenAmendamente >= today ? p.termenAmendamente : '9999');
    return items
      .filter((p) => !stages || stages.includes(p.stage))
      .filter((p) => !openOnly || (p.termenAmendamente !== null && p.termenAmendamente >= today))
      .filter((p) => {
        const text = normalize(`${p.numar} ${p.titlu} ${p.risk?.plainTitle ?? ''} ${p.raport.join(' ')}`);
        return terms.every((t) => text.includes(t));
      })
      .sort((a, b) => (sort === 'termen' ? deadline(a).localeCompare(deadline(b)) : 0) || b.inregistrat.localeCompare(a.inregistrat) || b.idp - a.idp);
  }, [items, filter, openOnly, query, sort, today]);

  const set = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setVisible(PAGE);
  };
  const shown = initialRows(list.length, visible);
  const hasFilters = query.trim() !== '' || openOnly || filter !== 'acum';

  return (
    <div>
      <div className="space-y-3 border-b border-line pb-5">
        <label className="relative block">
          <span className="sr-only">Caută un proiect după număr, titlu sau comisie</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => set(setQuery)(e.target.value)}
            placeholder="Număr, cuvânt din titlu sau comisie"
            className={`${inputCls} pl-11 pr-4`}
            autoComplete="off"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Stadiul la Cameră" className="-mx-4 flex max-w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:max-w-full sm:flex-wrap sm:px-0">
            {FILTERS.map((f) => {
              const on = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set(setFilter)(f.key)}
                  {...trackAttrs('camera_filter', { filter: 'stage', value: f.key })}
                  className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition-colors ${
                    on ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface text-body hover:border-line-strong hover:text-ink'
                  }`}
                >
                  {f.label}
                  <span className="font-normal tabular-nums opacity-75">{counts[f.key]}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            aria-pressed={openOnly}
            onClick={() => set(setOpenOnly)(!openOnly)}
            {...trackAttrs('camera_filter', { filter: 'open_deadline', value: openOnly ? 'off' : 'on' })}
            className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition-colors ${
              openOnly ? 'border-ink bg-ink text-paper' : 'border-dashed border-line-strong bg-surface text-body hover:text-ink'
            }`}
          >
            Termen de amendamente deschis
          </button>
        </div>
      </div>

      <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 py-3">
        <p role="status" aria-live="polite" className="text-sm text-muted">
          <strong className="font-semibold text-ink">{countWord(list.length, 'proiect', 'proiecte')}</strong>
          {hasFilters ? ' corespund căutării' : ' aflate acum la Cameră'}
        </p>
        <div className="flex max-w-full items-center gap-2 text-sm text-muted">
          <span className="hidden sm:inline">Ordine:</span>
          <div role="group" aria-label="Ordonează" className="flex rounded-lg bg-sunken p-1">
            <button type="button" aria-pressed={sort === 'noi'} onClick={() => setSort('noi')} className={segCls(sort === 'noi')}>
              Cele mai noi
            </button>
            <button type="button" aria-pressed={sort === 'termen'} onClick={() => setSort('termen')} className={segCls(sort === 'termen')}>
              Termen apropiat
            </button>
          </div>
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState
          title="Niciun proiect nu corespunde"
          text="Încearcă un singur cuvânt din titlu, numărul fără „PL-x” sau toate proiectele din an."
          action={
            hasFilters ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setOpenOnly(false);
                  setFilter('acum');
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
            {list.slice(0, shown).map((p) => {
              const ours = Boolean(p.senat) || withPage.has(p.slug);
              const days = p.termenAmendamente ? dayDiff(p.termenAmendamente, today) : null;
              const body = (
                <>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <span className="font-semibold tabular-nums text-ink">{p.numar}</span>
                      <span className={`rounded-md px-1.5 py-0.5 font-semibold ${p.stage === 'plen' ? 'bg-brand text-on-brand' : 'bg-sunken text-body'}`}>
                        {stageLabel(p.stage)}
                      </span>
                      {p.risk && <RiskChip level={p.risk.level} score={p.risk.score} />}
                      {p.senat && <span className="text-muted">urmărit de la Senat</span>}
                    </span>
                    <span className="mt-1.5 block text-[15px] font-semibold leading-6 text-ink group-hover:underline group-hover:underline-offset-4">
                      {p.risk?.plainTitle ?? p.titlu}
                    </span>
                    {p.risk && <span className="mt-0.5 line-clamp-1 block text-xs leading-5 text-muted">{p.titlu}</span>}
                    <span className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs leading-5 text-muted">
                      <span>Înregistrat pe {shortDate(p.inregistrat)}</span>
                      {p.raport.length > 0 && <span>Raport: {p.raport.map(shortCommittee).join(', ')}</span>}
                      {p.stage === 'comisii' && days !== null && (
                        <span className={days >= 0 && days <= 3 ? 'font-semibold text-risk-red-text' : days >= 0 ? 'font-semibold text-ink' : ''}>
                          {days >= 0 ? `Amendamente până pe ${shortDate(p.termenAmendamente!)}` : `Termenul de amendamente a trecut (${shortDate(p.termenAmendamente!)})`}
                        </span>
                      )}
                    </span>
                  </span>
                  {ours ? (
                    <ChevronRight className="hidden h-5 w-5 text-muted transition-transform group-hover:translate-x-0.5 sm:block" aria-hidden />
                  ) : (
                    <ExternalLink className="hidden h-4 w-4 text-muted sm:block" aria-hidden />
                  )}
                </>
              );
              const cls = 'group grid gap-3 px-4 py-4 transition-colors hover:bg-sunken/50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6 sm:px-6';
              return (
                <li key={p.slug}>
                  {ours ? (
                    <Link href={hrefOf(p)} className={cls}>
                      {body}
                    </Link>
                  ) : (
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className={cls}>
                      {body}
                      <span className="sr-only">(fișa de pe cdep.ro, se deschide într-o filă nouă)</span>
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-sm tabular-nums text-muted">
              Afișate {shown} din {list.length}
            </p>
            {shown < list.length && (
              <button type="button" onClick={() => setVisible((v) => v + PAGE)} className={`${btnSecondary} min-h-12 px-5 text-sm`}>
                Arată încă {initialRows(list.length, visible + PAGE) - shown}
                <ChevronDown className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
