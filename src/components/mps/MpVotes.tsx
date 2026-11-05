import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import type { MpVote } from '@/lib/votes';
import type { VoteChoice } from '@/lib/types';
import { voteLabel } from '@/lib/vote-text';
import { shortDate } from '@/lib/cdep-text';
import { countWord } from '@/lib/format';
import { RiskChip, panel } from '@/components/ui';

const SHOWN = 12;
// Aceleași culori ca în „Cum s-a votat” de pe pagina proiectului; textul spune votul, culoarea doar îl repetă.
const DOT: Record<VoteChoice, string> = {
  pentru: 'bg-brand',
  contra: 'bg-cross',
  abtinere: 'bg-faint',
  'nu a votat': 'bg-line-strong',
  'fără vot': 'bg-line',
};

function Row({ v }: { v: MpVote }) {
  return (
    <li>
      <Link href={v.href} className="group grid gap-x-4 gap-y-1 px-4 py-3.5 transition-colors hover:bg-sunken/50 sm:grid-cols-[5.5rem_minmax(0,1fr)_11rem] sm:items-baseline sm:px-6">
        <span className="text-xs tabular-nums text-muted">
          {shortDate(v.date)} {v.date.slice(0, 4)}
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="font-semibold tabular-nums text-ink">{v.billNumber}</span>
            {v.risk && <RiskChip level={v.risk.level} score={v.risk.score} />}
          </span>
          <span className="mt-1 line-clamp-2 block text-[15px] font-semibold leading-6 text-ink group-hover:underline group-hover:underline-offset-4">{v.title}</span>
        </span>
        <span className="flex items-center gap-2 text-sm font-semibold text-ink sm:justify-end">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[v.vote]}`} aria-hidden />
          {voteLabel(v.vote, v.question)}
        </span>
      </Link>
    </li>
  );
}

/**
 * Cum a votat parlamentarul la proiectele pe care le urmărim, cele mai noi întâi: proiectul, riscul lui, votul și data.
 * Primele câteva la vedere, restul într-o listă care se deschide.
 */
export default function MpVotes({ votes, role }: { votes: MpVote[]; role: string }) {
  if (!votes.length) return null;
  const chamber = votes.every((v) => v.chamber === 'senat') ? 'în plenul Senatului' : votes.every((v) => v.chamber === 'cdep') ? 'în plenul Camerei' : 'în plen';
  return (
    <section aria-labelledby="voturi-title" className="mt-12">
      <h2 id="voturi-title" className="font-display text-3xl font-normal">
        Cum a votat
      </h2>
      <p className="mt-2 mb-6 max-w-[70ch] text-sm leading-6 text-muted">
        Voturile nominale {chamber} la {countWord(new Set(votes.map((v) => v.slug)).size, 'proiect urmărit', 'proiecte urmărite')} de noi, cele mai noi întâi.
        „Pentru respingere” înseamnă că a votat ca proiectul să fie respins.
        {role === 'deputat' && ' Camera publică doar voturile celor prezenți, așa că absențele nu apar aici.'}
      </p>
      <ul className={`${panel} divide-y divide-line overflow-hidden`}>
        {votes.slice(0, SHOWN).map((v, i) => (
          <Row key={`${v.slug}-${v.date}-${i}`} v={v} />
        ))}
      </ul>
      {votes.length > SHOWN && (
        <details className="group mt-3">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
            Arată toate cele {votes.length} voturi
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <ul className={`${panel} mt-2 divide-y divide-line overflow-hidden`}>
            {votes.slice(SHOWN).map((v, i) => (
              <Row key={`${v.slug}-${v.date}-${i}`} v={v} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
