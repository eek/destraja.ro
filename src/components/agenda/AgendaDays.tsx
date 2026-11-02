import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { type AgendaAppearance, dayLabel } from '@/lib/agenda';
import { trackAttrs } from '@/lib/analytics';
import { RiskChip, panel } from '@/components/ui';
import { MeetingWhen, OfficialAgendaLink, purpose } from './parts';

/** Ședințele cu proiecte de-ale noastre, pe zile; în fiecare zi, câte un panou pe ședință (comisie sau plen). */
export default function AgendaDays({ items }: { items: AgendaAppearance[] }) {
  const days = new Map<string, Map<string, AgendaAppearance[]>>();
  for (const a of items) {
    const meetings = days.get(a.zi) ?? new Map<string, AgendaAppearance[]>();
    const key = `${a.chamber}|${a.comisieId}`;
    meetings.set(key, [...(meetings.get(key) ?? []), a]);
    days.set(a.zi, meetings);
  }
  return (
    <div className="space-y-10">
      {[...days].map(([zi, meetings]) => (
        <section key={zi} aria-labelledby={`zi-${zi}`}>
          <h3 id={`zi-${zi}`} className="text-lg font-semibold text-ink first-letter:uppercase">
            {dayLabel(zi)}
          </h3>
          <div className="mt-3 space-y-4">
            {[...meetings.values()].map((m) => (
              <Meeting key={`${m[0].chamber}-${m[0].comisieId}`} items={m} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Meeting({ items }: { items: AgendaAppearance[] }) {
  const a = items[0];
  return (
    <div className={`${panel} p-5 sm:p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold leading-6 text-ink">{a.comisie}</p>
          <div className="flex flex-wrap gap-x-2 text-sm text-muted">
            <MeetingWhen a={a} withDay={false} />
            {a.loc && <span>· {a.loc}</span>}
          </div>
        </div>
        <OfficialAgendaLink a={a} track={trackAttrs('official_source_open', { source: `${a.chamber}_agenda`, page: 'agenda' })}>
          <ExternalLink className="ml-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
        </OfficialAgendaLink>
      </div>
      <ul className="mt-4 divide-y divide-line border-t border-line">
        {items.map((x) => (
          <li key={x.bill.href} className="py-4 last:pb-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {x.bill.risk && <RiskChip level={x.bill.risk.level} score={x.bill.risk.score} />}
              <span className="text-xs tabular-nums text-muted">
                {x.bill.id}
                {/\d/.test(x.punct.numar) && x.punct.numar !== x.bill.id && ` · ${x.punct.numar}`}
              </span>
            </div>
            <Link
              href={x.bill.href}
              {...trackAttrs('bill_open', { bill_id: x.bill.id, source: 'agenda' })}
              className="font-display mt-1.5 line-clamp-3 text-lg leading-snug text-ink decoration-line-strong decoration-1 underline-offset-4 hover:underline"
            >
              {x.bill.title}
            </Link>
            {purpose(x) && <p className="mt-1 text-sm leading-6 text-muted">{purpose(x)}</p>}
            {x.punct.rezolutie && <p className="mt-1 text-sm leading-6 text-body">Rezoluție: {x.punct.rezolutie}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
