import Link from 'next/link';
import { ChevronDown, ExternalLink } from 'lucide-react';
import type { Amendment, AmendmentAuthor, BillAmendments as Data } from '@/lib/types';
import { mpKey } from '@/lib/stats';
import { panel } from '@/components/ui';
import { EFFECT, Mark } from './effect';

const SHOWN_AUTHORS = 3;

/** Un autor: numele de pe site (cu link spre pagina lui, dacă are una) și partidul, cum apare în raport. */
function Author({ a, pages }: { a: AmendmentAuthor; pages: Set<string> }) {
  const name = a.site ?? a.name;
  const slug = a.site ? mpKey(a.site) : null;
  return (
    <>
      {slug && pages.has(slug) ? (
        <Link href={`/parlamentari/${slug}`} className="font-semibold text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
          {name}
        </Link>
      ) : (
        <span className="font-semibold text-ink">{name}</span>
      )}
      {a.party && <span className="text-muted"> ({a.party})</span>}
    </>
  );
}

/** „A, B și încă 4” sau „comisia”, pentru unul sau mai multe amendamente. */
function Byline({ list, pages }: { list: Amendment[]; pages: Set<string> }) {
  const seen = new Set<string>();
  const authors = list.flatMap((a) => a.authors).filter((a) => !seen.has(a.site ?? a.name) && seen.add(a.site ?? a.name));
  if (!authors.length) {
    const committee = list.find((a) => a.byCommittee)?.byCommittee;
    return <span className="font-semibold text-ink">{!committee || /membrii/i.test(committee) ? 'membrii comisiei' : committee}</span>;
  }
  const shown = authors.slice(0, SHOWN_AUTHORS);
  const more = authors.length - shown.length;
  return (
    <>
      {shown.map((a, i) => (
        <span key={a.site ?? a.name}>
          {i > 0 && (i === shown.length - 1 && !more ? ' și ' : ', ')}
          <Author a={a} pages={pages} />
        </span>
      ))}
      {more > 0 && ` și încă ${more}`}
    </>
  );
}

/** Sub o schimbare din „Cum s-a schimbat pe drum”: cine a propus-o. */
export function AmendmentCredit({ list, pages }: { list: Amendment[]; pages: Set<string> }) {
  return (
    <p className="mt-1.5 text-sm leading-6 text-body">
      {list.length === 1 ? 'Din amendamentul propus de ' : 'Din amendamentele propuse de '}
      <Byline list={list} pages={pages} />
    </p>
  );
}

function Item({ a, pages }: { a: Amendment; pages: Set<string> }) {
  // Un amendament admis poate face textul și mai bun, și mai rău; arătăm direcția doar când e una singură.
  const effect = a.status === 'admis' && a.effects?.length === 1 ? a.effects[0] : null;
  return (
    <li className="flex gap-3 py-3">
      <span className="mt-[7px] w-3">{effect && <Mark effect={effect} />}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">
          <span className={`font-semibold ${a.status === 'admis' ? 'text-ink' : ''}`}>{a.status === 'admis' ? 'Admis' : 'Respins'}</span>
          {a.article && ` · ${a.article}`}
          {effect && effect !== 'neutru' && <span className={`font-semibold ${EFFECT[effect].text}`}> · textul a ieșit {EFFECT[effect].label}</span>}
        </p>
        <p className="mt-0.5 text-[15px] leading-6 text-ink">{a.summary}</p>
        <p className="mt-0.5 text-sm leading-6 text-body">
          Propus de <Byline list={[a]} pages={pages} />
        </p>
      </div>
    </li>
  );
}

const plural = (n: number, one: string, many: string) => (n === 1 ? `un amendament ${one}` : `${n} amendamente ${many}`);

// Amendamentele din raportul comisiei, cu autorii lor: cine a dus proiectul în forma de acum. Cele respinse stau
// strânse; și ele arată cine a încercat să schimbe textul.
export default function BillAmendments({ data, pages }: { data: Data; pages: Set<string> }) {
  const admitted = data.amendments.filter((a) => a.status === 'admis');
  const rejected = data.amendments.filter((a) => a.status === 'respins');
  if (!admitted.length && !rejected.length) return null;
  return (
    <section id="amendamente" aria-labelledby="amendamente-titlu" className={`${panel} mt-6 scroll-mt-20 p-6 sm:p-7`}>
      <h2 id="amendamente-titlu" className="text-base font-semibold text-ink">
        Cine a propus schimbările
      </h2>
      <p className="mt-2 max-w-[68ch] text-[15px] leading-7 text-body">
        În raportul comisiei: {plural(admitted.length, 'admis', 'admise')}
        {rejected.length > 0 && ` și ${rejected.length === 1 ? 'unul respins' : `${rejected.length} respinse`}`}. Amendamentele le depun parlamentarii; aici vezi cine a
        propus fiecare.
      </p>
      {admitted.length > 0 && (
        <ul className="mt-3 divide-y divide-line">
          {admitted.map((a, i) => (
            <Item key={`${a.nr}-${i}`} a={a} pages={pages} />
          ))}
        </ul>
      )}
      {rejected.length > 0 && (
        <details className="group mt-2 border-t border-line pt-3">
          <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
            {rejected.length === 1 ? 'Arată amendamentul respins' : `Arată cele ${rejected.length} respinse`}
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <ul className="divide-y divide-line">
            {rejected.map((a, i) => (
              <Item key={`${a.nr}-${i}`} a={a} pages={pages} />
            ))}
          </ul>
        </details>
      )}
      <p className="mt-4 border-t border-line pt-3 text-xs leading-5 text-muted">
        Lista e scoasă de Gemini din{' '}
        {data.reports.map((url, i) => (
          <span key={url}>
            {i > 0 && ', '}
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-ink">
              {data.reports.length === 1 ? 'raportul comisiei' : `raportul ${i + 1}`}
              <ExternalLink className="h-3 w-3" aria-hidden />
              <span className="sr-only">(PDF pe cdep.ro, se deschide într-o filă nouă)</span>
            </a>
          </span>
        ))}
        . Numele și partidele sunt cele scrise acolo.
      </p>
    </section>
  );
}
