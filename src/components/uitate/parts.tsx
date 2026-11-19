// Bucățile paginii /uitate: barele (SVG desenat de mână, fără bibliotecă) și rândul unui proiect. Totul se randează la
// build, fără JavaScript în browser. Culorile trec prin tokenuri: bleumarinul spune „încă la Cameră” (plin = fără pas
// de peste un an, deschis = cu un pas în ultimul an), grijii spun „a plecat de la Cameră”. Roșul, galbenul și verdele
// rămân ale riscului.
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import type { WaitingBill } from '@/lib/uitate';
import { WAITS } from '@/lib/uitate';

export const nr = (n: number) => n.toLocaleString('ro-RO');
/** „1 proiect”, „5 proiecte”, „20 de proiecte”, „2.326 de proiecte”, cu separatorul de mii. */
export function many(n: number, one: string, more: string) {
  if (n === 1) return `1 ${one}`;
  const rest = n % 100;
  return `${nr(n)}${(rest === 0 && n !== 0) || rest >= 20 ? ' de' : ''} ${more}`;
}
export const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
export const dateRo = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

/** „6 ani și 9 luni”, din zile (cu ani de 365,25 de zile; e o etichetă, nu un calcul). */
export function duration(days: number) {
  const months = Math.floor(days / 30.4375);
  const y = Math.floor(months / 12);
  const m = months % 12;
  const ys = y === 0 ? '' : y === 1 ? 'un an' : `${y} ani`;
  const ms = m === 0 ? '' : m === 1 ? 'o lună' : `${m} luni`;
  return [ys, ms].filter(Boolean).join(' și ') || 'sub o lună';
}

// ─── Culorile seriilor ─────────────────────────────────────────────────────────────────────────────────────────────

export type Paint = { fill: string; opacity?: number; hatch?: boolean };
export const PAINT = {
  activ: { fill: 'var(--brand)', opacity: 0.28 },
  nemiscat: { fill: 'var(--brand)' },
  lege: { fill: 'var(--muted)' },
  incheiat: { fill: 'var(--line-strong)' },
  altundeva: { fill: 'var(--muted)', hatch: true },
  necunoscut: { fill: 'var(--faint)', opacity: 0.4 },
} satisfies Record<string, Paint>;
export const BAND_PAINT: Record<string, Paint> = {
  pana1: PAINT.activ,
  ani1_2: { fill: 'var(--brand)', opacity: 0.62 },
  ani2_4: { fill: 'var(--brand)', opacity: 0.82 },
  peste4: { fill: 'var(--brand)' },
  necunoscut: PAINT.necunoscut,
};

function Rect({ x, w, paint, id, h }: { x: number; w: number; paint: Paint; id: string; h: number }) {
  if (w <= 0) return null;
  return (
    <rect
      x={`${x}%`}
      y={0}
      width={`${w}%`}
      height={h}
      fill={paint.hatch ? `url(#${id})` : paint.fill}
      fillOpacity={paint.hatch ? 1 : (paint.opacity ?? 1)}
      stroke="var(--surface)"
      strokeWidth={1}
    />
  );
}

/**
 * O bară orizontală din segmente; lățimile sunt procente din `scale` (implicit suma segmentelor). Fără viewBox:
 * coordonatele sunt pixeli, așa că hașura rămâne la fel de fină pe telefon și pe ecran mare.
 */
export function Bar({ parts, scale, h = 16, label }: { parts: { value: number; paint: Paint }[]; scale?: number; h?: number; label: string }) {
  const total = scale ?? parts.reduce((s, p) => s + p.value, 0);
  const id = `hatch-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
  let x = 0;
  return (
    <svg width="100%" height={h} role="img" aria-label={label} className="block overflow-visible rounded-[3px]">
      <defs>
        <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="var(--sunken)" />
          <rect width="2.5" height="6" fill="var(--muted)" />
        </pattern>
      </defs>
      <rect width="100%" height={h} fill="var(--sunken)" rx={3} />
      {parts.map((p, i) => {
        const w = total ? (p.value / total) * 100 : 0;
        const el = <Rect key={i} x={x} w={w} paint={p.paint} id={id} h={h} />;
        x += w;
        return el;
      })}
    </svg>
  );
}

/** Pătrățelul din legendă, cu aceeași vopsea ca în bară. */
export function Swatch({ paint, name }: { paint: Paint; name: string }) {
  const id = `sw-${name}`;
  return (
    <svg width="14" height="14" aria-hidden className="shrink-0 rounded-[3px]">
      <defs>
        <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="var(--sunken)" />
          <rect width="2.5" height="6" fill="var(--muted)" />
        </pattern>
      </defs>
      <rect width="14" height="14" rx="3" fill={paint.hatch ? `url(#${id})` : paint.fill} fillOpacity={paint.hatch ? 1 : (paint.opacity ?? 1)} />
    </svg>
  );
}

export function Legend({ items }: { items: { key: string; label: string; paint: Paint }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] leading-5 text-body">
      {items.map((it) => (
        <li key={it.key} className="inline-flex items-center gap-2">
          <Swatch paint={it.paint} name={it.key} />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

export function Stat({ value, children }: { value: string; children: ReactNode }) {
  return (
    <div className="border-t border-line pt-4">
      <p className="text-[2rem] font-semibold leading-none tabular-nums text-ink">{value}</p>
      <p className="mt-2 text-[15px] leading-6 text-body">{children}</p>
    </div>
  );
}

export function SectionTitle({ id, children, lead }: { id: string; children: ReactNode; lead?: ReactNode }) {
  return (
    <div className="max-w-3xl">
      <h2 id={id} className="scroll-mt-24 font-display text-[1.9rem] font-normal leading-[1.12] sm:text-[2.4rem]">
        {children}
      </h2>
      {lead && <div className="mt-3 max-w-[68ch] text-[15px] leading-7 text-body">{lead}</div>}
    </div>
  );
}

const waitLabel = (k: WaitingBill['wait']) => WAITS.find((w) => w.key === k)!.label;

/** Un proiect din lista celor care așteaptă de cel mai mult timp. */
export function WaitingRow({ b, rank }: { b: WaitingBill; rank: number }) {
  const title = b.internal ? (
    <Link href={b.href} className="decoration-line-strong decoration-1 underline-offset-4 hover:underline">
      {b.titlu}
    </Link>
  ) : (
    <a href={b.href} target="_blank" rel="noopener noreferrer" className="decoration-line-strong decoration-1 underline-offset-4 hover:underline">
      {b.titlu}
      <ArrowUpRight className="ml-1 inline h-3.5 w-3.5 align-baseline text-muted" aria-label="(cdep.ro)" />
    </a>
  );
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 border-t border-line py-5 sm:gap-x-8">
      <div className="min-w-0">
        <p className="text-xs font-semibold tabular-nums text-muted">
          <span className="text-faint">{rank}.</span> {b.numar}
          <span className="font-normal"> · înregistrat pe {dateRo(b.inregistrat)}</span>
        </p>
        <h3 className="mt-1.5 font-display text-[1.08rem] font-normal leading-snug text-ink sm:text-[1.15rem]">{title}</h3>
        <p className="mt-2 text-[13.5px] leading-6 text-muted">
          <span className="font-semibold text-body">{waitLabel(b.wait)}</span>
          {b.comisii.length > 0 && <> · {b.comisii.length === 1 ? 'Comisia: ' : 'Comisiile: '}{b.comisii.join(', ')}</>}
          {b.last && (
            <>
              {' '}· Ultimul pas: {b.last.label.charAt(0).toLowerCase() + b.last.label.slice(1)}, {dateRo(b.last.date)}
            </>
          )}
        </p>
        {(b.ordonanta || b.subRezerva || b.tacit) && (
          <p className="mt-2 flex flex-wrap gap-2">
            {b.tacit && <span className="inline-flex rounded-md border border-line px-2 py-0.5 text-xs font-semibold text-body">Adoptat tacit de Senat</span>}
            {b.ordonanta && (
              <span className="inline-flex rounded-md border border-line px-2 py-0.5 text-xs font-semibold text-body">Ordonanța se aplică deja</span>
            )}
            {b.subRezerva && (
              <span className="inline-flex rounded-md border border-line px-2 py-0.5 text-xs font-semibold text-body">Pe ordinea de zi sub rezerva raportului</span>
            )}
          </p>
        )}
      </div>
      <div className="text-right">
        <p className="text-[1.6rem] font-semibold leading-none tabular-nums text-ink">{nr(b.days ?? 0)}</p>
        <p className="mt-1 text-xs leading-4 text-muted">
          zile fără pas
          <br />
          {duration(b.days ?? 0)}
        </p>
      </div>
    </li>
  );
}
