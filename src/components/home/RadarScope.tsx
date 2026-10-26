'use client';

import { useMemo, useState } from 'react';
import type { BillLite } from '@/lib/types';
import { RISK, RISK_LEVELS } from '@/lib/risk';
import { countWord, fmt } from '@/lib/format';
import { byRiskDesc, type RiskCounts } from '@/lib/stats';
import { RiskDot } from '@/components/ui';
import { track, trackAttrs } from '@/lib/analytics';
import BillPeek from './BillPeek';

/* Centrul ești tu: cu cât un punct e mai aproape, cu atât scorul de risc e mai mare. */
const RC = 200;
const RR = 176;
const R_INNER = 18;
const radius = (score: number) => R_INNER + ((10 - Math.min(10, Math.max(1, score))) / 9) * (RR - R_INNER);
const RING_RED = radius(7);
const RING_YELLOW = radius(4);
const TICKS = Array.from({ length: 72 }, (_, i) => i * 5);

export default function RadarScope({ bills, counts }: { bills: BillLite[]; counts: RiskCounts }) {
  const ranked = useMemo(() => [...bills].sort(byRiskDesc), [bills]);
  const pinging = useMemo(
    () => new Set(ranked.filter((b) => b.analysis.consensus.riskLevel === 'red' && b.daysRemaining >= 0).slice(0, 3).map((b) => b.id)),
    [ranked],
  );
  const points = useMemo(
    () =>
      [...bills]
        .sort((a, b) => a.id.localeCompare(b.id, 'ro', { numeric: true }))
        .map((b, i) => {
          // Unghiul de aur împrăștie punctele uniform fără să se suprapună.
          const angle = (((i * 137.508) % 360) - 90) * (Math.PI / 180);
          const r = radius(b.analysis.consensus.riskScore);
          return { b, x: RC + r * Math.cos(angle), y: RC + r * Math.sin(angle) };
        }),
    [bills],
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const active = (activeId ? bills.find((b) => b.id === activeId) : undefined) ?? ranked[0];
  const activePoint = points.find((p) => p.b.id === active?.id);
  const sweep = (-38 * Math.PI) / 180;
  const sweepEnd = { x: RC + RR * Math.cos(sweep), y: RC + RR * Math.sin(sweep) };

  return (
    <figure className="rounded-[1.75rem] border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-6">
      <figcaption className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
          <span className="relative inline-flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-risk-red opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-risk-red" />
          </span>
          Radarul legilor
        </span>
        <span className="text-xs tabular-nums text-muted">{countWord(bills.length, 'proiect urmărit', 'proiecte urmărite')}</span>
      </figcaption>

      <svg
        viewBox="0 0 400 400"
        className="mx-auto mt-2 block h-auto w-full max-w-[420px] text-ink"
        role="group"
        aria-label="Radarul proiectelor de lege. Cu cât un punct e mai aproape de centru, cu atât riscul e mai mare. Alege un punct ca să vezi proiectul."
      >
        <defs>
          <linearGradient id="radar-sweep" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="currentColor" stopOpacity={0.16} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
          </linearGradient>
        </defs>

        <circle cx={RC} cy={RC} r={RR} className="fill-risk-green/[0.06]" />
        <circle cx={RC} cy={RC} r={RING_YELLOW} className="fill-risk-amber/[0.09]" />
        <circle cx={RC} cy={RC} r={RING_RED} className="fill-risk-red/[0.11]" />
        {[RING_RED, RING_YELLOW, RR].map((r) => (
          <circle key={r} cx={RC} cy={RC} r={r} fill="none" strokeWidth={1} className="stroke-line-strong" />
        ))}
        <path d={`M ${RC - RR} ${RC} H ${RC + RR} M ${RC} ${RC - RR} V ${RC + RR}`} strokeDasharray="2 4" className="stroke-line-strong" />
        {TICKS.map((deg) => {
          const a = (deg * Math.PI) / 180;
          const long = deg % 30 === 0;
          return (
            <line
              key={deg}
              x1={RC + (RR + 3) * Math.cos(a)}
              y1={RC + (RR + 3) * Math.sin(a)}
              x2={RC + (RR + (long ? 10 : 6)) * Math.cos(a)}
              y2={RC + (RR + (long ? 10 : 6)) * Math.sin(a)}
              strokeWidth={long ? 1.25 : 0.75}
              className="stroke-line-strong"
            />
          );
        })}

        <g className="motion-reduce:hidden" aria-hidden>
          <path d={`M ${RC} ${RC} L ${RC + RR} ${RC} A ${RR} ${RR} 0 0 0 ${sweepEnd.x} ${sweepEnd.y} Z`} fill="url(#radar-sweep)" />
          <line x1={RC} y1={RC} x2={RC + RR} y2={RC} stroke="currentColor" strokeOpacity={0.3} />
          <animateTransform attributeName="transform" type="rotate" from={`0 ${RC} ${RC}`} to={`360 ${RC} ${RC}`} dur="10s" repeatCount="indefinite" />
        </g>

        {[
          { r: RING_RED, label: 'RISC RIDICAT', cls: 'fill-risk-red-text' },
          { r: RING_YELLOW, label: 'MODERAT', cls: 'fill-risk-amber-text' },
          { r: RR, label: 'REDUS', cls: 'fill-risk-green-text' },
        ].map((z) => (
          <text key={z.label} x={RC + 6} y={RC - z.r + 13} className={z.cls} style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.12em' }}>
            {z.label}
          </text>
        ))}

        {points.map(({ b, x, y }) => {
          const lvl = b.analysis.consensus.riskLevel;
          const on = active?.id === b.id;
          const closed = b.daysRemaining < 0;
          return (
            <g
              key={b.id}
              role="button"
              tabIndex={0}
              aria-pressed={on}
              aria-label={`${b.id}: ${b.analysis.consensus.plainTitle}. ${RISK[lvl].label}, scor ${fmt(b.analysis.consensus.riskScore)} din 10${closed ? '. Consultare încheiată' : ''}`}
              className="cursor-pointer outline-none [&:focus-visible>circle:last-child]:stroke-focus"
              onMouseEnter={() => setActiveId(b.id)}
              onFocus={() => setActiveId(b.id)}
              onClick={() => setActiveId(b.id)}
              {...trackAttrs('radar_select', { bill_id: b.id })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveId(b.id);
                  track('radar_select', { bill_id: b.id });
                }
              }}
            >
              {pinging.has(b.id) && (
                <circle cx={x} cy={y} r={6} className="animate-ping fill-risk-red opacity-40 motion-reduce:hidden" style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
              )}
              <circle cx={x} cy={y} r={14} fill="transparent" />
              <circle
                cx={x}
                cy={y}
                r={on ? 7.5 : 5}
                strokeWidth={2}
                className={`${RISK[lvl].svgFill} stroke-surface transition-[r] duration-200`}
                opacity={closed ? 0.35 : 1}
              />
            </g>
          );
        })}

        {activePoint && <circle cx={activePoint.x} cy={activePoint.y} r={13} fill="none" strokeWidth={1.5} className="pointer-events-none stroke-ink" />}

        <circle cx={RC} cy={RC} r={13} className="fill-ink" />
        <text x={RC} y={RC + 3} textAnchor="middle" className="pointer-events-none fill-paper" style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '0.06em' }}>
          TU
        </text>
      </svg>

      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted">
        {RISK_LEVELS.map((l) => (
          <span key={l} className="inline-flex items-center gap-1.5">
            <RiskDot level={l} />
            {RISK[l].label}
            <span className="tabular-nums font-semibold text-body">{counts[l]}</span>
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <RiskDot level="green" className="h-2 w-2 opacity-35" />
          estompat: consultare încheiată
        </span>
      </div>

      {active && <BillPeek bill={active} source="radar" />}
    </figure>
  );
}
