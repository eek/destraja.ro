'use client';

import { useState } from 'react';
import { ChevronDown, ExternalLink, Newspaper } from 'lucide-react';
import type { BillNews as News, PressArticle, PressStance, PressSummary } from '@/lib/types';
import { addDays, countWord, formatDateRo, initialRows } from '@/lib/format';
import { PRESS_RECENT_DAYS, recentPress } from '@/lib/stats';
import { SOURCE, STANCE, STANCES, stanceCounts, stanceLine } from '@/lib/press';
import { trackAttrs } from '@/lib/analytics';
import { useToday } from '@/lib/useLiveBills';
import { panel, segCls } from '@/components/ui';

const SHOWN = 3;

// Ca la pozițiile organizațiilor: roșu, galben și verde înseamnă doar risc, așa că poziția se vede din etichetă.
const CHIP: Record<PressStance, string> = {
  critical: 'bg-brand text-on-brand',
  supportive: 'border border-line-strong bg-surface text-ink',
  neutral: 'bg-sunken text-body',
  mixed: 'bg-sunken text-body',
};

// Tipul sursei îl spunem doar unde nu e evident: publicațiile din afara listei și comunicatele de partid.
function sourceNote(a: PressArticle) {
  if (a.release) return 'comunicat de partid sau de politician';
  if (!a.listed && a.source) return SOURCE[a.source];
  return null;
}

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
          {a.stance && <span className={`rounded-md px-1.5 py-px text-xs font-semibold ${CHIP[a.stance]}`}>{STANCE[a.stance].label}</span>}
          <span>
            {a.outlet} · {a.publishedAt ? formatDateRo(a.publishedAt) : 'dată neprecizată'}
            {sourceNote(a) && ` · ${sourceNote(a)}`}
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
        {stanceLine(press.stances)
          ? `· ${stanceLine(press.stances)}`
          : recent > 0
            ? `· ${recent} în ultima săptămână`
            : press.latest?.publishedAt && `· cel mai recent din ${formatDateRo(press.latest.publishedAt)}`}
      </span>
    </a>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function BillNews({ billId, news, builtOn }: { billId: string; news: News; builtOn: string }) {
  const today = useToday(builtOn);
  const [filter, setFilter] = useState<PressStance | null>(null);
  const since = addDays(today, 1 - PRESS_RECENT_DAYS);
  const isRecent = (a: PressArticle) => !!a.publishedAt && a.publishedAt >= since && a.publishedAt <= today;
  const recent = news.articles.filter(isRecent).length;
  const counts = stanceCounts(news.articles);
  const classified = STANCES.some((s) => counts[s] > 0);
  // Cu un filtru ales le arătăm pe toate cele potrivite; fără, primele trei și restul la cerere.
  const shown = filter ? news.articles.filter((a) => a.stance === filter) : news.articles;
  const first = filter ? shown.length : initialRows(shown.length, SHOWN);
  const rest = shown.slice(first);
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
            {classified && stanceLine(counts) && `${capitalize(stanceLine(counts))}. `}
            {recent > 0
              ? `${countWord(recent, 'articol publicat', 'articole publicate')} în ultima săptămână. Cele mai noi sunt primele.`
              : 'Niciun articol nou în ultima săptămână. Cele mai noi sunt primele.'}
          </p>
          {classified && (
            <div role="group" aria-label="Poziția față de proiect" className="-mx-4 mt-4 flex overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0">
              <div className="flex rounded-lg bg-sunken p-1">
                <button type="button" aria-pressed={filter === null} onClick={() => setFilter(null)} className={segCls(filter === null)}>
                  Toate <span className="tabular-nums opacity-70">{news.articles.length}</span>
                </button>
                {STANCES.filter((s) => counts[s] > 0).map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={filter === s}
                    onClick={() => setFilter(filter === s ? null : s)}
                    {...trackAttrs('news_filter', { bill_id: billId, stance: s })}
                    className={segCls(filter === s)}
                  >
                    {capitalize(STANCE[s].many)} <span className="tabular-nums opacity-70">{counts[s]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className={`${panel} mt-4 overflow-hidden`}>
            <ul className="divide-y divide-line">{shown.slice(0, first).map(row)}</ul>
            {rest.length > 0 && (
              <details className="group/more border-t border-line">
                <summary
                  {...trackAttrs('news_more', { bill_id: billId })}
                  className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-5 text-sm font-semibold text-link transition-colors hover:bg-sunken/60 sm:px-6"
                >
                  <span className="group-open/more:hidden">Vezi toate cele {countWord(shown.length, 'articol', 'articole')}</span>
                  <span className="hidden group-open/more:inline">Arată mai puține</span>
                  <ChevronDown className="chevron h-4 w-4 shrink-0" aria-hidden />
                </summary>
                <ul className="divide-y divide-line border-t border-line">{rest.map(row)}</ul>
              </details>
            )}
          </div>
          <p className="mt-3 text-xs leading-5 text-muted">
            Articole găsite de Gemini, Claude și ChatGPT și verificate pe site-ul publicației. Poziția față de proiect și tipul sursei le clasifică automat două
            modele open source pe care le rulăm noi, Clef (Cloudflare) și d1 (Liquid AI); punem eticheta doar unde sunt de acord. Site-urile din afara publicațiilor
            pe care le urmărim apar doar dacă articolul e chiar despre proiect și nu e o simplă preluare. Nu le-am scris noi, iar numărul lor nu
            influențează scorul de risc.
          </p>
        </>
      )}
    </section>
  );
}
