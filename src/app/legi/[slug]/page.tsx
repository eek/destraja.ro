import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowLeft, ChevronDown, ExternalLink, FileDown, FileText } from 'lucide-react';
import { getAllBills, getBillBySlug, getBillExtractedTexts, toLite } from '@/lib/bills';
import { agreement, mpSlugs, oneLiner } from '@/lib/stats';
import { RISK } from '@/lib/risk';
import { MODELS } from '@/lib/site';
import { fmt, formatDateRo, todayISO } from '@/lib/format';
import { trackAttrs } from '@/lib/analytics';
import ActionKitClient from '@/components/ActionKitClient';
import LiveDeadline from '@/components/bills/LiveDeadline';
import BillNews, { PressLink } from '@/components/bills/BillNews';
import BillPositions, { PositionsLink } from '@/components/bills/BillPositions';
import { Container, ModelMeters, PartyTag, RiskChip, panel } from '@/components/ui';
import { Flags } from '@/components/bills/Flags';
import CiteBill from '@/components/bills/CiteBill';
import { citation } from '@/lib/export';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export async function generateStaticParams() {
  const bills = await getAllBills();
  return bills.map((b) => ({ slug: b.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const bill = await getBillBySlug(slug);
  if (!bill) return { title: 'Proiect negăsit' };
  const description = oneLiner(toLite(bill));
  return {
    title: `${bill.id}: ${bill.analysis.consensus.plainTitle}`,
    description,
    openGraph: { title: `${bill.id}: ${bill.analysis.consensus.plainTitle}`, description },
  };
}

const AGREE_TONE = { strong: 'text-muted', partial: 'text-muted', split: 'text-ink' } as const;

const summaryCls = 'flex min-h-14 cursor-pointer items-center justify-between gap-4 px-5 py-4 text-base font-semibold text-ink transition-colors hover:bg-sunken/60';

export default async function BillDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const bill = await getBillBySlug(slug);
  if (!bill) notFound();

  const all = await getAllBills();
  const slugs = mpSlugs(all.map(toLite));
  const extractedTexts = await getBillExtractedTexts(bill);
  const news = bill.news;
  const builtOn = todayISO();
  const lite = toLite(bill);
  const c = bill.analysis.consensus;
  const ag = agreement(lite);

  const byParty: Record<string, typeof bill.initiators> = {};
  for (const init of bill.initiators) {
    const p = init.party || 'Neafiliați';
    (byParty[p] ??= []).push(init);
  }
  const partyEntries = Object.entries(byParty).sort((a, b) => b[1].length - a[1].length);

  return (
    <Container className="max-w-[920px] py-8 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href="/#legi" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-body hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Toate proiectele
        </Link>
        <div className="flex flex-wrap items-center gap-x-4 text-muted">
          <a
            href={bill.sheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            {...trackAttrs('official_source_open', { bill_id: bill.id, source: 'sheet' })}
            className="inline-flex min-h-11 items-center gap-1 underline underline-offset-4 hover:text-ink">
            Fișa {bill.id} pe senat.ro <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
          <a
            href={bill.opinionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            {...trackAttrs('official_source_open', { bill_id: bill.id, source: 'opinions' })}
            className="inline-flex min-h-11 items-center gap-1 tabular-nums underline underline-offset-4 hover:text-ink">
            Opinii depuse ({bill.opinionsCount}) <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
      </div>

      <article className="mt-4">
        <header className={`${panel} overflow-hidden shadow-[var(--shadow-card)]`}>
          <div className={`h-1.5 ${RISK[c.riskLevel].fill}`} aria-hidden />
          <div className="p-6 sm:p-9">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <RiskChip level={c.riskLevel} score={c.riskScore} size="md" />
              <span className="tabular-nums text-muted">
                {bill.id} · cod Senat {bill.cod}
              </span>
            </div>
            <h1 className="font-display mt-5 text-[clamp(1.9rem,4.2vw,3rem)] font-normal leading-[1.1]">{c.plainTitle}</h1>
            <p className="mt-4 text-lg leading-8 text-ink sm:text-xl sm:leading-9">{oneLiner(lite)}</p>
            <p className="mt-4 text-sm leading-6 text-muted">Titlul oficial: {bill.officialTitle}</p>

            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
              <LiveDeadline deadline={bill.consultationDeadline} days={bill.daysRemaining} />
              <Flags bill={lite} />
              {news && <PressLink press={lite.press} builtOn={builtOn} />}
              <PositionsLink summary={lite.positions} />
            </div>

            {partyEntries.length > 0 && (
              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-5 text-sm">
                <span className="text-muted">Semnat de {bill.initiators.length} parlamentari:</span>
                {partyEntries.map(([party, members]) => (
                  <span key={party} className="inline-flex items-center gap-1">
                    <PartyTag party={party} />
                    <span className="text-xs tabular-nums text-muted">{members.length}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </header>

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

        <section aria-labelledby="scoruri" className={`${panel} mt-6 p-6 sm:p-7`}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="scoruri" className="text-base font-semibold text-ink">
                De ce acest nivel de risc?
              </h2>
              <p className={`mt-1 text-sm font-semibold ${AGREE_TONE[ag.tone]}`}>{ag.label}</p>
            </div>
            <p className={`text-4xl font-semibold tabular-nums ${RISK[c.riskLevel].text}`}>
              {fmt(c.riskScore)}
              <span className="text-lg font-normal text-muted">/10</span>
            </p>
          </div>
          <p className="mt-4 text-[15px] leading-7 text-body">{c.summaryTlDr}</p>
          <div className="mt-5">
            <ModelMeters bill={lite} />
          </div>
          {bill.analysis.corrections?.map((fix) => (
            <p key={fix.reportId} className="mt-4 rounded-lg bg-brand-soft px-3 py-2 text-sm leading-6 text-ink">
              <strong className="font-semibold">Corectat la {formatDateRo(fix.date)}:</strong>{' '}
              {fix.target === 'consensus' ? 'concluzia comună a fost refăcută' : `analiza ${MODELS.find((m) => m.key === fix.target)?.name} a fost refăcută`} după
              raportul unui cititor, confirmat în textul oficial.
            </p>
          ))}
          <a href="#audit-ai" className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-link underline underline-offset-4">
            Ce a găsit fiecare model în text
            <ChevronDown className="h-4 w-4" aria-hidden />
          </a>
        </section>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted">Documente oficiale:</span>
            {bill.pdfs.map((pdf) => (
              <a
                key={pdf.url}
                href={pdf.url}
                target="_blank"
                rel="noopener noreferrer"
                {...trackAttrs('official_source_open', { bill_id: bill.id, source: 'pdf', doc: pdf.label })}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-xs font-medium text-body transition-colors hover:border-line-strong hover:text-ink"
              >
                <FileText className="h-3.5 w-3.5 text-muted" aria-hidden />
                {pdf.label}
              </a>
            ))}
          </div>
          <a
            href={`/docs/Punct_de_vedere_${bill.slug.toUpperCase()}.docx`}
            download
            {...trackAttrs('docx_download', { bill_id: bill.id, personalized: 'no', source: 'header' })}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-xs font-semibold text-ink hover:bg-sunken"
          >
            <FileDown className="h-3.5 w-3.5" aria-hidden />
            Memoriu complet (.docx)
          </a>
        </div>

        <div className="mt-12">
          <ActionKitClient
            bill={bill}
            press={
              <>
                {bill.positions && <BillPositions billId={bill.id} data={bill.positions} summary={lite.positions} />}
                {news && <BillNews billId={bill.id} news={news} builtOn={builtOn} />}
              </>
            }
          />
        </div>

        {c.articlesBreakdown && c.articlesBreakdown.length > 0 && (
          <section aria-labelledby="articole" className="mt-14">
            <h2 id="articole" className="font-display text-3xl font-normal">
              Articol cu articol: ce modifică
            </h2>
            <div className={`${panel} mt-5 divide-y divide-line`}>
              {c.articlesBreakdown.map((item, idx) => (
                <div key={idx} className="p-5 sm:p-6">
                  <h3 className="text-base font-semibold text-ink sm:text-lg">
                    <span className={`mr-2 tabular-nums ${RISK[item.severity]?.text ?? 'text-muted'}`}>{item.article}</span>
                    {item.title}
                  </h3>
                  <div className="mt-3 grid gap-4 text-[15px] leading-7 md:grid-cols-2">
                    <div>
                      <p className="mb-1 text-xs font-semibold text-muted">Ce scrie în lege</p>
                      <p className="text-body">{item.whatChanges}</p>
                    </div>
                    <div>
                      <p className={`mb-1 text-xs font-semibold ${RISK[item.severity]?.text ?? 'text-muted'}`}>Ce înseamnă în viața reală</p>
                      <p className="text-ink">{item.realWorldImpact}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {c.mythsAndFacts && c.mythsAndFacts.length > 0 && (
          <section aria-labelledby="fapte" className="mt-14">
            <h2 id="fapte" className="font-display text-3xl font-normal">
              Ce spun inițiatorii, verificat
            </h2>
            <div className={`${panel} mt-5 divide-y divide-line`}>
              {c.mythsAndFacts.map((mf, i) => {
                const tone =
                  mf.verdict === 'confirmat'
                    ? 'bg-risk-red-soft text-risk-red-text'
                    : mf.verdict === 'nuantat'
                      ? 'bg-risk-amber-soft text-risk-amber-text'
                      : 'bg-sunken text-body';
                const label = mf.verdict === 'confirmat' ? 'Riscul se confirmă' : mf.verdict === 'nuantat' ? 'Nuanțat' : 'Nu se confirmă';
                return (
                  <div key={i} className="p-5 sm:p-6">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${tone}`}>{label}</span>
                      <h3 className="text-base font-semibold text-ink">{mf.claim}</h3>
                    </div>
                    <p className="mt-2 text-[15px] leading-7 text-body prose-measure">{mf.explanation}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <div className="deferred mt-14 space-y-3">
          <details open={bill.publicOpinions.length > 0} className={`${panel} overflow-hidden`}>
            <summary className={summaryCls}>
              Opiniile depuse pe senat.ro ({bill.publicOpinions.length})
              <ChevronDown className="chevron h-5 w-5 shrink-0 text-muted" aria-hidden />
            </summary>
            <div className="border-t border-line px-5 pb-5 pt-3">
              {bill.publicOpinions.length === 0 ? (
                <p className="text-sm text-body">Nicio opinie publicată încă pe pagina Senatului pentru {bill.id}.</p>
              ) : (
                <div className="divide-y divide-line">
                  {bill.publicOpinions.map((op) => (
                    <div key={op.regNo} className="space-y-1 py-3 text-sm first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums text-muted">
                        <span className="font-semibold text-ink">
                          {op.author} · nr. {op.regNo}
                        </span>
                        <span>{op.date}</span>
                      </div>
                      <p className="leading-relaxed text-body prose-measure">{op.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>

          <details className={`${panel} overflow-hidden`}>
            <summary className={summaryCls}>
              Inițiatorii ({bill.initiators.length})
              <ChevronDown className="chevron h-5 w-5 shrink-0 text-muted" aria-hidden />
            </summary>
            <div className="space-y-4 border-t border-line px-5 pb-5 pt-4">
              {partyEntries.map(([party, members]) => (
                <div key={party}>
                  <h3 className="text-xs font-semibold text-muted">
                    {party} ({members.length})
                  </h3>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {members.map((m) => {
                      const s = slugs.get(m.name.trim());
                      return (
                        <li key={`${m.name}-${m.role}`}>
                          <Link
                            href={s ? `/parlamentari/${s}` : '/parlamentari'}
                            className="inline-flex rounded-md bg-sunken px-2.5 py-1 text-xs text-body transition-colors hover:bg-line hover:text-ink"
                          >
                            <strong className="font-semibold text-ink">{m.name}</strong>&nbsp;· {m.role}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </details>

          <details className={`${panel} overflow-hidden`}>
            <summary className={summaryCls}>
              Parcursul legislativ și avizele ({bill.timeline.length})
              <ChevronDown className="chevron h-5 w-5 shrink-0 text-muted" aria-hidden />
            </summary>
            <ol className="divide-y divide-line border-t border-line px-5 pb-5 pt-3 text-sm">
              {bill.timeline.map((t, i) => (
                <li key={i} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:gap-4">
                  <span className="shrink-0 text-xs tabular-nums text-muted">{t.date}</span>
                  <span className="text-body">{t.action}</span>
                </li>
              ))}
            </ol>
          </details>

          {extractedTexts.length > 0 && (
            <details className={`${panel} overflow-hidden`}>
              <summary className={summaryCls}>
                Textul integral din PDF-urile oficiale ({extractedTexts.length})
                <ChevronDown className="chevron h-5 w-5 shrink-0 text-muted" aria-hidden />
              </summary>
              <div className="space-y-4 border-t border-line px-5 pb-5 pt-3">
                {extractedTexts.map((doc) => (
                  <div key={doc.url}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <h3 className="text-sm font-semibold text-ink first-letter:uppercase">{doc.label}</h3>
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        {...trackAttrs('official_source_open', { bill_id: bill.id, source: 'pdf_text', doc: doc.label })}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-link underline-offset-4 hover:underline"
                      >
                        PDF oficial
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    </div>
                    {doc.ocr && <p className="mt-1 text-xs text-muted">Text recunoscut automat din documentul scanat; pot exista mici greșeli. Sursa e PDF-ul oficial.</p>}
                    <div className="mt-2 max-h-96 overflow-y-auto whitespace-pre-line rounded-xl bg-sunken p-4 text-[13px] leading-relaxed text-body">
                      {doc.content}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </article>

      <CiteBill billId={bill.id} text={citation(toLite(bill))} />
    </Container>
  );
}
