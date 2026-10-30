'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { ArrowDown, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { CdepListItem } from '@/lib/cdep';
import { RISK } from '@/lib/risk';
import { dayDiff, stageLabel } from '@/lib/cdep-text';
import { countWord, fmt } from '@/lib/format';
import { trackAttrs } from '@/lib/analytics';
import { BillLink, Glyph, ScoreMeter, longDate, pressable } from './CameraOverview';

export type ShowcaseTab = 'risc' | 'agravate' | 'imblanzite' | 'termen';
export interface ShowcaseEntry {
  key: ShowcaseTab;
  label: string;
  total: number;
  items: CdepListItem[];
  lead: string;
}

/** „Mai riscant după Senat”, cu săgeată: direcția se citește și fără culoare. */
export function TextChange({ p }: { p: CdepListItem }) {
  if (!p.textChange) return null;
  const worse = p.textChange.direction === 'mai_riscant';
  const Icon = worse ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${worse ? 'text-risk-red-text' : 'text-risk-green-text'}`}>
      <Icon className="h-4 w-4" aria-hidden />
      {worse ? 'Mai riscant' : 'Mai puțin riscant'} după {p.textChange.after === 'senat' ? 'Senat' : 'Cameră'}
    </span>
  );
}

function Deadline({ iso, today }: { iso: string; today: string }) {
  const d = dayDiff(iso, today);
  if (d < 0) return null;
  return (
    <span className={`font-semibold ${d <= 1 ? 'text-risk-red-text' : 'text-ink'}`}>
      Amendamente: {d === 0 ? 'ultima zi azi' : d === 1 ? 'ultima zi mâine' : `încă ${countWord(d, 'zi', 'zile')}, până pe ${longDate(iso)}`}
    </span>
  );
}

function Meta({ p, tab, today }: { p: CdepListItem; tab: ShowcaseTab; today: string }) {
  return (
    <p className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-sm text-muted">
      <TextChange p={p} />
      {tab === 'termen' && p.termenAmendamente && <Deadline iso={p.termenAmendamente} today={today} />}
      <span className="tabular-nums">{p.numar}</span>
      <span>{stageLabel(p.stage)}</span>
    </p>
  );
}

/** Vitrina: patru liste scurte, cu un proiect mare în față și trimitere la lista întreagă. */
export function Showcase({
  tabs,
  today,
  withPage,
  onSeeAll,
}: {
  tabs: ShowcaseEntry[];
  today: string;
  withPage: Set<string>;
  onSeeAll: (t: ShowcaseTab) => void;
}) {
  const [active, setActive] = useState<ShowcaseTab>('risc');
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const at = Math.max(0, tabs.findIndex((t) => t.key === active));
  const tab = tabs[at];
  if (!tab) return null;

  const onKey = (e: KeyboardEvent, i: number) => {
    const next = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const j = (next + tabs.length) % tabs.length;
    setActive(tabs[j].key);
    refs.current[j]?.focus();
  };
  const [lead, ...rest] = tab.items;

  return (
    <div>
      <div role="tablist" aria-label="De văzut întâi" className="mb-7 grid grid-cols-2 gap-2 md:flex md:flex-wrap md:gap-2.5">
        {tabs.map((t, i) => {
          const on = t.key === tab.key;
          return (
            <button
              key={t.key}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`vitrina-${t.key}`}
              aria-selected={on}
              aria-controls="vitrina-panou"
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(t.key)}
              onKeyDown={(e) => onKey(e, i)}
              {...trackAttrs('camera_filter', { filter: 'showcase', value: t.key })}
              className={`flex min-h-[60px] flex-col justify-center gap-0.5 rounded-xl border px-3.5 py-2 text-left text-[15px] font-semibold leading-tight md:min-h-12 md:flex-row md:items-center md:gap-2 md:px-[18px] ${
                on ? 'border-ink bg-ink text-paper' : `border-line-strong bg-surface text-ink ${pressable}`
              }`}
            >
              {t.label}
              <span className={`text-[13.5px] font-medium tabular-nums ${on ? 'text-paper/80' : 'text-muted'}`}>{countWord(t.total, 'proiect', 'proiecte')}</span>
            </button>
          );
        })}
      </div>

      <div id="vitrina-panou" role="tabpanel" aria-labelledby={`vitrina-${tab.key}`}>
        <p className="mb-7 max-w-[62ch] text-base leading-relaxed text-body">{tab.lead}</p>
        <div className="grid gap-2 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
          <article className="border-b border-line pb-7 lg:border-0 lg:pb-0">
            {lead.risk && (
              <>
                <p className="flex items-baseline gap-3">
                  <span className="font-display text-[clamp(3.4rem,8vw,4.8rem)] font-semibold leading-[0.9] tracking-[-0.03em] text-ink">{fmt(lead.risk.score)}</span>
                  <span className="text-[15px] text-muted">
                    din 10 ·{' '}
                    <span className={`inline-flex items-center gap-1.5 font-semibold ${RISK[lead.risk.level].text}`}>
                      <Glyph level={lead.risk.level} />
                      {RISK[lead.risk.level].label.toLowerCase()}
                    </span>
                  </span>
                </p>
                <ScoreMeter level={lead.risk.level} score={lead.risk.score} />
              </>
            )}
            <h3 className="mt-4 font-display text-[clamp(1.6rem,3vw,2.15rem)] font-semibold leading-[1.16] tracking-[-0.015em]">
              <BillLink p={lead} withPage={withPage} className="text-ink no-underline decoration-2 underline-offset-4 hover:underline">
                {lead.risk?.plainTitle ?? lead.titlu}
              </BillLink>
            </h3>
            <Meta p={lead} tab={tab.key} today={today} />
          </article>
          <div>
            <ol className="border-t border-line lg:border-0">
              {rest.map((p) => (
                <li key={p.slug} className="grid grid-cols-[74px_minmax(0,1fr)] gap-4 border-b border-line py-5 lg:first:pt-0">
                  <div>
                    {p.risk && (
                      <>
                        <p className="font-display text-[1.75rem] font-semibold leading-none tabular-nums text-ink">{fmt(p.risk.score)}</p>
                        <p className={`mt-2 flex items-center gap-1.5 text-[13px] font-semibold ${RISK[p.risk.level].text}`}>
                          <Glyph level={p.risk.level} />
                          {RISK[p.risk.level].short}
                        </p>
                      </>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-display text-[1.2rem] font-semibold leading-[1.3]">
                      <BillLink p={p} withPage={withPage} className="text-ink no-underline decoration-2 underline-offset-4 hover:underline">
                        {p.risk?.plainTitle ?? p.titlu}
                      </BillLink>
                    </h3>
                    <Meta p={p} tab={tab.key} today={today} />
                  </div>
                </li>
              ))}
            </ol>
            {tab.total > tab.items.length && (
              <button
                type="button"
                onClick={() => onSeeAll(tab.key)}
                className={`mt-6 inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-4 text-[15px] font-semibold text-ink ${pressable}`}
              >
                Vezi toate cele {countWord(tab.total, 'proiect', 'proiecte')} în listă
                <ArrowDown className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
