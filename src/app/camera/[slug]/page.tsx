import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowLeft, ExternalLink, FileText } from 'lucide-react';
import { cdepParty, getBillVersions, getCdepAnalysis, getCdepBill, getCdepSlugs, getCommittees, getVersionsStatus, initiatorLabel } from '@/lib/cdep';
import { dayDiff, shortCommittee, shortDate, stageLabel, stageOf } from '@/lib/cdep-text';
import { RISK } from '@/lib/risk';
import { MODELS } from '@/lib/site';
import { fmt, formatDateRo, todayISO } from '@/lib/format';
import { trackAttrs } from '@/lib/analytics';
import { Container, PartyTag, RiskChip, linkCls, panel } from '@/components/ui';
import { RouteSteps, type RouteStep } from '@/components/bills/BillRoute';
import WriteCommittee from '@/components/camera/WriteCommittee';
import BillVersions from '@/components/camera/BillVersions';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export async function generateStaticParams() {
  return (await getCdepSlugs()).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const [bill, analysis] = await Promise.all([getCdepBill(slug), getCdepAnalysis(slug)]);
  if (!bill) return { title: 'Proiect negăsit' };
  const title = `${bill.numar}: ${analysis?.consensus.plainTitle ?? bill.titlu.replace(/^(Proiect de Lege|Propunere legislativă) /i, '')}`;
  const description = analysis?.consensus.summaryTlDr ?? bill.fisa.obiect ?? bill.titlu;
  return { title, description, openGraph: { title, description } };
}

// „26.10.2026” → „2026-10-26”.
const iso = (d: string) => d.split('.').reverse().join('-');
// Fișa Camerei scrie grupurile fără diacritice („Minoritati”, „Neafiliati”).
const LAW_TYPE: Record<string, string> = { ordinar: 'Ordinară', organic: 'Organică', constitutional: 'Constituțională' };

export default async function CameraBillPage({ params }: PageProps) {
  const { slug } = await params;
  const [bill, analysis, committees, versions, versionsStatus] = await Promise.all([
    getCdepBill(slug),
    getCdepAnalysis(slug),
    getCommittees(),
    getBillVersions(slug),
    getVersionsStatus(),
  ]);
  const comparing = !versions && versionsStatus?.pending.includes(slug);
  if (!bill) notFound();

  const f = bill.fisa;
  const c = analysis?.consensus;
  const builtOn = todayISO();
  const stage = stageOf(bill.stadiu);
  const atChamber = ['comisii', 'raport', 'plen', 'altele'].includes(stage);
  // Camera decizională votează a doua: dacă decide Camera, Senatul a votat deja.
  const senateFirst = /camera/i.test(f.cameraDecizionala ?? '');
  const senateVote = f.timeline.find((t) => t.camera === 'Senat' && /adoptat|respins/i.test(t.actiune));
  const firstDate = f.timeline[0]?.data;
  const initiator = initiatorLabel(f);

  const steps: RouteStep[] = senateFirst
    ? [
        { label: 'Depus', detail: [initiator, f.numarSenat ? `la Senat, cu nr. ${f.numarSenat}` : 'la Senat'].filter(Boolean).join(', ') },
        {
          label: 'Senatul',
          detail: senateVote ? `prima cameră; l-a ${/respins/i.test(senateVote.actiune) ? 'respins' : 'adoptat'} pe ${formatDateRo(iso(senateVote.data))}` : 'prima cameră',
        },
        { label: 'Comisiile Camerei', detail: f.comisii?.termenRaport ? `raport până pe ${formatDateRo(f.comisii.termenRaport)}` : 'avize și raport' },
        { label: 'Plenul Camerei', detail: 'decide la final' },
        { label: 'Promulgare', detail: 'și Monitorul Oficial' },
      ]
    : [
        { label: 'Depus', detail: [initiator, firstDate && `pe ${formatDateRo(iso(firstDate))}`].filter(Boolean).join(', ') || 'la Cameră' },
        { label: 'Comisiile Camerei', detail: f.comisii?.termenRaport ? `raport până pe ${formatDateRo(f.comisii.termenRaport)}` : 'avize și raport' },
        { label: 'Plenul Camerei', detail: 'prima cameră' },
        { label: 'Senatul', detail: 'decide la final' },
        { label: 'Promulgare', detail: 'și Monitorul Oficial' },
      ];
  const committeesStep = senateFirst ? 2 : 1;
  const now = {
    comisii: committeesStep,
    raport: committeesStep + 1,
    plen: committeesStep + 1,
    altele: committeesStep + 1,
    senat: senateFirst ? 1 : 3,
    promulgare: 4,
    lege: 5,
    incheiat: -1,
  }[stage];

  const byParty: Record<string, number> = {};
  for (const i of f.initiatori) {
    const party = cdepParty(i.partid) || 'Neafiliați';
    byParty[party] = (byParty[party] ?? 0) + 1;
  }
  const partyEntries = Object.entries(byParty).sort((a, b) => b[1] - a[1]);

  const report = f.comisii?.raport ?? [];
  const to = report.map((r) => committees[r.idc]?.email).filter((e): e is string => Boolean(e));
  const deadline = f.comisii?.termenAmendamente ?? null;
  const daysLeft = deadline ? dayDiff(deadline, builtOn) : null;
  const form = c?.senatForm;
  const body = [
    'Stimate doamne și domni membri ai comisiei,',
    `Vă scriu în legătură cu ${bill.numar}, „${bill.titlu}”.`,
    form?.proposalContent
      ? `Vă propun următoarea modificare:\nArticolul: ${form.articleRef}\nTextul propus: ${form.proposalContent}\nMotivarea: ${form.argumentation}`
      : 'Vă propun următoarea modificare:\nArticolul: …\nTextul propus: …\nMotivarea: …',
    'Vă rog să o luați în considerare la întocmirea raportului.',
    'Cu stimă,\n[Numele și prenumele]\n[Localitatea]',
  ].join('\n\n');

  return (
    <Container className="max-w-[920px] py-8 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href="/camera" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-body hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Toate proiectele de la Cameră
        </Link>
        <a
          href={bill.url}
          target="_blank"
          rel="noopener noreferrer"
          {...trackAttrs('official_source_open', { bill_id: bill.numar, source: 'cdep_sheet' })}
          className="inline-flex min-h-11 items-center gap-1 text-muted underline underline-offset-4 hover:text-ink"
        >
          Fișa {bill.numar} pe cdep.ro <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>

      <article className="mt-4">
        <header className={`${panel} overflow-hidden shadow-[var(--shadow-card)]`}>
          {c && <div className={`h-1.5 ${RISK[c.riskLevel].fill}`} aria-hidden />}
          <div className="p-6 sm:p-9">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              {c && <RiskChip level={c.riskLevel} score={c.riskScore} size="md" />}
              <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${stage === 'plen' ? 'bg-brand text-on-brand' : 'bg-sunken text-body'}`}>
                {stageLabel(stage)}
              </span>
              <span className="tabular-nums text-muted">
                {bill.numar}
                {f.numarSenat && ` · ${f.numarSenat} la Senat`}
              </span>
            </div>
            <h1 className="font-display mt-5 text-[clamp(1.7rem,3.6vw,2.6rem)] font-normal leading-[1.15]">{c?.plainTitle ?? bill.titlu}</h1>
            {c && <p className="mt-4 text-lg leading-8 text-ink">{c.summaryTlDr}</p>}
            {c && <p className="mt-4 text-sm leading-6 text-muted">Titlul oficial: {bill.titlu}</p>}
            {f.obiect && (
              <div className="mt-5 rounded-xl bg-sunken px-4 py-3">
                <p className="text-xs font-semibold text-muted">Ce scrie pe fișa Camerei</p>
                <p className="mt-1 text-[15px] leading-7 text-body">{f.obiect}</p>
              </div>
            )}
            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-5 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted">Inițiator</dt>
                <dd className="font-semibold text-ink">{initiator ?? '–'}</dd>
              </div>
              <div>
                <dt className="text-muted">Decide la final</dt>
                <dd className="font-semibold text-ink">{f.cameraDecizionala ?? '–'}</dd>
              </div>
              <div>
                <dt className="text-muted">Tipul legii</dt>
                <dd className="font-semibold text-ink">{f.caracter ? (LAW_TYPE[f.caracter] ?? f.caracter) : '–'}</dd>
              </div>
              <div>
                <dt className="text-muted">Procedură de urgență</dt>
                <dd className="font-semibold text-ink">{/^da/i.test(f.urgenta ?? '') ? 'Da' : 'Nu'}</dd>
              </div>
            </dl>
            {partyEntries.length > 0 && (
              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-5 text-sm">
                <span className="text-muted">Semnat de {f.initiatori.length} parlamentari:</span>
                {partyEntries.map(([party, n]) => (
                  <span key={party} className="inline-flex items-center gap-1">
                    <PartyTag party={party} />
                    <span className="text-xs tabular-nums text-muted">{n}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </header>

        <section aria-labelledby="traseu" className={`${panel} mt-6 p-6 sm:p-8`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="traseu" className="text-lg font-semibold text-ink">
              Unde este proiectul
            </h2>
            <p className="text-sm text-muted">
              Stadiul oficial la Cameră: {bill.stadiu}
              {bill.stadiuData && `, din ${bill.stadiuData}`}
            </p>
          </div>
          {now >= 0 ? (
            <RouteSteps steps={steps} now={now} />
          ) : (
            <p className="mt-4 text-[15px] leading-7 text-body">Procedura s-a încheiat la Cameră: {bill.stadiu}.</p>
          )}
          <p className="mt-6 border-t border-line pt-4 text-sm leading-6 text-body">
            {senateFirst
              ? 'Senatul a votat primul, iar Camera Deputaților decide la final.'
              : 'Camera Deputaților votează prima, iar Senatul decide la final.'}
          </p>
        </section>

        {versions && <BillVersions data={versions} />}
        {comparing && (
          <section aria-labelledby="versiuni" role="note" className={`${panel} mt-6 p-6 sm:p-7`}>
            <h2 id="versiuni" className="text-base font-semibold text-ink">
              Cum s-a schimbat pe drum
            </h2>
            <p className="mt-2 text-[15px] leading-7 text-body">
              Proiectul a trecut prin mai multe forme. Le comparăm acum, una câte una, ca să vezi ce s-a schimbat și dacă a devenit mai riscant; rezultatul
              apare aici în zilele următoare.
            </p>
          </section>
        )}

        {atChamber && report.length > 0 && (
          <section aria-labelledby="actiune" className={`${panel} mt-6 border-brand/40 p-6 sm:p-8`}>
            <h2 id="actiune" className="text-lg font-semibold text-ink">
              Ce poți face
            </h2>
            <p className="mt-2 text-[15px] leading-7 text-body">
              {stage === 'comisii' && daysLeft !== null && daysLeft >= 0 ? (
                <>
                  Proiectul e la comisii. <strong className="font-semibold text-ink">Amendamentele se depun până pe {formatDateRo(deadline!)}</strong>
                  {daysLeft <= 3 && ` (${daysLeft === 0 ? 'azi' : daysLeft === 1 ? 'mâine' : `peste ${daysLeft} zile`})`}, iar raportul e gata până pe{' '}
                  {formatDateRo(f.comisii!.termenRaport ?? deadline!)}.
                </>
              ) : stage === 'comisii' ? (
                <>
                  Termenul pentru amendamente a trecut{deadline && ` pe ${formatDateRo(deadline)}`}, dar comisia lucrează încă la raport
                  {f.comisii?.termenRaport && ` (termen: ${formatDateRo(f.comisii.termenRaport)})`}. O propunere motivată poate fi preluată și acum.
                </>
              ) : (
                <>Comisia a terminat raportul, iar proiectul urmează la votul plenului. Poți scrie totuși comisiei și deputaților din județul tău.</>
              )}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted">
              Amendamentele oficiale le depun deputații. Tu poți trimite comisiei care face raportul o propunere motivată, iar un deputat o poate prelua.
              {form?.proposalContent ? ' Textul de mai jos e propunerea modelelor AI; schimbă-l cum crezi.' : ' Completează articolul, textul propus și motivarea.'}
            </p>
            <p className="mt-4 text-sm text-body">
              {report.length > 1 ? 'Raportul îl fac' : 'Raportul îl face'}:{' '}
              {report.map((r, i) => (
                <span key={r.idc}>
                  {i > 0 && ', '}
                  <a href={committees[r.idc]?.url} target="_blank" rel="noopener noreferrer" className={linkCls}>
                    {shortCommittee(r.nume)}
                  </a>
                </span>
              ))}
            </p>
            {to.length > 0 && (
              <div className="mt-4">
                <WriteCommittee billId={bill.numar} to={to} subject={`Propunere de modificare: ${bill.numar}`} body={body} />
              </div>
            )}
          </section>
        )}

        {c && (
          <>
            <section aria-labelledby="realitate" className="mt-6 grid gap-4 md:grid-cols-2">
              <h2 id="realitate" className="sr-only">
                Ce promit inițiatorii și ce face legea
              </h2>
              <div className="rounded-2xl bg-sunken p-6">
                <h3 className="text-sm font-semibold text-ink">Ce promit inițiatorii</h3>
                <p className="mt-2 text-[15px] leading-7 text-body">{c.initiatorClaim}</p>
              </div>
              <div className={`rounded-2xl p-6 ${c.riskLevel === 'red' ? 'bg-risk-red-soft' : c.riskLevel === 'yellow' ? 'bg-risk-amber-soft' : 'bg-risk-green-soft'}`}>
                <h3 className={`text-sm font-semibold ${RISK[c.riskLevel].text}`}>Ce face legea în realitate</h3>
                <p className="mt-2 text-[15px] leading-7 text-ink">{c.realityCheck}</p>
              </div>
            </section>
            <section aria-labelledby="modele" className={`${panel} mt-6 p-6 sm:p-7`}>
              <h2 id="modele" className="text-base font-semibold text-ink">
                Ce spune fiecare model
              </h2>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {MODELS.map((m) => {
                  const v = analysis!.council[m.key];
                  return (
                    <div key={m.key} className="rounded-xl border border-line p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-ink">{m.name}</p>
                        {v?.status === 'ok' ? (
                          <span className={`text-sm font-semibold tabular-nums ${RISK[v.riskLevel].text}`}>{fmt(v.riskScore)}/10</span>
                        ) : (
                          <span className="text-xs text-muted">fără răspuns</span>
                        )}
                      </div>
                      {v?.status === 'ok' && <p className="mt-2 text-sm leading-6 text-body">{v.verdictShort}</p>}
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {f.comisii && (
          <section aria-labelledby="comisii" className="mt-12">
            <h2 id="comisii" className="font-display text-2xl font-normal sm:text-3xl">
              Comisiile
            </h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {(
                [
                  ['Fac raportul', f.comisii.raport],
                  ['Dau aviz', f.comisii.aviz],
                ] as const
              ).map(([title, list]) =>
                list.length ? (
                  <div key={title} className={`${panel} p-5`}>
                    <h3 className="text-sm font-semibold text-muted">{title}</h3>
                    <ul className="mt-2 space-y-2 text-[15px] leading-6">
                      {list.map((r) => (
                        <li key={r.idc}>
                          <a href={committees[r.idc]?.url ?? '#'} target="_blank" rel="noopener noreferrer" className="text-ink underline-offset-4 hover:underline">
                            {r.nume}
                          </a>
                          {committees[r.idc]?.email && <span className="block text-xs text-muted">{committees[r.idc].email}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null,
              )}
            </div>
            {(deadline || f.comisii.termenRaport) && (
              <p className="mt-3 text-sm text-muted">
                {deadline && `Termen pentru amendamente: ${formatDateRo(deadline)}. `}
                {f.comisii.termenRaport && `Termen pentru raport: ${formatDateRo(f.comisii.termenRaport)}.`}
              </p>
            )}
          </section>
        )}

        {(f.documente?.length ?? 0) > 0 && (
          <section aria-labelledby="documente" className="mt-12">
            <h2 id="documente" className="font-display text-2xl font-normal sm:text-3xl">
              Documente oficiale
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {f.documente!.map((d) => (
                <a
                  key={d.url}
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  {...trackAttrs('official_source_open', { bill_id: bill.numar, source: 'cdep_pdf', doc: d.eticheta })}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-xs font-medium text-body transition-colors hover:border-line-strong hover:text-ink"
                >
                  <FileText className="h-3.5 w-3.5 text-muted" aria-hidden />
                  {d.eticheta}
                </a>
              ))}
            </div>
          </section>
        )}

        {f.timeline.length > 0 && (
          <section aria-labelledby="procedura" className="mt-12">
            <h2 id="procedura" className="font-display text-2xl font-normal sm:text-3xl">
              Derularea procedurii
            </h2>
            <ol className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
              {f.timeline.map((t, i) => (
                <li key={`${t.data}-${i}`} className="grid gap-1 px-5 py-3 text-sm sm:grid-cols-[7rem_9rem_minmax(0,1fr)] sm:gap-4">
                  <span className="tabular-nums text-muted">{shortDate(iso(t.data))} {t.data.slice(-4)}</span>
                  <span className="text-muted">{t.camera ?? ''}</span>
                  <span className="text-body">{t.actiune}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <p className="mt-10 text-xs leading-5 text-muted">
          Date preluate de pe{' '}
          <a href={bill.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
            fișa proiectului de pe cdep.ro
          </a>
          , citite pe {formatDateRo(bill.cititLa.slice(0, 10))}.
          {!c && ' Analiza modelelor AI vine pentru proiectele noi și pentru cele programate la vot.'}
        </p>
      </article>
    </Container>
  );
}
