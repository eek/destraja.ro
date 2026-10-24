import Link from 'next/link';
import { ArrowRight, ChevronDown, Clock, ExternalLink, MessageSquare } from 'lucide-react';
import type { BillLite } from '@/lib/types';
import { MODELS } from '@/lib/site';
import { RISK } from '@/lib/risk';
import { countWord, deadlineInfo, DEADLINE_TONE, fmt } from '@/lib/format';
import { agreement, modelScore, oneLiner } from '@/lib/stats';
import { Flags, PartyTag, RiskChip, RiskDot, btnPrimary, btnSecondary } from '@/components/ui';

const AGREE_TONE = { strong: 'text-risk-green-text', partial: 'text-muted', split: 'text-risk-amber-text' } as const;

export function ctaLabel(bill: BillLite) {
  const open = bill.daysRemaining >= 0;
  if (!open) return 'Citește analiza';
  return bill.analysis.consensus.riskLevel === 'red' ? 'Obiectează în 60 de secunde' : 'Vezi detalii și spune-ți părerea';
}

export default function BillCard({ bill, onParty }: { bill: BillLite; onParty?: (party: string) => void }) {
  const c = bill.analysis.consensus;
  const dl = deadlineInfo(bill.daysRemaining);
  const ag = agreement(bill);
  const primary = dl.open && c.riskLevel === 'red';
  const parties = bill.parties;

  return (
    <article
      aria-labelledby={`t-${bill.slug}`}
      className="group/card flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)] transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]"
    >
      <div className={`h-1 w-full ${RISK[c.riskLevel].fill} ${dl.open ? '' : 'opacity-40'}`} aria-hidden />
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <RiskChip level={c.riskLevel} score={c.riskScore} />
          <span className="text-xs font-medium tabular-nums text-muted">{bill.id}</span>
        </div>

        <h3 id={`t-${bill.slug}`} className="font-display mt-4 text-[1.3rem] leading-[1.25] text-ink">
          <Link href={`/legi/${bill.slug}`} className="decoration-line-strong decoration-1 underline-offset-4 hover:underline">
            {c.plainTitle}
          </Link>
        </h3>
        <p className="mt-2.5 text-[15px] leading-relaxed text-body">{oneLiner(bill)}</p>

        <div className="mt-3">
          <Flags bill={bill} />
        </div>

        <div className="mt-auto pt-5">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-line pt-4 text-xs">
            <span className={`inline-flex items-center gap-1.5 font-semibold ${DEADLINE_TONE[dl.tone]}`}>
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {dl.label}
            </span>
            {parties.length > 0 && (
              <span className="flex flex-wrap items-center gap-1" aria-label="Partidele inițiatorilor">
                {parties.slice(0, 3).map((p) =>
                  onParty ? (
                    <button
                      key={p}
                      type="button"
                      onClick={() => onParty(p)}
                      title={`Arată proiectele cu inițiatori din ${p}`}
                      className="rounded-md transition-colors hover:bg-sunken"
                    >
                      <PartyTag party={p} />
                    </button>
                  ) : (
                    <PartyTag key={p} party={p} />
                  ),
                )}
                {parties.length > 3 && (
                  <span className="text-[11px] font-semibold text-muted" title={parties.slice(3).join(', ')}>
                    +{parties.length - 3}
                  </span>
                )}
              </span>
            )}
          </div>

          <Link
            href={`/legi/${bill.slug}`}
            className={`${primary ? btnPrimary : btnSecondary} mt-4 min-h-11 w-full px-4 text-sm`}
            aria-label={`${ctaLabel(bill)}: ${c.plainTitle}`}
          >
            {ctaLabel(bill)}
            <ArrowRight className="h-4 w-4 transition-transform group-hover/card:translate-x-0.5" aria-hidden />
          </Link>

          <details className="mt-2">
            <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg text-xs font-semibold text-muted hover:text-ink">
              <span className="inline-flex items-center gap-1.5">
                De ce acest nivel de risc?
                <span className={`font-semibold ${AGREE_TONE[ag.tone]}`}>· {ag.label}</span>
              </span>
              <ChevronDown className="chevron h-4 w-4 shrink-0" aria-hidden />
            </summary>
            <div className="mt-1 space-y-4 rounded-xl bg-sunken p-4">
              <p className="text-sm leading-6 text-body">{c.summaryTlDr}</p>
              <ModelVerdicts bill={bill} />
              {c.affectedGroups.length > 0 && (
                <p className="text-xs leading-5 text-muted">
                  <span className="font-semibold text-body">Pe cine afectează: </span>
                  {c.affectedGroups.join(', ')}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                  {bill.opinionsCount === 0 ? 'Nicio opinie depusă încă' : countWord(bill.opinionsCount, 'opinie depusă', 'opinii depuse')}
                </span>
                <a href={bill.sheetUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-link underline underline-offset-4">
                  Fișa oficială pe senat.ro
                  <ExternalLink className="h-3 w-3" aria-hidden />
                  <span className="sr-only">(se deschide într-o filă nouă)</span>
                </a>
              </div>
            </div>
          </details>
        </div>
      </div>
    </article>
  );
}

export function ModelVerdicts({ bill }: { bill: BillLite }) {
  return (
    <ul className="space-y-3">
      {MODELS.map((m) => {
        const v = bill.analysis.council?.[m.key];
        const s = modelScore(bill, m.key);
        const lvl = v?.riskLevel ?? bill.analysis.consensus.riskLevel;
        return (
          <li key={m.key} className="border-t border-line pt-3 first:border-0 first:pt-0">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="inline-flex items-center gap-2 font-semibold text-ink">
                <RiskDot level={lvl} />
                {m.name}
              </span>
              <span className={`text-sm font-semibold tabular-nums ${RISK[lvl].text}`}>{fmt(s)} / 10</span>
            </div>
            {v?.verdictShort && <p className="mt-1 text-xs leading-5 text-body">{v.verdictShort}</p>}
          </li>
        );
      })}
    </ul>
  );
}
