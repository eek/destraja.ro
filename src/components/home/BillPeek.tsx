'use client';

import Link from 'next/link';
import { ArrowRight, Clock } from 'lucide-react';
import type { BillLite } from '@/lib/types';
import { deadlineInfo, DEADLINE_TONE } from '@/lib/format';
import { RiskChip } from '@/components/ui';
import { ctaLabel } from '@/components/bills/BillCard';
import { trackAttrs } from '@/lib/analytics';

/** Fișa proiectului ales în hero: riscul, titlul pe înțeles, termenul și drumul spre analiză. */
export default function BillPeek({ bill, source }: { bill: BillLite; source: string }) {
  const dl = deadlineInfo(bill.daysRemaining);
  return (
    <div className="mt-4 border-t border-line pt-4" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <RiskChip level={bill.analysis.consensus.riskLevel} score={bill.analysis.consensus.riskScore} />
        <span className="text-xs tabular-nums text-muted">{bill.id}</span>
      </div>
      <p className="font-display mt-2.5 line-clamp-2 min-h-[2.6em] text-lg leading-snug text-ink">{bill.analysis.consensus.plainTitle}</p>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs">
        <span className={`inline-flex items-center gap-1.5 font-semibold ${DEADLINE_TONE[dl.tone]}`}>
          <Clock className="h-3.5 w-3.5" aria-hidden />
          {dl.label}
        </span>
        <Link
          href={`/legi/${bill.slug}`}
          {...trackAttrs('bill_open', { bill_id: bill.id, source })}
          className="inline-flex items-center gap-1 text-sm font-semibold text-link hover:underline underline-offset-4"
        >
          {ctaLabel(bill, true)}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
