import { ArrowRight, ChevronDown, ExternalLink } from 'lucide-react';
import type { BillVersion, BillVersions as Versions, RemainingItem, VersionChange, VersionItem } from '@/lib/types';
import { MODELS } from '@/lib/site';
import { RISK } from '@/lib/risk';
import { fmt } from '@/lib/format';
import { RiskChip, panel } from '@/components/ui';

type Key = BillVersion['key'];
type Effect = VersionItem['effect'];

// Direcția se citește și fără culori: pătrat = mai rău, cerc = mai bine, romb = neutru (roșul și verdele site-ului se
// confundă pentru cine nu deosebește culorile).
const EFFECT: Record<Effect, { label: string; text: string; mark: string }> = {
  mai_rau: { label: 'mai rău', text: 'text-risk-red-text', mark: 'rounded-[3px] bg-risk-red' },
  mai_bine: { label: 'mai bine', text: 'text-risk-green-text', mark: 'rounded-full bg-risk-green' },
  neutru: { label: 'neutru', text: 'text-muted', mark: 'rotate-45 scale-[0.8] rounded-[2px] bg-faint' },
};
const AT: Record<Key, string> = { initiator: 'La inițiator', senat: 'La Senat', camera: 'La Cameră' };
const FORM: Record<Key, string> = { initiator: 'forma inițiatorului', senat: 'forma Senatului', camera: 'forma Camerei' };
const STEP: Record<Key, string> = { initiator: 'Inițiator', senat: 'Senat', camera: 'Cameră' };
const WHO: Record<Key, string> = { initiator: 'inițiatorul', senat: 'Senatul', camera: 'Camera' };

const count = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);
/** La fel, dar „nicio problemă majoră” în loc de „0 probleme majore”. */
const countOrNone = (n: number, one: string, many: string, none: string) => (n === 0 ? none : count(n, one, many));
const sentence = (s: string) => (/[.!?…]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

function Mark({ effect, big = false }: { effect: Effect; big?: boolean }) {
  return <span aria-hidden className={`inline-block shrink-0 ${big ? 'h-4 w-4' : 'h-3 w-3'} ${EFFECT[effect].mark}`} />;
}

/** „3 în rău · 1 în bine”, colorat; fără tipurile care lipsesc. */
function EffectCounts({ items }: { items: { effect: Effect }[] }) {
  const parts = (['mai_rau', 'mai_bine', 'neutru'] as const)
    .map((e) => [e, items.filter((i) => i.effect === e).length] as const)
    .filter(([, n]) => n > 0);
  return (
    <>
      {parts.map(([e, n], i) => (
        <span key={e}>
          {i > 0 && ' · '}
          <b className={`font-semibold ${EFFECT[e].text}`}>{e === 'neutru' ? count(n, 'neutră', 'neutre') : `${n} ${e === 'mai_rau' ? 'în rău' : 'în bine'}`}</b>
        </span>
      ))}
    </>
  );
}

/** Textul de dinainte și de acum, cum apare în cele două forme oficiale. */
function Quotes({ item, from, to }: { item: VersionItem; from: Key; to: Key }) {
  const side = (label: string, form: Key, quote: string | null | undefined, missing: string, strong: boolean) => (
    <figure className="rounded-lg bg-sunken p-3">
      <figcaption className="text-xs font-semibold text-muted">
        {label} · {FORM[form]}
      </figcaption>
      {quote ? (
        <blockquote className={`mt-1 text-sm leading-6 ${strong ? 'text-ink' : 'text-body'}`}>„{quote}”</blockquote>
      ) : (
        <p className="mt-1 text-sm italic leading-6 text-muted">{missing}</p>
      )}
    </figure>
  );
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {side('Înainte', from, item.before, `Prevederea nu exista în ${FORM[from]}.`, false)}
      {side('Acum', to, item.after, `Prevederea a fost scoasă din ${FORM[to]}.`, true)}
    </div>
  );
}

const hasQuotes = (i: VersionItem) => Boolean(i.before || i.after);
const summaryCls =
  'inline-flex min-h-8 cursor-pointer list-none items-center gap-1 text-sm font-semibold text-link underline decoration-1 underline-offset-4 hover:decoration-2 [&::-webkit-details-marker]:hidden';

/** O schimbare majoră: titlul, explicația și, la prima, citatele deschise. */
function MajorChange({ item, from, to, open }: { item: VersionItem; from: Key; to: Key; open: boolean }) {
  return (
    <li className="flex gap-3 py-4 first:pt-1">
      <span className="mt-1">
        <Mark effect={item.effect} big />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-semibold ${EFFECT[item.effect].text}`}>
          {EFFECT[item.effect].label}
          {item.article && <span className="font-normal text-muted"> · {item.article}</span>}
        </p>
        <h4 className="mt-0.5 text-[15px] font-semibold leading-6 text-ink">{item.title || item.text}</h4>
        {item.title && <p className="mt-1 text-[15px] leading-7 text-body">{item.text}</p>}
        {hasQuotes(item) &&
          (open ? (
            <Quotes item={item} from={from} to={to} />
          ) : (
            <details className="group mt-1">
              <summary className={summaryCls}>
                Ce scrie în lege
                <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <Quotes item={item} from={from} to={to} />
            </details>
          ))}
      </div>
    </li>
  );
}

/** O schimbare minoră: un rând, cu explicația și citatele la cerere. */
function MinorChange({ item, from, to }: { item: VersionItem; from: Key; to: Key }) {
  return (
    <li className="flex gap-3 py-2">
      <span className="mt-[7px]">
        <Mark effect={item.effect} />
      </span>
      <details className="group min-w-0 flex-1">
        <summary className="cursor-pointer list-none text-[15px] leading-6 text-ink [&::-webkit-details-marker]:hidden">
          {item.title || item.text} <span className="sr-only">({EFFECT[item.effect].label})</span>
          <ChevronDown className="ml-1 inline h-3.5 w-3.5 text-muted transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        {item.title && <p className="mt-1 text-sm leading-6 text-body">{item.text}</p>}
        {hasQuotes(item) && <Quotes item={item} from={from} to={to} />}
      </details>
    </li>
  );
}

function RemainingList({ items, effect, title, empty }: { items: RemainingItem[]; effect: Effect; title: string; empty: string }) {
  return (
    <div>
      <p className={`flex items-center gap-2 text-sm font-semibold ${EFFECT[effect].text}`}>
        <Mark effect={effect} />
        {title}
      </p>
      {items.length ? (
        <ul className="mt-2 space-y-1.5 border-l border-line pl-3 text-sm leading-6 text-body">
          {items.map((r, i) => (
            <li key={i}>
              {r.text}
              {r.article && <span className="text-muted"> · {r.article}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      )}
    </div>
  );
}

/** Comparația pe care o arătăm mare: ultima trecere care a schimbat ceva de fond (altfel ultima). */
function mainChange(changes: VersionChange[]) {
  return [...changes].reverse().find((c) => c.direction !== 'la_fel') ?? changes.at(-1)!;
}

/** Formele prin care a trecut textul și ce s-a schimbat de la una la alta. */
export default function BillVersions({ data }: { data: Versions }) {
  const { versions, changes } = data;
  const byKey = Object.fromEntries(versions.map((v) => [v.key, v])) as Partial<Record<Key, BillVersion>>;
  if (!changes.length) return null;
  const main = mainChange(changes);
  const from = byKey[main.from];
  const to = byKey[main.to];
  if (!from || !to) return null;

  // Comparațiile vechi (schema 1) n-au importanța schimbărilor: atunci le arătăm pe toate ca majore.
  const weighted = main.changes.some((c) => c.major !== undefined);
  const majors = weighted ? main.changes.filter((c) => c.major) : main.changes;
  const minors = weighted ? main.changes.filter((c) => !c.major) : [];
  // Ce e acum în lege: inventarul formei celei mai noi.
  const remaining = changes.at(-1)!.remaining ?? (main === changes.at(-1) ? main.remaining : undefined);
  const pm = remaining?.problems.filter((r) => r.major) ?? [];
  const gm = remaining?.good.filter((r) => r.major) ?? [];
  const minorLeft = remaining ? remaining.problems.length - pm.length + remaining.good.length - gm.length : 0;
  const earlier = changes.filter((c) => c !== main);
  const tacit = (c: VersionChange) => c.direction === 'la_fel' && /tacit/i.test(c.summary);

  const latest = versions.at(-1)!;
  const improving = main.direction === 'mai_putin_riscant';
  const worsening = main.direction === 'mai_riscant';
  // Scorul și comparația pot spune lucruri diferite: scorul privește toată legea, comparația doar ce s-a schimbat.
  const mismatch = (improving && to.riskScore > from.riskScore) || (worsening && to.riskScore < from.riskScore);
  const quoted = main.changes.some(hasQuotes);

  return (
    <section aria-labelledby="versiuni" className={`${panel} mt-6 p-6 sm:p-7`}>
      <h2 id="versiuni" className="text-base font-semibold text-ink">
        Cum s-a schimbat pe drum
      </h2>

      <p className="mt-3 font-display text-2xl leading-snug text-ink [text-wrap:balance] sm:text-[1.7rem]">
        {main.direction === 'la_fel' ? (
          'Pe drum, textul nu s-a schimbat pe fond.'
        ) : (
          <>
            {AT[main.to]}, proiectul a devenit{' '}
            <span className={worsening ? 'text-risk-red-text' : 'text-risk-green-text'}>{worsening ? 'mai riscant' : 'mai puțin riscant'}</span>
            {improving && latest.riskLevel !== 'green' ? `, dar rămâne cu ${RISK[latest.riskLevel].label.toLowerCase()}.` : '.'}
          </>
        )}
      </p>
      {(main.headline || main.summary) && <p className="mt-2 max-w-[68ch] text-[15px] leading-7 text-body">{sentence(main.headline || main.summary)}</p>}

      <ol className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-body" aria-label="Formele textului">
        {versions.map((v, i) => {
          const c = changes.find((x) => x.to === v.key);
          return (
            <li key={v.key} className="flex items-center gap-2">
              {i > 0 && c && (
                <>
                  <ArrowRight className="h-3.5 w-3.5 text-faint" aria-hidden />
                  <span className={c.direction === 'mai_riscant' ? 'font-semibold text-risk-red-text' : c.direction === 'mai_putin_riscant' ? 'font-semibold text-risk-green-text' : 'text-muted'}>
                    {c.direction === 'mai_riscant' ? 'mai riscant' : c.direction === 'mai_putin_riscant' ? 'mai puțin riscant' : tacit(c) ? 'neschimbat, adoptat tacit' : 'neschimbat pe fond'}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-faint" aria-hidden />
                </>
              )}
              <a href={v.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline decoration-line-strong decoration-1 underline-offset-4 hover:decoration-ink">
                {STEP[v.key]}
                <span className="sr-only">: {v.label}, textul pe {v.source}</span>
              </a>
            </li>
          );
        })}
      </ol>

      {(main.changes.length > 0 || remaining) && (
        <dl className="mt-5 divide-y divide-line rounded-xl bg-sunken px-4">
          {main.changes.length > 0 && (
            <div className="py-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Ce a schimbat {WHO[main.to]}</dt>
              <dd className="mt-1.5 flex flex-wrap items-center gap-1">
                {majors.map((c, i) => (
                  <Mark key={i} effect={c.effect} big />
                ))}
                {minors.length > 0 && <span className="ml-1.5 text-sm text-muted">+{count(minors.length, 'minoră', 'minore')}</span>}
              </dd>
              <dd className="mt-1 text-sm text-body">
                {weighted ? `${count(majors.length, 'schimbare majoră', 'schimbări majore')}: ` : `${count(majors.length, 'schimbare', 'schimbări')}: `}
                <EffectCounts items={majors} />
              </dd>
            </div>
          )}
          {remaining && (
            <div className="py-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Ce rămâne în lege</dt>
              <dd className="mt-1.5 flex flex-wrap items-center gap-1">
                {pm.map((_, i) => (
                  <Mark key={`p${i}`} effect="mai_rau" big />
                ))}
                {gm.map((_, i) => (
                  <Mark key={`g${i}`} effect="mai_bine" big />
                ))}
                {minorLeft > 0 && <span className="ml-1.5 text-sm text-muted">+{minorLeft} minore</span>}
              </dd>
              <dd className="mt-1 text-sm text-body">
                <b className="font-semibold text-risk-red-text">{countOrNone(pm.length, 'problemă majoră', 'probleme majore', 'nicio problemă majoră')}</b> ·{' '}
                <b className="font-semibold text-risk-green-text">{countOrNone(gm.length, 'parte bună majoră', 'părți bune majore', 'nicio parte bună majoră')}</b>
              </dd>
            </div>
          )}
        </dl>
      )}

      {majors.length > 0 && (
        <>
          <h3 className="mt-7 text-sm font-semibold text-ink">{weighted ? 'Schimbările majore' : 'Schimbările'}</h3>
          <ul className="mt-2 divide-y divide-line">
            {majors.map((c, i) => (
              <MajorChange key={i} item={c} from={main.from} to={main.to} open={i === 0} />
            ))}
          </ul>
        </>
      )}
      {minors.length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-semibold text-ink">Schimbări minore</h3>
          <ul className="mt-1">
            {minors.map((c, i) => (
              <MinorChange key={i} item={c} from={main.from} to={main.to} />
            ))}
          </ul>
        </>
      )}

      {earlier.length > 0 && (
        <div className="mt-6 space-y-3 border-t border-line pt-5">
          {earlier.map((c) => (
            <div key={`${c.from}-${c.to}`} className="text-[15px] leading-7 text-body">
              <p className="flex items-start gap-3">
                <span className="mt-[9px]">
                  <Mark effect={c.direction === 'mai_riscant' ? 'mai_rau' : c.direction === 'mai_putin_riscant' ? 'mai_bine' : 'neutru'} />
                </span>
                <span>
                  <b className="font-semibold text-ink">
                    De la {FORM[c.from]} la {FORM[c.to]}:{' '}
                    {c.direction === 'mai_riscant' ? 'mai riscant' : c.direction === 'mai_putin_riscant' ? 'mai puțin riscant' : tacit(c) ? 'neschimbat, adoptat tacit' : 'neschimbat pe fond'}.
                  </b>{' '}
                  {c.summary}
                </span>
              </p>
              {c.changes.length > 0 && (
                <details className="group ml-6">
                  <summary className={summaryCls}>
                    {count(c.changes.length, 'schimbare', 'schimbări')}
                    <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <ul className="mt-1">
                    {c.changes.map((x, i) => (
                      <MinorChange key={i} item={x} from={c.from} to={c.to} />
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ))}
        </div>
      )}

      {remaining && (
        <div className="mt-6 border-t border-line pt-5">
          <h3 className="text-sm font-semibold text-ink">Ce rămâne în lege</h3>
          <div className="mt-3 grid gap-5 sm:grid-cols-2">
            <RemainingList items={pm} effect="mai_rau" title="Probleme majore" empty="Nicio problemă majoră." />
            <RemainingList items={gm} effect="mai_bine" title="Părți bune majore" empty="Nicio parte bună majoră." />
          </div>
          {minorLeft > 0 && (
            <details className="group mt-3">
              <summary className={summaryCls}>
                {count(remaining.problems.length - pm.length, 'problemă minoră', 'probleme minore')} și{' '}
                {count(remaining.good.length - gm.length, 'parte bună minoră', 'părți bune minore')}
                <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <div className="mt-3 grid gap-5 sm:grid-cols-2">
                <RemainingList items={remaining.problems.filter((r) => !r.major)} effect="mai_rau" title="Probleme minore" empty="Niciuna." />
                <RemainingList items={remaining.good.filter((r) => !r.major)} effect="mai_bine" title="Părți bune minore" empty="Niciuna." />
              </div>
            </details>
          )}
        </div>
      )}

      <div className="mt-6 border-t border-line pt-5">
        <h3 className="text-sm font-semibold text-ink">Cât de siguri suntem</h3>
        <dl className="mt-3 grid gap-4 text-sm leading-6 sm:grid-cols-3">
          <div>
            <dt className="font-semibold text-ink">Ce s-a schimbat: sigur</dt>
            <dd className="mt-0.5 text-body">
              {quoted
                ? 'Citatele sunt copiate din textele oficiale ale formelor și verificate automat, cuvânt cu cuvânt.'
                : 'Comparația e făcută pe textele oficiale ale formelor, pe care le poți deschide mai sus.'}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Mai bine sau mai rău: judecată</dt>
            <dd className="mt-0.5 text-body">Evaluarea unui model AI (Claude), pe diferențele dintre texte. Cu citatele poți verifica singur.</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Scorul de risc: orientativ</dt>
            <dd className="mt-0.5 text-body">
              Privește toată legea, nu doar ce s-a schimbat, iar două analize ale aceluiași text pot diferi cu până la un punct.
              {mismatch &&
                ` Aici scorul a ${to.riskScore > from.riskScore ? 'crescut' : 'scăzut'} de la ${fmt(from.riskScore)} la ${fmt(to.riskScore)}, deși schimbările sunt mai mult ${improving ? 'în bine' : 'în rău'}: scorul cuprinde și ce a rămas nerezolvat.`}
            </dd>
          </div>
        </dl>
      </div>

      <details className="group mt-5 border-t border-line pt-4">
        <summary className={summaryCls}>
          Scorurile celor trei modele, pe fiecare formă
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <ul className="mt-3 divide-y divide-line">
          {versions.map((v) => {
            const scored = MODELS.filter((m) => v.scores[m.key] !== null).length;
            return (
              <li key={v.key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
                <span className="min-w-36 text-sm font-semibold text-ink">{v.label}</span>
                <RiskChip level={v.riskLevel} score={v.riskScore} />
                <span className="text-xs tabular-nums text-muted">
                  {MODELS.map((m) => `${m.name} ${v.scores[m.key] === null ? '–' : fmt(v.scores[m.key]!)}`).join(' · ')}
                  {scored < MODELS.length && ` (media a ${scored} din ${MODELS.length})`}
                </span>
                <a href={v.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1 text-xs text-muted underline underline-offset-4 hover:text-ink">
                  Textul, pe {v.source}
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}
