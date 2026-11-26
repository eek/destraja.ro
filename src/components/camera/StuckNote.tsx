import Link from 'next/link';
import { ArrowRight, ExternalLink, Hourglass } from 'lucide-react';
import type { Stillness, WaitKey } from '@/lib/uitate';
import { formatDateRo } from '@/lib/format';

// Un proiect care stă pe loc: fișa e la zi, Parlamentul nu l-a mișcat. Prunul paginii /uitate (--viz-nemiscat), nu roșul:
// roșul înseamnă risc. Calculul e în src/lib/uitate.ts (stillness), același ca pe /uitate.

const WHERE: Record<WaitKey, string> = {
  avize: 'Blocat la avize',
  comisii: 'Blocat la comisii',
  suplimentar: 'Blocat la comisii',
  raport: 'Blocat înaintea plenului',
  plen: 'Blocat pe ordinea de zi',
  reexaminare: 'Blocat în reexaminare',
};

// Datele nu se rup pe două rânduri („24 / februarie 2025”).
const Day = ({ iso }: { iso: string }) => <span className="whitespace-nowrap">{formatDateRo(iso)}</span>;
const checked = (s: Stillness, word = 'verificat') => (
  <>
    {s.checkedLongAgo ? `${word} ultima dată` : word} pe <Day iso={s.checkedOn} />
  </>
);

/**
 * Rândul scurt din capul paginii, vizibil fără derulare: „Blocat la comisii: niciun pas din 24 februarie 2025 · verificat
 * pe 6 noiembrie 2026”. Duce la cardul cu stadiul (`href`), unde stă varianta lungă.
 */
export function StuckLine({ still, href }: { still: Stillness; href: string }) {
  return (
    <p className="mt-3 flex gap-2 text-sm leading-6 text-body">
      <Hourglass className="mt-1 h-4 w-4 shrink-0 text-[var(--viz-nemiscat)]" aria-hidden />
      <a href={href} className="underline decoration-line-strong underline-offset-4 hover:decoration-current">
        <span className="font-semibold text-[var(--viz-nemiscat)]">{WHERE[still.wait]}:</span> niciun pas din <Day iso={still.last.date} />
        <span className="text-muted"> · {checked(still)}</span>
      </a>
    </p>
  );
}

/**
 * Banda din cardul „Unde e acum”: de când n-a mai avut un pas procedural, ce a mai apărut în fișă fără să-l miște,
 * termenul trecut (`overdue`, din resolveStatus), când am verificat fișa pe cdep.ro și legătura spre /uitate.
 */
export function StuckBand({ still, overdue }: { still: Stillness; overdue?: string | null }) {
  const quiet = still.quiet;
  return (
    <div className="mt-5 rounded-xl bg-[color-mix(in_srgb,var(--viz-nemiscat)_7%,var(--surface))] px-4 py-4 sm:px-5">
      <p className="flex gap-2.5 text-[15px] font-semibold leading-6 text-ink">
        <Hourglass className="mt-1 h-4 w-4 shrink-0 text-[var(--viz-nemiscat)]" aria-hidden />
        <span>
          Niciun pas procedural din <Day iso={still.last.date} />: <span className="whitespace-nowrap text-[var(--viz-nemiscat)]">de {still.span}</span>
        </span>
      </p>
      <div className="mt-1.5 grid gap-1.5 pl-[26px] text-sm leading-6 text-body">
        <p className="max-w-[68ch]">
          {quiet ? (
            <>
              De atunci, în fișă apar doar {quiet.kinds.length ? quiet.kinds.join(', ') : 'rânduri'}, care nu mută proiectul; ultimul pe{' '}
              <Day iso={quiet.lastDate} />.
            </>
          ) : (
            'De atunci, fișa nu arată niciun rând nou.'
          )}
        </p>
        {overdue && <p className="max-w-[68ch]">{overdue}</p>}
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
          <a href={still.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline decoration-line-strong underline-offset-4 hover:decoration-current sm:min-h-0">
            <span>
              Fișa de pe cdep.ro {checked(still, 'verificată')}
              <ExternalLink className="ml-1 inline h-3.5 w-3.5 align-[-2px] text-muted" aria-hidden />
              <span className="sr-only">(se deschide într-o filă nouă)</span>
            </span>
          </a>
          <Link href="/uitate" className="inline-flex min-h-11 items-center gap-1 font-semibold text-link underline underline-offset-4 sm:min-h-0">
            Vezi toate proiectele uitate
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </p>
      </div>
    </div>
  );
}
