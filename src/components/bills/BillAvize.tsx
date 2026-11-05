import { Calculator, ChevronDown, CircleCheck, CircleHelp, CircleX, ExternalLink, Scale } from 'lucide-react';
import { type AvizDoc, getBillAvize } from '@/lib/avize';
import { formatDateRo } from '@/lib/format';
import { trackAttrs } from '@/lib/analytics';
import { panel } from '@/components/ui';

const label = 'text-xs font-semibold uppercase tracking-[0.06em] text-muted';

// Citatele vin uneori cu ghilimelele lor; le punem o singură dată.
const bare = (s: string) => s.trim().replace(/^[„“"«]+|[”“"»]+$/g, '');

/** „un amendament”, „6 amendamente”, „35 de amendamente”. */
const amendments = (n: number) => (n === 1 ? 'un amendament' : n % 100 >= 1 && n % 100 <= 19 ? `${n} amendamente` : `${n} de amendamente`);

const list = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} și ${names.at(-1)}` : (names[0] ?? ''));

/** Verdictul, spus ca poziția instituției („Comisia propune respingerea”), niciodată ca fapt („respins”). */
function verdictText(d: AvizDoc): string {
  if (d.kind === 'guvern') {
    return (
      {
        sustine: 'Guvernul susține proiectul',
        nu_sustine: 'Guvernul nu susține proiectul',
        sustine_cu_amendamente: 'Guvernul susține proiectul, cu modificări',
        la_aprecierea_parlamentului: 'Guvernul lasă decizia la aprecierea Parlamentului',
      }[d.verdict] ?? 'Nu am putut stabili din document poziția Guvernului'
    );
  }
  if (d.kind === 'raport') {
    const who = (d.committees?.length ?? 0) > 1 ? 'Comisiile propun' : 'Comisia propune';
    const n = d.amendamente?.admise ?? 0;
    if (d.verdict === 'adoptare') return `${who} adoptarea proiectului`;
    if (d.verdict === 'adoptare_cu_amendamente') return `${who} adoptarea proiectului, cu ${n ? amendments(n) : 'amendamente'}`;
    if (d.verdict === 'respingere') return `${who} respingerea proiectului`;
    return 'Nu am putut stabili din raport ce propune comisia';
  }
  if (d.kind === 'cl') {
    return (
      {
        favorabil: 'Consiliul Legislativ a dat aviz favorabil',
        favorabil_cu_observatii: 'Consiliul Legislativ a dat aviz favorabil, cu observații',
        negativ: 'Consiliul Legislativ a dat aviz negativ',
      }[d.verdict] ?? 'Nu am putut stabili din document avizul Consiliului Legislativ'
    );
  }
  return (
    {
      estimat: 'Consiliul Fiscal arată un impact bugetar estimat în cifre',
      fara_impact: 'Consiliul Fiscal nu vede un impact asupra bugetului',
      necuantificat: 'Consiliul Fiscal spune că impactul bugetar nu e cuantificat',
      neevaluat: 'Consiliul Fiscal nu a evaluat impactul bugetar',
    }[d.verdict] ?? 'Nu am putut stabili din document ce spune Consiliul Fiscal despre buget'
  );
}

const POSITIVE = new Set(['sustine', 'sustine_cu_amendamente', 'adoptare', 'adoptare_cu_amendamente', 'favorabil', 'favorabil_cu_observatii']);
const NEGATIVE = new Set(['nu_sustine', 'respingere', 'negativ']);

// Fără culorile riscului: un aviz favorabil nu spune nimic despre riscurile proiectului. Consiliul Fiscal nu e „pentru” sau
// „contra”, spune doar ce știe despre buget, așa că are mereu același semn.
function VerdictIcon({ d }: { d: AvizDoc }) {
  const cls = 'mt-0.5 h-[18px] w-[18px] shrink-0';
  if (d.verdict === 'neclar') return <CircleHelp className={`${cls} text-muted`} aria-hidden />;
  if (d.kind === 'cf') return <Calculator className={`${cls} text-ink`} aria-hidden />;
  if (NEGATIVE.has(d.verdict)) return <CircleX className={`${cls} text-ink`} aria-hidden />;
  if (POSITIVE.has(d.verdict)) return <CircleCheck className={`${cls} text-ink`} aria-hidden />;
  return <Scale className={`${cls} text-ink`} aria-hidden />;
}

function who(d: AvizDoc): { name: string; doc: string; committees?: string[] } {
  const doc = d.docType.replace(/^./, (c) => c.toUpperCase());
  if (d.kind !== 'raport') return { name: d.institution, doc };
  const many = (d.committees?.length ?? 0) > 1;
  return { name: many ? 'Comisiile sesizate în fond' : 'Comisia sesizată în fond', doc, committees: d.committees ?? [] };
}

function when(d: AvizDoc) {
  if (d.date) return `din ${formatDateRo(d.date)}`;
  if (d.receivedAt) return `primit la Cameră pe ${formatDateRo(d.receivedAt)}`;
  return null;
}

function voteText(v: NonNullable<AvizDoc['vote']>) {
  const counts = [
    v.pentru != null && `${v.pentru} pentru`,
    v.contra != null && `${v.contra} împotrivă`,
    v.abtineri != null && `${v.abtineri} ${v.abtineri === 1 ? 'abținere' : 'abțineri'}`,
  ].filter(Boolean);
  return [v.statement, counts.length ? `(${counts.join(', ')})` : null].filter(Boolean).join(' ');
}

function Quote({ text }: { text: string }) {
  return <blockquote className="mt-1 border-l-2 border-line-strong pl-3 text-sm leading-relaxed text-body">„{bare(text)}”</blockquote>;
}

function Row({ d, billId }: { d: AvizDoc; billId: string }) {
  const w = who(d);
  const date = when(d);
  const unclear = d.verdict === 'neclar';
  const n = d.observations.length;
  return (
    <li className="grid gap-2 py-5 first:pt-0 last:pb-0 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6">
      <div className="flex flex-wrap items-baseline gap-x-2 sm:block">
        <p className="text-[15px] font-semibold leading-6 text-ink">{w.name}</p>
        <p className="text-sm leading-6 text-muted">
          <span className="sm:hidden" aria-hidden>
            ·{' '}
          </span>
          {w.doc}
        </p>
      </div>
      <div className="min-w-0">
        <p className={`flex items-start gap-2 text-[15.5px] leading-6 ${unclear ? 'text-muted' : 'font-semibold text-ink'}`}>
          <VerdictIcon d={d} />
          <span>{verdictText(d)}</span>
        </p>
        {w.committees?.map((c) => (
          <p key={c} className="mt-1 text-sm leading-6 text-body">
            {c}
          </p>
        ))}
        {d.vote && <p className="mt-1 text-sm leading-6 text-body">Votul în comisie: {voteText(d.vote)}.</p>}
        {d.kind === 'cf' && d.fundingSource != null && (
          <p className="mt-1 text-sm leading-6 text-body">{d.fundingSource ? 'Spune că sursa de finanțare e identificată.' : 'Spune că sursa de finanțare nu e identificată.'}</p>
        )}
        {(date || d.pdfUrl) && (
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm leading-6 text-muted">
            {date && <span className="tabular-nums">{date}</span>}
            {date && d.pdfUrl && <span aria-hidden>·</span>}
            {d.pdfUrl && (
              <a
                href={d.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                {...trackAttrs('official_source_open', { bill_id: billId, source: 'aviz_pdf', doc: d.kind })}
                className="inline-flex min-h-8 items-center gap-1 underline underline-offset-4 hover:text-ink"
              >
                PDF pe {d.source ?? 'site-ul oficial'}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">(se deschide într-o filă nouă)</span>
              </a>
            )}
          </p>
        )}
        {(n > 0 || d.verdictQuote) && (
          <details className="group mt-2">
            <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1 text-sm font-semibold text-link underline decoration-1 underline-offset-4 hover:decoration-2 [&::-webkit-details-marker]:hidden">
              {n > 0 ? (n === 1 ? 'O observație, cu citat' : `${n} observații, cu citate`) : 'Ce scrie în document'}
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="mt-2 space-y-4 rounded-xl bg-sunken p-4">
              {n > 0 && (
                <ul className="space-y-4">
                  {d.observations.map((o) => (
                    <li key={o.quote}>
                      <p className="text-[15px] leading-relaxed text-ink">{o.text}</p>
                      <Quote text={o.quote} />
                    </li>
                  ))}
                </ul>
              )}
              {d.verdictQuote && (
                <div className={n > 0 ? 'border-t border-line pt-4' : ''}>
                  <p className={label}>{d.verdictFrom === 'fisa' ? 'Din fișa proiectului pe cdep.ro' : 'Formula din document'}</p>
                  <Quote text={d.verdictQuote} />
                  {d.verdictFrom === 'fisa' && d.textQuote && (
                    <>
                      <p className={`${label} mt-3`}>Formula din document</p>
                      <Quote text={d.textQuote} />
                    </>
                  )}
                </div>
              )}
              {d.kind === 'cf' && d.fundingQuote && (
                <div className="border-t border-line pt-4">
                  <p className={label}>Despre sursa de finanțare</p>
                  <Quote text={d.fundingQuote} />
                </div>
              )}
            </div>
          </details>
        )}
      </div>
    </li>
  );
}

const NAMES: Record<AvizDoc['kind'], string> = {
  guvern: 'Guvernul',
  raport: 'comisia care face raportul',
  cl: 'Consiliul Legislativ',
  cf: 'Consiliul Fiscal',
};

/**
 * Ce spun instituțiile despre proiect (scripts/straja-avize.mjs): Guvernul, comisia sesizată în fond, Consiliul Legislativ
 * și Consiliul Fiscal, fiecare cu verdictul, data și PDF-ul, iar observațiile cu citatele lor se deschid la cerere. Fără
 * niciun document citit, secțiunea lipsește.
 */
export default async function BillAvize({ slug }: { slug: string }) {
  const data = await getBillAvize(slug);
  if (!data) return null;
  const docs = data.documents;
  const fromSheet = docs.some((d) => d.verdictFrom === 'fisa');
  return (
    <section id="institutii" aria-labelledby="institutii-titlu" className={`${panel} mt-6 scroll-mt-20 p-6 sm:p-8`}>
      <h2 id="institutii-titlu" className="font-display text-2xl font-semibold text-ink sm:text-[1.75rem]">
        Ce spun instituțiile
      </h2>
      <p className="mt-1.5 max-w-[62ch] text-base leading-relaxed text-body">
        Ce {docs.length > 1 ? 'spun' : 'spune'} despre proiect {list(docs.map((d) => NAMES[d.kind]))}, pe scurt, din {docs.length > 1 ? 'documentele lor oficiale' : 'documentul oficial'}.
        Fiecare observație are citatul ei din document.
      </p>
      <ul className="mt-6 divide-y divide-line border-t border-line pt-5">
        {docs.map((d) => (
          <Row key={d.kind} d={d} billId={data.billId} />
        ))}
      </ul>
      <p className="mt-5 border-t border-line pt-4 text-xs leading-5 text-muted">
        Un aviz favorabil nu înseamnă că proiectul nu are riscuri. Iar dacă un document lipsește de aici, nu înseamnă că instituția nu a avut
        obiecții: poate nu l-a trimis încă sau nu l-am citit noi. Observațiile le rezumă un model AI din documentul oficial și le păstrăm doar
        dacă citatul lor apare în document.{fromSheet && ' Ce propune comisia luăm din fișa proiectului de pe cdep.ro.'}
      </p>
    </section>
  );
}
