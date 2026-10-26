'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Rotate3d } from 'lucide-react';
import type { BillLite, RiskLevel } from '@/lib/types';
import { RISK, RISK_LEVELS } from '@/lib/risk';
import { countWord, fmt } from '@/lib/format';
import { byRiskDesc, type RiskCounts } from '@/lib/stats';
import { RiskDot } from '@/components/ui';
import { track, trackAttrs } from '@/lib/analytics';
import BillPeek from '../BillPeek';
import { boardGrid, POSTER_BOARD, type Notice, type VillageScene } from './types';

/** waiting: posterul, până se încarcă scena; live: scena 3D; poster: rămâne posterul (fără WebGL sau cu economisirea datelor). */
type Mode = 'waiting' | 'live' | 'poster';

/** Cât de aproape de ecran trebuie să fie scena ca să începem s-o încărcăm. */
const NEAR_VIEWPORT = '300px';
const IDLE_TIMEOUT_MS = 1500;
/** Ținem minte că vizitatorul a rotit deja satul, ca să nu-i mai arătăm îndemnul. */
const ROTATED_KEY = 'lastraja-sat-rotit';

type NetworkHints = Navigator & { connection?: { saveData?: boolean } };

function label(b: BillLite) {
  const c = b.analysis.consensus;
  return `${b.id}: ${c.plainTitle}. ${RISK[c.riskLevel].label}, scor ${fmt(c.riskScore)} din 10`;
}

function whenIdle(fn: () => void) {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(fn, { timeout: IDLE_TIMEOUT_MS });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(fn, 200);
  return () => clearTimeout(id);
}

function rotatedBefore() {
  try {
    return localStorage.getItem(ROTATED_KEY) === '1';
  } catch {
    return false;
  }
}

export default function VillageHero({ bills }: { bills: BillLite[]; counts: RiskCounts }) {
  const open = useMemo(() => bills.filter((b) => b.daysRemaining >= 0).sort(byRiskDesc), [bills]);
  const ranked = useMemo(() => [...bills].sort(byRiskDesc), [bills]);
  const openCounts = useMemo(() => {
    const c: Record<RiskLevel, number> = { red: 0, yellow: 0, green: 0 };
    for (const b of open) c[b.analysis.consensus.riskLevel] += 1;
    return c;
  }, [open]);
  const notices: Notice[] = useMemo(() => open.map((b) => ({ id: b.id, level: b.analysis.consensus.riskLevel })), [open]);
  const newspaper = open.some((b) => b.press.recent > 0);

  const [activeId, setActiveId] = useState<string | null>(null);
  const active = (activeId ? bills.find((b) => b.id === activeId) : undefined) ?? open[0] ?? ranked[0];
  const activeIndex = open.findIndex((b) => b.id === active?.id);

  const [mode, setMode] = useState<Mode>('waiting');
  const [ready, setReady] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [hint, setHint] = useState(false);
  const [coarse, setCoarse] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardRef = useRef<HTMLButtonElement>(null);
  const sceneRef = useRef<VillageScene | null>(null);
  const liveRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const posterRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const fromUser = useRef(false);
  const touchMode = useRef({ coarse: false, zoomed: false });
  touchMode.current = { coarse, zoomed };
  const latest = useRef({ notices, newspaper, activeId: active?.id ?? null });
  latest.current = { notices, newspaper, activeId: active?.id ?? null };

  const pick = useCallback((id: string, user: boolean) => {
    fromUser.current = user;
    setActiveId(id);
  }, []);

  useEffect(() => setCoarse(window.matchMedia('(pointer: coarse)').matches), []);

  // Încărcăm scena doar când figura e aproape de ecran și browserul are un moment liber.
  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    if (!box || !canvas) return;
    // Cu economisirea datelor activă rămâne posterul: fără three.js, fără WebGL.
    if ((navigator as NetworkHints).connection?.saveData) {
      setMode('poster');
      return;
    }
    let cancelIdle: (() => void) | null = null;
    let dead = false;
    const poster = window.location.hash.includes('sat-poster');

    const start = () => {
      cancelIdle = whenIdle(async () => {
        try {
          const { createVillageScene } = await import('./scene');
          if (dead) return;
          const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
          const scene = createVillageScene(canvas, {
            notices: latest.current.notices,
            activeId: latest.current.activeId,
            newspaper: latest.current.newspaper,
            reducedMotion: reduce.matches,
            poster,
            surface: box,
            onProject: (rects, facing) => {
              const { coarse: c, zoomed: z } = touchMode.current;
              // Pe telefon, în afara prim-planului, o atingere pe tablă apropie camera; afișele se aleg de aproape.
              const tappable = facing && !(c && !z);
              liveRefs.current.forEach((el, i) => {
                if (!el) return;
                const w = Math.max(rects[i * 4 + 2], 6) + 2;
                const h = Math.max(rects[i * 4 + 3], 6) + 2;
                el.style.width = `${w}px`;
                el.style.height = `${h}px`;
                el.style.transform = `translate(${rects[i * 4] - w / 2}px, ${rects[i * 4 + 1] - h / 2}px)`;
                el.style.pointerEvents = tappable ? 'auto' : 'none';
              });
              const b = boardRef.current;
              const n = (rects.length >> 2) - 1;
              if (b) {
                const w = rects[n * 4 + 2] + 16;
                const h = rects[n * 4 + 3] + 16;
                b.style.width = `${w}px`;
                b.style.height = `${h}px`;
                b.style.transform = `translate(${rects[n * 4] - w / 2}px, ${rects[n * 4 + 1] - h / 2}px)`;
                b.style.pointerEvents = facing ? 'auto' : 'none';
              }
            },
            onFirstFrame: () => setReady(true),
            onContextLost: () => {
              sceneRef.current?.dispose();
              sceneRef.current = null;
              setReady(false);
              setMode('poster');
            },
            onRotate: () => {
              setHint(false);
              try {
                localStorage.setItem(ROTATED_KEY, '1');
              } catch {
                // Fără stocare locală îndemnul reapare la următoarea vizită, atât.
              }
            },
            onZoom: setZoomed,
          });
          sceneRef.current = scene;
          setMode('live');
          setHint(!poster && !rotatedBefore());
          scene.setVisible(true);
        } catch (err) {
          // Fără WebGL (sau dacă scena nu pornește) rămâne posterul, cu aceleași afișe alegibile.
          console.warn('[sat] scena 3D nu a pornit', err);
          setMode('poster');
        }
      });
    };

    const near = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          near.disconnect();
          start();
        }
      },
      { rootMargin: NEAR_VIEWPORT },
    );
    near.observe(box);

    return () => {
      dead = true;
      near.disconnect();
      cancelIdle?.();
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Oprim desenul când scena nu e pe ecran sau tab-ul e ascuns.
  useEffect(() => {
    const box = boxRef.current;
    if (!box || mode !== 'live') return;
    let onScreen = true;
    const apply = () => sceneRef.current?.setVisible(onScreen && document.visibilityState === 'visible');
    const io = new IntersectionObserver((entries) => {
      onScreen = entries.some((e) => e.isIntersecting);
      apply();
    });
    io.observe(box);
    document.addEventListener('visibilitychange', apply);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onReduce = () => sceneRef.current?.setReducedMotion(reduce.matches);
    reduce.addEventListener('change', onReduce);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', apply);
      reduce.removeEventListener('change', onReduce);
    };
  }, [mode]);

  // Tema: atributul data-theme de pe <html> sau preferința sistemului. Posterul își schimbă singur imaginea, prin CSS.
  useEffect(() => {
    if (mode !== 'live') return;
    const sync = () => sceneRef.current?.setTheme();
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', sync);
    return () => {
      mo.disconnect();
      mq.removeEventListener('change', sync);
    };
  }, [mode]);

  useEffect(() => {
    sceneRef.current?.setNotices(notices, newspaper);
  }, [notices, newspaper, mode]);

  useEffect(() => {
    sceneRef.current?.setActive(active?.id ?? null, fromUser.current);
    fromUser.current = false;
  }, [active?.id, mode]);

  // Esc închide prim-planul avizierului.
  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') sceneRef.current?.setZoom(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomed]);

  const go = (delta: number) => {
    if (!open.length) return;
    const i = activeIndex < 0 ? 0 : (activeIndex + delta + open.length) % open.length;
    pick(open[i].id, true);
  };

  const live = mode === 'live' && ready;
  const refs = live ? liveRefs : posterRefs;
  const onNoticeKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const { cols } = boardGrid(open.length);
    const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
    if (!delta) return;
    e.preventDefault();
    const j = Math.min(open.length - 1, Math.max(0, i + delta));
    refs.current[j]?.focus();
    pick(open[j].id, true);
    track('village_select', { bill_id: open[j].id });
  };

  const choose = (id: string) => {
    pick(id, true);
    if (zoomed) sceneRef.current?.setZoom(false);
  };

  const prev = open.length ? open[(Math.max(0, activeIndex) - 1 + open.length) % open.length] : undefined;
  const next = open.length ? open[(Math.max(0, activeIndex) + 1) % open.length] : undefined;
  const altText = `Satul de la straja legii: ${countWord(open.length, 'proiect', 'proiecte')} în consultare pe avizier. ${RISK_LEVELS.map(
    (l) => `${RISK[l].label}: ${openCounts[l]}`,
  ).join('. ')}.`;

  return (
    <figure className="rounded-[1.75rem] border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-6">
      <figcaption className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-ink">Avizierul satului</span>
        <span className="text-xs tabular-nums text-muted">{countWord(open.length, 'proiect în consultare', 'proiecte în consultare')}</span>
      </figcaption>

      <div
        ref={boxRef}
        className={`relative mx-auto mt-2 aspect-[5/4] w-full max-w-[520px] touch-pan-y select-none ${
          mode === 'live' ? '[@media(pointer:fine)]:cursor-grab data-[dragging]:cursor-grabbing' : ''
        }`}
      >
        <p className="sr-only">{altText}</p>
        {/* Posterul apare imediat, din CSS (după temă); scena 3D îl acoperă când e gata. */}
        <div
          aria-hidden
          className={`absolute inset-0 bg-[image:var(--sat-poster)] bg-[length:100%_100%] bg-no-repeat transition-opacity duration-700 motion-reduce:transition-none ${
            live ? 'opacity-0' : 'opacity-100'
          }`}
        />
        {!live && <PosterNotices open={open} activeId={active?.id} onPick={pick} refs={posterRefs} onKey={onNoticeKey} onChoose={choose} />}
        <canvas
          ref={canvasRef}
          aria-hidden
          className={`absolute inset-0 h-full w-full transition-opacity duration-700 motion-reduce:transition-none ${live ? 'opacity-100' : 'opacity-0'}`}
        />
        {mode === 'live' && (
          <div className="absolute inset-0" role="group" aria-label="Afișele de pe avizier. Alege un afiș ca să vezi proiectul.">
            {coarse && !zoomed && (
              <button
                ref={boardRef}
                type="button"
                tabIndex={-1}
                aria-hidden
                className="absolute left-0 top-0 h-0 w-0 rounded-md bg-transparent"
                onClick={() => sceneRef.current?.setZoom(true)}
              />
            )}
            {open.map((b, i) => (
              <button
                key={b.id}
                ref={(el) => {
                  liveRefs.current[i] = el;
                }}
                type="button"
                aria-pressed={b.id === active?.id}
                aria-label={label(b)}
                className="absolute left-0 top-0 h-0 w-0 cursor-pointer rounded-[3px] bg-transparent"
                onMouseEnter={() => pick(b.id, false)}
                onFocus={() => pick(b.id, true)}
                onClick={() => choose(b.id)}
                onKeyDown={(e) => onNoticeKey(e, i)}
                {...trackAttrs('village_select', { bill_id: b.id })}
              />
            ))}
          </div>
        )}
        {zoomed && (
          <button
            type="button"
            onClick={() => sceneRef.current?.setZoom(false)}
            className="absolute left-2 top-2 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line bg-surface/95 px-3.5 text-xs font-semibold text-ink shadow-[var(--shadow-card)]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Înapoi la sat
          </button>
        )}
        {mode === 'live' && (
          <p
            aria-hidden
            className={`pointer-events-none absolute right-0 top-0 inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted transition-opacity duration-500 ${
              hint && ready && !zoomed ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <Rotate3d className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {coarse ? 'Trage ca să rotești. Atinge avizierul.' : 'Trage de sat ca să-l rotești'}
          </p>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={open.length < 2}
          aria-label={prev ? `Afișul anterior: ${prev.id}` : 'Afișul anterior'}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-sunken hover:text-ink disabled:opacity-40"
          {...(prev ? trackAttrs('village_select', { bill_id: prev.id }) : {})}
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted">
          {RISK_LEVELS.map((l) => (
            <span key={l} className="inline-flex items-center gap-1.5">
              <RiskDot level={l} />
              {RISK[l].label}
              <span className="tabular-nums font-semibold text-body">{openCounts[l]}</span>
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={open.length < 2}
          aria-label={next ? `Afișul următor: ${next.id}` : 'Afișul următor'}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-sunken hover:text-ink disabled:opacity-40"
          {...(next ? trackAttrs('village_select', { bill_id: next.id }) : {})}
        >
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {active && <BillPeek bill={active} source="sat" />}
    </figure>
  );
}

/** Afișele desenate peste tabla goală din poster: merg înainte de scena 3D și fără WebGL. */
function PosterNotices({
  open,
  activeId,
  onPick,
  refs,
  onKey,
  onChoose,
}: {
  open: BillLite[];
  activeId: string | undefined;
  onPick: (id: string, user: boolean) => void;
  refs: RefObject<(HTMLButtonElement | null)[]>;
  onKey: (e: KeyboardEvent<HTMLButtonElement>, i: number) => void;
  onChoose: (id: string) => void;
}) {
  const { cols, rows } = boardGrid(open.length);
  return (
    <div
      role="group"
      aria-label="Afișele de pe avizier. Alege un afiș ca să vezi proiectul."
      className="absolute grid gap-x-[1.8%] gap-y-[9%] p-[0.4%]"
      style={{
        left: `${POSTER_BOARD.left}%`,
        top: `${POSTER_BOARD.top}%`,
        width: `${POSTER_BOARD.width}%`,
        height: `${POSTER_BOARD.height}%`,
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        transform: `skewY(${POSTER_BOARD.skew}deg)`,
      }}
    >
      {open.map((b, i) => {
        const on = b.id === activeId;
        return (
          <button
            key={b.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            aria-pressed={on}
            aria-label={label(b)}
            className={`mx-auto aspect-[11/10] h-full max-w-full rounded-[1px] ${RISK[b.analysis.consensus.riskLevel].fill} ${on ? 'relative z-10 scale-125 ring-2 ring-surface' : ''} transition-transform`}
            onMouseEnter={() => onPick(b.id, false)}
            onFocus={() => onPick(b.id, true)}
            onClick={() => onChoose(b.id)}
            onKeyDown={(e) => onKey(e, i)}
            {...trackAttrs('village_select', { bill_id: b.id })}
          />
        );
      })}
    </div>
  );
}
