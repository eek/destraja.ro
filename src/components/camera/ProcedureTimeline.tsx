import { ChevronDown, CircleCheck, CircleHelp, CircleX, ExternalLink } from 'lucide-react';
import type { CdepSheet } from '@/lib/cdep';
import type { CommitteeAviz, CommitteeVerdict } from '@/lib/avize';
import { avizSummary, isAvizRow, rowAvize } from '@/lib/committee-avize';
import { shortDate } from '@/lib/cdep-text';
import { trackAttrs } from '@/lib/analytics';

type Row = CdepSheet['timeline'][number];

// „26.10.2026” → „2026-10-26”.
const iso = (d: string) => d.split('.').reverse().join('-');
const bare = (s: string) => s.trim().replace(/^[„“"«]+|[”“"»]+$/g, '');

// Fără culorile riscului: un aviz e o părere pentru comisia care face raportul, nu un semnal de alarmă. Semnul și
// eticheta spun felul avizului; „Negativ” se deosebește doar prin conturul chip-ului.
const CHIP: Record<CommitteeVerdict, { label: string; Icon: typeof CircleCheck; cls: string }> = {
  favorabil: { label: 'Favorabil', Icon: CircleCheck, cls: 'bg-sunken text-ink' },
  favorabil_cu_amendamente: { label: 'Favorabil cu amendamente', Icon: CircleCheck, cls: 'bg-sunken text-ink' },
  negativ: { label: 'Negativ', Icon: CircleX, cls: 'border border-line-strong bg-surface text-ink' },
  neclar: { label: 'Necunoscut', Icon: CircleHelp, cls: 'border border-dashed border-line-strong text-muted' },
};

function VerdictChip({ verdict, quote }: { verdict: CommitteeVerdict; quote: string | null }) {
  const { label, Icon, cls } = CHIP[verdict];
  return (
    <span title={quote ? `„${bare(quote)}”` : undefined} className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold leading-5 ${cls}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </span>
  );
}

const linkSmall = 'inline-flex min-h-8 items-center gap-1 underline underline-offset-4 hover:text-ink';

function Aviz({ committee, doc, sheetUrl, billId }: { committee: string; doc: CommitteeAviz | null; sheetUrl: string; billId: string }) {
  const pdf = doc?.pdfUrl ?? doc?.docUrl ?? null;
  const read = doc?.verdict != null;
  return (
    <div className="group/aviz">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {read && <VerdictChip verdict={doc!.verdict!} quote={doc!.verdictQuote} />}
        <span className="text-body">
          {doc?.docType === 'aviz comun' ? 'Aviz comun de la ' : 'Aviz de la '}
          {committee}
        </span>
      </p>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm leading-6 text-muted">
        {!read && <span>{doc?.unreadable === 'fără text' ? 'Aviz primit; textul PDF-ului nu se poate citi automat' : 'Aviz primit, nedescărcat încă'}</span>}
        {doc?.vote && <span>{doc.vote.statement}</span>}
        <a
          href={pdf ?? sheetUrl}
          target="_blank"
          rel="noopener noreferrer"
          {...trackAttrs('official_source_open', { bill_id: billId, source: pdf ? 'committee_aviz_pdf' : 'cdep_sheet' })}
          className={linkSmall}
        >
          {pdf ? (doc?.pdfUrl ? 'PDF pe cdep.ro' : 'Documentul pe cdep.ro') : 'Fișa pe cdep.ro'}
          <ExternalLink className="h-3 w-3" aria-hidden />
          <span className="sr-only">(se deschide într-o filă nouă)</span>
        </a>
        {doc?.verdictQuote && (
          <details className="group">
            <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-0.5 font-semibold text-link underline decoration-1 underline-offset-4 hover:decoration-2 [&::-webkit-details-marker]:hidden">
              Ce scrie în aviz
              <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
          </details>
        )}
      </div>
      {doc?.verdictQuote && (
        // Citatul stă sub rând, nu în <details>: așa rândul cu linkurile nu sare când se deschide.
        <blockquote className="mt-1.5 hidden rounded-xl bg-sunken px-3.5 py-2.5 text-sm leading-relaxed text-body group-has-[details[open]]/aviz:block">
          „{bare(doc.verdictQuote)}”
          {doc.vote && doc.vote.quote !== doc.verdictQuote && !doc.verdictQuote.includes(doc.vote.quote) && (
            <span className="mt-1 block">„{bare(doc.vote.quote)}”</span>
          )}
          <span className="mt-1.5 block text-xs text-muted">Formula din aviz, găsită automat în text{doc.textMethod && doc.textMethod !== 'text' ? ' (PDF scanat, citit cu OCR)' : ''}.</span>
        </blockquote>
      )}
    </div>
  );
}

const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

/** „Avize: 5 favorabile, 1 negativ, 2 așteptate”, din rândurile fișei și avizele citite. */
function Summary({ timeline, docs, hasReport }: { timeline: Row[]; docs: CommitteeAviz[]; hasReport: boolean }) {
  const s = avizSummary(timeline, docs);
  if (!s.received && !s.waiting.length) return null;
  const parts = [
    s.counts.favorabil && plural(s.counts.favorabil, 'favorabil', 'favorabile'),
    s.counts.favorabil_cu_amendamente && plural(s.counts.favorabil_cu_amendamente, 'favorabil cu amendamente', 'favorabile cu amendamente'),
    s.counts.negativ && plural(s.counts.negativ, 'negativ', 'negative'),
    s.counts.neclar && plural(s.counts.neclar, 'cu verdict necunoscut', 'cu verdict necunoscut'),
    s.unread && plural(s.unread, 'încă necitit', 'încă necitite'),
  ].filter(Boolean) as string[];
  // După raport, comisiile care n-au răspuns nu mai sunt așteptate: comisia de raport a putut decide fără ele.
  const waiting = s.waiting.length ? (hasReport ? `${s.waiting.length === 1 ? 'o comisie' : `${s.waiting.length} comisii`} fără aviz până la raport` : plural(s.waiting.length, 'așteptat', 'așteptate')) : null;
  return (
    <p className="text-[15px] leading-7 text-ink">
      <span className="font-semibold">Avizele comisiilor: </span>
      <span className="tabular-nums">{[...parts, waiting].filter(Boolean).join(', ') || 'niciunul primit încă'}</span>
      {s.waiting.length > 0 && <span className="block text-sm leading-6 text-muted">{hasReport ? 'Fără aviz' : 'Așteptăm avizul de la'}: {s.waiting.join('; ')}.</span>}
    </p>
  );
}

/**
 * Derularea procedurii de pe fișa Camerei. Rândurile „primire aviz de la:” spun ce aviz a dat fiecare comisie (citit de
 * scripts/straja-avize.mjs --comisii), cu PDF-ul și formula din document; deasupra, bilanțul avizelor.
 */
export default function ProcedureTimeline({ timeline, docs, sheetUrl, billId, hasReport }: { timeline: Row[]; docs: CommitteeAviz[]; sheetUrl: string; billId: string; hasReport: boolean }) {
  const hasAvize = timeline.some((t) => isAvizRow(t) || (t.camera === 'Camera Deputaților' && /^trimis pentru aviz la:/i.test(t.actiune)));
  return (
    <section aria-labelledby="procedura" className="mt-12">
      <h2 id="procedura" className="font-display text-2xl font-normal sm:text-3xl">
        Derularea procedurii
      </h2>
      {hasAvize && (
        <div className="mt-3 max-w-[68ch] space-y-1">
          <Summary timeline={timeline} docs={docs} hasReport={hasReport} />
          <p className="text-sm leading-6 text-muted">
            Avizele comisiilor sunt consultative: comisia care face raportul ține cont de ele și decide ce propune, iar plenul votează.
          </p>
        </div>
      )}
      <ol className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
        {timeline.map((t, i) => (
          <li key={`${t.data}-${i}`} className="grid gap-1 px-5 py-3 text-sm sm:grid-cols-[7rem_9rem_minmax(0,1fr)] sm:gap-4">
            <span className="tabular-nums text-muted">
              {shortDate(iso(t.data))} {t.data.slice(-4)}
            </span>
            <span className="text-muted">{t.camera ?? ''}</span>
            {isAvizRow(t) ? (
              <div className="min-w-0 space-y-2.5">
                {rowAvize(t, docs).map(({ committee, doc }) => (
                  <Aviz key={committee} committee={committee} doc={doc} sheetUrl={sheetUrl} billId={billId} />
                ))}
              </div>
            ) : (
              <span className="text-body">{t.actiune}</span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
