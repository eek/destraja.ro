'use client';

// Lista tuturor proiectelor aflate la Cameră, cu filtre, ordine și pagini. Prima pagină vine randată de server (merge
// și fără JavaScript); restul rândurilor se aduc din /uitate/proiecte.json abia la prima schimbare. Filtrele stau în
// adresă (#proiecte?etapa=comisii&an=2021…), ca o vedere filtrată să poată fi trimisă; barele de mai sus (vechime,
// stadii, comisii) sunt linkuri către astfel de adrese.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, SlidersHorizontal, X } from 'lucide-react';
import { EMPTY, LIST_ID, SORTS, TACIT_TEXT, applyFilters, fromHash, isFiltered, toHash, unpackRows, type ListFile, type ListFilters, type ListRow } from '@/lib/uitate-list';

const MONTHS_SHORT = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.'];
const dateShort = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
};
const nr = (n: number) => n.toLocaleString('ro-RO');
const many = (n: number, one: string, more: string) => (n === 1 ? `1 ${one}` : `${nr(n)}${n % 100 === 0 || n % 100 >= 20 ? ' de' : ''} ${more}`);
const tinyCommittee = (name: string) => name.split(/,| și /)[0].trim();

const chip = 'inline-flex items-center rounded-md border border-line px-1.5 py-px text-[11px] font-semibold leading-4 text-body';

/** „Senatul n-a votat la termen”, cu explicația la atingere, cu tastatura sau la trecerea mouse-ului (title). */
function TacitChip() {
  return (
    <details className="relative inline-block">
      <summary title={TACIT_TEXT} className={`${chip} cursor-pointer list-none gap-1 hover:border-line-strong [&::-webkit-details-marker]:hidden`}>
        Senatul n-a votat la termen
        <span aria-hidden className="text-muted">ⓘ</span>
      </summary>
      <p className="absolute left-0 top-full z-10 mt-1 w-[min(46ch,calc(100vw-4rem))] rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] font-normal leading-5 text-body shadow-[var(--shadow-lift)]">
        {TACIT_TEXT}
      </p>
    </details>
  );
}

function Row({ r, rank, stageLabel }: { r: ListRow; rank: number; stageLabel: (k: string) => string }) {
  const cls = 'decoration-line-strong decoration-1 underline-offset-4 hover:underline';
  const internal = r.h.startsWith('/');
  const meta = [
    stageLabel(r.w),
    r.o ? 'ordonanța se aplică deja' : '',
    r.sr ? 'pe ordinea de zi sub rezerva raportului' : '',
    r.c.map(tinyCommittee).join(', '),
    r.l ? `ultimul pas ${dateShort(r.l)}` : 'data ultimului pas neconfirmată',
    r.g ? 'Guvernul' : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <li className="border-t border-line py-2.5 first:border-t-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums text-muted">
          <span>
            <span className="text-faint">{rank}.</span> <span className="font-semibold text-body">{r.n}</span>
            <span className="hidden sm:inline"> · din {dateShort(r.r)}</span>
          </span>
          {r.tc === 1 && <TacitChip />}
        </div>
        <p className="shrink-0 text-[12.5px] tabular-nums text-muted" title={r.lk ? `Ultimul pas: ${r.lk}` : undefined}>
          {r.d === null ? (
            'dată neconfirmată'
          ) : (
            <>
              <strong className="text-[15px] font-semibold text-ink">{nr(r.d)}</strong> zile
            </>
          )}
        </p>
      </div>
      <h3 className="mt-1 line-clamp-2 font-display text-[1rem] font-normal leading-snug text-ink sm:text-[1.05rem]">
        {internal ? (
          <Link href={r.h} className={cls}>
            {r.t}
          </Link>
        ) : (
          <a href={r.h} target="_blank" rel="noopener noreferrer" className={cls}>
            {r.t}
            <ArrowUpRight className="ml-1 inline h-3.5 w-3.5 align-baseline text-muted" aria-label="(cdep.ro)" />
          </a>
        )}
      </h3>
      <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-5 text-muted sm:line-clamp-1" title={meta}>
        {meta}
      </p>
    </li>
  );
}

/** Paginile: 1 … 4 5 6 … 20. */
function pages(current: number, last: number): (number | '…')[] {
  const set = new Set([1, last, current - 1, current, current + 1].filter((p) => p >= 1 && p <= last));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('…');
    out.push(p);
  });
  return out;
}

const selectCls =
  'h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-[15px] text-ink focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 sm:text-sm';
const labelCls = 'mb-1 block text-xs font-semibold text-muted';

export default function WaitingExplorer({
  initial,
  total,
  stages,
  bands,
  committees,
  years,
}: {
  /** Prima pagină, în ordinea implicită (randată de server). */
  initial: ListRow[];
  total: number;
  stages: { key: string; label: string }[];
  bands: { key: string; label: string }[];
  committees: string[];
  years: number[];
}) {
  const [f, setF] = useState<ListFilters>(EMPTY);
  const [rows, setRows] = useState<ListRow[] | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const loading = useRef<Promise<void> | null>(null);
  const id = useId();
  const stageLabel = useCallback((k: string) => stages.find((s) => s.key === k)?.label ?? k, [stages]);

  const load = useCallback(() => {
    loading.current ??= fetch('/uitate/proiecte.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: ListFile) => setRows(unpackRows(j)))
      .catch(() => {
        setError(true);
        loading.current = null;
      });
    return loading.current;
  }, []);

  // Adresa → filtre (la încărcare și la clic pe o bară de mai sus); filtrele → adresă.
  const fromAddress = useCallback(
    (scroll: boolean) => {
      const next = fromHash(window.location.hash);
      if (!next) return;
      setF(next);
      if (isFiltered(next) || next.pag > 1 || next.ordine !== 'zile' || next.pe !== 10) void load();
      if (scroll) listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [load],
  );
  useEffect(() => {
    fromAddress(window.location.hash.length > 1);
    const onHash = () => fromAddress(true);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [fromAddress]);

  const update = (patch: Partial<ListFilters>, keepPage = false) => {
    const next = { ...f, ...patch, pag: keepPage ? (patch.pag ?? f.pag) : 1 };
    setF(next);
    void load();
    const hash = toHash(next);
    if (hash !== window.location.hash) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash === `#${LIST_ID}` ? '' : hash}`);
  };

  const filtered = useMemo(() => (rows ? applyFilters(rows, f) : null), [rows, f]);
  const count = filtered ? filtered.length : total;
  const lastPage = Math.max(1, Math.ceil(count / f.pe));
  const page = Math.min(f.pag, lastPage);
  const shown = filtered ? filtered.slice((page - 1) * f.pe, page * f.pe) : initial.slice(0, f.pe);
  const waiting = !filtered && (isFiltered(f) || page > 1 || f.ordine !== 'zile' || f.pe > initial.length);
  const active = [
    f.etapa && { k: 'etapa', label: stageLabel(f.etapa) },
    f.comisie && { k: 'comisie', label: f.comisie },
    f.an && { k: 'an', label: `din ${f.an}` },
    f.vechime && { k: 'vechime', label: bands.find((b) => b.key === f.vechime)?.label ?? f.vechime },
    f.init && { k: 'init', label: f.init === 'guvern' ? 'Guvernul' : 'Parlamentari' },
    f.tacit && { k: 'tacit', label: 'Senatul n-a votat la termen' },
    f.ord && { k: 'ord', label: 'Ordonanțe' },
    f.q.trim() && { k: 'q', label: `„${f.q.trim()}”` },
  ].filter(Boolean) as { k: keyof ListFilters; label: string }[];

  const goPage = (p: number) => {
    update({ pag: p }, true);
    listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div ref={listRef} id={LIST_ID} className="scroll-mt-24">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p id={`${id}-count`} aria-live="polite" className="text-sm font-semibold text-ink">
          {waiting ? 'Se încarcă lista…' : many(count, 'proiect', 'proiecte')}
          {!waiting && isFiltered(f) && <span className="font-normal text-muted"> din {nr(total)}</span>}
        </p>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-filters`}
          onClick={() => {
            setOpen((o) => !o);
            void load();
          }}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-[13px] font-semibold text-ink hover:bg-sunken"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          Filtre și ordine{active.length > 0 && ` (${active.length})`}
        </button>
      </div>

      {active.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Filtre active">
          {active.map((a) => (
            <li key={a.k}>
              <button
                type="button"
                onClick={() => update({ [a.k]: EMPTY[a.k] } as Partial<ListFilters>)}
                className="inline-flex min-h-8 items-center gap-1 rounded-md border border-line-strong bg-surface px-2 text-xs font-semibold text-body hover:bg-sunken"
                aria-label={`Scoate filtrul ${a.label}`}
              >
                {a.label}
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => update({ ...EMPTY, ordine: f.ordine, pe: f.pe })} className="min-h-8 px-1 text-xs font-semibold text-link underline underline-offset-2">
              Șterge filtrele
            </button>
          </li>
        </ul>
      )}

      <div id={`${id}-filters`} hidden={!open} className="mt-3 rounded-xl bg-sunken p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <div className="col-span-2 sm:col-span-3 lg:col-span-4">
            <label htmlFor={`${id}-q`} className={labelCls}>
              Caută după număr sau titlu
            </label>
            <input id={`${id}-q`} type="search" value={f.q} onChange={(e) => update({ q: e.target.value })} placeholder="de exemplu: vânătorii, PL-x 58/2020" className={selectCls} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor={`${id}-etapa`} className={labelCls}>
              Unde așteaptă
            </label>
            <select id={`${id}-etapa`} value={f.etapa} onChange={(e) => update({ etapa: e.target.value })} className={selectCls}>
              <option value="">Toate</option>
              {stages.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-vechime`} className={labelCls}>
              Fără pas de
            </label>
            <select id={`${id}-vechime`} value={f.vechime} onChange={(e) => update({ vechime: e.target.value })} className={selectCls}>
              <option value="">Oricât</option>
              {bands.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor={`${id}-comisie`} className={labelCls}>
              Comisia (pentru raport)
            </label>
            <select id={`${id}-comisie`} value={f.comisie} onChange={(e) => update({ comisie: e.target.value })} className={selectCls}>
              <option value="">Toate</option>
              {committees.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-an`} className={labelCls}>
              Înregistrat în
            </label>
            <select id={`${id}-an`} value={f.an} onChange={(e) => update({ an: e.target.value })} className={selectCls}>
              <option value="">Orice an</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-init`} className={labelCls}>
              Inițiator
            </label>
            <select id={`${id}-init`} value={f.init} onChange={(e) => update({ init: e.target.value as ListFilters['init'] })} className={selectCls}>
              <option value="">Oricine</option>
              <option value="guvern">Guvernul</option>
              <option value="parlamentari">Deputați sau senatori</option>
            </select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor={`${id}-ordine`} className={labelCls}>
              Ordinea
            </label>
            <select id={`${id}-ordine`} value={f.ordine} onChange={(e) => update({ ordine: e.target.value as ListFilters['ordine'] })} className={selectCls}>
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-pe`} className={labelCls}>
              Pe pagină
            </label>
            <select id={`${id}-pe`} value={f.pe} onChange={(e) => update({ pe: e.target.value === '20' ? 20 : 10 })} className={selectCls}>
              <option value="10">10</option>
              <option value="20">20</option>
            </select>
          </div>
          <fieldset className="col-span-2 sm:col-span-3 lg:col-span-4">
            <legend className={labelCls}>Doar</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              <label className="inline-flex min-h-10 items-center gap-2 text-sm text-body">
                <input type="checkbox" checked={f.tacit} onChange={(e) => update({ tacit: e.target.checked })} className="h-4 w-4 accent-[var(--brand)]" />
                Senatul n-a votat la termen
              </label>
              <label className="inline-flex min-h-10 items-center gap-2 text-sm text-body">
                <input type="checkbox" checked={f.ord} onChange={(e) => update({ ord: e.target.checked })} className="h-4 w-4 accent-[var(--brand)]" />
                Aprobă sau respinge o ordonanță
              </label>
            </div>
          </fieldset>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-body">Lista completă nu s-a încărcat. Reîncarcă pagina ca să încerci din nou.</p>}

      <ol start={(page - 1) * f.pe + 1} aria-describedby={`${id}-count`} className="mt-3 rounded-2xl border border-line bg-surface px-4 sm:px-5">
        {shown.map((r, i) => (
          <Row key={r.s} r={r} rank={(page - 1) * f.pe + i + 1} stageLabel={stageLabel} />
        ))}
        {filtered && !shown.length && <li className="py-6 text-center text-sm text-muted">Niciun proiect nu se potrivește filtrelor.</li>}
      </ol>

      {lastPage > 1 && (
        <nav aria-label="Paginile listei" className="mt-3 flex flex-wrap items-center justify-center gap-1">
          <button type="button" disabled={page <= 1} onClick={() => goPage(page - 1)} className="min-h-10 rounded-lg px-3 text-sm font-semibold text-link disabled:text-faint">
            ‹ Înapoi
          </button>
          {pages(page, lastPage).map((p, i) =>
            p === '…' ? (
              <span key={`e${i}`} className="px-1 text-sm text-muted" aria-hidden>
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                aria-current={p === page ? 'page' : undefined}
                aria-label={`Pagina ${p}`}
                onClick={() => goPage(p)}
                className={`min-h-10 min-w-10 rounded-lg text-sm font-semibold tabular-nums ${p === page ? 'bg-brand text-on-brand' : 'text-ink hover:bg-sunken'}`}
              >
                {p}
              </button>
            ),
          )}
          <button type="button" disabled={page >= lastPage} onClick={() => goPage(page + 1)} className="min-h-10 rounded-lg px-3 text-sm font-semibold text-link disabled:text-faint">
            Înainte ›
          </button>
        </nav>
      )}
    </div>
  );
}
