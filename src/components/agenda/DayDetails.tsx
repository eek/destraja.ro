'use client';

import { type ReactNode, type RefObject, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ExternalLink, Search } from 'lucide-react';
import type { AgendaChamber } from '@/lib/agenda';
import type { CalItem, CalSession } from '@/lib/agenda-calendar';
import type { AgendaOutcome, OutcomeKind } from '@/lib/agenda-outcomes';
import { trackAttrs } from '@/lib/analytics';
import { countWord, initialRows, normalize } from '@/lib/format';
import { Glyph, RiskChip, linkCls, panel, segCls } from '@/components/ui';
import { CHAMBERS, CHAMBER_NAME, type CalIndex, longDay, mediumDay, summarize } from './cal';

export interface Filters {
  chamber: AgendaChamber | 'toate';
  red: boolean;
  withOutcome: boolean;
  q: string;
}
export const NO_FILTERS: Filters = { chamber: 'toate', red: false, withOutcome: false, q: '' };

const SITE = { senat: 'senat.ro', camera: 'cdep.ro' } as const;
const ROWS = 10;
// O zi grea (marțea are și peste 100 de apariții): ședințele pornesc închise, în afară de prima.
const HEAVY_ITEMS = 30;
const HEAVY_SESSIONS = 4;

/** Ordinea în care un rezultat spune cel mai mult, pentru rezumatul zilei. */
const WEIGHT: OutcomeKind[] = ['adoptat', 'respins', 'retrimis', 'raport', 'aviz', 'amanat', 'dezbatut', 'alt'];
const mainKind = (o: AgendaOutcome[]) => WEIGHT.find((k) => o.some((x) => x.kind === k)) ?? null;

export const fullDate = (iso: string) => new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
const dayMonth = (iso: string) => new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));

/** „Citim ordinile de zi ale Senatului din 26 octombrie 2026 și pe ale Camerei Deputaților din 3 noiembrie 2026.” */
export function startSentence(start: Record<AgendaChamber, string | null>) {
  const parts = [start.senat && `ale Senatului din ${fullDate(start.senat)}`, start.camera && `ale Camerei Deputaților din ${fullDate(start.camera)}`].filter(Boolean);
  return parts.length ? `Citim ordinile de zi ${parts.join(' și pe ')}.` : 'Încă n-am citit nicio ordine de zi.';
}

/** A cui e ședința, când numele n-o spune: „Comisia pentru muncă…” există și la Senat, și la Cameră. */
const chamberOf = (s: CalSession) => (/senat|camerei deputaților/i.test(s.comisie) ? null : CHAMBER_NAME[s.chamber]);

/**
 * Ziua aleasă. Componenta se montează din nou la fiecare zi (key), deci filtrele și ședințele deschise pornesc de la zero:
 * un filtru rămas de pe altă zi n-ar mai avea butonul lui pe ecran.
 */
export default function DayDetails({
  ix,
  zi,
  today,
  headingRef,
  onSelect,
}: {
  ix: CalIndex;
  zi: string;
  today: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onSelect: (zi: string) => void;
}) {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const s = summarize(ix, zi);
  const sessions = ix.data.days[zi] ?? [];
  const past = zi < today;
  const isToday = zi === today;
  // Rezultatele sunt căutate la build, doar pentru zilele dinaintea lui; până la actualizarea următoare o zi trecută după
  // build (sâmbăta, duminica) n-are încă rezultate căutate.
  const searched = zi < ix.data.builtFor;
  const bills = ix.data.bills;

  const nextDay = ix.daysWith.find((d) => d > zi) ?? null;
  const prevDay = ix.daysWith.findLast((d) => d < zi) ?? null;

  const q = normalize(filters.q.trim());
  const match = (sess: CalSession, it: CalItem) => {
    if (filters.chamber !== 'toate' && sess.chamber !== filters.chamber) return false;
    if (filters.red && bills[it.b].risk?.level !== 'red') return false;
    if (filters.withOutcome && !it.outcomes.length) return false;
    if (q) {
      const b = bills[it.b];
      return normalize(`${b.title} ${b.id} ${it.numar ?? ''} ${sess.comisie}`).includes(q);
    }
    return true;
  };
  const filtering = filters.chamber !== 'toate' || filters.red || filters.withOutcome || !!q;
  const shown = sessions.map((sess) => ({ sess, items: sess.items.filter((it) => match(sess, it)) })).filter((x) => x.items.length);
  const shownCount = shown.reduce((n, x) => n + x.items.length, 0);

  const heavy = s.appearances > HEAVY_ITEMS || sessions.length > HEAVY_SESSIONS;
  // Calculat la prima randare, ca pagina statică să aibă deja ședințele deschise.
  const [open, setOpen] = useState<Set<string>>(() => new Set((heavy ? sessions.slice(0, 1) : sessions).map((x) => x.key)));
  const [all, setAll] = useState<Set<string>>(() => new Set());

  const allItems = sessions.flatMap((x) => x.items);
  const withOutcome = allItems.filter((it) => it.outcomes.length);
  const sameDay = withOutcome.filter((it) => it.outcomes.some((o) => !o.later)).length;
  const kinds = new Map<OutcomeKind, number>();
  for (const it of withOutcome) {
    const k = mainKind(it.outcomes)!;
    kinds.set(k, (kinds.get(k) ?? 0) + 1);
  }
  const redCount = new Set(allItems.filter((it) => bills[it.b].risk?.level === 'red').map((it) => it.b)).size;
  const chambersWith = CHAMBERS.filter((c) => s.by[c].bills);

  return (
    <section aria-labelledby="zi-detalii" className="min-w-0">
      <a href="#calendar" className="mb-3 inline-block text-sm font-semibold text-link underline underline-offset-4 lg:hidden">
        Înapoi la calendar
      </a>
      <div className="border-b border-line pb-4">
        <p className="text-sm font-semibold text-muted">{isToday ? 'Azi' : past ? 'Zi trecută' : 'Urmează'}</p>
        <h2 id="zi-detalii" ref={headingRef} tabIndex={-1} className="font-display mt-1 scroll-mt-24 text-[2rem] font-normal leading-tight text-ink focus:outline-none sm:text-4xl">
          {longDay(zi)}
        </h2>
        {s.bills > 0 && (
          <p className="mt-2 text-[15px] leading-7 tabular-nums text-body">
            {countWord(s.bills, 'proiect urmărit', 'proiecte urmărite')} în {countWord(sessions.length, 'ședință', 'ședințe')}
            {chambersWith.length > 1 && <> · {chambersWith.map((c) => `${CHAMBER_NAME[c]} ${s.by[c].bills}`).join(' · ')}</>}
            {redCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-risk-red-text">
                <Glyph level="red" className="h-2.5 w-2.5" />
                {redCount} cu risc ridicat
              </span>
            )}
          </p>
        )}
        {CHAMBERS.map((c) =>
          s.by[c].coverage === 'pending' && !(s.bills === 0 && CHAMBERS.every((x) => s.by[x].coverage !== 'read')) ? (
            <p key={c} className="mt-1 text-sm leading-6 text-muted">
              Ordinea de zi de la {c === 'senat' ? 'Senat' : 'Camera Deputaților'} pentru această zi nu e încă publicată sau citită.
            </p>
          ) : null,
        )}
      </div>

      {s.bills === 0 ? (
        <Empty ix={ix} zi={zi} today={today} s={s} prevDay={prevDay} nextDay={nextDay} onSelect={onSelect} />
      ) : (
        <>
          {past && (
            <div className="mt-5 rounded-xl bg-sunken px-4 py-3.5 text-[15px] leading-7 text-body">
              {!searched ? (
                <p>
                  <span className="font-semibold text-ink">Ce s-a întâmplat:</span> căutăm rezultatele la fiecare actualizare a site-ului, în zilele
                  lucrătoare; pentru ziua aceasta le căutăm la următoarea.
                </p>
              ) : withOutcome.length ? (
                <p>
                  <span className="font-semibold text-ink">Ce s-a întâmplat:</span> rezultat găsit pentru {withOutcome.length} din{' '}
                  {countWord(allItems.length, 'punct', 'puncte')} de pe ordinile de zi
                  {kinds.size > 0 && ` (${summaryKinds(kinds)})`}
                  {sameDay < withOutcome.length &&
                    `; ${withOutcome.length - sameDay === 1 ? 'unul e un pas înregistrat' : `${withOutcome.length - sameDay} sunt pași înregistrați`} în zilele următoare`}
                  . Pentru celelalte nu avem încă un rezultat.
                </p>
              ) : (
                <p>
                  <span className="font-semibold text-ink">Ce s-a întâmplat:</span> nu avem încă niciun rezultat pentru această zi. Rezultatele apar aici
                  când le găsim într-o sursă oficială pe care o citim (ordinea de zi a Senatului, fișa proiectului, votul din plen); pentru unele ședințe
                  nu apar deloc.
                </p>
              )}
            </div>
          )}
          {isToday && <p className="mt-5 text-sm leading-6 text-muted">Ședințele sunt azi; ce s-a hotărât apare aici după ce găsim într-o sursă oficială, la o actualizare următoare a site-ului.</p>}

          <div className="mt-5 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {chambersWith.length > 1 && (
                <div role="group" aria-label="Camera" className="no-scrollbar inline-flex max-w-full overflow-x-auto rounded-lg bg-sunken p-1">
                  {(['toate', ...CHAMBERS] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={filters.chamber === c}
                      onClick={() => setFilters((f) => ({ ...f, chamber: c }))}
                      className={`${segCls(filters.chamber === c)} min-h-9`}
                    >
                      {c === 'toate' ? 'Toate' : c === 'senat' ? 'Senat' : 'Camera'}
                      <span className="font-normal tabular-nums">{c === 'toate' ? s.bills : s.by[c].bills}</span>
                    </button>
                  ))}
                </div>
              )}
              {redCount > 0 && (
                <Toggle on={filters.red} onClick={() => setFilters((f) => ({ ...f, red: !f.red }))}>
                  <Glyph level="red" className="h-2.5 w-2.5" />
                  Doar risc ridicat <span className="font-normal tabular-nums">{redCount}</span>
                </Toggle>
              )}
              {past && searched && withOutcome.length > 0 && (
                <Toggle on={filters.withOutcome} onClick={() => setFilters((f) => ({ ...f, withOutcome: !f.withOutcome }))}>
                  Doar cu rezultat <span className="font-normal tabular-nums">{withOutcome.length}</span>
                </Toggle>
              )}
            </div>
            {s.appearances > 8 && (
              <label className="relative block max-w-md">
                <span className="sr-only">Caută în ziua aceasta</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
                <input
                  type="search"
                  value={filters.q}
                  onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                  placeholder="Caută după titlu, număr sau comisie"
                  className="h-11 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-3 text-base text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 sm:text-[15px]"
                />
              </label>
            )}
            {filtering && (
              <p className="text-sm text-muted" aria-live="polite">
                {shownCount ? `${shownCount} din ${countWord(s.appearances, 'punct', 'puncte')}` : 'Niciun proiect nu corespunde filtrelor.'}{' '}
                <button type="button" onClick={() => setFilters(NO_FILTERS)} className="font-semibold text-link underline underline-offset-4">
                  Arată tot
                </button>
              </p>
            )}
          </div>

          <div className="mt-5 space-y-4">
            {shown.map(({ sess, items }) => (
              <SessionSheet
                key={sess.key}
                sess={sess}
                items={items}
                ix={ix}
                zi={zi}
                past={past && searched}
                open={filtering || open.has(sess.key)}
                canToggle={!filtering}
                showAll={filtering || all.has(sess.key)}
                onToggle={() => setOpen((o) => toggled(o, sess.key))}
                onShowAll={() => setAll((a) => new Set(a).add(sess.key))}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

const toggled = (set: Set<string>, key: string) => {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
};

const KIND_WORDS: Partial<Record<OutcomeKind, [string, string]>> = {
  adoptat: ['adoptat', 'adoptate'],
  respins: ['respins', 'respinse'],
  retrimis: ['retrimis la comisie', 'retrimise la comisie'],
  raport: ['raport de comisie', 'rapoarte de comisie'],
  aviz: ['aviz de comisie', 'avize de comisie'],
  amanat: ['amânat', 'amânate'],
  dezbatut: ['dezbătut fără vot', 'dezbătute fără vot'],
  alt: ['alt rezultat', 'alte rezultate'],
};
const summaryKinds = (kinds: Map<OutcomeKind, number>) =>
  WEIGHT.filter((k) => kinds.get(k))
    .map((k) => countWord(kinds.get(k)!, ...KIND_WORDS[k]!))
    .join(', ');

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-semibold transition-colors ${
        on ? 'border-brand bg-brand text-on-brand' : 'border-line-strong bg-surface text-body hover:border-muted hover:bg-sunken'
      }`}
    >
      {children}
    </button>
  );
}

function Empty({
  ix,
  zi,
  today,
  s,
  prevDay,
  nextDay,
  onSelect,
}: {
  ix: CalIndex;
  zi: string;
  today: string;
  s: ReturnType<typeof summarize>;
  prevDay: string | null;
  nextDay: string | null;
  onSelect: (zi: string) => void;
}) {
  const noData = CHAMBERS.every((c) => s.by[c].coverage === 'none');
  const pending = !noData && CHAMBERS.every((c) => s.by[c].coverage !== 'read');
  const notYetRead = pending && zi <= today;
  const title = noData
    ? 'Nu avem date pentru această zi'
    : pending
      ? notYetRead
        ? 'Încă n-am citit ordinea de zi'
        : 'Ordinea de zi nu e publicată încă'
      : CHAMBERS.some((c) => ix.readSets[c].has(zi))
        ? 'Niciun proiect urmărit pe ordinea de zi'
        : 'Nicio ședință cu ordine de zi';
  const text = noData
    ? startSentence(ix.start)
    : notYetRead
      ? 'Ordinile de zi le citim la fiecare actualizare a site-ului, în zilele lucrătoare; pe cele pentru ziua aceasta le citim la următoarea.'
      : pending
        ? 'Senatul și comisiile Camerei publică ordinile de zi cu câteva zile înainte de ședințe; când apare pe ele un proiect urmărit, îl găsești aici.'
        : !CHAMBERS.some((c) => ix.readSets[c].has(zi))
          ? 'N-am găsit ordini de zi ale Senatului sau ale Camerei Deputaților pentru ziua aceasta.'
          : 'Pe ordinile de zi citite pentru ziua aceasta nu e niciun proiect pe care îl urmărim.';
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="font-display text-2xl text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">{text}</p>
      {(nextDay || prevDay) && (
        <div className="mt-5 flex flex-col items-center gap-2 text-sm">
          {nextDay && (
            <button type="button" onClick={() => onSelect(nextDay)} className={linkCls}>
              Următoarea zi cu proiecte: {mediumDay(nextDay)}
            </button>
          )}
          {prevDay && (
            <button type="button" onClick={() => onSelect(prevDay)} className={linkCls}>
              Ziua anterioară cu proiecte: {mediumDay(prevDay)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SessionSheet({
  sess,
  items,
  ix,
  zi,
  past,
  open,
  canToggle,
  showAll,
  onToggle,
  onShowAll,
}: {
  sess: CalSession;
  items: CalItem[];
  ix: CalIndex;
  zi: string;
  past: boolean;
  open: boolean;
  canToggle: boolean;
  showAll: boolean;
  onToggle: () => void;
  onShowAll: () => void;
}) {
  const bills = ix.data.bills;
  const red = items.filter((it) => bills[it.b].risk?.level === 'red').length;
  const done = items.filter((it) => it.outcomes.length).length;
  const visible = showAll ? items.length : initialRows(items.length, ROWS);
  const bodyId = `sedinta-${zi}-${sess.key}`;
  const when = sess.ora ? `ora ${sess.ora}${sess.oraFinal ? `–${sess.oraFinal}` : ''}` : 'ora nu e anunțată';
  const meta = [chamberOf(sess), when, sess.loc].filter(Boolean).join(' · ');
  const head = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-6 text-ink">{sess.comisie}</span>
        <span className="block text-sm leading-6 tabular-nums text-muted">{meta}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm tabular-nums text-body">
          <span>{countWord(items.length, 'proiect', 'proiecte')}</span>
          {red > 0 && (
            <span className="inline-flex items-center gap-1 font-semibold text-risk-red-text">
              <Glyph level="red" className="h-2.5 w-2.5" />
              {red} cu risc ridicat
            </span>
          )}
          {past && <span>{done ? `${done} cu rezultat` : 'fără rezultat încă'}</span>}
        </span>
      </span>
      {canToggle && <ChevronDown aria-hidden className={`mt-1 h-5 w-5 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />}
    </>
  );
  return (
    <div className={panel}>
      <h3 className="m-0">
        {canToggle ? (
          <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={onToggle} className="flex w-full items-start gap-4 rounded-2xl p-5 text-left sm:p-6">
            {head}
          </button>
        ) : (
          <span className="flex w-full items-start gap-4 p-5 sm:p-6">{head}</span>
        )}
      </h3>
      {open && (
        <div id={bodyId} className="-mt-2 px-5 pb-5 sm:px-6 sm:pb-6">
          {sess.url && (
            <a
              href={sess.url}
              target="_blank"
              rel="noopener noreferrer"
              {...trackAttrs('official_source_open', { source: `${sess.chamber}_agenda`, page: 'agenda' })}
              className="inline-block text-sm font-semibold text-link underline underline-offset-4 hover:decoration-2"
            >
              Ordinea de zi pe {SITE[sess.chamber]}
              <ExternalLink className="ml-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
              <span className="sr-only"> (se deschide într-o filă nouă)</span>
            </a>
          )}
          {sess.plen && sess.chamber === 'camera' && sess.items.length > 15 && (
            <p className="mt-2 text-sm leading-6 text-muted">
              Ordinea de zi a plenului Camerei e lungă și se reia de la o ședință la alta: multe proiecte de pe ea nu ajung să fie dezbătute în ziua
              respectivă.
            </p>
          )}
          <ul className="mt-4 divide-y divide-line border-t border-line">
            {items.slice(0, visible).map((it, i) => (
              <BillRow key={`${it.b}-${i}`} it={it} ix={ix} past={past} />
            ))}
          </ul>
          {visible < items.length && (
            <button
              type="button"
              onClick={onShowAll}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-line-strong bg-surface text-sm font-semibold text-ink transition-colors hover:border-muted hover:bg-sunken"
            >
              Arată toate cele {countWord(items.length, 'proiect', 'proiecte')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function BillRow({ it, ix, past }: { it: CalItem; ix: CalIndex; past: boolean }) {
  const b = ix.data.bills[it.b];
  return (
    <li className="py-4 last:pb-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {b.risk && <RiskChip level={b.risk.level} score={b.risk.score} />}
        <span className="text-xs tabular-nums text-muted">
          {b.id}
          {it.numar && ` · ${it.numar}`}
        </span>
      </div>
      <Link
        href={b.href}
        {...trackAttrs('bill_open', { bill_id: b.id, source: 'agenda' })}
        className="font-display mt-1.5 line-clamp-3 text-lg leading-snug text-ink decoration-line-strong decoration-1 underline-offset-4 hover:underline"
      >
        {b.title}
      </Link>
      {it.purpose && (
        <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted" title={it.purpose.length > 140 ? it.purpose : undefined}>
          {it.purpose}
        </p>
      )}
      {past &&
        (it.outcomes.length ? (
          <div className="mt-3 space-y-2">
            {it.outcomes.map((o, i) => (
              <Outcome key={i} o={o} />
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm leading-6 text-muted">Nu avem încă un rezultat pentru această zi.</p>
        ))}
    </li>
  );
}

function Outcome({ o }: { o: AgendaOutcome }) {
  return (
    <div className="border-l-2 border-brand pl-3 text-sm leading-6">
      <p className="text-body">
        {o.later ? <span className="text-muted">Ulterior, pe {dayMonth(o.date)}: </span> : <span className="sr-only">Rezultat: </span>}
        <span className="font-semibold text-ink">{o.text}</span>
        {o.detail && <span className="tabular-nums"> · {o.detail}</span>}
      </p>
      <p className="text-muted">
        Sursa:{' '}
        {o.sources.map((src, i) => (
          <span key={src.url}>
            {i > 0 && ', '}
            <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-link underline underline-offset-4 hover:decoration-2">
              {src.label}
              <span className="sr-only"> (se deschide într-o filă nouă)</span>
            </a>
          </span>
        ))}
      </p>
    </div>
  );
}
