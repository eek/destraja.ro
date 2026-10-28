'use client';

import { useMemo, useState } from 'react';
import type { BillLite } from '@/lib/types';
import { ARC_DATE, OPOZITIE, PARTY_ORDER, PUTERE, SPRIJIN, partyFullName } from '@/lib/site';
import { countWord } from '@/lib/format';
import { isBridgePair } from '@/lib/stats';
import { trackAttrs } from '@/lib/analytics';

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const SHORT: Record<string, string> = { Minorități: 'Min.', Neafiliați: 'Neaf.' };
const label = (p: string) => (
  <>
    <span className="sm:hidden">{SHORT[p] ?? p}</span>
    <span className="hidden sm:inline">{p}</span>
  </>
);
const sameCamp = (a: string, b: string) => (PUTERE.has(a) && PUTERE.has(b)) || (OPOZITIE.has(a) && OPOZITIE.has(b));

export default function CoalitionMatrix({
  bills,
  active,
  onPick,
}: {
  bills: BillLite[];
  active: string[];
  onPick: (parties: string[]) => void;
}) {
  const parties = useMemo(() => {
    const present = new Set(bills.flatMap((b) => b.parties));
    const ordered = PARTY_ORDER.filter((p) => present.has(p));
    return [...ordered, ...[...present].filter((p) => !PARTY_ORDER.includes(p)).sort((a, b) => a.localeCompare(b, 'ro'))];
  }, [bills]);

  const { cells, maxPair } = useMemo(() => {
    const map = new Map<string, number>();
    let max = 0;
    for (const b of bills) {
      const ps = [...new Set(b.parties)];
      ps.forEach((a, i) =>
        ps.slice(i).forEach((c, offset) => {
          const k = pairKey(a, c);
          const v = (map.get(k) ?? 0) + 1;
          map.set(k, v);
          if (offset > 0 && v > max) max = v;
        }),
      );
    }
    return { cells: map, maxPair: max };
  }, [bills]);

  const [hover, setHover] = useState<[string, string] | null>(null);
  const describe = (pair: [string, string] | null) => {
    if (!pair) return 'Alege o căsuță ca să vezi proiectele semnate împreună.';
    const [a, b] = pair;
    const v = cells.get(pairKey(a, b)) ?? 0;
    if (a === b) return `${a}: ${countWord(v, 'proiect', 'proiecte')} cu inițiatori din partid.`;
    return `${a} și ${b}: ${countWord(v, 'proiect semnat', 'proiecte semnate')} împreună${isBridgePair(a, b) ? ', putere și opoziție pe aceeași listă.' : '.'}`;
  };

  if (parties.length < 2) {
    return <p className="text-sm text-muted">Nu există încă proiecte semnate de mai multe partide.</p>;
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="relative overflow-x-auto pb-1">
        <table className="mx-auto border-separate border-spacing-[2px] sm:border-spacing-[3px]">
          <caption className="sr-only">Numărul de proiecte semnate în comun de fiecare pereche de partide</caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Partid</span>
              </th>
              {parties.map((p) => (
                <th key={p} scope="col" className="h-14 align-bottom sm:h-20" title={partyFullName(p)}>
                  <span className="inline-block rotate-180 text-[10px] font-semibold text-muted [writing-mode:vertical-rl] sm:text-[11px]">{label(p)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parties.map((row, i) => (
              <tr key={row}>
                <th scope="row" className="whitespace-nowrap pr-1 text-right text-[10px] font-semibold text-muted sm:pr-1.5 sm:text-[11px]" title={partyFullName(row)}>
                  {label(row)}
                </th>
                {parties.map((col, j) => {
                  if (j > i) return <td key={col} aria-hidden />;
                  const v = cells.get(pairKey(row, col)) ?? 0;
                  const diag = i === j;
                  const cross = !diag && isBridgePair(row, col);
                  const camp = !diag && sameCamp(row, col);
                  const alpha = !diag && v ? 0.16 + 0.74 * (v / Math.max(1, maxPair)) : 0;
                  const tone = cross ? 'var(--cross)' : camp ? 'var(--camp)' : 'var(--muted)';
                  const isActive = (diag ? active.length === 1 : active.length === 2) && active.includes(row) && active.includes(col);
                  return (
                    <td key={col}>
                      <button
                        type="button"
                        disabled={v === 0}
                        onClick={() => onPick(diag ? [row] : [row, col])}
                        {...trackAttrs('coalition_select', { pair: diag ? row : `${row}+${col}` })}
                        onMouseEnter={() => setHover([row, col])}
                        onMouseLeave={() => setHover(null)}
                        onFocus={() => setHover([row, col])}
                        onBlur={() => setHover(null)}
                        aria-label={describe([row, col])}
                        className={`flex h-[23px] w-[23px] items-center justify-center rounded-[4px] text-[10px] tabular-nums transition-transform sm:h-9 sm:w-9 sm:rounded-md sm:text-xs ${
                          diag
                            ? 'border border-line-strong bg-sunken font-semibold text-body'
                            : v === 0
                              ? 'cursor-default border border-dashed border-line text-faint'
                              : alpha > 0.5
                                ? 'font-semibold text-paper hover:scale-110'
                                : 'font-semibold text-ink hover:scale-110'
                        } ${isActive ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''}`}
                        style={!diag && v ? { backgroundColor: `color-mix(in oklab, ${tone} ${Math.round(alpha * 100)}%, transparent)` } : undefined}
                      >
                        {v || '·'}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 min-h-[2.5rem] text-sm font-medium text-ink" aria-live="polite">
        {describe(hover)}
      </p>
      <div className="mt-auto space-y-2 pt-2 text-xs text-muted">
        <p className="flex flex-wrap gap-x-4 gap-y-1.5">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[3px] bg-camp" aria-hidden />
            Aceeași tabără
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[3px] bg-cross" aria-hidden />
            Putere și opoziție
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[3px] bg-muted/60" aria-hidden />
            Fără tabără
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[3px] border border-line-strong bg-sunken" aria-hidden />
            Diagonala: totalul partidului
          </span>
        </p>
        <p className="leading-5">
          Putere: {[...PUTERE].join(', ')} (guvernul Niculescu, din {ARC_DATE}). Opoziție: {[...OPOZITIE].join(', ')}. Au votat guvernul fără să intre
          în el: {[...SPRIJIN].join(', ')}. Multe proiecte au fost semnate înainte, sub coaliția Bolojan. Co-semnarea unui proiect nu spune cum va vota
          partidul.
        </p>
      </div>
    </div>
  );
}
