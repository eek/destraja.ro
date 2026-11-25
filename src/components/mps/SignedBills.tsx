import { ChevronDown } from 'lucide-react';
import type { SignedRow } from '@/lib/signed';
import { countWord, initialRows } from '@/lib/format';
import { RiskChip, panel } from '@/components/ui';
import SignedFilters from './SignedFilters';
import { CURRENT_LEG, legLabel } from '../../../scripts/lib/semnaturi.mjs';

// Pe fiecare an, primele rânduri se văd; restul stau într-un <details>, ca listele de sute de proiecte să rămână scurte.
const SHOWN = 8;

const dayFmt = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const day = (iso: string) => dayFmt.format(new Date(`${iso}T00:00:00Z`));

/**
 * Toate proiectele semnate de parlamentar, pe ani, cele mai noi întâi: numărul, titlul (pe înțeles când avem analiza,
 * altfel cel oficial), stadiul și riscul, doar unde există analiza. Filtrele (analiză, stadiu) ascund rânduri deja
 * randate, fără să trimită lista în browser a doua oară.
 */
export default function SignedBills({ rows, analysedCount }: { rows: SignedRow[]; analysedCount: number }) {
  if (!rows.length) return null;
  const years = [...new Set(rows.map((r) => r.registered.slice(0, 4)))];
  const analysed = rows.filter((r) => r.analysed).length;
  const older = rows.filter((r) => r.leg < CURRENT_LEG).length;
  const counts = {
    all: rows.length,
    yes: analysed,
    no: rows.length - analysed,
    dezbatere: rows.filter((r) => r.outcome === 'dezbatere').length,
    adoptat: rows.filter((r) => r.outcome === 'adoptat').length,
    oprit: rows.filter((r) => r.outcome === 'oprit').length,
  };

  return (
    <div id="toate-semnate" className="mt-10">
      <h3 className="text-lg font-semibold text-ink">Toate proiectele semnate</h3>
      <p className="mt-2 max-w-[70ch] text-sm leading-6 text-muted">
        {countWord(rows.length, 'proiect', 'proiecte')} cu semnătura de inițiator
        {older > 0 && <>; {older === 1 ? 'unul e dintr-un mandat de dinainte' : `${older} dintre ele sunt din mandate de dinainte`}</>}. Riscul
        apare doar la {analysed === 1 ? 'cel' : 'cele'} {analysed} pe care {analysed === 1 ? 'l-am' : 'le-am'} analizat; restul sunt marcate „fără
        analiză”. Cifrele de sus numără doar{' '}
        {analysedCount === 1 ? 'proiectul analizat din 2026' : `cele ${countWord(analysedCount, 'proiect analizat', 'proiecte analizate')} din 2026`}.
      </p>

      <SignedFilters counts={counts} />

      <div data-signed-list className="mt-6 space-y-8">
        {years.map((y, i) => {
          const list = rows.filter((r) => r.registered.startsWith(y));
          const shown = initialRows(list.length, SHOWN);
          return (
            <section key={y} data-year aria-labelledby={`semnate-${y}`} className={i > 0 ? 'deferred' : undefined}>
              <h4 id={`semnate-${y}`} className="mb-3 flex items-baseline justify-between gap-3">
                <span className="text-base font-semibold tabular-nums text-ink">{y}</span>
                <span data-count className="text-xs tabular-nums text-muted">
                  {countWord(list.length, 'proiect', 'proiecte')}
                </span>
              </h4>
              <ul className={`${panel} divide-y divide-line overflow-hidden`}>
                {list.slice(0, shown).map((r) => (
                  <Row key={r.key} r={r} />
                ))}
              </ul>
              {list.length > shown && (
                <details data-more className="group mt-2">
                  <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
                    Încă {list.length - shown} din {y}
                    <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <ul className={`${panel} mt-2 divide-y divide-line overflow-hidden`}>
                    {list.slice(shown).map((r) => (
                      <Row key={r.key} r={r} />
                    ))}
                  </ul>
                </details>
              )}
            </section>
          );
        })}
        <p data-empty hidden className="rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center text-sm text-muted">
          Niciun proiect semnat nu se potrivește filtrelor.
        </p>
      </div>
    </div>
  );
}

function Row({ r }: { r: SignedRow }) {
  // <a>, nu <Link>: sute de rânduri ar preîncărca fiecare pagina lor când ajung pe ecran.
  return (
    <li data-a={r.analysed ? 'yes' : 'no'} data-o={r.outcome}>
      <a href={r.href} className="signed-row">
        <span className="signed-id">{r.id}</span>
        <span className="signed-stage">
          <b>{r.stage}</b>
          {r.stageDate && <span className="tabular-nums">{day(r.stageDate)}</span>}
        </span>
        <span className="signed-title">{r.title}</span>
        <span className="signed-meta">
          {r.risk ? <RiskChip level={r.risk.level} score={r.risk.score} /> : <span>fără analiză</span>}
          {r.textChange && (
            <span className={`font-semibold ${r.textChange.direction === 'mai_putin_riscant' ? 'text-risk-green-text' : 'text-risk-red-text'}`}>
              {r.textChange.direction === 'mai_putin_riscant' ? '↘ mai puțin riscant' : '↗ mai riscant'} după {r.textChange.after === 'senat' ? 'Senat' : 'Cameră'}
            </span>
          )}
          {r.leg < CURRENT_LEG && <span>· semnat în mandatul {legLabel(r.leg)}</span>}
        </span>
      </a>
    </li>
  );
}
