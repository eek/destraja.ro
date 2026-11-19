import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { BANDS, OUTCOMES, WAITS, getUitate, type OutcomeKey } from '@/lib/uitate';
import { todayISO } from '@/lib/format';
import { Container, linkCls, panel } from '@/components/ui';
import { BAND_PAINT, Bar, Legend, PAINT, SectionTitle, Stat, WaitingRow, dateRo, duration, many, nr, pct } from '@/components/uitate/parts';

const DESCRIPTION =
  'De cât timp așteaptă proiectele de lege aflate la Camera Deputaților, unde s-au oprit și ce s-a întâmplat cu proiectele înregistrate în fiecare an, din 2020 încoace.';

export const metadata: Metadata = {
  title: 'Proiecte uitate',
  description: DESCRIPTION,
  openGraph: { title: 'Proiecte uitate · destrajă.ro', description: DESCRIPTION },
};

// Ordinea segmentelor în graficul pe ani: întâi ce a plecat de la Cameră, apoi ce e încă acolo (cele fără pas la capăt).
const COHORT_ORDER: OutcomeKey[] = ['lege', 'incheiat', 'altundeva', 'activ', 'nemiscat', 'necunoscut'];
const outcomeLabel = (k: OutcomeKey) => OUTCOMES.find((o) => o.key === k)!.label;
const SHOWN = 10;

export default async function UitatePage() {
  const today = todayISO();
  const d = await getUitate(today);
  if (!d) return <Container className="py-16">Datele Camerei lipsesc.</Container>;

  const band = (k: string) => d.bands.find((b) => b.key === k)!.count;
  const bandMax = Math.max(...d.bands.map((b) => b.count));
  const waitMax = Math.max(...d.byWait.map((w) => w.count));
  const past = d.cohorts.filter((c) => c.an < new Date(`${today}T00:00:00Z`).getUTCFullYear());
  const pastFull = past.filter((c) => c.complet);
  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
  const pastTotal = sum(pastFull.map((c) => c.inregistrate));
  const pastLaws = sum(pastFull.map((c) => c.counts.lege));
  const pastStale = sum(pastFull.map((c) => c.counts.nemiscat));
  const cohortMax = Math.max(...d.cohorts.map((c) => c.inregistrate));
  const first = d.cohorts[0];
  const current = d.cohorts.at(-1)!;
  const firstYear = first?.an ?? 2020;
  const listDate = pastFull[0]?.cititLa?.slice(0, 10);
  const committees = d.committees.slice(0, 8);
  const commMax = Math.max(...committees.map((c) => c.asteapta));
  const gov = d.initiators.find((i) => i.key === 'guvern')!;
  const mps = d.initiators.find((i) => i.key === 'parlamentari')!;
  const comisii = d.byWait.find((w) => w.key === 'comisii')!;
  const raport = d.byWait.find((w) => w.key === 'raport')!;
  const ties = d.oldest ? d.longest.filter((b) => b.days === d.oldest!.days).length : 0;

  return (
    <>
      {/* ─── Deschiderea ─────────────────────────────────────────────────────────────────────────────────────── */}
      <section aria-labelledby="uitate-title" className="border-b border-line">
        <Container className="pt-10 pb-12 sm:pt-14 sm:pb-16 lg:pt-[72px]">
          <h1 id="uitate-title" className="font-display text-[clamp(2.6rem,6.4vw,4.6rem)] font-normal leading-[1.02] tracking-[-0.03em]">
            Proiecte uitate
          </h1>
          <p className="mt-6 max-w-[30ch] font-display text-[clamp(1.55rem,3.1vw,2.35rem)] font-normal leading-[1.2] tracking-[-0.015em]">
            <span className="text-muted">La Camera Deputaților sunt în dezbatere {many(d.total, 'proiect', 'proiecte')}. </span>
            <span className="text-ink">
              {nr(d.over1)} dintre ele n-au mai avut niciun pas procedural de peste un an.
            </span>
          </p>
          <p className="mt-5 max-w-[62ch] text-[15px] leading-7 text-body">
            Pentru {many(d.decisional.decizionala, 'proiect', 'proiecte')} din acestea Camera are ultimul cuvânt, iar Constituția nu îi dă un termen pentru votul
            final. Proiectele nu expiră nici la alegeri: rămân deschise până când cineva le votează, le respinge sau le retrage. Numărăm proiectele
            înregistrate la Cameră din {firstYear} încoace, după fișele de pe cdep.ro, la {dateRo(today)}.
          </p>
          <p className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <a href="#cele-mai-vechi" className={linkCls}>
              Cele mai vechi
            </a>
            <a href="#pe-ani" className={linkCls}>
              Ce s-a întâmplat în fiecare an
            </a>
            <a href="#cum-calculam" className={linkCls}>
              Cum calculăm
            </a>
          </p>
        </Container>
      </section>

      {/* ─── De când așteaptă ────────────────────────────────────────────────────────────────────────────────── */}
      <Container className="py-12 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-14">
          <section aria-labelledby="vechime" className={`${panel} p-5 sm:p-6`}>
            <h2 id="vechime" className="text-lg font-semibold text-ink">
              De când n-au mai avut un pas procedural
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              Toate cele {many(d.total, 'proiect', 'proiecte')} aflate acum la Cameră, după vechimea ultimului pas.
            </p>
            <ul className="mt-6 space-y-5">
              {BANDS.filter((b) => b.key !== 'necunoscut' || band(b.key) > 0).map((b) => (
                <li key={b.key}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="text-[15px] font-semibold text-ink">{b.label}</span>
                    <span className="text-[15px] tabular-nums text-body">
                      <strong className="font-semibold text-ink">{nr(band(b.key))}</strong>
                      <span className="text-muted"> · {pct(band(b.key), d.total)}%</span>
                    </span>
                  </div>
                  <Bar label={`${b.label}: ${nr(band(b.key))} proiecte`} parts={[{ value: band(b.key), paint: BAND_PAINT[b.key] }]} scale={bandMax} h={18} />
                </li>
              ))}
            </ul>
            <p className="mt-6 border-t border-line pt-4 text-[13px] leading-5 text-muted">
              Un pas procedural e trimiterea la comisii, un raport, o dezbatere sau un vot în plen, trimiterea la cealaltă cameră sau înapoi. Avizele
              primite și înscrierile pe ordinea de zi nu se numără. <a href="#cum-calculam" className="underline underline-offset-2 hover:text-ink">Detalii</a>
            </p>
          </section>

          <div className="grid content-start gap-6 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Stat value={nr(d.over2)}>n-au avut niciun pas de peste doi ani, iar {nr(d.over4)} de peste patru ani.</Stat>
            {d.oldest?.days != null && (
              <Stat value={`${nr(d.oldest.days)} de zile`}>
                {ties > 1 ? `atât așteaptă cele mai vechi ${ties} proiecte, ajunse la Cameră` : `atât așteaptă cel mai vechi proiect, ${d.oldest.numar}, ajuns la Cameră`} pe{' '}
                {dateRo(d.oldest.last?.date ?? d.oldest.inregistrat)}, fără niciun pas de atunci ({duration(d.oldest.days)}).
              </Stat>
            )}
            <Stat value={nr(raport.over1)}>au raportul comisiei gata, dar n-au mai avut niciun pas de peste un an.</Stat>
            <Stat value={nr(d.ordonante.over1)}>
              dintre cele fără pas de peste un an aprobă sau resping o ordonanță a Guvernului. Ordonanța se aplică deja, de la publicare.
            </Stat>
          </div>
        </div>
      </Container>

      {/* ─── Cele mai vechi ──────────────────────────────────────────────────────────────────────────────────── */}
      <section aria-labelledby="cele-mai-vechi" className="border-y border-line bg-sunken/60">
        <Container className="py-12 sm:py-16">
          <SectionTitle
            id="cele-mai-vechi"
            lead={
              <>
                Cele {d.longest.length} de proiecte aflate la Cameră care n-au mai avut niciun pas procedural de cel mai mult timp.{' '}
                {d.tacitInLongest > 0 && (
                  <>
                    {d.tacitInLongest === d.longest.length ? 'Toate' : `${nr(d.tacitInLongest)} dintre ele`} au venit de la Senat adoptate tacit: Senatului
                    i-a trecut termenul fără vot, iar la Cameră, unde nu există termen, așteaptă de atunci.
                  </>
                )}
              </>
            }
          >
            Proiectele care așteaptă de cel mai mult timp
          </SectionTitle>
          <div className={`${panel} mt-8 px-5 sm:px-6`}>
            <ol className="-mt-px">
              {d.longest.slice(0, SHOWN).map((b, i) => (
                <WaitingRow key={b.slug} b={b} rank={i + 1} />
              ))}
            </ol>
            {d.longest.length > SHOWN && (
              <details className="group border-t border-line">
                <summary className="flex min-h-12 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
                  <span className="group-open:hidden">Încă {d.longest.length - SHOWN}</span>
                  <span className="hidden group-open:inline">Mai puține</span>
                </summary>
                <ol start={SHOWN + 1}>
                  {d.longest.slice(SHOWN).map((b, i) => (
                    <WaitingRow key={b.slug} b={b} rank={SHOWN + i + 1} />
                  ))}
                </ol>
              </details>
            )}
          </div>
          <p className="mt-4 max-w-[68ch] text-[13px] leading-5 text-muted">
            Toate proiectele aflate la Cameră, cu filtre după stadiu și an, sunt pe pagina{' '}
            <Link href="/camera?an=vechi" className="underline underline-offset-2 hover:text-ink">
              La Camera Deputaților
            </Link>
            .
          </p>
        </Container>
      </section>

      {/* ─── Unde așteaptă ───────────────────────────────────────────────────────────────────────────────────── */}
      <Container className="py-12 sm:py-16">
        <SectionTitle
          id="unde"
          lead={
            <>
              Cele mai multe stau la comisii, fără raport: {nr(comisii.count)}, dintre care {nr(comisii.over1)} fără niciun pas de peste un an. Alte{' '}
              {nr(raport.count)} au raportul gata și așteaptă să fie puse pe ordinea de zi și votate; asta ține de plen, nu de comisie.
            </>
          }
        >
          Unde așteaptă proiectele?
        </SectionTitle>
        <div className="mt-8 grid gap-10 lg:grid-cols-2 lg:gap-14">
          <section aria-label="Proiectele aflate la Cameră, după stadiu" className={`${panel} p-5 sm:p-6`}>
            <Legend
              items={[
                { key: 'w-nemiscat', label: 'Fără pas de peste un an', paint: PAINT.nemiscat },
                { key: 'w-activ', label: 'Cu un pas în ultimul an', paint: PAINT.activ },
              ]}
            />
            <ul className="mt-6 space-y-5">
              {WAITS.map((w) => {
                const row = d.byWait.find((x) => x.key === w.key)!;
                if (!row.count) return null;
                return (
                  <li key={w.key}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <span className="text-[15px] font-semibold text-ink">{w.label}</span>
                      <span className="shrink-0 text-[15px] tabular-nums text-body">
                        <strong className="font-semibold text-ink">{nr(row.count)}</strong>
                        <span className="text-muted"> · {nr(row.over1)} peste un an</span>
                      </span>
                    </div>
                    <Bar
                      label={`${w.label}: ${nr(row.count)} proiecte, ${nr(row.over1)} fără pas de peste un an`}
                      parts={[
                        { value: row.over1, paint: PAINT.nemiscat },
                        { value: row.count - row.over1, paint: PAINT.activ },
                      ]}
                      scale={waitMax}
                    />
                    <p className="mt-1.5 text-[13px] leading-5 text-muted">
                      {w.hint}
                      {row.subRezerva > 0 && ` ${many(row.subRezerva, 'proiect apare', 'proiecte apar')} pe ordinea de zi „sub rezerva depunerii raportului”.`}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="comisii" className={`${panel} p-5 sm:p-6`}>
            <h3 id="comisii" className="text-lg font-semibold text-ink">
              Comisiile cu cele mai multe proiecte fără raport
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted">
              Doar proiectele care așteaptă raportul comisiei (sau raportul suplimentar). Un proiect trimis la două comisii pentru raport comun apare la
              amândouă. Comisiile mari primesc și cele mai multe proiecte.
            </p>
            <ul className="mt-6 space-y-4">
              {committees.map((c) => (
                <li key={c.nume}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="min-w-0 text-[14px] font-semibold leading-5 text-ink">{c.nume}</span>
                    <span className="shrink-0 text-[14px] tabular-nums text-body">
                      <strong className="font-semibold text-ink">{nr(c.asteapta)}</strong>
                      <span className="text-muted"> · {nr(c.pestUnAn)} peste un an</span>
                    </span>
                  </div>
                  <Bar
                    label={`${c.nume}: ${nr(c.asteapta)} proiecte fără raport, ${nr(c.pestUnAn)} fără pas de peste un an`}
                    parts={[
                      { value: c.pestUnAn, paint: PAINT.nemiscat },
                      { value: c.asteapta - c.pestUnAn, paint: PAINT.activ },
                    ]}
                    scale={commMax}
                    h={12}
                  />
                </li>
              ))}
            </ul>
          </section>
        </div>
      </Container>

      {/* ─── Pe ani ──────────────────────────────────────────────────────────────────────────────────────────── */}
      <section aria-labelledby="pe-ani" className="border-y border-line bg-sunken/60">
        <Container className="py-12 sm:py-16">
          <SectionTitle
            id="pe-ani"
            lead={
              pastFull.length > 0 ? (
                <>
                  Din cele {many(pastTotal, 'proiect', 'proiecte')} înregistrate la Cameră în {pastFull[0].an}–{pastFull.at(-1)!.an},{' '}
                  {pastLaws === 1 ? 'unul a devenit lege' : `${nr(pastLaws)} au devenit legi`} ({pct(pastLaws, pastTotal)}%). Cele rămase la Cameră fără niciun pas de peste un an
                  sunt {nr(pastStale)} ({pct(pastStale, pastTotal)}%): nu se pierd, dar nici nu se încheie, și se adună de la an la an.
                </>
              ) : (
                <>Pentru anii trecuți avem deocamdată doar proiectele încă în dezbatere.</>
              )
            }
          >
            Ce s-a întâmplat cu proiectele înregistrate în fiecare an?
          </SectionTitle>

          <div className={`${panel} mt-8 p-5 sm:p-6`}>
            <Legend items={COHORT_ORDER.filter((k) => k !== 'necunoscut' || d.cohorts.some((c) => c.counts.necunoscut)).map((k) => ({ key: `c-${k}`, label: outcomeLabel(k), paint: PAINT[k] }))} />
            <ul className="mt-7 space-y-6">
              {d.cohorts.map((c) => {
                const atChamber = c.counts.activ + c.counts.nemiscat + c.counts.necunoscut;
                const isCurrent = c === current;
                return (
                  <li key={c.an}>
                    <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <span className="text-[15px] font-semibold tabular-nums text-ink">
                        {c.an}
                        <span className="font-normal text-muted">
                          {' '}
                          · {many(c.inregistrate, 'proiect', 'proiecte')}
                          {isCurrent && `, până la ${dateRo(today).replace(/ \d{4}$/, '')}`}
                        </span>
                      </span>
                      <span className="text-[13.5px] tabular-nums text-body">
                        {nr(c.counts.lege)} legi · {nr(atChamber)} la Cameră
                        {c.counts.nemiscat > 0 && <span className="text-muted">, {nr(c.counts.nemiscat)} fără pas &gt; 1 an</span>}
                      </span>
                    </div>
                    {c.complet ? (
                      <Bar
                        label={`${c.an}: ${COHORT_ORDER.map((k) => `${outcomeLabel(k)} ${c.counts[k]}`).join(', ')}`}
                        parts={COHORT_ORDER.map((k) => ({ value: c.counts[k], paint: PAINT[k] }))}
                        scale={cohortMax}
                        h={22}
                      />
                    ) : (
                      <>
                        <Bar
                          label={`${c.an}: doar proiectele încă la Cameră`}
                          parts={[
                            { value: c.counts.nemiscat, paint: PAINT.nemiscat },
                            { value: c.counts.activ, paint: PAINT.activ },
                          ]}
                          scale={cohortMax}
                          h={22}
                        />
                        <p className="mt-1 text-[13px] text-muted">Avem doar proiectele încă la Cameră; lista completă a anului nu e citită încă.</p>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-6 border-t border-line pt-4 text-[13px] leading-5 text-muted">
              Fiecare bară are lungimea numărului de proiecte înregistrate la Cameră în acel an și arată unde sunt azi. Rezultatul vine din fișa
              proiectului, pentru cele pe care le urmărim, și din lista Camerei pe acel an{listDate ? `, citită pe ${dateRo(listDate)}` : ''}, pentru
              celelalte. {current.an} e un an neîncheiat: proiectele lui au avut mai puțin timp.
            </p>
          </div>

          <details className="group mt-6 max-w-5xl">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
              Cifrele, pe ani
            </summary>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="w-full min-w-[640px] text-left text-sm tabular-nums">
                <thead className="text-xs text-muted">
                  <tr className="border-b border-line">
                    <th className="px-4 py-3 font-semibold">Anul</th>
                    <th className="px-4 py-3 text-right font-semibold">Înregistrate</th>
                    {COHORT_ORDER.filter((k) => k !== 'necunoscut' || d.cohorts.some((c) => c.counts.necunoscut)).map((k) => (
                      <th key={k} className="px-4 py-3 text-right font-semibold">
                        {outcomeLabel(k)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line text-body">
                  {d.cohorts.map((c) => (
                    <tr key={c.an}>
                      <th className="px-4 py-2.5 font-semibold text-ink">{c.an}</th>
                      <td className="px-4 py-2.5 text-right">{c.complet ? nr(c.inregistrate) : `${nr(c.inregistrate)}*`}</td>
                      {COHORT_ORDER.filter((k) => k !== 'necunoscut' || d.cohorts.some((x) => x.counts.necunoscut)).map((k) => (
                        <td key={k} className="px-4 py-2.5 text-right">
                          {c.complet || ['activ', 'nemiscat'].includes(k) ? nr(c.counts[k]) : '–'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Container>
      </section>

      {/* ─── Cine le-a propus ────────────────────────────────────────────────────────────────────────────────── */}
      <Container className="py-12 sm:py-16">
        <SectionTitle
          id="initiatori"
          lead={
            <>
              Proiectele rămân în urmă și când vin de la Guvern, nu doar de la parlamentari: {pct(gov.over1, gov.total)}% dintre proiectele Guvernului aflate la
              Cameră n-au avut niciun pas de peste un an, față de {pct(mps.over1, mps.total)}% dintre cele ale parlamentarilor. Aproape toate proiectele
              Guvernului de aici ({nr(gov.ordonante)} din {nr(gov.total)}) aprobă sau resping ordonanțe care se aplică deja.
            </>
          }
        >
          Cine le-a propus?
        </SectionTitle>
        <div className={`${panel} mt-8 max-w-3xl p-5 sm:p-6`}>
          <Legend
            items={[
              { key: 'i-nemiscat', label: 'Fără pas de peste un an', paint: PAINT.nemiscat },
              { key: 'i-activ', label: 'Cu un pas în ultimul an', paint: PAINT.activ },
            ]}
          />
          <ul className="mt-6 space-y-5">
            {[
              { k: 'guvern', label: 'Guvernul', row: gov },
              { k: 'parlamentari', label: 'Parlamentari (deputați sau senatori)', row: mps },
              { k: 'ordonante', label: 'Dintre toate: aprobarea sau respingerea unei ordonanțe', row: { total: d.ordonante.total, over1: d.ordonante.over1 } },
            ].map(({ k, label, row }) => (
              <li key={k}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="text-[15px] font-semibold text-ink">{label}</span>
                  <span className="shrink-0 text-[15px] tabular-nums text-body">
                    <strong className="font-semibold text-ink">{nr(row.total)}</strong>
                    <span className="text-muted"> · {nr(row.over1)} peste un an</span>
                  </span>
                </div>
                <Bar
                  label={`${label}: ${nr(row.total)} proiecte, ${nr(row.over1)} fără pas de peste un an`}
                  parts={[
                    { value: row.over1, paint: PAINT.nemiscat },
                    { value: row.total - row.over1, paint: PAINT.activ },
                  ]}
                  scale={d.total}
                />
              </li>
            ))}
          </ul>
          <p className="mt-6 border-t border-line pt-4 text-[13px] leading-5 text-muted">
            Nu împărțim pe partide: un proiect are adesea inițiatori din mai multe partide, iar majoritatea s-a schimbat de câteva ori din {firstYear} încoace.
            Cifrele pe partide s-ar suprapune și ar spune puțin despre cine a ținut un proiect pe loc.
          </p>
        </div>
      </Container>

      {/* ─── De ce ───────────────────────────────────────────────────────────────────────────────────────────── */}
      <section aria-labelledby="de-ce" className="border-y border-line bg-sunken/60">
        <Container className="py-12 sm:py-16">
          <SectionTitle id="de-ce">De ce rămân proiecte în urmă</SectionTitle>
          <div className="mt-8 grid max-w-6xl gap-8 md:grid-cols-3">
            <div>
              <h3 className="text-[1.05rem] font-semibold text-ink">Așa e în orice parlament</h3>
              <p className="mt-2 text-[15px] leading-7 text-body">
                Multe propuneri nu ajung la vot nicăieri: unele sunt depuse ca să pună o temă pe agendă, altele se suprapun cu un proiect adoptat între timp,
                iar majoritatea preferă adesea să lase un proiect la comisie decât să-l respingă în plen. Un proiect fără pași nu înseamnă că nimeni nu
                lucrează, ci că nimeni nu l-a dus mai departe.
              </p>
            </div>
            <div>
              <h3 className="text-[1.05rem] font-semibold text-ink">La noi nu expiră</h3>
              <p className="mt-2 text-[15px] leading-7 text-body">
                În Germania, proiectele nevotate cad la sfârșitul legislaturii; în Statele Unite, la sfârșitul fiecărui Congres de doi ani. În România
                trec de la o legislatură la alta, iar camera care decide la final nu are un termen. Prima cameră are unul (adoptarea tacită), de aceea
                aproape toate proiectele vechi stau la Cameră ca for decizional.
              </p>
            </div>
            <div>
              <h3 className="text-[1.05rem] font-semibold text-ink">De ce contează</h3>
              <p className="mt-2 text-[15px] leading-7 text-body">
                O ordonanță nevotată se aplică ani la rând fără ca Parlamentul s-o fi aprobat sau corectat. Iar un proiect trecut de Senat și lăsat la
                Cameră poate fi reluat oricând, modificat prin amendamente și votat în câteva zile. Proiectele vechi nu sunt doar arhivă.
              </p>
            </div>
          </div>
        </Container>
      </section>

      {/* ─── Cum calculăm ────────────────────────────────────────────────────────────────────────────────────── */}
      <Container className="py-12 sm:py-16">
        <SectionTitle id="cum-calculam">Cum calculăm</SectionTitle>
        <dl className="mt-8 max-w-[72ch] divide-y divide-line border-y border-line text-[15px] leading-7">
          <div className="py-5">
            <dt className="font-semibold text-ink">Proiecte aflate la Cameră</dt>
            <dd className="mt-1 text-body">
              Proiectele cu număr de Cameră (PL-x, Pl-x) înregistrate din {firstYear} încoace, aflate acum la comisii, cu raport, pe ordinea de zi, la avize
              sau în reexaminare, după fișa fiecăruia de pe cdep.ro (aceleași ca pe pagina{' '}
              <Link href="/camera" className={linkCls}>
                La Camera Deputaților
              </Link>
              ). Cele plecate la Senat, la promulgare sau încheiate nu intră.
            </dd>
          </div>
          <div className="py-5">
            <dt className="font-semibold text-ink">Pas procedural</dt>
            <dd className="mt-1 text-body">
              Un rând din „derularea procedurii” care mută proiectul: sosirea la Cameră, trimiterea la comisii pentru raport (sau schimbarea comisiei),
              raportul comisiei, retrimiterea la comisii pentru raport suplimentar, dezbaterea sau votul în plen, adoptarea tacită, trimiterea la cealaltă
              cameră, la promulgare sau înapoi pentru reexaminare, o decizie a Curții Constituționale. <strong className="font-semibold text-ink">Nu</strong>{' '}
              se numără: avizele și punctele de vedere primite (Consiliul Legislativ, CES, Guvernul, comisiile pentru aviz), termenele și prelungirile lor,
              înscrierea pe ordinea de zi fără dezbatere și retragerea unei semnături. Un proiect poate apărea ani la rând pe ordinea de zi „sub rezerva
              depunerii raportului” fără să se miște.
            </dd>
          </div>
          <div className="py-5">
            <dt className="font-semibold text-ink">Zile fără pas</dt>
            <dd className="mt-1 text-body">
              Zilele calendaristice de la ultimul pas procedural până azi, cu tot cu vacanțele parlamentare, ca oricine să le poată verifica pe cdep.ro. Un
              proiect trece de „un an” a doua zi după aniversarea ultimului pas. Retrimiterea la comisii pentru un raport suplimentar e un pas: ceasul
              pornește din nou, dar data înregistrării rămâne pe listă. Data înregistrării la Cameră, din lista Camerei, e și ea un pas, pentru fișele în
              care sosirea nu apare ca rând.
            </dd>
          </div>
          <div className="py-5">
            <dt className="font-semibold text-ink">Ce s-a întâmplat în fiecare an</dt>
            <dd className="mt-1 text-body">
              Anul înregistrării la Cameră (anul din numărul PL-x), cu toate proiectele din lista Camerei pe acel an. „Au devenit legi” înseamnă stadiul
              „Lege nr./an” (promulgată); „respinse sau încheiate”: respinse definitiv, retrase, clasate sau cu procedura încetată. Pentru proiectele pe care
              le urmărim folosim fișa, mai nouă decât lista. Nu arătăm durata medie până la lege pe anul înregistrării: proiectele din anii recenți care au
              ajuns deja legi sunt cele rapide, iar cele lente n-au apucat, așa că anii recenți ar părea mereu mai rapizi.
            </dd>
          </div>
          <div className="py-5">
            <dt className="font-semibold text-ink">Ordonanțe</dt>
            <dd className="mt-1 text-body">
              Proiectele care aprobă sau resping o ordonanță a Guvernului (de urgență sau simplă), după titlu. Ordonanța se aplică de la publicarea în
              Monitorul Oficial, înainte de votul Parlamentului, așa că un astfel de proiect fără pași nu ține pe loc o regulă nouă: amână decizia
              Parlamentului asupra ei.
            </dd>
          </div>
          <div className="py-5">
            <dt className="font-semibold text-ink">De ce cifrele diferă puțin de alte numărători</dt>
            <dd className="mt-1 text-body">
              După stadiul scris în listele Camerei, la Cameră ar fi {many(d.reconcile.listAtChamber, 'proiect', 'proiecte')}. Lista rămâne uneori în urmă:
              după fișe, {many(d.reconcile.sheetLeft, 'proiect a plecat', 'proiecte au plecat')} între timp (adoptate, trimise la Senat sau încheiate)
              {d.reconcile.sheetBack > 0 && <>, iar {many(d.reconcile.sheetBack, 'proiect s-a întors', 'proiecte s-au întors')}</>}. Numărăm după fișe:{' '}
              {nr(d.total)}. O numărătoare care ia orice rând din fișă drept pas (și avizele, și ordinea de zi) dă mai puține proiecte fără pas de peste un an
              decât a noastră.
            </dd>
          </div>
          <div className="py-5">
            <dt className="font-semibold text-ink">Ce nu e încă aici</dt>
            <dd className="mt-1 text-body">
              Proiectele înregistrate înainte de {firstYear}:{' '}
              {d.older.years.length > 0 ? (
                <>
                  listele Camerei arată și proiecte mai vechi încă în dezbatere (
                  {d.older.years.map((y, i) => (
                    <span key={y.an}>
                      {i > 0 && ', '}
                      {nr(y.atChamber)} din {y.an}
                    </span>
                  ))}
                  , după listele citite pe {dateRo(d.older.years[0].cititLa.slice(0, 10))}); le adăugăm după ce le citim fișele.
                </>
              ) : (
                <>nu le-am citit încă.</>
              )}{' '}
              Senatul: proiectele pentru care Senatul decide la final pot sta și ele ani de zile, dar le vom număra separat. Data publicării legilor în
              Monitorul Oficial nu o avem încă pentru toate.
            </dd>
          </div>
          <div className="py-5">
            <dt className="font-semibold text-ink">Sursa</dt>
            <dd className="mt-1 text-body">
              Listele pe ani și fișele proiectelor de pe{' '}
              <a href="https://www.cdep.ro/ords/pls/proiecte/upl_pck2015.lista?cam=2&anp=2026" target="_blank" rel="noopener noreferrer" className={linkCls}>
                cdep.ro
              </a>
              , citite încet, câte o pagină pe minut. Lista anului curent se citește în fiecare zi
              {d.cititLa ? ` (ultima dată pe ${dateRo(d.cititLa.slice(0, 10))})` : ''}, fișele după fiecare schimbare.
            </dd>
          </div>
        </dl>
      </Container>
    </>
  );
}
