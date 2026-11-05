import Link from 'next/link';
import { ChevronDown, ExternalLink } from 'lucide-react';
import type {
  BillVotes as Data,
  CommitteeStatement,
  PlenaryVote,
  VoteChoice,
  VoteMember,
} from '@/lib/types';
import {
  CHAMBER_SITE,
  MEMBER_WORD,
  resultHeadline,
  subjectLabel,
  voteLabel,
} from '@/lib/vote-text';
import { PARTY_ORDER } from '@/lib/site';
import { countWord, formatDateRo } from '@/lib/format';
import { trackAttrs } from '@/lib/analytics';
import { PartyTag, panel } from '@/components/ui';

const PRESENT_CHOICES: VoteChoice[] = [
  'pentru',
  'contra',
  'abtinere',
  'nu a votat',
];

const EXPRESSED_CHOICES: VoteChoice[] = ['pentru', 'contra', 'abtinere'];

const TONE: Record<VoteChoice, string> = {
  pentru: 'bg-brand',
  contra: 'bg-muted',
  abtinere: 'bg-brand/30',
  'nu a votat': 'bg-line-strong',
  'fără vot': 'bg-sunken',
};

const FOCUS =
  'rounded-sm focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-focus';

const LINK =
  `text-link underline decoration-line-strong underline-offset-4 hover:decoration-link hover:decoration-2 ${FOCUS}`;

type Part = { choice: VoteChoice; count: number };
type PartyRow = PlenaryVote['parties'][number] & { unrecorded: number };
type DifferentVote = { member: VoteMember; majority: VoteChoice };

function partyRank(party: string) {
  const index = PARTY_ORDER.indexOf(party);
  return index < 0 ? PARTY_ORDER.length : index;
}

function presentParts(t: PlenaryVote['totals']): Part[] {
  return [
    { choice: 'pentru', count: t.pentru },
    { choice: 'contra', count: t.contra },
    { choice: 'abtinere', count: t.abtineri },
    { choice: 'nu a votat', count: t.nuAuVotat },
  ];
}

function votePrefix(v: PlenaryVote) {
  return `vot-${v.chamber}-${v.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function partyRows(v: PlenaryVote): PartyRow[] {
  const unrecorded = new Map<string, number>();

  if (v.chamber === 'senat') {
    for (const member of v.members) {
      if (member.vote === 'fără vot') {
        unrecorded.set(member.party, (unrecorded.get(member.party) ?? 0) + 1);
      }
    }
  }

  const rows: PartyRow[] = v.parties.map((party) => ({
    ...party,
    unrecorded: unrecorded.get(party.party) ?? 0,
  }));

  const knownParties = new Set(rows.map((row) => row.party));

  for (const [party, count] of unrecorded) {
    if (!knownParties.has(party)) {
      rows.push({
        party,
        prezenti: 0,
        pentru: 0,
        contra: 0,
        abtineri: 0,
        nuAuVotat: 0,
        unrecorded: count,
      });
    }
  }

  return rows.sort(
    (a, b) =>
      b.prezenti - a.prezenti ||
      partyRank(a.party) - partyRank(b.party) ||
      a.party.localeCompare(b.party, 'ro'),
  );
}

/**
 * Comparăm numai voturi exprimate, inclusiv abținerile.
 * Un grup are majoritate doar când o alegere depășește jumătatea lor.
 * Lipsa unui vot nu este prezentată drept un vot diferit.
 */
function differentVotes(members: VoteMember[]): DifferentVote[] {
  const groups = new Map<string, VoteMember[]>();

  for (const member of members) {
    if (
      member.party === 'Neafiliați' ||
      !EXPRESSED_CHOICES.includes(member.vote)
    ) {
      continue;
    }

    const group = groups.get(member.party);
    if (group) group.push(member);
    else groups.set(member.party, [member]);
  }

  const result: DifferentVote[] = [];

  for (const group of groups.values()) {
    const counts = new Map<VoteChoice, number>();

    for (const member of group) {
      counts.set(member.vote, (counts.get(member.vote) ?? 0) + 1);
    }

    const majority = EXPRESSED_CHOICES.find(
      (choice) => (counts.get(choice) ?? 0) > group.length / 2,
    );

    if (!majority) continue;

    for (const member of group) {
      if (member.vote !== majority) result.push({ member, majority });
    }
  }

  return result.sort(
    (a, b) =>
      partyRank(a.member.party) - partyRank(b.member.party) ||
      a.member.party.localeCompare(b.member.party, 'ro') ||
      a.member.name.localeCompare(b.member.name, 'ro'),
  );
}

/** Toate segmentele folosesc aceeași scară, exprimată în persoane. */
function Bar({ parts, maximum }: { parts: Part[]; maximum: number }) {
  return (
    <div aria-hidden="true" className="flex h-3 w-full overflow-hidden rounded-sm">
      {parts.map(({ choice, count }) =>
        count > 0 && maximum > 0 ? (
          <span
            key={choice}
            className={`h-full shrink-0 ${TONE[choice]}`}
            style={{ width: `${(count / maximum) * 100}%` }}
          />
        ) : null,
      )}
    </div>
  );
}

function MemberName({ member, pages }: { member: VoteMember; pages: Set<string> }) {
  const className =
    'flex min-h-11 min-w-0 items-center py-2 text-sm font-medium [overflow-wrap:anywhere]';

  return pages.has(member.mp) ? (
    <Link
      href={`/parlamentari/${member.mp}`}
      className={`${className} ${LINK}`}
    >
      {member.name}
    </Link>
  ) : (
    <span className={`${className} text-ink`}>{member.name}</span>
  );
}

function PartySplit({ v }: { v: PlenaryVote }) {
  const rows = partyRows(v);
  if (!rows.length) return null;

  const maximum = Math.max(1, ...rows.map((row) => row.prezenti));
  const headingId = `${votePrefix(v)}-grupuri`;
  const [one, many] = MEMBER_WORD[v.chamber];

  return (
    <div className="mt-6 border-t border-line pt-5">
      <h4 id={headingId} className="text-sm font-semibold text-ink">
        Votul pe grupuri
      </h4>
      <p className="mt-1 max-w-[68ch] text-xs leading-5 text-muted">
        Lungimea barelor compară numărul celor prezenți, la aceeași scară.
        Cifrele se referă la acest vot, nu la întregul grup.
      </p>

      <ul aria-labelledby={headingId} className="mt-3 divide-y divide-line">
        {rows.map((row) => {
          const parts = presentParts(row);
          const counts: Part[] =
            v.chamber === 'senat'
              ? [...parts, { choice: 'fără vot', count: row.unrecorded }]
              : parts;

          return (
            <li
              key={row.party}
              className="grid min-w-0 gap-2 py-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 sm:block">
                <PartyTag party={row.party} />
                <p className="text-xs leading-5 text-muted sm:mt-1">
                  {countWord(row.prezenti, `${one} prezent`, `${many} prezenți`)}
                </p>
              </div>

              <div className="min-w-0 sm:pt-1">
                <Bar parts={parts} maximum={maximum} />
                <dl
                  aria-label={`Voturile grupului ${row.party}`}
                  className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs leading-5"
                >
                  {counts.map(({ choice, count }) => (
                    <div
                      key={choice}
                      className={
                        count === 0
                          ? 'sr-only'
                          : 'flex min-w-0 items-baseline gap-1.5'
                      }
                    >
                      <dt className="text-muted">
                        {voteLabel(choice, v.question)}
                      </dt>
                      <dd className="order-first shrink-0 font-semibold text-ink">
                        {count}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DifferentFromGroup({
  v,
  pages,
}: {
  v: PlenaryVote;
  pages: Set<string>;
}) {
  const members = differentVotes(v.members);
  if (!members.length) return null;

  return (
    <details className="group/different border-t border-line">
      <summary
        className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden ${FOCUS}`}
      >
        <span className="min-w-0">
          Au votat altfel decât grupul
          <span className="ml-2 font-normal text-muted">{members.length}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 group-open/different:rotate-180"
        />
      </summary>

      <p className="max-w-[68ch] pb-3 text-xs leading-5 text-muted">
        Comparăm voturile exprimate, inclusiv abținerile. Majoritatea înseamnă
        peste jumătate din aceste voturi în grup. Neafiliații și grupurile fără
        o asemenea majoritate nu intră în comparație.
      </p>

      <ul className="divide-y divide-line pb-3">
        {members.map(({ member, majority }, index) => (
          <li
            key={`${member.mp}-${index}`}
            className="grid min-w-0 gap-x-4 py-2 sm:grid-cols-2"
          >
            <div className="min-w-0">
              <MemberName member={member} pages={pages} />
              <PartyTag party={member.party} />
            </div>
            <dl className="mt-2 space-y-1 text-xs leading-5 sm:my-auto">
              <div>
                <dt className="inline text-muted">Vot individual: </dt>
                <dd className="inline font-semibold text-ink">
                  {voteLabel(member.vote, v.question)}
                </dd>
              </div>
              <div>
                <dt className="inline text-muted">Majoritatea grupului: </dt>
                <dd className="inline text-body">
                  {voteLabel(majority, v.question)}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Nominal({ v, pages }: { v: PlenaryVote; pages: Set<string> }) {
  const groups = new Map<string, VoteMember[]>();
  const sorted = [...v.members].sort((a, b) =>
    a.name.localeCompare(b.name, 'ro'),
  );

  for (const member of sorted) {
    const initial =
      member.name.trim().charAt(0).toLocaleUpperCase('ro-RO') || 'Alte nume';
    const group = groups.get(initial);
    if (group) group.push(member);
    else groups.set(initial, [member]);
  }

  const initials = [...groups.entries()];
  const prefix = votePrefix(v);

  return (
    <details className="group/nominal border-t border-line">
      <summary
        className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden ${FOCUS}`}
      >
        <span className="min-w-0">
          Votul fiecărui parlamentar
          <span className="ml-2 font-normal text-muted">{v.members.length}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 group-open/nominal:rotate-180"
        />
      </summary>

      <div className="pb-4">
        <p className="text-xs leading-5 text-muted">
          Numele sunt în ordine alfabetică. Alege inițiala numelui pentru a
          ajunge direct la ea.
        </p>

        <nav
          aria-label="Inițialele numelor parlamentarilor"
          className="mt-2 flex flex-wrap gap-1"
        >
          {initials.map(([initial], index) => (
            <a
              key={initial}
              href={`#${prefix}-nume-${index}`}
              className={`inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-sm font-semibold hover:bg-sunken ${LINK}`}
            >
              {initial}
            </a>
          ))}
        </nav>

        <div className="mt-4 space-y-6">
          {initials.map(([initial, members], index) => {
            const headingId = `${prefix}-nume-${index}`;

            return (
              <div key={initial}>
                <h5
                  id={headingId}
                  tabIndex={-1}
                  className={`flex min-h-11 scroll-mt-24 items-center gap-2 border-b border-line text-sm font-semibold text-ink ${FOCUS}`}
                >
                  <span className="sr-only">Inițiala </span>
                  {initial}
                  <span className="font-normal text-muted">
                    {members.length}
                  </span>
                </h5>

                <ul
                  aria-labelledby={headingId}
                  className="grid min-w-0 gap-x-6 sm:grid-cols-2"
                >
                  {members.map((member, memberIndex) => (
                    <li
                      key={`${member.mp}-${memberIndex}`}
                      className="min-w-0 border-b border-line py-2"
                    >
                      <MemberName member={member} pages={pages} />
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pb-1">
                        <PartyTag party={member.party} />
                        <span className="text-xs leading-5 text-body">
                          {voteLabel(member.vote, v.question)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </details>
  );
}

function PlenaryBlock({
  v,
  pages,
  billId,
}: {
  v: PlenaryVote;
  pages: Set<string>;
  billId: string;
}) {
  const parts = presentParts(v.totals);
  const totals: Part[] =
    v.chamber === 'senat'
      ? [...parts, { choice: 'fără vot', count: v.totals.faraVot ?? 0 }]
      : parts;
  const [one, many] = MEMBER_WORD[v.chamber];

  return (
    <article aria-labelledby={`${votePrefix(v)}-titlu`} className="min-w-0">
      <h3
        id={`${votePrefix(v)}-titlu`}
        className="max-w-[32ch] text-balance font-display text-2xl font-normal leading-tight text-ink sm:text-3xl"
      >
        {resultHeadline(v)}
      </h3>

      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm leading-6 text-muted">
        <time dateTime={v.time ? `${v.date}T${v.time}` : v.date}>
          {formatDateRo(v.date)}
          {v.time && `, ora ${v.time}`}
        </time>
        {v.billNumber && <span>{v.billNumber}</span>}
      </p>
      <p className="mt-1 text-sm leading-6 text-body">{subjectLabel(v)}</p>

      {v.question === 'respingere' && (
        <p className="mt-4 max-w-[68ch] rounded-lg bg-brand-soft px-3 py-2 text-sm leading-6 text-ink">
          Se votează <strong className="font-semibold">respingerea proiectului</strong>.
          {' '}„{voteLabel('pentru', v.question)}” susține respingerea;
          {' '}„{voteLabel('contra', v.question)}” se opune respingerii.
        </p>
      )}

      <p className="mt-5 text-sm text-muted">
        {countWord(v.totals.prezenti, `${one} prezent`, `${many} prezenți`)}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        {totals.map(({ choice, count }) => (
          <div key={choice} className="min-w-0">
            <dt className="flex items-start gap-2 text-xs leading-5 text-body">
              <span
                aria-hidden="true"
                className={`mt-1.5 size-2 shrink-0 rounded-sm ${TONE[choice]}`}
              />
              {voteLabel(choice, v.question)}
            </dt>
            <dd className="mt-1 text-2xl font-semibold leading-none text-ink">
              {count}
            </dd>
          </div>
        ))}
      </dl>

      <PartySplit v={v} />

      <p className="mb-4 mt-3 max-w-[68ch] text-xs leading-5 text-muted">
        {v.chamber === 'cdep' ? (
          <>
            Camera listează doar deputații prezenți la vot. Absențele nu pot fi
            afișate.
          </>
        ) : (
          <>
            „{voteLabel('fără vot', v.question)}” înseamnă că senatorul este
            listat de Senat fără niciun marcaj în dreptul numelui; nu îl
            considerăm prezent care n-a votat.
          </>
        )}
      </p>

      <DifferentFromGroup v={v} pages={pages} />
      {v.members.length > 0 && <Nominal v={v} pages={pages} />}

      <a
        href={v.url}
        target="_blank"
        rel="noopener noreferrer"
        {...trackAttrs('official_source_open', {
          bill_id: billId,
          source: `${v.chamber}_vote`,
        })}
        className={`mt-1 inline-flex min-h-11 items-center gap-2 text-sm font-semibold ${LINK}`}
      >
        Votul pe {CHAMBER_SITE[v.chamber]}
        <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="sr-only"> (se deschide într-o filă nouă)</span>
      </a>
    </article>
  );
}

function Committee({
  list,
  billId,
}: {
  list: CommitteeStatement[];
  billId: string;
}) {
  return (
    <div className="mt-7 border-t border-line pt-6">
      <h3 className="font-display text-2xl font-normal text-ink">În comisie</h3>
      <p className="mt-2 max-w-[68ch] text-sm leading-6 text-muted">
        Comisiile nu publică voturi nominale. Raportul consemnează unanimitatea
        sau majoritatea, fără votul fiecărui membru.
      </p>

      <ul className="mt-4 divide-y divide-line">
        {list.map((statement, index) => (
          <li key={`${statement.report ?? 'raport'}-${index}`} className="py-4">
            <h4 className="text-sm font-semibold leading-6 text-ink">
              {statement.majority === 'unanimitate'
                ? 'Cu unanimitate de voturi'
                : 'Cu majoritate de voturi'}
            </h4>
            <p className="mt-1 text-xs leading-5 text-muted">
              {statement.preliminary ? 'Raport preliminar' : 'Raport'}
              {statement.proposal && ` de ${statement.proposal}`}
              {statement.billNumber && ` · ${statement.billNumber}`}
            </p>
            <blockquote className="mt-2 max-w-[68ch] text-[15px] leading-7 text-body [overflow-wrap:anywhere]">
              <p>„{statement.quote}”</p>
            </blockquote>

            {statement.report && (
              <a
                href={statement.report}
                target="_blank"
                rel="noopener noreferrer"
                {...trackAttrs('official_source_open', {
                  bill_id: billId,
                  source: 'cdep_report',
                })}
                className={`mt-1 inline-flex min-h-11 items-center gap-2 text-sm font-semibold ${LINK}`}
              >
                Raportul comisiei (PDF)
                <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="sr-only"> (se deschide într-o filă nouă)</span>
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function BillVotes({
  data,
  pages,
  billId,
}: {
  data: Data | null;
  pages: Set<string>;
  billId: string;
}) {
  if (!data || (!data.votes.length && !data.committee.length)) return null;

  const votes = [...data.votes].sort((a, b) => {
    const dateOrder = a.date.localeCompare(b.date);
    if (dateOrder) return dateOrder;

    // Fără o oră pentru ambele voturi, păstrăm ordinea sursei în aceeași zi.
    return a.time && b.time
      ? a.time.padStart(5, '0').localeCompare(b.time.padStart(5, '0'))
      : 0;
  });

  return (
    <section
      id="voturi"
      aria-labelledby="voturi-titlu"
      className={`${panel} mt-6 min-w-0 scroll-mt-20 p-4 text-body tabular-nums selection:bg-brand-soft selection:text-ink sm:p-6 lg:p-8`}
    >
      <h2
        id="voturi-titlu"
        className="font-display text-3xl font-normal leading-tight text-ink"
      >
        Cum s-a votat
      </h2>
      <p className="mt-2 max-w-[68ch] text-[15px] leading-7 text-muted">
        {votes.length
          ? 'Voturile din plen, în ordinea în care au avut loc. Vezi rezultatul, împărțirea pe grupuri și votul fiecărui parlamentar.'
          : 'Nu avem încă un vot nominal din plen pentru acest proiect.'}
      </p>

      {votes.length > 0 && (
        <ol aria-label="Voturile din plen, în ordine cronologică" className="mt-7">
          {votes.map((v, index) => (
            <li
              key={`${v.chamber}-${v.id}`}
              className="relative min-w-0 pl-5 pb-9 last:pb-0 sm:pl-7"
            >
              {index < votes.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-1 top-3 w-px bg-line"
                />
              )}
              <span
                aria-hidden="true"
                className="absolute left-0 top-2 size-2.5 rounded-full bg-brand"
              />
              <PlenaryBlock v={v} pages={pages} billId={billId} />
            </li>
          ))}
        </ol>
      )}

      {data.committee.length > 0 && (
        <Committee list={data.committee} billId={billId} />
      )}
    </section>
  );
}
