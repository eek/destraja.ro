import Link from 'next/link';
import { CalendarDays, ExternalLink } from 'lucide-react';
import type { AgendaAppearance } from '@/lib/agenda';
import { trackAttrs } from '@/lib/analytics';
import { panel } from '@/components/ui';
import { MeetingWhen, OfficialAgendaLink, chamberOf, purpose } from '@/components/agenda/parts';

/**
 * Ședințele viitoare în care proiectul e pe ordinea de zi (comisii sau plen), din ordinile de zi citite la build.
 * Fără nicio programare nu apare deloc. Informație neutră: fără culorile riscului.
 */
export default function BillAgenda({ items, billId }: { items: AgendaAppearance[]; billId: string }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="agenda" className={`${panel} mt-6 p-6 sm:p-8`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="agenda" className="inline-flex items-center gap-2 text-lg font-semibold text-ink">
          <CalendarDays className="h-5 w-5 text-link" aria-hidden />
          Pe ordinea de zi
        </h2>
        <Link href="/agenda" className="text-sm font-semibold text-link underline underline-offset-4">
          Agenda săptămânii
        </Link>
      </div>
      <ul className="mt-4 divide-y divide-line border-t border-line">
        {items.map((a) => (
          <li key={`${a.chamber}-${a.comisieId}-${a.zi}`} className="grid gap-1 py-4 last:pb-0 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-6">
            <MeetingWhen a={a} />
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-6 text-ink">{a.comisie}</p>
              {(chamberOf(a) || purpose(a) || a.loc) && (
                <p className="mt-0.5 text-sm leading-6 text-muted">{[chamberOf(a), purpose(a), a.loc].filter(Boolean).join(' · ')}</p>
              )}
              {a.url && (
                <OfficialAgendaLink a={a} track={trackAttrs('official_source_open', { bill_id: billId, source: `${a.chamber}_agenda` })} className="mt-1">
                  <ExternalLink className="ml-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
                </OfficialAgendaLink>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 border-t border-line pt-4 text-sm leading-6 text-muted">
        Ordinea de zi se poate schimba până la ședință; ce e valabil scrie pe site-ul oficial.
      </p>
    </section>
  );
}
