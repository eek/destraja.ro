'use client';

import { useId } from 'react';
import { ALERT_LEVELS, type AlertLevel } from '@/lib/alerts';
import { RiskDot } from '@/components/ui';

/** Cele trei niveluri ca butoane radio mari, cu punctele de risc pe care le include fiecare. */
export default function LevelPicker({ value, onChange, legend }: { value: AlertLevel; onChange: (level: AlertLevel) => void; legend: string }) {
  const name = useId();
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-ink">{legend}</legend>
      <div className="mt-2 grid gap-2">
        {ALERT_LEVELS.map((l) => (
          <label
            key={l.value}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-line-strong bg-surface p-4 transition-colors hover:bg-sunken/60 has-[:checked]:border-brand has-[:checked]:bg-brand-soft/50 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus"
          >
            <input
              type="radio"
              name={name}
              value={l.value}
              checked={value === l.value}
              onChange={() => onChange(l.value)}
              className="mt-1 h-4 w-4 shrink-0 focus:outline-none"
            />
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-ink">
                {l.label}
                <span className="inline-flex items-center gap-1" aria-hidden>
                  {l.risks.map((r) => (
                    <RiskDot key={r} level={r} />
                  ))}
                </span>
              </span>
              <span className="mt-0.5 block text-sm leading-6 text-body">{l.text}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
