'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Megaphone, MessageCircle, PenLine } from 'lucide-react';
import type { BillLite, RiskLevel } from '@/lib/types';
import { RISK, RISK_LEVELS } from '@/lib/risk';
import { addDays, countWord, fmt } from '@/lib/format';
import { dayDiff, shortDate } from '@/lib/cdep-text';
import { riskCounts } from '@/lib/stats';
import { useLiveBills, useToday } from '@/lib/useLiveBills';
import { trackAttrs } from '@/lib/analytics';
import { ALERTS_LIVE } from '@/lib/site';
import { TowerIcon } from '@/components/Logo';
import { Container, btnSecondary, linkCls } from '@/components/ui';
import { WorstLine } from '@/components/bills/BalanceBlock';
import VillageHero from './sat/VillageHero';

/** Un proiect aflat acum la Cameră, cu ce arată pagina principală despre el. */
export type HomeCamItem = {
  slug: string;
  numar: string;
  title: string;
  level: RiskLevel;
  score: number;
  stage: string;
  /** Termenul pentru amendamente (YYYY-MM-DD). */
  deadline: string | null;
  change: 'mai_riscant' | 'mai_putin_riscant' | null;
  after: 'senat' | 'camera' | null;
  /** Problema principală din text (scripts/straja-balance.mjs), dacă e analizată. */
  bad: string | null;
  /** Termenul consultării publice de la Cameră (YYYY-MM-DD), când Camera e prima sesizată. */
  consult: string | null;
};

export type HomePress = { url: string; title: string; outlet: string; date: string | null; billId: string; slug: string; plainTitle: string };

type Cam = {
  total: number;
  registered: number;
  counts: Record<RiskLevel, number>;
  amend: HomeCamItem[];
  /** Proiectele în consultare publică la Cameră, după termen. */
  consult: HomeCamItem[];
  riskiest: HomeCamItem[];
  worse: HomeCamItem[];
  worseCount: number;
  compared: number;
};

/** Un rând din listele paginii: un proiect de la Senat sau de la Cameră. */
type Item = { ch: 'sen' | 'cam'; href: string; numar: string; title: string; level: RiskLevel; score: number; note: string; bad?: string | null; cam?: HomeCamItem };

// Ancorele fostei pagini principale (linkuri din e-mailuri și de pe Facebook) duc acum pe /senat.
const OLD_ANCHORS = ['#legi', '#cine-propune', '#aviz-ces'];

const longDate = (iso: string) => new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
const weekday = (iso: string) => new Intl.DateTimeFormat('ro-RO', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
/** senat.ro scrie termenele ZZ-LL-AAAA. */
const isoFromRo = (d: string) => d.replace(/^(\d{2})-(\d{2})-(\d{4})$/, '$3-$2-$1');
const byScore = (a: { score: number }, b: { score: number }) => b.score - a.score;
/** „proiecte”, „de proiecte” sau „proiect”, fără număr: numărul stă mare, separat. */
const unit = (n: number) => countWord(n, 'proiect', 'proiecte').replace(/^\d+ /, '');

function RiskGlyph({ level, className = 'h-3 w-3' }: { level: RiskLevel; className?: string }) {
  const shape = level === 'red' ? '[clip-path:polygon(50%_2%,100%_96%,0_96%)]' : level === 'yellow' ? '[clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]' : 'scale-[.86] rounded-full';
  return <span aria-hidden className={`inline-block shrink-0 ${RISK[level].fill} ${shape} ${className}`} />;
}

function RiskMix({ counts }: { counts: Record<RiskLevel, number> }) {
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-[14.5px] tabular-nums text-body">
      {RISK_LEVELS.map((l) => (
        <span key={l} className="inline-flex items-center gap-1.5">
          <RiskGlyph level={l} />
          <b className="font-semibold text-ink">{counts[l]}</b> {RISK[l].short}
        </span>
      ))}
    </p>
  );
}

/** Linia roșu/galben/verde: lungimile urmează numărul de proiecte, iar un singur proiect tot se vede. */
function RiskLine({ counts }: { counts: Record<RiskLevel, number> }) {
  return (
    <div aria-hidden className="flex h-2.5 gap-[3px] overflow-hidden rounded-full">
      {RISK_LEVELS.filter((l) => counts[l] > 0).map((l) => (
        <span key={l} className={`${RISK[l].fill} min-w-2 first:rounded-l-full last:rounded-r-full`} style={{ flexGrow: counts[l] }} />
      ))}
    </div>
  );
}

function Door({ href, title, state, n, what, counts, next, cta, track }: { href: string; title: string; state: string; n: number; what: string; counts: Record<RiskLevel, number>; next: string; cta: string; track: string }) {
  return (
    <Link
      href={href}
      {...trackAttrs('home_door', { to: track })}
      className="group grid content-start gap-3.5 rounded-[18px] border border-line-strong bg-surface p-5 shadow-card transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-muted hover:shadow-lift sm:p-6"
    >
      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h2 className="font-display text-[1.65rem] font-semibold leading-tight text-ink">{title}</h2>
        <span className="text-sm font-semibold text-muted">{state}</span>
      </span>
      <p className="text-[16.5px] leading-snug text-body">
        <b className="mr-1.5 align-[-3px] font-display text-[2.6rem] font-semibold leading-none tracking-[-0.02em] text-ink tabular-nums">{n}</b>
        {what}
      </p>
      <RiskLine counts={counts} />
      <RiskMix counts={counts} />
      <p className="text-[15px] font-semibold text-ink">{next}</p>
      <span className="mt-1 inline-flex min-h-11 items-center gap-2 justify-self-start rounded-[10px] bg-brand px-4 text-[15px] font-semibold text-on-brand transition-colors group-hover:bg-brand-hover">
        {cta}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </span>
    </Link>
  );
}

function SectionHead({ id, title, children }: { id: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8 grid gap-3 lg:mb-11 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-end lg:gap-14">
      <h2 id={id} className="font-display text-[clamp(1.95rem,4.2vw,3rem)] font-medium leading-[1.06] tracking-[-0.022em] text-ink">
        {title}
      </h2>
      {children && <p className="max-w-[58ch] text-[17px] leading-relaxed text-body">{children}</p>}
    </div>
  );
}

function ItemRow({ p }: { p: Item }) {
  return (
    <li className="grid grid-cols-[54px_minmax(0,1fr)] gap-3 border-b border-line py-2.5">
      <span className="flex items-center gap-1.5 text-[15px] font-semibold tabular-nums text-ink">
        <RiskGlyph level={p.level} />
        {fmt(p.score)}
      </span>
      <span>
        <Link href={p.href} className="text-[15.5px] leading-snug text-ink hover:underline">
          {p.title}
        </Link>
        <span className="mt-0.5 block text-[13px] text-muted">
          {p.numar} · {RISK[p.level].label.toLowerCase()}
          {p.note && <strong className="font-semibold text-ink"> · {p.note}</strong>}
        </span>
      </span>
    </li>
  );
}

/** Ce se închide într-o zi, la o cameră. */
type Block = { ch: 'sen' | 'cam' | 'camc'; items: Item[] };
const BLOCK_ORDER = { cam: 0, camc: 1, sen: 2 } as const;
/** O zi din cronologie, cu termenele ambelor camere; „later” adună consultările care se închid mai târziu. */
type Ev = { key: string; date: string; blocks: Block[]; later?: string };

function EventBlock({ b, left, later, date }: { b: Block; left: number; later: boolean; date: string }) {
  const show = later ? 5 : 3;
  const reds = b.items.filter((p) => p.level === 'red').length;
  return (
    <div className="[&+&]:mt-7">
      <p className="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2.5 py-0.5 text-[13.5px] font-bold text-ink">
        {b.ch === 'cam' ? (
          <PenLine className="h-[15px] w-[15px]" aria-hidden />
        ) : b.ch === 'camc' ? (
          <Megaphone className="h-[15px] w-[15px]" aria-hidden />
        ) : (
          <MessageCircle className="h-[15px] w-[15px]" aria-hidden />
        )}
        {b.ch === 'cam' ? 'Cameră · amendamente' : b.ch === 'camc' ? 'Cameră · consultare publică' : 'Senat · consultare publică'}
      </p>
      <h3 className="mt-2 text-[16.5px] leading-snug text-body">
        {later ? (
          `${countWord(b.items.length, 'consultare a Senatului rămâne deschisă', 'consultări ale Senatului rămân deschise')} mai mult. Cele mai riscante:`
        ) : b.ch !== 'cam' ? (
          'Se închide consultarea publică pentru:'
        ) : (
          <>
            <b className="font-bold text-ink">{countWord(b.items.length, 'proiect', 'proiecte')}</b>{' '}
            {left === 0 ? (b.items.length === 1 ? 'are azi ultima zi pentru amendamente' : 'au azi ultima zi pentru amendamente') : 'se mai pot amenda până atunci'}
            {reds > 0 && `, dintre care ${reds} cu risc ridicat`}.
          </>
        )}
      </h3>
      <ul className="mt-1.5 border-t border-line">
        {b.items.slice(0, show).map((p) => (
          <ItemRow key={p.href} p={p} />
        ))}
      </ul>
      {b.items.length > show && (
        <Link href={b.ch === 'cam' ? `/camera?termen=${date}` : '/senat#legi'} className={`${linkCls} mt-2.5 inline-flex min-h-10 items-center gap-1.5 text-[15px]`}>
          Și încă {countWord(b.items.length - show, 'proiect', 'proiecte')} {b.ch === 'cam' ? 'la Cameră' : 'la Senat'}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}

function Event({ e, today }: { e: Ev; today: string }) {
  const left = dayDiff(e.date, today);
  const now = !e.later && left === 0;
  return (
    <li className="relative grid grid-cols-[20px_minmax(0,1fr)] gap-x-4 pb-9 last:pb-0 md:grid-cols-[20px_168px_minmax(0,1fr)] md:gap-x-6">
      <span aria-hidden className="absolute top-[22px] -bottom-1 left-[9px] w-0.5 bg-line-strong [li:last-child>&]:hidden" />
      <span
        aria-hidden
        className={`relative z-[1] mt-1.5 h-5 w-5 rounded-full border-2 ${now ? 'border-risk-red bg-risk-red shadow-[0_0_0_4px_var(--color-risk-red-soft)]' : 'border-ink bg-paper'}`}
      />
      <div className="col-start-2 mb-2.5 md:mb-0">
        <p className="inline font-display text-[1.7rem] font-semibold leading-tight text-ink md:block">
          {e.later ? 'Mai târziu' : left === 0 ? 'Azi' : left === 1 ? 'Mâine' : shortDate(e.date)}
        </p>
        <p className="ml-2.5 inline text-sm text-muted md:mt-0.5 md:ml-0 md:block">{e.later ?? `${weekday(e.date)}, ${longDate(e.date)}`}</p>
        {!e.later && (
          <span className={`mt-2 block w-max rounded-full px-2.5 py-0.5 text-[13px] font-bold ${now ? 'bg-risk-red-soft text-risk-red-text' : 'bg-sunken text-ink'}`}>
            {left === 0 ? 'ultima zi' : left === 1 ? 'încă o zi' : `peste ${countWord(left, 'zi', 'zile')}`}
          </span>
        )}
      </div>
      <div className="col-start-2 min-w-0 md:col-start-3 md:row-start-1">
        {e.blocks.map((b) => (
          <EventBlock key={b.ch} b={b} left={left} later={Boolean(e.later)} date={e.date} />
        ))}
      </div>
    </li>
  );
}

function Meter({ p }: { p: Item }) {
  const x = Math.max(0, Math.min(10, p.score)) * 10;
  return (
    <div role="img" aria-label={`Scor ${fmt(p.score)} din 10, ${RISK[p.level].label.toLowerCase()}`} className="mt-4 max-w-[420px]">
      <div className="relative h-2.5 rounded-full bg-[linear-gradient(90deg,var(--color-risk-green-soft)_0_38%,var(--color-risk-amber-soft)_38%_68%,var(--color-risk-red-soft)_68%_100%)] shadow-[inset_0_0_0_1px_var(--color-line)]">
        <i className="absolute -top-[3px] -bottom-[3px] left-[38%] w-px bg-line-strong" />
        <i className="absolute -top-[3px] -bottom-[3px] left-[68%] w-px bg-line-strong" />
        <span className={`absolute top-1/2 -mt-[9px] -ml-[9px] h-[18px] w-[18px] rounded-full border-[3px] border-surface shadow-[0_0_0_1.5px_var(--color-ink)] ${RISK[p.level].fill}`} style={{ left: `${x}%` }} />
      </div>
      <div aria-hidden className="relative mt-1.5 h-[18px] text-xs tabular-nums text-muted">
        <span className="absolute left-0">0</span>
        <span className="absolute left-[38%] -translate-x-1/2">3,8</span>
        <span className="absolute left-[68%] -translate-x-1/2">6,8</span>
        <span className="absolute right-0">10</span>
      </div>
    </div>
  );
}

function Where({ p }: { p: Item }) {
  const c = p.cam;
  return (
    <p className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-sm text-muted">
      {c?.change && (
        <span className={`inline-flex items-center gap-1 font-semibold ${c.change === 'mai_riscant' ? 'text-risk-red-text' : 'text-risk-green-text'}`}>
          {c.change === 'mai_riscant' && <ArrowUpRight className="h-4 w-4" aria-hidden />}
          {c.change === 'mai_riscant' ? 'Mai riscant' : 'Mai puțin riscant'} după {c.after === 'senat' ? 'Senat' : 'Cameră'}
        </span>
      )}
      <span className="font-semibold text-ink">{p.ch === 'sen' ? 'Senat' : 'Cameră'}</span>
      <span className="tabular-nums">{p.numar}</span>
      <span>{p.note}</span>
    </p>
  );
}

function WatchItem({ p }: { p: Item }) {
  return (
    <li className="grid grid-cols-[74px_minmax(0,1fr)] gap-3.5 border-b border-line py-4">
      <div>
        <div className="font-display text-[1.6rem] font-semibold leading-none tabular-nums text-ink">{fmt(p.score)}</div>
        <div className={`mt-2 flex items-center gap-1.5 text-[13px] font-semibold ${RISK[p.level].text}`}>
          <RiskGlyph level={p.level} />
          {RISK[p.level].short}
        </div>
      </div>
      <div>
        <h4 className="font-display text-[1.15rem] font-semibold leading-snug text-ink">
          <Link href={p.href} className="hover:underline hover:decoration-2">
            {p.title}
          </Link>
        </h4>
        <Where p={p} />
        <WorstLine text={p.bad} className="mt-2" />
      </div>
    </li>
  );
}

const camItem = (c: HomeCamItem, note: string): Item => ({ ch: 'cam', href: `/camera/${c.slug}`, numar: c.numar, title: c.title, level: c.level, score: c.score, note, bad: c.bad, cam: c });

export default function HomeClient({
  bills: initial,
  builtOn,
  syncedLabel,
  mpCount,
  cam,
  press,
}: {
  bills: BillLite[];
  builtOn: string;
  syncedLabel: string | null;
  mpCount: number;
  cam: Cam;
  press: { total: number; latest: HomePress[] };
}) {
  const bills = useLiveBills(initial);
  const today = useToday(builtOn);
  const counts = useMemo(() => riskCounts(bills), [bills]);

  useEffect(() => {
    if (OLD_ANCHORS.includes(location.hash)) location.replace(`/senat${location.hash}`);
  }, []);

  // Senatul: consultările încă deschise azi, de la cea care se închide prima.
  const senOpen = useMemo(
    () =>
      bills
        .filter((b) => b.daysRemaining >= 0)
        .map((b) => ({ b, date: isoFromRo(b.consultationDeadline) }))
        .sort((x, y) => x.date.localeCompare(y.date) || y.b.analysis.consensus.riskScore - x.b.analysis.consensus.riskScore),
    [bills],
  );
  const senItem = (b: BillLite, note: string): Item => ({
    ch: 'sen',
    href: `/legi/${b.slug}`,
    numar: b.id,
    title: b.analysis.consensus.plainTitle,
    level: b.analysis.consensus.riskLevel,
    score: b.analysis.consensus.riskScore,
    note,
    bad: b.balance?.worst ?? null,
  });
  const senCounts = useMemo(() => {
    const c: Record<RiskLevel, number> = { red: 0, yellow: 0, green: 0 };
    for (const { b } of senOpen) c[b.analysis.consensus.riskLevel] += 1;
    return c;
  }, [senOpen]);
  const amend = cam.amend.filter((p) => dayDiff(p.deadline!, today) >= 0);
  const consult = cam.consult.filter((p) => dayDiff(p.consult!, today) >= 0);
  const lastCam = [amend.at(-1)?.deadline, consult.at(-1)?.consult].filter(Boolean).sort().at(-1) ?? null;

  // Unde poți interveni: termenele Camerei pe zile, consultările Senatului care se închid până atunci (sau în 7 zile), apoi restul.
  const events = useMemo(() => {
    const limit = [lastCam ?? today, addDays(today, 7)].sort().at(-1)!;
    const evs: Ev[] = [];
    const group = (ch: Block['ch'], date: string, item: Item) => {
      let e = evs.find((x) => x.date === date);
      if (!e) evs.push((e = { key: date, date, blocks: [] }));
      const b = e.blocks.find((x) => x.ch === ch);
      if (b) b.items.push(item);
      else e.blocks.push({ ch, items: [item] });
    };
    for (const p of amend) group('cam', p.deadline!, camItem(p, ''));
    for (const p of consult) group('camc', p.consult!, { ...camItem(p, ''), href: `/camera/${p.slug}#consultare` });
    const later: { b: BillLite; date: string }[] = [];
    for (const s of senOpen) {
      if (s.date <= limit) group('sen', s.date, senItem(s.b, ''));
      else later.push(s);
    }
    for (const e of evs) {
      e.blocks.sort((a, b) => BLOCK_ORDER[a.ch] - BLOCK_ORDER[b.ch]);
      for (const b of e.blocks) b.items.sort(byScore);
    }
    evs.sort((a, b) => a.date.localeCompare(b.date));
    if (later.length) {
      const last = later.at(-1)!.date;
      evs.push({
        key: 'later',
        date: last,
        later: `până pe ${longDate(last)}`,
        blocks: [{ ch: 'sen', items: later.map((s) => senItem(s.b, `până pe ${longDate(s.date)}`)).sort(byScore) }],
      });
    }
    return evs;
    // senItem e o funcție simplă, fără stare.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amend.length, consult.length, lastCam, senOpen, today]);

  // Banda de azi: ce se închide azi sau mâine.
  const todayCam = amend.filter((p) => p.deadline === today).length;
  const senToday = senOpen.filter((s) => s.date === today);
  const senTomorrow = senOpen.filter((s) => dayDiff(s.date, today) === 1);
  const which = (list: { b: BillLite }[]) => (list.length === 1 ? list[0].b.id : countWord(list.length, 'proiect', 'proiecte'));
  const bits = [
    todayCam > 0 && `E ultima zi pentru amendamente la ${countWord(todayCam, 'proiect', 'proiecte')} de la Cameră.`,
    senToday.length > 0 && `Azi se închide consultarea Senatului pentru ${which(senToday)}.`,
    senTomorrow.length > 0 && `Mâine se închide consultarea Senatului pentru ${which(senTomorrow)}.`,
  ].filter(Boolean);
  const nextEv = events.find((e) => !e.later);

  // Ce merită urmărit: cele mai mari scoruri din ambele camere.
  const both = [...cam.riskiest.map((c) => camItem(c, c.stage)), ...senOpen.map((s) => senItem(s.b, `consultare deschisă până pe ${longDate(s.date)}`))].sort(byScore);
  const lead = both[0];
  const worse = cam.worse.map((c) => camItem(c, c.stage));

  return (
    <>
      <section aria-labelledby="hero-title">
        <Container className="grid items-center gap-10 pt-10 pb-8 sm:pt-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14 lg:pt-20 lg:pb-12">
          <div>
            <h1 id="hero-title" className="font-display text-[clamp(2.7rem,6vw,4.4rem)] font-normal leading-[1.02] tracking-[-0.03em]">
              <span className="block text-muted">Stăm de strajă.</span>
              <span className="block font-medium text-ink">Să știi ce se pregătește.</span>
            </h1>
            <p className="mt-6 max-w-[42ch] text-[clamp(1.12rem,1.9vw,1.3rem)] leading-relaxed text-body">
              Urmărim proiectele de lege din Senat și din Camera Deputaților și le explicăm pe înțelesul tuturor. Fiecare primește un scor de risc, ca să vezi repede ce
              merită atenția ta și unde mai poți interveni.
            </p>
            <div className="mt-7 flex max-w-[46ch] items-start gap-3 border-t border-line pt-4">
              <TowerIcon className="mt-0.5 h-7 w-auto shrink-0 text-ink" />
              <p className="text-sm leading-6 text-muted">
                Fiecare proiect e citit de <strong className="font-semibold text-ink">Gemini, Claude și ChatGPT</strong>, cu scorul fiecăruia la vedere.
                {syncedLabel && ` Date de pe senat.ro și cdep.ro, preluate la ${syncedLabel}.`}{' '}
                <Link href="/metodologie" className="font-semibold text-link underline underline-offset-4">
                  Cum citești scorul
                </Link>
              </p>
            </div>
          </div>
          <VillageHero bills={bills} counts={counts} />
        </Container>
        <Container className="grid gap-4 pb-12 sm:pb-16 md:grid-cols-2 lg:gap-6">
          <Door
            href="/senat"
            track="senat"
            title="Senatul"
            state="consultare publică"
            n={senOpen.length}
            what={`${unit(senOpen.length)} în consultare, unde oricine poate trimite o opinie.`}
            counts={senCounts}
            next={
              senOpen[0]
                ? `Prima consultare se închide ${dayDiff(senOpen[0].date, today) === 0 ? 'azi,' : dayDiff(senOpen[0].date, today) === 1 ? 'mâine,' : 'pe'} ${longDate(senOpen[0].date)}.`
                : 'Nicio consultare deschisă acum.'
            }
            cta="Vezi consultările"
          />
          <Door
            href="/camera"
            track="camera"
            title="Camera Deputaților"
            state="în dezbatere"
            n={cam.total}
            what={`${unit(cam.total)} în dezbatere. Camera are ultimul cuvânt pentru majoritatea legilor.`}
            counts={cam.counts}
            next={
              amend.length
                ? `${countWord(amend.length, 'proiect se mai poate', 'proiecte se mai pot')} amenda în următoarele ${countWord(dayDiff(lastCam!, today), 'zi', 'zile')}.`
                : 'Niciun termen de amendamente deschis acum.'
            }
            cta="Vezi ce se dezbate"
          />
        </Container>
      </section>

      <div role="region" aria-label="Azi" className="bg-band text-on-band">
        <Container className="grid gap-2.5 py-5 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center md:gap-7">
          <p className="font-display text-[1.35rem] font-semibold whitespace-nowrap">
            Azi, {weekday(today)} {longDate(today)}
          </p>
          <p className="text-base leading-relaxed">
            {bits.length
              ? bits.join(' ')
              : nextEv
                ? `Următorul termen: ${weekday(nextEv.date)}, ${longDate(nextEv.date)}, ${nextEv.blocks[0].ch === 'cam' ? 'pentru amendamente la Cameră' : 'pentru consultarea Senatului'}.`
                : 'Niciun termen deschis acum.'}{' '}
            <span className="text-on-band-muted">Fiecare termen ratat e o șansă mai puțin să schimbi textul.</span>
          </p>
          <a href="#interveni" className="inline-flex min-h-11 items-center gap-2 font-bold whitespace-nowrap underline decoration-on-band-muted underline-offset-[5px]">
            Vezi termenele
            <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
        </Container>
      </div>

      <section id="interveni" aria-labelledby="interveni-title" className="scroll-mt-20 py-14 lg:py-22">
        <Container>
          <SectionHead id="interveni-title" title="Unde poți interveni acum">
            Termenele care se închid primele, la Senat și la Cameră. Cu cât e mai aproape termenul, cu atât e mai sus.
          </SectionHead>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)] lg:items-start lg:gap-14">
            <ol>
              {events.map((e) => (
                <Event key={e.key} e={e} today={today} />
              ))}
            </ol>
            <aside aria-labelledby="cum-intervii" className="grid gap-5 rounded-[18px] bg-sunken p-6 lg:sticky lg:top-24">
              <h3 id="cum-intervii" className="font-display text-[1.35rem] font-semibold text-ink">
                Cum intervii
              </h3>
              <div>
                <h4 className="text-[15.5px] font-bold text-ink">La Senat: consultarea publică</h4>
                <p className="mt-1 text-[15px] leading-relaxed text-body">
                  Oricine poate trimite o opinie cât timp consultarea e deschisă. Pe pagina proiectului găsești textul gata făcut pentru formularul Senatului și un memoriu .docx.
                </p>
              </div>
              <div>
                <h4 className="text-[15.5px] font-bold text-ink">La Cameră: consultarea publică</h4>
                <p className="mt-1 text-[15px] leading-relaxed text-body">
                  Când Camera e prima care dezbate un proiect, oricine poate trimite o propunere până la termen, printr-un formular de pe cdep.ro. Butonul e pe pagina proiectului.
                </p>
              </div>
              <div>
                <h4 className="text-[15.5px] font-bold text-ink">La Cameră: amendamentele</h4>
                <p className="mt-1 text-[15px] leading-relaxed text-body">
                  Amendamentele le depun deputații, în comisia care face raportul. Pe pagina proiectului vezi comisia și le poți scrie deputaților din ea.
                </p>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <Link href="/senat#legi" className={`${btnSecondary} min-h-11 px-4 text-[15px]`}>
                  Consultările Senatului
                </Link>
                <Link href="/camera?termen=deschis" className={`${btnSecondary} min-h-11 px-4 text-[15px]`}>
                  Termenele Camerei
                </Link>
              </div>
            </aside>
          </div>
        </Container>
      </section>

      {lead && (
        <section aria-labelledby="urmarit-title" className="border-t border-line py-14 lg:py-22">
          <Container>
            <SectionHead id="urmarit-title" title="Ce merită urmărit">
              Cele mai mari scoruri de risc din Parlament și proiectele al căror text s-a înrăutățit de la o formă la alta. Scorul nu e un verdict juridic: arată unde merită
              să citești cu atenție.
            </SectionHead>
            <div className="grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16">
              <div>
                <h3 className="mb-5 border-b-2 border-ink pb-3.5 font-display text-2xl font-semibold text-ink">Cele mai riscante, în ambele camere</h3>
                <article>
                  <div className="flex items-baseline gap-3">
                    <span className="font-display text-[clamp(3.4rem,8vw,4.6rem)] leading-[.9] font-semibold tracking-[-0.03em] text-ink tabular-nums">{fmt(lead.score)}</span>
                    <span className="text-[15px] text-muted">
                      din 10 ·{' '}
                      <span className={`inline-flex items-center gap-1 font-semibold ${RISK[lead.level].text}`}>
                        <RiskGlyph level={lead.level} /> {RISK[lead.level].label.toLowerCase()}
                      </span>
                    </span>
                  </div>
                  <Meter p={lead} />
                  <h4 className="mt-4 font-display text-[clamp(1.55rem,2.8vw,2.05rem)] leading-[1.16] font-semibold tracking-[-0.015em] text-ink">
                    <Link href={lead.href} className="hover:underline hover:decoration-2">
                      {lead.title}
                    </Link>
                  </h4>
                  <Where p={lead} />
                  <WorstLine text={lead.bad} className="mt-3 max-w-[60ch] text-[15px]" />
                </article>
                <ol className="mt-6 border-t border-line">
                  {both.slice(1, 5).map((p) => (
                    <WatchItem key={p.href} p={p} />
                  ))}
                </ol>
                <p className="mt-4 grid justify-items-start">
                  {senCounts.red > 0 && (
                    <Link href="/senat#legi" className={`${linkCls} inline-flex min-h-11 items-center gap-1.5`}>
                      {senCounts.red === 1 ? 'Cel cu risc ridicat la Senat' : `Cele ${senCounts.red} cu risc ridicat la Senat`}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                  )}
                  <Link href="/camera?risc=ridicat" className={`${linkCls} inline-flex min-h-11 items-center gap-1.5`}>
                    Cele {cam.counts.red} cu risc ridicat la Cameră
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </p>
              </div>
              {worse.length > 0 && (
                <div>
                  <h3 className="mb-5 border-b-2 border-ink pb-3.5 font-display text-2xl font-semibold text-ink">S-au înrăutățit pe drum</h3>
                  <p className="-mt-2 mb-4 text-sm leading-relaxed text-muted">
                    La {countWord(cam.worseCount, 'proiect', 'proiecte')} de la Cameră, forma nouă a textului e mai riscantă decât cea dinainte. Am comparat până acum{' '}
                    {countWord(cam.compared, 'proiect', 'proiecte')}.
                  </p>
                  <ol className="border-t border-line">
                    {worse.map((p) => (
                      <WatchItem key={p.href} p={p} />
                    ))}
                  </ol>
                  <p className="mt-4">
                    <Link href="/camera?drum=mai-riscant" className={`${linkCls} inline-flex min-h-11 items-center gap-1.5`}>
                      Toate cele {cam.worseCount}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </p>
                </div>
              )}
            </div>
          </Container>
        </section>
      )}

      {press.latest.length > 0 && (
        <section aria-labelledby="presa-title" className="border-t border-line py-14 lg:py-22">
          <Container>
            <SectionHead id="presa-title" title="Ce scrie presa">
              {countWord(press.total, 'articol', 'articole')} despre proiectele pe care le urmărim. Cele mai noi:
            </SectionHead>
            <ul className="grid border-t border-line-strong md:grid-cols-2 md:gap-x-12">
              {press.latest.map((a) => (
                <li key={a.url} className="border-b border-line py-5">
                  <h3 className="font-display text-[1.2rem] leading-snug font-semibold text-ink">
                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {a.title}
                    </a>
                  </h3>
                  <p className="mt-2 text-sm text-muted">
                    <b className="font-semibold text-ink">{a.outlet}</b>
                    {a.date && ` · ${longDate(a.date.slice(0, 10))}`}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Despre{' '}
                    <Link href={`/legi/${a.slug}`} className={linkCls}>
                      {a.billId}
                    </Link>
                    : {a.plainTitle}
                  </p>
                </li>
              ))}
            </ul>
            <Link href="/presa" className={`${btnSecondary} mt-6 min-h-11 px-4 text-[15px]`}>
              Toată presa și datele
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Container>
        </section>
      )}

      <section aria-labelledby="cum-title" className="border-t border-line py-14 lg:py-22">
        <Container className="grid gap-12 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:items-start lg:gap-18">
          <div>
            <h2 id="cum-title" className="mb-7 font-display text-[clamp(1.95rem,4.2vw,3rem)] leading-[1.06] font-medium tracking-[-0.022em] text-ink">
              Cum funcționează
            </h2>
            <ol className="border-t border-line-strong">
              {[
                {
                  title: 'Pornim de la documentele oficiale.',
                  text: 'Citim fișele de pe senat.ro și cdep.ro: proiectele aflate în consultare la Senat și pe cele aflate în dezbatere la Cameră. Fiecare analiză duce la sursa oficială, ca să poți verifica.',
                },
                {
                  title: 'Gemini, Claude și ChatGPT citesc fiecare proiect.',
                  text: 'Primești o propoziție pe înțeles și un scor de risc de la 0 la 10, cu nota fiecărui model și locurile unde nu sunt de acord.',
                  legend: true,
                },
                {
                  title: 'Tu decizi și îți spui părerea.',
                  text: 'La Senat trimiți o opinie în consultarea publică. La Cameră le scrii deputaților din comisie cât timp se pot depune amendamente.',
                },
              ].map((s, i) => (
                <li key={s.title} className="grid grid-cols-[44px_minmax(0,1fr)] gap-3.5 border-b border-line py-5">
                  <span aria-hidden className="font-display text-[1.9rem] leading-none font-semibold text-muted">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="text-[17px] leading-snug font-bold text-ink">{s.title}</h3>
                    <p className="mt-1.5 text-[15.5px] leading-relaxed text-body">{s.text}</p>
                    {s.legend && (
                      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[14.5px] text-body">
                        <span className="inline-flex items-center gap-1.5">
                          <RiskGlyph level="red" /> ridicat: de la 6,8
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <RiskGlyph level="yellow" /> moderat: de la 3,8
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <RiskGlyph level="green" /> redus: sub 3,8
                        </span>
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-5 text-[15px] leading-relaxed text-body">
              Scorurile sunt evaluări AI, nu verdicte juridice. Verde nu înseamnă „lege bună”, ci risc redus după criteriile noastre.{' '}
              <Link href="/metodologie" className={linkCls}>
                Metodologia și întrebări frecvente
              </Link>
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-body">
              Cauți un senator sau un deputat?{' '}
              <Link href="/parlamentari" className={linkCls}>
                Caută printre cei {mpCount} de inițiatori
              </Link>
            </p>
          </div>
          {ALERTS_LIVE && (
            <div className="rounded-[20px] bg-band p-6 text-on-band sm:p-9">
              <h2 className="font-display text-[clamp(1.7rem,3vw,2.3rem)] leading-[1.12] font-medium tracking-[-0.015em] text-on-band">Nu vrei să verifici în fiecare zi? Îți scriem noi.</h2>
              <p className="mt-3 text-base leading-relaxed text-on-band-muted">
                Un e-mail dimineața, doar când apare ceva nou: un proiect intră în consultare, se apropie un termen sau scrie presa despre el. Alegi tu nivelul:
              </p>
              <ul className="mt-5 grid gap-2">
                {[
                  { text: 'Toate proiectele', levels: ['red', 'yellow', 'green'] as RiskLevel[] },
                  { text: 'Risc moderat și ridicat', levels: ['red', 'yellow'] as RiskLevel[] },
                  { text: 'Doar risc ridicat', levels: ['red'] as RiskLevel[] },
                ].map((o) => (
                  <li key={o.text} className="flex min-h-12 items-center gap-3 rounded-xl border border-on-band/25 px-3.5 text-[15.5px]">
                    {o.text}
                    <span className="ml-auto inline-flex gap-1">
                      {o.levels.map((l) => (
                        <RiskGlyph key={l} level={l} />
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
              <Link
                href="/abonare"
                {...trackAttrs('alerts_open', { from: 'home' })}
                className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-on-band px-6 text-base font-bold text-band transition-colors hover:bg-white"
              >
                Alege alertele
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <p className="mt-3 text-[13.5px] text-on-band-muted">Te poți dezabona oricând, din orice e-mail.</p>
            </div>
          )}
        </Container>
      </section>
    </>
  );
}
