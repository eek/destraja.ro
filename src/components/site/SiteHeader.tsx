'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  ChartColumn,
  ChevronDown,
  HeartHandshake,
  History,
  Hourglass,
  Landmark,
  Menu,
  Newspaper,
  Plug,
  Search,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Logo } from '@/components/Logo';
import { ALERTS_LIVE } from '@/lib/site';
import { ThemeToggle } from './ThemeControls';

type NavItem = { href: string; label: string; desc: string; icon: LucideIcon; match: (p: string) => boolean };
type NavGroup = { key: string; label: string; items: NavItem[] };

const starts = (...prefixes: string[]) => (p: string) => prefixes.some((x) => p === x || p.startsWith(`${x}/`) || p.startsWith(`${x}#`));

// Antetul are patru grupuri, ca să încapă pe un rând de la 1024 px. Un grup cu un singur element e legătură directă;
// cu două sau mai multe, meniu. Pe telefon, aceleași grupuri sunt secțiuni.
const GROUPS: NavGroup[] = [
  {
    key: 'parlament',
    label: 'Parlament',
    items: [
      { href: '/senat', label: 'Senat', desc: 'Proiecte în consultare publică', icon: Landmark, match: starts('/senat', '/legi') },
      { href: '/camera', label: 'Camera', desc: 'Unde au ajuns proiectele la deputați', icon: Building2, match: starts('/camera') },
      { href: '/agenda', label: 'Agenda', desc: 'Ședințele comisiilor și ale plenului', icon: CalendarDays, match: starts('/agenda') },
      { href: '/parlamentari', label: 'Parlamentari', desc: 'Ce a propus fiecare senator și deputat', icon: UsersRound, match: starts('/parlamentari') },
      { href: '/uitate', label: 'Proiecte uitate', desc: 'Cât așteaptă proiectele la Cameră', icon: Hourglass, match: starts('/uitate') },
    ],
  },
  {
    key: 'mo',
    label: 'Monitorul Oficial',
    items: [
      { href: '/monitorul-oficial', label: 'Monitorul Oficial, în cifre', desc: 'Actele publicate zi de zi, din 1990', icon: ChartColumn, match: starts('/monitorul-oficial') },
      // „Actele” (destraja.ro/acte) vine aici când se lansează; cu al doilea element, grupul devine meniu singur:
      // { href: '/acte', label: 'Actele', desc: '…', icon: ScrollText, match: starts('/acte') },
    ],
  },
  {
    key: 'date',
    label: 'Date',
    items: [
      { href: '/presa', label: 'Presă și date', desc: 'Partide, coaliții, presă și export CSV', icon: Newspaper, match: starts('/presa') },
      { href: '/mcp', label: 'MCP pentru asistenți AI', desc: 'destrajă.ro în Claude, ChatGPT și alții', icon: Plug, match: starts('/mcp') },
    ],
  },
  {
    key: 'despre',
    label: 'Despre',
    items: [
      { href: '/metodologie', label: 'Metodologie', desc: 'Cum citesc modelele fiecare proiect', icon: BookOpen, match: starts('/metodologie') },
      { href: '/noutati', label: 'Ce e nou', desc: 'Ce am adăugat și corectat pe site', icon: History, match: starts('/noutati') },
      { href: '/contributori', label: 'Contributori', desc: 'Cine a ajutat cu cod și idei', icon: HeartHandshake, match: starts('/contributori') },
    ],
  },
];

const ALERTS = { href: '/abonare', match: starts('/abonare') };
const SEARCH = { href: '/cauta', match: starts('/cauta') };

const HOVER_OPEN_MS = 90;
const HOVER_CLOSE_MS = 220;

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/** Câmpul de căutare al paginii (prima pagină, /cauta), dacă există; antetul nu are unul. */
const pageSearchInput = () => document.querySelector<HTMLInputElement>('main form[role="search"] input');

export default function SiteHeader() {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const mobileBtn = useRef<HTMLButtonElement>(null);
  const openedBy = useRef<'hover' | 'click' | null>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  const focusSearchAfterNav = useRef(false);

  const close = useCallback(() => {
    window.clearTimeout(hoverTimer.current);
    openedBy.current = null;
    setOpenKey(null);
  }, []);

  // Se închide orice la schimbarea paginii.
  useEffect(() => {
    close();
    setMobileOpen(false);
  }, [pathname, close]);

  // Click sau atingere în afara meniului îl închide.
  useEffect(() => {
    if (!openKey) return;
    const away = (e: PointerEvent) => {
      if (!navRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', onKey);
    };
  }, [openKey, close]);

  // Meniul de pe telefon stă peste pagină: pagina nu se derulează dedesubt, Esc sau o atingere în afară îl închid, iar
  // de la 1024 px dispare singur.
  useEffect(() => {
    if (!mobileOpen) return;
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileOpen(false);
        mobileBtn.current?.focus();
      }
    };
    const away = (e: PointerEvent) => {
      if (!headerRef.current?.contains(e.target as Node)) setMobileOpen(false);
    };
    document.addEventListener('pointerdown', away);
    const wide = window.matchMedia('(min-width: 1024px)');
    const onWide = () => wide.matches && setMobileOpen(false);
    window.addEventListener('keydown', onKey);
    wide.addEventListener('change', onWide);
    return () => {
      root.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', away);
      wide.removeEventListener('change', onWide);
    };
  }, [mobileOpen]);

  // Căutarea: „/” sau ⌘K / Ctrl+K pune cursorul în câmpul paginii, iar unde nu e câmp, deschide /cauta cu cursorul acolo.
  const goSearch = useCallback(() => {
    const input = pageSearchInput();
    if (input) {
      input.focus();
      input.select();
      return;
    }
    focusSearchAfterNav.current = true;
    router.push(SEARCH.href);
  }, [router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const slash = e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target);
      const cmdK = (e.metaKey || e.ctrlKey) && !e.altKey && e.key?.toLowerCase() === 'k';
      if (!slash && !cmdK) return;
      e.preventDefault();
      close();
      setMobileOpen(false);
      goSearch();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goSearch, close]);

  useEffect(() => {
    if (!focusSearchAfterNav.current || !SEARCH.match(pathname)) return;
    focusSearchAfterNav.current = false;
    // Câmpul de pe /cauta apare după Suspense; îl așteptăm câteva cadre.
    let frames = 0;
    let raf = 0;
    const tryFocus = () => {
      const input = pageSearchInput();
      if (input) input.focus();
      else if (frames++ < 120) raf = requestAnimationFrame(tryFocus);
    };
    tryFocus();
    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  const onSearchLink = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (SEARCH.match(pathname)) {
      e.preventDefault();
      pageSearchInput()?.focus();
    } else focusSearchAfterNav.current = true;
  };

  // Meniurile de pe desktop: click sau tastatură le deschide și le ține deschise; trecerea mouse-ului le deschide cu o
  // mică întârziere, iar un click după ea le fixează (nu le închide).
  const hoverEnter = (key: string, e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    window.clearTimeout(hoverTimer.current);
    if (openKey === key) return;
    if (openKey && openedBy.current === 'click') return;
    const open = () => {
      openedBy.current = 'hover';
      setOpenKey(key);
    };
    if (openKey) open();
    else hoverTimer.current = window.setTimeout(open, HOVER_OPEN_MS);
  };
  const hoverLeave = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    window.clearTimeout(hoverTimer.current);
    if (openedBy.current === 'hover') hoverTimer.current = window.setTimeout(close, HOVER_CLOSE_MS);
  };
  const toggle = (key: string) => {
    window.clearTimeout(hoverTimer.current);
    if (openKey === key && openedBy.current === 'hover') {
      openedBy.current = 'click';
      return;
    }
    if (openKey === key) close();
    else {
      openedBy.current = 'click';
      setOpenKey(key);
    }
  };

  const topLevel = () => [...(navRef.current?.querySelectorAll<HTMLElement>('[data-top]') ?? [])];
  const panelLinks = (key: string) => [...(navRef.current?.querySelectorAll<HTMLElement>(`#meniu-${key} a`) ?? [])];
  const moveTop = (from: HTMLElement, delta: number) => {
    const all = topLevel();
    const i = all.indexOf(from);
    all[(i + delta + all.length) % all.length]?.focus();
  };

  const onTopKey = (e: ReactKeyboardEvent<HTMLElement>, key?: string) => {
    const el = e.currentTarget;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      close();
      moveTop(el, e.key === 'ArrowRight' ? 1 : -1);
    } else if (key && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      openedBy.current = 'click';
      setOpenKey(key);
      const last = e.key === 'ArrowUp';
      // Panoul e în DOM tot timpul (doar ascuns), deci îl putem focusa după ce devine vizibil.
      requestAnimationFrame(() => {
        const links = panelLinks(key);
        links[last ? links.length - 1 : 0]?.focus();
      });
    } else if (e.key === 'Escape' && openKey) {
      e.preventDefault();
      close();
    }
  };

  const onPanelKey = (e: ReactKeyboardEvent<HTMLElement>, key: string) => {
    const links = panelLinks(key);
    const i = links.indexOf(document.activeElement as HTMLElement);
    const focusAt = (n: number) => links[(n + links.length) % links.length]?.focus();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusAt(i + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusAt(i - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusAt(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusAt(links.length - 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
      navRef.current?.querySelector<HTMLElement>(`[aria-controls="meniu-${key}"]`)?.focus();
    }
  };

  // Tab în afara unui meniu deschis îl închide.
  const onGroupBlur = (e: React.FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      if (openedBy.current !== 'hover') close();
    }
  };

  const searchActive = SEARCH.match(pathname);

  return (
    <header ref={headerRef} className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1240px] items-center gap-3 px-4 sm:h-[72px] sm:px-8 lg:px-10">
        <Link href="/" aria-label="destrajă.ro, pagina principală" className="shrink-0 rounded-md text-ink">
          <Logo className="h-9 w-auto sm:h-11" />
        </Link>

        <nav ref={navRef} aria-label="Navigație principală" className="ml-6 hidden lg:block xl:ml-10">
          <ul className="flex items-center gap-0.5">
            {GROUPS.map((g) => {
              const active = g.items.some((it) => it.match(pathname));
              if (g.items.length === 1) {
                const it = g.items[0];
                return (
                  <li key={g.key}>
                    <Link
                      href={it.href}
                      data-top
                      aria-current={active ? 'page' : undefined}
                      onKeyDown={(e) => onTopKey(e)}
                      className={`${topCls} ${active ? 'text-ink' : 'text-muted hover:bg-sunken hover:text-ink'}`}
                    >
                      <span className={active ? activeUnderline : undefined}>{g.label}</span>
                    </Link>
                  </li>
                );
              }
              const open = openKey === g.key;
              return (
                <li key={g.key} className="relative" onPointerEnter={(e) => hoverEnter(g.key, e)} onPointerLeave={hoverLeave} onBlur={onGroupBlur}>
                  <button
                    type="button"
                    data-top
                    aria-expanded={open}
                    aria-controls={`meniu-${g.key}`}
                    onClick={() => toggle(g.key)}
                    onKeyDown={(e) => onTopKey(e, g.key)}
                    className={`${topCls} gap-1 ${open ? 'bg-sunken text-ink' : active ? 'text-ink hover:bg-sunken' : 'text-muted hover:bg-sunken hover:text-ink'}`}
                  >
                    <span className={active ? activeUnderline : undefined}>{g.label}</span>
                    {active && <span className="sr-only">(aici e pagina curentă)</span>}
                    <ChevronDown
                      aria-hidden
                      className={`h-3.5 w-3.5 opacity-70 transition-transform duration-200 ease-out motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
                    />
                  </button>
                  <div
                    id={`meniu-${g.key}`}
                    onKeyDown={(e) => onPanelKey(e, g.key)}
                    className={`absolute left-0 top-full z-50 mt-[22px] w-[22.5rem] origin-top-left rounded-2xl border border-line bg-surface p-1.5 shadow-[var(--shadow-lift)] duration-150 ease-out motion-reduce:transition-none before:absolute before:inset-x-0 before:-top-[23px] before:h-[23px] ${
                      // Se arată pe loc (ca săgețile să poată muta focusul în panou) și se ascunde abia după ce s-a stins.
                      open ? 'visible translate-y-0 opacity-100 transition-[opacity,transform]' : 'invisible -translate-y-1 opacity-0 transition-[opacity,transform,visibility]'
                    }`}
                  >
                    <ul>
                      {g.items.map((it) => (
                        <li key={it.href}>
                          <PanelLink item={it} active={it.match(pathname)} onNavigate={close} />
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href={SEARCH.href}
            onClick={onSearchLink}
            aria-current={searchActive ? 'page' : undefined}
            aria-keyshortcuts="/ Control+K Meta+K"
            title="Caută (tasta /)"
            className={`group hidden h-10 w-[8.75rem] items-center gap-2 rounded-lg border bg-surface pl-3 pr-1.5 text-sm transition-colors lg:inline-flex xl:w-[17rem] ${
              searchActive ? 'border-brand text-ink' : 'border-line-strong text-muted hover:border-muted hover:text-ink'
            }`}
          >
            <Search className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">
              Caută<span className="hidden xl:inline"> proiect, parlamentar…</span>
            </span>
            <kbd
              aria-hidden
              className="ml-auto inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-line bg-sunken px-1.5 font-sans text-xs font-semibold text-muted"
            >
              /
            </kbd>
          </Link>
          <Link
            href={SEARCH.href}
            onClick={onSearchLink}
            aria-label="Caută"
            aria-current={searchActive ? 'page' : undefined}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink transition-colors hover:bg-sunken lg:hidden ${searchActive ? 'bg-sunken' : ''}`}
          >
            <Search className="h-5 w-5" aria-hidden />
          </Link>

          {ALERTS_LIVE && (
            <Link
              href={ALERTS.href}
              aria-current={ALERTS.match(pathname) ? 'page' : undefined}
              className="hidden h-10 items-center gap-2 rounded-lg bg-brand px-3.5 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-hover lg:inline-flex"
            >
              <Bell className="h-4 w-4" aria-hidden />
              Alerte
            </Link>
          )}

          <ThemeToggle />
          <button
            ref={mobileBtn}
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-expanded={mobileOpen}
            aria-controls="meniu-mobil"
            aria-label={mobileOpen ? 'Închide meniul' : 'Deschide meniul'}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink transition-colors hover:bg-sunken lg:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </div>

      <nav
        id="meniu-mobil"
        aria-label="Navigație principală"
        hidden={!mobileOpen}
        className="absolute inset-x-0 top-full max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain border-y border-line bg-paper shadow-[var(--shadow-lift)] sm:max-h-[calc(100dvh-72px)] lg:hidden"
      >
        <div className="mx-auto max-w-[1240px] px-4 pt-4 pb-6 sm:px-8">
          <Link
            href={SEARCH.href}
            onClick={onSearchLink}
            className="flex h-12 items-center gap-3 rounded-xl border border-line-strong bg-surface px-4 text-base text-muted"
          >
            <Search className="h-5 w-5 shrink-0" aria-hidden />
            Proiect, parlamentar sau subiect
          </Link>

          {/* Pe telefon secțiunile vin una sub alta; de la 640 px, Parlamentul în stânga și restul în dreapta. */}
          <div className="mt-2 sm:grid sm:grid-cols-2 sm:gap-x-10">
            {[GROUPS.slice(0, 1), GROUPS.slice(1)].map((col, ci) => (
              <div key={ci}>
                {col.map((g, gi) => (
                  <MobileSection key={g.key} id={`sectiune-${g.key}`} title={g.label} rule={gi > 0 ? 'always' : ci > 0 ? 'stacked' : 'never'}>
                    {g.items.map((it) => {
                      const active = it.match(pathname);
                      return (
                        <li key={it.href}>
                          <Link
                            href={it.href}
                            aria-current={active ? 'page' : undefined}
                            onClick={() => setMobileOpen(false)}
                            className={`-mx-3 flex min-h-12 items-center gap-3 rounded-lg px-3 text-base font-medium text-ink transition-colors ${
                              active ? 'bg-brand-soft' : 'hover:bg-sunken'
                            }`}
                          >
                            <it.icon className="h-[18px] w-[18px] shrink-0 text-muted" aria-hidden />
                            {it.label}
                          </Link>
                        </li>
                      );
                    })}
                  </MobileSection>
                ))}
              </div>
            ))}
          </div>

          {ALERTS_LIVE && (
            <Link
              href={ALERTS.href}
              onClick={() => setMobileOpen(false)}
              aria-current={ALERTS.match(pathname) ? 'page' : undefined}
              className="mt-5 flex h-12 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-[15px] font-semibold text-on-brand transition-colors hover:bg-brand-hover"
            >
              <Bell className="h-[18px] w-[18px]" aria-hidden />
              Alerte pe e-mail
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}

const topCls =
  'inline-flex h-10 items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors';
const activeUnderline = 'underline decoration-2 underline-offset-[10px]';

function PanelLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      className={`group/item flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors ${active ? 'bg-brand-soft' : 'hover:bg-sunken focus-visible:bg-sunken'}`}
    >
      <Icon
        aria-hidden
        className={`mt-0.5 h-[18px] w-[18px] shrink-0 transition-colors ${active ? 'text-ink' : 'text-muted group-hover/item:text-ink'}`}
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-5 text-ink">{item.label}</span>
        {/* Pe spălătura bleumarin din tema întunecată, muted ar ieși sub 4,5:1; rândul curent ia culoarea textului. */}
        <span className={`mt-0.5 block text-[13px] leading-5 ${active ? 'text-body' : 'text-muted'}`}>{item.desc}</span>
      </span>
    </Link>
  );
}

// Hairline deasupra fiecărei secțiuni, în afară de prima din fiecare coloană (pe telefon, doar de prima de tot).
function MobileSection({ id, title, rule, children }: { id: string; title: string; rule: 'always' | 'stacked' | 'never'; children: ReactNode }) {
  const ruleCls = rule === 'always' ? 'border-t border-line' : rule === 'stacked' ? 'border-t border-line sm:border-0' : '';
  return (
    <div className={`${ruleCls} pt-4 pb-2`}>
      <p id={id} className="pb-1 text-xs font-semibold text-muted">
        {title}
      </p>
      <ul aria-labelledby={id}>{children}</ul>
    </div>
  );
}
