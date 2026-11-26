import type { Metadata } from 'next';
import Link from 'next/link';
import { BANDS, OUTCOMES, WAITS, getUitate, type OutcomeKey } from '@/lib/uitate';
import { todayISO } from '@/lib/format';
import { Container, linkCls, panel } from '@/components/ui';
import { BAND_PAINT, Bar, BarRow, Legend, More, PAINT, SectionTitle, Stat, dateRo, dateShort, many, nr, pct } from '@/components/uitate/parts';
import WaitingExplorer from '@/components/uitate/WaitingExplorer';
import { EMPTY, TACIT_TEXT, toHash, toListRow, type ListFilters } from '@/lib/uitate-list';

const DESCRIPTION =
  'De cât timp așteaptă proiectele de lege aflate la Camera Deputaților, unde s-au oprit și ce s-a întâmplat cu proiectele înregistrate în fiecare an, din 2020 încoace.';

export const metadata: Metadata = {
  alternates: { canonical: '/uitate' },
  title: 'Proiecte uitate',
  description: DESCRIPTION,
  openGraph: { title: 'Proiecte uitate · destrajă.ro', description: DESCRIPTION },
};

// Ordinea segmentelor în graficul pe ani (validată pentru daltonism: vecinii se deosebesc): ce a plecat de la Cameră,
// apoi ce e încă acolo, cu cele fără pas la capăt.
const COHORT_ORDER: OutcomeKey[] = ['incheiat', 'lege', 'altundeva', 'activ', 'nemiscat', 'necunoscut'];
const outcomeLabel = (k: OutcomeKey) => OUTCOMES.find((o) => o.key === k)!.label;
// Adresa listei filtrate, pentru barele care duc la ea.
const listHref = (patch: Partial<ListFilters>) => toHash({ ...EMPTY, ...patch });
// Legenda scurtă, ca să încapă pe două rânduri pe telefon; numele întregi sunt în tabel și în etichetele barelor.
const SHORT: Record<OutcomeKey, string> = {
  incheiat: 'Respinse, încheiate',
  lege: 'Legi',
  altundeva: 'La Senat, la promulgare',
  activ: 'La Cameră, activ',
  nemiscat: 'La Cameră, fără pas > 1 an',
  necunoscut: 'Necunoscut',
};
const COMMITTEES_SHOWN = 5;
const section = 'py-8 sm:py-12';
const sunkenBand = 'border-y border-line bg-sunken/60';

export default async function UitatePage() {
  const today = todayISO();
  const d = await getUitate(today);
  if (!d) return <Container className="py-16">Datele Camerei lipsesc.</Container>;

  const band = (k: string) => d.bands.find((b) => b.key === k)!.count;
  const bandMax = Math.max(...d.bands.map((b) => b.count));
  const waitMax = Math.max(...d.byWait.map((w) => w.count));
  const year = Number(today.slice(0, 4));
  const pastFull = d.cohorts.filter((c) => c.an < year && c.complet);
  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
  const pastTotal = sum(pastFull.map((c) => c.inregistrate));
  const pastLaws = sum(pastFull.map((c) => c.counts.lege));
  const pastStale = sum(pastFull.map((c) => c.counts.nemiscat));
  const cohortMax = Math.max(...d.cohorts.map((c) => c.inregistrate));
  const current = d.cohorts.at(-1)!;
  const firstYear = d.cohorts[0]?.an ?? 2020;
  const listDate = pastFull[0]?.cititLa?.slice(0, 10);
  const commMax = Math.max(...d.committees.map((c) => c.asteapta));
  const gov = d.initiators.find((i) => i.key === 'guvern')!;
  const mps = d.initiators.find((i) => i.key === 'parlamentari')!;
  const comisii = d.byWait.find((w) => w.key === 'comisii')!;
  const raport = d.byWait.find((w) => w.key === 'raport')!;
  const ties = d.oldest ? d.longest.filter((b) => b.days === d.oldest!.days).length : 0;
  const usedOutcomes = COHORT_ORDER.filter((k) => k !== 'necunoscut' || d.cohorts.some((c) => c.counts.necunoscut));

  const committeeRow = (c: (typeof d.committees)[number]) => (
    <BarRow key={c.nume} label={c.nume} value={nr(c.asteapta)} note={`${nr(c.pestUnAn)} > 1 an`} href={listHref({ comisie: c.nume })}>
      <Bar
        label={`${c.nume}: ${nr(c.asteapta)} proiecte fără raport, ${nr(c.pestUnAn)} fără pas de peste un an`}
        parts={[
          { value: c.pestUnAn, paint: PAINT.nemiscat },
          { value: c.asteapta - c.pestUnAn, paint: PAINT.activ },
        ]}
        scale={commMax}
        h={8}
      />
    </BarRow>
  );
  const staleLegend = (
    <Legend
      items={[
        { key: 'nemiscat', label: 'Fără pas de peste un an', paint: PAINT.nemiscat },
        { key: 'activ', label: 'Cu un pas în ultimul an', paint: PAINT.activ },
      ]}
    />
  );

  return (
    <>
      {/* ─── Deschiderea: titlul, propoziția, vechimea și patru cifre ───────────────────────────────────────────── */}
      <section aria-labelledby="uitate-title" className="border-b border-line">
        <Container className="pt-8 pb-8 sm:pt-12 sm:pb-12">
          <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
            <div>
              <h1 id="uitate-title" className="font-display text-[clamp(2.3rem,5.6vw,4rem)] font-normal leading-[1.02] tracking-[-0.03em]">
                Proiecte uitate
              </h1>
              <p className="mt-4 font-display text-[clamp(1.3rem,2.6vw,1.95rem)] font-normal leading-[1.22] tracking-[-0.015em]">
                <span className="text-muted">La Camera Deputaților sunt în dezbatere {many(d.total, 'proiect', 'proiecte')}. </span>
                <span className="text-ink">{nr(d.over1)} n-au mai avut niciun pas procedural de peste un an.</span>
              </p>
              <p className="mt-3 max-w-[60ch] text-[14.5px] leading-6 text-body">
                Pentru {nr(d.decisional.decizionala)} dintre ele Camera are ultimul cuvânt și nu are termen, iar proiectele nu expiră la alegeri. Numărăm
                proiectele înregistrate din {firstYear}, după fișele de pe cdep.ro ({dateRo(today)}).{' '}
                <a href="#cum-calculam" className={linkCls}>
                  Cum calculăm
                </a>
              </p>
            </div>

            <section aria-labelledby="vechime" className={`${panel} self-start p-4 sm:p-5`}>
              <h2 id="vechime" className="text-[15px] font-semibold text-ink">
                De când n-au mai avut un pas procedural
              </h2>
              <ul className="mt-3 space-y-2">
                {BANDS.filter((b) => b.key !== 'necunoscut' || band(b.key) > 0).map((b) => (
                  <BarRow key={b.key} label={b.label} value={nr(band(b.key))} note={`${pct(band(b.key), d.total)}%`} href={listHref({ vechime: b.key })}>
                    <Bar label={`${b.label}: ${nr(band(b.key))} proiecte`} parts={[{ value: band(b.key), paint: BAND_PAINT[b.key] }]} scale={bandMax} h={10} />
                  </BarRow>
                ))}
              </ul>
              <More summary="Ce e un pas procedural" className="mt-2">
                Trimiterea la comisii, un raport, o dezbatere sau un vot în plen, trimiterea la cealaltă cameră sau înapoi. Avizele primite și înscrierile pe
                ordinea de zi nu se numără.
              </More>
            </section>
          </div>

          <div className="mt-7 grid grid-cols-2 gap-x-5 gap-y-5 lg:grid-cols-4">
            <Stat value={nr(d.over2)}>fără pas de peste 2 ani; {nr(d.over4)} de peste 4.</Stat>
            {d.oldest?.days != null && (
              <Stat value={`${nr(d.oldest.days)} zile`}>
                {ties > 1 ? `cele mai vechi ${ties}` : `cel mai vechi, ${d.oldest.numar}`}, fără pas din {dateShort(d.oldest.last?.date ?? d.oldest.inregistrat)}.
              </Stat>
            )}
            <Stat value={nr(raport.over1)}>cu raportul gata, dar fără pas de peste un an.</Stat>
            <Stat value={nr(d.ordonante.over1)}>fără pas, despre o ordonanță care se aplică deja.</Stat>
          </div>
        </Container>
      </section>

      {/* ─── Lista tuturor, cu filtre ────────────────────────────────────────────────────────────────────────── */}
      <section aria-labelledby="cele-mai-vechi" className={sunkenBand}>
        <Container className={section}>
          <SectionTitle
            id="cele-mai-vechi"
            lead={
              <>
                {d.tacitInLongest > 0
                  ? `${nr(d.tacitInLongest)} din primele ${d.longest.length} au trecut de Senat fără vot: Senatul nu le-a votat în 45 de zile (60 pentru coduri), așa că s-au considerat adoptate, iar Camera, care decide la final, nu are termen.`
                  : 'Toate proiectele aflate la Cameră, cele care așteaptă de cel mai mult timp primele.'}
              </>
            }
          >
            Cele mai vechi
          </SectionTitle>
          <div className="mt-5">
            <WaitingExplorer
              initial={d.all.slice(0, 10).map(toListRow)}
              total={d.total}
              stages={WAITS.filter((w) => d.byWait.find((x) => x.key === w.key)!.count > 0).map((w) => ({ key: w.key, label: w.label }))}
              bands={BANDS.filter((b) => band(b.key) > 0).map((b) => ({ key: b.key, label: b.label }))}
              committees={d.committees.map((c) => c.nume).sort((a, b) => a.localeCompare(b, 'ro'))}
              years={[...new Set(d.all.map((b) => b.an))].sort((a, b) => b - a)}
            />
          </div>
          <p className="mt-2 text-[12.5px] leading-5 text-muted">
            Aceleași proiecte, cu riscul analizat și termenele de amendamente:{' '}
            <Link href="/camera?an=vechi" className="underline underline-offset-2 hover:text-ink">
              La Camera Deputaților
            </Link>
          </p>
        </Container>
      </section>

      {/* ─── Unde așteaptă ───────────────────────────────────────────────────────────────────────────────────── */}
      <Container className={section}>
        <SectionTitle
          id="unde"
          lead={`${nr(comisii.count)} așteaptă raportul comisiei; ${nr(raport.count)} au raportul și așteaptă programarea în plen.`}
        >
          Unde așteaptă proiectele?
        </SectionTitle>
        <div className="mt-5 grid gap-5 lg:grid-cols-2 lg:gap-8">
          <section aria-label="Proiectele aflate la Cameră, după stadiu" className={`${panel} p-4 sm:p-5`}>
            {staleLegend}
            <ul className="mt-3 space-y-2">
              {WAITS.map((w) => {
                const row = d.byWait.find((x) => x.key === w.key)!;
                if (!row.count) return null;
                return (
                  <BarRow key={w.key} label={w.label} value={nr(row.count)} note={`${nr(row.over1)} > 1 an`} href={listHref({ etapa: w.key })}>
                    <Bar
                      label={`${w.label}: ${nr(row.count)} proiecte, ${nr(row.over1)} fără pas de peste un an`}
                      parts={[
                        { value: row.over1, paint: PAINT.nemiscat },
                        { value: row.count - row.over1, paint: PAINT.activ },
                      ]}
                      scale={waitMax}
                    />
                  </BarRow>
                );
              })}
            </ul>
            <More summary="Ce înseamnă fiecare stadiu" className="mt-2">
              <dl className="space-y-1.5">
                {WAITS.map((w) => {
                  const row = d.byWait.find((x) => x.key === w.key)!;
                  if (!row.count) return null;
                  return (
                    <div key={w.key}>
                      <dt className="inline font-semibold text-body">{w.label}: </dt>
                      <dd className="inline">
                        {w.hint}
                        {row.subRezerva > 0 && ` ${many(row.subRezerva, 'proiect apare', 'proiecte apar')} pe ordinea de zi „sub rezerva depunerii raportului”.`}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </More>
          </section>

          <section aria-labelledby="comisii" className={`${panel} p-4 sm:p-5`}>
            <h3 id="comisii" className="text-[15px] font-semibold text-ink">
              Comisiile cu cele mai multe proiecte fără raport
            </h3>
            <ul className="mt-3 space-y-2">{d.committees.slice(0, COMMITTEES_SHOWN).map(committeeRow)}</ul>
            <More summary={`Toate cele ${d.committees.length} de comisii și cum numărăm`} className="mt-2">
              <p className="mb-2">
                Doar proiectele care așteaptă raportul (sau raportul suplimentar). Un raport comun apare la ambele comisii. Comisiile mari primesc și cele
                mai multe proiecte.
              </p>
              <ul className="space-y-2">{d.committees.slice(COMMITTEES_SHOWN).map(committeeRow)}</ul>
            </More>
          </section>
        </div>
      </Container>

      {/* ─── Pe ani ──────────────────────────────────────────────────────────────────────────────────────────── */}
      <section aria-labelledby="pe-ani" className={sunkenBand}>
        <Container className={section}>
          <SectionTitle
            id="pe-ani"
            lead={
              pastFull.length > 0
                ? `Din cele ${many(pastTotal, 'proiect', 'proiecte')} înregistrate în ${pastFull[0].an}–${pastFull.at(-1)!.an}, ${pct(pastLaws, pastTotal)}% au devenit legi (${nr(pastLaws)}). ${pct(pastStale, pastTotal)}% (${nr(pastStale)}) sunt încă la Cameră fără niciun pas de peste un an: nu se pierd, dar nici nu se încheie.`
                : 'Pentru anii trecuți avem deocamdată doar proiectele încă în dezbatere.'
            }
          >
            Ce s-a întâmplat în fiecare an?
          </SectionTitle>

          <div className={`${panel} mt-5 p-4 sm:p-5`}>
            <Legend items={usedOutcomes.map((k) => ({ key: `c-${k}`, label: SHORT[k], paint: PAINT[k] }))} />
            <ul className="mt-4 space-y-3">
              {d.cohorts.map((c) => {
                const isCurrent = c === current;
                return (
                  <BarRow
                    key={c.an}
                    label={
                      <>
                        {c.an}
                        <span className="font-normal text-muted">
                          {' '}
                          · {nr(c.inregistrate)}
                          {isCurrent && ' (în curs)'}
                        </span>
                      </>
                    }
                    value={`${nr(c.counts.lege)} legi`}
                    note={c.counts.nemiscat > 0 ? `${nr(c.counts.nemiscat)} fără pas` : `${nr(c.counts.activ)} la Cameră`}
                  >
                    {c.complet ? (
                      <Bar
                        label={`${c.an}: ${usedOutcomes.map((k) => `${outcomeLabel(k)} ${c.counts[k]}`).join(', ')}`}
                        parts={usedOutcomes.map((k) => ({ value: c.counts[k], paint: PAINT[k] }))}
                        scale={cohortMax}
                        h={12}
                      />
                    ) : (
                      <Bar
                        label={`${c.an}: doar proiectele încă la Cameră (lista completă a anului nu e citită)`}
                        parts={[
                          { value: c.counts.nemiscat, paint: PAINT.nemiscat },
                          { value: c.counts.activ, paint: PAINT.activ },
                        ]}
                        scale={cohortMax}
                        h={12}
                      />
                    )}
                  </BarRow>
                );
              })}
            </ul>
            <More summary="Cifrele, pe ani, și de unde vin" className="mt-3">
              <p>
                Lungimea barei e numărul proiectelor înregistrate la Cameră în acel an. Rezultatul vine din fișa proiectului, pentru cele pe care le
                urmărim, și din lista Camerei pe acel an{listDate ? `, citită pe ${dateRo(listDate)}` : ''}, pentru celelalte. {current.an} e un an
                neîncheiat, până la {dateRo(today)}.
                {d.cohorts.some((c) => !c.complet) && ' Un an fără lista completă arată doar proiectele încă la Cameră.'}
              </p>
              <div className="mt-2 overflow-x-auto rounded-xl border border-line bg-surface">
                <table className="w-full min-w-[600px] text-left text-[12.5px] tabular-nums">
                  <thead className="text-muted">
                    <tr className="border-b border-line">
                      <th className="px-3 py-2 font-semibold">Anul</th>
                      <th className="px-3 py-2 text-right font-semibold">Înregistrate</th>
                      {usedOutcomes.map((k) => (
                        <th key={k} className="px-3 py-2 text-right font-semibold">
                          {outcomeLabel(k)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-body">
                    {d.cohorts.map((c) => (
                      <tr key={c.an}>
                        <th className="px-3 py-1.5 font-semibold text-ink">{c.an}</th>
                        <td className="px-3 py-1.5 text-right">{nr(c.inregistrate)}</td>
                        {usedOutcomes.map((k) => (
                          <td key={k} className="px-3 py-1.5 text-right">
                            {c.complet || ['activ', 'nemiscat'].includes(k) ? nr(c.counts[k]) : '–'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </More>
          </div>
        </Container>
      </section>

      {/* ─── Cine le-a propus ────────────────────────────────────────────────────────────────────────────────── */}
      <Container className={section}>
        <SectionTitle
          id="initiatori"
          lead={`Și proiectele Guvernului: ${pct(gov.over1, gov.total)}% fără pas de peste un an (${pct(mps.over1, mps.total)}% la parlamentari); ${nr(gov.ordonante)} din ${nr(gov.total)} sunt despre ordonanțe.`}
        >
          Cine le-a propus?
        </SectionTitle>
        <div className={`${panel} mt-5 max-w-3xl p-4 sm:p-5`}>
          {staleLegend}
          <ul className="mt-3 space-y-2">
            {[
              { k: 'guvern', label: 'Guvernul', row: gov },
              { k: 'parlamentari', label: 'Deputați sau senatori', row: mps },
              { k: 'ordonante', label: 'Aprobarea unei ordonanțe', row: { total: d.ordonante.total, over1: d.ordonante.over1 } },
            ].map(({ k, label, row }) => (
              <BarRow
                key={k}
                label={label}
                value={nr(row.total)}
                note={`${nr(row.over1)} > 1 an`}
                href={listHref(k === 'ordonante' ? { ord: true } : { init: k as ListFilters['init'] })}
              >
                <Bar
                  label={`${label}: ${nr(row.total)} proiecte, ${nr(row.over1)} fără pas de peste un an`}
                  parts={[
                    { value: row.over1, paint: PAINT.nemiscat },
                    { value: row.total - row.over1, paint: PAINT.activ },
                  ]}
                  scale={d.total}
                />
              </BarRow>
            ))}
          </ul>
        </div>

        <div className="mt-8 max-w-[72ch] divide-y divide-line border-y border-line">

            <details className="group py-1" id="de-ce">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 font-display text-[1.35rem] text-ink [&::-webkit-details-marker]:hidden">
                <span aria-hidden className="inline-block text-base text-muted transition-transform group-open:rotate-90">›</span>
                De ce rămân proiecte în urmă
              </summary>
              <div className="space-y-3 pb-4 text-[14.5px] leading-6 text-body">
                <p>
                  <strong className="font-semibold text-ink">Așa e în orice parlament.</strong> Multe propuneri nu ajung la vot nicăieri: unele sunt depuse ca să
                  pună o temă pe agendă, altele se suprapun cu un proiect adoptat între timp, iar majoritatea preferă adesea să lase un proiect la comisie
                  decât să-l respingă în plen. Un proiect fără pași nu înseamnă că nimeni nu lucrează, ci că nimeni nu l-a dus mai departe.
                </p>
                <p>
                  <strong className="font-semibold text-ink">La noi nu expiră.</strong> În Germania, proiectele nevotate cad la sfârșitul legislaturii; în
                  Statele Unite, la sfârșitul fiecărui Congres de doi ani. În România trec de la o legislatură la alta, iar camera care decide la final nu
                  are termen. Prima cameră are unul (adoptarea tacită), de aceea aproape toate proiectele vechi stau la Cameră ca for decizional.
                </p>
                <p>
                  <strong className="font-semibold text-ink">De ce contează.</strong> O ordonanță nevotată se aplică ani la rând fără ca Parlamentul s-o fi
                  aprobat sau corectat. Iar un proiect trecut de Senat și lăsat la Cameră poate fi reluat oricând, modificat prin amendamente și votat în
                  câteva zile.
                </p>
              </div>
            </details>

            <details className="group py-1" id="cum-calculam">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 font-display text-[1.35rem] text-ink [&::-webkit-details-marker]:hidden">
                <span aria-hidden className="inline-block text-base text-muted transition-transform group-open:rotate-90">›</span>
                Cum calculăm
              </summary>
              <dl className="space-y-3 pb-4 text-[14px] leading-6 text-body">
                <div>
                  <dt className="font-semibold text-ink">Proiecte aflate la Cameră</dt>
                  <dd>
                    Proiectele cu număr de Cameră (PL-x, Pl-x) înregistrate din {firstYear} încoace, aflate acum la comisii, cu raport, pe ordinea de zi, la
                    avize sau în reexaminare, după fișa fiecăruia de pe cdep.ro (aceleași ca pe{' '}
                    <Link href="/camera" className={linkCls}>
                      La Camera Deputaților
                    </Link>
                    ). Cele plecate la Senat, la promulgare sau încheiate nu intră.
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-ink">Pas procedural</dt>
                  <dd>
                    Un rând din „derularea procedurii” care mută proiectul: sosirea la Cameră, trimiterea la comisii pentru raport (sau schimbarea comisiei),
                    raportul, retrimiterea pentru raport suplimentar, dezbaterea sau votul în plen, adoptarea tacită, trimiterea la cealaltă cameră, la
                    promulgare sau înapoi pentru reexaminare, o decizie a Curții Constituționale. Nu se numără avizele și punctele de vedere primite,
                    termenele și prelungirile lor, înscrierea pe ordinea de zi fără dezbatere și retragerea unei semnături.
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-ink">Zile fără pas</dt>
                  <dd>
                    Zile calendaristice de la ultimul pas până azi, cu vacanțele parlamentare, ca oricine să le poată verifica pe cdep.ro. „Peste un an”
                    începe a doua zi după aniversarea ultimului pas. Retrimiterea pentru raport suplimentar e un pas: ceasul pornește din nou. Data
                    înregistrării la Cameră e și ea un pas, pentru fișele în care sosirea nu apare ca rând.
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-ink">Adoptare tacită</dt>
                  <dd>{TACIT_TEXT}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-ink">Pe ani</dt>
                  <dd>
                    Anul din numărul PL-x, cu toate proiectele din lista Camerei pe acel an. „Au devenit legi”: stadiul „Lege nr./an”; „respinse sau
                    încheiate”: respinse definitiv, retrase, clasate sau cu procedura încetată. Pentru proiectele urmărite folosim fișa, mai nouă decât lista.
                    Nu arătăm durata medie până la lege pe anul înregistrării: în anii recenți au apucat să devină legi doar proiectele rapide, așa că ar
                    părea mereu mai rapizi.
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-ink">Ordonanțe și partide</dt>
                  <dd>
                    „Aprobarea unei ordonanțe” cuprinde și respingerea ei; aceste proiecte sunt numărate și la Guvern.{' '}
                    Ordonanțele (de urgență sau simple) se aplică de la publicarea în Monitorul Oficial, înainte de votul Parlamentului; le recunoaștem după
                    titlul proiectului. Nu împărțim pe partide: un proiect are adesea inițiatori din mai multe partide, iar majoritatea s-a schimbat de câteva
                    ori din {firstYear} încoace, așa că cifrele s-ar suprapune și ar spune puțin despre cine a ținut un proiect pe loc.
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-ink">De ce cifrele diferă puțin de alte numărători</dt>
                  <dd>
                    După stadiul scris în listele Camerei, la Cameră ar fi {many(d.reconcile.listAtChamber, 'proiect', 'proiecte')}. Lista rămâne uneori în
                    urmă: după fișe, {many(d.reconcile.sheetLeft, 'proiect a plecat', 'proiecte au plecat')} între timp
                    {d.reconcile.sheetBack > 0 && <>, iar {many(d.reconcile.sheetBack, 'proiect s-a întors', 'proiecte s-au întors')}</>}. Numărăm după fișe:{' '}
                    {nr(d.total)}. O numărătoare care ia orice rând din fișă drept pas (și avizele, și ordinea de zi) dă mai puține proiecte fără pas.
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-ink">Ce nu e încă aici</dt>
                  <dd>
                    Proiectele înregistrate înainte de {firstYear}
                    {d.older.years.length > 0 ? (
                      <>
                        : listele Camerei arată și proiecte mai vechi încă în dezbatere (
                        {d.older.years.map((y, i) => (
                          <span key={y.an}>
                            {i > 0 && ', '}
                            {nr(y.atChamber)} din {y.an}
                          </span>
                        ))}
                        , după listele din {dateRo(d.older.years[0].cititLa.slice(0, 10))}); le adăugăm după ce le citim fișele.
                      </>
                    ) : (
                      '.'
                    )}{' '}
                    Proiectele pentru care Senatul decide la final, care pot sta și ele ani de zile; data publicării legilor în Monitorul Oficial.
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-ink">Sursa</dt>
                  <dd>
                    Listele pe ani și fișele de pe{' '}
                    <a href="https://www.cdep.ro/ords/pls/proiecte/upl_pck2015.lista?cam=2&anp=2026" target="_blank" rel="noopener noreferrer" className={linkCls}>
                      cdep.ro
                    </a>
                    , citite câte o pagină pe minut. Lista anului curent se citește zilnic{d.cititLa ? ` (ultima dată pe ${dateRo(d.cititLa.slice(0, 10))})` : ''},
                    fișele după fiecare schimbare.
                  </dd>
                </div>
              </dl>
            </details>
        </div>
      </Container>
    </>
  );
}
