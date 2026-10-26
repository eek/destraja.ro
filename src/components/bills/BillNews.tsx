'use client';

import { ChevronDown, ExternalLink, Newspaper } from 'lucide-react';
import type { BillNews as News, PressArticle, PressSummary } from '@/lib/types';
import { addDays, countWord, formatDateRo } from '@/lib/format';
import { PRESS_RECENT_DAYS, recentPress } from '@/lib/stats';
import { trackAttrs } from '@/lib/analytics';
import { useToday } from '@/lib/useLiveBills';
import { panel } from '@/components/ui';

const SHOWN = 3;

function ArticleLink({ billId, a, recent }: { billId: string; a: PressArticle; recent: boolean }) {
  return (
    <a
      href={a.url}
      target="_blank"
      rel="noopener noreferrer"
      {...trackAttrs('news_open', { bill_id: billId, domain: a.domain })}
      className="group/article flex items-start justify-between gap-4 p-5 transition-colors hover:bg-sunken/60 sm:p-6"
    >
      <span className="min-w-0">
        <span className="block font-semibold leading-snug text-ink group-hover/article:underline group-hover/article:underline-offset-4">{a.title}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          <span>
            {a.outlet} · {a.publishedAt ? formatDateRo(a.publishedAt) : 'dată neprecizată'}
          </span>
          {recent && <span className="rounded-md bg-brand-soft px-1.5 py-px text-xs font-semibold text-ink">Recent</span>}
        </span>
      </span>
      <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-muted" aria-hidden />
      <span className="sr-only">(se deschide într-o filă nouă)</span>
    </a>
  );
}

/** Linia din antetul proiectului: câte articole sunt și câte au apărut în ultima săptămână. */
export function PressLink({ press, builtOn }: { press: PressSummary; builtOn: string }) {
  const today = useToday(builtOn);
  const recent = recentPress(press.dates, today);
  if (press.count === 0) {
    return (
      <a href="#presa" className="inline-flex items-center gap-1.5 text-muted hover:text-ink">
        <Newspaper className="h-4 w-4" aria-hidden />
        Presă: niciun articol găsit încă
      </a>
    );
  }
  return (
    <a href="#presa" className="inline-flex items-center gap-1.5 font-semibold text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
      <Newspaper className="h-4 w-4" aria-hidden />
      În presă: {countWord(press.count, 'articol', 'articole')}
      <span className="font-normal text-muted">
        {recent > 0
          ? `· ${recent} în ultima săptămână`
          : press.latest?.publishedAt && `· cel mai recent din ${formatDateRo(press.latest.publishedAt)}`}
      </span>
    </a>
  );
}

export default function BillNews({ billId, news, builtOn }: { billId: string; news: News; builtOn: string }) {
  const today = useToday(builtOn);
  const since = addDays(today, 1 - PRESS_RECENT_DAYS);
  const isRecent = (a: PressArticle) => !!a.publishedAt && a.publishedAt >= since && a.publishedAt <= today;
  const recent = news.articles.filter(isRecent).length;
  const rest = news.articles.slice(SHOWN);
  const row = (a: PressArticle) => (
    <li key={a.url}>
      <ArticleLink billId={billId} a={a} recent={isRecent(a)} />
    </li>
  );

  return (
    <section id="presa" aria-labelledby="presa-title" className="scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <h2 id="presa-title" className="font-display text-2xl font-normal sm:text-3xl">
          În presă
          {news.articles.length > 0 && <span className="ml-2.5 text-muted tabular-nums">{news.articles.length}</span>}
        </h2>
        <p className="text-xs text-muted">Verificat la {formatDateRo(news.checkedAt)}</p>
      </div>
      {news.articles.length === 0 ? (
        <p className={`${panel} mt-4 flex items-start gap-3 p-5 text-[15px] leading-7 text-body sm:p-6`}>
          <Newspaper className="mt-1.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
          Nu am găsit încă articole despre acest proiect în publicațiile pe care le urmărim. Căutăm din nou în fiecare zi lucrătoare.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-body">
            {recent > 0
              ? `${countWord(recent, 'articol publicat', 'articole publicate')} în ultima săptămână. Cele mai noi sunt primele.`
              : 'Niciun articol nou în ultima săptămână. Cele mai noi sunt primele.'}
          </p>
          <div className={`${panel} mt-4 overflow-hidden`}>
            <ul className="divide-y divide-line">{news.articles.slice(0, SHOWN).map(row)}</ul>
            {rest.length > 0 && (
              <details className="group/more border-t border-line">
                <summary
                  {...trackAttrs('news_more', { bill_id: billId })}
                  className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-5 text-sm font-semibold text-link transition-colors hover:bg-sunken/60 sm:px-6"
                >
                  <span className="group-open/more:hidden">Vezi toate cele {countWord(news.articles.length, 'articol', 'articole')}</span>
                  <span className="hidden group-open/more:inline">Arată mai puține</span>
                  <ChevronDown className="chevron h-4 w-4 shrink-0" aria-hidden />
                </summary>
                <ul className="divide-y divide-line border-t border-line">{rest.map(row)}</ul>
              </details>
            )}
          </div>
          <p className="mt-3 text-xs leading-5 text-muted">
            Articole găsite de Gemini, Claude și ChatGPT și verificate pe site-ul publicației. Nu le-am scris noi, iar numărul lor nu influențează scorul de
            risc.
          </p>
        </>
      )}
    </section>
  );
}
