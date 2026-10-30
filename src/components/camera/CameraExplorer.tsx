'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowDownRight, ArrowUpRight, ChevronDown, Clock, Info, Landmark, Megaphone, Search, Wrench, X } from 'lucide-react';
import type { CdepListItem } from '@/lib/cdep';
import type { RiskLevel } from '@/lib/types';
import { RISK } from '@/lib/risk';
import { STAGES, dayDiff, shortDate, stageLabel, type StageKey } from '@/lib/cdep-text';
import { countWord, initialRows, normalize, todayISO } from '@/lib/format';
import { trackAttrs } from '@/lib/analytics';
import { Container, EmptyState, SectionHead, btnSecondary, inputCls, linkCls } from '@/components/ui';
import { CHAMBER, LEVELS, OutsideLine, RiskWaffle, SectionHeading, StagePath, byLevel, monthLabel, shareWords } from './CameraOverview';
import { Timeline } from './CameraTimeline';
import RiskFilter, { chipCls } from '@/components/bills/RiskFilter';
import CameraCard from './CameraCard';

const PAGE = 40;
const ALL: StageKey[] = STAGES.map((s) => s.key);

// Filtrele stau și în adresă (/camera?risc=ridicat&etapa=plen), ca o listă să poată fi trimisă cuiva.
type Scope = 'acum' | 'toate';
type Drum = 'mai_riscant' | 'mai_putin_riscant';
type Sort = 'risc' | 'risc_mic' | 'noi' | 'termen';
const RISK_PARAM: Record<RiskLevel, string> = { red: 'ridicat', yellow: 'moderat', green: 'redus' };
const DRUM_PARAM: Record<Drum, string> = { mai_riscant: 'mai-riscant', mai_putin_riscant: 'mai-putin-riscant' };
const SORTS: { key: Sort; label: string; title: string }[] = [
  { key: 'risc', label: 'Cele mai riscante', title: 'de la cel mai riscant' },
  { key: 'risc_mic', label: 'Cele mai puțin riscante', title: 'de la cel mai puțin riscant' },
  { key: 'noi', label: 'Cele mai noi', title: 'de la cel mai nou' },
  { key: 'termen', label: 'Termen apropiat', title: 'după termenul de amendamente' },
];
const find = <T extends string>(map: Record<T, string>, v: string | null) => (Object.keys(map) as T[]).find((k) => map[k] === v) ?? null;

function Section({ id, children, first = false }: { id: string; children: ReactNode; first?: boolean }) {
  return (
    <section id={id} aria-labelledby={`${id}-titlu`} className={`scroll-mt-20 py-14 lg:py-[88px] ${first ? 'pt-10 lg:pt-14' : 'border-t border-line'}`}>
      <Container>{children}</Container>
    </section>
  );
}

export default function CameraExplorer({ items, pages, builtOn, compared }: { items: CdepListItem[]; pages: string[]; builtOn: string; compared: number }) {
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
  // Doar proiectele la care o schimbare punctuală ar face legea acceptabilă (scripts/straja-balance.mjs).
  const [fixOnly, setFixOnly] = useState(false);
  // Doar proiectele în consultare publică la Cameră (când e prima sesizată), cu termenul încă deschis.
  const [consultOnly, setConsultOnly] = useState(false);
  const [sort, setSort] = useState<Sort>('risc');
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
    setFixOnly(q.get('reparabile') === 'da');
    setConsultOnly(q.get('consultare') === 'deschisa');
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
    if (fixOnly) q.set('reparabile', 'da');
    if (consultOnly) q.set('consultare', 'deschisa');
    if (sort !== 'risc') q.set('ordine', sort);
    if (query.trim()) q.set('q', query.trim());
    const url = `${window.location.pathname}${q.size ? `?${q}` : ''}${window.location.hash}`;
    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(null, '', url);
  }, [ready, scope, stage, risk, drum, month, day, openOnly, fixOnly, consultOnly, sort, query]);

  // „Acum” = proiectele aflate la Cameră; „toate” = tot ce s-a înregistrat în an. Distribuția, vitrina și cronologia descriu universul ales.
  const here = useMemo(() => items.filter((p) => CHAMBER.includes(p.stage)), [items]);
  const universe = scope === 'acum' ? here : items;
  const counts = useMemo(() => byLevel(universe), [universe]);
  const rated = LEVELS.reduce((s, l) => s + counts[l], 0);
  const open = (p: CdepListItem) => p.termenAmendamente !== null && p.termenAmendamente >= today;
  const fixable = useMemo(() => universe.filter((p) => p.balance?.fix).length, [universe]);
  const consulting = useCallback((p: CdepListItem) => p.consultare !== null && p.consultare.termen >= today, [today]);
  const inConsultation = useMemo(() => universe.filter(consulting).length, [universe, consulting]);

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
      .filter((p) => !fixOnly || Boolean(p.balance?.fix))
      .filter((p) => !consultOnly || consulting(p))
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
  }, [universe, stage, risk, drum, month, day, openOnly, fixOnly, consultOnly, query, sort, today]);

  const touched = () => setVisible(PAGE);
  const reset = () => {
    setQuery('');
    setStage(null);
    setRisk(null);
    setDrum(null);
    setMonth(null);
    setDay(null);
    setOpenOnly(false);
    setFixOnly(false);
    setConsultOnly(false);
    setVisible(PAGE);
  };
  const pickScope = (s: Scope) => {
    setScope(s);
    if (s === 'acum' && stage && !CHAMBER.includes(stage)) setStage(null);
    touched();
  };
  // Callback-uri stabile, ca graficele (memo) să nu se redeseneze la fiecare literă din căutare.
  const pickStage = useCallback((s: StageKey | null) => {
    if (s && !CHAMBER.includes(s)) setScope('toate');
    setStage(s);
    setVisible(PAGE);
  }, []);
  const pickRisk = useCallback((l: RiskLevel | null) => {
    setRisk(l);
    setVisible(PAGE);
  }, []);
  const pickMonth = useCallback((m: string | null) => {
    setMonth(m);
    setVisible(PAGE);
  }, []);
  const pickDay = useCallback((d: string | null) => {
    setDay(d);
    if (d) {
      setSort('termen');
      document.getElementById('proiecte')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setVisible(PAGE);
  }, []);

  // Vitrina: câte șase proiecte pe temă; „vezi toate” aplică același filtru listei.
  const worse = universe.filter((p) => p.textChange?.direction === 'mai_riscant');
  const better = universe.filter((p) => p.textChange?.direction === 'mai_putin_riscant');
  const openList = universe.filter(open);
  const where = scope === 'acum' ? 'aflate acum la Cameră' : 'înregistrate la Cameră în 2026';
  const n = (k: number) => countWord(k, 'proiect', 'proiecte');

  // Filtrele active, ca etichete care se pot scoate una câte una.
  const active: { key: string; label: string; level?: RiskLevel; clear: () => void }[] = [
    scope === 'toate' && { key: 'domeniu', label: 'Toate din 2026', clear: () => pickScope('acum') },
    stage && { key: 'etapa', label: stageLabel(stage), clear: () => setStage(null) },
    risk && { key: 'risc', label: RISK[risk].label, level: risk, clear: () => setRisk(null) },
    drum && { key: 'drum', label: drum === 'mai_riscant' ? 'Mai riscante pe drum' : 'Îmblânzite pe drum', clear: () => setDrum(null) },
    month && { key: 'luna', label: `Înregistrate în ${monthLabel(month)}`, clear: () => setMonth(null) },
    day && { key: 'zi', label: `Amendamente până pe ${shortDate(day)}`, clear: () => setDay(null) },
    !day && openOnly && { key: 'termen', label: 'Termen de amendamente deschis', clear: () => setOpenOnly(false) },
    fixOnly && { key: 'reparabile', label: 'Se pot repara', clear: () => setFixOnly(false) },
    consultOnly && { key: 'consultare', label: 'În consultare publică', clear: () => setConsultOnly(false) },
    query.trim() && { key: 'q', label: `„${query.trim()}”`, clear: () => setQuery('') },
  ].filter(Boolean) as { key: string; label: string; level?: RiskLevel; clear: () => void }[];
  const narrowed = active.some((f) => f.key !== 'domeniu' && f.key !== 'q');

  // Bara de jos: apare când ai ales un filtru mai sus și lista nu e pe ecran.
  const listRef = useRef<HTMLElement>(null);
  const [listInView, setListInView] = useState(false);
  useEffect(() => {
    const el = listRef.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => setListInView(e.isIntersecting), { rootMargin: '0px 0px -30% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const showBar = narrowed && !listInView;

  // Deschiderea: cifrele care contează întâi, calculate în browser pentru ziua de azi.
  const hereCounts = byLevel(here);
  const hereOpen = here.filter(open);
  const lastDays = hereOpen.length ? Math.max(...hereOpen.map((p) => dayDiff(p.termenAmendamente!, today))) : null;
  const pct = rated ? Math.round((counts.red / rated) * 100) : 0;
  const atCommittee = here.filter((p) => p.stage === 'comisii').length;
  const shown = initialRows(list.length, visible);

  const scopeKey = (e: KeyboardEvent) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const next = scope === 'acum' ? 'toate' : 'acum';
    pickScope(next);
    document.getElementById(`domeniu-${next}`)?.focus();
  };

  return (
    <>
      <Container>
        <p className="mt-5 max-w-[44ch] text-[clamp(1.15rem,2vw,1.4rem)] leading-[1.55] text-body">
          Camera are ultimul cuvânt pentru majoritatea legilor, inclusiv pentru proiectele din{' '}
          <Link href="/senat" className={linkCls}>
            consultarea Senatului
          </Link>
          . Acum sunt aici <strong className="font-semibold text-ink">{n(here.length)}</strong>:{' '}
          <strong className="font-semibold text-ink">{hereCounts.red}</strong> au risc ridicat
          {lastDays !== null && (
            <>
              , iar <strong className="font-semibold text-ink">{hereOpen.length}</strong> se mai pot amenda{' '}
              {lastDays === 0 ? 'doar azi' : lastDays === 1 ? 'până mâine' : `în următoarele ${countWord(lastDays, 'zi', 'zile')}`}
            </>
          )}
          .
        </p>
        <div className="mt-8 grid gap-2.5 md:grid-cols-[auto_minmax(0,1fr)] md:items-center md:gap-5">
          <div role="radiogroup" aria-label="Ce proiecte arăt" className="grid w-full max-w-[460px] grid-cols-2 gap-1 rounded-[14px] border border-line bg-sunken p-1">
            {(
              [
                ['acum', 'La Cameră acum', here.length],
                ['toate', 'Toate din 2026', items.length],
              ] as const
            ).map(([k, label, total]) => {
              const on = scope === k;
              return (
                <button
                  key={k}
                  id={`domeniu-${k}`}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={on ? 0 : -1}
                  onClick={() => pickScope(k)}
                  onKeyDown={scopeKey}
                  {...trackAttrs('camera_filter', { filter: 'scope', value: k })}
                  className={`flex min-h-[52px] flex-col justify-center rounded-[10px] px-3 text-left text-[15px] font-semibold leading-tight transition-colors ${
                    on ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(var(--shadow-color)/0.14),0_0_0_1px_var(--line-strong)]' : 'text-muted hover:text-ink'
                  }`}
                >
                  {label}
                  <span className={`mt-0.5 text-[13px] font-semibold tabular-nums ${on ? 'text-body' : 'text-muted'}`}>{n(total)}</span>
                </button>
              );
            })}
          </div>
          <p className="max-w-[56ch] text-[14.5px] leading-relaxed text-muted">
            {scope === 'acum'
              ? 'Proiectele aflate acum la comisii, cu raport, pe ordinea de zi, la avize sau în reexaminare.'
              : 'Tot ce s-a înregistrat la Cameră în 2026, inclusiv proiectele trimise la Senat, cele la promulgare, cele devenite lege și cele încheiate.'}
          </p>
        </div>
      </Container>

      <Section id="risc" first>
        <SectionHeading id="risc-titlu" title={pct === 1 ? '1 din 100 are risc ridicat' : `${pct} din 100 au risc ridicat`}>
          Din cele <strong className="font-semibold text-ink">{universe.length}</strong>
          {countWord(universe.length, 'proiect', 'proiecte').replace(/^\d+/, '')} {where}, <strong className="font-semibold text-ink">{counts.red}</strong> au scor
          de risc de la 6,8 în sus. {shareWords(counts.yellow, rated)} au risc moderat, iar restul, risc redus.
          {rated < universe.length && ` Încă fără analiză: ${universe.length - rated}.`}
        </SectionHeading>
        <RiskWaffle
          counts={counts}
          risk={risk}
          onRisk={pickRisk}
        />
        <p className="mt-6 flex max-w-[70ch] items-start gap-2.5 text-sm leading-relaxed text-muted">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            Fiecare pătrățel e un proiect. Scorul, de la 0 la 10, vine din evaluările date de Gemini, Claude și ChatGPT. Nu e un verdict juridic: verde
            înseamnă risc redus, nu „lege bună”.{' '}
            <Link href="/metodologie" className={linkCls}>
              Cum dăm scorul
            </Link>
          </span>
        </p>
      </Section>

      <section id="proiecte" ref={listRef} aria-labelledby="proiecte-titlu" className="scroll-mt-20 border-t border-line py-14 lg:py-[88px]">
        <Container>
          <SectionHead id="proiecte-titlu" title="Ce se schimbă pentru tine?" lead="Alege ce te privește. Citește explicația. Propune un amendament cât timp termenul e deschis." />
          <div className="mt-8 space-y-3 border-b border-line pb-5">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,320px)]">
              <label className="relative block">
                <span className="sr-only">Caută după număr, titlu sau comisie</span>
                <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" aria-hidden />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    touched();
                  }}
                  placeholder="Caută: Codul penal, pensii, PL-x 353…"
                  className={`${inputCls} pl-11 pr-4`}
                  autoComplete="off"
                />
              </label>
              <label className="relative block">
                <span className="sr-only">Etapa</span>
                <Landmark className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" aria-hidden />
                <select value={stage ?? ''} onChange={(e) => pickStage((e.target.value || null) as StageKey | null)} className={`${inputCls} appearance-none pl-11 pr-10`}>
                  <option value="">Unde e? Toate etapele</option>
                  {STAGES.filter((st) => scope === 'toate' || CHAMBER.includes(st.key)).map((st) => (
                    <option key={st.key} value={st.key}>
                      {st.label} ({universe.filter((p) => p.stage === st.key).length})
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              </label>
            </div>

            <RiskFilter counts={counts} value={risk} onChange={pickRisk} />

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                {inConsultation > 0 && (
                  <button
                    type="button"
                    aria-pressed={consultOnly}
                    title="Proiecte la care Camera e prima sesizată și oricine poate trimite o propunere, până la termen"
                    onClick={() => {
                      setConsultOnly(!consultOnly);
                      touched();
                    }}
                    {...trackAttrs('camera_filter', { filter: 'consultation', value: consultOnly ? 'off' : 'on' })}
                    className={chipCls(consultOnly)}
                  >
                    <Megaphone className="h-4 w-4" aria-hidden />
                    În consultare publică
                    <span className="font-normal tabular-nums opacity-80">{inConsultation}</span>
                  </button>
                )}
                {openList.length > 0 && (
                  <button
                    type="button"
                    aria-pressed={openOnly || Boolean(day)}
                    onClick={() => {
                      setDay(null);
                      setOpenOnly(!(openOnly || day));
                      touched();
                    }}
                    {...trackAttrs('camera_filter', { filter: 'open_deadline', value: openOnly ? 'off' : 'on' })}
                    className={chipCls(openOnly || Boolean(day))}
                  >
                    <Clock className="h-4 w-4" aria-hidden />
                    Se pot amenda acum
                    <span className="font-normal tabular-nums opacity-80">{openList.length}</span>
                  </button>
                )}
                {fixable > 0 && (
                  <button
                    type="button"
                    aria-pressed={fixOnly}
                    title="Proiecte la care o schimbare punctuală, de exemplu un amendament, ar face legea acceptabilă"
                    onClick={() => {
                      setFixOnly(!fixOnly);
                      touched();
                    }}
                    {...trackAttrs('camera_filter', { filter: 'fixable', value: fixOnly ? 'off' : 'on' })}
                    className={chipCls(fixOnly)}
                  >
                    <Wrench className="h-4 w-4" aria-hidden />
                    Se pot repara
                    <span className="font-normal tabular-nums opacity-80">{fixable}</span>
                  </button>
                )}
                {(
                  [
                    ['mai_riscant', 'Mai riscante pe drum', worse.length, ArrowUpRight],
                    ['mai_putin_riscant', 'Îmblânzite pe drum', better.length, ArrowDownRight],
                  ] as const
                ).map(
                  ([k, label, total, Icon]) =>
                    total > 0 && (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={drum === k}
                        onClick={() => {
                          setDrum(drum === k ? null : k);
                          touched();
                        }}
                        {...trackAttrs('camera_filter', { filter: 'text_change', value: k })}
                        className={chipCls(drum === k)}
                      >
                        <Icon className="h-4 w-4" aria-hidden />
                        {label}
                        <span className="font-normal tabular-nums opacity-80">{total}</span>
                      </button>
                    ),
                )}
              </div>
              <label className="flex items-center gap-2 text-sm text-muted">
                Ordine:
                <span className="relative">
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as Sort)}
                    className="h-10 appearance-none rounded-lg border border-line bg-surface pl-3 pr-9 text-sm font-semibold text-ink focus:border-brand focus:outline-none"
                  >
                    {SORTS.map((st) => (
                      <option key={st.key} value={st.key}>
                        {st.label}
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
              <strong className="font-semibold text-ink">{n(list.length)}</strong> {narrowed || query.trim() ? 'corespund alegerilor tale' : where}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {active
                .filter((f) => !['risc', 'termen', 'reparabile', 'consultare', 'drum', 'q'].includes(f.key))
                .map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => {
                      f.clear();
                      touched();
                    }}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-brand-soft px-3 text-xs font-semibold text-ink"
                  >
                    {f.label}
                    <X className="h-3.5 w-3.5" aria-hidden />
                    <span className="sr-only">(scoate filtrul)</span>
                  </button>
                ))}
              {active.some((f) => f.key !== 'domeniu') && (
                <button type="button" onClick={reset} className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-link underline underline-offset-4">
                  Șterge filtrele
                </button>
              )}
            </div>
          </div>

          {list.length === 0 ? (
            <EmptyState
              title="Niciun proiect nu se potrivește"
              text="Încearcă un singur cuvânt din titlu, numărul fără „PL-x” sau toate proiectele din an."
              action={
                <button type="button" onClick={reset} className={`${btnSecondary} min-h-11 px-5 text-sm`}>
                  <X className="h-4 w-4" aria-hidden />
                  Arată toate proiectele
                </button>
              }
            />
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {list.slice(0, shown).map((p) => (
                  <CameraCard key={p.slug} p={p} today={today} withPage={withPage} />
                ))}
              </div>
              <div className="mt-8 flex flex-col items-center justify-between gap-4 sm:flex-row">
                <p className="text-sm tabular-nums text-muted">
                  Afișate {shown} din {list.length}
                </p>
                {shown < list.length && (
                  <button type="button" onClick={() => setVisible((v) => v + PAGE)} className={`${btnSecondary} min-h-12 px-5 text-sm`}>
                    Arată încă {initialRows(list.length, visible + PAGE) - shown} proiecte
                    <ChevronDown className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </div>
            </>
          )}
        </Container>
      </section>

      <Section id="etape">
        <SectionHeading id="etape-titlu" title={`${shareWords(atCommittee, here.length)} stau încă la comisii`}>
          Un proiect trece întâi pe la comisii, care scriu raportul, apoi intră pe ordinea de zi, la vot. Apasă pe o etapă ca să vezi în listă doar
          proiectele ei.
        </SectionHeading>
        <StagePath list={here} stage={stage} risk={risk} onStage={pickStage} />
        <OutsideLine items={items} stage={stage} onStage={pickStage} />
      </Section>

      <Section id="cronologie">
        <SectionHeading id="cronologie-titlu" title="Ce a intrat și ce urmează">
          Înapoi: lunile în care au fost înregistrate proiectele. Înainte: termenele pentru amendamente din zilele următoare.
        </SectionHeading>
        <Timeline
          list={universe}
          today={today}
          withPage={withPage}
          month={month}
          day={day}
          onMonth={pickMonth}
          onDay={pickDay}
        />
      </Section>

      <div
        aria-hidden={!showBar}
        className={`fixed inset-x-0 bottom-0 z-30 px-3 pt-2.5 pb-[calc(10px+env(safe-area-inset-bottom))] transition-transform duration-300 ${
          showBar ? '' : 'pointer-events-none translate-y-[110%]'
        }`}
      >
        <div className="mx-auto flex max-w-[720px] items-center gap-3 rounded-[14px] bg-band py-2.5 pr-2.5 pl-4 text-on-band shadow-[0_12px_32px_-10px_rgb(0_0_0/0.45)]">
          <p className="min-w-0 flex-1 text-[14.5px] leading-snug">
            <strong className="font-bold">{n(list.length)}</strong>{' '}
            <span className="text-on-band-muted">· {active.filter((f) => f.key !== 'q').map((f) => f.label).join(' · ')}</span>
          </p>
          <a
            href="#proiecte"
            tabIndex={showBar ? 0 : -1}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[10px] bg-on-band px-3.5 text-[14.5px] font-bold text-band"
          >
            Vezi lista
            <ArrowDown className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </div>
    </>
  );
}
