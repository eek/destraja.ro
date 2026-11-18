import { CalendarClock, CircleAlert, Info } from 'lucide-react';
import type { BillStatus } from '@/lib/bill-status';
import { dayDiff } from '@/lib/cdep-text';
import { formatDateRo } from '@/lib/format';
import LiveDayCount from './LiveDayCount';
import { panel } from '@/components/ui';

const KIND = { procedural: 'termen de procedură', programat: 'programat, se poate schimba' } as const;

/**
 * „Unde e acum”: stadiul dovedit de fișa Camerei, ultimul pas cu data, ce urmează și termenele, fiecare cu felul lui.
 * Nu promite când va fi adoptat proiectul: pentru asta nu există, de regulă, o dată.
 */
export default function BillStatusCard({ status, readAt, builtOn }: { status: BillStatus; readAt: string; builtOn: string }) {
  return (
    <section aria-labelledby="unde-e-acum" className={`${panel} mt-6 p-6 sm:p-8`}>
      <p id="unde-e-acum" className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        Unde e acum
      </p>
      <h2 className="mt-2 text-xl font-semibold leading-7 text-ink">{status.title}</h2>
      {status.role && <p className="mt-1 text-sm text-muted">{status.role}</p>}
      {status.detail && <p className="mt-1.5 text-[15px] leading-7 text-body">{status.detail}</p>}
      <p className="mt-4 text-[15px] leading-7 text-body">
        <span className="font-semibold text-ink">Urmează: </span>
        {status.next}
      </p>
      {status.deadlines.length > 0 && (
        <ul className="mt-4 grid gap-2 border-t border-line pt-4">
          {status.deadlines.map((d) => (
            <li key={d.label} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[15px]">
              <CalendarClock className="h-4 w-4 shrink-0 translate-y-0.5 text-muted" aria-hidden />
              <span className="font-semibold text-ink">
                {d.label}: {formatDateRo(d.date)}
              </span>
              <span className="text-sm">
                <LiveDayCount date={d.date} days={dayDiff(d.date, builtOn)} />
              </span>
              <span className="text-sm text-muted">{KIND[d.kind]}</span>
            </li>
          ))}
        </ul>
      )}
      {status.overdue && (
        <p className="mt-4 flex gap-2 text-sm leading-6 text-body">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
          {status.overdue}
        </p>
      )}
      {status.note && (
        <p className="mt-4 flex gap-2 rounded-xl bg-sunken px-4 py-3 text-sm leading-6 text-body">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
          {status.note}
        </p>
      )}
      <p className="mt-5 text-xs text-muted">
        Din fișa Camerei Deputaților, citită pe {formatDateRo(readAt.slice(0, 10))}. Pașii care nu apar încă în fișă nu înseamnă că nu
        s-au întâmplat.
      </p>
    </section>
  );
}
