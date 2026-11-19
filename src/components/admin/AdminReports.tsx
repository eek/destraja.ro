'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ExternalLink, Mail, MessageSquareText, RefreshCw, ShieldAlert } from 'lucide-react';
import { btnPrimary, btnSecondary, inputCls, linkCls, panel } from '@/components/ui';

// Panoul rapoartelor (/admin/rapoarte). Vorbește doar cu /api/admin/* (worker/admin.ts). Textul rapoartelor e scris de
// necunoscuți: îl afișăm doar ca text, niciodată ca HTML sau linkuri.

type Status = 'new' | 'review' | 'fixed' | 'rejected' | 'spam';
type Filter = 'open' | 'closed' | 'all' | Status;

interface Summary {
  id: string;
  billId: string;
  target: string;
  createdAt: string;
  status: Status;
  excerpt: string;
  name: string | null;
  hasNote: boolean;
}

interface Vote {
  verdict?: string;
  injection?: boolean;
  claimFound?: boolean;
  evidenceFound?: boolean;
}

interface Detail extends Summary {
  comment: string;
  triage: (Record<string, unknown> & { note?: string | null; suspicious?: boolean }) | null;
  reviewedAt: string | null;
  hasEmail: boolean;
  notifiedAt: string | null;
  note: string | null;
  noteAt: string | null;
  noteBy: string | null;
}

type Bills = Record<string, { h: string; t: string }>;

const STATUS: Record<Status, { label: string; cls: string; hint: string }> = {
  new: { label: 'nou', cls: 'bg-brand-soft text-link', hint: 'Îl ia verificarea automată la următoarea rulare.' },
  review: { label: 'în lucru', cls: 'bg-risk-amber-soft text-risk-amber-text', hint: 'Așteaptă decizia ta; aici ajung și cele trimise de verificarea automată.' },
  fixed: { label: 'rezolvat', cls: 'bg-risk-green-soft text-risk-green-text', hint: 'Analiza a fost corectată.' },
  rejected: { label: 'respins', cls: 'bg-sunken text-muted', hint: 'Analiza era corectă sau raportul nu se poate folosi.' },
  spam: { label: 'spam', cls: 'bg-risk-red-soft text-risk-red-text', hint: 'Marcat de verificarea automată.' },
};
const SETTABLE: Status[] = ['new', 'review', 'fixed', 'rejected'];
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'open', label: 'Deschise' },
  { value: 'new', label: 'Noi' },
  { value: 'review', label: 'În lucru' },
  { value: 'closed', label: 'Închise' },
  { value: 'fixed', label: 'Rezolvate' },
  { value: 'rejected', label: 'Respinse' },
  { value: 'spam', label: 'Spam' },
  { value: 'all', label: 'Toate' },
];
const TARGET: Record<string, string> = { consensus: 'concluzia comună', agy: 'Gemini', claude: 'Claude', codex: 'ChatGPT' };
const VERDICT: Record<string, string> = {
  analysis_correct: 'analiza e corectă',
  analysis_wrong: 'analiza e greșită',
  spam_or_abuse: 'spam sau abuz',
  error: 'eroare',
};
const MAX_NOTE = 500;

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

class AuthError extends Error {}
class ApiError extends Error {
  constructor(
    public status: number,
    public body: Record<string, unknown>,
  ) {
    super(`HTTP ${status}`);
  }
}

// redirect: 'manual': când sesiunea Access expiră, cererea primește o redirecționare spre pagina de login, pe alt domeniu.
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, redirect: 'manual', credentials: 'same-origin' });
  if (r.type === 'opaqueredirect' || r.status === 0) throw new AuthError();
  const body = await r.json().catch(() => ({}));
  // 403 „forbidden” vine din requireAdmin (worker/access.ts); alte 403 (de exemplu „origin”) sunt erori obișnuite.
  if (r.status === 401 || (r.status === 403 && (body.error === 'forbidden' || !body.error))) throw new AuthError();
  if (!r.ok) throw new ApiError(r.status, body);
  return body as T;
}

interface Query {
  status: Filter;
  bill: string;
  from: string;
  to: string;
}

function readQuery(): Query & { id: string | null } {
  const p = new URLSearchParams(window.location.search);
  const status = p.get('status') as Filter | null;
  return {
    status: status && FILTERS.some((f) => f.value === status) ? status : 'open',
    bill: p.get('bill') ?? '',
    from: p.get('from') ?? '',
    to: p.get('to') ?? '',
    id: p.get('id'),
  };
}

function writeQuery(q: Query, id: string | null, push = false) {
  const p = new URLSearchParams();
  if (q.status !== 'open') p.set('status', q.status);
  if (q.bill) p.set('bill', q.bill);
  if (q.from) p.set('from', q.from);
  if (q.to) p.set('to', q.to);
  if (id) p.set('id', id);
  const url = `${window.location.pathname}${p.size ? `?${p}` : ''}`;
  if (push) window.history.pushState(null, '', url);
  else window.history.replaceState(null, '', url);
}

function apiQuery(q: Query, cursor?: string | null) {
  const p = new URLSearchParams({ status: q.status });
  if (q.bill) p.set('bill', q.bill);
  if (q.from) p.set('from', q.from);
  if (q.to) p.set('to', q.to);
  if (cursor) p.set('cursor', cursor);
  return `/api/admin/reports?${p}`;
}

function StatusChip({ status }: { status: Status }) {
  const s = STATUS[status];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>;
}

function billInfo(bills: Bills | null, billId: string) {
  return bills?.[billId.toLowerCase()] ?? null;
}

export default function AdminReports() {
  const [query, setQuery] = useState<Query | null>(null);
  const [draft, setDraft] = useState<Query>({ status: 'open', bill: '', from: '', to: '' });
  const [items, setItems] = useState<Summary[]>([]);
  const [counts, setCounts] = useState<Record<Status, number> | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'auth' | 'server' | null>(null);
  const [bills, setBills] = useState<Bills | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const q = readQuery();
    setQuery(q);
    setDraft(q);
    setSelected(q.id);
    fetch('/admin/proiecte.json', { redirect: 'manual' })
      .then((r) => (r.ok ? r.json() : null))
      .then(setBills)
      .catch(() => setBills(null));
    const onPop = () => {
      const q2 = readQuery();
      setSelected(q2.id);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const load = useCallback(async (q: Query, cursor?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ items: Summary[]; next: string | null; counts: Record<Status, number> }>(apiQuery(q, cursor));
      setItems((prev) => (cursor ? [...prev, ...data.items] : data.items));
      setNext(data.next);
      setCounts(data.counts);
    } catch (err) {
      setError(err instanceof AuthError ? 'auth' : 'server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (query) load(query);
  }, [query, load]);

  const apply = (e?: FormEvent) => {
    e?.preventDefault();
    const q = { ...draft, bill: draft.bill.trim() };
    setQuery(q);
    writeQuery(q, selected);
  };

  const pickStatus = (status: Filter) => {
    const q = { ...draft, status };
    setDraft(q);
    setQuery(q);
    writeQuery(q, selected);
  };

  const reset = () => {
    const q: Query = { status: 'open', bill: '', from: '', to: '' };
    setDraft(q);
    setQuery(q);
    writeQuery(q, selected);
  };

  const open = (id: string | null) => {
    setSelected(id);
    if (query) writeQuery(query, id, true);
  };

  const onSaved = (r: Detail) => {
    setItems((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: r.status, hasNote: !!r.note } : x)));
    if (query) load(query);
  };

  if (error === 'auth') {
    return (
      <div className={`${panel} mt-8 flex flex-col items-start gap-4 p-6 sm:p-8`}>
        <ShieldAlert className="h-7 w-7 text-risk-red-text" aria-hidden />
        <div>
          <h2 className="text-lg font-semibold text-ink">Sesiunea a expirat sau nu ai acces</h2>
          <p className="mt-1 text-[15px] leading-7 text-body">Reîncarcă pagina ca să intri din nou prin Cloudflare Access.</p>
        </div>
        <button type="button" onClick={() => window.location.reload()} className={`${btnPrimary} h-11 px-5 text-sm`}>
          <RefreshCw className="h-4 w-4" aria-hidden />
          Reîncarcă
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {counts && (
        <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted" aria-label="Rapoarte pe status">
          {(Object.keys(STATUS) as Status[]).map((s) => (
            <span key={s}>
              <span className="font-semibold tabular-nums text-ink">{counts[s]}</span> {STATUS[s].label}
            </span>
          ))}
        </p>
      )}

      <form onSubmit={apply} className={`${panel} mt-4 p-4 sm:p-5`} aria-label="Filtre">
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="group" aria-label="Status">
          {FILTERS.map((f) => {
            const on = draft.status === f.value;
            return (
              <button
                key={f.value}
                type="button"
                aria-pressed={on}
                onClick={() => pickStatus(f.value)}
                className={`inline-flex h-9 shrink-0 items-center rounded-lg px-3 text-sm font-semibold transition-colors ${
                  on ? 'bg-brand text-on-brand' : 'text-muted hover:bg-sunken hover:text-ink'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <label className="block text-sm font-semibold text-ink">
            Proiect
            <input
              value={draft.bill}
              onChange={(e) => setDraft({ ...draft, bill: e.target.value })}
              placeholder="B543/2026, PL-x 94…"
              className={`${inputCls} mt-1 h-11 px-3 font-normal`}
              maxLength={40}
            />
          </label>
          <label className="block text-sm font-semibold text-ink">
            De la
            <input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className={`${inputCls} mt-1 h-11 px-3 font-normal`} />
          </label>
          <label className="block text-sm font-semibold text-ink">
            Până la
            <input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className={`${inputCls} mt-1 h-11 px-3 font-normal`} />
          </label>
          <div className="flex gap-2">
            <button type="submit" className={`${btnPrimary} h-11 flex-1 px-5 text-sm sm:flex-none`}>
              Filtrează
            </button>
            <button type="button" onClick={reset} className={`${btnSecondary} h-11 px-4 text-sm`}>
              Golește
            </button>
          </div>
        </div>
      </form>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
        <section aria-label="Lista rapoartelor" className={selected ? 'hidden lg:block' : ''}>
          {error === 'server' && (
            <p role="alert" className="rounded-xl bg-risk-red-soft px-4 py-3 text-sm text-risk-red-text">
              Lista nu s-a încărcat. Încearcă din nou.
            </p>
          )}
          {!loading && !error && items.length === 0 && (
            <p className={`${panel} px-5 py-8 text-center text-[15px] text-muted`}>Niciun raport pentru filtrele alese.</p>
          )}
          <ul className="space-y-2">
            {items.map((r) => {
              const info = billInfo(bills, r.billId);
              const on = r.id === selected;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => open(r.id)}
                    aria-current={on ? 'true' : undefined}
                    className={`block w-full rounded-xl border p-4 text-left transition-colors ${
                      on ? 'border-brand bg-brand-soft/60' : 'border-line bg-surface hover:border-line-strong hover:bg-sunken/50'
                    }`}
                  >
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <StatusChip status={r.status} />
                      <span className="text-sm font-semibold text-ink">{r.billId}</span>
                      <span className="text-xs text-muted">{TARGET[r.target] ?? r.target}</span>
                      {r.hasNote && <MessageSquareText className="h-3.5 w-3.5 text-muted" aria-label="are notă" />}
                      <span className="ml-auto text-xs tabular-nums text-muted">{when(r.createdAt)}</span>
                    </span>
                    {info && <span className="mt-1 block truncate text-xs text-muted">{info.t}</span>}
                    <span className="mt-2 line-clamp-2 block whitespace-pre-line break-words text-sm leading-6 text-body">{r.excerpt}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {loading && <p className="mt-4 text-sm text-muted">Se încarcă…</p>}
          {next && !loading && query && (
            <button type="button" onClick={() => load(query, next)} className={`${btnSecondary} mt-4 h-11 w-full px-4 text-sm`}>
              Mai multe
            </button>
          )}
        </section>

        <section aria-label="Raportul ales" className={selected ? '' : 'hidden lg:block'}>
          {selected ? (
            <ReportDetail key={selected} id={selected} bills={bills} onBack={() => open(null)} onSaved={onSaved} onAuth={() => setError('auth')} />
          ) : (
            <p className={`${panel} px-5 py-10 text-center text-[15px] text-muted lg:sticky lg:top-24`}>Alege un raport din listă.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function ReportDetail({
  id,
  bills,
  onBack,
  onSaved,
  onAuth,
}: {
  id: string;
  bills: Bills | null;
  onBack: () => void;
  onSaved: (r: Detail) => void;
  onAuth: () => void;
}) {
  const [report, setReport] = useState<Detail | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('new');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const authRef = useRef(onAuth);
  authRef.current = onAuth;

  const fill = (r: Detail) => {
    setReport(r);
    setStatus(r.status);
    setNote(r.note ?? '');
  };

  useEffect(() => {
    api<{ report: Detail }>(`/api/admin/reports/${id}`)
      .then(({ report: r }) => {
        fill(r);
        heading.current?.focus({ preventScroll: true });
      })
      .catch((err) => {
        if (err instanceof AuthError) authRef.current();
        else setFailed(err instanceof ApiError && err.status === 404 ? 'Raportul nu mai există (poate a fost șters după 90 de zile).' : 'Raportul nu s-a încărcat.');
      });
  }, [id]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!report) return;
    setSaving(true);
    setMessage(null);
    try {
      const { report: r } = await api<{ report: Detail }>(`/api/admin/reports/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status, note, from: report.status }),
      });
      fill(r);
      onSaved(r);
      setMessage({ tone: 'ok', text: `Salvat: ${STATUS[r.status].label}.` });
    } catch (err) {
      if (err instanceof AuthError) return onAuth();
      if (err instanceof ApiError && err.status === 409) {
        const now = err.body.status as Status | undefined;
        setMessage({ tone: 'error', text: `Statusul s-a schimbat între timp${now ? ` în „${STATUS[now]?.label ?? now}”` : ''}. Am reîncărcat raportul; verifică și salvează din nou.` });
        api<{ report: Detail }>(`/api/admin/reports/${id}`).then(({ report: r }) => fill(r), () => {});
      } else setMessage({ tone: 'error', text: 'Nu s-a salvat. Încearcă din nou.' });
    } finally {
      setSaving(false);
    }
  };

  const back = (
    <button type="button" onClick={onBack} className={`${btnSecondary} h-10 px-3 text-sm lg:hidden`}>
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Înapoi la listă
    </button>
  );

  if (failed)
    return (
      <div className="space-y-3">
        {back}
        <p role="alert" className="rounded-xl bg-risk-red-soft px-4 py-3 text-sm text-risk-red-text">
          {failed}
        </p>
      </div>
    );
  if (!report)
    return (
      <div className="space-y-3">
        {back}
        <p className="text-sm text-muted">Se încarcă…</p>
      </div>
    );

  const info = billInfo(bills, report.billId);
  const votes = report.triage
    ? (Object.entries(report.triage).filter(([k, v]) => TARGET[k] && k !== 'consensus' && v && typeof v === 'object') as [string, Vote][])
    : [];
  const changed = status !== report.status || note.trim() !== (report.note ?? '');

  return (
    <article className={`${panel} p-5 sm:p-6 lg:sticky lg:top-24`}>
      <div className="mb-4">{back}</div>
      <div className="flex flex-wrap items-center gap-3">
        <StatusChip status={report.status} />
        <span className="text-xs tabular-nums text-muted">trimis {when(report.createdAt)}</span>
      </div>
      <h2 ref={heading} tabIndex={-1} style={{ outline: 'none' }} className="mt-3 text-xl font-semibold text-ink">
        {report.billId} · {TARGET[report.target] ?? report.target}
      </h2>
      {info ? (
        <p className="mt-1 text-[15px] leading-6 text-body">
          {info.t}{' '}
          <a href={info.h} target="_blank" rel="noopener" className={`${linkCls} inline-flex items-center gap-1 whitespace-nowrap`}>
            pagina proiectului
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </p>
      ) : (
        <p className="mt-1 text-sm text-muted">Proiectul nu are pagină pe site.</p>
      )}

      <h3 className="mt-6 text-xs font-semibold uppercase tracking-[0.1em] text-muted">Textul cititorului</h3>
      <p className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-sunken px-4 py-3 text-[15px] leading-7 text-ink">{report.comment}</p>
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        <span>{report.name ? `Semnat: ${report.name}` : 'Fără nume'}</span>
        <span className="inline-flex items-center gap-1">
          <Mail className="h-3.5 w-3.5" aria-hidden />
          {report.notifiedAt ? `rezultat trimis ${when(report.notifiedAt)}` : report.hasEmail ? 'așteaptă rezultatul pe e-mail' : 'fără e-mail'}
        </span>
      </p>

      {report.triage && (
        <>
          <h3 className="mt-6 text-xs font-semibold uppercase tracking-[0.1em] text-muted">Verificarea automată</h3>
          {report.triage.suspicious && <p className="mt-2 text-sm font-semibold text-risk-red-text">Suspect de prompt injection</p>}
          {report.triage.note && <p className="mt-2 text-[15px] leading-6 text-body">{report.triage.note}</p>}
          {votes.length > 0 && (
            <ul className="mt-2 divide-y divide-line border-y border-line text-sm">
              {votes.map(([m, v]) => (
                <li key={m} className="flex flex-wrap gap-x-3 py-2">
                  <span className="w-20 font-semibold text-ink">{TARGET[m]}</span>
                  <span className="text-body">
                    {VERDICT[v.verdict ?? ''] ?? v.verdict ?? '—'}
                    {v.injection ? ' · injecție' : ''}
                  </span>
                  <span className="text-muted">
                    fraza {v.claimFound ? 'găsită' : 'negăsită'} · citatul {v.evidenceFound ? 'găsit' : 'negăsit'}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {report.reviewedAt && <p className="mt-2 text-xs text-muted">ultima schimbare de status: {when(report.reviewedAt)}</p>}
        </>
      )}

      <form onSubmit={save} className="mt-6 border-t border-line pt-5">
        <fieldset>
          <legend className="text-sm font-semibold text-ink">Status</legend>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SETTABLE.map((s) => (
              <label
                key={s}
                className={`flex h-11 cursor-pointer items-center justify-center rounded-lg border text-sm font-semibold transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus ${
                  status === s ? 'border-brand bg-brand text-on-brand' : 'border-line-strong bg-surface text-ink hover:bg-sunken'
                }`}
              >
                <input type="radio" name="status" value={s} checked={status === s} onChange={() => setStatus(s)} className="sr-only" />
                {STATUS[s].label}
              </label>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted">{STATUS[status].hint}</p>
          {report.status === 'spam' && <p className="mt-1 text-sm text-muted">Acum e spam; alege un status nou doar dacă vrei să-l schimbi.</p>}
          {(status === 'fixed' || status === 'rejected') && (
            <p className="mt-1 text-sm text-muted">Din panou nu se publică nimic pe pagina proiectului și nu pleacă niciun e-mail.</p>
          )}
        </fieldset>
        <label className="mt-4 block text-sm font-semibold text-ink">
          Notă <span className="font-normal text-muted">(doar pentru tine)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={MAX_NOTE}
            rows={3}
            className={`${inputCls} mt-1 h-auto px-3 py-2 font-normal leading-6`}
            placeholder="De ce, ce ai corectat…"
          />
        </label>
        <div className="mt-1 flex justify-between text-xs text-muted">
          <span>{report.noteAt ? `ultima notă: ${when(report.noteAt)}${report.noteBy ? `, ${report.noteBy}` : ''}` : ''}</span>
          <span className="tabular-nums">
            {note.length}/{MAX_NOTE}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={saving || !changed} className={`${btnPrimary} h-11 px-6 text-sm`}>
            {saving ? 'Se salvează…' : 'Salvează'}
          </button>
          <p role="status" className={`text-sm ${message?.tone === 'error' ? 'text-risk-red-text' : 'text-risk-green-text'}`}>
            {message?.text}
          </p>
        </div>
      </form>
    </article>
  );
}
