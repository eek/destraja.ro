'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CornerDownLeft, Search, UserRound } from 'lucide-react';
import { btnPrimary } from '@/components/ui';
import { loadPeople, logSearch, matchPeople, searchHref, type Person } from '@/lib/search';

type Option = { kind: 'person'; person: Person } | { kind: 'search' };

/**
 * Câmpul de căutare, pe prima pagină (`hero`) și pe /cauta (`page`). Cât scrii, apar parlamentarii al căror nume se
 * potrivește (lista vine o singură dată, la primul focus); Enter caută în proiecte, pe /cauta. Tiparul e combobox-ul
 * ARIA: săgețile aleg, Enter deschide, Esc închide lista.
 */
export default function SearchBox({ variant = 'hero', initial = '', onSearch }: { variant?: 'hero' | 'page'; initial?: string; onSearch?: (q: string) => void }) {
  const router = useRouter();
  const id = useId();
  const listId = `${id}-lista`;
  const form = useRef<HTMLFormElement>(null);
  const [q, setQ] = useState(initial);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  useEffect(() => setQ(initial), [initial]);
  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!form.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, []);

  const text = q.trim();
  const matches = people && text.length >= 2 ? matchPeople(people, text, 5) : [];
  const options: Option[] = text.length >= 2 ? [...matches.map((person) => ({ kind: 'person' as const, person })), { kind: 'search' as const }] : [];
  const expanded = open && options.length > 0;
  const warm = () => {
    if (!people) loadPeople().then(setPeople);
  };

  const choose = (o?: Option) => {
    if (!text) return;
    setOpen(false);
    setActive(-1);
    if (o?.kind === 'person') {
      const target = `/parlamentari/${o.person.s}`;
      logSearch({ kind: 'open', q: text, target, rank: matches.indexOf(o.person) + 1 });
      router.push(target);
    } else if (onSearch) onSearch(text);
    else router.push(searchHref(text));
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && options.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === 'ArrowUp' && options.length) {
      e.preventDefault();
      setActive((i) => Math.max(-1, i - 1));
    } else if (e.key === 'Escape') {
      if (expanded) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      }
    }
  };

  const hero = variant === 'hero';
  return (
    <form
      ref={form}
      role="search"
      className="relative"
      onSubmit={(e) => {
        e.preventDefault();
        choose(active >= 0 ? options[active] : undefined);
      }}
    >
      <div
        className={`flex items-center gap-2 rounded-xl border border-line-strong bg-surface pl-4 transition-[border-color,box-shadow] focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15 ${
          hero ? 'h-[60px] pr-1.5 sm:h-16 sm:pl-5' : 'h-14 pr-1.5'
        }`}
      >
        <Search className={`${hero ? 'h-5 w-5 sm:h-[22px] sm:w-[22px]' : 'h-5 w-5'} shrink-0 text-muted`} aria-hidden />
        <label htmlFor={`${id}-q`} className="sr-only">
          Caută un proiect de lege, un parlamentar sau un subiect
        </label>
        <input
          id={`${id}-q`}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded && active >= 0 ? `${id}-o${active}` : undefined}
          value={q}
          placeholder="Proiect, parlamentar sau subiect"
          onFocus={() => {
            warm();
            setOpen(true);
          }}
          onChange={(e) => {
            warm();
            setQ(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={onKey}
          maxLength={200}
          className={`search-field h-full min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden ${
            hero ? 'text-base sm:text-lg' : 'text-base'
          }`}
        />
        <button type="submit" className={`${btnPrimary} shrink-0 text-[15px] ${hero ? 'h-12 w-12 sm:h-[52px] sm:w-auto sm:px-5' : 'h-11 w-11 sm:w-auto sm:px-4'}`}>
          <span className="sr-only sm:not-sr-only">Caută</span>
          <ArrowRight className="h-[18px] w-[18px] sm:h-4 sm:w-4" aria-hidden />
        </button>
      </div>

      <ul
        id={listId}
        role="listbox"
        aria-label="Sugestii"
        hidden={!expanded}
        className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-line bg-surface py-1.5 shadow-[var(--shadow-lift)]"
      >
        {matches.length > 0 && (
          <li role="presentation" className="px-4 pt-1.5 pb-1 text-xs font-semibold text-muted">
            Parlamentari
          </li>
        )}
        {options.map((o, i) => (
          <li
            key={o.kind === 'person' ? o.person.s : 'cauta'}
            id={`${id}-o${i}`}
            role="option"
            aria-selected={i === active}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => choose(o)}
            onPointerMove={() => setActive(i)}
            className={`flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2 ${i === active ? 'bg-sunken' : ''} ${
              o.kind === 'search' && matches.length ? 'mt-1.5 border-t border-line pt-3' : ''
            }`}
          >
            {o.kind === 'person' ? (
              <>
                <UserRound className="h-[18px] w-[18px] shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">{o.person.n}</span>
                  <span className="block text-xs text-muted">
                    {[o.person.r, o.person.p, `${o.person.b} ${o.person.b === 1 ? 'proiect inițiat' : 'proiecte inițiate'}`].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </>
            ) : (
              <>
                <Search className="h-[18px] w-[18px] shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-ink">
                  Caută <span className="font-semibold">„{text}”</span> în proiecte
                </span>
                <CornerDownLeft className="hidden h-4 w-4 shrink-0 text-faint sm:block" aria-hidden />
              </>
            )}
          </li>
        ))}
      </ul>
    </form>
  );
}
