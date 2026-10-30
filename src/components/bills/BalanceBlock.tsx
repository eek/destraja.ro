import Link from 'next/link';
import { ArrowRight, ChevronRight } from 'lucide-react';
import type { BalanceSummary, RiskLevel } from '@/lib/types';
import { RISK } from '@/lib/risk';
import { countWord, fmt } from '@/lib/format';
import { Glyph } from '@/components/ui';

type Summary = NonNullable<BalanceSummary>;

// Ce ar scoate reparația apare hașurat în bară și în legenda de lângă „Ce ar repara-o”.
const HATCH =
  'bg-[repeating-linear-gradient(-45deg,var(--risk-red)_0_1.6px,var(--risk-red-soft)_1.6px_4.2px)] shadow-[inset_0_0_0_1px_var(--risk-red)]';
const sum = (w: number[]) => w.reduce((a, b) => a + b, 0);

/**
 * Răspunsul la întrebarea de pe card: e o lege rea de tot, sau una bună, stricată de o parte? „Stricată de o parte” doar
 * când reparația scoate cel mult două prevederi; dacă trebuie scoasă mai mult de atât, legea e doar „reparabilă”.
 */
export function balanceVerdict(b: Summary, level: RiskLevel) {
  if (!b.bad.length) return 'N-am găsit probleme';
  if (b.fix) return b.good.length && b.fix.removes.length <= 2 ? 'Bună, stricată de o parte' : 'Reparabilă';
  if (level !== 'red') return sum(b.good) >= sum(b.bad) ? 'Mai mult bună' : 'Cu probleme';
  return b.good.length ? 'Rea în ansamblu' : 'Rea în întregime';
}

/** Fiecare prevedere e o bucată, lată cât importanța ei: binele din stânga, răul din dreapta, ce ar scoate reparația la capăt. */
export function BalanceBar({ b }: { b: Summary }) {
  const removes = new Set(b.fix?.removes ?? []);
  const bad = b.bad.map((w, i) => ({ w, cut: removes.has(i) }));
  const segs = [
    ...b.good.map((w) => ({ w, kind: 'good' as const })),
    ...bad.filter((s) => !s.cut).reverse().map((s) => ({ w: s.w, kind: 'bad' as const })),
    ...bad.filter((s) => s.cut).reverse().map((s) => ({ w: s.w, kind: 'cut' as const })),
  ];
  const label =
    `${countWord(b.good.length, 'lucru bun', 'lucruri bune')} și ${countWord(b.bad.length, 'problemă', 'probleme')}, după importanță` +
    (b.fix ? `; reparația ar scoate ${removes.size === b.bad.length ? 'toate problemele' : `${removes.size} din ${b.bad.length}`}` : '');
  return (
    <div role="img" aria-label={label} className="mt-2.5 flex h-2.5 gap-0.5">
      {segs.map((s, i) => (
        <span
          key={i}
          style={{ flex: `${s.w} 1 0` }}
          className={`min-w-[3px] rounded-[2px] ${s.kind === 'good' ? 'bg-risk-green' : s.kind === 'bad' ? 'bg-risk-red' : HATCH} ${
            i === b.good.length && i > 0 ? 'ml-1' : ''
          }`}
        />
      ))}
    </div>
  );
}

// Ce e bine și ce strică, pe un card din listă: verdictul, balanța, problema cea mai gravă și reparația, dacă există.
export default function BalanceBlock({
  balance,
  level,
  score,
  href,
  className = '',
}: {
  balance: BalanceSummary;
  level: RiskLevel;
  score: number;
  href: string;
  className?: string;
}) {
  if (!balance) return null;
  const b = balance;
  const g = b.good.length;
  const n = b.bad.length;
  const after = b.fix?.levelAfter ?? null;
  return (
    <section aria-label="Ce e bine și ce strică" className={className}>
      <div className="flex min-h-6 items-center justify-between gap-3">
        <p className="text-[15px] font-bold leading-snug text-ink">{balanceVerdict(b, level)}</p>
        <Link
          href={`${href}#bine-rau`}
          aria-label={`Vezi toate punctele: ${g} bune, ${n} rele`}
          className="inline-flex min-h-8 shrink-0 items-center gap-1 text-[13px] font-semibold tabular-nums underline decoration-line-strong underline-offset-4 hover:decoration-current"
        >
          <span className={g ? 'text-risk-green-text' : 'text-muted'}>{g === 1 ? '1 bună' : `${g} bune`}</span>
          <span className="text-muted" aria-hidden>
            ·
          </span>
          <span className="text-risk-red-text">{n === 1 ? '1 rea' : `${n} rele`}</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted" aria-hidden />
        </Link>
      </div>
      <BalanceBar b={b} />
      {b.worst && (
        <p className="mt-3 line-clamp-2 text-sm leading-snug text-body" title={b.worst}>
          <b className="font-bold text-risk-red-text">Cel mai grav:</b> {b.worst}
        </p>
      )}
      {b.fix ? (
        <div className="mt-3.5 border-t border-dashed border-line-strong pt-3">
          {after && b.fix.scoreAfter !== null && (
            <p
              className="flex items-center justify-end gap-1.5 text-[13px] font-semibold tabular-nums"
              aria-label={`Riscul ar scădea de la ${fmt(score)} la ${fmt(b.fix.scoreAfter)}, ${RISK[after].label.toLowerCase()} (estimare)`}
            >
              <span className={`inline-flex items-center gap-1 ${RISK[level].text}`}>
                <Glyph level={level} className="h-2.5 w-2.5" />
                {fmt(score)}
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-muted" aria-hidden />
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 ${RISK[after].chip}`}>
                <Glyph level={after} className="h-2.5 w-2.5" />
                {RISK[after].label} {fmt(b.fix.scoreAfter)}
              </span>
            </p>
          )}
          <p className="mt-1.5 line-clamp-2 text-[13.5px] leading-snug text-body" title={b.fix.text}>
            <b className="font-bold text-ink">
              <span aria-hidden className={`mr-1.5 inline-block h-2.5 w-3.5 rounded-[2px] align-[-1px] ${HATCH}`} />
              Ce ar repara-o:
            </b>{' '}
            {b.fix.text}
          </p>
        </div>
      ) : (
        level === 'red' &&
        n > 0 && (
          <p className="mt-3 border-t border-dashed border-line-strong pt-2.5 text-[13.5px] leading-snug text-muted">
            <b className="font-bold text-ink">Ce ar repara-o:</b> nu ajunge o singură schimbare.
          </p>
        )
      )}
    </section>
  );
}

/** Doar problema cea mai gravă, pentru listele scurte (pagina principală). */
export function WorstLine({ text, className = '' }: { text: string | null | undefined; className?: string }) {
  if (!text) return null;
  return (
    <p className={`line-clamp-2 text-sm leading-snug text-body ${className}`} title={text}>
      <b className="font-bold text-risk-red-text">Cel mai grav:</b> {text}
    </p>
  );
}
