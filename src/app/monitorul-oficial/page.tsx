import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { getMoLaws, getMoPre1990, getMoStats, type MoCategory, type MoStats } from '@/lib/mo';
import { countWord, formatDateRo } from '@/lib/format';
import { Container, linkCls, panel } from '@/components/ui';
import Wall from '@/components/mo/Wall';
import { DAY_BINS, WEEK_BINS, binLabels } from '@/components/mo/wall-geometry';
import { HundredActs, Swatch, VoteStrip, YearColumns, ro, type YearState } from '@/components/mo/charts';
import { DecadeStrip } from '@/components/mo/pre1990';

export const metadata: Metadata = {
  alternates: { canonical: '/monitorul-oficial' },
  title: 'Monitorul Oficial, în cifre',
  description:
    'Câte acte apar în Monitorul Oficial, Partea I, în fiecare zi din 1990 încoace, câte legi aprobă ordonanțe ale Guvernului și cât durează de la votul final la publicare. Din indexul Portalului Legislativ, cu golurile la vedere.',
  openGraph: { title: 'Monitorul Oficial, în cifre · destrajă.ro', description: 'Câte acte apar în Monitorul Oficial în fiecare zi din 1990 încoace, cine le dă și cât durează de la vot la publicare.' },
};

const CAT_LABEL: Record<MoCategory, string> = {
  lege: 'legi',
  oug: 'ordonanțe de urgență',
  og: 'ordonanțe simple',
  ord: 'ordonanțe nedeosebite în index (de urgență sau simple)',
  hg: 'hotărâri ale Guvernului',
  decret: 'decrete ale Președintelui',
  decizie: 'decizii (CCR, ÎCCJ, premier și altele)',
  ordin: 'ordine (ministere, agenții)',
  altele: 'alte acte (norme, regulamente, rapoarte, rectificări)',
};
const PANEL_TITLE: Record<MoCategory, string> = {
  lege: 'Legi',
  oug: 'Ordonanțe de urgență',
  og: 'Ordonanțe simple',
  ord: 'Ordonanțe nedeosebite',
  hg: 'Hotărâri ale Guvernului',
  decret: 'Decrete prezidențiale',
  decizie: 'Decizii',
  ordin: 'Ordine',
  altele: 'Alte acte',
};
const CATS: MoCategory[] = ['ordin', 'decret', 'decizie', 'hg', 'altele', 'lege', 'oug', 'og', 'ord'];
/** Partea legilor cu titlu în index de la care calculăm procentul celor despre ordonanțe (titlurile vin din listele pe zile). */
const TITLED_MIN = 0.8;
/** Partea minimă din seria ordonanțelor de urgență a anului găsită în index ca s-o arătăm (sub ea, indexul le
 * amestecă cu cele simple sub „ordonanță” și bara ar spune prea puțin). */
const OUG_MIN = 0.75;
const ougShownFor = (stats: MoStats, y: number) => {
  const s = stats.ougNumbering.find((x) => x.year === y);
  return stats.mode !== 'tabel' || (!!s && s.found / s.maxNumber >= OUG_MIN);
};

const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0);
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
/** „2003–2010, 2023–2025” din [2003, …, 2010, 2023, 2024, 2025]. */
function spans(years: number[]) {
  const out: string[] = [];
  let start = years[0];
  for (let i = 1; i <= years.length; i++) {
    if (years[i] !== years[i - 1] + 1) {
      out.push(start === years[i - 1] ? `${start}` : `${start}–${years[i - 1]}`);
      start = years[i];
    }
  }
  return out.join(', ');
}
/** „393 de acte”, „1 act”: acordul lui countWord, cu cifra scrisă românește (1.203). */
const de = (n: number, many: string, one = many) => countWord(n, one, many).replace(/^-?[\d.]+/, ro(n, Number.isInteger(n) ? 0 : 1));

/** Titlul secțiunii despre ordonanțe, după procent (nu „aproape jumătate” fix: cifra se reface zilnic). */
function ordinanceHeadline(p: number) {
  if (p >= 50) return 'Mai mult de jumătate din legi sunt despre ordonanțele Guvernului';
  if (p >= 45) return 'Aproape jumătate din legi sunt despre ordonanțele Guvernului';
  if (p >= 30) return `${ro(p)}% din legi sunt despre ordonanțele Guvernului`;
  return 'Legile despre ordonanțele Guvernului';
}

/** Ce a umplut o zi-record, spus pe scurt („252 de decrete de numire a judecătorilor”). */
function dayDriver(title: string | null, count: number): string | null {
  if (!title) return null;
  const t = title.toLowerCase();
  const what = /numirea unui judecător/.test(t)
    ? 'decrete de numire a unui judecător'
    : /numirea unui procuror/.test(t)
      ? 'decrete de numire a unui procuror'
      : /gradului de general/.test(t)
        ? 'decrete de înaintare în gradul de general'
        : null;
  return what ? `${countWord(count, what.replace('decrete', 'decret'), what)}` : null;
}

function yearStates(stats: MoStats): Record<number, YearState> {
  const out: Record<number, YearState> = {};
  if (stats.mode === 'tabel') {
    // Tabelul întreg: fiecare an are acte; „parțial” înseamnă sub pragurile din metodă (legi, hotărâri, date).
    for (const c of stats.coverage) out[c.year] = c.complete ? 'complet' : c.inProgress ? 'in-curs' : (c.acts ?? 0) > 0 ? 'partial' : 'necitit';
    return out;
  }
  for (const c of stats.coverage) {
    // Un an cu câteva zile citite (2015 avea una) nu e „parțial” în grafice: o bară din câteva zile ar părea un an slab.
    out[c.year] = c.complete ? 'complet' : c.inProgress && c.refused + c.missing === 0 ? 'in-curs' : c.ok + c.partial >= 30 ? 'partial' : 'necitit';
  }
  return out;
}

export default async function MonitorulOficialPage() {
  const stats = await getMoStats();
  if (!stats) notFound();
  const legi = await getMoLaws();
  const pre1990 = await getMoPre1990();
  const states = yearStates(stats);
  const years = stats.coverage.map((c) => c.year);
  const complete = years.filter((y) => states[y] === 'complet');
  const unread = years.filter((y) => states[y] === 'necitit');
  const partial = years.filter((y) => states[y] === 'partial');
  const current = years.at(-1)!;
  const recent = complete.slice(-3);
  const lastComplete = complete.at(-1);
  const toText = formatDateRo(stats.to);

  // Cifrele din capul paginii.
  const median = Math.round(stats.medianActsPerPublishingDay ?? 0);
  const issuesLast = lastComplete ? stats.issues.find((i) => i.year === lastComplete)! : null;
  const pubDaysLast = lastComplete ? stats.yearEnd.find((y) => y.year === lastComplete)?.publishingDays ?? 0 : 0;
  const issuesPerDay = issuesLast && pubDaysLast ? issuesLast.issues / pubDaysLast : 0;
  const recentRows = stats.byYear.filter((r) => recent.includes(r.year));
  const recentTotal = sum(recentRows.map((r) => r.total));
  const shares = CATS.map((k) => ({ key: k, share: pct(sum(recentRows.map((r) => r[k])), recentTotal) }));
  // O sută de pătrate: fiecare categorie rotunjită la cel mai apropiat întreg (legile 3,4 → 3, ca în titlu); diferența
  // până la 100 o ia cea mai mare categorie.
  const floors = shares.map((s) => ({ ...s, cells: Math.round(s.share) }));
  const biggest = floors.reduce((a, b) => (b.share > a.share ? b : a));
  biggest.cells += 100 - sum(floors.map((f) => f.cells));
  const lawShare = shares.find((s) => s.key === 'lege')!.share;
  // Procentul legilor despre ordonanțe: din titluri, deci doar pe legile cu titlu și doar în anii în care cel puțin 80%
  // din legi au titlu în index.
  const titledOf = (l: MoStats['laws'][number]) => l.titled ?? l.laws;
  const titledOk = (l: MoStats['laws'][number]) => l.laws > 0 && titledOf(l) / l.laws >= TITLED_MIN;
  const lawRows = stats.laws.filter((l) => complete.includes(l.year) && titledOk(l));
  const ordYears = lawRows.map((l) => l.year);
  const ordShare = pct(sum(lawRows.map((l) => l.approveOrdinance)), sum(lawRows.map(titledOf)));
  const table = stats.mode === 'tabel';
  const info = stats.table;
  const lawRecent = stats.laws.filter((l) => recent.includes(l.year));
  const rule3 = pct(sum(lawRecent.map((l) => l.inForce3)), sum(lawRecent.map((l) => l.laws)));
  // Înainte de revizuirea Constituției (octombrie 2003), legile intrau în vigoare la publicare.
  const before2003 = stats.laws.filter((l) => l.year < 2003 && states[l.year] === 'complet');
  const pre = before2003.length ? { years: before2003.map((l) => l.year), sooner: sum(before2003.map((l) => l.inForceSooner)), laws: sum(before2003.map((l) => l.laws)) } : null;

  // Zilele-record, explicate.
  const peaks = stats.busiest.slice(0, 3).map((b) => ({ ...b, driver: dayDriver(b.topTitle, b.topCount) }));
  const wallPeaks = peaks.slice(0, 2).map((p) => ({ date: p.date, label: `${formatDateRo(p.date)}: ${de(p.count, 'acte', 'act')}` }));

  // Seriile pe ani.
  const byYear = new Map(stats.byYear.map((r) => [r.year, r]));
  const lawsByYear = new Map(stats.laws.map((l) => [l.year, l]));
  const lawSeries = new Map(stats.lawNumbering.map((s) => [s.year, s]));
  const ougSeries = new Map(stats.ougNumbering.map((s) => [s.year, s]));
  const ytd = stats.ytd?.years ?? [];
  const ytdThrough = stats.ytd ? formatDateRo(`${current}-${stats.ytd.through}`).replace(` ${current}`, '') : '';
  const ougYtd = ytd.filter((y) => y.year >= current - 2);

  // Proiectele noastre.
  // O lege poate fi a unui proiect de la Cameră și a unuia de la Senat (fișa Camerei legată): o numărăm o dată.
  const byLaw = new Map<string, { slug: string } & NonNullable<typeof legi>['bills'][string]>();
  for (const [slug, l] of Object.entries(legi?.bills ?? {})) {
    const prev = byLaw.get(l.law);
    if (!prev || (prev.chamber !== 'camera' && l.chamber === 'camera')) byLaw.set(l.law, { slug, ...l });
  }
  const tracked = [...byLaw.values()];
  const dd = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
  const voteItems = tracked
    .filter((t) => t.finalVoteOn)
    .map((t) => ({
      days: dd(t.finalVoteOn!, t.mo.date),
      href: t.chamber === 'camera' ? `/camera/${t.slug}` : `/legi/${t.slug}`,
      label: `Legea nr. ${t.law}: ${dd(t.finalVoteOn!, t.mo.date)} zile de la votul final la publicare`,
    }))
    .filter((v) => v.days >= 0);
  const voteSorted = voteItems.map((v) => v.days).sort((a, b) => a - b);
  const mid = Math.floor(voteSorted.length / 2);
  const voteMedian = !voteSorted.length ? 0 : voteSorted.length % 2 ? voteSorted[mid] : (voteSorted[mid - 1] + voteSorted[mid]) / 2;
  const notIndexed = legi?.misses.filter((m) => m.reason.startsWith('nu e în indexul')).length ?? 0;
  const fromDecree = tracked.filter((t) => t.moFrom === 'decret').length;
  const withPromulgation = tracked.filter((t) => t.promulgatedOn);
  const sameDay = withPromulgation.filter((t) => t.promulgatedOn === t.mo.date).length;

  // Legile intrate în vigoare într-un an pot fi publicate în anul dinainte: anul e complet aici doar dacă și cel dinainte e.
  const inForceStates: Record<number, YearState> = Object.fromEntries(
    years.map((y) => [y, states[y] === 'complet' && states[y - 1] !== 'complet' ? 'partial' : states[y]]),
  );
  const coveredDays = sum(stats.coverage.map((c) => c.ok + c.partial));
  const allDays = sum(stats.coverage.map((c) => c.days));
  const datedActs = sum(stats.coverage.map((c) => c.acts ?? 0));
  const undatedActs = sum(stats.coverage.map((c) => c.undated ?? 0));
  // Ordonanțele de urgență se pot arăta doar în anii în care indexul le deosebește de cele simple.
  const ougStates: Record<number, YearState> = Object.fromEntries(years.map((y) => [y, ougShownFor(stats, y) ? states[y] : 'necitit']));

  return (
    <>
      <section aria-labelledby="mo-title" className="border-b border-line">
        <Container className="py-12 sm:py-16">
          <h1 id="mo-title" className="font-display max-w-4xl text-[clamp(2.4rem,5vw,4.1rem)] font-normal leading-[1.04] tracking-[-0.025em]">
            <span className="block text-muted">Monitorul Oficial, în cifre.</span>
            <span className="block font-medium text-ink">
              {de(median, 'acte', 'act')} <span className="whitespace-nowrap">într-o zi</span> obișnuită.
            </span>
          </h1>
          <p className="mt-5 max-w-[60ch] text-lg leading-8 text-body">
            Legile, ordonanțele, hotărârile și deciziile publicate în Partea I, zi de zi, din {years[0]} încoace. Le-am numărat din indexul Portalului
            Legislativ și arătăm deschis unde indexul e incomplet.
          </p>
          <Coverage stats={stats} states={states} />
          {table ? (
            <p className="mt-3 max-w-[72ch] text-sm leading-6 text-muted">
              {ro(datedActs)} de acte cu data Monitorului, din {years[0]} până pe {toText}, și încă {ro(undatedActs)} doar cu anul.{' '}
              {partial.length > 0 && (
                <>
                  Incomplete în index: {spans(partial)}, unde lipsesc mai mult de 5% din numerele de lege sau peste 10% din hotărârile Guvernului.{' '}
                </>
              )}
              {current} e în curs, iar ultimele săptămâni se mai completează în index.
            </p>
          ) : (
            <p className="mt-3 max-w-[72ch] text-sm leading-6 text-muted">
              Am citit {ro(coveredDays)} din {ro(allDays)} de zile, până pe {toText}.{' '}
              {unread.length > 0 && <>Anii {spans(unread)} nu sunt citiți încă din portal; pagina se reface pe măsură ce apar. </>}
              {partial.length > 0 && <>{partial.length === 1 ? 'Anul' : 'Anii'} {spans(partial)}: doar o parte din zile. </>}
              {current} e în curs, iar ultimele săptămâni se mai completează în index.
            </p>
          )}
        </Container>
      </section>

      <section aria-label="Pe scurt" className="border-b border-line bg-sunken/60">
        <Container className="grid gap-px py-8 sm:grid-cols-3 sm:py-10">
          <Fact
            value={ro(issuesPerDay, 1)}
            text="numere de Monitor într-o zi cu publicări"
            note={issuesLast ? `${ro(issuesLast.issues)} de numere în ${pubDaysLast} de zile, în ${lastComplete}.` : ''}
          />
          <Fact value={`${ro(lawShare, 1)} din 100`} text="de acte publicate sunt legi" note={`În ${spans(recent)}. Restul sunt ordine, decrete, decizii și hotărâri ale Guvernului.`} />
          <Fact
            value={`${ro(ordShare)}%`}
            text="dintre legi aprobă sau resping o ordonanță"
            note={`Legile cu titlu în index, în ${spans(ordYears)}: anii compleți în care titlurile acoperă cel puțin 80% din legi.`}
          />
        </Container>
      </section>

      <section aria-labelledby="ritm" className="border-b border-line">
        <Container className="py-14 sm:py-20">
          <SectionHead id="ritm" title={`Fiecare zi, din ${years[0]} până pe ${toText.replace(` ${current}`, '')}`}>
            Un rând e un an, o coloană e o zi (pe telefon, o săptămână). Cu cât treapta de culoare e mai intensă, cu atât au apărut mai multe acte în ziua aceea. Atingeți sau
            treceți cu mouse-ul peste zid pentru dată și număr.
          </SectionHead>
          <div className="mt-8">
            <Wall stats={stats} peaks={wallPeaks} />
          </div>
          <Legend table={table} />
          <MonthTable stats={stats} states={states} />
          {pre1990 && pre1990.totals.acts > 0 && (
            <Link
              href="/monitorul-oficial/inainte-de-1990"
              className="group mt-8 flex flex-col gap-4 rounded-2xl border border-line bg-surface px-5 py-5 transition-colors hover:border-line-strong sm:px-6 lg:flex-row lg:items-center lg:gap-8"
            >
              <DecadeStrip decades={pre1990.decades} />
              <span className="min-w-0 flex-1">
                <span className="font-display block text-[1.3rem] leading-snug tracking-[-0.015em] text-ink">
                  Și înainte de {years[0]}: {ro(pre1990.totals.acts)} de acte, din {pre1990.totals.first?.slice(0, 4)} încoace.
                </span>
                <span className="mt-1 block text-[15px] leading-6 text-body">
                  Ce mai păstrează portalul din vechiul Monitor Oficial și din Buletinul Oficial: cine le semna, cele mai vechi și cele încă citate azi.
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1.5 text-[15px] font-semibold text-link underline decoration-1 underline-offset-4 group-hover:decoration-2">
                Înainte de 1990
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
            </Link>
          )}
          <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <p className="max-w-[60ch] text-[15px] leading-7 text-body">
              {peaks.every((p) => p.decret > p.count / 2) ? (
                <>
                  Zilele cele mai pline nu sunt zile cu multe legi. Sunt zile în care Președintele semnează sute de decrete individuale
                  {peaks.every((p) => p.driver) ? ', de numire a judecătorilor și procurorilor sau de înaintare în grad,' : ''} câte un decret pentru
                  fiecare om.
                </>
              ) : (
                <>Cele mai pline zile din date și ce le-a umplut.</>
              )}
            </p>
            <ol className="divide-y divide-line border-y border-line">
              {peaks.map((p) => (
                <li key={p.date} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                  <span className="text-[15px] font-semibold text-ink">{formatDateRo(p.date)}</span>
                  <span className="text-sm tabular-nums text-body">
                    {de(p.count, 'acte', 'act')}
                    {p.driver && <span className="text-muted">, dintre care {p.driver}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </Container>
      </section>

      <section aria-labelledby="ordonante" className="border-b border-line bg-sunken/60">
        <Container className="py-14 sm:py-20">
          <SectionHead id="ordonante" title={ordinanceHeadline(ordShare)}>
            Guvernul poate legifera prin ordonanțe, care intră în vigoare înainte ca Parlamentul să le voteze; Parlamentul le aprobă sau le respinge apoi
            prin lege. În anii cu titlurile legilor în index ({spans(ordYears)}), {ro(ordShare)}% dintre legile publicate au exact acest rol.
          </SectionHead>
          <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <figure className={`${panel} p-5 sm:p-6`}>
              <figcaption className="text-[15px] font-semibold text-ink">Legile publicate în fiecare an</figcaption>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs text-body">
                <Swatch fill="var(--mo-5)">aprobă o ordonanță</Swatch>
                <Swatch fill="var(--mo-5)" hatch="segment">
                  respinge o ordonanță
                </Swatch>
                <Swatch fill="var(--mo-other)">alte legi</Swatch>
                {table && <Swatch hatch="unread">fără titlu în index</Swatch>}
                <Swatch outline>an incomplet</Swatch>
                {!table && <Swatch hatch="unread">necitit încă</Swatch>}
              </div>
              <div className="mt-5">
                <YearColumns
                  id="legi-ord"
                  label="Legile publicate în fiecare an, împărțite în legi care aprobă o ordonanță, legi care resping o ordonanță și alte legi."
                  states={states}
                  height={70}
                  max={Math.max(...stats.laws.map((l) => l.laws))}
                  bars={years.map((y) => {
                    const l = lawsByYear.get(y)!;
                    return {
                      year: y,
                      segments: [
                        { value: l.approveOrdinance - l.rejectOrdinance, fill: 'var(--mo-5)' },
                        { value: l.rejectOrdinance, fill: 'var(--mo-5)', hatch: true },
                        { value: titledOf(l) - l.approveOrdinance, fill: 'var(--mo-other)' },
                        { value: l.laws - titledOf(l), fill: 'var(--mo-0)', hatch: true },
                      ],
                    };
                  })}
                  valueLabels={ordYears
                    .filter((y) => y === ordYears[0] || y === ordYears.at(-1) || pct(lawsByYear.get(y)!.approveOrdinance, titledOf(lawsByYear.get(y)!)) >= 60)
                    .map((y) => ({ year: y, text: `${ro(pct(lawsByYear.get(y)!.approveOrdinance, titledOf(lawsByYear.get(y)!)))}%` }))}
                />
              </div>
              <p className="mt-4 text-xs leading-5 text-muted">
                Procentul de deasupra: partea legilor cu titlu care aprobă sau resping o ordonanță, doar în anii în care cel puțin 80% din legi au titlu în
                index. Din titlul legii; aprobarea poate veni cu modificări, iar ordonanța poate fi dintr-un an anterior.
              </p>
            </figure>
            <figure className={`${panel} p-5 sm:p-6`}>
              <figcaption className="text-[15px] font-semibold text-ink">Ordonanțele de urgență, an de an</figcaption>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs text-body">
                <Swatch fill="var(--mo-4)">găsite în index</Swatch>
                <Swatch outline="ref">cel mai mare număr din an</Swatch>
                {table && <Swatch hatch="unread">amestecate în index cu cele simple</Swatch>}
              </div>
              <div className="mt-5">
                <YearColumns
                  id="oug"
                  label="Ordonanțele de urgență găsite în index pentru fiecare an și cel mai mare număr de ordonanță din acel an; hașurat, anii în care indexul le amestecă cu ordonanțele simple."
                  states={ougStates}
                  height={70}
                  max={Math.max(...stats.ougNumbering.filter((s) => ougStates[s.year] === 'complet' || ougStates[s.year] === 'in-curs').map((s) => s.maxNumber), 1)}
                  bars={years.map((y) => {
                    const s = ougStates[y] === 'complet' || ougStates[y] === 'in-curs' ? ougSeries.get(y) : undefined;
                    return { year: y, segments: [{ value: s?.found ?? byYear.get(y)!.oug, fill: 'var(--mo-4)' }], ref: s?.maxNumber };
                  })}
                />
              </div>
              {ougYtd.length > 1 && (
                <p className="mt-4 text-sm leading-6 text-body">
                  De la 1 ianuarie până pe {ytdThrough}:{' '}
                  {ougYtd
                    .slice()
                    .reverse()
                    .map((y) => `${y.oug} în ${y.year}`)
                    .join(', ')}
                  . Ultimele săptămâni din {current} se mai completează în index.
                </p>
              )}
              <p className="mt-2 text-xs leading-5 text-muted">
                Ordonanțele sunt numerotate de la 1 în fiecare an; conturul arată până unde a ajuns numerotarea, bara câte am găsit în index.
              </p>
            </figure>
          </div>
        </Container>
      </section>

      <section aria-labelledby="legi" className="border-b border-line">
        <Container className="py-14 sm:py-20">
          <SectionHead id="legi" title="Câte legi apar și când intră în vigoare">
            Legile sunt numerotate de la 1 în fiecare an, așa că ultimul număr spune până unde s-a ajuns. Indexul portalului nu le are pe toate: diferența se
            vede mai jos, an de an.
          </SectionHead>
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <figure className={`${panel} p-5 sm:p-6`}>
              <figcaption className="text-[15px] font-semibold text-ink">Legile fiecărui an: numerotarea și ce e în index</figcaption>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs text-body">
                <Swatch fill="var(--mo-5)">numere găsite în index</Swatch>
                <Swatch outline="ref">cel mai mare număr din an</Swatch>
              </div>
              <div className="mt-5">
                <YearColumns
                  id="legi-nr"
                  label="Pentru fiecare an, câte numere de lege am găsit în index și cel mai mare număr de lege din acel an."
                  states={states}
                  height={70}
                  max={Math.max(...stats.lawNumbering.filter((s) => states[s.year] === 'complet' || states[s.year] === 'in-curs').map((s) => s.maxNumber), 1)}
                  bars={years.map((y) => {
                    const s = states[y] === 'complet' || states[y] === 'in-curs' ? lawSeries.get(y) : undefined;
                    return { year: y, segments: [{ value: s?.found ?? lawsByYear.get(y)!.laws, fill: 'var(--mo-5)' }], ref: s?.maxNumber };
                  })}
                  valueLabels={[complete[0], lastComplete].filter((y): y is number => !!y && !!lawSeries.get(y)).map((y) => ({ year: y, text: ro(lawSeries.get(y)!.maxNumber) }))}
                />
              </div>
              {lastComplete && lawSeries.get(lastComplete) && (
                <p className="mt-4 text-sm leading-6 text-body">
                  În {lastComplete}, numerotarea a ajuns la Legea nr. {lawSeries.get(lastComplete)!.maxNumber}; în index am găsit{' '}
                  {lawSeries.get(lastComplete)!.found} dintre ele.
                </p>
              )}
            </figure>
            <figure className={`${panel} p-5 sm:p-6`}>
              <figcaption className="text-[15px] font-semibold text-ink">Legile intrate în vigoare în fiecare an</figcaption>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs text-body">
                <Swatch fill="var(--mo-4)">după data din index</Swatch>
                <Swatch outline>an incomplet</Swatch>
              </div>
              <div className="mt-5">
                <YearColumns
                  id="vigoare"
                  label="Câte legi au intrat în vigoare în fiecare an, după data de intrare în vigoare din indexul portalului."
                  states={inForceStates}
                  height={70}
                  max={Math.max(...stats.laws.map((l) => l.enteredInForce))}
                  bars={years.map((y) => ({ year: y, segments: [{ value: lawsByYear.get(y)!.enteredInForce, fill: 'var(--mo-4)' }] }))}
                  valueLabels={[complete[0], lastComplete].filter((y): y is number => !!y).map((y) => ({ year: y, text: ro(lawsByYear.get(y)!.enteredInForce) }))}
                />
              </div>
              <p className="mt-4 text-sm leading-6 text-body">
                {lastComplete && (
                  <>
                    În {lastComplete} au intrat în vigoare {de(lawsByYear.get(lastComplete)!.enteredInForce, 'legi', 'lege')}, după datele din index.{' '}
                  </>
                )}
                Doar legile găsite în index; un an e plin doar dacă și cel dinainte e {table ? 'complet' : 'citit'}. {ro(rule3)}% dintre legile publicate în {spans(recent)} au intrat în vigoare la 3 zile după publicare, regula din Constituție (art. 78) pentru
                legile care nu stabilesc altă dată.
                {pre && (
                  <>
                    {' '}
                    Până la revizuirea Constituției din octombrie 2003, legile intrau în vigoare la publicare: în anii compleți {spans(pre.years)},{' '}
                    {ro(pre.sooner)} din {ro(pre.laws)} de legi au o dată mai apropiată de 3 zile.
                  </>
                )}
              </p>
            </figure>
          </div>
        </Container>
      </section>

      <section aria-labelledby="ce-se-publica" className="border-b border-line bg-sunken/60">
        <Container className="py-14 sm:py-20">
          <SectionHead id="ce-se-publica" title={`Din 100 de acte, ${ro(lawShare, 0)} sunt legi`}>
            Restul vin de la Guvern, de la Președinte, de la ministere și agenții, de la Curtea Constituțională. Cum s-au împărțit actele publicate în{' '}
            {spans(recent)}:
          </SectionHead>
          <div className="mt-8">
            <HundredActs
              groups={floors.map((f) => ({ key: f.key, label: CAT_LABEL[f.key], share: f.share, cells: f.cells, tone: f.key === 'lege' ? 'lege' : f.key === 'oug' ? 'oug' : 'rest' }))}
            />
          </div>
          <h3 className="mt-14 text-lg font-semibold text-ink">Fiecare tip de act, an de an</h3>
          <p className="mt-1 max-w-[68ch] text-sm leading-6 text-muted">
            Fiecare grafic are scara lui (cifra de sus e cel mai mare an), ca să se vadă evoluția și la tipurile rare. Barele cu contur sunt ani incompleți.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-3">
            {(['lege', 'oug', 'og', 'ord', 'hg', 'decret', 'decizie', 'ordin', 'altele'] as MoCategory[]).filter((k) => stats.byYear.some((r) => r[k] > 0)).map((k) => {
              const max = Math.max(...stats.byYear.filter((r) => states[r.year] === 'complet').map((r) => r[k]), 1);
              const peakYear = stats.byYear.filter((r) => states[r.year] === 'complet').sort((a, b) => b[k] - a[k])[0];
              return (
                <figure key={k}>
                  <figcaption className="flex items-baseline justify-between gap-2 border-t border-line pt-2">
                    <span className="text-sm font-semibold text-ink">{PANEL_TITLE[k]}</span>
                    <span className="text-xs tabular-nums text-muted">
                      max. {ro(max)}
                      {peakYear ? ` (${peakYear.year})` : ''}
                    </span>
                  </figcaption>
                  <div className="mt-2">
                    <YearColumns
                      id={`sm-${k}`}
                      label={`${PANEL_TITLE[k]} publicate în fiecare an.`}
                      states={states}
                      height={46}
                      max={max}
                      bars={years.map((y) => ({ year: y, segments: [{ value: byYear.get(y)![k], fill: 'var(--mo-4)' }] }))}
                    />
                  </div>
                </figure>
              );
            })}
          </div>
        </Container>
      </section>

      {voteItems.length > 0 && (
        <section aria-labelledby="proiecte" className="border-b border-line">
          <Container className="py-14 sm:py-20">
            <SectionHead id="proiecte" title="De la votul final la Monitorul Oficial">
              Proiectele de la Camera Deputaților pe care le urmărim și care au devenit lege: {voteItems.length} cu votul final în fișă. De la vot până la
              publicare au trecut de obicei {de(voteMedian, 'zile', 'zi')}: legea merge la secretarii generali pentru eventuale sesizări la Curtea Constituțională, apoi
              la Președinte, care o promulgă. Promulgarea și publicarea cad, de regulă, în aceeași zi ({sameDay} din {withPromulgation.length}).
            </SectionHead>
            <div className={`${panel} mt-8 p-5 sm:p-6`}>
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                <span aria-hidden className="inline-block h-4 w-px bg-ink" />
                Mediana: {de(voteMedian, 'zile', 'zi')}
              </p>
              <div className="max-w-[760px]">
                <VoteStrip items={voteItems} median={voteMedian} />
              </div>
              <details className="mt-4 rounded-xl bg-sunken px-4 py-2 text-sm">
                <summary className="min-h-11 cursor-pointer py-2 font-semibold text-ink">Lista legilor, cu zilele fiecăreia</summary>
                <ul className="grid gap-x-6 pb-2 sm:grid-cols-2 lg:grid-cols-3">
                  {voteItems
                    .slice()
                    .sort((x, y) => x.days - y.days)
                    .map((v) => (
                      <li key={v.href}>
                        <Link href={v.href} className="flex min-h-11 items-center justify-between gap-3 border-b border-line text-body hover:text-ink">
                          <span>{v.label.split(':')[0]}</span>
                          <span className="tabular-nums text-muted">{de(v.days, 'zile', 'zi')}</span>
                        </Link>
                      </li>
                    ))}
                </ul>
              </details>
              <p className="mt-3 text-xs leading-5 text-muted">
                Fiecare punct e o lege; apăsați pe el pentru proiect. Doar proiectele ajunse deja în Monitor: cele întoarse la Parlament sau contestate la
                Curtea Constituțională nu sunt încă aici.
                {fromDecree > 0 && <> Pentru {fromDecree === 1 ? 'o lege' : `${fromDecree} legi`}, data publicării e a decretului de promulgare: legea lipsește din index.</>}
                {notIndexed > 0 && <> Alte {notIndexed === 1 ? 'o lege' : `${notIndexed} legi`} din proiectele noastre nu apar încă în indexul portalului.</>}
              </p>
            </div>
          </Container>
        </section>
      )}

      <section aria-labelledby="metoda" className="border-b border-line">
        <Container className="py-14 sm:py-20">
          <SectionHead id="metoda" title="De unde vin cifrele">
            Din indexul{' '}
            <a href="https://legislatie.just.ro" target="_blank" rel="noopener noreferrer" className={linkCls}>
              Portalului Legislativ
            </a>{' '}
            al Ministerului Justiției, pentru Monitorul Oficial, Partea I. E un index, nu Monitorul însuși: portalul adaugă actele cu întârziere, nu
            indexează orice element al unui număr, iar doar Monitorul Oficial tipărit e autentic.
          </SectionHead>
          <ul className="mt-6 grid max-w-[72ch] gap-3 text-[15px] leading-7 text-body">
            {table && info && (
              <li>
                <strong className="font-semibold text-ink">De unde avem actele.</strong> Din tabelul tuturor actelor din portal, cerute după numărul lor
                din portal și completate cu setul public romanian-law-data ({ro(info.rows)} de rânduri, la {formatDateRo(info.generatedAt ?? stats.to)}), plus
                listele pe zile ale portalului, de unde vin titlurile și decretele de promulgare. Actele fără numele publicației ({ro(info.partNull)}, aproape
                toate din romanian-law-data) le numărăm în Partea I. Nu intră: {ro(info.unpublished)} de acte marcate „nepublicat” și{' '}
                {ro(pre1990?.totals.acts ?? info.buletinOficial + info.before1990)} de acte de dinainte de 1990 (Buletinul Oficial și altele), care nu sunt pe zid
                {pre1990 ? (
                  <>
                    {' '}
                    (le găsiți pe{' '}
                    <Link href="/monitorul-oficial/inainte-de-1990" className={linkCls}>
                      pagina lor
                    </Link>
                    )
                  </>
                ) : null}
                . Actele fără data
                Monitorului, dar cu anul actului ({ro(info.undatedWithYear)}), intră în totalurile anului, nu în zid; {ro(info.undatedNoYear)} fără niciun an
                rămân deoparte.
              </li>
            )}
            <li>
              <strong className="font-semibold text-ink">Ce numărăm.</strong> Fiecare act din index publicat în Partea I, după data Monitorului în care a
              apărut. Un act listat de două ori (același act sub două numere de portal, din surse diferite, sau un ordin comun, câte o intrare pentru fiecare
              emitent) se numără o dată: același număr de Monitor, aceeași familie de tip și același număr (la actele fără număr, același titlu). Un rând
              fără număr și fără titlu nu se numără când același Monitor are deja un act de același tip. Notele de
              presă ale Înaltei Curți, trecute în portal la „Monitorul Oficial nr. 0”, nu intră.
            </li>
            <li>
              <strong className="font-semibold text-ink">Ziua obișnuită.</strong> Mediana actelor pe zi, în zilele cu cel puțin un act din anii
              {table ? ' compleți' : ' citiți'} ({spans(complete)}). Zilele fără niciun act (weekenduri, sărbători) nu intră în mediană.
            </li>
            {table ? (
              <li>
                <strong className="font-semibold text-ink">Ani compleți.</strong> Legile și hotărârile Guvernului sunt numerotate de la 1 în fiecare an, deci
                se vede cât din serie lipsește. Un an e „complet” când indexul are cel puțin 95% din numerele de lege ale anului, cel puțin 90% din cele de
                hotărâri ale Guvernului și data Monitorului pentru cel puțin 95% din acte. Pragurile lasă loc numerelor care nu sunt pe portal deloc (Legea
                nr. 48/2026, de pildă); anii sub ele sunt marcați incompleți, iar cifrele lor sunt o limită de jos. Ultimul an din date nu e niciodată
                complet: ultimele săptămâni se mai completează în index.
              </li>
            ) : (
              <li>
                <strong className="font-semibold text-ink">Ani citiți.</strong> Un an e „citit” când cel puțin 99 din 100 de zile au fost citite fără
                lipsuri. Zilele pe care portalul nu ni le-a dat (sau din care a refuzat o pagină de rezultate) sunt hașurate pe zid și numărate în tabel;
                cifrele anului sunt o limită de jos. Ultimul an din date nu e niciodată „citit”: ultimele săptămâni se mai completează în index.
              </li>
            )}
            <li>
              <strong className="font-semibold text-ink">Legile și ordonanțele.</strong> „Aprobă” sau „respinge” o ordonanță se citește din titlul legii.
              Titlurile vin doar din listele pe zile, așa că procentul se calculează pe legile cu titlu, în anii în care acestea sunt cel puțin 80% din
              legi. Actele din romanian-law-data spun doar „ordonanță”, fără „de urgență”: ordonanțele de urgență ale unui an apar separat doar când
              indexul are cel puțin trei sferturi din seria lor; în ceilalți ani sunt hașurate. Numerotarea: cel mai mare număr din an; găsite: câte numere diferite din acel an apar în index.
            </li>
            <li>
              <strong className="font-semibold text-ink">Intrarea în vigoare.</strong> Data din index („Data intrării în vigoare”), nu citită din textul
              legii.
            </li>
            <li>
              <strong className="font-semibold text-ink">Proiectele noastre.</strong> Legătura cu legea, din fișa Camerei („devine Legea nr. …”), verificată cu
              decretul de promulgare din Monitor când indexul îl are. Când indexul are decretul, dar nu și legea, arătăm numărul de Monitor al decretului
              și o spunem pe pagina proiectului. Un număr de lege apărut din nou la peste 120 de zile de la data legii e tratat ca republicare. Votul final e ultimul vot de adoptare din fișă dinaintea promulgării.
            </li>
          </ul>
          <p className="mt-6 text-sm text-muted">
            Totul se reface la fiecare actualizare a site-ului. Cifrele pe ani:{' '}
            <a href="#tabel-ani" className={linkCls}>
              tabelul de mai jos
            </a>
            .{' '}
            <Link href="/presa" className={linkCls}>
              Camera de presă
            </Link>{' '}
            are restul datelor despre proiecte.
          </p>
          <YearTable stats={stats} states={states} />
        </Container>
      </section>
    </>
  );
}

function SectionHead({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <div className="max-w-[68ch]">
      <h2 id={id} className="font-display text-[clamp(1.75rem,3.4vw,2.5rem)] font-normal leading-[1.12] tracking-[-0.015em] text-ink">
        {title}
      </h2>
      <p className="mt-4 text-[15px] leading-7 text-body sm:text-base sm:leading-7">{children}</p>
    </div>
  );
}

function Fact({ value, text, note }: { value: string; text: string; note: string }) {
  return (
    <div className="border-t border-line-strong py-4 sm:border-l sm:border-t-0 sm:px-6 sm:py-1 sm:first:border-l-0 sm:first:pl-0">
      <p className="text-[clamp(2.2rem,4vw,3rem)] font-semibold leading-none tracking-[-0.02em] text-ink">{value}</p>
      <p className="mt-2 text-[15px] font-semibold leading-6 text-ink">{text}</p>
      <p className="mt-1 text-sm leading-6 text-muted">{note}</p>
    </div>
  );
}

const STATE_TEXT: Record<YearState, string> = { complet: 'citit', partial: 'citit parțial', 'in-curs': 'în curs', necitit: 'necitit încă' };
const STATE_TEXT_TABLE: Record<YearState, string> = { complet: 'complet', partial: 'incomplet în index', 'in-curs': 'în curs', necitit: 'fără acte' };
const stateText = (stats: MoStats, st: YearState) => (stats.mode === 'tabel' ? STATE_TEXT_TABLE : STATE_TEXT)[st];
const lawShareOf = (c: MoStats['coverage'][number]) => (c.lawMax ? (c.lawFound ?? 0) / c.lawMax : 0);

function Coverage({ stats, states }: { stats: MoStats; states: Record<number, YearState> }) {
  return (
    <div className="mt-8">
      <ol
        className="grid grid-cols-12 gap-1 sm:grid-cols-[repeat(var(--ani),minmax(0,1fr))]"
        style={{ '--ani': stats.coverage.length } as React.CSSProperties}
        aria-label="Acoperirea pe ani"
      >
        {stats.coverage.map((c) => {
          const st = states[c.year];
          const table = stats.mode === 'tabel';
          // Umplerea unui an incomplet: partea zilelor citite sau, din tabelul întreg, partea numerelor de lege găsite.
          const filled = table ? lawShareOf(c) : (c.ok + c.partial) / c.days;
          const detail = table ? `${c.lawFound ?? 0} din ${c.lawMax ?? 0} numere de lege în index` : `${c.ok + c.partial} din ${c.days} zile`;
          return (
            <li key={c.year} title={`${c.year}: ${stateText(stats, st)} (${detail})`}>
              <span
                className={`block h-3 rounded-[3px] ${st === 'necitit' ? 'mo-hatch border border-line' : st === 'complet' ? 'bg-[var(--mo-5)]' : 'border border-[var(--mo-4)] bg-surface'}`}
                style={st === 'partial' ? { background: `linear-gradient(90deg, var(--mo-4) ${filled * 100}%, var(--surface) 0)` } : undefined}
                aria-hidden
              />
              <span className="mt-1 block text-center text-[11px] tabular-nums text-muted">{String(c.year).slice(2)}</span>
              <span className="sr-only">{`${c.year}: ${stateText(stats, st)}, ${detail}`}</span>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-body">
        {stats.mode === 'tabel' ? (
          <>
            <Swatch fill="var(--mo-5)">complet în index</Swatch>
            <Swatch outline>incomplet (umplut cât din legi e în index) sau în curs</Swatch>
          </>
        ) : (
          <>
            <Swatch fill="var(--mo-5)">citit (cel puțin 99% din zile)</Swatch>
            <Swatch outline>parțial sau în curs</Swatch>
            <Swatch hatch="unread">necitit încă</Swatch>
          </>
        )}
      </div>
    </div>
  );
}

function Legend({ table = false }: { table?: boolean }) {
  const day = binLabels(DAY_BINS);
  const week = binLabels(WEEK_BINS);
  const row = (labels: string[], unit: string, cls: string) => (
    <div className={`${cls} mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-body`}>
      <span className="font-semibold text-ink">Acte {unit}:</span>
      <Swatch fill="var(--mo-0)">niciunul</Swatch>
      {labels.map((l, i) => (
        <Swatch key={l} fill={`var(--mo-${i + 1})`}>
          {l}
        </Swatch>
      ))}
      <Swatch hatch="unread">{table ? 'încă neindexat; în fața anului: an incomplet în index' : 'necitit sau încă neindexat'}</Swatch>
    </div>
  );
  return (
    <>
      {row(day, 'pe zi', 'hidden md:flex')}
      {row(week, 'pe săptămână', 'flex md:hidden')}
    </>
  );
}

function YearTable({ stats, states }: { stats: MoStats; states: Record<number, YearState> }) {
  const lawsByYear = new Map(stats.laws.map((l) => [l.year, l]));
  const lawSeries = new Map(stats.lawNumbering.map((s) => [s.year, s]));
  const ougSeries = new Map(stats.ougNumbering.map((s) => [s.year, s]));
  const hgSeries = new Map((stats.hgNumbering ?? []).map((s) => [s.year, s]));
  const issues = new Map(stats.issues.map((i) => [i.year, i]));
  const table = stats.mode === 'tabel';
  if (table) {
    const dash = <span className="text-faint">–</span>;
    const pair = (s?: { found: number; maxNumber: number }) => (s ? `${ro(s.found)} / ${ro(s.maxNumber)}` : dash);
    return (
      <div id="tabel-ani" className="mt-10 overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[920px] text-left text-sm tabular-nums">
          <caption className="px-4 pt-4 text-left text-[15px] font-semibold text-ink sm:px-5">
            Anii, unul câte unul <span className="font-normal text-muted">(din indexul Portalului Legislativ, până pe {formatDateRo(stats.to)})</span>
          </caption>
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th scope="col" className="px-4 py-3 font-semibold sm:px-5">An</th>
              <th scope="col" className="px-3 py-3 font-semibold">Stare</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Acte cu dată</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Doar cu anul</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Numere de Monitor</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Legi publicate</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Legi: găsite / numerotare</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">HG: găsite / numerotare</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">OUG: găsite / numerotare</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold sm:px-5">Legi intrate în vigoare</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line whitespace-nowrap">
            {stats.coverage.map((c) => {
              const st = states[c.year];
              const row = stats.byYear.find((r) => r.year === c.year)!;
              const l = lawsByYear.get(c.year)!;
              const ougShown = ougShownFor(stats, c.year);
              return (
                <tr key={c.year} className={st === 'complet' || st === 'in-curs' ? 'text-body' : 'text-muted'}>
                  <th scope="row" className="px-4 py-2.5 font-semibold text-ink sm:px-5">{c.year}</th>
                  <td className="px-3 py-2.5">{stateText(stats, st)}</td>
                  <td className="px-3 py-2.5 text-right">{ro(c.acts ?? 0)}</td>
                  <td className="px-3 py-2.5 text-right">{c.undated ? ro(c.undated) : dash}</td>
                  <td className="px-3 py-2.5 text-right">{ro(issues.get(c.year)?.issues ?? 0)}</td>
                  <td className="px-3 py-2.5 text-right">{ro(l.laws)}</td>
                  <td className="px-3 py-2.5 text-right">{pair(lawSeries.get(c.year))}</td>
                  <td className="px-3 py-2.5 text-right">{pair(hgSeries.get(c.year))}</td>
                  <td className="px-3 py-2.5 text-right">{ougShown ? pair(ougSeries.get(c.year)) : <span className="text-faint">amestecate</span>}</td>
                  <td className="px-4 py-2.5 text-right sm:px-5">{ro(l.enteredInForce)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="border-t border-line px-4 py-3 text-xs leading-5 text-muted sm:px-5">
          „Găsite / numerotare”: câte numere diferite din seria anului sunt în index, față de cel mai mare număr văzut; de aici vine starea anului.
          „Doar cu anul”: acte fără data Monitorului, numărate în totalurile anului, nu în zid. Actele din anii incompleți sunt o limită de jos.{' '}
          <ExternalLink className="inline h-3 w-3" aria-hidden /> Sursa:{' '}
          <a href="https://legislatie.just.ro" className="underline underline-offset-4 hover:text-ink" target="_blank" rel="noopener noreferrer">
            legislatie.just.ro
          </a>
          .
        </p>
      </div>
    );
  }
  return (
    <div id="tabel-ani" className="mt-10 overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[860px] text-left text-sm tabular-nums">
        <caption className="px-4 pt-4 text-left text-[15px] font-semibold text-ink sm:px-5">
          Anii, unul câte unul <span className="font-normal text-muted">(din indexul Portalului Legislativ, până pe {formatDateRo(stats.to)})</span>
        </caption>
        <thead className="text-xs text-muted">
          <tr className="border-b border-line">
            <th scope="col" className="px-4 py-3 font-semibold sm:px-5">An</th>
            <th scope="col" className="px-3 py-3 font-semibold">Stare</th>
            <th scope="col" className="px-3 py-3 text-right font-semibold">Zile citite</th>
            <th scope="col" className="px-3 py-3 text-right font-semibold">Zile cu lipsuri</th>
            <th scope="col" className="px-3 py-3 text-right font-semibold">Acte</th>
            <th scope="col" className="px-3 py-3 text-right font-semibold">Numere de Monitor</th>
            <th scope="col" className="px-3 py-3 text-right font-semibold">Legi publicate</th>
            <th scope="col" className="px-3 py-3 text-right font-semibold">Legi: găsite / numerotare</th>
            <th scope="col" className="px-3 py-3 text-right font-semibold">OUG: găsite / numerotare</th>
            <th scope="col" className="px-4 py-3 text-right font-semibold sm:px-5">Legi intrate în vigoare</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line whitespace-nowrap">
          {stats.coverage.map((c) => {
            const st = states[c.year];
            const read = c.ok + c.partial;
            const row = stats.byYear.find((r) => r.year === c.year)!;
            const l = lawsByYear.get(c.year)!;
            const ls = lawSeries.get(c.year);
            const os = ougSeries.get(c.year);
            const trust = st === 'complet' || st === 'in-curs';
            const dash = <span className="text-faint">–</span>;
            return (
              <tr key={c.year} className={st === 'necitit' ? 'text-muted' : 'text-body'}>
                <th scope="row" className="px-4 py-2.5 font-semibold text-ink sm:px-5">{c.year}</th>
                <td className="px-3 py-2.5">{stateText(stats, st)}</td>
                <td className="px-3 py-2.5 text-right">
                  {ro(c.ok)} / {ro(c.days)}
                </td>
                <td className="px-3 py-2.5 text-right">{c.partial + c.refused + c.missing || dash}</td>
                <td className="px-3 py-2.5 text-right">{read ? ro(row.total) : dash}</td>
                <td className="px-3 py-2.5 text-right">{read ? ro(issues.get(c.year)?.issues ?? 0) : dash}</td>
                <td className="px-3 py-2.5 text-right">{read ? ro(l.laws) : dash}</td>
                <td className="px-3 py-2.5 text-right">{trust && ls ? `${ro(ls.found)} / ${ro(ls.maxNumber)}` : dash}</td>
                <td className="px-3 py-2.5 text-right">{trust && os ? `${ro(os.found)} / ${ro(os.maxNumber)}` : dash}</td>
                <td className="px-4 py-2.5 text-right sm:px-5">{read ? ro(l.enteredInForce) : dash}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-line px-4 py-3 text-xs leading-5 text-muted sm:px-5">
        Numerotarea legilor și a ordonanțelor doar pentru anii citiți și pentru anul în curs; în anii parțiali, cel mai mare număr văzut nu spune
        nimic. Actele din anii parțiali sunt o limită de jos. <ExternalLink className="inline h-3 w-3" aria-hidden /> Sursa:{' '}
        <a href="https://legislatie.just.ro" className="underline underline-offset-4 hover:text-ink" target="_blank" rel="noopener noreferrer">
          legislatie.just.ro
        </a>
        .
      </p>
    </div>
  );
}

const MONTHS_SHORT = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.'];

/** Textul zidului: actele pe luni, an de an (o lună cu zile necitite e marcată, nu estimată). */
function MonthTable({ stats, states }: { stats: MoStats; states: Record<number, YearState> }) {
  const rows = stats.calendar.filter((c) => states[c.year] !== 'necitit');
  return (
    <details className="mt-6 rounded-xl bg-sunken px-4 py-3 text-sm">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold text-ink">Zidul în cifre: actele pe luni, {stats.mode === 'tabel' ? 'an de an' : 'pentru anii citiți'}</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[720px] text-right tabular-nums">
          <thead className="text-xs text-muted">
            <tr>
              <th scope="col" className="py-2 pr-3 text-left font-semibold">An</th>
              {MONTHS_SHORT.map((m) => (
                <th key={m} scope="col" className="px-2 py-2 font-semibold">
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line text-body">
            {rows.map((c) => (
              <tr key={c.year}>
                <th scope="row" className="py-1.5 pr-3 text-left font-semibold text-ink">
                  {c.year}
                </th>
                {MONTHS_SHORT.map((m, i) => {
                  const start = Math.round((Date.UTC(c.year, i, 1) - Date.UTC(c.year, 0, 1)) / 86_400_000);
                  const end = Math.round((Date.UTC(c.year, i + 1, 1) - Date.UTC(c.year, 0, 1)) / 86_400_000);
                  const vals = c.values.slice(start, end);
                  const known = vals.filter((v): v is number => v !== null);
                  const future = `${c.year}-${String(i + 1).padStart(2, '0')}-01` > stats.to;
                  return (
                    <td key={m} className="px-2 py-1.5">
                      {future || !known.length ? <span className="text-faint">–</span> : ro(sum(known))}
                      {!future && known.length > 0 && known.length < vals.length && c.year * 100 + i + 1 <= Number(stats.to.slice(0, 7).replace('-', '')) && (
                        <span className="text-faint" title="lună cu zile necitite sau încă neindexate">*</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">* lună cu zile necitite sau încă neindexate: cifra e o limită de jos.</p>
      </div>
    </details>
  );
}
