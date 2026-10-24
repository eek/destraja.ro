'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronDown, Download, ExternalLink, Flame, Layers, Search, X } from 'lucide-react';
import type { BillLite } from '@/lib/types';
import { MODELS } from '@/lib/site';
import { RISK } from '@/lib/risk';
import { countWord, deadlineInfo, DEADLINE_TONE, fmt, normalize } from '@/lib/format';
import { agreement, camps, modelScore } from '@/lib/stats';
import { billsCsv, citation, downloadFile, isoToday } from '@/lib/export';
import { CopyButton, PartyTag, RiskDot, btnSecondary, inputCls } from '@/components/ui';

type DSort = 'risc' | 'termen' | 'opinii' | 'dezacord';
const AGREE_TONE = { strong: 'text-muted', partial: 'text-muted', split: 'text-ink' } as const;

const chip = (on: boolean) =>
  `inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors ${
    on ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface text-body hover:border-line-strong hover:text-ink'
  }`;

export default function Dossier({
  bills,
  parties,
  onClearParties,
  copied,
  onCopy,
}: {
  bills: BillLite[];
  parties: string[];
  onClearParties: () => void;
  copied: string | null;
  onCopy: (key: string, text: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<DSort>('risc');
  const [desc, setDesc] = useState(true);
  const [onlyBridge, setOnlyBridge] = useState(false);
  const [onlyCes, setOnlyCes] = useState(false);
  const [onlyUrgent, setOnlyUrgent] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [limit, setLimit] = useState(20);

  const rows = useMemo(() => {
    const q = normalize(query.trim());
    const list = bills.filter((b) => {
      if (parties.length && !parties.every((p) => b.parties.includes(p))) return false;
      if (onlyBridge && !camps(b.parties).bridge) return false;
      if (onlyCes && !b.cesNegative) return false;
      if (onlyUrgent && !b.emergencyRequested) return false;
      if (onlyOpen && b.daysRemaining < 0) return false;
      return !q || normalize(`${b.id} ${b.cod} ${b.analysis.consensus.plainTitle} ${b.officialTitle} ${b.initiators.map((i) => i.name).join(' ')}`).includes(q);
    });
    const val = (b: BillLite) =>
      sort === 'risc' ? b.analysis.consensus.riskScore : sort === 'termen' ? b.daysRemaining : sort === 'opinii' ? b.opinionsCount : agreement(b).spread;
    return list.sort((a, b) => (desc ? val(b) - val(a) : val(a) - val(b)) || a.id.localeCompare(b.id, 'ro', { numeric: true }));
  }, [bills, parties, onlyBridge, onlyCes, onlyUrgent, onlyOpen, query, sort, desc]);

  const setSortKey = (k: DSort) => {
    if (k === sort) setDesc((d) => !d);
    else {
      setSort(k);
      setDesc(k !== 'termen');
    }
  };

  const sortHead = (k: DSort, label: string) => (
    <th scope="col" className="px-2 py-3 text-right font-semibold" aria-sort={sort === k ? (desc ? 'descending' : 'ascending') : 'none'}>
      <button type="button" onClick={() => setSortKey(k)} className={`inline-flex items-center gap-1 rounded hover:text-ink ${sort === k ? 'text-ink' : ''}`}>
        {label}
        <ChevronDown className={`h-3 w-3 transition-transform ${sort === k ? 'opacity-100' : 'opacity-30'} ${sort === k && !desc ? 'rotate-180' : ''}`} aria-hidden />
      </button>
    </th>
  );

  const toggles = [
    { key: 'open', label: 'Doar în consultare', on: onlyOpen, set: setOnlyOpen, icon: null },
    { key: 'bridge', label: 'Putere și opoziție', on: onlyBridge, set: setOnlyBridge, icon: Layers },
    { key: 'ces', label: 'Aviz negativ CES', on: onlyCes, set: setOnlyCes, icon: AlertTriangle },
    { key: 'urgent', label: 'Urgență cerută', on: onlyUrgent, set: setOnlyUrgent, icon: Flame },
  ];

  return (
    <div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative flex-1 lg:max-w-sm">
          <span className="sr-only">Caută în tabel</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cod, titlu sau inițiator…" className={`${inputCls} h-11 pl-10 pr-3`} />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {parties.length > 0 && (
            <button type="button" onClick={onClearParties} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-brand-soft px-3 text-xs font-semibold text-ink">
              {parties.join(' + ')}
              <X className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">Elimină filtrul de partid</span>
            </button>
          )}
          {toggles.map((t) => (
            <button key={t.key} type="button" aria-pressed={t.on} onClick={() => t.set(!t.on)} className={chip(t.on)}>
              {t.icon && <t.icon className="h-3.5 w-3.5" aria-hidden />}
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => downloadFile(`lastraja-proiecte-${isoToday()}.csv`, billsCsv(rows))}
          disabled={!rows.length}
          className={`${btnSecondary} min-h-10 px-3.5 text-xs lg:ml-auto`}
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          CSV cu selecția ({rows.length})
        </button>
      </div>

      <div className="relative mt-4 overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[1000px] border-collapse text-left text-sm">
          <caption className="sr-only">Proiectele urmărite, cu scorurile celor trei modele AI</caption>
          <thead className="bg-sunken/70 text-xs text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">
                Proiect
              </th>
              {sortHead('risc', 'Consens')}
              {MODELS.map((m) => (
                <th key={m.key} scope="col" className="px-2 py-3 text-right font-semibold">
                  {m.name}
                </th>
              ))}
              {sortHead('dezacord', 'Dezacord')}
              <th scope="col" className="px-3 py-3 font-semibold">
                Partide
              </th>
              {sortHead('termen', 'Termen')}
              {sortHead('opinii', 'Opinii')}
              <th scope="col" className="px-3 py-3">
                <span className="sr-only">Acțiuni</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-sm text-muted">
                  Niciun proiect nu corespunde filtrelor.
                </td>
              </tr>
            )}
            {rows.slice(0, limit).map((b) => {
              const lvl = b.analysis.consensus.riskLevel;
              const ag = agreement(b);
              const dl = deadlineInfo(b.daysRemaining);
              return (
                <tr key={b.id} className="align-top transition-colors hover:bg-sunken/50">
                  <td className="max-w-[22rem] px-4 py-3">
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <RiskDot level={lvl} />
                      <span className="tabular-nums">{b.id}</span>
                      {b.cesNegative && <span className="font-semibold text-body">CES negativ</span>}
                      {b.emergencyRequested && <span className="font-semibold text-ink">{b.emergencyApproved ? 'Urgență aprobată' : 'Urgență'}</span>}
                    </div>
                    <Link href={`/legi/${b.slug}`} className="mt-1 block font-semibold leading-snug text-ink hover:underline hover:underline-offset-4">
                      {b.analysis.consensus.plainTitle}
                    </Link>
                  </td>
                  <td className="px-2 py-3 text-right">
                    <span className={`font-semibold tabular-nums ${RISK[lvl].text}`}>{fmt(b.analysis.consensus.riskScore)}</span>
                  </td>
                  {MODELS.map((m) => (
                    <td key={m.key} className="px-2 py-3 text-right tabular-nums text-body">
                      {fmt(modelScore(b, m.key))}
                    </td>
                  ))}
                  <td className="px-2 py-3 text-right">
                    <span className={`text-xs font-semibold tabular-nums ${AGREE_TONE[ag.tone]}`} title={ag.label}>
                      {fmt(ag.spread)}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex max-w-[11rem] flex-wrap gap-1">
                      {b.parties.map((p) => (
                        <PartyTag key={p} party={p} />
                      ))}
                      {camps(b.parties).bridge && <span className="w-full text-[11px] font-semibold text-cross">Putere și opoziție</span>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-2 py-3 text-right">
                    <span className="text-xs tabular-nums text-body">{b.consultationDeadline.replace(/-/g, '.')}</span>
                    <span className={`block text-[11px] font-semibold ${DEADLINE_TONE[dl.tone]}`}>{dl.short}</span>
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums text-body">{b.opinionsCount}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <CopyButton compact label={`Copiază citatul pentru ${b.id}`} active={copied === `row-${b.id}`} onClick={() => onCopy(`row-${b.id}`, citation(b))} />
                      <a
                        href={b.sheetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Fișa ${b.id} pe senat.ro`}
                        title="Fișa oficială pe senat.ro"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line-strong text-body transition-colors hover:border-muted hover:text-ink"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      </a>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-5 text-muted">
          <span className="lg:hidden">Tabelul se derulează pe orizontală. </span>„Dezacord” = diferența dintre cel mai mare și cel mai mic scor dat de cele trei modele.
        </p>
        {rows.length > limit && (
          <button type="button" onClick={() => setLimit(rows.length)} className={`${btnSecondary} min-h-10 px-4 text-xs`}>
            Arată toate cele {countWord(rows.length, 'proiect', 'proiecte')}
            <ChevronDown className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
