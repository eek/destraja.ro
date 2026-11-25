import { ro } from '@/components/mo/charts';
import type { MoPre1990 } from '@/lib/mo';

/** Treptele de culoare pentru actele dintr-un an (aceeași rampă bleumarin ca zidul de pe /monitorul-oficial). */
export const YEAR_BINS = [1, 10, 40, 100, 200] as const;
export const yearTone = (n: number) => `var(--mo-${n === 0 ? 0 : YEAR_BINS.filter((b) => n >= b).length})`;
export const yearBinLabels = ['1–9', '10–39', '40–99', '100–199', '200 sau mai multe'];

const decadeName = (d: number) => `${d}–${d + 9}`;

/**
 * Deceniile ca rânduri de registru: deceniul, cei zece ani (un pătrățel pe an, mai închis când sunt mai multe acte), bara
 * deceniului și cifra. Deceniile fără niciun act rămân în listă, cu o linie în locul barei.
 */
export function DecadeLedger({ decades }: { decades: MoPre1990['decades'] }) {
  const max = Math.max(...decades.map((d) => d.acts), 1);
  return (
    <ol className="divide-y divide-line border-y border-line" aria-label="Actele din portal pe decenii, cu anii fiecărui deceniu">
      {decades.map((d) => (
        <li key={d.decade} className="grid grid-cols-[5.75rem_minmax(0,1fr)_3.5rem] items-center gap-x-3 py-2 sm:grid-cols-[6rem_auto_minmax(0,1fr)_4rem] sm:gap-x-5">
          <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-ink">{decadeName(d.decade)}</span>
          <span className="hidden grid-cols-10 gap-[3px] sm:grid" aria-hidden>
            {d.years.map((n, i) => (
              <span key={i} title={`${d.decade + i}: ${ro(n)} ${n === 1 ? 'act' : 'acte'}`} className="h-3.5 w-3.5 rounded-[3px]" style={{ background: yearTone(n) }} />
            ))}
          </span>
          <span className="relative block h-3.5" aria-hidden>
            {d.acts > 0 ? (
              <span className="absolute inset-y-0 left-0 rounded-[3px] bg-[var(--mo-5)]" style={{ width: `max(3px, ${(d.acts / max) * 100}%)` }} />
            ) : (
              <span className="absolute left-0 top-1/2 h-px w-6 bg-line-strong" />
            )}
          </span>
          <span className={`text-right text-sm tabular-nums ${d.acts ? 'font-semibold text-ink' : 'text-faint'}`}>{ro(d.acts)}</span>
          <span className="sr-only">
            {`${decadeName(d.decade)}: ${ro(d.acts)} ${d.acts === 1 ? 'act' : 'acte'}`}
            {d.acts > 0 && `; pe ani: ${d.years.map((n, i) => `${d.decade + i}: ${n}`).join(', ')}`}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Banda mică a deceniilor, pentru legătura de pe /monitorul-oficial: un pătrățel pe deceniu, pe aceeași rampă. */
export function DecadeStrip({ decades }: { decades: MoPre1990['decades'] }) {
  const tone = (n: number) => `var(--mo-${n === 0 ? 0 : [1, 10, 100, 300, 800].filter((b) => n >= b).length})`;
  return (
    <span className="inline-flex shrink-0 flex-col gap-1 self-start lg:self-center" aria-hidden>
      <span className="flex gap-[3px]">
        {decades.map((d) => (
          <span key={d.decade} className="h-5 w-3.5 rounded-[3px] sm:w-4" style={{ background: tone(d.acts) }} />
        ))}
      </span>
      <span className="flex justify-between text-[11px] tabular-nums text-muted">
        <span>{decades[0]?.decade}</span>
        <span>{decades.at(-1)?.decade}</span>
      </span>
    </span>
  );
}
