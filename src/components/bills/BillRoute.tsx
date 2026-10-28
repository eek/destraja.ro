import { ExternalLink } from 'lucide-react';
import type { EnrichedBill } from '@/lib/types';
import { formatDateRo, formatDeadline } from '@/lib/format';
import { trackAttrs } from '@/lib/analytics';
import { panel } from '@/components/ui';

type State = 'done' | 'now' | 'next';
export type RouteStep = { label: string; detail: string };

// „07-10-2026” (istoricul Senatului) → „2026-10-07”.
const isoFromSenat = (d?: string) => (d ? d.split('-').reverse().join('-') : null);

/**
 * Unde e proiectul pe drumul lui prin Parlament. Toate proiectele din consultarea Senatului au Senatul ca primă cameră,
 * deci Camera Deputaților decide la final. Etapa curentă vine din termenul consultării și din stadiul oficial al Senatului;
 * nu inventăm date viitoare.
 */
export default function BillRoute({ bill }: { bill: EnrichedBill }) {
  const open = bill.daysRemaining >= 0;
  const registered = isoFromSenat(bill.timeline.find((t) => /Înregistrat la Senat/i.test(t.action))?.date);
  const senateDone = /adoptat|respins|trimis la camer/i.test(bill.stage);
  const now = open ? 1 : senateDone ? 4 : 2;
  const decisional = bill.camera?.cameraDecizionala ?? 'Camera Deputaților';
  const fromDeputies = bill.camera?.tip === 'BP';

  const consultation = open
    ? `până pe ${formatDeadline(bill.consultationDeadline)}`
    : bill.leftListAt && bill.announcedDeadline
      ? `închisă pe ${formatDateRo(bill.leftListAt)}, înainte de termen`
      : `încheiată pe ${formatDeadline(bill.consultationDeadline)}`;
  const steps: RouteStep[] = [
    {
      label: 'Depus',
      detail: fromDeputies
        ? `de deputați, la Cameră pe ${formatDateRo(bill.camera!.inregistrat)}, apoi la Senat${registered ? ` pe ${formatDateRo(registered)}` : ''}`
        : registered
          ? `la Senat, pe ${formatDateRo(registered)}`
          : 'la Senat',
    },
    { label: 'Consultare publică', detail: consultation },
    { label: 'Comisiile Senatului', detail: 'avize și raport' },
    { label: 'Votul Senatului', detail: 'prima cameră' },
    { label: decisional, detail: bill.camera && !fromDeputies ? `${bill.camera.numar}: ${bill.camera.stadiu}` : 'decide la final' },
    { label: 'Promulgare', detail: 'și Monitorul Oficial' },
  ];

  return (
    <section aria-labelledby="traseu" className={`${panel} mt-6 p-6 sm:p-8`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="traseu" className="text-lg font-semibold text-ink">
          Unde este proiectul
        </h2>
        <p className="text-sm text-muted">Stadiul oficial la Senat: {bill.stage}</p>
      </div>
      <RouteSteps steps={steps} now={now} />
      <p className="mt-6 border-t border-line pt-4 text-sm leading-6 text-body">
        Senatul votează primul, iar {decisional} decide la final.
        {fromDeputies && ' Propunerea vine de la deputați, care au depus-o la Cameră și au trimis-o întâi la Senat.'}
        {bill.camera && (
          <>
            {' '}
            <a
              href={bill.camera.url}
              target="_blank"
              rel="noopener noreferrer"
              {...trackAttrs('official_source_open', { bill_id: bill.id, source: 'cdep_sheet' })}
              className="font-semibold text-link underline underline-offset-4"
            >
              Fișa de la Camera Deputaților ({bill.camera.numar})
              {/* Inline, nu flex: pe telefon linkul se rupe pe două rânduri, iar iconița rămâne lângă ultimul cuvânt. */}
              <ExternalLink className="ml-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
              <span className="sr-only">(se deschide într-o filă nouă)</span>
            </a>
          </>
        )}
      </p>
    </section>
  );
}

/** Pașii drumului: cei de dinainte de `now` sunt trecuți, `now` e etapa de acum, restul urmează. */
export function RouteSteps({ steps, now }: { steps: RouteStep[]; now: number }) {
  const state = (i: number): State => (i < now ? 'done' : i === now ? 'now' : 'next');
  return (
    <ol className={`mt-5 grid gap-0 md:gap-3 ${steps.length === 5 ? 'md:grid-cols-5' : 'md:grid-cols-6'}`}>
      {steps.map((s, i) => (
        <li key={s.label} className="relative flex gap-3 pb-5 last:pb-0 md:flex-col md:gap-2 md:pb-0">
          {/* Linia dintre pași: verticală pe telefon, orizontală pe ecran lat. */}
          {i < steps.length - 1 && (
            <span
              aria-hidden
              className={`absolute left-[7px] top-5 h-[calc(100%-1.25rem)] w-0.5 md:left-5 md:top-[7px] md:h-0.5 md:w-[calc(100%-0.5rem)] ${
                state(i) === 'done' ? 'bg-ink' : 'bg-line'
              }`}
            />
          )}
          <span
            aria-hidden
            className={`relative z-[1] mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${
              state(i) === 'done' ? 'border-ink bg-ink' : state(i) === 'now' ? 'border-brand bg-surface ring-4 ring-brand/20' : 'border-line-strong bg-surface'
            }`}
          />
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${state(i) === 'next' ? 'text-muted' : 'text-ink'}`}>
              {s.label}
              {state(i) === 'now' && <span className="ml-2 rounded-md bg-brand px-1.5 py-0.5 text-[11px] font-semibold text-on-brand">Acum</span>}
              <span className="sr-only">{state(i) === 'done' ? ' (trecut)' : state(i) === 'now' ? ' (etapa de acum)' : ' (urmează)'}</span>
            </p>
            <p className="mt-0.5 text-[13px] leading-5 text-muted">{s.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
