import Link from 'next/link';
import { ChevronDown, ExternalLink, Vote } from 'lucide-react';
import type { BillVotes as Data, CommitteeStatement, PlenaryVote, VoteChoice, VoteMember } from '@/lib/types';
import { CHAMBER_NAME, CHAMBER_SITE, CHOICES, MEMBER_WORD, resultHeadline, subjectLabel, totalsSentence, voteLabel } from '@/lib/vote-text';
import { PARTY_ORDER } from '@/lib/site';
import { countWord, formatDateRo } from '@/lib/format';
import { trackAttrs } from '@/lib/analytics';
import { PartyTag, panel } from '@/components/ui';

// Codare neutră a votului: bleumarin și ardezie, niciodată roșu/galben/verde (risc) sau violet/albastru de coaliție.
// Culoarea nu e niciodată singurul indiciu: ordinea segmentelor e mereu aceeași și fiecare număr are eticheta lui.
const TONE_BAR: Record<VoteChoice, string> = {
  pentru: 'bg-brand',
  contra: 'bg-brand/40',
  abtinere: 'bg-muted',
  'nu a votat': 'bg-line-strong',
  'fără vot': 'bg-line',
};
const TONE_DOT: Record<VoteChoice, string> = {
  pentru: 'bg-brand',
  contra: 'bg-brand/40 ring-1 ring-inset ring-brand/60',
  abtinere: 'bg-muted',
  'nu a votat': 'bg-line-strong',
  'fără vot': 'bg-surface ring-1 ring-inset ring-line-strong',
};

const partyRank = (p: string) => {
  const i = PARTY_ORDER.indexOf(p);
  return i < 0 ? PARTY_ORDER.length : i;
};

function StackedBar({
  parts,
  total,
  widthPct = 100,
  className = 'h-2.5',
}: {
  parts: [VoteChoice, number][];
  total: number;
  widthPct?: number;
  className?: string;
}) {
  if (!total) return <div className={`${className} rounded-full bg-sunken`} aria-hidden />;
  return (
    <div className={`${className} w-full overflow-hidden rounded-full bg-sunken`} aria-hidden>
      <div className="flex h-full overflow-hidden rounded-full" style={{ width: `${Math.max(widthPct, 0)}%` }}>
        {parts.map(([k, n], i) =>
          n ? (
            <span
              key={k}
              className={`${TONE_BAR[k]} ${i > 0 ? 'border-l-2 border-surface' : ''} h-full`}
              style={{ width: `${(n / total) * 100}%` }}
            />
          ) : null,
        )}
      </div>
    </div>
  );
}

function MemberName({ m, pages }: { m: VoteMember; pages: Set<string> }) {
  return pages.has(m.mp) ? (
    <Link
      href={`/parlamentari/${m.mp}`}
      className="inline-flex min-h-11 items-center font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-[3px]"
    >
      {m.name}
    </Link>
  ) : (
    <span className="inline-flex min-h-11 items-center font-medium text-ink">{m.name}</span>
  );
}

type Dissenter = { m: VoteMember; majority: VoteChoice; majorityCount: number; groupSize: number };

function dissentersOf(v: PlenaryVote): Dissenter[] {
  const byParty = new Map<string, VoteMember[]>();
  for (const m of v.members) byParty.set(m.party, [...(byParty.get(m.party) ?? []), m]);
  const out: Dissenter[] = [];
  for (const [party, list] of byParty) {
    if (party === 'Neafiliați' || list.length < 2) continue;
    const counts = new Map<VoteChoice, number>();
    for (const m of list) counts.set(m.vote, (counts.get(m.vote) ?? 0) + 1);
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) continue;
    const [majority, majorityCount] = ranked[0];
    for (const m of list) if (m.vote !== majority) out.push({ m, majority, majorityCount, groupSize: list.length });
  }
  return out.sort((a, b) => partyRank(a.m.party) - partyRank(b.m.party) || a.m.name.localeCompare(b.m.name, 'ro'));
}

function Nominal({ v, pages }: { v: PlenaryVote; pages: Set<string> }) {
  const [one] = MEMBER_WORD[v.chamber];
  const groups = CHOICES.map((choice) => [choice, v.members.filter((m) => m.vote === choice)] as const).filter(([, list]) => list.length);
  return (
    <details className="group mt-5 border-t border-line">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2 text-sm font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-[3px] [&::-webkit-details-marker]:hidden">
        <span>
          Lista nominală: cum a votat fiecare {one} <span className="font-normal tabular-nums text-muted">({v.members.length})</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <p className="pb-1 text-xs leading-5 text-muted">Grupată după vot, apoi după grupul parlamentar, în ordine alfabetică.</p>
      <div className="space-y-6 pb-2">
        {groups.map(([choice, list]) => {
          const byParty = new Map<string, VoteMember[]>();
          for (const m of list) byParty.set(m.party, [...(byParty.get(m.party) ?? []), m]);
          return (
            <section key={choice} aria-label={`${voteLabel(choice, v.question)}: ${list.length}`}>
              <h4 className="flex flex-wrap items-center gap-2 border-b border-line pb-2 text-sm font-semibold text-ink">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOT[choice]}`} aria-hidden />
                {voteLabel(choice, v.question)}
                <span className="font-normal tabular-nums text-muted">
                  {list.length} {countWord(list.length, one, MEMBER_WORD[v.chamber][1]).replace(/^\d+\s*/, '') === one ? '' : ''}
                  <span className="sr-only">{MEMBER_WORD[v.chamber][1]}</span>
                </span>
              </h4>
              <div className="space-y-4 pt-2">
                {[...byParty.entries()]
                  .sort((a, b) => partyRank(a[0]) - partyRank(b[0]) || a[0].localeCompare(b[0], 'ro'))
                  .map(([party, members]) => (
                    <div key={party}>
                      <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
                        <PartyTag party={party} />
                        <span className="tabular-nums">
                          {members.length} {members.length === 1 ? one : MEMBER_WORD[v.chamber][1]}
                        </span>
                      </p>
                      <ul className="mt-1 grid grid-cols-1 gap-x-5 min-[480px]:grid-cols-2">
                        {[...members]
                          .sort((a, b) => a.name.localeCompare(b.name, 'ro'))
                          .map((m, i) => (
                            <li key={`${m.mp}-${i}`} className="border-t border-line first:border-t-0 min-[480px]:[&:nth-child(2)]:border-t-0">
                              <MemberName m={m} pages={pages} />
                            </li>
                          ))}
                      </ul>
                    </div>
                  ))}
              </div>
            </section>
          );
        })}
      </div>
    </details>
  );
}

function PlenaryBlock({ v, pages, billId, index, total }: { v: PlenaryVote; pages: Set<string>; billId: string; index: number; total: number }) {
  const t = v.totals;
  const [one, many] = MEMBER_WORD[v.chamber];
  const dissenters = dissentersOf(v);
  const maxParty = Math.max(1, ...v.parties.map((p) => p.prezenti));
  const barTotal = t.prezenti + (t.faraVot ?? 0);
  const totalItems: [VoteChoice, number][] = [
    ['pentru', t.pentru],
    ['contra', t.contra],
    ['abtinere', t.abtineri],
    ['nu a votat', t.nuAuVotat],
    ...(t.faraVot ? ([['fără vot', t.faraVot]] as [VoteChoice, number][]) : []),
  ];
  const partyCount = (p: PlenaryVote['parties'][number], c: VoteChoice) =>
    c === 'pentru' ? p.pentru : c === 'contra' ? p.contra : c === 'abtinere' ? p.abtineri : c === 'nu a votat' ? p.nuAuVotat : 0;

  return (
    <article>
      {total > 1 && (
        <p className="text-sm tabular-nums text-muted">
          Votul {index + 1} din {total} · {CHAMBER_NAME[v.chamber]}
        </p>
      )}
      <h3 className="mt-1 font-display text-[1.7rem] leading-[1.15] text-ink">{resultHeadline(v)}</h3>
      <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-sm tabular-nums text-muted">
        <time dateTime={v.date}>
          {formatDateRo(v.date)}
          {v.time && `, ora ${v.time}`}
        </time>
        <span aria-hidden>·</span>
        <span>{subjectLabel(v)}</span>
        {v.billNumber && (
          <>
            <span aria-hidden>·</span>
            <span>{v.billNumber}</span>
          </>
        )}
      </p>

      {v.question === 'respingere' && (
        <p className="mt-4 rounded-xl bg-sunken px-4 py-3 text-sm leading-6 text-body">
          <strong className="font-semibold text-ink">Sensul votului:</strong> s-a votat respingerea proiectului. „Pentru” înseamnă{' '}
          <strong className="font-semibold text-ink">pentru respingere</strong>, iar „contra” înseamnă contra respingerii.
        </p>
      )}

      <p className="mt-3 max-w-[68ch] text-[15px] leading-7 text-body">{totalsSentence(v)}</p>

      <div className="mt-4">
        <StackedBar
          className="h-3"
          total={barTotal}
          parts={[
            ['pentru', t.pentru],
            ['contra', t.contra],
            ['abtinere', t.abtineri],
            ['nu a votat', t.nuAuVotat],
            ['fără vot', t.faraVot ?? 0],
          ]}
        />
        <dl className="mt-1 grid grid-cols-2 border-b border-line sm:grid-cols-3 lg:grid-cols-5">
          {totalItems.map(([choice, n]) => (
            <div key={choice} className="border-t border-line py-3 pr-3">
              <dt className="flex items-start gap-1.5 text-[13px] leading-5 text-muted">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOT[choice]}`} aria-hidden />
                {voteLabel(choice, v.question)}
              </dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-ink">{n}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs leading-5 tabular-nums text-muted">
          {countWord(t.prezenti, `${one} prezent`, `${many} prezenți`)} în total
          {t.faraVot ? `, plus ${countWord(t.faraVot, `${one} listat`, `${many} listați`)} fără vot înregistrat` : ''}.
        </p>
      </div>

      {v.parties.length > 0 && (
        <div className="mt-6">
          <h4 className="text-base font-semibold text-ink">Pe grupuri parlamentare</h4>
          <p className="mt-1 max-w-[68ch] text-sm leading-6 text-muted">
            Lungimea barei arată mărimea grupului față de cel mai mare grup prezent ({maxParty} {many}). Segmentele arată cum s-au împărțit
            voturile în grup, în aceeași ordine ca totalurile de mai sus.
          </p>
          <ul aria-label={`Voturi pe grupuri parlamentare, ${CHAMBER_NAME[v.chamber]}`} className="mt-2 divide-y divide-line">
            {[...v.parties]
              .sort((a, b) => b.prezenti - a.prezenti || partyRank(a.party) - partyRank(b.party))
              .map((p) => {
                const split = CHOICES.filter((c) => partyCount(p, c) > 0);
                return (
                  <li key={p.party} className="py-3.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <PartyTag party={p.party} />
                      <span className="text-xs tabular-nums text-muted">{countWord(p.prezenti, 'prezent', 'prezenți')}</span>
                    </div>
                    <StackedBar
                      className="mt-2 h-2.5"
                      total={p.prezenti}
                      widthPct={(p.prezenti / maxParty) * 100}
                      parts={CHOICES.map((c) => [c, partyCount(p, c)] as [VoteChoice, number])}
                    />
                    <p className="mt-1.5 text-sm leading-6 text-body">
                      {split.length ? (
                        split.map((c, i) => (
                          <span key={c}>
                            {i > 0 && <span className="text-faint"> · </span>}
                            <span className="font-semibold tabular-nums text-ink">{partyCount(p, c)}</span> {voteLabel(c, v.question)}
                          </span>
                        ))
                      ) : (
                        <span className="text-muted">Fără voturi înregistrate</span>
                      )}
                    </p>
                  </li>
                );
              })}
          </ul>
        </div>
      )}

      {dissenters.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <h4 className="text-sm font-semibold text-ink">Au votat altfel decât grupul</h4>
          <p className="mt-1 text-xs leading-5 text-muted">Față de votul majoritar al propriului grup; grupul Neafiliați nu e luat în calcul.</p>
          <ul className="mt-1 divide-y divide-line">
            {dissenters.map(({ m, majority, majorityCount, groupSize }, i) => (
              <li key={`${m.mp}-${m.vote}-${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1 text-sm leading-6 text-body">
                <MemberName m={m} pages={pages} />
                <PartyTag party={m.party} />
                <span>
                  vot: {voteLabel(m.vote, v.question)} · majoritatea grupului: {voteLabel(majority, v.question)}{' '}
                  <span className="tabular-nums text-muted">
                    ({majorityCount} din {groupSize})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {v.members.length > 0 && <Nominal v={v} pages={pages} />}

      <a
        href={v.url}
        target="_blank"
        rel="noopener noreferrer"
        {...trackAttrs('official_source_open', { bill_id: billId, source: `${v.chamber}_vote` })}
        className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-link underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-[3px]"
      >
        Votul pe {CHAMBER_SITE[v.chamber]}
        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">(se deschide într-o filă nouă)</span>
      </a>

      <div className="mt-2 space-y-1 text-xs leading-5 text-muted">
        {v.chamber === 'cdep' && <p>Lista Camerei arată doar deputații prezenți la vot; cei absenți nu apar, așa că absențele nu pot fi arătate.</p>}
        {v.chamber === 'senat' && t.faraVot ? (
          <p>
            „Fără vot înregistrat”: {t.faraVot === 1 ? `un ${one} listat` : `${t.faraVot} ${many} listați`} de Senat fără niciun vot în dreptul
            numelui.
          </p>
        ) : null}
      </div>
    </article>
  );
}

function Committee({ list, billId }: { list: CommitteeStatement[]; billId: string }) {
  const final = list.filter((c) => !c.preliminary);
  const shown = final.length ? final : list;
  return (
    <div className="border-t border-line pt-6">
      <h3 className="font-display text-[1.35rem] leading-snug text-ink">În comisie</h3>
      <p className="mt-1 max-w-[68ch] text-sm leading-6 text-muted">Comisiile nu votează nominal. Raportul spune doar cu ce majoritate s-a hotărât.</p>
      <ul className="mt-2 divide-y divide-line">
        {shown.map((c, i) => (
          <li key={`${c.report}-${i}`} className="py-4">
            <p className="text-sm font-semibold text-ink">
              {c.majority === 'unanimitate' ? 'Cu unanimitate de voturi' : 'Cu majoritate de voturi'}
              {c.proposal && `, ${c.preliminary ? 'raport preliminar' : 'raport'} de ${c.proposal}`}
            </p>
            <blockquote className="mt-1 max-w-[68ch] text-[15px] leading-7 text-body">„{c.quote}”</blockquote>
            {c.report && (
              <a
                href={c.report}
                target="_blank"
                rel="noopener noreferrer"
                {...trackAttrs('official_source_open', { bill_id: billId, source: 'cdep_report' })}
                className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-link underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-[3px]"
              >
                Raportul comisiei (PDF)
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">(se deschide într-o filă nouă)</span>
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Cum s-a votat: voturile nominale din plen (Senat și Cameră, în ordinea în care au avut loc), cu totalurile pe grupuri și
 * lista fiecărui parlamentar, plus ce spune raportul comisiei. Fără date nu apare deloc.
 */
export default function BillVotes({ data, pages, billId }: { data: Data | null; pages: Set<string>; billId: string }) {
  if (!data || (!data.votes.length && !data.committee.length)) return null;
  const votes = [...data.votes].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.time ?? '').localeCompare(b.time ?? '') ||
      (a.chamber === 'senat' ? 0 : 1) - (b.chamber === 'senat' ? 0 : 1),
  );
  const chambers = new Set(votes.map((v) => v.chamber));
  return (
    <section id="voturi" aria-labelledby="voturi-titlu" className={`${panel} mt-6 scroll-mt-20 p-5 sm:p-8`}>
      <h2 id="voturi-titlu" className="inline-flex items-center gap-2 font-display text-[1.875rem] leading-tight text-ink">
        <Vote className="h-5 w-5 shrink-0 text-link" aria-hidden />
        Cum s-a votat
      </h2>
      <p className="mt-2 max-w-[68ch] text-[15px] leading-7 text-body">
        {votes.length
          ? `Voturile nominale din plen, în ordinea în care au avut loc, cum le publică ${
              chambers.size === 2 ? 'Senatul și Camera Deputaților' : chambers.has('senat') ? 'Senatul' : 'Camera Deputaților'
            }. Deschide lista nominală ca să vezi votul fiecărui parlamentar.`
          : 'Nu avem încă un vot nominal din plen pentru proiectul acesta.'}
      </p>
      {votes.length > 0 && (
        <ol className="mt-4">
          {votes.map((v, i) => (
            <li key={`${v.chamber}-${v.id}`} className="relative py-6 pl-6 first:border-t first:border-line sm:pl-8">
              {votes.length > 1 && (
                <>
                  <span className="absolute bottom-0 left-[7px] top-0 w-px bg-line" aria-hidden />
                  <span className="absolute left-0 top-8 h-[15px] w-[15px] rounded-full bg-brand ring-4 ring-surface" aria-hidden />
                </>
              )}
              <PlenaryBlock v={v} pages={pages} billId={billId} index={i} total={votes.length} />
              {i < votes.length - 1 && <span className="absolute inset-x-0 bottom-0 border-b border-line" aria-hidden />}
            </li>
          ))}
        </ol>
      )}
      {data.committee.length > 0 && (
        <div className={votes.length ? 'mt-2' : 'mt-6'}>
          <Committee list={data.committee} billId={billId} />
        </div>
      )}
    </section>
  );
}
