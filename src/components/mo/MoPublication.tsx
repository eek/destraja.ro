import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import type { MoLaw } from '@/lib/mo';
import { ruleInForce } from '@/lib/mo';
import { dayDiff } from '@/lib/cdep-text';
import { countWord } from '@/lib/format';
import { formatDateRo } from '@/lib/format';
import { linkCls, panel } from '@/components/ui';

const issue = (n: number, bis: boolean) => `nr. ${n}${bis ? ' bis' : ''}`;

/**
 * „Publicat în Monitorul Oficial”: numărul de Monitor, decretul, intrarea în vigoare și cât a durat de la votul final, din
 * indexul Portalului Legislativ (scripts/straja-mo.mjs). Când portalul n-a indexat legea, ci doar decretul ei de
 * promulgare, numărul vine de la decret și o spunem; data intrării în vigoare e atunci regula generală, marcată ca regulă.
 */
export default function MoPublication({ law, readOn }: { law: MoLaw; readOn: string }) {
  const fromDecree = law.moFrom === 'decret';
  const ruleDate = ruleInForce(law.mo.date);
  const inForce = law.inForceFrom;
  const voteDays = law.finalVoteOn ? dayDiff(law.mo.date, law.finalVoteOn) : null;
  const promulgationDays = law.promulgatedOn ? -dayDiff(law.promulgatedOn, law.mo.date) : null;

  const rows: { term: string; value: React.ReactNode; note?: React.ReactNode }[] = [
    {
      term: 'Monitorul Oficial',
      value: (
        <>
          Partea I, {issue(law.mo.number, law.mo.bis)} din {formatDateRo(law.mo.date)}
        </>
      ),
      note: fromDecree ? 'Numărul în care a apărut decretul de promulgare; legea și decretul se publică împreună. Legea însăși nu apare încă în indexul portalului.' : undefined,
    },
  ];
  if (law.decree)
    rows.push({
      term: 'Promulgată',
      value: (
        <>
          prin Decretul nr. {law.decree}
          {law.promulgatedOn && <>, pe {formatDateRo(law.promulgatedOn)}</>}
        </>
      ),
      note:
        promulgationDays === 0 ? 'Publicată în aceeași zi.' : promulgationDays && promulgationDays > 0 ? `Publicată după ${countWord(promulgationDays, 'zi', 'zile')}.` : undefined,
    });
  rows.push(
    inForce
      ? {
          term: 'Intrarea în vigoare',
          value: <>{formatDateRo(inForce)}</>,
          note:
            dayDiff(inForce, law.mo.date) === 3
              ? 'Potrivit indexului Portalului Legislativ: la 3 zile de la publicare, ca în regula generală.'
              : 'Potrivit indexului Portalului Legislativ; nu e regula celor 3 zile de la publicare.',
        }
      : {
          term: 'Intrarea în vigoare',
          value: <>regula generală: la 3 zile de la publicare, adică pe {formatDateRo(ruleDate)}</>,
          note: 'Dacă legea nu prevede o dată ulterioară (art. 78 din Constituție). Data din lege nu apare încă la noi: e regula, nu data actului.',
        },
  );
  if (voteDays !== null && voteDays >= 0)
    rows.push({
      term: 'De la votul final',
      value: <>{countWord(voteDays, 'zi', 'zile')} până la publicare</>,
      note: `Votul final: ${formatDateRo(law.finalVoteOn!)}, potrivit fișei Camerei${fromDecree ? '; publicarea, după numărul decretului' : ''}.`,
    });

  return (
    <section aria-labelledby="publicat-mo" className={`${panel} mt-6 p-6 sm:p-8`}>
      <h2 id="publicat-mo" className="font-display text-[1.875rem] font-normal leading-tight text-ink">
        Publicat în Monitorul Oficial
      </h2>
      <p className="mt-2 text-[15px] leading-7 text-body">
        <span className="font-semibold text-ink">Legea nr. {law.law}</span>
        {law.title && <> {law.title}</>}
      </p>
      <dl className="mt-5 divide-y divide-line border-y border-line">
        {rows.map((r) => (
          <div key={r.term} className="grid gap-x-6 gap-y-0.5 py-3 sm:grid-cols-[11rem_1fr]">
            <dt className="text-sm text-muted">{r.term}</dt>
            <dd className="text-[15px] leading-7 text-ink">
              <span className="font-semibold tabular-nums">{r.value}</span>
              {r.note && <span className="block text-sm leading-6 text-muted">{r.note}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {law.url && (
          <a href={law.url} target="_blank" rel="noopener noreferrer" className={`${linkCls} inline-flex min-h-11 items-center gap-1`}>
            Textul publicat, pe legislatie.just.ro <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
        {law.consolidatedUrl && (
          <a href={law.consolidatedUrl} target="_blank" rel="noopener noreferrer" className={`${linkCls} inline-flex min-h-11 items-center gap-1`}>
            Forma consolidată, la zi <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
        {law.decreeUrl && (
          <a href={law.decreeUrl} target="_blank" rel="noopener noreferrer" className={`${linkCls} inline-flex min-h-11 items-center gap-1`}>
            Decretul de promulgare, pe legislatie.just.ro <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
      </div>
      <p className="mt-4 text-xs leading-5 text-muted">
        Din indexul Portalului Legislativ (Ministerul Justiției), citit până pe {formatDateRo(readOn)}. Doar Monitorul Oficial tipărit e autentic.{' '}
        <Link href="/monitorul-oficial" className="underline underline-offset-4 hover:text-ink">
          Monitorul Oficial în cifre
        </Link>
      </p>
    </section>
  );
}
