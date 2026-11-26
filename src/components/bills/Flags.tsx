'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, ExternalLink, Flame, Layers } from 'lucide-react';
import type { BillLite } from '@/lib/types';
import { formatDateRo } from '@/lib/format';
import { camps } from '@/lib/stats';
import { trackAttrs } from '@/lib/analytics';
import { useAnchoredPopover } from '@/components/useAnchoredPopover';
import { PopoverSheet } from '@/components/PopoverSheet';

/** Eticheta e un buton; explicația se deschide lângă ea (pe telefon, ca o foaie jos) și se închide cu Esc sau click în afară. */
function FlagInfo({ chip, chipCls, icon: Icon, billId, flag, title, children }: {
  chip: string;
  chipCls: string;
  icon: typeof Flame;
  billId: string;
  flag: string;
  title: string;
  children: ReactNode;
}) {
  const { id, btn, pop } = useAnchoredPopover();

  return (
    <li>
      <button
        ref={btn}
        type="button"
        popoverTarget={id}
        aria-haspopup="dialog"
        {...trackAttrs('flag_open', { bill_id: billId, flag })}
        className={`inline-flex min-h-7 cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold transition-colors ${chipCls}`}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {chip}
      </button>
      <PopoverSheet id={id} pop={pop} title={title} icon={<Icon className="h-4 w-4 shrink-0" aria-hidden />}>
        <div className="space-y-3">{children}</div>
      </PopoverSheet>
    </li>
  );
}

const linkCls = 'inline-flex items-center gap-1 font-semibold text-link underline-offset-4 hover:underline';

export function Flags({ bill, linkToBill = false }: { bill: BillLite; linkToBill?: boolean }) {
  const ces = bill.ces;
  const bridge = camps(bill.parties).bridge;
  if (!bill.emergencyRequested && !bill.cesNegative && !bridge) return null;
  const more = linkToBill && (
    <Link href={`/legi/${bill.slug}`} {...trackAttrs('bill_open', { bill_id: bill.id, source: 'flag' })} className={linkCls}>
      Vezi proiectul
      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </Link>
  );

  return (
    <ul className="flex flex-wrap gap-1.5">
      {bill.emergencyRequested && (
        <FlagInfo
          chip={bill.emergencyApproved ? 'Urgență aprobată' : 'Urgență cerută'}
          chipCls="bg-brand text-on-brand hover:bg-brand-hover"
          icon={Flame}
          billId={bill.id}
          flag="urgency"
          title={bill.emergencyApproved ? 'Dezbatere în procedură de urgență' : 'Inițiatorii cer procedură de urgență'}
        >
          <p>
            {bill.emergencyApproved
              ? 'Senatul a aprobat ca proiectul să fie dezbătut în procedură de urgență (art. 76 alin. 3 din Constituție). Termenele de avizare și de dezbatere sunt mai scurte, așa că proiectul poate ajunge la vot mai repede.'
              : 'Inițiatorii au cerut ca Senatul să dezbată proiectul în procedură de urgență (art. 76 alin. 3 din Constituție). Dacă plenul aprobă, termenele de avizare și de dezbatere se scurtează, iar proiectul poate ajunge la vot mai repede.'}
          </p>
          <p>
            Senatul poate închide și consultarea mai devreme: în toamna lui 2026, cel puțin șapte proiecte cu urgență cerută au primit
            număr de lege și au ieșit din consultare cu 9–23 de zile înainte de termenul anunțat.
          </p>
          <p className="font-semibold text-ink">Pentru tine: mai puțin timp să reacționezi. Nu amâna părerea cât consultarea e deschisă.</p>
          {more}
        </FlagInfo>
      )}

      {bill.cesNegative && (
        <FlagInfo
          chip="Aviz negativ CES"
          chipCls="border border-line-strong bg-surface text-ink hover:bg-sunken"
          icon={AlertTriangle}
          billId={bill.id}
          flag="ces"
          title="Aviz negativ de la CES"
        >
          {ces?.number && (
            <p className="text-xs text-muted">
              Avizul nr. {ces.number}
              {ces.date && `, primit de Senat pe ${formatDateRo(ces.date)}`}
            </p>
          )}
          {ces?.reasons.length ? (
            <div>
              <p className="font-semibold text-ink">De ce</p>
              <ul className="mt-1.5 space-y-2.5">
                {ces.reasons.map((r) => (
                  <li key={r.quote}>
                    {r.text}
                    <q className="mt-1 block text-xs italic leading-5 text-muted max-sm:text-[13px]">{r.quote}</q>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p>{ces?.pdfUrl ? 'Motivarea e în avizul oficial.' : 'Senatul a trecut avizul în fișa proiectului, dar textul lui nu e încă publicat pe senat.ro.'}</p>
          )}
          <p className="text-xs leading-5 text-muted">
            Consiliul Economic și Social reunește patronatele, sindicatele și societatea civilă. Avizul e consultativ: nu oprește proiectul, dar arată că
            partenerii sociali au obiecții.
            {ces?.reasons.length ? ' Motive rezumate automat din textul avizului; fiecare are citatul pe care se sprijină.' : ''}
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {ces?.pdfUrl && (
              <a
                href={ces.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                {...trackAttrs('official_source_open', { bill_id: bill.id, source: 'ces_flag' })}
                className={linkCls}
              >
                Citește avizul (PDF)
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            )}
            {more}
          </div>
        </FlagInfo>
      )}

      {bridge && (
        <FlagInfo
          chip="Putere și opoziție împreună"
          chipCls="border border-line text-cross hover:bg-sunken"
          icon={Layers}
          billId={bill.id}
          flag="bridge"
          title="Semnat de putere și de opoziție"
        >
          <p>Printre inițiatori sunt parlamentari și de la putere, și din opoziție, după guvernul de acum: {bill.parties.join(', ')}.</p>
          {more}
        </FlagInfo>
      )}
    </ul>
  );
}
