import Link from 'next/link';
import { ArrowRight, ChevronRight, Clock, ExternalLink, MessageSquare, Newspaper, Users, X } from 'lucide-react';
import type { BillLite } from '@/lib/types';
import { MODELS } from '@/lib/site';
import { RISK } from '@/lib/risk';
import { stanceLine } from '@/lib/press';
import { countWord, deadlineInfo, DEADLINE_TONE, fmt } from '@/lib/format';
import { agreement, modelScore, oneLiner } from '@/lib/stats';
import { trackAttrs } from '@/lib/analytics';
import { PartyTag, RiskChip, RiskDot, btnPrimary, btnSecondary } from '@/components/ui';
import { Flags } from './Flags';

const AGREE_TONE = { strong: 'text-muted', partial: 'text-muted', split: 'text-ink' } as const;

// Îndemnul la obiecție apare doar la proiectele cu risc ridicat; la celelalte cerem doar părerea.
export function ctaLabel(bill: BillLite, short = false) {
  if (bill.daysRemaining < 0) return short ? 'Vezi analiza' : 'Citește analiza';
  if (bill.analysis.consensus.riskLevel === 'red') return short ? 'Vezi și obiectează' : 'Obiectează în 60 de secunde';
  return short ? 'Vezi și spune-ți părerea' : 'Vezi detalii și spune-ți părerea';
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
          <Link href={`/legi/${bill.slug}`} {...trackAttrs('bill_open', { bill_id: bill.id, source: 'card' })} className="decoration-line-strong decoration-1 underline-offset-4 hover:underline">
            {c.plainTitle}
          </Link>
        </h3>
        <p className="mt-2.5 text-[15px] leading-relaxed text-body">{oneLiner(bill)}</p>

        {/* Etichetele și presa stau lipite de subsol, ca pe un rând de carduri să fie la aceeași înălțime. */}
        <div className="mt-auto space-y-2 pt-4">
          <Flags bill={bill} linkToBill />
          {bill.positions.line && (
            <div className="flex">
              <Link
                href={`/legi/${bill.slug}#pozitii`}
                {...trackAttrs('bill_open', { bill_id: bill.id, source: 'card_positions' })}
                className="inline-flex min-h-8 items-start gap-1.5 py-1.5 text-xs font-semibold leading-5 text-body underline-offset-4 hover:text-ink hover:underline"
              >
                <Users className="mt-[3px] h-3.5 w-3.5 shrink-0" aria-hidden />
                {bill.positions.line}
              </Link>
            </div>
          )}
          {bill.press.count > 0 ? (
            <Link
              href={`/legi/${bill.slug}#presa`}
              {...trackAttrs('bill_open', { bill_id: bill.id, source: 'card_press' })}
              className="inline-flex min-h-8 items-center gap-1.5 text-xs font-semibold text-body underline-offset-4 hover:text-ink hover:underline"
            >
              <Newspaper className="h-3.5 w-3.5" aria-hidden />
              {stanceLine(bill.press.stances)
                ? `În presă: ${countWord(bill.press.count, 'articol', 'articole')} · ${stanceLine(bill.press.stances)}`
                : bill.press.recent > 0
                  ? `În presă: ${countWord(bill.press.recent, 'articol', 'articole')} în ultima săptămână`
                  : `În presă: ${countWord(bill.press.count, 'articol', 'articole')}`}
            </Link>
          ) : (
            // Tăcerea presei contează doar la proiectele riscante.
            c.riskLevel === 'red' && (
              <p className="inline-flex min-h-8 items-center gap-1.5 text-xs font-semibold text-body">
                <Newspaper className="h-3.5 w-3.5" aria-hidden />
                În presă: niciun articol găsit încă
              </p>
            )
          )}
        </div>

        <div className="pt-3">
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
                      {...trackAttrs('party_select', { party: p, source: 'card' })}
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
            {...trackAttrs('bill_open', { bill_id: bill.id, source: 'card' })}
            className={`${primary ? btnPrimary : btnSecondary} mt-4 min-h-11 w-full px-4 text-sm`}
            aria-label={`${ctaLabel(bill)}: ${c.plainTitle}`}
          >
            {ctaLabel(bill)}
            <ArrowRight className="h-4 w-4 transition-transform group-hover/card:translate-x-0.5" aria-hidden />
          </Link>

          {/* Explicația se deschide într-o fereastră peste pagină: desfășurată în card, lungea un singur card din grilă. */}
          <button
            type="button"
            popoverTarget={`risc-${bill.slug}`}
            aria-haspopup="dialog"
            {...trackAttrs('risk_reason_open', { bill_id: bill.id })}
            className="mt-2 flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-lg text-left text-xs font-semibold text-muted hover:text-ink"
          >
            <span className="inline-flex flex-wrap items-center gap-x-1.5">
              De ce acest nivel de risc?
              <span className={`font-semibold ${AGREE_TONE[ag.tone]}`}>· {ag.label}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
          </button>
          <div
            id={`risc-${bill.slug}`}
            popover="auto"
            role="dialog"
            aria-labelledby={`risc-${bill.slug}-t`}
            className="fixed inset-0 m-auto max-h-[min(40rem,calc(100dvh-2rem))] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-line bg-surface p-5 text-left shadow-[var(--shadow-lift)] backdrop:bg-black/40 sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-muted">
                  De ce acest nivel de risc? <span className={AGREE_TONE[ag.tone]}>· {ag.label}</span>
                </p>
                <p id={`risc-${bill.slug}-t`} className="mt-1 font-display text-lg leading-snug text-ink">
                  {c.plainTitle}
                </p>
              </div>
              <button
                type="button"
                popoverTarget={`risc-${bill.slug}`}
                popoverTargetAction="hide"
                aria-label="Închide"
                className="-m-1.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-sunken hover:text-ink"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <RiskChip level={c.riskLevel} score={c.riskScore} />
              <p className="text-sm leading-6 text-body">{c.summaryTlDr}</p>
              <div className="rounded-xl bg-sunken p-4">
                <ModelVerdicts bill={bill} />
              </div>
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
                <a
                  href={bill.sheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  {...trackAttrs('official_source_open', { bill_id: bill.id, source: 'sheet' })}
                  className="inline-flex items-center gap-1 font-semibold text-link underline underline-offset-4">
                  Fișa oficială pe senat.ro
                  <ExternalLink className="h-3 w-3" aria-hidden />
                  <span className="sr-only">(se deschide într-o filă nouă)</span>
                </a>
              </div>
              <Link
                href={`/legi/${bill.slug}`}
                {...trackAttrs('bill_open', { bill_id: bill.id, source: 'risk_modal' })}
                className={`${primary ? btnPrimary : btnSecondary} min-h-11 w-full px-4 text-sm`}
              >
                {ctaLabel(bill)}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
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
