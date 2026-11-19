import { ArrowDown, ArrowUp } from 'lucide-react';
import type { RiskLevel } from '@/lib/types';
import { type ListMove, REASON_LABEL } from '@/lib/score-history';
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

/**
 * Lângă cipul de risc, când scorul s-a mișcat cu cel puțin un punct în ultimele 30 de zile: săgeata și scorul de dinainte,
 * în gri (culorile riscului rămân ale scorului de acum: un scor scăzut, dar tot ridicat, nu e „verde”). De ce s-a mișcat
 * spune pagina proiectului; aici doar în titlu și pentru cititoarele de ecran.
 */
export function ScoreMovePill({ move, now }: { move: ListMove; now: number }) {
  const down = now < move.from;
  const why = move.reasons.map((r) => REASON_LABEL[r].toLowerCase()).join(', ');
  const label = `Scorul ${down ? 'a scăzut' : 'a crescut'}, era ${fmt(move.from)}${move.kind === 'recalc' ? ' (recalculat)' : ''}: ${why}`;
  return (
    <span title={label} className="inline-flex min-h-6 items-center gap-0.5 whitespace-nowrap rounded-full bg-sunken px-2 text-xs font-semibold tabular-nums text-body">
      {down ? <ArrowDown className="h-3 w-3" aria-hidden /> : <ArrowUp className="h-3 w-3" aria-hidden />}
      <span aria-hidden>era {fmt(move.from)}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
