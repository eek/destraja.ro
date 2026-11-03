import { BadgeCheck, PencilLine } from 'lucide-react';
import type { AnalysisCorrection } from '@/lib/types';
import { type PublicReport, targetsLabel } from '@/lib/reports';
import { formatDateRo } from '@/lib/format';
import { panel } from '@/components/ui';

const label = 'text-xs font-semibold uppercase tracking-[0.06em] text-muted';

// Citatele din textul oficial vin uneori cu ghilimelele lor („g) …;”); le punem o singură dată.
const bare = (s: string) => s.trim().replace(/^[„“"«]+|[”“"»]+$/g, '');

function Quote({ text }: { text: string }) {
  return <blockquote className="mt-1 border-l-2 border-line-strong pl-3 text-sm leading-relaxed text-body">„{bare(text)}”</blockquote>;
}

function Meta({ fixed, date, where, name }: { fixed: boolean; date: string; where: string; name?: string }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${fixed ? 'bg-brand-soft text-ink' : 'bg-sunken text-ink'}`}
      >
        {fixed ? <PencilLine className="h-3.5 w-3.5" aria-hidden /> : <BadgeCheck className="h-3.5 w-3.5" aria-hidden />}
        {fixed ? 'Corectat' : 'Verificat, analiza rămâne'}
      </span>
      <span className="tabular-nums">{formatDateRo(date)}</span>
      {where && <span>· {where}</span>}
      {name && <span>· semnalat de {name}</span>}
    </p>
  );
}

function Report({ r }: { r: PublicReport }) {
  const fixed = r.status === 'fixed';
  return (
    <li className="py-5 first:pt-0 last:pb-0">
      <Meta fixed={fixed} date={r.date} where={targetsLabel(r.targets)} name={r.name} />
      {fixed && r.before && r.after ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <p className={label}>Am scris</p>
            <p className="mt-1 text-[15.5px] leading-relaxed text-muted line-through decoration-risk-red-text/60">„{bare(r.before)}”</p>
          </div>
          <div>
            <p className={label}>Acum scrie</p>
            <p className="mt-1 text-[15.5px] leading-relaxed text-ink">„{bare(r.after)}”</p>
          </div>
        </div>
      ) : (
        r.claim && (
          <div className="mt-3">
            <p className={label}>Fraza contestată din analiză</p>
            <p className="mt-1 text-[15.5px] leading-relaxed text-ink">„{bare(r.claim)}”</p>
          </div>
        )
      )}
      {r.quote && (
        <div className="mt-3">
          <p className={label}>Ce scrie în proiect</p>
          <Quote text={r.quote} />
        </div>
      )}
      {r.why && (
        <div className="mt-3">
          <p className={label}>{fixed ? 'De ce am corectat' : 'De ce rămâne așa'}</p>
          <p className="mt-1 text-[15.5px] leading-relaxed text-ink">{r.why}</p>
        </div>
      )}
      <p className="mt-3 text-sm leading-6 text-muted">
        {fixed
          ? 'Gemini, Claude și ChatGPT au confirmat greșeala în textul oficial; textul nou l-au aprobat Gemini și ChatGPT.'
          : 'Gemini, Claude și ChatGPT au comparat raportul cu textul oficial și au găsit toate trei analiza corectă pe acest punct.'}
      </p>
    </li>
  );
}

/**
 * Rapoartele cititorilor deja verificate: ce am corectat și ce am lăsat așa, cu citatul oficial. Textul raportului nu-l
 * publicăm (vezi scripts/straja-reports.mjs). Fără niciun raport verificat, secțiunea lipsește.
 */
export default function BillReports({ reports, manual = [] }: { reports: PublicReport[]; manual?: AnalysisCorrection[] }) {
  const count = reports.length + manual.length;
  if (!count) return null;
  return (
    <section id="greseli" aria-labelledby="greseli-titlu" className={`${panel} mt-6 scroll-mt-20 p-6 sm:p-8`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="greseli-titlu" className="font-display text-2xl font-semibold text-ink sm:text-[1.75rem]">
          Greșeli semnalate
        </h2>
        <p className="text-sm tabular-nums text-muted">{count === 1 ? '1 raport verificat' : `${count} rapoarte verificate`}</p>
      </div>
      <p className="mt-1.5 max-w-[62ch] text-base leading-relaxed text-body">
        Cititorii ne spun când analiza nu se potrivește cu textul oficial. Fiecare raport e verificat de Gemini, Claude și ChatGPT, iar
        corectăm doar ce confirmă toate trei, cu citat din textul proiectului.
      </p>
      <ul className="mt-6 divide-y divide-line border-t border-line pt-5">
        {reports.map((r) => (
          <Report key={r.ids[0]} r={r} />
        ))}
        {manual.map((c) => (
          <li key={c.reportId} className="py-5 first:pt-0 last:pb-0">
            <Meta fixed date={c.date} where={c.target === 'consensus' ? 'concluzia comună' : ''} />
            <p className="mt-3 text-[15.5px] leading-relaxed text-ink">{c.note?.replace(/^./, (x) => x.toUpperCase())}</p>
          </li>
        ))}
      </ul>
      <p className="mt-5 border-t border-line pt-4 text-xs leading-5 text-muted">
        Textul rapoartelor nu îl publicăm: apar doar fraza verificată, citatul din proiect, explicația noastră și numele, dacă cititorul l-a lăsat.
      </p>
    </section>
  );
}
