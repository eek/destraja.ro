import Link from 'next/link';
import { ChevronDown, Layers } from 'lucide-react';
import type { RelatedAct, RelatedRow } from '@/lib/related';
import { countWord } from '@/lib/format';
import { RiskChip, panel } from '@/components/ui';

const SHOWN = 5;

/**
 * „Alte proiecte care modifică aceeași lege”: câte un grup pe act (legea, ordonanța, codul din titlul oficial), cu
 * proiectele de la ambele camere care îl schimbă și ele. Primele cinci se văd, restul stau sub „și încă N”.
 * Fără proiecte înrudite, nu apare nimic.
 */
export default function RelatedActs({ acts, className = 'mt-12' }: { acts: RelatedAct[]; className?: string }) {
  if (!acts.length) return null;
  return (
    <section id="aceeasi-lege" aria-labelledby="aceeasi-lege-titlu" className={`${className} scroll-mt-20`}>
      <h2 id="aceeasi-lege-titlu" className="font-display text-2xl font-normal sm:text-3xl">
        Alte proiecte care modifică aceeași lege
      </h2>
      <p className="mt-2 max-w-[64ch] text-[15px] leading-7 text-muted">
        Luate separat, schimbările aceleiași legi trec ușor neobservate. Le găsim după titlul oficial, la Senat și la Cameră; întâi cele încă în
        dezbatere.
      </p>
      <div className="mt-5 space-y-4">
        {acts.map((a) => {
          const open = a.rows.filter((r) => r.active).length;
          return (
            <div key={a.key} className={`${panel} overflow-hidden`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-4">
                <h3 className="max-w-[60ch] text-base leading-6">
                  <span className="font-semibold text-ink">{a.title}</span>
                  {a.detail && (
                    <span className="text-body">
                      {a.code ? ', ' : ' '}
                      {a.detail}
                    </span>
                  )}
                </h3>
                <p className="text-sm tabular-nums text-muted">
                  {countWord(a.rows.length, 'proiect', 'proiecte')}
                  {open > 0 && open < a.rows.length && `, ${open} în dezbatere`}
                </p>
              </div>
              <ul className="divide-y divide-line border-t border-line">
                {a.rows.slice(0, SHOWN).map((r) => (
                  <Row key={r.id} row={r} />
                ))}
              </ul>
              {a.rows.length > SHOWN && (
                <details className="border-t border-line">
                  <summary className="flex min-h-11 cursor-pointer items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-link transition-colors hover:bg-sunken/60">
                    și încă {a.rows.length - SHOWN}
                    <ChevronDown className="chevron h-4 w-4" aria-hidden />
                  </summary>
                  <ul className="divide-y divide-line border-t border-line">
                    {a.rows.slice(SHOWN).map((r) => (
                      <Row key={r.id} row={r} />
                    ))}
                  </ul>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Row({ row }: { row: RelatedRow }) {
  return (
    <li>
      <Link
        href={row.href}
        className="flex min-h-11 flex-col gap-1.5 px-5 py-3.5 transition-colors hover:bg-sunken/60 sm:flex-row sm:items-baseline sm:gap-4"
      >
        <span className="shrink-0 text-sm tabular-nums text-muted sm:w-32">{row.number}</span>
        <span className="min-w-0 flex-1 text-[15px] leading-6 text-ink">{row.title}</span>
        <span className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {row.risk && <RiskChip level={row.risk.level} score={row.risk.score} />}
          <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${row.active ? 'bg-sunken text-body' : 'text-muted'}`}>{row.stage}</span>
        </span>
      </Link>
    </li>
  );
}

/** Rândul mic din antetul proiectului: „Încă 10 proiecte modifică aceeași lege”, cu trimitere la bloc. */
export function RelatedActsLink({ count, acts }: { count: number; acts: number }) {
  if (!count) return null;
  return (
    <a href="#aceeasi-lege" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-body underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink">
      <Layers className="h-4 w-4 text-muted" aria-hidden />
      <span>
        Încă <span className="tabular-nums">{count === 1 ? 'un proiect' : countWord(count, 'proiect', 'proiecte')}</span>{' '}
        modifică {acts === 1 ? 'aceeași lege' : 'aceleași legi'}
      </span>
    </a>
  );
}
