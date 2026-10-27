import { ChevronDown, ExternalLink, Users } from 'lucide-react';
import type { BillPositions as Positions, CivicPosition, PositionStance, PositionsSummary } from '@/lib/types';
import { countWord, formatDateRo } from '@/lib/format';
import { stanceLabel } from '@/lib/positions';
import { trackAttrs } from '@/lib/analytics';
import { panel } from '@/components/ui';

// Roșu, galben și verde înseamnă doar risc, așa că poziția se vede din etichetă și din intensitatea navy.
const CHIP: Record<PositionStance, string> = {
  retragere: 'bg-brand text-on-brand',
  respingere: 'bg-brand text-on-brand',
  modificare: 'border border-line-strong bg-surface text-ink',
  sustinere: 'bg-sunken text-body',
};

const linkCls = 'inline-flex min-h-11 items-center gap-1 font-semibold text-link underline-offset-4 hover:underline';

/** Linia din antetul proiectului, ca „În presă”: duce la secțiunea cu pozițiile. */
export function PositionsLink({ summary }: { summary: PositionsSummary }) {
  if (!summary.line) return null;
  return (
    <a href="#pozitii" className="inline-flex items-center gap-1.5 font-semibold text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
      <Users className="h-4 w-4 shrink-0" aria-hidden />
      {summary.line}
    </a>
  );
}

function Signatories({ billId, p }: { billId: string; p: CivicPosition }) {
  const s = p.signatories;
  if (!s || (s.organizations === 0 && s.individuals === 0)) return null;
  const people = s.individuals > 0 && (
    <p className="mt-2 text-xs leading-5 text-muted">
      Au semnat și {countWord(s.individuals, 'persoană fizică', 'persoane fizice')}; le numărăm, fără să le publicăm numele.
    </p>
  );
  if (s.organizations === 0) {
    return (
      <p className="mt-4 text-sm font-semibold tabular-nums text-ink">
        {countWord(s.individuals, 'persoană semnatară', 'persoane semnatare')}
        <span className="font-normal text-muted"> (fără nume)</span>
      </p>
    );
  }
  // Numerotăm ca în document doar când lista are numai organizații; altfel numerele n-ar mai corespunde.
  const numbered = s.individuals === 0;
  return (
    <details className="group/sig mt-4">
      <summary
        {...trackAttrs('position_signatories', { bill_id: billId, domain: p.domain })}
        className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
      >
        <span className="whitespace-nowrap font-semibold tabular-nums text-ink">{countWord(s.organizations, 'organizație semnatară', 'organizații semnatare')}</span>
        <span className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-link">
          <span className="group-open/sig:hidden">Vezi lista</span>
          <span className="hidden group-open/sig:inline">Ascunde lista</span>
          <ChevronDown className="chevron h-4 w-4 shrink-0" aria-hidden />
        </span>
      </summary>
      <ol className="mt-1 grid max-h-[26rem] gap-y-1 overflow-y-auto overscroll-contain rounded-xl bg-sunken p-4 text-sm leading-6 text-body sm:grid-cols-2 sm:gap-x-8">
        {s.names.map((name, i) => (
          <li key={i} className="flex gap-2">
            {numbered && <span className="w-8 shrink-0 text-right text-xs leading-6 tabular-nums text-muted">{i + 1}.</span>}
            <span className="min-w-0">{name}</span>
          </li>
        ))}
      </ol>
      {people}
    </details>
  );
}

function PositionItem({ billId, p }: { billId: string; p: CivicPosition }) {
  const meta = [p.documentType && p.documentType[0].toUpperCase() + p.documentType.slice(1), p.date && formatDateRo(p.date)].filter(Boolean).join(' · ');
  const isPdf = !!p.documentUrl && /\.pdf($|\?)/i.test(p.documentUrl);
  return (
    <li className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className={`inline-flex min-h-7 items-center rounded-md px-2 py-0.5 text-xs font-semibold ${CHIP[p.stance]}`}>{stanceLabel(p)}</span>
        {meta && <span className="text-xs text-muted">{meta}</span>}
      </div>
      <h3 className="mt-3 text-base font-semibold leading-snug text-ink sm:text-lg">{p.issuer}</h3>
      {p.title && <p className="mt-1 text-sm leading-6 text-muted prose-measure">{p.title}</p>}
      <q className="mt-3 block border-l-2 border-line-strong pl-4 text-[15px] italic leading-7 text-body prose-measure">{p.quote}</q>
      <Signatories billId={billId} p={p} />
      <div className="mt-2 flex flex-wrap gap-x-5 text-sm">
        {p.documentUrl && (
          <a
            href={p.documentUrl}
            target="_blank"
            rel="noopener noreferrer"
            {...trackAttrs('position_open', { bill_id: billId, domain: p.domain, link: 'document' })}
            className={linkCls}
          >
            {isPdf ? 'Documentul (PDF)' : 'Documentul'}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">(se deschide într-o filă nouă)</span>
          </a>
        )}
        {p.pageUrl && (
          <a
            href={p.pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            {...trackAttrs('position_open', { bill_id: billId, domain: p.domain, link: 'page' })}
            className={linkCls}
          >
            {p.viaPress ? `Relatat de ${p.domain}` : `Pagina pe ${p.domain}`}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">(se deschide într-o filă nouă)</span>
          </a>
        )}
      </div>
    </li>
  );
}

export default function BillPositions({ billId, data, summary }: { billId: string; data: Positions; summary: PositionsSummary }) {
  const list = data.positions;
  const checked = data.checkedAt ?? list.map((p) => p.verifiedAt).sort().at(-1) ?? null;
  return (
    <section id="pozitii" aria-labelledby="pozitii-title" className="scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <h2 id="pozitii-title" className="font-display text-2xl font-normal sm:text-3xl">
          Ce spun organizațiile
          {list.length > 0 && <span className="ml-2.5 text-muted tabular-nums">{list.length}</span>}
        </h2>
        {checked && <p className="text-xs text-muted">Verificat la {formatDateRo(checked)}</p>}
      </div>
      {list.length === 0 ? (
        <p className={`${panel} mt-4 flex items-start gap-3 p-5 text-[15px] leading-7 text-body sm:p-6`}>
          <Users className="mt-1.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
          Nu am găsit încă scrisori, petiții sau puncte de vedere publice ale organizațiilor despre acest proiect. Căutăm din nou de câteva ori pe săptămână.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-body">
            {summary.line ? `${summary.line}. ` : ''}Scrisori, petiții și puncte de vedere publice, fiecare verificată în sursa ei.
          </p>
          <ul className={`${panel} mt-4 divide-y divide-line overflow-hidden`}>
            {list.map((p) => (
              <PositionItem key={p.documentUrl ?? p.pageUrl ?? p.issuer} billId={billId} p={p} />
            ))}
          </ul>
          <p className="mt-3 text-xs leading-5 text-muted">
            Le căutăm cu Gemini, Claude și ChatGPT și le verificăm automat: documentul se deschide, pomenește proiectul și conține citatul de mai sus.
            Semnatarii sunt numărați din lista documentului; persoanele fizice apar doar ca număr. Pozițiile nu influențează scorul de risc.
          </p>
        </>
      )}
    </section>
  );
}
