'use client';

import { useEffect, useRef, useState } from 'react';
import { FilterChip } from '@/components/bills/RiskFilter';
import { countWord } from '@/lib/format';

type Analysis = 'all' | 'yes' | 'no';
type Outcome = 'all' | 'dezbatere' | 'adoptat' | 'oprit';
type Counts = Record<Exclude<Analysis, 'all'> | Exclude<Outcome, 'all'>, number> & { all: number };

// Pe telefon, fiecare grup pe un singur rând care se derulează lateral (ca segmentele de pe site); de la 640px, rânduri.
const ROW = 'no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 [&>button]:shrink-0 [&>button]:whitespace-nowrap sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0';

const OUTCOMES: { key: Exclude<Outcome, 'all'>; label: string }[] = [
  { key: 'dezbatere', label: 'În dezbatere' },
  { key: 'adoptat', label: 'Adoptate' },
  { key: 'oprit', label: 'Respinse sau oprite' },
];

/**
 * Filtrele listei de proiecte semnate. Rândurile sunt deja în pagină (SignedBills, randat pe server); aici doar le
 * ascundem pe cele care nu se potrivesc, deschidem „Încă N” ca să se vadă toate potrivirile și ascundem anii goi.
 */
export default function SignedFilters({ counts }: { counts: Counts }) {
  const [analysis, setAnalysis] = useState<Analysis>('all');
  const [outcome, setOutcome] = useState<Outcome>('all');
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = root.current?.parentElement?.querySelector<HTMLElement>('[data-signed-list]');
    if (!list) return;
    const filtering = analysis !== 'all' || outcome !== 'all';
    let total = 0;
    for (const year of list.querySelectorAll<HTMLElement>('[data-year]')) {
      let n = 0;
      for (const li of year.querySelectorAll<HTMLElement>('li[data-a]')) {
        const ok = (analysis === 'all' || li.dataset.a === analysis) && (outcome === 'all' || li.dataset.o === outcome);
        li.hidden = !ok;
        if (ok) n++;
      }
      year.hidden = n === 0;
      // Cu un filtru, toate potrivirile anului la vedere; fără filtru, lista revine la primele rânduri.
      for (const more of year.querySelectorAll<HTMLDetailsElement>('details[data-more]')) {
        more.open = filtering && more.querySelector('li:not([hidden])') !== null;
        more.querySelector('summary')!.hidden = filtering;
        const ul = more.querySelector('ul');
        if (ul) ul.hidden = !more.querySelector('li:not([hidden])');
      }
      for (const ul of year.querySelectorAll<HTMLElement>(':scope > ul')) ul.hidden = !ul.querySelector('li:not([hidden])');
      const label = year.querySelector<HTMLElement>('[data-count]');
      if (label) label.textContent = countWord(n, 'proiect', 'proiecte');
      total += n;
    }
    const empty = list.querySelector<HTMLElement>('[data-empty]');
    if (empty) empty.hidden = total > 0;
  }, [analysis, outcome]);

  return (
    <div ref={root} className="mt-5 flex flex-col gap-2.5">
      <div role="group" aria-label="Filtrează după analiză" className={ROW}>
        <FilterChip on={analysis === 'all'} onClick={() => setAnalysis('all')} count={counts.all}>
          Toate
        </FilterChip>
        <FilterChip on={analysis === 'yes'} onClick={() => setAnalysis(analysis === 'yes' ? 'all' : 'yes')} count={counts.yes}>
          Cu analiză
        </FilterChip>
        <FilterChip on={analysis === 'no'} onClick={() => setAnalysis(analysis === 'no' ? 'all' : 'no')} count={counts.no}>
          Fără analiză
        </FilterChip>
      </div>
      <div role="group" aria-label="Filtrează după stadiu" className={ROW}>
        {OUTCOMES.filter((o) => counts[o.key] > 0).map((o) => (
          <FilterChip key={o.key} on={outcome === o.key} onClick={() => setOutcome(outcome === o.key ? 'all' : o.key)} count={counts[o.key]}>
            {o.label}
          </FilterChip>
        ))}
      </div>
    </div>
  );
}
