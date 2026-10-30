'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, ExternalLink, Search, X } from 'lucide-react';
import type { CdepListItem } from '@/lib/cdep';
import type { RiskLevel } from '@/lib/types';
import { RISK } from '@/lib/risk';
import { STAGES, dayDiff, shortCommittee, shortDate, stageLabel, type StageKey } from '@/lib/cdep-text';
import { countWord, initialRows, normalize, todayISO } from '@/lib/format';
import { trackAttrs } from '@/lib/analytics';
import { EmptyState, RiskChip, btnSecondary, inputCls, segCls } from '@/components/ui';
import { Barometer, LEVELS, Showcase, Stages, Timeline, byLevel, monthLabel, showcaseNote, type ShowcaseTab } from './CameraOverview';

const PAGE = 40;
const CHAMBER: StageKey[] = STAGES.filter((s) => s.atChamber).map((s) => s.key);
const ALL: StageKey[] = STAGES.map((s) => s.key);

// Filtrele stau și în adresă (/camera?risc=ridicat&etapa=plen), ca o listă să poată fi trimisă cuiva.
type Scope = 'acum' | 'toate';
type Drum = 'mai_riscant' | 'mai_putin_riscant';
type Sort = 'risc' | 'risc_mic' | 'noi' | 'termen';
const RISK_PARAM: Record<RiskLevel, string> = { red: 'ridicat', yellow: 'moderat', green: 'redus' };
const DRUM_PARAM: Record<Drum, string> = { mai_riscant: 'mai-riscant', mai_putin_riscant: 'mai-putin-riscant' };
const SORTS: { key: Sort; label: string }[] = [
  { key: 'risc', label: 'Cele mai riscante' },
  { key: 'risc_mic', label: 'Cele mai puțin riscante' },
  { key: 'noi', label: 'Cele mai noi' },
  { key: 'termen', label: 'Termen apropiat' },
];
const find = <T extends string>(map: Record<T, string>, v: string | null) => (Object.keys(map) as T[]).find((k) => map[k] === v) ?? null;

const hrefOf = (p: CdepListItem) => (p.senat ? `/legi/${p.senat}` : `/camera/${p.slug}`);

export default function CameraExplorer({ items, pages, builtOn }: { items: CdepListItem[]; pages: string[]; builtOn: string }) {
  const [today, setToday] = useState(builtOn);
  useEffect(() => setToday(todayISO()), []);
  const withPage = useMemo(() => new Set(pages), [pages]);

  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('acum');
  const [stage, setStage] = useState<StageKey | null>(null);
  const [risk, setRisk] = useState<RiskLevel | null>(null);
  const [drum, setDrum] = useState<Drum | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [openOnly, setOpenOnly] = useState(false);
  const [sort, setSort] = useState<Sort>('risc');
  const [tab, setTab] = useState<ShowcaseTab>('risc');
  const [visible, setVisible] = useState(PAGE);
  const [ready, setReady] = useState(false);

  // Starea din adresă, o dată la încărcare; apoi adresa urmează filtrele.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const etapa = q.get('etapa');
    if (etapa === 'toate' || q.get('domeniu') === 'toate') setScope('toate');
    if (etapa && ALL.includes(etapa as StageKey)) {
      setStage(etapa as StageKey);
      if (!CHAMBER.includes(etapa as StageKey)) setScope('toate');
    }
    setRisk(find(RISK_PARAM, q.get('risc')));
    setDrum(find(DRUM_PARAM, q.get('drum')));
    if (/^\d{4}-\d{2}$/.test(q.get('luna') ?? '')) setMonth(q.get('luna'));
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.get('termen') ?? '')) setDay(q.get('termen'));
    setOpenOnly(q.get('termen') === 'deschis');
    const ordine = q.get('ordine') as Sort | null;
    if (ordine && SORTS.some((s) => s.key === ordine)) setSort(ordine);
    setQuery(q.get('q') ?? '');
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const q = new URLSearchParams();
    if (scope === 'toate') q.set('domeniu', 'toate');
    if (stage) q.set('etapa', stage);
    if (risk) q.set('risc', RISK_PARAM[risk]);
    if (drum) q.set('drum', DRUM_PARAM[drum]);
    if (month) q.set('luna', month);
    if (day) q.set('termen', day);
    else if (openOnly) q.set('termen', 'deschis');
    if (sort !== 'risc') q.set('ordine', sort);
    if (query.trim()) q.set('q', query.trim());
    const url = `${window.location.pathname}${q.size ? `?${q}` : ''}${window.location.hash}`;
    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(null, '', url);
  }, [ready, scope, stage, risk, drum, month, day, openOnly, sort, query]);

  // Universul: proiectele aflate acum la Cameră sau toate din an. Barometrul, etapele și timeline-ul îl descriu pe el.
  const universe = useMemo(() => (scope === 'acum' ? items.filter((p) => CHAMBER.includes(p.stage)) : items), [items, scope]);
  const counts = useMemo(() => byLevel(universe), [universe]);
  const open = (p: CdepListItem) => p.termenAmendamente !== null && p.termenAmendamente >= today;

  const list = useMemo(() => {
    const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
    const deadline = (p: CdepListItem) => (p.termenAmendamente && p.termenAmendamente >= today ? p.termenAmendamente : '9999');
    // Fără analiză = la coada listei, în ambele ordini după risc.
    const score = (p: CdepListItem, low: boolean) => (p.risk ? (low ? -p.risk.score : p.risk.score) : -99);
    return universe
      .filter((p) => !stage || p.stage === stage)
      .filter((p) => !risk || p.risk?.level === risk)
      .filter((p) => !drum || p.textChange?.direction === drum)
      .filter((p) => !month || p.inregistrat.startsWith(month))
      .filter((p) => (day ? p.termenAmendamente === day : !openOnly || (p.termenAmendamente !== null && p.termenAmendamente >= today)))
      .filter((p) => {
        const text = normalize(`${p.numar} ${p.titlu} ${p.risk?.plainTitle ?? ''} ${p.raport.join(' ')}`);
        return terms.every((t) => text.includes(t));
      })
      .sort(
        (a, b) =>
          (sort === 'termen'
            ? deadline(a).localeCompare(deadline(b))
            : sort === 'risc' || sort === 'risc_mic'
              ? score(b, sort === 'risc_mic') - score(a, sort === 'risc_mic')
              : 0) ||
          b.inregistrat.localeCompare(a.inregistrat) ||
          b.idp - a.idp,
      );
  }, [universe, stage, risk, drum, month, day, openOnly, query, sort, today]);

  const scrollToList = () => document.getElementById('proiecte')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const touched = () => setVisible(PAGE);
  const reset = () => {
    setQuery('');
    setStage(null);
    setRisk(null);
    setDrum(null);
    setMonth(null);
    setDay(null);
    setOpenOnly(false);
    setVisible(PAGE);
  };

  // Vitrina: câte șase proiecte pe temă; „vezi toate” aplică același filtru listei.
  const top = (ps: CdepListItem[], by: (a: CdepListItem, b: CdepListItem) => number) => [...ps].sort(by).slice(0, 6);
  const byScore = (a: CdepListItem, b: CdepListItem) => (b.risk?.score ?? -1) - (a.risk?.score ?? -1);
  const worse = universe.filter((p) => p.textChange?.direction === 'mai_riscant');
  const better = universe.filter((p) => p.textChange?.direction === 'mai_putin_riscant');
  const openList = universe.filter(open);
  const reds = universe.filter((p) => p.risk?.level === 'red');
  const tabs = [
    { key: 'risc' as const, label: 'Cele mai riscante', items: top(reds.length ? reds : universe, byScore), total: reds.length },
    { key: 'agravate' as const, label: 'Mai riscante pe drum', items: top(worse, byScore), total: worse.length },
    { key: 'imblanzite' as const, label: 'Îmblânzite pe drum', items: top(better, byScore), total: better.length },
    { key: 'termen' as const, label: 'Se pot amenda acum', items: top(openList, (a, b) => a.termenAmendamente!.localeCompare(b.termenAmendamente!) || byScore(a, b)), total: openList.length },
  ]
    .filter((t) => t.items.length)
    .map((t) => ({ ...t, note: (p: CdepListItem) => showcaseNote(t.key, p, today) }));
  const seeAll = (t: ShowcaseTab) => {
    reset();
    if (t === 'risc') {
      setRisk('red');
      setSort('risc');
    } else if (t === 'agravate' || t === 'imblanzite') {
      setDrum(t === 'agravate' ? 'mai_riscant' : 'mai_putin_riscant');
      setSort('risc');
    } else {
      setOpenOnly(true);
      setSort('termen');
    }
    scrollToList();
  };

  // Filtrele active, ca etichete care se pot scoate una câte una.
  const active: { key: string; label: string; clear: () => void }[] = [
    stage && { key: 'etapa', label: stageLabel(stage), clear: () => setStage(null) },
    risk && { key: 'risc', label: RISK[risk].label, clear: () => setRisk(null) },
    drum && { key: 'drum', label: drum === 'mai_riscant' ? 'Mai riscante pe drum' : 'Îmblânzite pe drum', clear: () => setDrum(null) },
    month && { key: 'luna', label: `Înregistrate în ${monthLabel(month)}`, clear: () => setMonth(null) },
    day && { key: 'zi', label: `Amendamente până pe ${shortDate(day)}`, clear: () => setDay(null) },
    !day && openOnly && { key: 'termen', label: 'Termen de amendamente deschis', clear: () => setOpenOnly(false) },
    query.trim() && { key: 'q', label: `„${query.trim()}”`, clear: () => setQuery('') },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  const shown = initialRows(list.length, visible);
  const scopeLabel = scope === 'acum' ? 'aflate acum la Cameră' : 'înregistrate în an';

  return (
    <div>
      <div role="group" aria-label="Ce proiecte" className="inline-flex rounded-lg bg-sunken p-1">
        {(
          [
            ['acum', 'La Cameră acum', items.filter((p) => CHAMBER.includes(p.stage)).length],
            ['toate', 'Toate din 2026', items.length],
          ] as const
        ).map(([k, label, n]) => (
          <button
            key={k}
            type="button"
            aria-pressed={scope === k}
            onClick={() => {
              setScope(k);
              setStage(null);
              touched();
            }}
            {...trackAttrs('camera_filter', { filter: 'scope', value: k })}
            className={segCls(scope === k)}
          >
            {label} <span className="font-normal tabular-nums opacity-75">{n}</span>
          </button>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-12">
        <div className="min-w-0 space-y-10">
          <Barometer
            counts={counts}
            unrated={universe.length - LEVELS.reduce((s, l) => s + counts[l], 0)}
            risk={risk}
            onRisk={(l) => {
              setRisk(l);
              setSort('risc');
              touched();
              scrollToList();
            }}
          />
          <Stages
            list={universe}
            keys={scope === 'acum' ? CHAMBER : ALL}
            stage={stage}
            risk={risk}
            onPick={(s, r) => {
              setStage(s);
              setRisk(r);
              touched();
              scrollToList();
            }}
          />
        </div>
        <div className="min-w-0">
          {tabs.length > 0 && <Showcase tabs={tabs} active={tabs.some((t) => t.key === tab) ? tab : tabs[0].key} onTab={setTab} onSeeAll={seeAll} />}
        </div>
      </div>

      <div className="mt-10 min-w-0">
        <Timeline
          list={universe}
          today={today}
          month={month}
          day={day}
          onMonth={(m) => {
            setMonth(m);
            touched();
            scrollToList();
          }}
          onDay={(d) => {
            setDay(d);
            setSort('termen');
            touched();
            scrollToList();
          }}
        />
      </div>

      <div id="proiecte" className="mt-12 scroll-mt-20 space-y-3 border-b border-line pb-5">
        <h2 className="font-display text-2xl text-ink sm:text-3xl">Proiectele</h2>
        <label className="relative block">
          <span className="sr-only">Caută un proiect după număr, titlu sau comisie</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              touched();
            }}
            placeholder="Număr, cuvânt din titlu sau comisie"
            className={`${inputCls} pl-11 pr-4`}
            autoComplete="off"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ['mai_riscant', 'Mai riscante pe drum', worse.length],
              ['mai_putin_riscant', 'Îmblânzite pe drum', better.length],
            ] as const
          ).map(
            ([k, label, n]) =>
              n > 0 && (
                <button
                  key={k}
                  type="button"
                  aria-pressed={drum === k}
                  onClick={() => {
                    setDrum(drum === k ? null : k);
                    touched();
                  }}
                  {...trackAttrs('camera_filter', { filter: 'text_change', value: k })}
                  className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition-colors ${
                    drum === k ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface text-body hover:border-line-strong hover:text-ink'
                  }`}
                >
                  {label}
                  <span className="font-normal tabular-nums opacity-75">{n}</span>
                </button>
              ),
          )}
          <button
            type="button"
            aria-pressed={openOnly || Boolean(day)}
            onClick={() => {
              setDay(null);
              setOpenOnly(!(openOnly || day));
              touched();
            }}
            {...trackAttrs('camera_filter', { filter: 'open_deadline', value: openOnly ? 'off' : 'on' })}
            className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition-colors ${
              openOnly || day ? 'border-ink bg-ink text-paper' : 'border-dashed border-line-strong bg-surface text-body hover:text-ink'
            }`}
          >
            Termen de amendamente deschis
            <span className="font-normal tabular-nums opacity-75">{openList.length}</span>
          </button>
        </div>
      </div>

      <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <p role="status" aria-live="polite" className="text-sm text-muted">
            <strong className="font-semibold text-ink">{countWord(list.length, 'proiect', 'proiecte')}</strong> {active.length ? 'corespund filtrelor' : scopeLabel}
          </p>
          {active.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => {
                f.clear();
                touched();
              }}
              className="inline-flex min-h-8 items-center gap-1 rounded-full border border-line-strong bg-surface pl-3 pr-2 text-xs font-semibold text-ink hover:bg-sunken"
            >
              {f.label}
              <X className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">(scoate filtrul)</span>
            </button>
          ))}
          {active.length > 1 && (
            <button type="button" onClick={reset} className="text-xs font-semibold text-link underline underline-offset-4">
              Șterge filtrele
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <span>Ordine:</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="min-h-9 rounded-lg border border-line-strong bg-surface px-2 text-sm font-semibold text-ink"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {list.length === 0 ? (
        <EmptyState
          title="Niciun proiect nu corespunde"
          text="Încearcă un singur cuvânt din titlu, numărul fără „PL-x” sau toate proiectele din an."
          action={
            active.length ? (
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
                      {p.risk && <RiskChip level={p.risk.level} score={p.risk.score} />}
                      <span className="font-semibold tabular-nums text-ink">{p.numar}</span>
                      <span className={`rounded-md px-1.5 py-0.5 font-semibold ${p.stage === 'plen' ? 'bg-brand text-on-brand' : 'bg-sunken text-body'}`}>
                        {stageLabel(p.stage)}
                      </span>
                      {p.textChange && (
                        <span className={`font-semibold ${p.textChange.direction === 'mai_riscant' ? 'text-risk-red-text' : 'text-risk-green-text'}`}>
                          {p.textChange.direction === 'mai_riscant' ? 'mai riscant' : 'mai puțin riscant'} după {p.textChange.after === 'senat' ? 'Senat' : 'Cameră'}
                        </span>
                      )}
                      {p.senat && <span className="text-muted">urmărit de la Senat</span>}
                    </span>
                    <span className="mt-1.5 block font-display text-[17px] leading-snug text-ink group-hover:underline group-hover:underline-offset-4">
                      {p.risk?.plainTitle ?? p.titlu}
                    </span>
                    {p.risk && <span className="mt-0.5 line-clamp-1 block text-xs leading-5 text-muted">{p.titlu}</span>}
                    <span className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs leading-5 text-muted">
                      {p.stage === 'comisii' && days !== null && (
                        <span className={days >= 0 && days <= 3 ? 'font-semibold text-risk-red-text' : days >= 0 ? 'font-semibold text-ink' : ''}>
                          {days >= 0 ? `Amendamente până pe ${shortDate(p.termenAmendamente!)}` : `Termenul de amendamente a trecut (${shortDate(p.termenAmendamente!)})`}
                        </span>
                      )}
                      <span>Înregistrat pe {shortDate(p.inregistrat)}</span>
                      {p.raport.length > 0 && <span>Raport: {p.raport.map(shortCommittee).join(', ')}</span>}
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
