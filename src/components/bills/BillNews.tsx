import { ExternalLink, Newspaper } from 'lucide-react';
import type { BillNews as News } from '@/lib/types';
import { formatDateRo } from '@/lib/format';
import { trackAttrs } from '@/lib/analytics';
import { panel } from '@/components/ui';

export default function BillNews({ billId, news }: { billId: string; news: News }) {
  return (
    <section aria-labelledby="presa" className="mt-14 scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="presa" className="font-display text-3xl font-normal">
          În presă
        </h2>
        <p className="text-xs text-muted">Verificat la {formatDateRo(news.checkedAt)}</p>
      </div>
      {news.articles.length === 0 ? (
        <p className="mt-4 flex items-start gap-3 text-[15px] leading-7 text-body">
          <Newspaper className="mt-1 h-4 w-4 shrink-0 text-muted" aria-hidden />
          Nu am găsit încă articole de presă despre acest proiect. Căutăm din nou în fiecare zi lucrătoare.
        </p>
      ) : (
        <>
          <ul className={`${panel} mt-5 divide-y divide-line`}>
            {news.articles.map((a) => (
              <li key={a.url}>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  {...trackAttrs('news_open', { bill_id: billId, domain: a.domain })}
                  className="group flex items-start justify-between gap-4 p-5 transition-colors hover:bg-sunken/60 sm:p-6"
                >
                  <span className="min-w-0">
                    <span className="block font-semibold leading-snug text-ink group-hover:underline group-hover:underline-offset-4">{a.title}</span>
                    <span className="mt-1 block text-sm text-muted">
                      {a.outlet}
                      {a.publishedAt && ` · ${formatDateRo(a.publishedAt)}`}
                    </span>
                  </span>
                  <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-muted" aria-hidden />
                  <span className="sr-only">(se deschide într-o filă nouă)</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-5 text-muted">
            Articole găsite de Gemini, Claude și ChatGPT și verificate pe pagina publicației. Nu le-am scris noi și nu reflectă neapărat analiza de mai sus.
          </p>
        </>
      )}
    </section>
  );
}
