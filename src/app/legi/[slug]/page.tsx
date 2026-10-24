import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowLeft,
  ExternalLink,
  Clock,
  FileDown,
  FileText,
} from 'lucide-react';
import { getAllBills, getBillBySlug, getBillExtractedTexts } from '@/lib/bills';
import { getCitizenOneLiner, PARTY_META } from '@/lib/journalist-plain-data';
import ActionKitClient from '@/components/ActionKitClient';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const bills = await getAllBills();
  return bills.map((b) => ({ slug: b.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const bill = await getBillBySlug(slug);
  if (!bill) {
    return { title: 'Proiect negăsit — lastraja.ro' };
  }
  return {
    title: `${bill.id}: ${bill.analysis.consensus.plainTitle} | lastraja.ro`,
    description: getCitizenOneLiner(bill),
  };
}

export default async function BillDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const bill = await getBillBySlug(slug);
  if (!bill) {
    notFound();
  }

  const extractedTexts = await getBillExtractedTexts(slug);
  const c = bill.analysis.consensus;
  const oneLiner = getCitizenOneLiner(bill);

  const isRed = c.riskLevel === 'red';
  const isYellow = c.riskLevel === 'yellow';
  const riskBadgeClass = isRed
    ? 'bg-red-600 text-white'
    : isYellow
    ? 'bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30'
    : 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/25';

  const riskLabel = isRed
    ? 'Pericol / Risc major'
    : isYellow
    ? 'Atenție / Costuri'
    : 'Utilă / Rutină';

  // Group initiators by party
  const byParty: Record<string, typeof bill.initiators> = {};
  for (const init of bill.initiators) {
    const p = init.party || 'Neafiliați';
    if (!byParty[p]) byParty[p] = [];
    byParty[p].push(init);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-10">
      {/* Top Navigation Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
        <Link
          href="/"
          className="touch-target inline-flex items-center gap-1.5 font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Înapoi la toate cele 49 de legi (lastraja.ro)</span>
        </Link>

        <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
          <a
            href={bill.sheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="touch-target inline-flex items-center gap-1 hover:text-[var(--text-primary)] underline"
          >
            <span>Fișa Senat ({bill.id})</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <a
            href={bill.opinionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="touch-target inline-flex items-center gap-1 hover:text-[var(--text-primary)] underline tabular-nums"
          >
            <span>Opinii depuse ({bill.opinionsCount})</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* ZONA 1: PE ÎNȚELESUL TUTUROR (30 SECUNDE) */}
      <section className="space-y-6 pb-8 border-b border-[var(--border-subtle)]">
        {/* Status Meta Line */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`px-2.5 py-1 rounded-md font-semibold tabular-nums ${riskBadgeClass}`}>
            Scor AI (Gemini · Claude · ChatGPT): {c.riskScore.toFixed(1)} / 10 · {riskLabel}
          </span>

          <span className="font-mono font-bold text-[var(--text-primary)] tabular-nums">
            {bill.id} (Cod {bill.cod})
          </span>

          {bill.emergencyRequested && (
            <span className="px-2 py-0.5 rounded bg-[var(--surface-elevated)] text-[var(--text-secondary)] font-medium">
              Procedură de urgență
            </span>
          )}

          <span className="inline-flex items-center gap-1 font-semibold text-red-700 dark:text-red-400 tabular-nums ml-auto">
            <Clock className="w-3.5 h-3.5" />
            Termen: {bill.consultationDeadline} ({bill.daysRemaining} zile)
          </span>
        </div>

        {/* Title & 1-Sentence Plain Explanation */}
        <div className="space-y-3">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight leading-snug">
            {c.plainTitle}
          </h1>

          {/* Highlighted 1-liner for the Average Joe */}
          <p className="text-base sm:text-lg font-medium text-[var(--text-primary)] prose-measure leading-relaxed">
            {oneLiner}
          </p>

          <p className="text-xs text-[var(--text-muted)] prose-measure">
            Titlu oficial la Senat: {bill.officialTitle}
          </p>
        </div>

        {/* Political Responsibility Bar: Which Parties Signed This Bill */}
        {Object.keys(byParty).length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            <span className="font-semibold text-[var(--text-muted)]">
              Cine a semnat legea ({bill.initiators.length} parlamentari):
            </span>
            {Object.entries(byParty).map(([party, members]) => {
              const pm = PARTY_META[party] || PARTY_META.Neafiliați;
              return (
                <span
                  key={party}
                  className={`px-2.5 py-0.5 rounded-md border font-semibold tabular-nums ${pm.badgeClass}`}
                >
                  {party} · {members.length}
                </span>
              );
            })}
          </div>
        )}

        {/* Clean 2-Column Comparison separated by hairlines */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-5 border-t border-[var(--border-subtle)]">
          <div className="space-y-1.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Ce promit inițiatorii
            </h2>
            <p className="text-[15px] text-[var(--text-secondary)] leading-relaxed">
              {c.initiatorClaim}
            </p>
          </div>

          <div className="space-y-1.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-red-700 dark:text-red-400">
              Ce face legea în realitate
            </h2>
            <p className="text-[15px] text-[var(--text-primary)] leading-relaxed">
              {c.realityCheck}
            </p>
          </div>
        </div>

        {/* Official PDF Links + DOCX */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[var(--border-subtle)] text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[var(--text-muted)] font-medium">Documente Senat:</span>
            {bill.pdfs.map((pdf) => (
              <a
                key={pdf.url}
                href={pdf.url}
                target="_blank"
                rel="noopener noreferrer"
                className="touch-target inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--surface-elevated)] hover:bg-[var(--border-subtle)] font-medium transition-colors"
              >
                <FileText className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <span>{pdf.label}</span>
              </a>
            ))}
          </div>

          <a
            href={`/docs/Punct_de_vedere_${bill.slug.toUpperCase()}.docx`}
            download
            className="touch-target inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface-elevated)] hover:bg-[var(--border-subtle)] font-semibold transition-colors"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Memoriu complet (.docx)</span>
          </a>
        </div>
      </section>

      {/* ZONA 2: KITUL DE ACȚIUNE ÎN 60 DE SECUNDE & AUDITUL CELOR 3 AI-URI */}
      <ActionKitClient bill={bill} />

      {/* ZONA 3: DOSARUL TEHNIC & JURIDIC (Articole, Fapte vs. Mituri, Inițiatori, PDF-uri) */}
      {c.articlesBreakdown && c.articlesBreakdown.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl sm:text-2xl font-bold">
            Articol cu articol: Ce modifică concret
          </h2>

          <div className="rounded-2xl bg-[var(--surface-card)] border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
            {c.articlesBreakdown.map((item, idx) => (
              <div key={idx} className="p-5 sm:p-6 space-y-3">
                <h3 className="font-bold text-base sm:text-lg">
                  <span className="font-mono text-red-700 dark:text-red-400 mr-2">
                    {item.article}
                  </span>
                  {item.title}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[15px] leading-relaxed">
                  <div>
                    <div className="text-xs font-semibold text-[var(--text-muted)] mb-1">
                      Modificarea în lege:
                    </div>
                    <p className="text-[var(--text-secondary)]">{item.whatChanges}</p>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1">
                      Efectul în viața reală:
                    </div>
                    <p className="text-[var(--text-primary)]">{item.realWorldImpact}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {c.mythsAndFacts && c.mythsAndFacts.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl sm:text-2xl font-bold">
            Fapte vs. Scuzele Inițiatorilor
          </h2>

          <div className="rounded-2xl bg-[var(--surface-card)] border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
            {c.mythsAndFacts.map((mf, i) => {
              const isConfirmed = mf.verdict === 'confirmat';
              const isNuanced = mf.verdict === 'nuantat';
              return (
                <div key={i} className="p-5 sm:p-6 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        isConfirmed
                          ? 'bg-red-600 text-white'
                          : isNuanced
                          ? 'bg-amber-500/20 text-amber-800 dark:text-amber-300'
                          : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)]'
                      }`}
                    >
                      {isConfirmed
                        ? 'Confirmat 100%'
                        : isNuanced
                        ? 'Nuanță juridică importantă'
                        : 'Fals / Demontat'}
                    </span>
                    <h3 className="font-bold text-base">{mf.claim}</h3>
                  </div>
                  <p className="text-[15px] text-[var(--text-secondary)] prose-measure leading-relaxed">
                    {mf.explanation}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* BELOW-THE-FOLD REFERENCE ACCORDIONS (Deferred + Find-in-Page searchable via native <details>) */}
      <div className="space-y-3 heavy-section-deferred">
        {/* Citizen Opinions */}
        <details
          open={bill.publicOpinions.length > 0}
          className="group rounded-2xl bg-[var(--surface-card)] border border-[var(--border-subtle)] overflow-hidden"
        >
          <summary className="touch-target px-5 py-4 cursor-pointer flex items-center justify-between gap-4 font-bold text-base hover:bg-[var(--surface-elevated)]/40 transition-colors">
            <span>
              Puncte de vedere ale cetățenilor pe Senat.ro ({bill.publicOpinions.length})
            </span>
            <span className="text-xs font-normal text-[var(--text-muted)] group-open:rotate-180 transition-transform">
              ▼
            </span>
          </summary>

          <div className="px-5 pb-5 pt-2 border-t border-[var(--border-subtle)] space-y-3">
            {bill.publicOpinions.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">
                Niciun punct de vedere publicat încă pe pagina Senatului pentru {bill.id}.
              </p>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {bill.publicOpinions.map((op) => (
                  <div key={op.regNo} className="py-3 first:pt-0 last:pb-0 space-y-1 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)] tabular-nums">
                      <span className="font-semibold text-[var(--text-primary)]">
                        {op.author} · Nr. {op.regNo}
                      </span>
                      <span>{op.date}</span>
                    </div>
                    <p className="text-[var(--text-secondary)] prose-measure leading-relaxed">
                      {op.text}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </details>

        {/* Initiators & Parties */}
        <details className="group rounded-2xl bg-[var(--surface-card)] border border-[var(--border-subtle)] overflow-hidden">
          <summary className="touch-target px-5 py-4 cursor-pointer flex items-center justify-between gap-4 font-bold text-base hover:bg-[var(--surface-elevated)]/40 transition-colors">
            <span>
              Lista nominală a inițiatorilor ({bill.initiators.length} parlamentari ·{' '}
              {bill.parties.join(', ') || 'Parlament'})
            </span>
            <span className="text-xs font-normal text-[var(--text-muted)] group-open:rotate-180 transition-transform">
              ▼
            </span>
          </summary>

          <div className="px-5 pb-5 pt-3 border-t border-[var(--border-subtle)] space-y-4">
            {Object.entries(byParty).map(([party, members]) => (
              <div key={party} className="space-y-1.5">
                <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  {party} ({members.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {members.map((m, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-md bg-[var(--surface-elevated)] text-xs text-[var(--text-secondary)]"
                    >
                      <strong className="text-[var(--text-primary)]">{m.name}</strong> ({m.role}
                      {m.note ? ` · ${m.note}` : ''})
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>

        {/* Legislative Timeline */}
        <details className="group rounded-2xl bg-[var(--surface-card)] border border-[var(--border-subtle)] overflow-hidden">
          <summary className="touch-target px-5 py-4 cursor-pointer flex items-center justify-between gap-4 font-bold text-base hover:bg-[var(--surface-elevated)]/40 transition-colors">
            <span>Parcursul legislativ și avizele ({bill.timeline.length} etape)</span>
            <span className="text-xs font-normal text-[var(--text-muted)] group-open:rotate-180 transition-transform">
              ▼
            </span>
          </summary>

          <div className="px-5 pb-5 pt-3 border-t border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)] text-sm">
            {bill.timeline.map((t, i) => (
              <div
                key={i}
                className="py-2.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4"
              >
                <span className="font-mono text-xs text-[var(--text-muted)] tabular-nums shrink-0">
                  {t.date}
                </span>
                <span className="text-[var(--text-secondary)]">{t.action}</span>
              </div>
            ))}
          </div>
        </details>

        {/* Extracted Official PDF Texts */}
        {extractedTexts.length > 0 && (
          <details className="group rounded-2xl bg-[var(--surface-card)] border border-[var(--border-subtle)] overflow-hidden">
            <summary className="touch-target px-5 py-4 cursor-pointer flex items-center justify-between gap-4 font-bold text-base hover:bg-[var(--surface-elevated)]/40 transition-colors">
              <span>
                Textul integral extras din PDF-urile oficiale ({extractedTexts.length} documente)
              </span>
              <span className="text-xs font-normal text-[var(--text-muted)] group-open:rotate-180 transition-transform">
                ▼
              </span>
            </summary>

            <div className="px-5 pb-5 pt-3 border-t border-[var(--border-subtle)] space-y-4">
              {extractedTexts.map((doc) => (
                <div key={doc.filename} className="space-y-1.5">
                  <div className="font-mono font-semibold text-xs text-[var(--text-muted)]">
                    Document: {doc.filename}
                  </div>
                  <pre className="whitespace-pre-wrap text-xs font-mono leading-relaxed max-h-96 overflow-y-auto bg-[var(--surface-elevated)] p-3.5 rounded-xl">
                    {doc.content}
                  </pre>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
