'use client';

import Link from 'next/link';
import { CircleHelp, X } from 'lucide-react';
import { RISK_MEANING, RISK_MEANING_MORE } from '@/lib/risk';
import { trackAttrs } from '@/lib/analytics';
import { useAnchoredPopover } from '@/components/useAnchoredPopover';

/**
 * Semnul de întrebare de lângă un scor: la click, ce înseamnă riscul și ce nu înseamnă. Totul e din <span>, ca să poată
 * sta și într-un paragraf; popover-ul e fix, deci se afișează ca bloc.
 */
export default function RiskInfo({ className = '' }: { className?: string }) {
  const { id, btn, pop } = useAnchoredPopover<HTMLSpanElement>();
  return (
    <>
      <button
        ref={btn}
        type="button"
        popoverTarget={id}
        aria-haspopup="dialog"
        aria-label="Ce înseamnă scorul de risc?"
        {...trackAttrs('risk_info_open', {})}
        className={`inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-sunken hover:text-ink ${className}`}
      >
        <CircleHelp className="h-4 w-4" aria-hidden />
      </button>
      <span
        ref={pop}
        id={id}
        popover="auto"
        role="dialog"
        aria-labelledby={`${id}-t`}
        className="fixed inset-auto m-0 w-[21rem] rounded-2xl border border-line bg-surface p-5 text-left text-sm font-normal leading-6 text-body shadow-[var(--shadow-lift)]"
      >
        <span className="flex items-start justify-between gap-3">
          <span id={`${id}-t`} className="font-semibold text-ink">
            Ce înseamnă scorul de risc
          </span>
          <button
            type="button"
            popoverTarget={id}
            popoverTargetAction="hide"
            aria-label="Închide"
            className="-m-1.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-sunken hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </span>
        <span className="mt-2 block">{RISK_MEANING}</span>
        <span className="mt-2 block text-muted">{RISK_MEANING_MORE}</span>
        <Link href="/metodologie#niveluri" className="mt-3 inline-flex font-semibold text-link underline-offset-4 hover:underline">
          Cum calculăm scorul
        </Link>
      </span>
    </>
  );
}
