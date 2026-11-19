// Bucățile paginii /uitate: barele (SVG desenat de mână, fără bibliotecă) și rândul unui proiect. Totul se randează la
// build, fără JavaScript în browser. Culorile sunt tokenurile --viz-* din globals.css (validate pentru daltonism și
// contrast, în ambele teme): roz-prună = încă la Cameră (închis = fără pas de peste un an), petrol = legi, gri =
// încheiate, hașură = plecate la Senat sau la promulgare; vechimea, o singură nuanță de la deschis la închis. Roșul,
// galbenul și verdele rămân ale riscului; albastrul și violetul, ale hărții coalițiilor.
import type { ReactNode } from 'react';

export const nr = (n: number) => n.toLocaleString('ro-RO');
/** „1 proiect”, „5 proiecte”, „20 de proiecte”, „2.326 de proiecte”, cu separatorul de mii. */
export function many(n: number, one: string, more: string) {
  if (n === 1) return `1 ${one}`;
  const rest = n % 100;
  return `${nr(n)}${(rest === 0 && n !== 0) || rest >= 20 ? ' de' : ''} ${more}`;
}
export const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const MONTHS_SHORT = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.'];
export const dateRo = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
export const dateShort = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
};

/** „6 ani și 9 luni”, din zile (cu luni de 30,44 de zile; e o etichetă, nu un calcul). */
export function duration(days: number) {
  const months = Math.floor(days / 30.4375);
  const y = Math.floor(months / 12);
  const m = months % 12;
  const ys = y === 0 ? '' : y === 1 ? 'un an' : `${y} ani`;
  const ms = m === 0 ? '' : m === 1 ? 'o lună' : `${m} luni`;
  return [ys, ms].filter(Boolean).join(' și ') || 'sub o lună';
}

/** „Agricultură, silvicultură, industrie…” → „Agricultură”; „Administrație publică și amenajarea…” → „Administrație publică”. */
export const tinyCommittee = (name: string) => name.split(/,| și /)[0].trim();

// ─── Culorile seriilor ─────────────────────────────────────────────────────────────────────────────────────────────

export type Paint = { fill: string; hatch?: boolean };
export const PAINT = {
  lege: { fill: 'var(--viz-lege)' },
  incheiat: { fill: 'var(--viz-incheiat)' },
  altundeva: { fill: 'var(--viz-plecat)', hatch: true },
  activ: { fill: 'var(--viz-activ)' },
  nemiscat: { fill: 'var(--viz-nemiscat)' },
  necunoscut: { fill: 'var(--faint)' },
} satisfies Record<string, Paint>;
export const BAND_PAINT: Record<string, Paint> = {
  pana1: { fill: 'var(--viz-age-1)' },
  ani1_2: { fill: 'var(--viz-age-2)' },
  ani2_4: { fill: 'var(--viz-age-3)' },
  peste4: { fill: 'var(--viz-age-4)' },
  necunoscut: PAINT.necunoscut,
};

function Hatch({ id }: { id: string }) {
  return (
    <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" fill="var(--viz-plecat)" />
      <rect width="2" height="6" fill="var(--viz-incheiat)" />
    </pattern>
  );
}

/**
 * O bară orizontală din segmente; lățimile sunt procente din `scale` (implicit suma segmentelor), cu 2px de hârtie
 * între segmente. Fără viewBox: coordonatele sunt pixeli, așa că hașura rămâne la fel de fină pe telefon și pe ecran mare.
 */
export function Bar({ parts, scale, h = 10, label }: { parts: { value: number; paint: Paint }[]; scale?: number; h?: number; label: string }) {
  const total = scale ?? parts.reduce((s, p) => s + p.value, 0);
  const id = `hatch-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40)}`;
  let x = 0;
  return (
    <svg width="100%" height={h} role="img" aria-label={label} className="block">
      <defs>
        <Hatch id={id} />
      </defs>
      <rect width="100%" height={h} fill="var(--sunken)" rx={3} />
      {parts.map((p, i) => {
        const w = total ? (p.value / total) * 100 : 0;
        const el =
          w > 0 ? (
            <rect key={i} x={`${x}%`} y={0} width={`${w}%`} height={h} rx={2} fill={p.paint.hatch ? `url(#${id})` : p.paint.fill} stroke="var(--surface)" strokeWidth={2} />
          ) : null;
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
    <svg width="12" height="12" aria-hidden className="shrink-0">
      <defs>
        <Hatch id={id} />
      </defs>
      <rect width="12" height="12" rx="3" fill={paint.hatch ? `url(#${id})` : paint.fill} />
    </svg>
  );
}

export function Legend({ items }: { items: { key: string; label: string; paint: Paint }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs leading-5 text-body">
      {items.map((it) => (
        <li key={it.key} className="inline-flex items-center gap-1.5">
          <Swatch paint={it.paint} name={it.key} />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

/** Un rând de grafic: eticheta și cifrele pe un singur rând, bara subțire dedesubt. */
export function BarRow({ label, value, note, href, children }: { label: ReactNode; value: ReactNode; note?: ReactNode; href?: string; children: ReactNode }) {
  const inner = (
    <>
      <span className="mb-1 flex items-baseline justify-between gap-3 text-[13.5px] leading-5">
        <span className={`min-w-0 truncate font-semibold text-ink ${href ? 'decoration-line-strong underline-offset-4 group-hover/row:underline' : ''}`}>{label}</span>
        <span className="shrink-0 tabular-nums text-body">
          <strong className="font-semibold text-ink">{value}</strong>
          {note && <span className="text-muted"> · {note}</span>}
        </span>
      </span>
      {children}
    </>
  );
  return (
    <li>
      {href ? (
        // Duce la lista de mai jos, cu filtrul acestui rând (src/components/uitate/WaitingExplorer.tsx).
        <a href={href} className="group/row -mx-1.5 block rounded-md px-1.5 py-0.5 hover:bg-sunken/70">
          {inner}
        </a>
      ) : (
        inner
      )}
    </li>
  );
}

export function Stat({ value, children }: { value: string; children: ReactNode }) {
  return (
    <div className="border-t border-line pt-3">
      <p className="text-xl font-semibold leading-none tabular-nums text-ink sm:text-2xl">{value}</p>
      <p className="mt-1.5 text-[13px] leading-5 text-body">{children}</p>
    </div>
  );
}

export function SectionTitle({ id, children, lead }: { id: string; children: ReactNode; lead?: ReactNode }) {
  return (
    <div className="max-w-3xl">
      <h2 id={id} className="scroll-mt-24 font-display text-[1.6rem] font-normal leading-[1.15] sm:text-[2.1rem]">
        {children}
      </h2>
      {lead && <p className="mt-2 max-w-[68ch] text-[14.5px] leading-6 text-body">{lead}</p>}
    </div>
  );
}

/** Un `<details>` mic, pentru explicațiile lungi: se deschide la atingere, cu tastatura sau cu mouse-ul. */
export function More({ summary, children, className = '' }: { summary: ReactNode; children: ReactNode; className?: string }) {
  return (
    <details className={`group ${className}`}>
      <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1.5 text-[13px] font-semibold text-link [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="inline-block transition-transform group-open:rotate-90">›</span>
        {summary}
      </summary>
      <div className="pb-1 text-[13px] leading-5 text-muted">{children}</div>
    </details>
  );
}
