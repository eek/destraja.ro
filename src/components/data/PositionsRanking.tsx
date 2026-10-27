import Link from 'next/link';
import type { BillLite } from '@/lib/types';
import { byRiskDesc } from '@/lib/stats';
import { trackAttrs } from '@/lib/analytics';
import { RiskDot } from '@/components/ui';
import { PanelTitle } from './PressPanels';

/** Proiectele cu cele mai multe organizații care cer retragerea, respingerea sau modificarea lor. */
export function rankByPositions(bills: BillLite[], limit = 6) {
  return bills
    .filter((b) => b.positions.against > 0)
    .sort((a, b) => b.positions.against - a.positions.against || byRiskDesc(a, b))
    .slice(0, limit);
}

export default function PositionsRanking({ bills }: { bills: BillLite[] }) {
  return (
    <div>
      <PanelTitle
        title="Ce cer organizațiile"
        sub="Proiectele cu cele mai multe organizații care cer retragerea sau modificarea lor, din scrisori, petiții și puncte de vedere verificate în sursă."
      />
      <ol className="mt-3 divide-y divide-line">
        {bills.map((b) => (
          <li key={b.slug}>
            <Link
              href={`/legi/${b.slug}#pozitii`}
              {...trackAttrs('bill_open', { bill_id: b.id, source: 'press_positions' })}
              className="group flex items-start justify-between gap-4 py-4"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-xs tabular-nums text-muted">
                  <RiskDot level={b.analysis.consensus.riskLevel} />
                  {b.id}
                </span>
                <span className="mt-1 block font-semibold leading-snug text-ink group-hover:underline group-hover:underline-offset-4">{b.analysis.consensus.plainTitle}</span>
                <span className="mt-1 block text-sm leading-6 text-body">{b.positions.line}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-2xl font-semibold tabular-nums text-ink">{b.positions.against}</span>
                <span className="block text-xs text-muted">{b.positions.against === 1 ? 'organizație' : 'organizații'}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
