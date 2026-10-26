'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Download, ExternalLink } from 'lucide-react';
import type { PressArticle, RiskLevel } from '@/lib/types';
import { SITE_URL } from '@/lib/site';
import { RISK } from '@/lib/risk';
import { addDays, countWord, formatDateRo, initialRows } from '@/lib/format';
import { PRESS_RECENT_DAYS } from '@/lib/stats';
import { downloadFile, isoToday, toCsv } from '@/lib/export';
import { trackAttrs } from '@/lib/analytics';
import { useToday } from '@/lib/useLiveBills';
import { RiskDot, btnSecondary } from '@/components/ui';
import { PanelTitle } from './PressPanels';

export type CoverageItem = PressArticle & { billId: string; slug: string; plainTitle: string; riskLevel: RiskLevel; checkedAt: string };

const SHOWN = 8;

function coverageCsv(items: CoverageItem[]) {
  return toCsv([
    ['Data publicării', 'Publicație', 'Titlul articolului', 'Link', 'Proiect', 'Pe înțeles', 'Nivel de risc', 'Analiza lastraja.ro', 'Verificat la'],
    ...items.map((a) => [
      a.publishedAt ?? '',
      a.outlet,
      a.title,
      a.url,
      a.billId,
      a.plainTitle,
      RISK[a.riskLevel].label,
      `${SITE_URL}/legi/${a.slug}`,
      a.checkedAt.slice(0, 10),
    ]),
  ]);
}

/** Toate articolele verificate, de la toate proiectele, în ordinea publicării. */
export default function PressCoverage({ items, builtOn }: { items: CoverageItem[]; builtOn: string }) {
  const [all, setAll] = useState(false);
  const today = useToday(builtOn);
  const since = addDays(today, 1 - PRESS_RECENT_DAYS);
  const recent = items.filter((a) => a.publishedAt && a.publishedAt >= since && a.publishedAt <= today).length;
  const outlets = new Set(items.map((a) => a.outlet)).size;
  const bills = new Set(items.map((a) => a.slug)).size;
  const first = initialRows(items.length, SHOWN);
  const list = all ? items : items.slice(0, first);

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PanelTitle
          title="Ce scrie presa despre proiecte"
          sub={`${countWord(items.length, 'articol', 'articole')} despre ${countWord(bills, 'proiect', 'proiecte')}, din ${countWord(outlets, 'publicație', 'publicații')}; ${recent} în ultima săptămână. Cele mai noi sunt primele.`}
        />
        <button
          type="button"
          onClick={() => downloadFile(`lastraja-presa-${isoToday()}.csv`, coverageCsv(items))}
          {...trackAttrs('csv_download', { scope: 'press' })}
          className={`${btnSecondary} min-h-11 shrink-0 px-4 text-sm`}
        >
          <Download className="h-4 w-4" aria-hidden />
          CSV articole
        </button>
      </div>
      <ol className="mt-4 divide-y divide-line border-y border-line">
        {list.map((a) => (
          <li key={`${a.slug}|${a.url}`} className="grid gap-x-8 gap-y-2 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
            <a
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              {...trackAttrs('news_open', { bill_id: a.billId, domain: a.domain, source: 'presa' })}
              className="group/article min-w-0"
            >
              <span className="block font-semibold leading-snug text-ink group-hover/article:underline group-hover/article:underline-offset-4">
                {a.title}
                <ExternalLink className="ml-1.5 inline h-3.5 w-3.5 -translate-y-px text-muted" aria-hidden />
              </span>
              <span className="mt-1 block text-sm text-muted">
                {a.outlet} · {a.publishedAt ? formatDateRo(a.publishedAt) : 'dată neprecizată'}
              </span>
              <span className="sr-only">(se deschide într-o filă nouă)</span>
            </a>
            <Link
              href={`/legi/${a.slug}#presa`}
              {...trackAttrs('bill_open', { bill_id: a.billId, source: 'presa_coverage' })}
              className="group/bill flex min-w-0 items-start gap-2 text-sm text-body"
            >
              <RiskDot level={a.riskLevel} className="mt-[7px] h-2 w-2 shrink-0" />
              <span className="min-w-0">
                <span className="block font-semibold tabular-nums text-ink">
                  {a.billId}
                  <span className="sr-only">, {RISK[a.riskLevel].label}</span>
                </span>
                <span className="line-clamp-2 group-hover/bill:underline group-hover/bill:underline-offset-4">{a.plainTitle}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
      {items.length > first && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          {...(all ? {} : trackAttrs('news_more', { bill_id: 'all' }))}
          className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-link"
        >
          {all ? 'Arată mai puține' : `Vezi toate cele ${countWord(items.length, 'articol', 'articole')}`}
          <ChevronDown className={`h-4 w-4 transition-transform ${all ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      )}
      <p className="mt-3 text-xs leading-5 text-muted">
        Doar articole găsite de Gemini, Claude și ChatGPT și verificate pe site-ul publicațiilor pe care le urmărim; lista nu e toată acoperirea media. Numărul
        articolelor nu influențează scorul de risc.
      </p>
    </>
  );
}
