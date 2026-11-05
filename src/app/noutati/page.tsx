import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { CHANGELOG, type ChangeKind } from '@/lib/changelog';
import { formatDateRo } from '@/lib/format';
import { Container } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Ce e nou',
  description: 'Ce am adăugat, schimbat și corectat pe destrajă.ro, pe înțelesul tuturor, cel mai nou întâi.',
};

// Etichete neutre: roșul, galbenul și verdele înseamnă riscul unui proiect, nu felul schimbării.
const KIND: Record<ChangeKind, { label: string; cls: string }> = {
  nou: { label: 'Nou', cls: 'bg-brand text-on-brand' },
  schimbat: { label: 'Schimbat', cls: 'bg-brand-soft text-ink' },
  corectat: { label: 'Corectat', cls: 'border border-line-strong text-body' },
};

export default function ChangelogPage() {
  return (
    <Container className="py-12 sm:py-16">
      <div className="max-w-3xl">
        <h1 className="font-display text-[clamp(2.4rem,5vw,4rem)] font-normal leading-[1.05]">Ce e nou</h1>
        <p className="mt-5 text-lg leading-8 text-body">
          Ce am adăugat, schimbat sau corectat pe site, spus pe scurt. Cel mai nou întâi. Dacă vezi ceva greșit sau vrei să urmărim și altceva,
          scrie-ne la{' '}
          <a href="mailto:contact@destraja.ro" className="font-semibold text-link underline underline-offset-4 hover:decoration-2">
            contact@destraja.ro
          </a>
          .
        </p>
      </div>

      <ol className="mt-12 max-w-3xl">
        {CHANGELOG.map((day) => (
          <li key={day.date} className="grid gap-x-8 gap-y-3 border-t border-line py-8 sm:grid-cols-[9rem_minmax(0,1fr)]">
            <h2 className="pt-0.5 text-sm font-semibold tabular-nums text-muted">
              <time dateTime={day.date}>{formatDateRo(day.date)}</time>
            </h2>
            <ul className="space-y-7">
              {day.items.map((c) => (
                <li key={c.title}>
                  <h3 className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${KIND[c.kind].cls}`}>{KIND[c.kind].label}</span>
                    <span className="font-display text-[1.3rem] leading-snug text-ink">{c.title}</span>
                  </h3>
                  <p className="mt-2 max-w-[65ch] text-[15.5px] leading-7 text-body">{c.text}</p>
                  {c.link && (
                    <Link
                      href={c.link.href}
                      className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-link underline underline-offset-4 hover:decoration-2"
                    >
                      {c.link.label}
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </Container>
  );
}
