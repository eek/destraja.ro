import type { ReactNode } from 'react';

/** Starea unui an în date: citit integral, parțial, în curs (anul curent) sau necitit încă. */
export type YearState = 'complet' | 'partial' | 'in-curs' | 'necitit';

export const ro = (n: number, digits = 0) => n.toLocaleString('ro-RO', { maximumFractionDigits: digits, minimumFractionDigits: digits });

export interface Segment {
  value: number;
  fill: string;
  /** Hașură peste culoare (al doilea semnal, pe lângă culoare). */
  hatch?: boolean;
}

export interface YearBar {
  year: number;
  segments: Segment[];
  /** O valoare de referință desenată ca un contur deasupra barei (de pildă cel mai mare număr din serie). */
  ref?: number;
}

const top = (x: number, y: number, w: number, base: number, r: number) => {
  const rr = Math.min(r, w / 2, Math.max(0, base - y));
  return `M${x} ${base}V${y + rr}Q${x} ${y} ${x + rr} ${y}H${x + w - rr}Q${x + w} ${y} ${x + w} ${y + rr}V${base}Z`;
};

/**
 * Coloane pe ani, de la primul la ultimul an din date. Anii necitiți: o bandă hașurată, nu o bară de zero. Anii
 * parțiali și anul în curs: bara are doar contur (e o limită de jos, nu un total). Scara: de la zero la max.
 */
export function YearColumns({
  bars,
  states,
  max,
  height = 120,
  id,
  label,
  valueLabels = [],
  showYears = true,
}: {
  bars: YearBar[];
  states: Record<number, YearState>;
  max: number;
  height?: number;
  id: string;
  label: string;
  /** Anii la care scriem valoarea deasupra barei. */
  valueLabels?: { year: number; text: string }[];
  showYears?: boolean;
}) {
  const col = 10;
  const bw = 6;
  const padTop = 14;
  const base = padTop + height;
  const width = bars.length * col;
  // Scara cuprinde tot ce se desenează (și anii parțiali sau în curs), ca nicio bară să nu iasă din grafic.
  const top0 = Math.max(max, ...bars.filter((b) => (states[b.year] ?? 'necitit') !== 'necitit').map((b) => Math.max(b.ref ?? 0, b.segments.reduce((s, x) => s + x.value, 0))));
  const h = (v: number) => (top0 > 0 ? (v / top0) * height : 0);
  const first = bars[0]?.year;
  const last = bars.at(-1)?.year;
  return (
    <svg viewBox={`0 0 ${width} ${base + (showYears ? 14 : 2)}`} className="block h-auto w-full overflow-visible" role="img" aria-label={label}>
      <defs>
        <pattern id={`h-${id}`} width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="3" stroke="var(--mo-hatch)" strokeWidth="1" />
        </pattern>
        <pattern id={`hs-${id}`} width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <line x1="0" y1="0" x2="0" y2="3" stroke="var(--surface)" strokeWidth="1" />
        </pattern>
      </defs>
      <line x1={0} x2={width} y1={base + 0.5} y2={base + 0.5} stroke="var(--line-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      {bars.map((b, i) => {
        const x = i * col + (col - bw) / 2;
        const st = states[b.year] ?? 'necitit';
        if (st === 'necitit') return <rect key={b.year} x={i * col} y={padTop} width={col} height={height} fill={`url(#h-${id})`} opacity="0.7" />;
        const total = b.segments.reduce((s, x) => s + x.value, 0);
        const hollow = st !== 'complet';
        let y = base;
        return (
          <g key={b.year}>
            <title>{`${b.year}${st === 'partial' ? ' (an incomplet)' : st === 'in-curs' ? ' (an în curs)' : ''}: ${ro(total)}`}</title>
            {b.ref !== undefined && b.ref > total && (
              <path d={top(x, base - h(b.ref), bw, base, 1.2)} fill="none" stroke="var(--line-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            )}
            {hollow ? (
              total > 0 &&
              <path d={top(x + 0.5, base - h(total) + 0.5, bw - 1, base, 1.2)} fill="var(--surface)" stroke="var(--mo-4)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
            ) : (
              b.segments.map((s, k) => {
                const sh = h(s.value);
                const y0 = y - sh;
                y = y0;
                if (sh <= 0) return null;
                const isTop = k === b.segments.length - 1 || b.segments.slice(k + 1).every((n) => n.value === 0);
                const gap = k > 0 ? 0.6 : 0;
                const d = isTop ? top(x, y0, bw, y0 + sh - gap, 1.2) : `M${x} ${y0}h${bw}v${sh - gap}h${-bw}z`;
                return (
                  <g key={k}>
                    <path d={d} fill={s.fill} />
                    {s.hatch && <path d={d} fill={`url(#hs-${id})`} />}
                  </g>
                );
              })
            )}
          </g>
        );
      })}
      {valueLabels.map((v) => {
        const i = bars.findIndex((b) => b.year === v.year);
        if (i < 0) return null;
        const t = bars[i].segments.reduce((s, x) => s + x.value, 0);
        return (
          <text key={v.year} x={i * col + col / 2} y={base - h(Math.max(t, bars[i].ref ?? 0)) - 4} textAnchor="middle" fontSize="8" fontWeight="600" className="fill-ink tabular-nums">
            {v.text}
          </text>
        );
      })}
      {showYears &&
        bars.map((b, i) =>
          b.year === first || b.year === last || (b.year % 10 === 0 && b.year - first! > 3 && last! - b.year > 3) ? (
            <text key={b.year} x={i * col + col / 2} y={base + 11} textAnchor="middle" fontSize="6.5" className="fill-muted tabular-nums">
              {b.year}
            </text>
          ) : null,
        )}
    </svg>
  );
}

/** Legenda: mostra de culoare lângă text (textul nu ia niciodată culoarea seriei). */
export function Swatch({ fill, hatch, outline, children }: { fill?: string; hatch?: 'unread' | 'segment'; outline?: boolean | 'ref'; children: ReactNode }) {
  const cls = outline === 'ref' ? 'border-[1.5px] border-line-strong bg-surface' : outline ? 'border-[1.5px] border-[var(--mo-4)] bg-surface' : hatch === 'unread' ? 'mo-hatch border border-line' : hatch === 'segment' ? 'mo-stripes' : '';
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className={`inline-block h-3.5 w-3.5 shrink-0 rounded-[3px] ${cls}`} style={fill && !outline && hatch !== 'unread' ? { backgroundColor: fill } : undefined} />
      <span>{children}</span>
    </span>
  );
}

/**
 * Din 100 de acte: o grilă de 10 × 10, umplută pe categorii în ordinea dată; legile în bleumarin, ordonanțele de
 * urgență într-o treaptă mai deschisă, restul în gri. Lista de lângă dă fiecare categorie cu procentul ei.
 */
export function HundredActs({ groups }: { groups: { key: string; label: string; share: number; cells: number; tone: 'lege' | 'oug' | 'rest' }[] }) {
  const fill = { lege: 'var(--mo-5)', oug: 'var(--mo-3)', rest: 'var(--mo-other)' } as const;
  const cells = groups.flatMap((g) => Array.from({ length: g.cells }, () => g.tone));
  return (
    <div className="grid items-start gap-8 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-12">
      <div className="grid w-[280px] max-w-full grid-cols-10 gap-[5px]" aria-hidden>
        {cells.map((t, i) => (
          <span key={i} className="aspect-square rounded-[4px]" style={{ background: fill[t] }} />
        ))}
      </div>
      <ol className="grid max-w-md gap-0 divide-y divide-line border-y border-line" aria-label="Din 100 de acte publicate">
        {groups
          .filter((g) => g.share > 0.05)
          .map((g) => (
            <li key={g.key} className="flex items-center gap-3 py-2 text-sm">
              <span aria-hidden className="h-3.5 w-3.5 shrink-0 rounded-[3px]" style={{ background: fill[g.tone] }} />
              <span className="flex-1 text-body">{g.label}</span>
              <span className={`tabular-nums ${g.tone === 'rest' ? 'text-body' : 'font-semibold text-ink'}`}>{ro(g.share, g.share < 10 ? 1 : 0)}</span>
            </li>
          ))}
      </ol>
    </div>
  );
}

/**
 * Proiectele noastre de la votul final la Monitor: un punct pe proiect, pe axa zilelor; punctele din aceeași zi se
 * așază unul peste altul. Fiecare punct duce la proiect.
 */
export function VoteStrip({ items, median }: { items: { days: number; href: string; label: string }[]; median: number }) {
  const maxDays = Math.max(35, ...items.map((i) => i.days));
  const step = 14;
  const left = 10;
  const width = left * 2 + (maxDays + 1) * step;
  const counts = new Map<number, number>();
  const placed = items
    .slice()
    .sort((a, b) => a.days - b.days)
    .map((i) => {
      const k = counts.get(i.days) ?? 0;
      counts.set(i.days, k + 1);
      return { ...i, k };
    });
  const tallest = Math.max(1, ...counts.values());
  const base = 8 + tallest * step;
  const height = base + 36;
  const x = (d: number) => left + d * step + step / 2;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" role="group" aria-label={`Zilele de la votul final până la publicare, pentru ${items.length} legi; mediana ${median}. Lista lor e sub grafic.`}>
      <line x1={left} x2={width - left} y1={base + 4} y2={base + 4} stroke="var(--line-strong)" strokeWidth="1" />
      <line x1={x(median)} x2={x(median)} y1={0} y2={base + 8} stroke="var(--ink)" strokeWidth="1.2" />
      {placed.map((p, i) => (
        <a key={i} href={p.href} aria-label={p.label}>
          <title>{p.label}</title>
          <circle cx={x(p.days)} cy={base - p.k * step} r={5.4} fill="var(--mo-5)" stroke="var(--surface)" strokeWidth="2" />
          <circle cx={x(p.days)} cy={base - p.k * step} r={7.5} fill="transparent" />
        </a>
      ))}
      {Array.from({ length: Math.floor(maxDays / 7) + 1 }, (_, i) => i * 7).map((d) => (
        <text key={d} x={x(d)} y={base + 22} textAnchor="middle" fontSize="12" className="fill-muted tabular-nums">
          {d}
        </text>
      ))}
      <text x={width - left} y={base + 35} textAnchor="end" fontSize="11" className="fill-muted">
        zile de la votul final
      </text>
    </svg>
  );
}
