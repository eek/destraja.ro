'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { WALL, weeks, type WallMode } from './wall-geometry';

const WEEKDAYS = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const fmt = (n: number) => n.toLocaleString('ro-RO');
const acts = (n: number) => (n === 1 ? '1 act' : `${fmt(n)}${n % 100 === 0 || n % 100 >= 20 ? ' de' : ''} acte`);

function dateOf(year: number, i: number) {
  const d = new Date(Date.UTC(year, 0, 1 + i));
  return { iso: d.toISOString().slice(0, 10), text: `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${year}` };
}

/**
 * Indicatorul zidului: din poziția mouse-ului (sau a degetului) găsim anul și ziua (săptămâna), apoi spunem data și
 * câte acte are. Desenul rămâne cel de pe server; aici e doar eticheta.
 */
export default function WallHover({ data, to, pending, children }: { data: string; to: string; pending: string[]; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; text: string; sub: string } | null>(null);
  const calendar = useMemo(
    () =>
      data.split(';').map((row) => {
        const [y, vals] = row.split(':');
        return { year: Number(y), values: vals.split(',').map((v) => (v === '' ? null : Number(v))) };
      }),
    [data],
  );

  const move = (e: React.PointerEvent) => {
    // Zidul vizibil (zile pe ecran lat, săptămâni pe telefon) dă geometria.
    const el = (e.target as Element).closest<HTMLElement>('[data-mode]');
    if (!el || !box.current) return setTip(null);
    const mode = el.dataset.mode as WallMode;
    const g = WALL[mode];
    const pitch = g.row + g.rowGap;
    const width = g.label + g.cols * g.col;
    const r = el.getBoundingClientRect();
    const outer = box.current.getBoundingClientRect();
    const scale = r.width / width;
    const ux = (e.clientX - r.left) / scale;
    const uy = (e.clientY - r.top) / scale;
    const row = Math.floor((uy - g.top) / pitch);
    const col = Math.floor((ux - g.label) / g.col);
    const c = calendar[row];
    if (!c || col < 0 || col >= g.cols || uy < g.top) return setTip(null);
    let text: string;
    let sub: string;
    if (mode === 'day') {
      if (col >= c.values.length) return setTip(null);
      const d = dateOf(c.year, col);
      if (d.iso > to) return setTip(null);
      const v = c.values[col];
      text = d.text;
      sub = v === null ? (pending.includes(d.iso) ? 'încă neindexată de portal' : 'necitită încă') : v === 0 ? 'niciun act în index' : acts(v);
    } else {
      const w = weeks(c.values)[col];
      const a = dateOf(c.year, w.from);
      const b = dateOf(c.year, Math.min(c.values.length - 1, w.from + 6));
      if (a.iso > to) return setTip(null);
      text = `${a.text.split(', ')[1].replace(` ${c.year}`, '')} – ${b.text.split(', ')[1]}`;
      sub = w.known === 0 ? 'necitită încă' : `${acts(w.sum)}${w.unknown && b.iso <= to ? `, ${w.unknown} ${w.unknown === 1 ? 'zi necitită sau neindexată' : 'zile necitite sau neindexate'}` : ''}`;
    }
    setTip({ x: e.clientX - outer.left, y: e.clientY - outer.top, text, sub });
  };

  return (
    <div ref={box} className="relative touch-pan-y" onPointerMove={move} onPointerDown={move} onPointerLeave={() => setTip(null)}>
      {children}
      {tip && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-10 w-max max-w-[16rem] rounded-lg border border-line bg-surface px-3 py-2 text-xs leading-5 shadow-[var(--shadow-card)]"
          style={{ left: Math.max(0, Math.min(tip.x - 40, (box.current?.clientWidth ?? 0) - 256)), top: tip.y > 70 ? tip.y - 64 : tip.y + 20 }}
        >
          <span className="block font-semibold text-ink">{tip.text}</span>
          <span className="block tabular-nums text-body">{tip.sub}</span>
        </div>
      )}
    </div>
  );
}
