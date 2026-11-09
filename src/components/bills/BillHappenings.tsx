import Link from 'next/link';
import { ArrowDown, ExternalLink, History } from 'lucide-react';
import { panel } from '@/components/ui';
import { trackAttrs } from '@/lib/analytics';
import type { Happening, Person } from '@/lib/istoric';

const SHOWN = 4;

// „2026-11-02” → „2 noiembrie”; anul doar când nu e cel curent.
function day(iso: string, year: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long', ...(iso.slice(0, 4) !== year && { year: 'numeric' }), timeZone: 'Europe/Bucharest' }).format(d);
}

function People({ people }: { people: Person[] }) {
  return (
    <>
      {people.map((p, i) => (
        <span key={p.name}>
          {i > 0 && ', '}
          {p.href ? (
            <Link href={p.href} className="font-semibold text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
              {p.name}
            </Link>
          ) : (
            <strong className="font-semibold text-ink">{p.name}</strong>
          )}
          {p.party && <span className="text-muted"> ({p.party})</span>}
        </span>
      ))}
    </>
  );
}

function Row({ h, year, billId }: { h: Happening; year: string; billId: string }) {
  return (
    <li className="grid gap-1 py-3.5 first:pt-0 last:pb-0 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-5">
      <span className="text-xs tabular-nums leading-6 text-muted sm:text-sm">{day(h.date, year)}</span>
      <div className="min-w-0 text-[15px] leading-7 text-body">
        {h.kind === 'anunt' ? (
          <>
            <span className="mr-2 inline-flex rounded-md bg-risk-amber-soft px-2 py-0.5 align-[1px] text-xs font-semibold text-ink">Anunțat, încă neoficial</span>
            <strong className="font-semibold text-ink">{h.who}:</strong> {h.what}
            <span className="mt-0.5 block text-sm text-muted">
              Relatat de{' '}
              {h.sources.slice(0, 3).map((s, i) => (
                <span key={s.url}>
                  {i > 0 && ', '}
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    {...trackAttrs('press_open', { bill_id: billId, source: 'happenings' })}
                    className="underline underline-offset-4 hover:text-ink">
                    {s.outlet}
                    <ExternalLink className="ml-0.5 inline h-3 w-3 align-[-1px]" aria-hidden />
                    <span className="sr-only"> (se deschide pe site-ul publicației)</span>
                  </a>
                </span>
              ))}
              {h.sources.length > 3 && ` și încă ${h.sources.length - 3}`}
            </span>
          </>
        ) : h.kind === 'forma' ? (
          <a href={h.href} className="font-semibold text-link underline underline-offset-4">
            {h.text}
            <ArrowDown className="ml-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
          </a>
        ) : (
          <>
            {h.text}
            {h.people && h.people.length > 0 && (
              <>
                : <People people={h.people} />
              </>
            )}
            {h.doc && (
              <a
                href={h.doc.url}
                target="_blank"
                rel="noopener noreferrer"
                {...trackAttrs('official_source_open', { bill_id: billId, source: 'pdf', doc: h.doc.label })}
                className="ml-2 whitespace-nowrap text-sm text-muted underline underline-offset-4 hover:text-ink">
                documentul
                <ExternalLink className="ml-0.5 inline h-3 w-3 align-[-1px]" aria-hidden />
              </a>
            )}
          </>
        )}
      </div>
    </li>
  );
}

/**
 * „Ce s-a mai întâmplat”: pașii oficiali de după analiză și schimbările anunțate în presă, cele mai noi întâi.
 * `note` spune pe ce formă e analiza și dacă textul oficial s-a schimbat de atunci. Fără nimic de arătat, nu apare.
 */
export default function BillHappenings({ items, note, builtOn, billId }: { items: Happening[]; note: string; builtOn: string; billId: string }) {
  if (!items.length) return null;
  const year = builtOn.slice(0, 4);
  // Două articole din aceeași publicație: o singură mențiune, cu primul link.
  const rows = items.map((h) => (h.kind === 'anunt' ? { ...h, sources: [...new Map(h.sources.map((s) => [s.outlet, s])).values()] } : h));
  const first = rows.slice(0, SHOWN);
  const rest = rows.slice(SHOWN);
  const announced = rows.some((h) => h.kind === 'anunt');
  return (
    <section aria-labelledby="intamplat" className={`${panel} mt-6 p-6 sm:p-8`}>
      <h2 id="intamplat" className="inline-flex items-center gap-2 text-lg font-semibold text-ink">
        <History className="h-5 w-5 text-link" aria-hidden />
        Ce s-a mai întâmplat
      </h2>
      <p className="mt-1 text-sm leading-6 text-muted">{note}</p>
      <ol className="mt-4 divide-y divide-line border-t border-line pt-4">
        {first.map((h, i) => (
          <Row key={`${h.date}-${i}`} h={h} year={year} billId={billId} />
        ))}
      </ol>
      {rest.length > 0 && (
        <details className="group mt-3 border-t border-line pt-3">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-link underline underline-offset-4">
            Încă {rest.length} {rest.length === 1 ? 'pas' : 'pași'}, mai vechi
          </summary>
          <ol className="mt-2 divide-y divide-line">
            {rest.map((h, i) => (
              <Row key={`${h.date}-r${i}`} h={h} year={year} billId={billId} />
            ))}
          </ol>
        </details>
      )}
      {announced && (
        <p className="mt-4 border-t border-line pt-4 text-sm leading-6 text-muted">
          Anunțurile vin din articolele de presă verificate: cineva care decide asupra proiectului a spus public că textul se va
          schimba. Contează abia când schimbarea apare în documentele oficiale, iar analiza noastră rămâne pe textul oficial până
          atunci.
        </p>
      )}
    </section>
  );
}
