import type { ReactNode } from 'react';
import { type AgendaAppearance, dayLabel } from '@/lib/agenda';

export const SOURCE = { senat: 'senat.ro', camera: 'cdep.ro' } as const;

const upper = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

/** „Raport, termen: 10.11.2026”: de ce e proiectul pe ordinea de zi, cum scrie pe pagina oficială. */
export function purpose(a: AgendaAppearance) {
  const why = a.punct.scop || a.punct.capitol;
  const due = a.punct.termen && (/^termen/i.test(a.punct.termen) ? a.punct.termen : `termen: ${a.punct.termen}`);
  return [why && upper(why), due].filter(Boolean).join(', ');
}

/** Ziua și ora ședinței, pe două rânduri. */
export function MeetingWhen({ a, withDay = true }: { a: AgendaAppearance; withDay?: boolean }) {
  return (
    <p className="text-sm leading-6 tabular-nums">
      {withDay && <span className="block font-semibold text-ink">{upper(dayLabel(a.zi))}</span>}
      <span className={withDay ? 'block text-muted' : 'font-semibold text-ink'}>
        {a.ora ? `ora ${a.ora}${a.oraFinal ? `–${a.oraFinal}` : ''}` : 'ora nu e anunțată'}
      </span>
    </p>
  );
}

export function OfficialAgendaLink({
  a,
  track,
  className = '',
  children,
}: {
  a: AgendaAppearance;
  track: Record<string, string>;
  className?: string;
  children?: ReactNode;
}) {
  if (!a.url) return null;
  return (
    <a
      href={a.url}
      target="_blank"
      rel="noopener noreferrer"
      {...track}
      className={`inline-block text-sm font-semibold text-link underline underline-offset-4 hover:decoration-2 ${className}`}
    >
      Ordinea de zi pe {SOURCE[a.chamber]}
      {children}
      <span className="sr-only"> (se deschide într-o filă nouă)</span>
    </a>
  );
}
