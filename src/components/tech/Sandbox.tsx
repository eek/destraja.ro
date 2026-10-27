import { ArrowDown, ArrowRight, ChevronDown, ExternalLink, Search, X } from 'lucide-react';
import { trackAttrs } from '@/lib/analytics';
import { SOURCE_URL } from '@/lib/site';
import { GateGlyph } from './PressGates';

// Cutia în care rulează modelele (scripts/lib/ai-cli.mjs): ce intră, ce iese și ce nu pot atinge.

const DENIED = ['Terminal sau comenzi', 'Scriere de fișiere', 'Chei și tokenuri', 'Servere MCP și pluginuri'];

function Flow({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden className={`flex items-center justify-center text-brand ${className}`}>
      <ArrowRight className="hidden h-5 w-5 lg:block" strokeWidth={2.5} />
      <ArrowDown className="h-5 w-5 lg:hidden" strokeWidth={2.5} />
    </span>
  );
}

export default function Sandbox() {
  return (
    <div>
      <figure aria-labelledby="cutie-caption">
        <figcaption id="cutie-caption" className="sr-only">
          Modelele primesc doar textul din prompt și răspund cu JSON, într-un dosar gol, cu un mediu minim și fără chei. Nu au terminal, nu scriu fișiere,
          nu au servere MCP. Doar căutarea de presă și de poziții are voie pe web. Codul verifică apoi răspunsul.
        </figcaption>
        <div className="flex flex-col items-stretch gap-3 lg:flex-row lg:items-center lg:gap-4">
          <div className="rounded-xl bg-sunken px-4 py-3 text-center lg:w-44 lg:shrink-0">
            <p className="text-sm font-semibold text-ink">Prompt</p>
            <p className="text-xs leading-5 text-muted">textul oficial, ca date</p>
          </div>
          <Flow />
          <div className="flex-1 rounded-2xl border-2 border-dashed border-line-strong p-5 sm:p-6">
            <p className="text-center text-xs font-medium text-muted">un dosar gol · un mediu minim · fără chei</p>
            <ul className="mt-4 flex flex-wrap justify-center gap-2">
              {['Gemini', 'Claude', 'ChatGPT'].map((m) => (
                <li key={m} className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-on-brand">
                  {m}
                </li>
              ))}
            </ul>
            <ul className="mt-5 grid grid-cols-1 gap-x-6 gap-y-2 border-t border-line pt-4 sm:grid-cols-2" aria-label="Ce nu au">
              {DENIED.map((d) => (
                <li key={d} className="flex items-center gap-2 text-sm text-muted">
                  <X className="h-4 w-4 shrink-0 text-ink" strokeWidth={2.5} aria-hidden />
                  <span className="line-through decoration-line-strong">{d}</span>
                </li>
              ))}
              <li className="flex items-start gap-2 text-sm text-body sm:col-span-2">
                <Search className="mt-0.5 h-4 w-4 shrink-0 text-ink" strokeWidth={2.5} aria-hidden />
                <span>Căutare pe web doar la presă și la pozițiile organizațiilor. Tot ce găsesc trece apoi prin porțile din cod.</span>
              </li>
            </ul>
          </div>
          <Flow />
          <div className="rounded-xl bg-sunken px-4 py-3 text-center lg:w-44 lg:shrink-0">
            <p className="text-sm font-semibold text-ink">JSON</p>
            <p className="text-xs leading-5 text-muted">doar răspunsul cerut</p>
          </div>
          <Flow />
          <div className="flex items-center justify-center gap-3 rounded-xl bg-sunken px-4 py-3 lg:w-48 lg:shrink-0">
            <GateGlyph className="shrink-0" />
            <p className="text-sm font-semibold text-ink">Codul verifică</p>
          </div>
        </div>
      </figure>

      <details className="group mt-8 border-y border-line">
        <summary {...trackAttrs('tech_details_open', { topic: 'sandbox' })} className="flex min-h-14 cursor-pointer items-center justify-between gap-4 text-base font-semibold text-ink">
          Pentru programatori: cum e închis fiecare CLI
          <ChevronDown className="chevron h-5 w-5 shrink-0 text-muted" aria-hidden />
        </summary>
        <ul className="space-y-3 pb-5 text-[15px] leading-7 text-body prose-measure">
          <li>
            <strong className="font-semibold text-ink">claude</strong>: <code className="tech-code">--tools &quot;&quot;</code> (la căutare doar{' '}
            <code className="tech-code">WebSearch,WebFetch</code>) și <code className="tech-code">--strict-mcp-config</code> fără nicio configurație MCP.
          </li>
          <li>
            <strong className="font-semibold text-ink">codex</strong>: <code className="tech-code">exec -s read-only</code>, cu shell-ul, browserul, computer use,
            aplicațiile, pluginurile, hook-urile și serverele MCP oprite; <code className="tech-code">--search</code> doar la căutare.
          </li>
          <li>
            <strong className="font-semibold text-ink">agy</strong>: doi agenți proprii din <code className="tech-code">.agents/agents/</code>:{' '}
            <code className="tech-code">lastraja-offline</code>, fără unelte, și <code className="tech-code">lastraja-web</code>, doar cu{' '}
            <code className="tech-code">search_web</code>. Fără componentele implicite, fără MCP moștenit, fără terminal și fără fișiere.
          </li>
          <li>
            Toate rulează în <code className="tech-code">.cache/ai-sandbox</code>, un dosar gol, cu un mediu minim: PATH, HOME, utilizatorul, limba, dosarul
            temporar și CODEX_HOME. Nimic din <code className="tech-code">.env</code>. Niciun flag „dangerously”.
          </li>
          {SOURCE_URL && (
            <li>
              <a
                href={`${SOURCE_URL}/blob/main/scripts/lib/ai-cli.mjs`}
                target="_blank"
                rel="noopener noreferrer"
                {...trackAttrs('source_open', { link: 'ai_cli' })}
                className="inline-flex items-center gap-1 font-semibold text-link underline decoration-1 underline-offset-4 hover:decoration-2"
              >
                Codul, în scripts/lib/ai-cli.mjs
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            </li>
          )}
        </ul>
      </details>
    </div>
  );
}
