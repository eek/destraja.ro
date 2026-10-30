import { Check, X } from 'lucide-react';
import type { BalanceItem, BillBalance as Balance, RiskLevel } from '@/lib/types';
import { summarize } from '@/lib/balance-summary';
import { BalanceBar, balanceVerdict } from './BalanceBlock';
import { RISK } from '@/lib/risk';
import { fmt } from '@/lib/format';

const SHOWN = 3;
const MODEL_NAME: Record<string, string> = { agy: 'Gemini 4 Argon', claude: 'Claude Opus 5.5', codex: 'ChatGPT (GPT-6.1 Sol)' };

function Item({ item, kind }: { item: BalanceItem; kind: 'good' | 'bad' }) {
  return (
    <li className="grid grid-cols-[20px_minmax(0,1fr)] gap-2.5 py-3">
      {kind === 'good' ? (
        <Check className="mt-1 h-4 w-4 text-risk-green-text" strokeWidth={3} aria-label="Bine" />
      ) : (
        <X className="mt-1 h-4 w-4 text-risk-red-text" strokeWidth={3} aria-label="Problemă" />
      )}
      <div className="min-w-0">
        <p className={`text-[15.5px] leading-relaxed text-ink ${item.weight === 3 ? 'font-semibold' : ''}`}>{item.text}</p>
        {item.quote ? (
          <details className="group mt-1">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[13px] text-muted underline decoration-line-strong underline-offset-4 hover:text-ink [&::-webkit-details-marker]:hidden">
              {item.article ?? 'În text'} · <span className="group-open:hidden">ce scrie în lege</span>
              <span className="hidden group-open:inline">ascunde</span>
            </summary>
            <blockquote className="mt-2 border-l-2 border-line-strong pl-3 text-sm leading-relaxed text-body">„{item.quote}”</blockquote>
          </details>
        ) : (
          item.article && <p className="mt-1 text-[13px] text-muted">{item.article}</p>
        )}
      </div>
    </li>
  );
}

function Column({ items, kind }: { items: BalanceItem[]; kind: 'good' | 'bad' }) {
  const title = kind === 'good' ? 'Ce e bine' : 'Ce strică';
  return (
    <div className={`border-t-[3px] pt-3 ${kind === 'good' ? 'border-risk-green' : 'border-risk-red'}`}>
      <h3 className="font-display text-lg font-semibold text-ink">
        {title} <span className="font-sans text-sm font-normal text-muted tabular-nums">{items.length}</span>
      </h3>
      {items.length ? (
        <>
          <ul className="divide-y divide-line">
            {items.slice(0, SHOWN).map((it, i) => (
              <Item key={i} item={it} kind={kind} />
            ))}
          </ul>
          {items.length > SHOWN && (
            <details className="group">
              <summary className="mt-1 inline-flex min-h-10 cursor-pointer list-none items-center text-sm font-semibold text-link underline underline-offset-4 [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">Arată toate cele {items.length}</span>
                <span className="hidden group-open:inline">Arată mai puține</span>
              </summary>
              <ul className="divide-y divide-line border-t border-line">
                {items.slice(SHOWN).map((it, i) => (
                  <Item key={i} item={it} kind={kind} />
                ))}
              </ul>
            </details>
          )}
        </>
      ) : (
        <p className="py-3 text-[15px] text-muted">{kind === 'good' ? 'N-am găsit prevederi bune în text.' : 'N-am găsit probleme în text.'}</p>
      )}
    </div>
  );
}

// Ce e bine și ce strică tot: toate prevederile, primele trei la vedere, plus schimbarea care ar face proiectul acceptabil.
export default function BillBalance({ data, level }: { data: Balance; level: RiskLevel }) {
  const after = data.fix?.levelAfter;
  const sum = summarize(data);
  return (
    <section aria-labelledby="bine-rau" className="mt-6 rounded-2xl border border-line bg-surface p-6 sm:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="bine-rau" className="font-display text-2xl font-semibold text-ink sm:text-[1.75rem]">
          Ce e bine și ce strică
        </h2>
        <p className="text-sm font-semibold tabular-nums">
          <span className={data.good.length ? 'text-risk-green-text' : 'text-muted'}>{data.good.length === 1 ? '1 lucru bun' : `${data.good.length} lucruri bune`}</span>
          <span className="text-muted"> · </span>
          <span className="text-risk-red-text">{data.bad.length === 1 ? '1 problemă' : `${data.bad.length} probleme`}</span>
        </p>
      </div>
      <p className="mt-3 text-lg font-bold text-ink">{balanceVerdict(sum, level)}</p>
      <BalanceBar b={sum} />
      {data.summary && <p className="mt-3 max-w-[70ch] text-base leading-relaxed text-body">{data.summary}</p>}
      <div className="mt-5 grid gap-6 md:grid-cols-2 md:gap-8">
        <Column items={data.good} kind="good" />
        <Column items={data.bad} kind="bad" />
      </div>
      {data.fix && (
        <div className="mt-6 rounded-2xl bg-band p-5 text-on-band sm:p-6">
          <h3 className="font-display text-lg font-semibold text-on-band">O schimbare care l-ar face acceptabil</h3>
          <p className="mt-2 text-[15.5px] leading-relaxed">{data.fix.text}</p>
          {after && (
            <p className="mt-2 text-sm text-on-band-muted">
              Ce ar rămâne: {RISK[after].label.toLowerCase()}
              {data.fix.scoreAfter !== null && `, cam ${fmt(data.fix.scoreAfter)} din 10`} (estimare).
            </p>
          )}
        </div>
      )}
      <p className="mt-4 text-xs leading-5 text-muted">
        Lista e făcută de {MODEL_NAME[data.model] ?? data.model} din textul proiectului. Citatele sunt verificate automat, cuvânt cu cuvânt, în text.
      </p>
    </section>
  );
}
