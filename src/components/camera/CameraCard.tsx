import Link from 'next/link';
import { ArrowRight, Clock, ExternalLink, Landmark, Megaphone } from 'lucide-react';
import type { CdepListItem } from '@/lib/cdep';
import { dayDiff, shortCommittee, stageLabel } from '@/lib/cdep-text';
import { countWord, fmt } from '@/lib/format';
import { RISK } from '@/lib/risk';
import { trackAttrs } from '@/lib/analytics';
import { btnPrimary, btnSecondary } from '@/components/ui';
import BalanceBlock from '@/components/bills/BalanceBlock';
import { CardStrip, RiskChipFace, cardCls, cardLedeCls, cardTitleCls, riskChipCls } from '@/components/bills/card-parts';
import { TextChange } from './CameraShowcase';
import { longDate } from './CameraOverview';

/** Unde se citește proiectul pe site: la Senat, dacă a trecut prin consultare, altfel pe pagina lui de la Cameră. */
function pageOf(p: CdepListItem, withPage: Set<string>) {
  if (p.senat) return `/legi/${p.senat}`;
  return withPage.has(p.slug) ? `/camera/${p.slug}` : null;
}

const left = (d: number) => (d === 0 ? 'ultima zi azi' : d === 1 ? 'ultima zi mâine' : `mai ai ${countWord(d, 'zi', 'zile')}`);

// Cardul unui proiect de la Cameră: la fel ca cel de la Senat. Când Camera e prima sesizată și consultarea publică e
// deschisă, termenul și butonul sunt ale consultării; altfel, ale amendamentelor.
export default function CameraCard({ p, today, withPage }: { p: CdepListItem; today: string; withPage: Set<string> }) {
  const href = pageOf(p, withPage);
  const days = p.termenAmendamente ? dayDiff(p.termenAmendamente, today) : null;
  const consultDays = p.consultare ? dayDiff(p.consultare.termen, today) : null;
  const consulting = consultDays !== null && consultDays >= 0;
  const canAmend = days !== null && days >= 0;
  const level = p.risk?.level ?? null;
  const primary = (consulting || canAmend) && level === 'red';
  const title = p.risk?.plainTitle ?? p.titlu;
  const cta = consulting ? 'Trimite o propunere' : canAmend ? 'Propune un amendament' : 'Citește analiza';
  const deadline = consulting
    ? `Consultare publică: ${left(consultDays)}`
    : days === null
      ? stageLabel(p.stage)
      : days < 0
        ? `Amendamente închise pe ${longDate(p.termenAmendamente!)}`
        : days === 0
          ? 'Amendamente: ultima zi azi'
          : days === 1
            ? 'Amendamente: ultima zi mâine'
            : `Amendamente: mai ai ${countWord(days, 'zi', 'zile')}`;

  return (
    <article aria-labelledby={`t-${p.slug}`} className={cardCls}>
      <CardStrip level={level} dim={!canAmend && !consulting} />
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          {p.risk && href ? (
            <Link
              href={`${href}#modele`}
              aria-label={`${RISK[p.risk.level].label} ${fmt(p.risk.score)} din 10. De ce acest nivel de risc?`}
              {...trackAttrs('risk_reason_open', { bill_id: p.numar })}
              className={riskChipCls(p.risk.level)}
            >
              <RiskChipFace level={p.risk.level} score={p.risk.score} />
            </Link>
          ) : (
            <span className="inline-flex min-h-8 items-center rounded-full bg-sunken px-2.5 text-xs font-semibold text-muted">Fără analiză încă</span>
          )}
          <span className="text-xs font-medium tabular-nums text-muted">{p.numar}</span>
        </div>

        <h3 id={`t-${p.slug}`} className={cardTitleCls}>
          {href ? (
            <Link href={href} {...trackAttrs('bill_open', { bill_id: p.numar, source: 'camera_card' })} className="decoration-line-strong decoration-1 underline-offset-4 hover:underline">
              {title}
            </Link>
          ) : (
            <a href={p.url} target="_blank" rel="noopener noreferrer" className="decoration-line-strong decoration-1 underline-offset-4 hover:underline">
              {title}
              <ExternalLink className="ml-1.5 inline h-3.5 w-3.5 align-[-1px] text-muted" aria-hidden />
              <span className="sr-only">(fișa de pe cdep.ro, se deschide într-o filă nouă)</span>
            </a>
          )}
        </h3>
        <p className={cardLedeCls} title={p.risk ? p.risk.oneLiner : p.titlu}>
          {p.risk ? p.risk.oneLiner : p.titlu}
        </p>
        {p.risk && href && (
          <BalanceBlock balance={p.balance} level={p.risk.level} score={p.risk.score} href={href} className="mt-4 border-t border-line pt-4" />
        )}

        {/* Ca la Senat: etichetele stau lipite de subsol, ca un rând de carduri să aibă aceeași înălțime. */}
        <div className="mt-auto space-y-2 pt-4">
          {consulting && (
            <p className="inline-flex min-h-7 items-center gap-1.5 rounded-md bg-brand-soft px-2 text-xs font-semibold text-ink">
              <Megaphone className="h-3.5 w-3.5" aria-hidden />
              În consultare publică · {p.consultare!.propuneri === 0 ? 'nicio propunere trimisă încă' : countWord(p.consultare!.propuneri, 'propunere trimisă', 'propuneri trimise')}
            </p>
          )}
          {p.textChange && (
            <p className="text-xs">
              <TextChange p={p} />
            </p>
          )}
          {p.raport.length > 0 && (
            <p className="inline-flex min-h-7 items-start gap-1.5 text-xs font-semibold leading-5 text-body">
              <Landmark className="mt-[3px] h-3.5 w-3.5 shrink-0" aria-hidden />
              {p.raport.length === 1 ? 'Raportul: ' : 'Rapoartele: '}
              {p.raport.map(shortCommittee).join(', ')}
            </p>
          )}
        </div>

        <div className="pt-3">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-line pt-4 text-xs">
            <span
              className={`inline-flex items-center gap-1.5 font-semibold ${
                consulting ? (consultDays! <= 1 ? 'text-risk-red-text' : 'text-ink') : canAmend ? (days! <= 1 ? 'text-risk-red-text' : 'text-ink') : 'text-muted'
              }`}
            >
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {deadline}
            </span>
            {p.initiator && <span className="font-semibold text-muted">{p.initiator}</span>}
          </div>

          {href ? (
            <Link
              href={p.senat ? href : consulting ? `${href}#consultare` : canAmend ? `${href}#actiune` : href}
              {...trackAttrs('bill_open', { bill_id: p.numar, source: 'camera_card_cta' })}
              className={`${primary ? btnPrimary : btnSecondary} mt-4 min-h-11 w-full px-4 text-sm`}
              aria-label={`${cta}: ${title}`}
            >
              {cta}
              <ArrowRight className="h-4 w-4 transition-transform group-hover/card:translate-x-0.5" aria-hidden />
            </Link>
          ) : (
            <a href={p.url} target="_blank" rel="noopener noreferrer" className={`${btnSecondary} mt-4 min-h-11 w-full px-4 text-sm`}>
              Fișa pe cdep.ro
              <ExternalLink className="h-4 w-4" aria-hidden />
              <span className="sr-only">(se deschide într-o filă nouă)</span>
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
