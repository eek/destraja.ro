import { ArrowDown, ArrowRight, ExternalLink, Minus, Plus } from 'lucide-react';
import type { BillVersions as Versions, VersionChange } from '@/lib/types';
import { MODELS } from '@/lib/site';
import { fmt } from '@/lib/format';
import { RiskChip, panel } from '@/components/ui';

const DIRECTION: Record<VersionChange['direction'], { label: string; cls: string }> = {
  mai_riscant: { label: 'a devenit mai riscant', cls: 'text-risk-red-text' },
  mai_putin_riscant: { label: 'a devenit mai puțin riscant', cls: 'text-risk-green-text' },
  la_fel: { label: 'fără schimbări de fond', cls: 'text-muted' },
};

const EFFECT: Record<VersionChange['changes'][number]['effect'], { label: string; cls: string }> = {
  mai_bine: { label: 'mai bine', cls: 'bg-risk-green-soft text-risk-green-text' },
  mai_rau: { label: 'mai rău', cls: 'bg-risk-red-soft text-risk-red-text' },
  neutru: { label: 'neutru', cls: 'bg-sunken text-body' },
};

/**
 * Diferența de scor, cu semn: „+1,7” când riscul crește, „−2,3” când scade. Sub un punct e în marja în care variază și
 * două analize ale aceluiași text, deci n-o colorăm.
 */
function Delta({ from, to }: { from: number; to: number }) {
  const d = Math.round((to - from) * 10) / 10;
  if (Math.abs(d) < 1) return <span className="text-center text-xs text-muted">scor în marja de variație</span>;
  const up = d > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${up ? 'text-risk-red-text' : 'text-risk-green-text'}`}>
      {up ? <Plus className="h-3 w-3" aria-hidden /> : <Minus className="h-3 w-3" aria-hidden />}
      {fmt(Math.abs(d))}
      <span className="sr-only">{up ? ' puncte de risc în plus' : ' puncte de risc în minus'}</span>
    </span>
  );
}

/** Formele prin care a trecut textul, cu scorul fiecăreia și ce s-a schimbat de la una la alta. */
export default function BillVersions({ data }: { data: Versions }) {
  const { versions, changes } = data;
  return (
    <section aria-labelledby="versiuni" className={`${panel} mt-6 p-6 sm:p-7`}>
      <h2 id="versiuni" className="text-base font-semibold text-ink">
        Cum s-a schimbat textul
      </h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        Fiecare formă a fost analizată separat de cele trei modele. Comparația o face Claude, pe diferențele dintre texte; ea
        spune încotro a mers proiectul, pentru că scorul a două analize ale aceluiași text poate varia cu până la un punct.
      </p>

      <ol className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-stretch">
        {versions.map((v, i) => (
          <li key={v.key} className="flex flex-col gap-2 sm:flex-1 sm:flex-row sm:items-center">
            {i > 0 && (
              <span className="flex items-center gap-1.5 self-center text-muted sm:flex-col sm:gap-0.5" aria-hidden={false}>
                <ArrowDown className="h-4 w-4 sm:hidden" aria-hidden />
                <ArrowRight className="hidden h-4 w-4 sm:block" aria-hidden />
                <Delta from={versions[i - 1].riskScore} to={v.riskScore} />
              </span>
            )}
            <div className="min-w-0 flex-1 rounded-xl border border-line p-4">
              <p className="text-sm font-semibold text-ink">{v.label}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <RiskChip level={v.riskLevel} score={v.riskScore} />
                <span className="text-xs tabular-nums text-muted">
                  {MODELS.map((m) => `${m.name} ${v.scores[m.key] === null ? '–' : fmt(v.scores[m.key]!)}`).join(' · ')}
                </span>
              </div>
              <a
                href={v.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex min-h-8 items-center gap-1 text-xs text-muted underline underline-offset-4 hover:text-ink"
              >
                Textul, pe {v.source}
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-6 space-y-6">
        {changes.map((c) => {
          const from = versions.find((v) => v.key === c.from);
          const to = versions.find((v) => v.key === c.to);
          if (!from || !to) return null;
          return (
            <div key={`${c.from}-${c.to}`} className="border-t border-line pt-5">
              <h3 className="text-sm font-semibold text-ink">
                De la {from.label.toLowerCase()} la {to.label.toLowerCase()}:{' '}
                <span className={DIRECTION[c.direction].cls}>{DIRECTION[c.direction].label}</span>
              </h3>
              {c.summary && <p className="mt-2 text-[15px] leading-7 text-body">{c.summary}</p>}
              {c.changes.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {c.changes.map((ch, k) => (
                    <li key={k} className="flex gap-3 text-sm leading-6 text-body">
                      <span className={`mt-0.5 h-fit shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold ${EFFECT[ch.effect].cls}`}>{EFFECT[ch.effect].label}</span>
                      <span>{ch.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
