# agy · variante voturi · 21:33:38 · limită 1800s · prompt 54248 caractere
**Cronica bicamerală a votului în plen**
Transformăm secțiunea într-o succesiune cronologică limpede (Senat → Camera Deputaților), cu titluri în Source Serif 4 pentru deznodământ, codificare cromatică și geometrică exclusiv în tonuri de bleumarin și ardezie, și explicație explicită când votul privește respingerea. Barele grupurilor parlamentare sunt scalate proporțional cu mărimea celui mai numeros grup, parlamentarii care au votat diferit de propriul grup sunt evidențiați automat, iar apelul nominal devine o grilă alfabetică ușor de parcurs pe telefon.

```tsx
import Link from 'next/link';
import { ArrowRight, ChevronDown, ExternalLink, Vote } from 'lucide-react';
import type { BillVotes as Data, CommitteeStatement, PlenaryVote, VoteChoice, VoteMember } from '@/lib/types';
import {
  CHAMBER_NAME,
  CHAMBER_SITE,
  CHOICES,
  MEMBER_WORD,
  resultHeadline,
  subjectLabel,
  totalsSentence,
  voteLabel,
} from '@/lib/vote-text';
import { PARTY_ORDER } from '@/lib/site';
import { countWord, formatDateRo } from '@/lib/format';
import { trackAttrs } from '@/lib/analytics';
import { PartyTag, panel } from '@/components/ui';

/**
 * Codificare neutră în tonuri de bleumarin și ardezie, dublată de forme geometrice distincte
 * (pătrat plin, cerc, linie, punct) și etichete explicite pentru fiecare opțiune de vot.
 */
const BAR_TONE: Record<VoteChoice, string> = {
  pentru: 'bg-brand',
  contra: 'bg-brand/40',
  abtinere: 'bg-faint',
  'nu a votat': 'bg-line-strong',
  'fără vot': 'bg-line',
};

function ChoiceMarker({ choice }: { choice: VoteChoice }) {
  if (choice === 'pentru') {
    return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-[2px] bg-brand" aria-hidden />;
  }
  if (choice === 'contra') {
    return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-brand/45" aria-hidden />;
  }
  if (choice === 'abtinere') {
    return <span className="inline-block h-1.5 w-3 shrink-0 rounded-full bg-faint" aria-hidden />;
  }
  if (choice === 'nu a votat') {
    return <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-line-strong" aria-hidden />;
  }
  return <span className="inline-block h-2 w-2 shrink-0 rounded-[2px] bg-line" aria-hidden />;
}

const partyRank = (p: string) => {
  const i = PARTY_ORDER.indexOf(p);
  return i < 0 ? PARTY_ORDER.length - 1 : i;
};

interface Dissenter {
  member: VoteMember;
  majorityVote: VoteChoice;
}

/**
 * Calculează din lista nominală parlamentarii care au votat diferit de majoritatea propriului grup,
 * ignorând parlamentarii neafiliați și pe cei figurați fără vot înregistrat.
 */
function computeDissenters(v: PlenaryVote): Dissenter[] {
  const byParty = new Map<string, VoteMember[]>();
  const seen = new Set<string>();

  for (const m of v.members) {
    if (!m.party || m.party === 'Neafiliați' || m.vote === 'fără vot') continue;
    const key = m.mp || `${m.name}|${m.party}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const list = byParty.get(m.party) ?? [];
    list.push(m);
    byParty.set(m.party, list);
  }

  const out: Dissenter[] = [];
  const entries = [...byParty.entries()].sort((a, b) => partyRank(a[0]) - partyRank(b[0]));

  for (const [, members] of entries) {
    if (members.length < 2) continue;
    const counts = new Map<VoteChoice, number>();
    for (const m of members) {
      counts.set(m.vote, (counts.get(m.vote) ?? 0) + 1);
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    if (ranked.length < 2) continue;
    const [majorityVote, topCount] = ranked[0];
    const [, secondCount] = ranked[1];
    if (topCount <= secondCount) continue;

    for (const m of members) {
      if (m.vote !== majorityVote) {
        out.push({ member: m, majorityVote });
      }
    }
  }

  return out.sort(
    (a, b) => partyRank(a.member.party) - partyRank(b.member.party) || a.member.name.localeCompare(b.member.name, 'ro')
  );
}

/**
 * Bară proporțională pentru plen sau grup parlamentar.
 * Când `scaleMax` este mărimea celui mai mare grup, lungimea barei arată ponderea grupului în plen.
 */
function ProportionalBar({
  parts,
  scaleMax,
  className = 'h-2.5',
}: {
  parts: [VoteChoice, number][];
  scaleMax?: number;
  className?: string;
}) {
  const sum = parts.reduce((s, [, n]) => s + n, 0);
  const denominator = scaleMax && scaleMax > 0 ? scaleMax : sum;
  if (!sum || !denominator) {
    return <div className={`${className} w-full rounded-full bg-sunken`} aria-hidden />;
  }
  const nonZero = parts.filter(([, n]) => n > 0);
  return (
    <div className={`${className} flex w-full items-stretch gap-0.5 overflow-hidden rounded-full bg-sunken`} aria-hidden>
      {nonZero.map(([k, n]) => (
        <span
          key={k}
          className={`${BAR_TONE[k]} first:rounded-l-full last:rounded-r-full`}
          style={{ width: `${Math.min((n / denominator) * 100, 100)}%` }}
        />
      ))}
    </div>
  );
}

function MemberName({ m, pages }: { m: VoteMember; pages: Set<string> }) {
  return pages.has(m.mp) ? (
    <Link
      href={`/parlamentari/${m.mp}`}
      className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-focus"
    >
      {m.name}
    </Link>
  ) : (
    <span className="text-ink">{m.name}</span>
  );
}

function DissentersBlock({ dissenters, question, pages }: { dissenters: Dissenter[]; question: PlenaryVote['question']; pages: Set<string> }) {
  if (!dissenters.length) return null;
  return (
    <div className="mt-4 rounded-xl bg-sunken px-4 py-3.5">
      <h4 className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-semibold text-ink">
        <span>Au votat altfel decât grupul</span>
        <span className="text-xs font-normal tabular-nums text-muted">
          {countWord(dissenters.length, 'parlamentar', 'parlamentari')}
        </span>
      </h4>
      <ul className="mt-2.5 divide-y divide-line">
        {dissenters.map(({ member, majorityVote }, idx) => (
          <li
            key={`${member.mp}-${idx}`}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0 text-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              <PartyTag party={member.party} />
              <MemberName m={member} pages={pages} />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-body">
              <ChoiceMarker choice={member.vote} />
              <span className="font-semibold text-ink">{voteLabel(member.vote, question)}</span>
              <span className="text-muted">(grupul: {voteLabel(majorityVote, question).toLowerCase()})</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Nominal({ v, pages }: { v: PlenaryVote; pages: Set<string> }) {
  const [one, many] = MEMBER_WORD[v.chamber];
  const groups = CHOICES.map((choice) => [choice, v.members.filter((m) => m.vote === choice)] as const).filter(
    ([, list]) => list.length > 0
  );

  return (
    <details className="group mt-4 border-t border-line pt-2">
      <summary className="inline-flex min-h-11 w-full cursor-pointer list-none items-center justify-between gap-3 rounded-lg py-2 text-sm font-semibold text-ink hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
        <span>
          Cum a votat fiecare {one}{' '}
          <span className="font-normal tabular-nums text-muted">({v.members.length})</span>
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-link">
          <span className="group-open:hidden">Deschide lista</span>
          <span className="hidden group-open:inline">Închide lista</span>
          <ChevronDown className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" aria-hidden />
        </span>
      </summary>

      <div className="mt-2 space-y-6 pb-2">
        {groups.map(([choice, list]) => {
          const byParty = new Map<string, VoteMember[]>();
          for (const m of list) {
            byParty.set(m.party, [...(byParty.get(m.party) ?? []), m]);
          }
          const sortedParties = [...byParty.entries()].sort((a, b) => partyRank(a[0]) - partyRank(b[0]));

          return (
            <div key={choice} className="rounded-xl bg-sunken px-4 py-3.5">
              <h4 className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5 text-sm font-semibold text-ink">
                <span className="inline-flex items-center gap-2">
                  <ChoiceMarker choice={choice} />
                  {voteLabel(choice, v.question)}
                </span>
                <span className="text-xs font-normal tabular-nums text-muted">
                  {countWord(list.length, one, many)}
                </span>
              </h4>

              <div className="mt-3 divide-y divide-line">
                {sortedParties.map(([party, members]) => {
                  const sortedMembers = [...members].sort((a, b) => a.name.localeCompare(b.name, 'ro'));
                  return (
                    <div key={party} className="py-3 first:pt-0 last:pb-0">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <PartyTag party={party} />
                        <span className="text-xs tabular-nums text-muted">{sortedMembers.length}</span>
                      </div>
                      <ul className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                        {sortedMembers.map((m, i) => (
                          <li key={`${m.mp}-${i}`} className="py-0.5 text-sm leading-6 text-body">
                            <MemberName m={m} pages={pages} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}

function PlenaryBlock({
  v,
  pages,
  billId,
  stepIndex,
  totalSteps,
}: {
  v: PlenaryVote;
  pages: Set<string>;
  billId: string;
  stepIndex: number;
  totalSteps: number;
}) {
  const t = v.totals;
  const [one, many] = MEMBER_WORD[v.chamber];
  const showNv = t.nuAuVotat > 0 || v.parties.some((p) => p.nuAuVotat > 0);
  const showFaraVot = v.chamber === 'senat' || t.faraVot !== undefined;

  const summaryItems: { choice: VoteChoice; value: number }[] = [
    { choice: 'pentru', value: t.pentru },
    { choice: 'contra', value: t.contra },
    { choice: 'abtinere', value: t.abtineri },
    { choice: 'nu a votat', value: t.nuAuVotat },
    ...(showFaraVot ? [{ choice: 'fără vot' as VoteChoice, value: t.faraVot ?? 0 }] : []),
  ];

  const cols: [VoteChoice, 'pentru' | 'contra' | 'abtineri' | 'nuAuVotat'][] = [
    ['pentru', 'pentru'],
    ['contra', 'contra'],
    ['abtinere', 'abtineri'],
    ...(showNv ? ([['nu a votat', 'nuAuVotat']] as [VoteChoice, 'nuAuVotat'][]) : []),
  ];

  const sortedParties = [...v.parties].sort(
    (a, b) => b.prezenti - a.prezenti || partyRank(a.party) - partyRank(b.party)
  );
  const maxPartyPrezenti = Math.max(...sortedParties.map((p) => p.prezenti), 1);
  const dissenters = computeDissenters(v);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="flex items-baseline gap-2.5 font-display text-xl font-normal tracking-[-0.015em] text-ink sm:text-2xl">
          {totalSteps > 1 && (
            <span
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand font-sans text-xs font-semibold tabular-nums text-on-brand"
              aria-label={`Votul ${stepIndex} din ${totalSteps}`}
            >
              {stepIndex}
            </span>
          )}
          <span>{resultHeadline(v)}</span>
        </h3>
        <p className="text-sm tabular-nums text-muted">
          {formatDateRo(v.date)}
          {v.time && `, ora ${v.time}`}
        </p>
      </div>

      <p className="mt-1 text-sm tabular-nums text-muted">
        {subjectLabel(v)}
        {v.billNumber && ` · ${v.billNumber}`}
        {` · ${countWord(t.prezenti, `${one} prezent`, `${many} prezenți`)}`}
      </p>

      {v.question === 'respingere' && (
        <div className="mt-3 rounded-xl bg-brand-soft px-4 py-3 text-sm leading-6 text-ink">
          <p className="font-semibold">La vot a fost pusă respingerea proiectului</p>
          <p className="mt-0.5 text-body">
            „{voteLabel('pentru', v.question)}” înseamnă vot ca proiectul să fie respins, iar „
            {voteLabel('contra', v.question)}” înseamnă vot pentru păstrarea proiectului.
          </p>
        </div>
      )}

      <div className="mt-4 rounded-xl bg-sunken p-4">
        <p className="text-[15px] leading-7 text-body">{totalsSentence(v)}</p>

        <ProportionalBar
          className="mt-3 h-3 bg-surface"
          parts={[
            ['pentru', t.pentru],
            ['contra', t.contra],
            ['abtinere', t.abtineri],
            ['nu a votat', t.nuAuVotat],
          ]}
        />

        <dl className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-3 sm:grid-cols-3 lg:grid-cols-5">
          {summaryItems.map(({ choice, value }) => (
            <div key={choice} className="min-w-0">
              <dt className="flex items-center gap-1.5 text-xs text-muted">
                <ChoiceMarker choice={choice} />
                <span className="truncate">{voteLabel(choice, v.question)}</span>
              </dt>
              <dd className={`mt-0.5 text-lg font-semibold tabular-nums ${value > 0 ? 'text-ink' : 'text-faint'}`}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {sortedParties.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">
              Voturile pe grupuri parlamentare în {CHAMBER_NAME[v.chamber]}, ordonate după numărul de parlamentari prezenți
            </caption>
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th scope="col" className="pb-2.5 pr-2 text-left font-semibold">
                  Grup și mărime
                </th>
                <th scope="col" className="hidden pb-2.5 pr-3 text-left font-semibold sm:table-cell sm:w-44 md:w-56">
                  Ponderea și împărțirea grupului
                </th>
                {cols.map(([choice]) => (
                  <th
                    key={choice}
                    scope="col"
                    className="pb-2.5 pl-1.5 text-right text-[11px] font-semibold leading-tight sm:pl-2 sm:text-xs"
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      <ChoiceMarker choice={choice} />
                      <span>{voteLabel(choice, v.question)}</span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular-nums">
              {sortedParties.map((p) => {
                const partyParts: [VoteChoice, number][] = [
                  ['pentru', p.pentru],
                  ['contra', p.contra],
                  ['abtinere', p.abtineri],
                  ['nu a votat', p.nuAuVotat],
                ];
                return (
                  <tr key={p.party}>
                    <th scope="row" className="py-2.5 pr-2 text-left align-middle font-normal">
                      <div className="flex items-center gap-1.5">
                        <PartyTag party={p.party} />
                        <span className="text-xs tabular-nums text-muted">({p.prezenti})</span>
                      </div>
                      <div className="mt-1.5 sm:hidden">
                        <ProportionalBar parts={partyParts} scaleMax={maxPartyPrezenti} className="h-2" />
                      </div>
                    </th>
                    <td className="hidden py-2.5 pr-3 align-middle sm:table-cell">
                      <ProportionalBar parts={partyParts} scaleMax={maxPartyPrezenti} className="h-2.5" />
                    </td>
                    {cols.map(([choice, key]) => {
                      const val = p[key];
                      return (
                        <td
                          key={choice}
                          className={`py-2.5 pl-1.5 text-right align-middle sm:pl-2 ${
                            val > 0 ? 'font-semibold text-ink' : 'text-faint'
                          }`}
                        >
                          {val}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <DissentersBlock dissenters={dissenters} question={v.question} pages={pages} />

      {v.chamber === 'cdep' ? (
        <p className="mt-3 text-xs leading-5 text-muted">
          Lista Camerei arată doar deputații prezenți la vot; cei absenți nu apar.
        </p>
      ) : (
        <p className="mt-3 text-xs leading-5 text-muted">
          „Fără vot înregistrat”:{' '}
          {t.faraVot
            ? `${t.faraVot === 1 ? `un ${one} listat` : `${t.faraVot} ${many} listați`} de Senat fără niciun vot în dreptul numelui.`
            : `senatorii listați de Senat fără niciun semn în dreptul numelui (${t.faraVot ?? 0} la acest vot).`}
        </p>
      )}

      {v.members.length > 0 && <Nominal v={v} pages={pages} />}

      <div className="mt-2 border-t border-line pt-2">
        <a
          href={v.url}
          target="_blank"
          rel="noopener noreferrer"
          {...trackAttrs('official_source_open', { bill_id: billId, source: `${v.chamber}_vote` })}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-link underline underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-focus"
        >
          Votul pe {CHAMBER_SITE[v.chamber]}
          <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="sr-only">(se deschide într-o filă nouă)</span>
        </a>
      </div>
    </div>
  );
}

function Committee({ list, billId }: { list: CommitteeStatement[]; billId: string }) {
  const final = list.filter((c) => !c.preliminary);
  const shown = final.length ? final : list;

  return (
    <div className="mt-6 border-t border-line pt-6">
      <h3 className="font-display text-xl font-normal tracking-[-0.015em] text-ink">În comisie</h3>
      <p className="mt-1 text-sm leading-6 text-muted">
        Comisiile nu votează nominal. Raportul spune doar cu ce majoritate s-a hotărât.
      </p>
      <ul className="mt-3 space-y-3">
        {shown.map((c, i) => (
          <li key={`${c.report}-${i}`} className="rounded-xl bg-sunken px-4 py-3.5">
            <p className="text-sm font-semibold text-ink">
              {c.majority === 'unanimitate' ? 'Cu unanimitate de voturi' : 'Cu majoritate de voturi'}
              {c.proposal && `, ${c.preliminary ? 'raport preliminar' : 'raport'} de ${c.proposal}`}
              {c.billNumber && <span className="font-normal tabular-nums text-muted"> · {c.billNumber}</span>}
            </p>
            <blockquote className="mt-1.5 text-[15px] leading-7 text-body">„{c.quote}”</blockquote>
            {c.report && (
              <a
                href={c.report}
                target="_blank"
                rel="noopener noreferrer"
                {...trackAttrs('official_source_open', { bill_id: billId, source: 'cdep_report' })}
                className="mt-1.5 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-link underline underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-focus"
              >
                Raportul comisiei (PDF)
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
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
 * Cum s-a votat: voturile nominale din plen (Senat și Cameră, în ordine cronologică), cu totalurile și ponderea
 * fiecărui grup parlamentar, parlamentarii care au votat diferit de grupul lor, lista nominală și raportul comisiei.
 */
export default function BillVotes({ data, pages, billId }: { data: Data | null; pages: Set<string>; billId: string }) {
  if (!data || (!data.votes.length && !data.committee.length)) return null;

  const sortedVotes = [...data.votes].sort((a, b) => {
    const keyA = `${a.date}T${a.time ?? '00:00'}`;
    const keyB = `${b.date}T${b.time ?? '00:00'}`;
    return keyA.localeCompare(keyB);
  });

  const chambers = new Set(sortedVotes.map((v) => v.chamber));

  return (
    <section id="voturi" aria-labelledby="voturi-titlu" className={`${panel} mt-6 scroll-mt-20 p-5 sm:p-8`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="voturi-titlu" className="inline-flex items-center gap-2 text-lg font-semibold text-ink">
          <Vote className="h-5 w-5 shrink-0 text-link" aria-hidden />
          Cum s-a votat
        </h2>
        {sortedVotes.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs tabular-nums text-muted" aria-label="Ordinea voturilor în plen">
            {sortedVotes.map((v, i) => (
              <span key={`${v.chamber}-${v.id}-step`} className="inline-flex items-center gap-1.5">
                {i > 0 && <ArrowRight className="h-3.5 w-3.5 text-faint" aria-hidden />}
                <span className="font-semibold text-ink">
                  {i + 1}. {CHAMBER_NAME[v.chamber]}
                </span>
                <span>({formatDateRo(v.date)})</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <p className="mt-2 max-w-[68ch] text-[15px] leading-7 text-body">
        {sortedVotes.length
          ? `Voturile nominale din plen, în ordinea în care au avut loc la ${
              chambers.size === 2
                ? 'Senat și Camera Deputaților'
                : chambers.has('senat')
                  ? 'Senat'
                  : 'Camera Deputaților'
            }. Lungimea barelor arată mărimea fiecărui grup prezent la vot.`
          : 'Nu avem încă un vot nominal din plen pentru proiectul acesta.'}
      </p>

      {sortedVotes.length > 0 && (
        <ol className="mt-5 divide-y divide-line border-t border-line">
          {sortedVotes.map((v, index) => (
            <li key={`${v.chamber}-${v.id}`} className="py-6 first:pt-5 last:pb-2">
              <PlenaryBlock
                v={v}
                pages={pages}
                billId={billId}
                stepIndex={index + 1}
                totalSteps={sortedVotes.length}
              />
            </li>
          ))}
        </ol>
      )}

      {data.committee.length > 0 && <Committee list={data.committee} billId={billId} />}
    </section>
  );
}
```

# gata: eroare: timeout după 1815s în 1815s
