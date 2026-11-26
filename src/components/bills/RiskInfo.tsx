'use client';

import Link from 'next/link';
import { CircleHelp } from 'lucide-react';
import { RISK_MEANING, RISK_MEANING_MORE } from '@/lib/risk';
import { trackAttrs } from '@/lib/analytics';
import { useAnchoredPopover } from '@/components/useAnchoredPopover';
import { PopoverSheet } from '@/components/PopoverSheet';

/**
 * Semnul de întrebare de lângă un scor: la click, ce înseamnă riscul și ce nu înseamnă. Totul e din <span>, ca să poată
 * sta și într-un paragraf; popover-ul e fix, deci se afișează ca bloc.
 */
export default function RiskInfo({ className = '' }: { className?: string }) {
  const { id, btn, pop } = useAnchoredPopover();
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
      <PopoverSheet id={id} pop={pop} title="Ce înseamnă scorul de risc" as="span" width="w-[21rem]">
        <span className="block">{RISK_MEANING}</span>
        <span className="mt-2 block text-muted">{RISK_MEANING_MORE}</span>
        <Link href="/metodologie#niveluri" className="mt-3 inline-flex font-semibold text-link underline-offset-4 hover:underline">
          Cum calculăm scorul
        </Link>
      </PopoverSheet>
    </>
  );
}
