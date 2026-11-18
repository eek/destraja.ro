import { ChevronDown, ExternalLink } from 'lucide-react';
import type { JournalDay, JournalKind } from '@/lib/jurnal';
import { formatDateRo } from '@/lib/format';
import { SOURCE_URL } from '@/lib/site';
import { panel } from '@/components/ui';

const KIND: Record<JournalKind, string> = { site: 'pe site', date: 'date și analize', intern: 'în culise' };

/**
 * „Jurnalul complet”: toate schimbările, pe zile, câte un rând, cu legătura la schimbarea din cod. Zilele se deschid
 * la cerere; cea mai nouă e deschisă.
 */
export default function ChangeJournal({ days }: { days: JournalDay[] }) {
  if (!days.length) return null;
  const total = days.reduce((n, d) => n + d.items.length, 0);
  return (
    <section aria-labelledby="jurnal" className="mt-16 max-w-5xl scroll-mt-24" id="jurnal-complet">
      <h2 id="jurnal" className="font-display text-[2rem] font-normal leading-tight">
        Jurnalul complet
      </h2>
      <p className="mt-3 max-w-[68ch] text-[15.5px] leading-7 text-body">
        Toate cele {total} de schimbări de la lansare, nu doar cele de mai sus: câte un rând pentru fiecare, inclusiv ce se schimbă în culise, la
        felul în care adunăm datele și facem analizele. Rândurile sunt rezumate automat, cu Gemini, din istoricul codului
        {SOURCE_URL && (
          <>
            , care e public pe{' '}
            <a href={`${SOURCE_URL}/commits/main`} target="_blank" rel="noopener" className="font-semibold text-link underline underline-offset-4">
              GitHub
            </a>
          </>
        )}
        .
      </p>
      <div className={`${panel} mt-6 divide-y divide-line overflow-hidden`}>
        {days.map((d, k) => (
          <details key={d.date} open={k === 0} className="group/day">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand sm:px-5 [&::-webkit-details-marker]:hidden">
              <time dateTime={d.date} className="min-w-0 flex-1 text-[15px] font-semibold text-ink">
                {formatDateRo(d.date)}
              </time>
              <span className="text-sm tabular-nums text-muted">{d.items.length === 1 ? '1 schimbare' : `${d.items.length} schimbări`}</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform group-open/day:rotate-180" aria-hidden />
            </summary>
            <ul className="grid gap-3 px-4 pt-1 pb-5 sm:px-5">
              {d.items.map((i) => (
                <li key={i.hash} className="grid gap-x-4 gap-y-0.5 text-[15px] leading-6 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
                  <span className="text-xs font-semibold uppercase tracking-[0.06em] text-muted sm:pt-1">{KIND[i.kind]}</span>
                  <span className="text-body">
                    {i.text}
                    {SOURCE_URL && (
                      <a
                        href={`${SOURCE_URL}/commit/${i.hash}`}
                        target="_blank"
                        rel="noopener"
                        className="ml-1.5 inline-flex translate-y-0.5 text-muted hover:text-ink"
                        aria-label="Schimbarea în cod, pe GitHub"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      </a>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}
