import type { ReactNode } from 'react';
import type { RiskLevel } from '@/lib/types';
import { RISK, RISK_LEVELS } from '@/lib/risk';
import { Glyph } from '@/components/ui';

/** Un buton de filtru din bara de deasupra cardurilor, la fel la Senat și la Cameră. */
export const chipCls = (on: boolean) =>
  `inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors ${
    on ? 'border-brand bg-brand-soft text-ink' : 'border-line bg-surface text-body hover:border-line-strong hover:text-ink'
  }`;

export function FilterChip({ on, onClick, count, title, children }: { on: boolean; onClick: () => void; count: number; title?: string; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} title={title} className={chipCls(on)}>
      {children}
      <span className="font-normal tabular-nums opacity-80">{count}</span>
    </button>
  );
}

const ACTIVE: Record<RiskLevel, string> = {
  red: 'border-risk-red bg-risk-red-soft text-risk-red-text',
  yellow: 'border-risk-amber bg-risk-amber-soft text-risk-amber-text',
  green: 'border-risk-green bg-risk-green-soft text-risk-green-text',
};

/**
 * Filtrul după risc, același pe toate paginile: patru butoane mari (toate, ridicat, moderat, redus) și, dedesubt, linia
 * roșu-galben-verde cu cât din listă ocupă fiecare nivel. Și bucățile liniei filtrează.
 */
export default function RiskFilter({
  counts,
  value,
  onChange,
}: {
  counts: Record<RiskLevel, number>;
  value: RiskLevel | null;
  onChange: (level: RiskLevel | null) => void;
}) {
  const total = RISK_LEVELS.reduce((s, l) => s + counts[l], 0);
  return (
    <div role="group" aria-label="Filtrează după nivelul de risc">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button
          type="button"
          aria-pressed={value === null}
          onClick={() => onChange(null)}
          className={`flex min-h-12 items-center justify-between gap-2 rounded-xl border px-3.5 text-left text-[15px] font-semibold transition-colors ${
            value === null ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface text-ink hover:border-line-strong'
          }`}
        >
          Toate
          <span className="tabular-nums opacity-80">{total}</span>
        </button>
        {RISK_LEVELS.map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={value === l}
            disabled={!counts[l]}
            onClick={() => onChange(value === l ? null : l)}
            className={`flex min-h-12 items-center justify-between gap-2 rounded-xl border px-3.5 text-left text-[15px] font-semibold transition-colors disabled:opacity-50 ${
              value === l ? ACTIVE[l] : 'border-line bg-surface text-ink hover:border-line-strong'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <Glyph level={l} className="h-3 w-3" />
              {/* Pe telefon, pe două coloane, „Risc moderat” nu încape lângă număr. */}
              <span className="capitalize sm:hidden">{RISK[l].short}</span>
              <span className="hidden sm:inline">{RISK[l].label}</span>
            </span>
            <span className="tabular-nums opacity-80">{counts[l]}</span>
          </button>
        ))}
      </div>
      {total > 0 && (
        <div className="mt-2.5 flex h-2.5 gap-0.5" aria-hidden>
          {RISK_LEVELS.filter((l) => counts[l]).map((l) => (
            <button
              key={l}
              type="button"
              tabIndex={-1}
              onClick={() => onChange(value === l ? null : l)}
              style={{ flex: `${counts[l]} 1 0` }}
              className={`min-w-1.5 rounded-[3px] ${RISK[l].fill} transition-opacity ${value && value !== l ? 'opacity-25' : ''}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
