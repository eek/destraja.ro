'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, ExternalLink, Search, X } from 'lucide-react';
import type { CdepListItem } from '@/lib/cdep';
import type { RiskLevel } from '@/lib/types';
import { RISK } from '@/lib/risk';
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

// Filtrele stau și în adresă (/camera?risc=ridicat&ordine=risc), ca o listă să poată fi trimisă cuiva.
type Risk = RiskLevel | 'toate';
type Drum = 'mai_riscant' | 'mai_putin_riscant' | 'toate';
type Sort = 'risc' | 'noi' | 'termen';
const RISK_PARAM: Record<RiskLevel, string> = { red: 'ridicat', yellow: 'moderat', green: 'redus' };
const DRUM_PARAM: Record<Exclude<Drum, 'toate'>, string> = { mai_riscant: 'mai-riscant', mai_putin_riscant: 'mai-putin-riscant' };
const find = <T extends string>(map: Record<T, string>, v: string | null) => (Object.keys(map) as T[]).find((k) => map[k] === v);

const hrefOf = (p: CdepListItem) => (p.senat ? `/legi/${p.senat}` : `/camera/${p.slug}`);

export default function CameraExplorer({ items, pages, builtOn }: { items: CdepListItem[]; pages: string[]; builtOn: string }) {
  const [today, setToday] = useState(builtOn);
  useEffect(() => setToday(todayISO()), []);
  const withPage = useMemo(() => new Set(pages), [pages]);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('acum');
  const [risk, setRisk] = useState<Risk>('toate');
  const [drum, setDrum] = useState<Drum>('toate');
  const [openOnly, setOpenOnly] = useState(false);
  const [sort, setSort] = useState<Sort>('risc');
  const [visible, setVisible] = useState(PAGE);
  const [ready, setReady] = useState(false);

  // Starea din adresă, o dată la încărcare; apoi adresa urmează filtrele.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const etapa = q.get('etapa');
    if (FILTERS.some((f) => f.key === etapa)) setFilter(etapa as Filter);
    setRisk(find(RISK_PARAM, q.get('risc')) ?? 'toate');
    setDrum(find(DRUM_PARAM, q.get('drum')) ?? 'toate');
    setOpenOnly(q.get('termen') === 'deschis');
    const ordine = q.get('ordine');
    if (ordine === 'noi' || ordine === 'termen') setSort(ordine);
    setQuery(q.get('q') ?? '');
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const q = new URLSearchParams();
    if (filter !== 'acum') q.set('etapa', filter);
    if (risk !== 'toate') q.set('risc', RISK_PARAM[risk]);
    if (drum !== 'toate') q.set('drum', DRUM_PARAM[drum]);
    if (openOnly) q.set('termen', 'deschis');
    if (sort !== 'risc') q.set('ordine', sort);
    if (query.trim()) q.set('q', query.trim());
    const url = `${window.location.pathname}${q.size ? `?${q}` : ''}${window.location.hash}`;
    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(null, '', url);
  }, [ready, filter, risk, drum, openOnly, sort, query]);

  const openDeadline = (p: CdepListItem) => p.termenAmendamente !== null && p.termenAmendamente >= today;
  const atChamber = (p: CdepListItem) => FILTERS[0].stages!.includes(p.stage);
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, f.stages ? items.filter((p) => f.stages!.includes(p.stage)).length : items.length])) as Record<Filter, number>,
    [items],
  );
  // Câte proiecte are fiecare nivel de risc în etapa aleasă, ca butoanele să spună ce găsești în spatele lor.
  const inStage = useMemo(() => {
    const stages = FILTERS.find((f) => f.key === filter)!.stages;
    return items.filter((p) => !stages || stages.includes(p.stage));
  }, [items, filter]);
  const riskCounts = useMemo(
    () => Object.fromEntries((['red', 'yellow', 'green'] as const).map((l) => [l, inStage.filter((p) => p.risk?.level === l).length])) as Record<RiskLevel, number>,
    [inStage],
  );
  const worse = useMemo(() => inStage.filter((p) => p.textChange?.direction === 'mai_riscant').length, [inStage]);
  const better = useMemo(() => inStage.filter((p) => p.textChange?.direction === 'mai_putin_riscant').length, [inStage]);

  const list = useMemo(() => {
    const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
    const deadline = (p: CdepListItem) => (p.termenAmendamente && p.termenAmendamente >= today ? p.termenAmendamente : '9999');
    // Fără analiză = la coada listei când ordonăm după risc.
    const score = (p: CdepListItem) => p.risk?.score ?? -1;
    return inStage
      .filter((p) => risk === 'toate' || p.risk?.level === risk)
      .filter((p) => drum === 'toate' || p.textChange?.direction === drum)
      .filter((p) => !openOnly || (p.termenAmendamente !== null && p.termenAmendamente >= today))
      .filter((p) => {
        const text = normalize(`${p.numar} ${p.titlu} ${p.risk?.plainTitle ?? ''} ${p.raport.join(' ')}`);
        return terms.every((t) => text.includes(t));
      })
      .sort(
        (a, b) =>
          (sort === 'termen' ? deadline(a).localeCompare(deadline(b)) : sort === 'risc' ? score(b) - score(a) : 0) ||
          b.inregistrat.localeCompare(a.inregistrat) ||
          b.idp - a.idp,
      );
  }, [inStage, risk, drum, openOnly, query, sort, today]);

  const set = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setVisible(PAGE);
  };
  const shown = initialRows(list.length, visible);
  const hasFilters = query.trim() !== '' || openOnly || filter !== 'acum' || risk !== 'toate' || drum !== 'toate';
  const reset = () => {
    setQuery('');
    setOpenOnly(false);
    setFilter('acum');
    setRisk('toate');
    setDrum('toate');
    setVisible(PAGE);
  };

  // Cifrele de sus sunt scurtături: fiecare arată lista din spatele ei, cu cele mai riscante întâi.
  const here = items.filter(atChamber);
  const tiles: { key: string; n: number; label: string; tone?: string; on: boolean; apply: () => void }[] = [
    {
      key: 'acum',
      n: here.length,
      label: 'în dezbatere acum',
      on: filter === 'acum' && risk === 'toate' && drum === 'toate' && !openOnly,
      apply: () => {
        reset();
        setSort('risc');
      },
    },
    {
      key: 'ridicat',
      n: here.filter((p) => p.risk?.level === 'red').length,
      label: 'cu risc ridicat',
      tone: RISK.red.text,
      on: filter === 'acum' && risk === 'red' && drum === 'toate' && !openOnly,
      apply: () => {
        reset();
        setRisk('red');
        setSort('risc');
      },
    },
    {
      key: 'drum',
      n: items.filter((p) => p.textChange?.direction === 'mai_riscant').length,
      label: 'mai riscante după schimbări',
      tone: RISK.red.text,
      on: filter === 'toate' && drum === 'mai_riscant' && risk === 'toate' && !openOnly,
      apply: () => {
        reset();
        setFilter('toate');
        setDrum('mai_riscant');
        setSort('risc');
      },
    },
    {
      key: 'termen',
      n: here.filter(openDeadline).length,
      label: 'cu termen de amendamente deschis',
      on: filter === 'acum' && openOnly && risk === 'toate' && drum === 'toate',
      apply: () => {
        reset();
        setOpenOnly(true);
        setSort('termen');
      },
    },
  ];
  const chip = (on: boolean) =>
    `inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition-colors ${
      on ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface text-body hover:border-line-strong hover:text-ink'
    }`;

  return (
    <div>
      <div role="group" aria-label="Scurtături" className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={t.on}
            onClick={() => {
              t.apply();
              document.getElementById('proiecte')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            {...trackAttrs('camera_filter', { filter: 'tile', value: t.key })}
            className={`group flex flex-col items-start px-5 py-4 text-left transition-colors focus-visible:relative focus-visible:z-10 ${
              t.on ? 'bg-brand-soft' : 'bg-surface hover:bg-sunken'
            }`}
          >
            <span className={`text-3xl font-semibold tabular-nums ${t.tone ?? 'text-ink'}`}>{t.n}</span>
            <span className="mt-0.5 text-sm leading-5 text-muted group-hover:text-ink">
              {t.label}
              <ChevronRight className="ml-0.5 inline h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          </button>
        ))}
      </div>

      <div id="proiecte" className="scroll-mt-24 space-y-3 border-b border-line pb-5">
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
                  className={chip(on)}
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
        <div role="group" aria-label="Riscul" className="-mx-4 flex max-w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:max-w-full sm:flex-wrap sm:px-0">
          <button type="button" aria-pressed={risk === 'toate'} onClick={() => set(setRisk)('toate')} className={chip(risk === 'toate')}>
            Orice risc
          </button>
          {(['red', 'yellow', 'green'] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={risk === l}
              onClick={() => set(setRisk)(risk === l ? 'toate' : l)}
              {...trackAttrs('camera_filter', { filter: 'risk', value: l })}
              className={chip(risk === l)}
            >
              <span aria-hidden className={`h-2 w-2 rounded-full ${RISK[l].fill}`} />
              {RISK[l].label}
              <span className="font-normal tabular-nums opacity-75">{riskCounts[l]}</span>
            </button>
          ))}
          {(worse > 0 || better > 0) && <span aria-hidden className="mx-1 hidden w-px self-stretch bg-line sm:block" />}
          {worse > 0 && (
            <button
              type="button"
              aria-pressed={drum === 'mai_riscant'}
              onClick={() => set(setDrum)(drum === 'mai_riscant' ? 'toate' : 'mai_riscant')}
              {...trackAttrs('camera_filter', { filter: 'text_change', value: 'mai_riscant' })}
              className={chip(drum === 'mai_riscant')}
            >
              Mai riscante după schimbări
              <span className="font-normal tabular-nums opacity-75">{worse}</span>
            </button>
          )}
          {better > 0 && (
            <button
              type="button"
              aria-pressed={drum === 'mai_putin_riscant'}
              onClick={() => set(setDrum)(drum === 'mai_putin_riscant' ? 'toate' : 'mai_putin_riscant')}
              {...trackAttrs('camera_filter', { filter: 'text_change', value: 'mai_putin_riscant' })}
              className={chip(drum === 'mai_putin_riscant')}
            >
              Mai puțin riscante
              <span className="font-normal tabular-nums opacity-75">{better}</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 py-3">
        <p role="status" aria-live="polite" className="text-sm text-muted">
          <strong className="font-semibold text-ink">{countWord(list.length, 'proiect', 'proiecte')}</strong>
          {hasFilters ? ' corespund filtrelor' : ' aflate acum la Cameră'}
        </p>
        <div className="flex max-w-full items-center gap-2 text-sm text-muted">
          <span className="hidden sm:inline">Ordine:</span>
          <div role="group" aria-label="Ordonează" className="flex rounded-lg bg-sunken p-1">
            <button type="button" aria-pressed={sort === 'risc'} onClick={() => setSort('risc')} className={segCls(sort === 'risc')}>
              Cele mai riscante
            </button>
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
              <button type="button" onClick={reset} className={`${btnSecondary} min-h-11 px-5 text-sm`}>
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
                      {p.textChange && (
                        <span className={p.textChange.direction === 'mai_riscant' ? 'text-risk-red-text' : 'text-risk-green-text'}>
                          {p.textChange.direction === 'mai_riscant' ? 'mai riscant' : 'mai puțin riscant'} după {p.textChange.after === 'senat' ? 'Senat' : 'Cameră'}
                        </span>
                      )}
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
