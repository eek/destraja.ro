'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowDown, ChevronDown, Info, Search, X } from 'lucide-react';
import type { CdepListItem } from '@/lib/cdep';
import type { RiskLevel } from '@/lib/types';
import { RISK } from '@/lib/risk';
import { STAGES, dayDiff, shortCommittee, shortDate, stageLabel, type StageKey } from '@/lib/cdep-text';
import { countWord, fmt, initialRows, normalize, todayISO } from '@/lib/format';
import { trackAttrs } from '@/lib/analytics';
import { Container, EmptyState, btnSecondary, inputCls, linkCls } from '@/components/ui';
import { BillLink, CHAMBER, Glyph, LEVELS, OutsideLine, RiskWaffle, SectionHeading, StagePath, byLevel, longDate, monthLabel, pressable, shareWords } from './CameraOverview';
import { Showcase, TextChange, type ShowcaseEntry, type ShowcaseTab } from './CameraShowcase';
import { Timeline } from './CameraTimeline';

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

  // „Acum” = proiectele aflate la Cameră; „toate” = tot ce s-a înregistrat în an. Distribuția, vitrina și cronologia descriu universul ales.
  const here = useMemo(() => items.filter((p) => CHAMBER.includes(p.stage)), [items]);
  const universe = scope === 'acum' ? here : items;
  const counts = useMemo(() => byLevel(universe), [universe]);
  const rated = LEVELS.reduce((s, l) => s + counts[l], 0);
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
  const byScore = (a: CdepListItem, b: CdepListItem) => (b.risk?.score ?? -1) - (a.risk?.score ?? -1);
  const top = (ps: CdepListItem[], by: (a: CdepListItem, b: CdepListItem) => number) => [...ps].sort(by).slice(0, 6);
  const worse = universe.filter((p) => p.textChange?.direction === 'mai_riscant');
  const better = universe.filter((p) => p.textChange?.direction === 'mai_putin_riscant');
  const openList = universe.filter(open);
  const reds = universe.filter((p) => p.risk?.level === 'red');
  const where = scope === 'acum' ? 'aflate acum la Cameră' : 'înregistrate la Cameră în 2026';
  const n = (k: number) => countWord(k, 'proiect', 'proiecte');
  const showcase: ShowcaseEntry[] = (
    [
      { key: 'risc', label: 'Cele mai riscante', total: reds.length, items: top(reds, byScore), lead: `Au risc ridicat ${n(reds.length)} ${where}. Acestea au scorurile cele mai mari.` },
      {
        key: 'agravate',
        label: 'Mai riscante pe drum',
        total: worse.length,
        items: top(worse, byScore),
        lead: `Comparăm formele prin care trece un proiect: a inițiatorului, a Senatului, a Camerei. La ${n(worse.length)}, forma nouă e mai riscantă decât cea dinainte.${compared ? ` Am comparat până acum ${n(compared)}.` : ''}`,
      },
      {
        key: 'imblanzite',
        label: 'Îmblânzite pe drum',
        total: better.length,
        items: top(better, byScore),
        lead: `La ${n(better.length)}, forma nouă a textului e mai puțin riscantă decât cea dinainte. Scorul arătat e al formei de acum.`,
      },
      {
        key: 'termen',
        label: 'Se pot amenda acum',
        total: openList.length,
        items: top(openList, (a, b) => a.termenAmendamente!.localeCompare(b.termenAmendamente!) || byScore(a, b)),
        lead: `La ${n(openList.length)}, termenul pentru amendamente e încă deschis. Cele mai apropiate termene sunt primele.`,
      },
    ] satisfies ShowcaseEntry[]
  ).filter((t) => t.items.length);
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
  const active: { key: string; label: string; level?: RiskLevel; clear: () => void }[] = [
    scope === 'toate' && { key: 'domeniu', label: 'Toate din 2026', clear: () => pickScope('acum') },
    stage && { key: 'etapa', label: stageLabel(stage), clear: () => setStage(null) },
    risk && { key: 'risc', label: RISK[risk].label, level: risk, clear: () => setRisk(null) },
    drum && { key: 'drum', label: drum === 'mai_riscant' ? 'Mai riscante pe drum' : 'Îmblânzite pe drum', clear: () => setDrum(null) },
    month && { key: 'luna', label: `Înregistrate în ${monthLabel(month)}`, clear: () => setMonth(null) },
    day && { key: 'zi', label: `Amendamente până pe ${shortDate(day)}`, clear: () => setDay(null) },
    !day && openOnly && { key: 'termen', label: 'Termen de amendamente deschis', clear: () => setOpenOnly(false) },
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
  const sortInfo = SORTS.find((s) => s.key === sort)!;

  const scopeKey = (e: KeyboardEvent) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const next = scope === 'acum' ? 'toate' : 'acum';
    pickScope(next);
    document.getElementById(`domeniu-${next}`)?.focus();
  };
  const filterBtn = (on: boolean) =>
    `inline-flex min-h-10 items-center gap-2 rounded-[10px] border px-3 text-left text-sm font-semibold ${pressable} ${
      on ? 'border-ink bg-ink text-paper shadow-none' : 'border-line-strong bg-surface text-ink'
    }`;

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
              ? 'Proiectele aflate acum la comisii, cu raport, pe ordinea de zi sau în reexaminare.'
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

      <Section id="etape">
        <SectionHeading id="etape-titlu" title={`${shareWords(atCommittee, here.length)} stau încă la comisii`}>
          Un proiect trece întâi pe la comisii, care scriu raportul, apoi intră pe ordinea de zi, la vot. Apasă pe o etapă ca să vezi în listă doar
          proiectele ei.
        </SectionHeading>
        <StagePath list={here} stage={stage} risk={risk} onStage={pickStage} />
        <OutsideLine items={items} stage={stage} onStage={pickStage} />
      </Section>

      {showcase.length > 0 && (
        <Section id="vitrina">
          <SectionHeading id="vitrina-titlu" title="De văzut întâi">
            Patru liste scurte, alese din cele {n(universe.length)} {where}. Titlurile sunt scrise de noi, pe înțeles; numărul oficial e dedesubt.
          </SectionHeading>
          <Showcase tabs={showcase} today={today} withPage={withPage} onSeeAll={seeAll} />
        </Section>
      )}

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

      <section id="proiecte" ref={listRef} aria-labelledby="proiecte-titlu" className="scroll-mt-20 border-t border-line py-14 lg:py-[88px]">
        <Container>
          <SectionHeading id="proiecte-titlu" title={`Toate proiectele, ${sortInfo.title}`}>
            Filtrele alese mai sus se văd aici și le poți scoate oricând.
          </SectionHeading>
          <div className="grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start lg:gap-14">
            <div className="lg:sticky lg:top-24">
              <label className="block">
                <span className="mb-2 block font-semibold text-ink">Caută după număr, titlu sau comisie</span>
                <span className="relative block">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" aria-hidden />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      touched();
                    }}
                    placeholder="ex.: Codul penal, PL-x 353"
                    className={`${inputCls} pl-11 pr-4`}
                    autoComplete="off"
                  />
                </span>
              </label>

              <div role="group" aria-labelledby="restrange" className="mt-6">
                <p id="restrange" className="font-semibold text-ink">
                  Restrânge
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-pressed={openOnly || Boolean(day)}
                    onClick={() => {
                      setDay(null);
                      setOpenOnly(!(openOnly || day));
                      touched();
                    }}
                    {...trackAttrs('camera_filter', { filter: 'open_deadline', value: openOnly ? 'off' : 'on' })}
                    className={filterBtn(openOnly || Boolean(day))}
                  >
                    Termen de amendamente deschis
                    <span className="font-medium tabular-nums opacity-75">{openList.length}</span>
                  </button>
                  {(
                    [
                      ['mai_riscant', 'Mai riscante pe drum', worse.length],
                      ['mai_putin_riscant', 'Îmblânzite pe drum', better.length],
                    ] as const
                  ).map(
                    ([k, label, total]) =>
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
                          className={filterBtn(drum === k)}
                        >
                          {label}
                          <span className="font-medium tabular-nums opacity-75">{total}</span>
                        </button>
                      ),
                  )}
                </div>
              </div>

              <div className="mt-6">
                <p id="filtre-active" className="font-semibold text-ink">
                  Filtre active
                </p>
                {active.length ? (
                  <div role="group" aria-labelledby="filtre-active" className="mt-2.5 flex flex-wrap items-center gap-2">
                    {active.map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => {
                          f.clear();
                          touched();
                        }}
                        className={`inline-flex min-h-10 items-center gap-2 rounded-full border border-line-strong bg-surface pl-3 pr-2.5 text-sm font-semibold text-ink ${pressable}`}
                      >
                        {f.level && <Glyph level={f.level} />}
                        {f.label}
                        <X className="h-4 w-4 text-muted" aria-hidden />
                        <span className="sr-only">(scoate filtrul)</span>
                      </button>
                    ))}
                    {active.length > 1 && (
                      <button type="button" onClick={reset} className="min-h-10 px-1 text-sm font-semibold text-link underline underline-offset-4">
                        Șterge filtrele
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">Niciunul. Apasă pe o culoare, pe o etapă sau pe o lună, mai sus, ca să restrângi lista.</p>
                )}
              </div>

              <p role="status" aria-live="polite" className="mt-6 border-t border-line pt-5 text-[17px] leading-snug text-ink">
                <span className="mb-1.5 block font-display text-[2.4rem] font-semibold leading-none tracking-[-0.02em] tabular-nums">{list.length}</span>
                {countWord(list.length, 'proiect', 'proiecte').replace(/^\d+ /, '')} {active.length ? 'corespund filtrelor' : where}
              </p>
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-strong pb-3">
                <p className="text-sm tabular-nums text-muted">
                  Afișate {shown} din {list.length}
                </p>
                <label className="flex items-center gap-2 text-sm text-muted">
                  <span>Ordine:</span>
                  <span className="relative">
                    <select
                      value={sort}
                      onChange={(e) => setSort(e.target.value as Sort)}
                      className={`min-h-10 appearance-none rounded-[10px] border border-line-strong bg-surface py-1 pl-3 pr-9 text-sm font-semibold text-ink ${pressable}`}
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

              {list.length === 0 ? (
                <div className="mt-6">
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
                </div>
              ) : (
                <>
                  <ol>
                    {list.slice(0, shown).map((p) => (
                      <BillRow key={p.slug} p={p} today={today} withPage={withPage} />
                    ))}
                  </ol>
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
          </div>
        </Container>
      </section>

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

/** Un rând din listă: scorul la stânga, titlul pe înțeles, titlul oficial și unde e proiectul. */
function BillRow({ p, today, withPage }: { p: CdepListItem; today: string; withPage: Set<string> }) {
  const days = p.termenAmendamente ? dayDiff(p.termenAmendamente, today) : null;
  const where = [p.numar, stageLabel(p.stage), `înregistrat pe ${longDate(p.inregistrat)}`].join(' · ');
  return (
    <li className="grid grid-cols-[74px_minmax(0,1fr)] gap-3.5 border-b border-line py-[22px] md:grid-cols-[96px_minmax(0,1fr)] md:gap-6 md:py-[26px]">
      <div>
        {p.risk ? (
          <>
            <p className="font-display text-[1.85rem] font-semibold leading-none tabular-nums text-ink">{fmt(p.risk.score)}</p>
            <p className={`mt-2 flex items-center gap-1.5 text-[13px] font-semibold ${RISK[p.risk.level].text}`}>
              <Glyph level={p.risk.level} />
              {RISK[p.risk.level].short}
            </p>
          </>
        ) : (
          <p className="text-[13px] leading-snug text-muted">fără scor încă</p>
        )}
      </div>
      <div className="min-w-0">
        <h3 className="font-display text-xl font-semibold leading-[1.3] md:text-[1.38rem]">
          <BillLink p={p} withPage={withPage} className="text-ink no-underline decoration-2 underline-offset-4 hover:underline">
            {p.risk?.plainTitle ?? p.titlu}
          </BillLink>
        </h3>
        {p.risk && (
          <p title={p.titlu} className="mt-1.5 line-clamp-2 text-[14.5px] leading-normal text-muted md:line-clamp-none">
            Titlul oficial: „{p.titlu.replace(/^„|”$/g, '')}”
          </p>
        )}
        {p.textChange && (
          <p className="mt-2.5 text-sm">
            <TextChange p={p} />
          </p>
        )}
        <p className="mt-1.5 text-sm leading-normal text-muted tabular-nums">{where}</p>
        {(p.raport.length > 0 || (CHAMBER.includes(p.stage) && days !== null)) && (
          <p className="mt-0.5 text-sm leading-normal text-muted">
            {p.raport.length > 0 && `Raportul: ${p.raport.map(shortCommittee).join(', ')}`}
            {p.raport.length > 0 && CHAMBER.includes(p.stage) && days !== null && ' · '}
            {CHAMBER.includes(p.stage) &&
              days !== null &&
              (days >= 0 ? (
                <strong className={`font-semibold ${days <= 1 ? 'text-risk-red-text' : 'text-ink'}`}>
                  {days === 0 ? 'amendamente: ultima zi azi' : days === 1 ? 'amendamente: ultima zi mâine' : `amendamente până pe ${longDate(p.termenAmendamente!)}`}
                </strong>
              ) : (
                `amendamente închise pe ${longDate(p.termenAmendamente!)}`
              ))}
          </p>
        )}
      </div>
    </li>
  );
}
