import { memo, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, ExternalLink, Undo2 } from 'lucide-react';
import type { CdepListItem } from '@/lib/cdep';
import type { RiskLevel } from '@/lib/types';
import { RISK } from '@/lib/risk';
import { STAGES, stageLabel, type StageKey } from '@/lib/cdep-text';
import { countWord, fmt } from '@/lib/format';
import { trackAttrs } from '@/lib/analytics';

// Bucățile de deasupra listei de la /camera: distribuția riscului și etapele. Un pătrățel = un proiect.
// Starea filtrelor stă în CameraExplorer; aici doar o arătăm și o schimbăm prin callback-uri.

export const LEVELS: RiskLevel[] = ['red', 'yellow', 'green'];
export const CHAMBER: StageKey[] = STAGES.filter((s) => s.atChamber).map((s) => s.key);
export const OUTSIDE: StageKey[] = STAGES.filter((s) => !s.atChamber).map((s) => s.key);
export const THRESHOLD: Record<RiskLevel, string> = { red: 'scor de la 6,8', yellow: 'scor de la 3,8', green: 'scor sub 3,8' };
export const SOFT: Record<RiskLevel, string> = { red: 'bg-risk-red-soft', yellow: 'bg-risk-amber-soft', green: 'bg-risk-green-soft' };
const MONTHS_LONG = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
export const monthLabel = (ym: string) => MONTHS_LONG[Number(ym.slice(5, 7)) - 1];
/** „2026-11-03” → „3 noiembrie” */
export const longDate = (iso: string) => `${Number(iso.slice(8, 10))} ${monthLabel(iso)}`;

export const byLevel = (list: CdepListItem[]) =>
  Object.fromEntries(LEVELS.map((l) => [l, list.filter((p) => p.risk?.level === l).length])) as Record<RiskLevel, number>;

/** „Patru din cinci”, „Aproape jumătate”: o proporție spusă în cuvinte, pentru titluri. */
export function shareWords(part: number, total: number): string {
  const x = total ? part / total : 0;
  const named: [number, string][] = [
    [0.9, 'Nouă din zece'],
    [0.8, 'Patru din cinci'],
    [0.75, 'Trei din patru'],
    [2 / 3, 'Două din trei'],
    [0.6, 'Trei din cinci'],
    [0.5, 'Jumătate'],
  ];
  const hit = named.find(([v]) => Math.abs(x - v) <= 0.025);
  if (hit) return hit[1];
  if (x > 0.44 && x < 0.5) return 'Aproape jumătate';
  const tens = ['', 'Unul', 'Două', 'Trei', 'Patru', 'Cinci', 'Șase', 'Șapte', 'Opt', 'Nouă'][Math.round(x * 10)];
  return tens ? `${tens} din zece` : `${Math.round(x * 100)} din 100`;
}

const SHAPE: Record<RiskLevel, string> = {
  red: '[clip-path:polygon(50%_2%,100%_96%,0_96%)]',
  yellow: '[clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]',
  green: 'scale-[0.86] rounded-full',
};

/** Forma spune nivelul și fără culoare: ▲ ridicat, ◆ moderat, ● redus. */
export function Glyph({ level, className = 'h-3 w-3' }: { level: RiskLevel; className?: string }) {
  return <span aria-hidden className={`inline-block shrink-0 ${RISK[level].fill} ${SHAPE[level]} ${className}`} />;
}

export const btnShadow = 'shadow-[0_1px_0_rgb(var(--shadow-color)/0.1),0_1px_3px_rgb(var(--shadow-color)/0.08)]';
export const pressable = `${btnShadow} transition hover:-translate-y-px hover:border-muted active:translate-y-0 active:shadow-none`;

/** Titlul unei secțiuni: afirmația la stânga, explicația la dreapta pe ecran lat. */
export function SectionHeading({ id, title, children }: { id: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-7 grid gap-3 lg:mb-11 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-end lg:gap-14">
      <h2 id={id} className="font-display text-[clamp(1.95rem,4.2vw,3rem)] font-medium leading-[1.06] tracking-[-0.022em]">
        {title}
      </h2>
      {children && <div className="max-w-[58ch] text-[17px] leading-relaxed text-body">{children}</div>}
    </div>
  );
}

/** Legătura spre proiect: pagina noastră dacă am citit fișa, altfel fișa de pe cdep.ro. */
export function BillLink({ p, withPage, className, children }: { p: CdepListItem; withPage: Set<string>; className?: string; children: ReactNode }) {
  if (p.senat) return <Link href={`/legi/${p.senat}`} className={className}>{children}</Link>;
  if (withPage.has(p.slug)) return <Link href={`/camera/${p.slug}`} className={className}>{children}</Link>;
  return (
    <a href={p.url} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <ExternalLink className="ml-1.5 inline h-3.5 w-3.5 align-[-1px] text-muted" aria-hidden />
      <span className="sr-only">(fișa de pe cdep.ro, se deschide într-o filă nouă)</span>
    </a>
  );
}

/** Scorul pe scala 0–10, cu pragurile 3,8 și 6,8. */
export function ScoreMeter({ level, score }: { level: RiskLevel; score: number }) {
  return (
    <div role="img" aria-label={`Scor ${fmt(score)} din 10, ${RISK[level].label.toLowerCase()}`} className="mt-4 max-w-[420px]">
      <div className="relative h-2.5 rounded-full bg-[linear-gradient(90deg,var(--risk-green-soft)_0_38%,var(--risk-amber-soft)_38%_68%,var(--risk-red-soft)_68%_100%)] shadow-[inset_0_0_0_1px_var(--line)]">
        <i className="absolute -top-[3px] -bottom-[3px] left-[38%] w-px bg-line-strong" />
        <i className="absolute -top-[3px] -bottom-[3px] left-[68%] w-px bg-line-strong" />
        <span
          className={`absolute top-1/2 -mt-[9px] -ml-[9px] h-[18px] w-[18px] rounded-full border-[3px] border-surface shadow-[0_0_0_1.5px_var(--ink)] ${RISK[level].fill}`}
          style={{ left: `${Math.min(10, Math.max(0, score)) * 10}%` }}
        />
      </div>
      <div aria-hidden className="relative mt-1.5 h-[18px] text-xs tabular-nums text-muted">
        <span className="absolute left-0">0</span>
        <span className="absolute left-[38%] -translate-x-1/2">3,8</span>
        <span className="absolute left-[68%] -translate-x-1/2">6,8</span>
        <span className="absolute right-0">10</span>
      </div>
    </div>
  );
}

/**
 * Distribuția: un pătrățel pentru fiecare proiect, pe coloane, roșul întâi. Mărimea pătrățelului vine din lățimea
 * containerului (cqw), deci se desenează la fel pe server și în browser; dedesubt, trei butoane care filtrează lista.
 */
export const RiskWaffle = memo(function RiskWaffle({
  counts,
  risk,
  onRisk,
}: {
  counts: Record<RiskLevel, number>;
  risk: RiskLevel | null;
  onRisk: (l: RiskLevel | null) => void;
}) {
  const n = LEVELS.reduce((s, l) => s + counts[l], 0);
  return (
    <div>
      <div className="@container [--rows:16] sm:[--rows:10]" style={{ '--n': Math.max(n, 1) } as CSSProperties}>
        <div aria-hidden className="flex items-start gap-x-[calc(var(--u)*1.2)] [--u:min(22px,calc(100cqw/(var(--n)/var(--rows)_+_6)))]">
          {LEVELS.map(
            (l) =>
              counts[l] > 0 && (
                <div
                  key={l}
                  onClick={() => onRisk(risk === l ? null : l)}
                  className={`cursor-pointer transition-opacity duration-200 ${risk && risk !== l ? 'opacity-20' : ''}`}
                >
                  <p className="font-display text-[22px] font-semibold leading-none tabular-nums text-ink">{counts[l]}</p>
                  <div className="mt-2.5 grid grid-flow-col grid-rows-[repeat(var(--rows),var(--u))] auto-cols-[var(--u)]">
                    {Array.from({ length: counts[l] }, (_, i) => (
                      <span key={i} className={`m-[calc(var(--u)*0.1)] rounded-[2px] ${RISK[l].fill}`} />
                    ))}
                  </div>
                </div>
              ),
          )}
        </div>
      </div>
      <div role="group" aria-label="Filtrează lista după risc" className="mt-6 grid gap-2.5 md:grid-cols-3 md:gap-3.5">
        {LEVELS.map((l) => {
          const on = risk === l;
          return (
            <button
              key={l}
              type="button"
              aria-pressed={on}
              onClick={() => onRisk(on ? null : l)}
              {...trackAttrs('camera_filter', { filter: 'risk', value: l })}
              className={`grid min-h-[72px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[14px] border px-4 py-3.5 text-left ${pressable} ${
                on ? `border-ink shadow-[inset_0_0_0_1px_var(--ink)] ${SOFT[l]}` : 'border-line-strong bg-surface'
              }`}
            >
              <span className="flex items-center gap-3">
                <Glyph level={l} className="h-4 w-4" />
                <span className="font-display text-[30px] font-semibold leading-none tabular-nums text-ink">{counts[l]}</span>
                <span className="min-w-0">
                  <span className="block text-[15.5px] font-semibold leading-tight text-ink">{RISK[l].label.toLowerCase()}</span>
                  <span className="block text-[13.5px] leading-snug text-muted">{THRESHOLD[l]}</span>
                </span>
              </span>
              <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[13.5px] font-semibold ${on ? 'text-ink' : 'text-link'}`}>
                {on ? (
                  <>
                    <Check className="h-4 w-4" aria-hidden />
                    Filtru activ
                  </>
                ) : (
                  <>
                    Arată-le
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
});

const STAGE_NOTE: Partial<Record<StageKey, string>> = {
  comisii: 'Comisia de specialitate pregătește raportul.',
  raport: 'Raportul e gata; proiectul așteaptă votul.',
  plen: 'Programat la dezbatere și vot în plen.',
  altele: 'În reexaminare sau în altă procedură.',
};

/** Pătrățelele unei etape, pe rânduri, roșul întâi. */
function UnitStrip({ counts, risk, dim }: { counts: Record<RiskLevel, number>; risk: RiskLevel | null; dim: boolean }) {
  return (
    <div aria-hidden className={`flex flex-wrap gap-[2px] transition-opacity duration-200 ${dim ? 'opacity-35' : ''}`}>
      {LEVELS.flatMap((l) =>
        Array.from({ length: counts[l] }, (_, i) => (
          <span
            key={`${l}${i}`}
            className={`size-[5px] rounded-[1.5px] sm:size-[8px] lg:size-[11px] ${RISK[l].fill} ${risk && risk !== l ? 'opacity-20' : ''}`}
          />
        )),
      )}
    </div>
  );
}

/** Drumul prin Cameră: comisii → raport → ordinea de zi, plus reexaminarea; fiecare etapă cu riscul ei și cu un buton care filtrează lista. */
export const StagePath = memo(function StagePath({
  list,
  stage,
  risk,
  onStage,
}: {
  list: CdepListItem[];
  stage: StageKey | null;
  risk: RiskLevel | null;
  onStage: (s: StageKey | null) => void;
}) {
  const rows = CHAMBER.map((k) => ({ key: k, items: list.filter((p) => p.stage === k) }));
  return (
    <ol>
      {rows.map((r, i) => {
        const c = byLevel(r.items);
        const on = stage === r.key;
        const alt = r.key === 'altele';
        const lastOfPath = i === rows.length - 2;
        return (
          <li
            key={r.key}
            className={`relative grid grid-cols-[36px_minmax(0,1fr)] gap-x-3.5 pb-8 last:pb-0 lg:grid-cols-[36px_minmax(0,340px)_minmax(0,1fr)] lg:gap-x-7 lg:pb-10 ${
              alt ? 'mt-2 border-t border-dashed border-line-strong pt-7' : ''
            }`}
          >
            {!alt && !lastOfPath && <span aria-hidden className="absolute top-9 bottom-0 left-[17px] w-0.5 bg-line-strong" />}
            <span
              aria-hidden
              className={`relative z-10 grid h-9 w-9 place-items-center rounded-full border-2 bg-paper text-[15px] font-bold ${
                alt ? 'border-dashed border-muted text-muted' : 'border-ink text-ink'
              }`}
            >
              {alt ? <Undo2 className="h-4 w-4" /> : i + 1}
            </span>
            <div>
              <h3 className={`pt-0.5 font-display text-[1.45rem] font-semibold leading-tight ${on ? 'underline decoration-[3px] underline-offset-[6px]' : ''}`}>
                {stageLabel(r.key)}
                <span className="ml-2 font-medium tabular-nums text-muted">{r.items.length}</span>
              </h3>
              <p className="mt-1 text-[15px] text-muted">{STAGE_NOTE[r.key]}</p>
              <p className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[14.5px] tabular-nums text-body">
                {LEVELS.map((l) => (
                  <span key={l} className="inline-flex items-center gap-1.5">
                    <Glyph level={l} />
                    <b className="font-semibold text-ink">{c[l]}</b> {RISK[l].short}
                  </span>
                ))}
              </p>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onStage(on ? null : r.key)}
                {...trackAttrs('camera_filter', { filter: 'stage', value: r.key })}
                className={`mt-3.5 inline-flex min-h-10 items-center gap-2 rounded-[10px] border px-3.5 text-sm font-semibold ${pressable} ${
                  on ? 'border-ink bg-ink text-paper shadow-none' : 'border-line-strong bg-surface text-ink'
                }`}
              >
                {on ? (
                  <>
                    <Check className="h-4 w-4" aria-hidden />
                    Filtru activ
                  </>
                ) : (
                  `Arată ${r.items.length === 1 ? 'proiectul' : `cele ${countWord(r.items.length, 'proiect', 'proiecte')}`}`
                )}
              </button>
            </div>
            <div onClick={() => onStage(on ? null : r.key)} className="col-start-2 mt-4 cursor-pointer lg:col-start-3 lg:mt-1.5">
              <UnitStrip counts={c} risk={risk} dim={Boolean(stage) && !on} />
            </div>
          </li>
        );
      })}
    </ol>
  );
});

/** Proiectele care au plecat deja de la Cameră: un rând sub etape, fiecare etapă duce la „Toate din 2026”, filtrat. */
export const OutsideLine = memo(function OutsideLine({
  items,
  stage,
  onStage,
}: {
  items: CdepListItem[];
  stage: StageKey | null;
  onStage: (s: StageKey | null) => void;
}) {
  const rows = OUTSIDE.map((k) => ({ key: k, n: items.filter((p) => p.stage === k).length })).filter((r) => r.n);
  const total = rows.reduce((s, r) => s + r.n, 0);
  if (!total) return null;
  return (
    <div className="mt-10 border-t border-line pt-6 lg:mt-12">
      <p className="text-[15px] leading-relaxed text-body">
        Au plecat deja de la Cameră <strong className="font-semibold text-ink">{countWord(total, 'proiect', 'proiecte')}</strong> din cele înregistrate în
        an. Le vezi în „Toate din 2026”:
      </p>
      <div role="group" aria-label="Proiectele plecate de la Cameră" className="mt-3 flex flex-wrap gap-2">
        {rows.map((r) => {
          const on = stage === r.key;
          return (
            <button
              key={r.key}
              type="button"
              aria-pressed={on}
              onClick={() => onStage(on ? null : r.key)}
              {...trackAttrs('camera_filter', { filter: 'outside', value: r.key })}
              className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold ${pressable} ${
                on ? 'border-ink bg-ink text-paper shadow-none' : 'border-line-strong bg-surface text-ink'
              }`}
            >
              {stageLabel(r.key)}
              <span className={`tabular-nums ${on ? 'text-paper/80' : 'text-muted'}`}>{r.n}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
});
