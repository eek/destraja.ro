'use client';

import { useState } from 'react';
import { applyThemePref } from '@/lib/theme';
import { clearConsent } from '@/lib/analytics';

export default function ClearPreferences() {
  const [done, setDone] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => {
          applyThemePref('system');
          clearConsent();
          setDone(true);
        }}
        className="inline-flex min-h-11 items-center rounded-lg border border-line-strong bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:bg-sunken"
      >
        Șterge preferințele salvate
      </button>
      <p role="status" className="text-sm text-muted">
        {done ? 'Gata: tema urmează din nou sistemul, statisticile sunt oprite, iar întrebarea despre ele va reapărea.' : ''}
      </p>
    </div>
  );
}
