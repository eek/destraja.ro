'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { btnSecondary, linkCls, panel } from '@/components/ui';

// Rapoartele despre acte și legăturile lor, de pe destraja.ro/acte (worker/act-report.ts). Un raport deschis (nou,
// contestat, în lucru) scoate legătura din contoarele și starea paginii actului până la reverificare
// (scripts/acte-contested.mjs). Textul e scris de necunoscuți: doar text, fără HTML.

type Status = 'new' | 'contested' | 'review' | 'confirmed' | 'rejected' | 'spam';
interface Row {
  id: string;
  kind: 'act' | 'relatie';
  act_slug: string;
  relation_id: string | null;
  generation: number | null;
  type: string | null;
  comment: string;
  created_at: string;
  status: Status;
  admin_note: string | null;
}

const LABEL: Record<Status, string> = {
  new: 'nou',
  contested: 'în reverificare',
  review: 'în lucru',
  confirmed: 'cititorul avea dreptate',
  rejected: 'datele erau corecte',
  spam: 'spam',
};
const NEXT: Status[] = ['contested', 'review', 'confirmed', 'rejected', 'spam'];

export default function AdminActReports() {
  const [group, setGroup] = useState<'open' | 'closed' | 'all'>('open');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [counts, setCounts] = useState<Partial<Record<Status, number>>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const r = await fetch(`/api/admin/act-reports?group=${group}`, { credentials: 'same-origin', redirect: 'manual' });
    if (!r.ok) {
      setError(`Lista nu s-a încărcat (${r.status}).`);
      return;
    }
    const data = (await r.json()) as { reports: Row[]; counts: Partial<Record<Status, number>> };
    setRows(data.reports);
    setCounts(data.counts);
  }, [group]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(row: Row, status: Status) {
    const r = await fetch(`/api/admin/act-reports/${row.id}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status, from: row.status }),
    });
    if (!r.ok) setError(r.status === 409 ? 'Raportul s-a schimbat între timp; reîncarc.' : `Nu s-a salvat (${r.status}).`);
    void load();
  }

  return (
    <section className="mt-14" aria-labelledby="acte-rapoarte">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="acte-rapoarte" className="font-display text-2xl font-normal">
          Acte și legături (destraja.ro/acte)
        </h2>
        <div className="flex items-center gap-2 text-sm">
          {(['open', 'closed', 'all'] as const).map((g) => (
            <button key={g} type="button" onClick={() => setGroup(g)} className={`rounded-md px-3 py-1.5 ${group === g ? 'bg-brand text-on-brand' : 'bg-sunken text-ink'}`}>
              {g === 'open' ? 'Deschise' : g === 'closed' ? 'Închise' : 'Toate'}
            </button>
          ))}
          <button type="button" onClick={() => void load()} className={`${btnSecondary} h-9 px-3`} aria-label="Reîncarcă">
            <RefreshCw className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      <p className="mt-2 text-sm text-muted">
        {Object.entries(counts)
          .map(([s, n]) => `${LABEL[s as Status] ?? s}: ${n}`)
          .join(' · ') || 'Niciun raport.'}
      </p>
      {error && <p className="mt-3 text-sm text-risk-red-text">{error}</p>}
      <ul className="mt-4 space-y-3">
        {(rows ?? []).map((r) => (
          <li key={r.id} className={`${panel} p-4`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="rounded-full bg-sunken px-2 py-0.5 text-xs font-semibold">{LABEL[r.status]}</span>
              <a className={linkCls} href={`/acte/${r.act_slug}`} target="_blank" rel="noopener noreferrer">
                {r.act_slug}
              </a>
              {r.kind === 'relatie' && <span className="font-mono text-xs text-muted">legătura {r.relation_id}</span>}
              {r.type && <span className="text-muted">tip: {r.type}</span>}
              <span className="text-muted">
                {new Date(r.created_at).toLocaleString('ro-RO')}
                {r.generation ? ` · generația ${r.generation}` : ''}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-[15px] leading-7 text-body">{r.comment}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {NEXT.filter((s) => s !== r.status).map((s) => (
                <button key={s} type="button" onClick={() => void setStatus(r, s)} className="rounded-md border border-line px-2 py-1 hover:bg-sunken">
                  {LABEL[s]}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
