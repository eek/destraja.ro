'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { CONSENT_EVENT, readConsent, saveConsent, type Consent } from '@/lib/analytics';

const OPTIONS: { value: Consent; label: string }[] = [
  { value: 'granted', label: 'Accept statisticile' },
  { value: 'denied', label: 'Refuz statisticile' },
];

const STATE: Record<Consent | 'none', string> = {
  granted: 'Statisticile sunt pornite.',
  denied: 'Statisticile sunt oprite.',
  none: 'Nu ai ales încă. Până alegi, statisticile sunt oprite.',
};

export default function ConsentControls() {
  const [consent, setConsent] = useState<Consent | null | undefined>(undefined);
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    const sync = () => setConsent(readConsent());
    sync();
    window.addEventListener(CONSENT_EVENT, sync);
    return () => window.removeEventListener(CONSENT_EVENT, sync);
  }, []);

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <p className="text-[15px] font-semibold text-ink">{consent === undefined ? '\u00a0' : STATE[consent ?? 'none']}</p>
      <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
        {OPTIONS.map((o) => {
          const on = consent === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => {
                saveConsent(o.value);
                setChanged(true);
              }}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-5 text-sm font-semibold transition-colors ${
                on ? 'border-brand bg-brand text-on-brand' : 'border-line-strong bg-surface text-ink hover:bg-sunken'
              }`}
            >
              {on && <Check className="h-4 w-4" aria-hidden />}
              {o.label}
            </button>
          );
        })}
      </div>
      <p role="status" className="mt-3 min-h-5 text-sm text-muted">
        {changed && consent === 'granted' && 'Gata: statisticile pornesc de la această pagină.'}
        {changed && consent === 'denied' && 'Gata: statisticile sunt oprite, iar cookie-urile Google Analytics au fost șterse din browserul tău.'}
      </p>
    </div>
  );
}
