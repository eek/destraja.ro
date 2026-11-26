import type { ReactNode } from 'react';
import { CircleCheck, RefreshCw } from 'lucide-react';
import { formatDateRo } from '@/lib/format';
import { isStale, type Staleness } from '@/lib/fresh';

// Rândurile de stare din antetul unui proiect (/legi/[slug] și /camera/[slug]), sub insigna de risc, deasupra
// titlului: se văd pe un telefon de 390 px fără derulare. Fiecare rând e un copil: prospețimea analizei
// (FreshnessStatus) și, alături, alte semnale despre proiect (de exemplu „niciun pas din …”, ramura limbo).
export function BillHeaderStatus({ children }: { children: ReactNode }) {
  return <div className="mt-3 flex flex-col gap-1.5 text-[13.5px] leading-5">{children}</div>;
}

type Analysis = { updatedAt: string; coverage?: { method?: string }; baseline?: { included?: boolean } };

/** Ce se reface acum, în ordinea paginii, cu ancora secțiunii. */
function staleParts(fresh: Staleness, has: { versions: boolean; balance: boolean }) {
  const parts: { label: string; href: string }[] = [];
  if (has.versions && isStale(fresh.versions)) parts.push({ label: 'comparația dintre forme', href: '#versiuni' });
  else if (has.versions && isStale(fresh.amendments)) parts.push({ label: 'legăturile amendamentelor cu schimbările', href: '#amendamente' });
  if (has.balance && isStale(fresh.balance)) parts.push({ label: 'ce e bine și ce strică', href: '#bine-rau' });
  return parts;
}

/**
 * Cât de proaspătă e analiza: la zi („Analizat pe …, cu tot textul și legea în vigoare”), cu părți din analiza anterioară
 * („Se actualizează: …”, cu legături la secțiuni) sau cu analiza principală însăși de refăcut.
 */
export function FreshnessStatus({ analysis, fresh, has }: { analysis: Analysis; fresh: Staleness; has: { versions: boolean; balance: boolean } }) {
  const day = formatDateRo(analysis.updatedAt);
  if (isStale(fresh.analysis)) {
    return (
      <p className="flex items-start gap-1.5 font-semibold text-ink">
        <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-risk-amber-text" aria-hidden />
        <span>
          Analiza din {day} se reface: legea modificată sau textul proiectului s-au schimbat de atunci.{' '}
          <a href="#modele" className="font-normal text-link underline underline-offset-4">
            Analiza de acum
          </a>
        </span>
      </p>
    );
  }
  const parts = staleParts(fresh, has);
  if (parts.length) {
    return (
      <p className="flex items-start gap-1.5 text-body">
        <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
        <span>
          <span className="font-semibold text-ink">Se actualizează:</span>{' '}
          {parts.map((p, i) => (
            <span key={p.href}>
              {i > 0 && ' și '}
              <a href={p.href} className="text-link underline underline-offset-4">
                {p.label}
              </a>
            </span>
          ))}{' '}
          <span className="text-muted">(din analiza anterioară)</span>
        </span>
      </p>
    );
  }
  const whole = analysis.coverage?.method === 'whole-text-v1';
  const law = analysis.baseline?.included === true;
  return (
    <p className="flex items-start gap-1.5 text-muted">
      <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-risk-green-text" aria-hidden />
      <span>
        Analizat pe {day}
        {whole ? (law ? ', cu tot textul și legea în vigoare' : ', cu tot textul') : ''}
      </span>
    </p>
  );
}
