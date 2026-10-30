'use client';

import { memo, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowDown, Check, ChevronDown } from 'lucide-react';
import type { CdepListItem } from '@/lib/cdep';
import { RISK } from '@/lib/risk';
import { dayDiff, shortDate } from '@/lib/cdep-text';
import { countWord, fmt } from '@/lib/format';
import { trackAttrs } from '@/lib/analytics';
import { BillLink, Glyph, LEVELS, byLevel, longDate, monthLabel, pressable } from './CameraOverview';

const MONTHS_SHORT = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sep.', 'oct.', 'nov.', 'dec.'];
const weekday = (iso: string) => new Intl.DateTimeFormat('ro-RO', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
const SHOWN = 4;

/** Lunile de la prima la ultima înregistrare, cu golurile umplute: o lună fără proiecte e tot o coloană. */
function monthSeries(list: CdepListItem[]) {
  const by: Record<string, CdepListItem[]> = {};
  for (const p of list) (by[p.inregistrat.slice(0, 7)] ??= []).push(p);
  const keys = Object.keys(by).sort();
  if (!keys.length) return [];
  const out: { ym: string; items: CdepListItem[] }[] = [];
  let [y, m] = keys[0].split('-').map(Number);
  const [ly, lm] = keys.at(-1)!.split('-').map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    out.push({ ym, items: by[ym] ?? [] });
    if (++m > 12) [y, m] = [y + 1, 1];
  }
  return out;
}

/** Cronologia: înapoi, înregistrările pe luni (roșul la bază); înainte, termenele de amendamente pe zile. */
export const Timeline = memo(function Timeline({
  list,
  today,
  withPage,
  month,
  day,
  onMonth,
  onDay,
}: {
  list: CdepListItem[];
  today: string;
  withPage: Set<string>;
  month: string | null;
  day: string | null;
  onMonth: (m: string | null) => void;
  onDay: (d: string | null) => void;
}) {
  const [mode, setMode] = useState<'luni' | 'termene'>('luni');
  useEffect(() => {
    if (day) setMode('termene');
  }, [day]);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const months = monthSeries(list);
  const peak = months.reduce((a, b) => (b.items.length > a.items.length ? b : a), months[0]);
  const recess = months.filter((m) => /-0[78]$/.test(m.ym));
  const days = Object.entries(
    list
      .filter((p) => p.termenAmendamente && p.termenAmendamente >= today)
      .reduce<Record<string, CdepListItem[]>>((acc, p) => ((acc[p.termenAmendamente!] ??= []).push(p), acc), {}),
  ).sort(([a], [b]) => a.localeCompare(b));
  const openCount = days.reduce((s, [, ps]) => s + ps.length, 0);

  const tabs = [
    { key: 'luni' as const, label: 'Înregistrate pe luni', note: months.length ? `${MONTHS_SHORT[Number(months[0].ym.slice(5)) - 1]}–${MONTHS_SHORT[Number(months.at(-1)!.ym.slice(5)) - 1]} ${months.at(-1)!.ym.slice(0, 4)}` : '' },
    { key: 'termene' as const, label: 'Termene de amendamente', note: `${countWord(openCount, 'proiect', 'proiecte')} în ${countWord(days.length, 'zi', 'zile')}` },
  ];
  const onKey = (e: KeyboardEvent, i: number) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const j = (i + 1) % 2;
    setMode(tabs[j].key);
    refs.current[j]?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label="Cronologie" className="mb-7 grid grid-cols-2 gap-2 md:flex md:gap-2.5">
        {tabs.map((t, i) => {
          const on = mode === t.key;
          return (
            <button
              key={t.key}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`cronologie-${t.key}`}
              aria-selected={on}
              aria-controls={`cronologie-${t.key}-panou`}
              tabIndex={on ? 0 : -1}
              onClick={() => setMode(t.key)}
              onKeyDown={(e) => onKey(e, i)}
              className={`flex min-h-[60px] flex-col justify-center gap-0.5 rounded-xl border px-3.5 py-2 text-left text-[15px] font-semibold leading-tight md:min-h-12 md:flex-row md:items-center md:gap-2 md:px-[18px] ${
                on ? 'border-ink bg-ink text-paper' : `border-line-strong bg-surface text-ink ${pressable}`
              }`}
            >
              {t.label}
              <span className={`text-[13.5px] font-medium tabular-nums ${on ? 'text-paper/80' : 'text-muted'}`}>{t.note}</span>
            </button>
          );
        })}
      </div>

      {mode === 'luni' ? (
        <div id="cronologie-luni-panou" role="tabpanel" aria-labelledby="cronologie-luni">
          {peak && (
            <p className="mb-5 max-w-[62ch] text-base leading-relaxed text-body">
              Fiecare pătrățel e un proiect, pus în luna în care a fost înregistrat. Cele mai multe au venit în {monthLabel(peak.ym)}:{' '}
              <strong className="font-semibold text-ink">{peak.items.length}</strong>. Cele cu risc ridicat stau la bază, iar numărul lor e sub fiecare lună.
              Apasă pe o lună ca să-i vezi proiectele în listă.
            </p>
          )}
          <p aria-hidden className="mb-4 flex flex-wrap gap-x-[18px] gap-y-1.5 text-sm text-body">
            {LEVELS.map((l) => (
              <span key={l} className="inline-flex items-center gap-2">
                <span className={`h-[11px] w-[11px] rounded-[2px] ${RISK[l].fill}`} />
                {RISK[l].label.toLowerCase()}
              </span>
            ))}
          </p>
          <div role="group" aria-label="Filtrează după luna înregistrării" className="flex items-end">
            {months.map(({ ym, items }) => {
              const c = byLevel(items);
              const on = month === ym;
              return (
                <button
                  key={ym}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${monthLabel(ym)}: ${countWord(items.length, 'proiect', 'proiecte')}, ${c.red} cu risc ridicat, ${c.yellow} moderat, ${c.green} redus`}
                  onClick={() => onMonth(on ? null : ym)}
                  {...trackAttrs('camera_filter', { filter: 'month', value: ym })}
                  className={`group flex min-w-0 flex-1 flex-col items-center rounded-t-lg px-0.5 pt-2 transition-[opacity,background-color] hover:bg-sunken ${
                    on ? 'bg-brand-soft hover:bg-brand-soft' : month ? 'opacity-45' : ''
                  }`}
                >
                  <span className="text-sm font-semibold tabular-nums text-ink">{items.length}</span>
                  <span className="mt-1.5 flex w-[30px] flex-wrap-reverse gap-[2px] sm:w-[48px] lg:w-[82px]">
                    {LEVELS.flatMap((l) =>
                      Array.from({ length: c[l] }, (_, i) => <span key={`${l}${i}`} className={`size-[6px] rounded-[1.5px] sm:size-[8px] lg:size-[10px] ${RISK[l].fill}`} />),
                    )}
                  </span>
                  <span className={`mt-px w-full border-t border-line-strong pt-2 text-[13px] ${on ? 'font-bold text-ink' : 'text-body'}`}>
                    {MONTHS_SHORT[Number(ym.slice(5)) - 1]}
                  </span>
                  <span className={`mt-1 mb-2 inline-flex items-center gap-1 text-[12.5px] font-semibold tabular-nums ${c.red ? 'text-risk-red-text' : 'text-muted'}`}>
                    {c.red > 0 && <Glyph level="red" className="h-2.5 w-2.5" />}
                    {c.red}
                  </span>
                </button>
              );
            })}
          </div>
          {recess.length > 0 && (
            <p className="mt-3 text-sm text-muted">
              {recess.map((m) => monthLabel(m.ym)).join(' și ').replace(/^./, (c) => c.toUpperCase())}: Parlamentul e între sesiuni.
            </p>
          )}
          <details className="mt-5">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold text-link">
              <ChevronDown className="chevron h-4 w-4" aria-hidden />
              Vezi cifrele ca tabel
            </summary>
            <table className="mt-2 w-full max-w-[640px] border-collapse text-[15px] tabular-nums">
              <thead>
                <tr className="text-[13.5px] text-muted">
                  {['Luna', 'Total', 'Ridicat', 'Moderat', 'Redus'].map((h, i) => (
                    <th key={h} scope="col" className={`border-b border-line py-2 font-semibold ${i ? 'pr-2.5 text-right' : 'text-left'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {months.map(({ ym, items }) => {
                  const c = byLevel(items);
                  return (
                    <tr key={ym}>
                      <th scope="row" className="border-b border-line py-2 text-left font-medium text-ink">
                        {monthLabel(ym)[0].toUpperCase() + monthLabel(ym).slice(1)}
                      </th>
                      {[items.length, c.red, c.yellow, c.green].map((v, i) => (
                        <td key={i} className="border-b border-line py-2 pr-2.5 text-right">
                          {v}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </details>
        </div>
      ) : (
        <div id="cronologie-termene-panou" role="tabpanel" aria-labelledby="cronologie-termene">
          <p className="mb-5 max-w-[62ch] text-base leading-relaxed text-body">
            Până la aceste date, deputații pot depune amendamente în comisia care face raportul. Dacă un proiect te privește, acum e momentul să le
            scrii.
          </p>
          {days.length ? (
            <ol>
              {days.map(([d, ps], i) => {
                const left = dayDiff(d, today);
                const sorted = [...ps].sort((a, b) => (b.risk?.score ?? -1) - (a.risk?.score ?? -1));
                const reds = ps.filter((p) => p.risk?.level === 'red').length;
                const on = day === d;
                return (
                  <li key={d} className={`grid grid-cols-[88px_minmax(0,1fr)] gap-x-[18px] py-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-x-10 ${i ? 'border-t border-line' : 'pt-1'}`}>
                    <div>
                      <p className="font-display text-[1.9rem] font-semibold leading-none text-ink">{left === 0 ? 'Azi' : left === 1 ? 'Mâine' : shortDate(d)}</p>
                      <p className="mt-1.5 text-sm text-muted">
                        {weekday(d)}, {longDate(d)}
                      </p>
                      <span
                        className={`mt-2.5 inline-block rounded-full px-2.5 py-0.5 text-[13.5px] font-bold ${left <= 1 ? 'bg-risk-red-soft text-risk-red-text' : 'bg-sunken text-ink'}`}
                      >
                        {left === 0 ? 'Se închide azi' : left === 1 ? 'Se închide mâine' : `peste ${countWord(left, 'zi', 'zile')}`}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="mb-1.5 text-[15px] text-body">
                        <strong className="font-semibold text-ink">{countWord(ps.length, 'proiect', 'proiecte')}</strong>
                        {reds > 0 && `, dintre care ${reds} cu risc ridicat`}
                      </p>
                      <ul>
                        {sorted.slice(0, SHOWN).map((p) => (
                          <li key={p.slug} className="grid grid-cols-[54px_minmax(0,1fr)] gap-3 border-b border-line py-2.5 last:border-0">
                            <span className="flex items-center gap-1.5 pt-0.5 text-[15px] font-semibold tabular-nums text-ink">
                              {p.risk && (
                                <>
                                  <Glyph level={p.risk.level} />
                                  {fmt(p.risk.score)}
                                </>
                              )}
                            </span>
                            <span className="min-w-0">
                              <BillLink p={p} withPage={withPage} className="text-[15.5px] leading-snug text-ink no-underline hover:underline">
                                {p.risk?.plainTitle ?? p.titlu}
                              </BillLink>
                              <span className="mt-0.5 block text-[13px] text-muted">
                                {p.numar}
                                {p.risk && ` · ${RISK[p.risk.level].label.toLowerCase()}`}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => onDay(on ? null : d)}
                        {...trackAttrs('camera_filter', { filter: 'deadline_day', value: d })}
                        className={`mt-3 inline-flex min-h-10 items-center gap-2 rounded-[10px] border px-3.5 text-sm font-semibold ${pressable} ${
                          on ? 'border-ink bg-ink text-paper shadow-none' : 'border-line-strong bg-surface text-ink'
                        }`}
                      >
                        {on ? (
                          <>
                            <Check className="h-4 w-4" aria-hidden />
                            În listă
                          </>
                        ) : (
                          <>
                            {ps.length > SHOWN ? `Toate cele ${countWord(ps.length, 'proiect', 'proiecte')}, în listă` : 'Vezi-le în listă'}
                            <ArrowDown className="h-4 w-4" aria-hidden />
                          </>
                        )}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-base text-muted">Niciun termen de amendamente deschis acum.</p>
          )}
        </div>
      )}
    </div>
  );
});
