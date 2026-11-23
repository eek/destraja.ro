import type { MoStats } from '@/lib/mo';
import { DAY_BINS, WALL, WEEK_BINS, binOf, weeks, type WallMode } from './wall-geometry';
import WallHover from './WallHover';

const MONTHS = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.'];
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

const dayIndex = (iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${iso.slice(0, 4)}-01-01T00:00:00Z`)) / 86_400_000);

interface Peak {
  date: string;
  label: string;
}

/**
 * Zidul de zile: un rând pe an (2003 → anul curent), o celulă pe zi, bleumarin mai închis = mai multe acte. Hașura
 * înseamnă „necitit încă” (sau, în ultimele săptămâni, „încă neindexat”); celula pală = zi citită fără niciun act (de
 * regulă weekend sau sărbătoare). Pe telefon, săptămâni în loc de zile. Desenat pe server: un <path> pe treaptă.
 */
export default function Wall({ stats, peaks }: { stats: MoStats; peaks: Peak[] }) {
  // Datele pentru indicator, o singură dată și compact: un an pe rând, zilele despărțite prin virgulă, gol = necitit.
  const data = stats.calendar.map((c) => `${c.year}:${c.values.map((v) => (v === null ? '' : v)).join(',')}`).join(';');
  return (
    <WallHover data={data} to={stats.to} pending={stats.pendingDays}>
      <div className="hidden md:block" data-mode="day">
        <WallSvg mode="day" stats={stats} peaks={peaks} />
      </div>
      <div className="md:hidden" data-mode="week">
        <WallSvg mode="week" stats={stats} peaks={[]} />
      </div>
    </WallHover>
  );
}

function WallSvg({ mode, stats, peaks }: { mode: WallMode; stats: MoStats; peaks: Peak[] }) {
  const g = WALL[mode];
  const rows = stats.calendar.length;
  const pitch = g.row + g.rowGap;
  const width = g.label + g.cols * g.col;
  const annotDepth = peaks.length ? 18 + peaks.length * 16 : 4;
  const height = g.top + rows * pitch + annotDepth;
  const toYear = Number(stats.to.slice(0, 4));
  const toIdx = dayIndex(stats.to);
  const bins = mode === 'day' ? DAY_BINS : WEEK_BINS;
  // Fiecare treaptă e un singur <path> desenat cu linii verticale groase cât o celulă: „M x y v15”, apoi „m3-15v15” până
  // la celula următoare din rând. Așa pagina rămâne mică (zidul se trimite și în HTML, și în datele React).
  const paths: string[][] = [[], [], [], [], [], []];
  const last: ({ r: number; x: number } | null)[] = [null, null, null, null, null, null];
  const n = (v: number) => String(Math.round(v * 10) / 10);
  const stroke = (b: number, x: number, r: number, y: number) => {
    const prev = last[b];
    paths[b].push(prev && prev.r === r ? `m${n(x - prev.x)}-${g.row}v${g.row}` : `M${n(x)} ${y}v${g.row}`);
    last[b] = { r, x };
  };
  const hatches: string[] = [];

  stats.calendar.forEach((c, r) => {
    const y = g.top + r * pitch;
    const cell = (x: number, w = g.cell) => `M${x.toFixed(1)} ${y}h${w}v${g.row}h${-w}z`;
    if (mode === 'day') {
      let run: number | null = null;
      const flush = (end: number) => {
        if (run === null) return;
        hatches.push(`M${g.label + run * g.col} ${y}h${(end - run) * g.col - (g.col - g.cell)}v${g.row}h${-((end - run) * g.col - (g.col - g.cell))}z`);
        run = null;
      };
      c.values.forEach((v, i) => {
        const future = c.year > toYear || (c.year === toYear && i > toIdx);
        if (v === null && !future) {
          run ??= i;
          return;
        }
        flush(i);
        if (v === null) return;
        stroke(binOf(v, bins), g.label + i * g.col + g.cell / 2, r, y);
      });
      flush(c.values.length);
    } else {
      weeks(c.values).forEach((w, i) => {
        const x = g.label + i * g.col;
        const futureDays = c.year === toYear ? Math.max(0, Math.min(c.values.length, w.from + 7) - Math.max(w.from, toIdx + 1)) : c.year > toYear ? 7 : 0;
        const realUnknown = w.unknown - futureDays;
        if (w.known === 0 && realUnknown <= 0) return;
        // O săptămână mai mult necitită decât citită e hașurată; altfel suma zilelor citite (o limită de jos).
        if (realUnknown > w.known) hatches.push(cell(x));
        else stroke(binOf(w.sum, bins), x + g.cell / 2, r, y);
      });
    }
  });

  const labelEvery = mode === 'day' ? 1 : 2;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" role="img" aria-labelledby={`zid-${mode}-desc`}>
      <desc id={`zid-${mode}-desc`}>
        {`Actele publicate în Monitorul Oficial, Partea I, în fiecare ${mode === 'day' ? 'zi' : 'săptămână'} din ${stats.calendar[0].year} până pe ${stats.to}, după indexul Portalului Legislativ. Zonele hașurate nu sunt citite încă. Cifrele pe ani sunt în tabelul de la final.`}
      </desc>
      <defs>
        <pattern id={`hatch-${mode}`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="4" height="4" fill="var(--paper)" />
          <line x1="0" y1="0" x2="0" y2="4" stroke="var(--mo-hatch)" strokeWidth="1.3" />
        </pattern>
      </defs>
      {MONTH_START.map((d, m) => (
        <text
          key={m}
          x={g.label + (mode === 'day' ? d : d / 7) * g.col}
          y={g.top - 7}
          className="fill-muted"
          fontSize={mode === 'day' ? 10 : 8}
        >
          {mode === 'day' || m % 3 === 0 ? MONTHS[m] : ''}
        </text>
      ))}
      {stats.calendar.map((c, r) =>
        r % labelEvery === 0 ? (
          <text key={c.year} x={g.label - 6} y={g.top + r * pitch + g.row - (mode === 'day' ? 3 : 1.5)} textAnchor="end" className="fill-muted tabular-nums" fontSize={mode === 'day' ? 10 : 7.5}>
            {mode === 'day' ? c.year : `’${String(c.year).slice(2)}`}
          </text>
        ) : null,
      )}
      <path d={hatches.join('')} fill={`url(#hatch-${mode})`} />
      {paths.map((p, i) => (p.length ? <path key={i} d={p.join('')} fill="none" stroke={`var(--mo-${i})`} strokeWidth={g.cell} /> : null))}
      {peaks.map((p, k) => {
        const r = stats.calendar.findIndex((c) => c.year === Number(p.date.slice(0, 4)));
        if (r < 0) return null;
        const x = g.label + dayIndex(p.date) * g.col + g.cell / 2;
        const y0 = g.top + r * pitch + g.row + 1;
        const y1 = g.top + rows * pitch + 10 + k * 16;
        return (
          <g key={p.date}>
            <circle cx={x} cy={y0 - g.row / 2 - 1} r={4.5} fill="none" stroke="var(--ink)" strokeWidth="1.2" />
            <line x1={x} y1={y0 + 3} x2={x} y2={y1 - 3} stroke="var(--ink)" strokeWidth="1" />
            <text x={x > width * 0.65 ? x - 6 : x + 6} textAnchor={x > width * 0.65 ? 'end' : 'start'} y={y1 + 1} className="fill-ink" fontSize="11" fontWeight="600">
              {p.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
