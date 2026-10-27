'use client';

import { useMemo, useState } from 'react';
import type { PartyStat } from '@/lib/stats';
import { RISK, RISK_LEVELS, levelFromScore } from '@/lib/risk';
import { countWord, fmt } from '@/lib/format';
import { RiskDot, segCls } from '@/components/ui';
import { trackAttrs } from '@/lib/analytics';

type Metric = 'medie' | 'volum' | 'urgente';

// Scorul mediu e implicit: compară partidele după cât de riscante sunt proiectele lor, nu după câte au semnat.
const METRICS: { key: Metric; label: string; note: string }[] = [
  {
    key: 'medie',
    label: 'Scor mediu',
    note: 'Media scorurilor de risc ale proiectelor partidului, de la 1 la 10. Culoarea urmează media, cu aceleași praguri ca la proiecte: de la 6,8 e risc ridicat, de la 3,8 moderat, sub 3,8 redus. O medie calculată pe puține proiecte se poate schimba ușor.',
  },
  { key: 'volum', label: 'Proiecte', note: 'Câte proiecte au cel puțin un inițiator din partid, împărțite pe niveluri de risc.' },
  { key: 'urgente', label: 'Urgențe', note: 'Proiecte pentru care s-a cerut procedură de urgență.' },
];

const value = (p: PartyStat, m: Metric) => (m === 'volum' ? p.billsCount : m === 'medie' ? p.avgRiskScore : p.emergencyCount);

export default function PartyChart({
  stats,
  selected,
  onSelect,
  selectLabel = 'Vezi proiectele',
}: {
  stats: PartyStat[];
  selected?: string | null;
  onSelect: (party: string) => void;
  selectLabel?: string;
}) {
  const [metric, setMetric] = useState<Metric>('medie');

  // Rândurile sunt mereu ordonate după valoarea afișată, ca barele să scadă de sus în jos.
  const rows = useMemo(() => {
    const max = metric === 'medie' ? 10 : Math.max(1, ...stats.map((p) => value(p, metric)));
    return [...stats]
      .sort((a, b) => value(b, metric) - value(a, metric) || b.billsCount - a.billsCount || a.party.localeCompare(b.party, 'ro'))
      .map((p) => ({ p, v: value(p, metric), w: (value(p, metric) / max) * 100 }));
  }, [stats, metric]);

  return (
    <div className="flex flex-1 flex-col">
      <div role="group" aria-label="Ce arată graficul" className="flex gap-1 overflow-x-auto rounded-lg bg-sunken p-1 no-scrollbar">
        {METRICS.map((m) => (
          <button key={m.key} type="button" aria-pressed={metric === m.key} onClick={() => setMetric(m.key)} {...trackAttrs('party_chart_metric', { metric: m.key })} className={`${segCls(metric === m.key)} flex-1 justify-center`}>
            {m.label}
          </button>
        ))}
      </div>

      <ol className="mt-4 space-y-0.5">
        {rows.map(({ p, v, w }, i) => {
          const on = selected === p.party;
          return (
            <li key={p.party}>
              <button
                type="button"
                onClick={() => onSelect(p.party)}
                {...trackAttrs('party_select', { party: p.party, source: 'chart', metric })}
                aria-pressed={on}
                aria-label={`${i + 1}. ${p.party}: ${countWord(p.billsCount, 'proiect', 'proiecte')}, ${p.redCount} cu risc ridicat, ${p.yellowCount} moderat, ${p.greenCount} redus, scor mediu ${fmt(p.avgRiskScore)}. ${selectLabel}.`}
                className={`grid min-h-11 w-full grid-cols-[5.75rem_1fr_3rem] items-center gap-3 rounded-lg px-2 text-left transition-colors ${
                  on ? 'bg-brand-soft' : 'hover:bg-sunken'
                }`}
              >
                <span className="min-w-0" title={p.fullName}>
                  <span className="block truncate text-sm font-semibold text-ink">{p.party}</span>
                  {metric === 'medie' && <span className="block text-[11px] leading-4 tabular-nums text-muted">{countWord(p.billsCount, 'proiect', 'proiecte')}</span>}
                </span>
                <span className="relative h-5 overflow-hidden rounded-[4px] bg-sunken" aria-hidden>
                  <span className="absolute inset-y-0 left-0 flex overflow-hidden rounded-[4px] transition-[width] duration-500" style={{ width: `${Math.max(w, v > 0 ? 2 : 0)}%` }}>
                    {metric === 'volum' ? (
                      RISK_LEVELS.map((l) => {
                        const n = l === 'red' ? p.redCount : l === 'yellow' ? p.yellowCount : p.greenCount;
                        return <span key={l} className={`h-full ${RISK[l].fill}`} style={{ width: `${p.billsCount ? (n / p.billsCount) * 100 : 0}%` }} />;
                      })
                    ) : (
                      <span className={`h-full w-full ${metric === 'medie' ? RISK[levelFromScore(v)].fill : 'bg-brand'}`} />
                    )}
                  </span>
                </span>
                <span className="text-right text-sm font-semibold tabular-nums text-ink">{metric === 'medie' ? fmt(v) : v}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-auto space-y-2 pt-4">
        {metric !== 'urgente' && (
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            {RISK_LEVELS.map((l) => (
              <span key={l} className="inline-flex items-center gap-1.5">
                <RiskDot level={l} />
                {RISK[l].label}
              </span>
            ))}
          </p>
        )}
        <p className="text-xs leading-5 text-muted">
          {METRICS.find((m) => m.key === metric)?.note} Un proiect cu inițiatori din mai multe partide e numărat la fiecare, deci totalurile nu se adună.
        </p>
      </div>
    </div>
  );
}
