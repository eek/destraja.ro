import { ExternalLink } from 'lucide-react';
import { ATTRIBUTION, CONTENT_LICENSE, SOURCE_URL } from '@/lib/site';
import { trackAttrs } from '@/lib/analytics';
import { CopyButton, linkCls, panel } from '@/components/ui';

/** Termenii de preluare (CC BY 4.0) și formula de citare, pe /presa#citare. */
export default function CiteTerms({ copied, onCopy }: { copied: string | null; onCopy: (key: string, text: string) => void }) {
  return (
    <section id="citare" aria-labelledby="citare-title" className={`${panel} grid scroll-mt-24 gap-8 p-5 sm:p-7 lg:grid-cols-12`}>
      <div className="lg:col-span-7">
        <h2 id="citare-title" className="text-lg font-semibold text-ink">
          Preia liber, cu sursa
        </h2>
        <p className="mt-2 text-[15px] leading-7 text-body">
          Analizele, scorurile, rezumatele și tabelele de pe destrajă.ro sunt sub licența{' '}
          <a href={CONTENT_LICENSE.url} target="_blank" rel="noopener noreferrer" className={linkCls}>
            {CONTENT_LICENSE.name}
          </a>
          . Le poți prelua, traduce și adapta, inclusiv în scop comercial, cu o singură condiție: să citezi sursa.
        </p>
        <h3 className="mt-6 text-sm font-semibold text-ink">Cum ne citezi</h3>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-[15px] leading-7 text-body marker:text-muted">
          <li>
            <span className="font-semibold text-ink">Online:</span> pune linkul la pagina proiectului pe destrajă.ro. Acolo cititorii tăi găsesc analiza
            completă, documentele oficiale și cum trimit o opinie la Senat.
          </li>
          <li>
            <span className="font-semibold text-ink">Tipar, radio, TV:</span> „potrivit destrajă.ro”.
          </li>
          <li>Scorurile sunt evaluări făcute cu AI, nu verdicte juridice; spune asta când le citezi. Dacă ai prelucrat datele, spune și asta.</li>
        </ul>
        <div className="mt-5 flex items-center gap-3 rounded-xl bg-sunken py-2 pl-4 pr-2">
          <code className="min-w-0 flex-1 font-mono text-[13px] leading-5 text-ink">{ATTRIBUTION}</code>
          <CopyButton
            label="Copiază"
            active={copied === 'attribution'}
            onClick={() => onCopy('attribution', ATTRIBUTION)}
            track={trackAttrs('press_copy', { item: 'attribution' })}
          />
        </div>
      </div>

      <div className="lg:col-span-5 lg:border-l lg:border-line lg:pl-8">
        <h3 className="text-sm font-semibold text-ink">Ce nu intră în licență</h3>
        <ul className="mt-2 space-y-3 text-sm leading-6 text-body">
          <li>Textele oficiale ale proiectelor și documentele de pe senat.ro. Nu au drepturi de autor (art. 9 din Legea nr. 8/1996), deci le poți prelua oricum.</li>
          <li>Titlurile și citatele din articolele de presă. Aparțin publicațiilor; citează articolul original.</li>
          <li>Datele de contact ale parlamentarilor, preluate de pe cdep.ro și senat.ro.</li>
          <li>Logoul destrajă.ro.</li>
        </ul>
        <div className="mt-5 flex flex-col items-start gap-2 text-sm">
          <a href={CONTENT_LICENSE.url} target="_blank" rel="noopener noreferrer" className={`${linkCls} inline-flex items-center gap-1`}>
            Textul licenței {CONTENT_LICENSE.name}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
          {SOURCE_URL && (
            <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer" className={`${linkCls} inline-flex items-center gap-1`}>
              Codul sursă (AGPL-3.0)
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
