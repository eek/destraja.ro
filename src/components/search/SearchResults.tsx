'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ExternalLink, UserRound } from 'lucide-react';
import { PartyTag, RiskChip, linkCls } from '@/components/ui';
import { formatDateRo, normalize } from '@/lib/format';
import {
  SearchError,
  highlightWords,
  loadPeople,
  loadPressIndex,
  logSearch,
  matchPeople,
  pressKey,
  searchHref,
  searchSite,
  type BillHit,
  type Person,
  type PressHit,
  type PressIndex,
} from '@/lib/search';
import SearchBox from './SearchBox';

const EXAMPLES = ['chirii pentru tineri', 'B598/2026', 'Codul fiscal', 'pensii speciale'];
const SOURCE = { senat: 'Senat', camera: 'Camera Deputaților' } as const;

type Bills = { state: 'idle' } | { state: 'loading' } | { state: 'done'; hits: BillHit[]; press: PressHit[] } | { state: 'error'; kind: 'rate' | 'down' };
const PRESS_SHOWN = 6;

// Pasajele vin din textele recunoscute automat, cu marcaje Markdown („# PARLAMENTUL ROMÂNIEI”) și linii de tabel
// („-----”, „=====”): le scoatem. Un pasaj cu prea puține litere (doar chenarul unui tabel) nu se mai arată.
const cleanPassage = (text: string) =>
  text
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_|>`\\]+/g, ' ')
    .replace(/[-=.~]{3,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const readable = (text: string) => (cleanPassage(text).match(/\p{L}/gu)?.length ?? 0) >= 40;

/** Pasajul cu cuvintele căutate evidențiate (comparate fără diacritice, ca început de cuvânt). */
function Passage({ text, q }: { text: string; q: string }) {
  const wanted = highlightWords(q);
  const parts = cleanPassage(text).split(/([\p{L}\p{N}]+)/u);
  return (
    <>
      {parts.map((part, i) => {
        const n = normalize(part);
        const hit = n.length >= 3 && wanted.some((w) => n.startsWith(w.slice(0, Math.max(3, w.length - 2))));
        return hit ? (
          <mark key={i} className="rounded-sm bg-brand-soft text-ink">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        );
      })}
    </>
  );
}

function PersonRow({ p, onOpen }: { p: Person; onOpen: () => void }) {
  return (
    <li>
      <Link href={`/parlamentari/${p.s}`} onClick={onOpen} className="group flex min-h-14 items-center gap-3.5 py-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sunken text-muted">
          <UserRound className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink group-hover:underline group-hover:underline-offset-4">{p.n}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            {p.r && <span className="capitalize">{p.r}</span>}
            {p.p && <PartyTag party={p.p} />}
            <span className="tabular-nums">
              {p.b} {p.b === 1 ? 'proiect inițiat' : 'proiecte inițiate'}
            </span>
          </span>
        </span>
      </Link>
    </li>
  );
}

/** Un articol: publicația, data, titlul (spre site-ul publicației) și, dacă l-am verificat la un proiect, proiectul. */
function PressRow({ a, index, onOpen }: { a: PressHit; index: PressIndex | null; onOpen: () => void }) {
  const outlet = index?.outlets[a.domain] ?? a.outlet ?? a.domain;
  const about = index?.about[pressKey(a.url)] ?? [];
  return (
    <li className="py-3.5">
      <p className="text-sm text-muted">
        {outlet}
        {a.published && ` · ${formatDateRo(a.published)}`}
      </p>
      <a href={a.url} target="_blank" rel="noopener noreferrer" onClick={onOpen} className="group mt-1 block font-semibold leading-snug text-ink">
        <span className="group-hover:underline group-hover:underline-offset-4">{a.title}</span>
        <ExternalLink className="ml-1.5 inline h-3.5 w-3.5 align-[-1px] text-faint" aria-hidden />
        <span className="sr-only"> (pe site-ul publicației, într-o filă nouă)</span>
      </a>
      {about.length > 0 && (
        <p className="mt-1.5 text-sm text-muted">
          Despre{' '}
          {about.map(([id, href], i) => (
            <Fragment key={href}>
              {i > 0 && ', '}
              <Link href={href} className={linkCls}>
                {id}
              </Link>
            </Fragment>
          ))}
        </p>
      )}
    </li>
  );
}

function BillRow({ b, q, onOpen }: { b: BillHit; q: string; onOpen: () => void }) {
  return (
    <li className="py-6 first:pt-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        {b.risk && <RiskChip level={b.risk} score={b.score ?? undefined} />}
        <span className="font-semibold text-ink tabular-nums">{b.id}</span>
        <span className="text-muted">{SOURCE[b.source]}</span>
        {b.exact ? (
          <span className="rounded-md bg-brand-soft px-2 py-0.5 text-xs font-semibold text-ink">Numărul se potrivește</span>
        ) : (
          b.why && (
            <span className="rounded-md bg-brand-soft px-2 py-0.5 text-xs font-semibold text-ink">
              {b.why.kind === 'person' ? `Inițiat de ${b.why.label}` : `Se referă la ${b.why.label}`}
            </span>
          )
        )}
      </div>
      <h3 className="mt-2.5 font-display text-[1.3rem] leading-[1.25] text-ink">
        <Link href={b.url} onClick={onOpen} className="hover:underline hover:decoration-1 hover:underline-offset-4">
          {b.title}
        </Link>
      </h3>
      {b.official && b.official !== b.title && <p className="mt-1.5 line-clamp-2 max-w-[68ch] text-sm leading-6 text-muted">{b.official}</p>}
      {b.match && !b.exact && readable(b.match.text) && (
        <div className="mt-3.5 max-w-[68ch] rounded-xl bg-sunken px-4 py-3">
          <p className="text-xs font-semibold text-muted">Din {b.match.where.charAt(0).toLowerCase() + b.match.where.slice(1)}</p>
          <p className="mt-1 line-clamp-4 text-[15px] leading-relaxed text-body">
            <Passage text={b.match.text} q={q} />
          </p>
        </div>
      )}
      {b.stage && <p className="mt-3 text-sm text-muted">{b.stage.charAt(0).toUpperCase() + b.stage.slice(1)}</p>}
    </li>
  );
}

export default function SearchResults() {
  const router = useRouter();
  const params = useSearchParams();
  const q = (params.get('q') ?? '').trim().slice(0, 200);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [bills, setBills] = useState<Bills>({ state: 'idle' });
  const [pressIndex, setPressIndex] = useState<PressIndex | null>(null);
  const logged = useRef('');

  useEffect(() => {
    loadPeople().then(setPeople);
    loadPressIndex().then(setPressIndex);
  }, []);

  useEffect(() => {
    if (q.length < 2) {
      setBills({ state: 'idle' });
      return;
    }
    const ctrl = new AbortController();
    setBills({ state: 'loading' });
    searchSite(q, ctrl.signal)
      .then(({ bills: hits, press }) => setBills({ state: 'done', hits, press }))
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setBills({ state: 'error', kind: err instanceof SearchError ? err.kind : 'down' });
      });
    return () => ctrl.abort();
  }, [q]);

  const found = people ? matchPeople(people, q, 8) : [];
  const press = bills.state === 'done' ? bills.press.slice(0, PRESS_SHOWN) : [];
  const done = bills.state === 'done' || bills.state === 'error';

  // O intrare în jurnal pentru fiecare căutare, după ce știm câte rezultate au ieșit.
  useEffect(() => {
    if (!done || !people || logged.current === q) return;
    logged.current = q;
    const hits = bills.state === 'done' ? bills.hits : [];
    logSearch({ kind: 'search', q, people: found.length, bills: hits.length, press: press.length, exact: hits.some((h) => h.exact) });
  }, [done, people, q, bills, found.length, press.length]);

  const open = (target: string, rank: number) => () => logSearch({ kind: 'open', q, target, rank });
  const go = (text: string) => router.push(searchHref(text));

  return (
    <div className="grid gap-10">
      <div className="max-w-3xl">
        <SearchBox variant="page" initial={q} onSearch={go} />
        {!q && (
          <div className="mt-6 text-[15px] leading-7 text-body">
            <p>Scrie numărul unui proiect, numele unui senator sau deputat ori, cu vorbele tale, ce te interesează. Căutăm în proiectele de la Senat și de la Camera Deputaților, în analize și în textele lor.</p>
            <p className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-muted">De exemplu:</span>
              {EXAMPLES.map((e) => (
                <Link key={e} href={searchHref(e)} className="inline-flex min-h-10 items-center rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink transition-colors hover:border-line-strong hover:bg-sunken">
                  {e}
                </Link>
              ))}
            </p>
          </div>
        )}
      </div>

      {q && (
        <div className={`grid gap-12 lg:gap-x-16 ${found.length || press.length ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:grid-rows-[auto_1fr]' : ''}`}>
          {/* Pe telefon: parlamentarii întâi (cine scrie un nume caută un om), apoi proiectele, apoi presa. Pe ecran lat,
              proiectele în stânga, parlamentarii și presa în dreapta, unul sub altul. */}
          {found.length > 0 && (
            <section aria-labelledby="rez-oameni" className="min-w-0 lg:col-start-2 lg:row-start-1">
              <h2 id="rez-oameni" className="border-b border-line pb-3 text-lg font-semibold text-ink">
                Parlamentari
                <span className="ml-2 font-normal text-muted tabular-nums">{found.length}</span>
              </h2>
              <ul className="divide-y divide-line">
                {found.map((p, i) => (
                  <PersonRow key={p.s} p={p} onOpen={open(`/parlamentari/${p.s}`, i + 1)} />
                ))}
              </ul>
            </section>
          )}
          <section aria-labelledby="rez-proiecte" className="min-w-0 lg:col-start-1 lg:row-span-2 lg:row-start-1">
            <h2 id="rez-proiecte" className="border-b border-line pb-3 text-lg font-semibold text-ink">
              Proiecte
              {bills.state === 'done' && bills.hits.length > 0 && <span className="ml-2 font-normal text-muted tabular-nums">{bills.hits.length}</span>}
            </h2>
            {bills.state === 'loading' && (
              <ul aria-label="Se caută" className="divide-y divide-line">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="py-6">
                    <div className="h-5 w-40 animate-pulse rounded-full bg-sunken motion-reduce:animate-none" />
                    <div className="mt-3 h-6 w-4/5 animate-pulse rounded bg-sunken motion-reduce:animate-none" />
                    <div className="mt-3 h-16 w-full animate-pulse rounded-xl bg-sunken motion-reduce:animate-none" />
                  </li>
                ))}
              </ul>
            )}
            {bills.state === 'error' && (
              <p className="py-6 text-[15px] leading-7 text-body">
                {bills.kind === 'rate'
                  ? 'Prea multe căutări într-un minut. Încearcă din nou peste câteva secunde.'
                  : 'Căutarea în proiecte nu răspunde acum. Încearcă din nou în câteva minute.'}{' '}
                Între timp găsești proiectele pe{' '}
                <Link href="/senat" className={linkCls}>
                  Senat
                </Link>{' '}
                și pe{' '}
                <Link href="/camera" className={linkCls}>
                  Camera
                </Link>
                .
              </p>
            )}
            {bills.state === 'done' && bills.hits.length === 0 && (
              <p className="py-6 text-[15px] leading-7 text-body">
                N-am găsit niciun proiect pentru <span className="font-semibold text-ink">„{q}”</span>. Încearcă alte cuvinte, de exemplu ce s-ar schimba
                pentru tine, sau numărul proiectului.
              </p>
            )}
            {bills.state === 'done' && bills.hits.length > 0 && (
              <ol className="divide-y divide-line">
                {bills.hits.map((b, i) => (
                  <BillRow key={b.slug} b={b} q={q} onOpen={open(b.url, i + 1)} />
                ))}
              </ol>
            )}
          </section>
          {press.length > 0 && (
            <section aria-labelledby="rez-presa" className={`min-w-0 self-start lg:col-start-2 ${found.length ? 'lg:row-start-2' : 'lg:row-start-1'}`}>
              <h2 id="rez-presa" className="border-b border-line pb-3 text-lg font-semibold text-ink">
                Presă
                <span className="ml-2 font-normal text-muted tabular-nums">{press.length}</span>
              </h2>
              <ul className="divide-y divide-line">
                {press.map((a, i) => (
                  <PressRow key={a.url} a={a} index={pressIndex} onOpen={open(`presa:${a.domain}`, i + 1)} />
                ))}
              </ul>
              <p className="mt-3 text-xs leading-5 text-muted">Din indexul nostru de știri, cu titlul și linkul spre publicație.</p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
