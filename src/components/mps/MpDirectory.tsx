'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ChevronDown, ChevronsUpDown, Mail, Search, X } from 'lucide-react';
import type { RiskLevel } from '@/lib/types';
import { PARTY_ORDER, partyFullName } from '@/lib/site';
import { RISK, levelFromScore } from '@/lib/risk';
import { countWord, fmt, initialRows, normalize } from '@/lib/format';
import type { MpStat } from '@/lib/stats';
import { EmptyState, PartyTag, RiskDot, btnSecondary, inputCls, segCls } from '@/components/ui';
import type { ReactNode } from 'react';
import { trackAttrs } from '@/lib/analytics';

type SortKey = 'ridicat' | 'proiecte' | 'medie' | 'nume';
type Sort = { key: SortKey; dir: 'asc' | 'desc' };
// Implicit după scorul mediu al proiectelor semnate: un singur proiect roșu nu urcă pe cineva în fața celor cu multe riscante.
const DEFAULT_SORT: Sort = { key: 'medie', dir: 'desc' };
const PAGE = 40;

const roleLabel = (role: string) => (role === 'senator' ? 'Senator' : role === 'deputat' ? 'Deputat' : role);

// Statisticile vin calculate de pe server (Senat + Cameră), ca semnăturile tuturor proiectelor să nu ajungă în browser.
// levels: nivelul de risc al fiecărui proiect, după id. withEmail: parlamentarii cu e-mail pe fișa oficială.
export default function MpDirectory({ mpStats, levels, withEmail = [] }: { mpStats: MpStat[]; levels: Record<string, RiskLevel>; withEmail?: string[] }) {
  const emailSet = useMemo(() => new Set(withEmail), [withEmail]);

  const parties = useMemo(() => {
    const n = new Map<string, number>();
    mpStats.forEach((m) => n.set(m.party, (n.get(m.party) ?? 0) + 1));
    const known = PARTY_ORDER.filter((p) => n.has(p));
    return [...known, ...[...n.keys()].filter((p) => !known.includes(p)).sort()].map((p) => ({ party: p, count: n.get(p)! }));
  }, [mpStats]);

  const [query, setQuery] = useState('');
  const [party, setParty] = useState('all');
  const [role, setRole] = useState<'all' | 'senator' | 'deputat'>('all');
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  // Click pe o coloană: o ordonează (numerele descrescător, numele alfabetic); încă un click inversează ordinea.
  const sortBy = (key: SortKey) =>
    setSort((cur) => (cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'nume' ? 'asc' : 'desc' }));
  const [visible, setVisible] = useState(PAGE);

  const list = useMemo(() => {
    const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
    const val = (m: MpStat) => (sort.key === 'ridicat' ? m.redCount : sort.key === 'proiecte' ? m.billsCount : m.avgRiskScore);
    const sign = sort.dir === 'asc' ? 1 : -1;
    return mpStats
      .filter((m) => (party === 'all' || m.party === party) && (role === 'all' || m.role === role))
      .filter((m) => {
        const text = normalize(m.name);
        return terms.every((t) => text.includes(t));
      })
      .sort((a, b) =>
        sort.key === 'nume'
          ? sign * a.name.localeCompare(b.name, 'ro')
          : sign * (val(a) - val(b)) || b.redCount - a.redCount || b.billsCount - a.billsCount || a.name.localeCompare(b.name, 'ro'),
      );
  }, [mpStats, query, party, role, sort]);

  const set = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setVisible(PAGE);
  };
  const shown = initialRows(list.length, visible);
  const hasFilters = query.trim() !== '' || party !== 'all' || role !== 'all';

  return (
    <div>
      <div className="space-y-3 border-b border-line pb-5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <label className="relative block">
            <span className="sr-only">Caută un parlamentar după nume</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => set(setQuery)(e.target.value)}
              placeholder="Numele senatorului sau deputatului"
              className={`${inputCls} pl-11 pr-4`}
              autoComplete="off"
            />
          </label>
          <div role="group" aria-label="Camera" className="flex rounded-lg bg-sunken p-1">
            {(['all', 'senator', 'deputat'] as const).map((r) => (
              <button key={r} type="button" aria-pressed={role === r} onClick={() => set(setRole)(r)} {...trackAttrs('mp_filter', { filter: 'chamber', value: r })} className={`${segCls(role === r)} flex-1 justify-center px-4 text-sm`}>
                {r === 'all' ? 'Toți' : r === 'senator' ? 'Senatori' : 'Deputați'}
              </button>
            ))}
          </div>
        </div>

        <div role="group" aria-label="Partid" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0">
          {[{ party: 'all', count: mpStats.length }, ...parties].map((p) => {
            const on = party === p.party;
            return (
              <button
                key={p.party}
                type="button"
                aria-pressed={on}
                onClick={() => set(setParty)(p.party)}
                {...trackAttrs('mp_filter', { filter: 'party', value: p.party })}
                title={p.party === 'all' ? undefined : partyFullName(p.party)}
                className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition-colors ${
                  on ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface text-body hover:border-line-strong hover:text-ink'
                }`}
              >
                {p.party === 'all' ? 'Toate partidele' : p.party}
                <span className="font-normal tabular-nums opacity-75">{p.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <p role="status" aria-live="polite" className="py-4 text-sm text-muted">
        <strong className="font-semibold text-ink">{countWord(list.length, 'parlamentar', 'parlamentari')}</strong>
        {hasFilters ? ' corespund căutării' : ' au semnat proiectele urmărite'}
      </p>

      {list.length === 0 ? (
        <EmptyState
          title="Nu am găsit acest parlamentar"
          text="Încearcă doar o parte din nume, fără diacritice, sau caută în toate partidele. Lista cuprinde doar inițiatorii proiectelor aflate în consultare."
          action={
            hasFilters ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setParty('all');
                  setRole('all');
                }}
                className={`${btnSecondary} min-h-11 px-5 text-sm`}
              >
                <X className="h-4 w-4" aria-hidden />
                Șterge filtrele
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">Parlamentarii care au semnat proiectele urmărite; antetul coloanelor ordonează tabelul.</caption>
              <thead className="border-b border-line bg-sunken/60 text-xs text-muted">
                <tr>
                  <SortHeader label="Parlamentar" k="nume" sort={sort} onSort={sortBy} className="pl-4 sm:pl-6" />
                  <SortHeader label="Proiecte" k="proiecte" sort={sort} onSort={sortBy} numeric />
                  <SortHeader label={<>Risc<span className="hidden sm:inline"> ridicat</span></>} k="ridicat" sort={sort} onSort={sortBy} numeric />
                  <SortHeader label={<>Scor<span className="hidden sm:inline"> mediu</span></>} k="medie" sort={sort} onSort={sortBy} numeric className="pr-4 sm:pr-6" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.slice(0, shown).map((m) => (
                  <tr key={m.slug} className="group relative transition-colors hover:bg-sunken/50">
                    <td className="py-4 pl-4 pr-2 sm:pl-6">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {/* Linkul acoperă tot rândul, ca pe vechea listă. */}
                        <Link href={`/parlamentari/${m.slug}`} className="font-semibold text-ink after:absolute after:inset-0 group-hover:underline group-hover:underline-offset-4">
                          {m.name}
                        </Link>
                        <PartyTag party={m.party} />
                        <span className="text-xs text-muted">{roleLabel(m.role)}</span>
                        {emailSet.has(m.name) && (
                          <span title="Are un e-mail oficial publicat" className="inline-flex items-center text-muted">
                            <Mail className="h-3.5 w-3.5" aria-hidden />
                            <span className="sr-only">are un e-mail oficial publicat</span>
                          </span>
                        )}
                      </span>
                      <span className="mt-2 flex flex-wrap items-center gap-1" aria-label={`${m.redCount} cu risc ridicat, ${m.yellowCount} moderat, ${m.greenCount} redus`}>
                        {m.billIds.slice(0, 14).map((id) => (
                          <RiskDot key={id} level={levels[id] ?? 'green'} className="h-2.5 w-2.5" />
                        ))}
                        {m.billIds.length > 14 && <span className="ml-1 text-[11px] text-muted">+{m.billIds.length - 14}</span>}
                      </span>
                    </td>
                    <td className="px-2 py-4 text-right text-base font-semibold tabular-nums text-ink sm:px-4">{m.billsCount}</td>
                    <td className={`px-2 py-4 text-right text-base font-semibold tabular-nums sm:px-4 ${m.redCount ? 'text-risk-red-text' : 'text-ink'}`}>{m.redCount}</td>
                    <td className={`py-4 pl-2 pr-4 text-right text-base font-semibold tabular-nums sm:pl-4 sm:pr-6 ${RISK[levelFromScore(m.avgRiskScore)].text}`}>
                      {fmt(m.avgRiskScore)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-sm tabular-nums text-muted">
              Afișați {shown} din {list.length}
            </p>
            {shown < list.length && (
              <button type="button" onClick={() => setVisible((v) => v + PAGE)} className={`${btnSecondary} min-h-12 px-5 text-sm`}>
                Arată încă {initialRows(list.length, visible + PAGE) - shown}
                <ChevronDown className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Antetul unei coloane: un buton care ordonează tabelul, cu săgeata direcției și aria-sort pentru cititoarele de ecran. */
function SortHeader({
  label,
  k,
  sort,
  onSort,
  numeric = false,
  className = '',
}: {
  label: ReactNode;
  k: SortKey;
  sort: Sort;
  onSort: (k: SortKey) => void;
  numeric?: boolean;
  className?: string;
}) {
  const active = sort.key === k;
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={`px-2 py-1 font-semibold sm:px-4 ${numeric ? 'text-right' : ''} ${className}`}>
      <button
        type="button"
        onClick={() => onSort(k)}
        {...trackAttrs('mp_filter', { filter: 'sort', value: k })}
        className={`inline-flex min-h-10 items-center gap-1 rounded-md transition-colors hover:text-ink ${numeric ? 'flex-row-reverse' : ''} ${active ? 'text-ink' : ''}`}
      >
        <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? '' : 'opacity-50'}`} aria-hidden />
        <span>{label}</span>
      </button>
    </th>
  );
}
