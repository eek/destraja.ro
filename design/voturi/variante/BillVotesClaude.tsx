import Link from 'next/link';
import { ArrowRight, ChevronDown, ExternalLink } from 'lucide-react';
import type { BillVotes as Data, CommitteeStatement, PlenaryVote, VoteChoice, VoteMember } from '@/lib/types';
import { CHAMBER_NAME, CHAMBER_SITE, CHOICES, MEMBER_WORD, resultHeadline, subjectLabel, voteLabel } from '@/lib/vote-text';
import { PARTY_ORDER } from '@/lib/site';
import { countWord, formatDateRo } from '@/lib/format';
import { trackAttrs } from '@/lib/analytics';
import { PartyTag, panel } from '@/components/ui';

// Votul se citește din formă, nu din culoare: plin = pentru, gol = contra, hașurat = abținere, punctat = n-a votat.
// Doar navy și ardezie: roșu, galben și verde înseamnă riscul, iar albastrul și violetul, coalițiile.
const MARK: Record<VoteChoice, string> = {
  pentru: 'bg-brand',
  contra: 'border-[1.5px] border-ink bg-surface',
  abtinere: 'bg-[repeating-linear-gradient(135deg,var(--muted)_0_1.5px,transparent_1.5px_4px)] border border-muted',
  'nu a votat': 'border border-dashed border-muted bg-transparent',
  'fără vot': 'bg-sunken',
};
const rank = (p: string) => {
  const i = PARTY_ORDER.indexOf(p);
  return i < 0 ? PARTY_ORDER.length - 1 : i;
};
const COUNT: Record<VoteChoice, keyof PlenaryVote['totals']> = {
  pentru: 'pentru',
  contra: 'contra',
  abtinere: 'abtineri',
  'nu a votat': 'nuAuVotat',
  'fără vot': 'faraVot',
};

function Mark({ choice, className = 'h-2.5 w-2.5' }: { choice: VoteChoice; className?: string }) {
  return <span className={`inline-block shrink-0 rounded-[2px] ${MARK[choice]} ${className}`} aria-hidden />;
}

/** Grupurile cu membrii lor, în ordinea fixă a partidelor; „Neafiliați” la final. */
function byParty(members: VoteMember[]) {
  const map = new Map<string, VoteMember[]>();
  for (const m of members) map.set(m.party, [...(map.get(m.party) ?? []), m]);
  return [...map.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
}

/** Votul majorității unui grup; fără majoritate clară (egalitate) nu numim pe nimeni „altfel”. */
function majority(members: VoteMember[]): VoteChoice | null {
  const n = new Map<VoteChoice, number>();
  for (const m of members) n.set(m.vote, (n.get(m.vote) ?? 0) + 1);
  const [first, second] = [...n.entries()].sort((a, b) => b[1] - a[1]);
  return first && (!second || first[1] > second[1]) ? first[0] : null;
}

function MpName({ m, pages }: { m: VoteMember; pages: Set<string> }) {
  return pages.has(m.mp) ? (
    <Link href={`/parlamentari/${m.mp}`} className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
      {m.name}
    </Link>
  ) : (
    <span className="text-ink">{m.name}</span>
  );
}

/** Câte un pătrat pentru fiecare parlamentar listat, grupați pe partide: mărimea grupului se vede singură. */
function Seats({ v }: { v: PlenaryVote }) {
  const parties = byParty(v.members);
  return (
    <div className="mt-5 flex flex-wrap gap-x-3 gap-y-2" aria-hidden>
      {parties.map(([party, list]) => (
        <div key={party} className="flex flex-wrap gap-[3px]" title={party}>
          {CHOICES.flatMap((c) => list.filter((m) => m.vote === c)).map((m, i) => (
            <Mark key={`${m.mp}-${i}`} choice={m.vote} />
          ))}
        </div>
      ))}
    </div>
  );
}

function Legend({ v }: { v: PlenaryVote }) {
  const shown = CHOICES.filter((c) => (v.totals[COUNT[c]] ?? 0) > 0 || c === 'pentru' || c === 'contra' || c === 'abtinere');
  return (
    <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-body">
      {shown.map((c) => (
        <li key={c} className="inline-flex items-center gap-2">
          <Mark choice={c} className="h-3 w-3" />
          {voteLabel(c, v.question)}
          <span className="font-semibold tabular-nums text-ink">{v.totals[COUNT[c]] ?? 0}</span>
        </li>
      ))}
    </ul>
  );
}

function PartyTable({ v }: { v: PlenaryVote }) {
  const max = Math.max(...v.parties.map((p) => p.prezenti), 1);
  const rows = [...v.parties].sort((a, b) => b.prezenti - a.prezenti || rank(a.party) - rank(b.party));
  const nv = v.parties.some((p) => p.nuAuVotat);
  return (
    <table className="mt-6 w-full border-collapse text-sm">
      <caption className="sr-only">Cum a votat fiecare grup parlamentar</caption>
      <thead>
        <tr className="text-left text-xs font-semibold text-muted">
          <th scope="col" className="pb-2 font-semibold">Grup</th>
          <th scope="col" className="hidden pb-2 sm:table-cell">
            <span className="sr-only">Mărimea grupului și împărțirea voturilor</span>
          </th>
          <th scope="col" className="pb-2 text-right font-semibold">{v.question === 'respingere' ? 'Pt. resp.' : 'Pentru'}</th>
          <th scope="col" className="pb-2 text-right font-semibold">Contra</th>
          <th scope="col" className="pb-2 text-right font-semibold">Abț.</th>
          {nv && <th scope="col" className="pb-2 text-right font-semibold">N-au votat</th>}
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {rows.map((p) => (
          <tr key={p.party} className="border-t border-line">
            <th scope="row" className="py-2.5 pr-3 text-left font-normal">
              <span className="inline-flex items-center gap-2">
                <PartyTag party={p.party} />
                <span className="text-xs text-muted">{p.prezenti}</span>
              </span>
            </th>
            <td className="hidden w-full py-2.5 pr-4 sm:table-cell">
              {/* Lățimea totală e mărimea grupului față de cel mai mare; în interior, împărțirea voturilor. */}
              <div className="flex h-2.5 gap-px" style={{ width: `${(p.prezenti / max) * 100}%` }} aria-hidden>
                {(['pentru', 'contra', 'abtinere', 'nu a votat'] as VoteChoice[]).map((c) => {
                  const n = p[COUNT[c] as 'pentru'] ?? 0;
                  return n ? <span key={c} className={`rounded-[2px] ${MARK[c]}`} style={{ flexGrow: n }} /> : null;
                })}
              </div>
            </td>
            {(['pentru', 'contra', 'abtinere', ...(nv ? ['nu a votat'] : [])] as VoteChoice[]).map((c) => {
              const n = p[COUNT[c] as 'pentru'] ?? 0;
              return (
                <td key={c} className={`w-12 py-2.5 text-right ${n ? 'font-semibold text-ink' : 'text-faint'}`}>
                  {n}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Cine a votat altfel decât majoritatea propriului grup (fără neafiliați, care nu sunt un grup). */
function Dissent({ v, pages }: { v: PlenaryVote; pages: Set<string> }) {
  const rows = byParty(v.members.filter((m) => m.vote !== 'fără vot'))
    .filter(([party]) => party !== 'Neafiliați')
    .map(([party, list]) => {
      const maj = majority(list);
      return { party, maj, others: maj ? list.filter((m) => m.vote !== maj) : [] };
    })
    .filter((r) => r.others.length);
  if (!rows.length) return null;
  const total = rows.reduce((s, r) => s + r.others.length, 0);
  return (
    <div className="mt-6 rounded-xl bg-sunken px-4 py-4 sm:px-5">
      <h4 className="text-sm font-semibold text-ink">
        {total === 1 ? 'Un parlamentar a votat altfel decât grupul lui' : `${total} parlamentari au votat altfel decât grupul lor`}
      </h4>
      <ul className="mt-2 space-y-2 text-sm leading-6 text-body">
        {rows.map((r) => (
          <li key={r.party}>
            <PartyTag party={r.party} />{' '}
            <span className="text-muted">grupul a votat {voteLabel(r.maj!, v.question).toLowerCase()}:</span>{' '}
            {r.others.map((m, i) => (
              <span key={`${m.mp}-${i}`}>
                {i > 0 && ', '}
                <MpName m={m} pages={pages} /> <span className="text-muted">({voteLabel(m.vote, v.question).toLowerCase()})</span>
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Lista nominală pe grupuri: votul majorității o dată, apoi numele; excepțiile au votul scris lângă nume. */
function Nominal({ v, pages }: { v: PlenaryVote; pages: Set<string> }) {
  const [one, many] = MEMBER_WORD[v.chamber];
  return (
    <details className="group mt-5 border-t border-line">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-2 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <span>
          Votul fiecărui {one} <span className="font-normal tabular-nums text-muted">({v.members.length})</span>
        </span>
        <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="divide-y divide-line pb-2">
        {byParty(v.members).map(([party, list]) => {
          const maj = majority(list);
          const sorted = [...list].sort((a, b) => Number(a.vote === maj) - Number(b.vote === maj) || a.name.localeCompare(b.name, 'ro'));
          return (
            <div key={party} className="grid gap-x-4 gap-y-1.5 py-3 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <PartyTag party={party} />
                <span className="tabular-nums text-muted">{list.length}</span>
                {maj && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                    <Mark choice={maj} />
                    {list.every((m) => m.vote === maj) ? 'toți' : 'majoritatea'}: {voteLabel(maj, v.question).toLowerCase()}
                  </span>
                )}
              </p>
              <p className="text-sm leading-6 text-body">
                {sorted.map((m, i) => (
                  <span key={`${m.mp}-${i}`}>
                    {i > 0 && ', '}
                    <MpName m={m} pages={pages} />
                    {m.vote !== maj && <span className="font-semibold text-ink"> · {voteLabel(m.vote, v.question).toLowerCase()}</span>}
                  </span>
                ))}
              </p>
            </div>
          );
        })}
        <p className="pt-3 text-xs leading-5 text-muted">
          {v.chamber === 'cdep'
            ? 'Camera publică doar deputații prezenți la vot; absenții nu apar în listă.'
            : v.totals.faraVot
              ? `„Fără vot înregistrat”: ${v.totals.faraVot === 1 ? `un ${one} listat` : `${v.totals.faraVot} ${many} listați`} de Senat fără niciun vot în dreptul numelui.`
              : 'Lista Senatului, cum e publicată pe senat.ro.'}
        </p>
      </div>
    </details>
  );
}

function Plenary({ v, pages, billId }: { v: PlenaryVote; pages: Set<string>; billId: string }) {
  const [, many] = MEMBER_WORD[v.chamber];
  return (
    <article aria-labelledby={`vot-${v.id}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id={`vot-${v.id}`} className="font-display text-[1.45rem] leading-tight text-ink">
          {resultHeadline(v)}
        </h3>
        <p className="text-sm tabular-nums text-muted">
          {formatDateRo(v.date)}
          {v.time && `, ora ${v.time}`}
        </p>
      </div>
      <p className="mt-1 text-sm text-muted">
        {subjectLabel(v)}
        {v.billNumber && <span className="tabular-nums"> · {v.billNumber}</span>}
        {' · '}
        <span className="tabular-nums">{countWord(v.totals.prezenti, `${MEMBER_WORD[v.chamber][0]} prezent`, `${many} prezenți`)}</span>
      </p>
      {v.question === 'respingere' && (
        <p className="mt-3 max-w-[62ch] text-[15px] leading-7 text-body">
          S-a votat <strong className="font-semibold text-ink">respingerea</strong> proiectului, deci „pentru” înseamnă pentru respingere.
        </p>
      )}
      <Seats v={v} />
      <Legend v={v} />
      {v.parties.length > 0 && <PartyTable v={v} />}
      <Dissent v={v} pages={pages} />
      {v.members.length > 0 && <Nominal v={v} pages={pages} />}
      <a
        href={v.url}
        target="_blank"
        rel="noopener noreferrer"
        {...trackAttrs('official_source_open', { bill_id: billId, source: `${v.chamber}_vote` })}
        className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-link underline underline-offset-4"
      >
        Votul pe {CHAMBER_SITE[v.chamber]}
        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">(se deschide într-o filă nouă)</span>
      </a>
    </article>
  );
}

function Committee({ list, billId }: { list: CommitteeStatement[]; billId: string }) {
  const final = list.filter((c) => !c.preliminary);
  return (
    <div className="mt-2 border-t border-line pt-6">
      <h3 className="font-display text-[1.25rem] leading-tight text-ink">În comisie</h3>
      <p className="mt-1 max-w-[62ch] text-sm leading-6 text-muted">Comisiile nu votează nominal: raportul spune doar cu ce majoritate s-a hotărât.</p>
      <ul className="mt-3 divide-y divide-line">
        {(final.length ? final : list).map((c, i) => (
          <li key={`${c.report}-${i}`} className="py-3">
            <p className="text-sm font-semibold text-ink">
              {c.majority === 'unanimitate' ? 'Cu unanimitate de voturi' : 'Cu majoritate de voturi'}
              {c.proposal && `, ${c.preliminary ? 'raport preliminar' : 'raport'} de ${c.proposal}`}
            </p>
            <blockquote className="mt-1 border-l-2 border-line-strong pl-3 text-[15px] leading-7 text-body">„{c.quote}”</blockquote>
            {c.report && (
              <a
                href={c.report}
                target="_blank"
                rel="noopener noreferrer"
                {...trackAttrs('official_source_open', { bill_id: billId, source: 'cdep_report' })}
                className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-link underline underline-offset-4"
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

/** Parcursul pe scurt, când proiectul a fost votat în ambele camere: cine a votat primul și cum. */
function Route({ votes }: { votes: PlenaryVote[] }) {
  if (votes.length < 2) return null;
  return (
    <ol className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      {votes.map((v, i) => (
        <li key={`${v.chamber}-${v.id}`} className="inline-flex items-center gap-3">
          {i > 0 && <ArrowRight className="h-4 w-4 text-faint" aria-hidden />}
          <a href={`#vot-${v.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-sunken px-3 text-body hover:text-ink">
            <span className="font-semibold text-ink">{CHAMBER_NAME[v.chamber]}</span>
            <span className="tabular-nums text-muted">{formatDateRo(v.date)}</span>
            <span>{v.result === 'adoptat' ? 'adoptat' : v.result === 'respins' ? 'respins' : 'fără majoritate'}</span>
          </a>
        </li>
      ))}
    </ol>
  );
}

/**
 * Cum s-a votat, varianta „registru”: rezultatul în cuvinte, câte un pătrat pentru fiecare parlamentar (votul se citește din
 * formă), grupurile la mărimea lor, cine a votat altfel decât grupul și lista nominală pe grupuri.
 */
export default function BillVotes({ data, pages, billId }: { data: Data | null; pages: Set<string>; billId: string }) {
  if (!data || (!data.votes.length && !data.committee.length)) return null;
  return (
    <section id="voturi" aria-labelledby="voturi-titlu" className={`${panel} mt-6 scroll-mt-20 p-5 sm:p-8`}>
      <h2 id="voturi-titlu" className="font-display text-2xl leading-tight text-ink sm:text-[1.75rem]">
        Cum s-a votat
      </h2>
      <p className="mt-1.5 max-w-[62ch] text-[15px] leading-7 text-body">
        {data.votes.length
          ? 'Voturile nominale din plen, cum le publică fiecare cameră. Fiecare pătrat e un parlamentar prezent, grupat pe partide.'
          : 'Nu avem încă un vot nominal din plen pentru proiectul acesta.'}
      </p>
      <Route votes={data.votes} />
      {data.votes.length > 0 && (
        <div className="mt-6 divide-y divide-line border-t border-line">
          {data.votes.map((v) => (
            <div key={`${v.chamber}-${v.id}`} className="py-7 first:pt-6">
              <Plenary v={v} pages={pages} billId={billId} />
            </div>
          ))}
        </div>
      )}
      {data.committee.length > 0 && <Committee list={data.committee} billId={billId} />}
    </section>
  );
}
