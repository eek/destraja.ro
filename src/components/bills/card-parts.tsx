import type { RiskLevel } from '@/lib/types';
import { RISK } from '@/lib/risk';
import { fmt } from '@/lib/format';
import { Glyph } from '@/components/ui';

// Ce au în comun cardurile de proiect de la Senat și de la Cameră, ca să arate la fel pe ambele pagini.

export const cardCls =
  'group/card flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)] transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]';

/** Dunga de sus, în culoarea riscului; mai stinsă când nu se mai poate interveni. */
export function CardStrip({ level, dim = false }: { level: RiskLevel | null; dim?: boolean }) {
  return <div className={`h-1 w-full ${level ? RISK[level].fill : 'bg-line-strong'} ${dim ? 'opacity-40' : ''}`} aria-hidden />;
}

export const riskChipCls = (level: RiskLevel) =>
  `inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-shadow hover:shadow-[inset_0_0_0_1px_currentColor] ${RISK[level].chip}`;

/** Cipul de risc cu „De ce?”: deschide explicația scorului. */
export function RiskChipFace({ level, score }: { level: RiskLevel; score: number }) {
  return (
    <>
      <Glyph level={level} className="h-2.5 w-2.5" />
      {RISK[level].label}
      <span className="tabular-nums opacity-85">{fmt(score)}</span>
      <span className="ml-0.5 border-l border-current/30 pl-1.5 underline underline-offset-2">De ce?</span>
    </>
  );
}

export const cardTitleCls = 'font-display mt-4 text-[1.3rem] leading-[1.25] text-ink';
export const cardLedeCls = 'mt-2.5 line-clamp-3 text-[15px] leading-relaxed text-body';
