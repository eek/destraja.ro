import type { ReactNode } from 'react';
import { AlertTriangle, Check, Copy, Flame, Layers } from 'lucide-react';
import type { BillLite, RiskLevel } from '@/lib/types';
import { MODELS, partyFullName } from '@/lib/site';
import { RISK } from '@/lib/risk';
import { fmt } from '@/lib/format';
import { camps, modelScore } from '@/lib/stats';

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-brand font-semibold text-on-brand transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50';
export const btnSecondary =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface font-semibold text-ink transition-colors hover:border-muted hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-50';
export const linkCls = 'font-semibold text-link underline decoration-1 underline-offset-4 hover:decoration-2';
export const inputCls =
  'h-12 w-full rounded-lg border border-line-strong bg-surface text-[15px] text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15';
export const panel = 'rounded-2xl border border-line bg-surface';

export const segCls = (on: boolean) =>
  `inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
    on ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]' : 'text-muted hover:text-ink'
  }`;

export function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1240px] px-4 sm:px-8 lg:px-10 ${className}`}>{children}</div>;
}

export function RiskDot({ level, className = 'h-2 w-2' }: { level: RiskLevel; className?: string }) {
  return <span aria-hidden className={`inline-block shrink-0 rounded-full ${RISK[level].fill} ${className}`} />;
}

export function RiskChip({ level, score, size = 'sm' }: { level: RiskLevel; score?: number; size?: 'sm' | 'md' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${RISK[level].chip} ${
        size === 'md' ? 'px-3 py-1.5 text-sm' : 'px-2.5 py-1 text-xs'
      }`}
    >
      <RiskDot level={level} className="h-1.5 w-1.5" />
      {RISK[level].label}
      {score !== undefined && <span className="tabular-nums opacity-85">{fmt(score)}</span>}
    </span>
  );
}

export function PartyTag({ party }: { party: string }) {
  return (
    <span
      title={partyFullName(party)}
      className="inline-flex items-center rounded-md border border-line px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-body"
    >
      {party}
    </span>
  );
}

export function ModelMeters({ bill }: { bill: BillLite }) {
  return (
    <dl className="grid grid-cols-3 gap-3">
      {MODELS.map((m) => {
        const s = modelScore(bill, m.key);
        const lvl = bill.analysis.council?.[m.key]?.riskLevel ?? bill.analysis.consensus.riskLevel;
        return (
          <div key={m.key}>
            <div className="flex items-baseline justify-between gap-1">
              <dt className="text-[11px] font-medium text-muted">{m.name}</dt>
              <dd className="text-xs font-semibold tabular-nums text-ink">{fmt(s)}</dd>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-sunken" aria-hidden>
              <div className={`h-full rounded-full ${RISK[lvl].fill}`} style={{ width: `${Math.min(100, s * 10)}%` }} />
            </div>
          </div>
        );
      })}
    </dl>
  );
}

export function Flags({ bill }: { bill: BillLite }) {
  const items: { key: string; icon: typeof Flame; label: string; cls: string }[] = [];
  if (bill.emergencyRequested) {
    items.push({
      key: 'urg',
      icon: Flame,
      label: bill.emergencyApproved ? 'Urgență aprobată' : 'Urgență cerută',
      cls: 'text-ink',
    });
  }
  if (bill.cesNegative) items.push({ key: 'ces', icon: AlertTriangle, label: 'Aviz negativ CES', cls: 'text-body' });
  if (camps(bill.parties).bridge) items.push({ key: 'bridge', icon: Layers, label: 'Putere și opoziție împreună', cls: 'text-cross' });
  if (!items.length) return null;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1">
      {items.map((it) => (
        <li key={it.key} className={`inline-flex items-center gap-1 text-xs font-semibold ${it.cls}`}>
          <it.icon className="h-3.5 w-3.5" aria-hidden />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

export function CopyButton({
  active,
  onClick,
  label = 'Copiază',
  compact = false,
  track,
}: {
  active: boolean;
  onClick: () => void;
  label?: string;
  compact?: boolean;
  track?: Record<string, string>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...track}
      aria-label={compact ? (active ? 'Copiat' : label) : undefined}
      title={label}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border text-xs font-semibold transition-colors ${
        active ? 'border-brand bg-brand-soft text-ink' : 'border-line-strong text-body hover:border-muted hover:text-ink'
      } ${compact ? 'h-9 w-9 justify-center' : 'px-3 py-2'}`}
    >
      {active ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      {!compact && (active ? 'Copiat' : label)}
    </button>
  );
}

export function SectionHead({
  id,
  title,
  lead,
  aside,
}: {
  id: string;
  title: ReactNode;
  lead?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <h2 id={id} className="font-display text-[2rem] font-normal leading-[1.1] sm:text-5xl">
          {title}
        </h2>
        {lead && <p className="mt-3 max-w-xl text-[15px] leading-7 text-muted">{lead}</p>}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center">
      <p className="font-display text-2xl text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">{text}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
