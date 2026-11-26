import type { CSSProperties, ReactNode } from 'react';
import type { AiVerdict, RiskLevel } from '@/lib/types';
import { MODELS } from '@/lib/site';
import { RISK } from '@/lib/risk';
import { fmt } from '@/lib/format';
import { Glyph } from '@/components/ui';
import RiskInfo from './RiskInfo';

type Council = Partial<Record<(typeof MODELS)[number]['key'], Pick<AiVerdict, 'status' | 'riskScore' | 'riskLevel' | 'verdictShort'> | undefined>>;

const list = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} și ${names.at(-1)}` : names[0]);

/** „Toate trei îl văd ca risc ridicat” sau „Gemini și Claude: risc ridicat; ChatGPT: moderat”, cu scorurile lor. */
function plainAgreement(rows: { name: string; level: RiskLevel; score: number }[]) {
  // Cu virgulă zecimală, o listă „8,8, 8,6 și 8,4” se citește greu; scorurile stau separate prin puncte.
  const scores = rows.map((r) => fmt(r.score)).join(' · ');
  const levels = [...new Set(rows.map((r) => r.level))];
  // Un singur răspuns nu e un acord între modele: îl spunem ca atare.
  if (rows.length === 1) return `Deocamdată a răspuns doar ${rows[0].name}: ${RISK[levels[0]].label.toLowerCase()} (${scores} din 10).`;
  if (levels.length === 1)
    return `${rows.length === 3 ? 'Toate trei îl văd' : `${list(rows.map((r) => r.name))} îl văd`} ca ${RISK[levels[0]].label.toLowerCase()} (${scores} din 10).`;
  return (
    levels.map((l) => `${list(rows.filter((r) => r.level === l).map((r) => r.name))}: ${RISK[l].label.toLowerCase()}`).join('; ') +
    ` (${rows.map((r) => `${r.name} ${fmt(r.score)}`).join(' · ')}).`
  );
}

// Cât de aproape (în puncte de scor) pot sta două etichete pe același rând fără să se suprapună: o etichetă („ChatGPT 8,0”)
// are cam 65 px, iar un punct de scor are ~29 px pe un telefon de 360 px, ~51 px de la 640 px și ~77 px pe coloana întreagă.
// Pragul fix de 0,9 de dinainte era bun doar pe desktop; pe telefon „Gemini 7,0” și „ChatGPT 8,0” cădeau una peste alta.
const ROOM = [2.5, 1.4, 0.9] as const;
const TIER_VARS = '[--t:var(--t0)] sm:[--t:var(--t1)] lg:[--t:var(--t2)]';

/** Pe scala 0–10, cu zonele de risc: unde a pus proiectul fiecare model. Numele apropiate stau unul peste altul. */
function Scale({ rows, score, level }: { rows: { name: string; level: RiskLevel; score: number }[]; score: number; level: RiskLevel }) {
  const sorted = [...rows].sort((x, y) => x.score - y.score);
  // Rândul fiecărei etichete, pentru fiecare lățime din ROOM; CSS-ul alege rândul potrivit ecranului prin --t.
  const tiers = ROOM.map((room) => new Map(sorted.map((r, i) => [r.name, sorted.slice(0, i).filter((o) => r.score - o.score < room).length])));
  const vars = (pick: (t: Map<string, number>) => number) => Object.fromEntries(tiers.map((t, i) => [`--t${i}`, pick(t)]));
  return (
    <div
      className={`relative mb-2 mt-[calc(34px+var(--t)*15px)] ${TIER_VARS}`}
      style={vars((t) => Math.max(...t.values())) as CSSProperties}
      aria-hidden
    >
      <div className="flex h-2.5 overflow-hidden rounded-full">
        <span className="w-[38%] bg-risk-green/30" />
        <span className="w-[30%] bg-risk-amber/30" />
        <span className="w-[32%] bg-risk-red/30" />
      </div>
      {rows.map((r) => {
        // Lângă capetele scalei, eticheta pornește de la semn spre interior, ca să nu iasă din card.
        const x = r.score * 10;
        const edge = x < 12 ? 'translate-x-0' : x > 88 ? '-translate-x-full' : '-translate-x-1/2';
        return (
          <span
            key={r.name}
            className={`absolute top-[calc(-26px-var(--t)*15px)] whitespace-nowrap text-[11px] font-semibold text-muted ${edge} ${TIER_VARS}`}
            style={{ left: `${x}%`, ...vars((t) => t.get(r.name)!) } as CSSProperties}
          >
            {r.name} {fmt(r.score)}
          </span>
        );
      })}
      {rows.map((r) => (
        <span key={r.name} className={`absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded ${RISK[r.level].fill}`} style={{ left: `${r.score * 10}%` }} />
      ))}
      <span
        className={`absolute top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-surface shadow-[0_0_0_1.5px_var(--ink)] ${RISK[level].fill}`}
        style={{ left: `${score * 10}%` }}
      />
      <div className="mt-2 flex justify-between text-[11px] tabular-nums text-muted">
        <span>
          0<span className="hidden sm:inline">, fără risc</span>
        </span>
        <span>
          10<span className="hidden sm:inline">, risc maxim</span>
        </span>
      </div>
    </div>
  );
}

// Ce spun cele trei modele, sus pe pagina proiectului: scorul comun, o propoziție despre cât de mult sunt de acord și
// verdictul fiecăruia. Detaliile (ce a găsit fiecare în text) rămân mai jos.
export default function ModelsVerdict({
  score,
  level,
  summary,
  council,
  children,
}: {
  score: number;
  level: RiskLevel;
  /** Rezumatul comun; lipsește când pagina îl arată deja sub titlu. */
  summary?: string;
  council: Council;
  children?: ReactNode;
}) {
  const rows = MODELS.flatMap((m) => {
    const v = council[m.key];
    return v?.status === 'ok' ? [{ key: m.key, name: m.name, role: m.role, level: v.riskLevel, score: v.riskScore, verdict: v.verdictShort }] : [];
  });
  const spread = rows.length ? Math.max(...rows.map((r) => r.score)) - Math.min(...rows.map((r) => r.score)) : 0;
  const agree = rows.length === 1 ? 'Un singur model' : spread <= 1.5 ? 'Modelele sunt de acord' : spread <= 3 ? 'Acord parțial' : 'Modelele nu sunt de acord';
  // Modelele fără răspuns valid (eroare, limită de timp sau încă nerulate): pagina spune câte au răspuns.
  const missing = MODELS.filter((m) => council[m.key]?.status !== 'ok').map((m) => m.name);

  return (
    <section id="modele" aria-labelledby="modele-titlu" className="mt-6 scroll-mt-20 rounded-2xl border border-line bg-surface p-5 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h2 id="modele-titlu" className="font-display text-2xl font-semibold text-ink sm:text-[1.75rem]">
            Ce spun cele trei modele
          </h2>
          {rows.length > 0 && (
            <p className="mt-1.5 max-w-[60ch] text-[15px] leading-relaxed text-body sm:text-base">
              {plainAgreement(rows)}
              {missing.length > 0 &&
                (rows.length === 1
                  ? ` Scorul e al unui singur model: ${list(missing)} n-au dat încă un răspuns.`
                  : ` ${list(missing)} n-a dat încă un răspuns, deci scorul e media celorlalte două.`)}
            </p>
          )}
        </div>
        {/* Pe telefon scorul trece sub titlu, aliniat la stânga cu el; de la sm stă în dreapta, ca pe desktop. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:block sm:text-right">
          <div className="flex items-start gap-1 sm:justify-end">
            <p className="font-display text-5xl font-semibold leading-none tabular-nums text-ink">
              {fmt(score)}
              <span className="font-sans text-lg font-normal text-muted">/10</span>
            </p>
            <RiskInfo />
          </div>
          <p className={`inline-flex items-center gap-1.5 text-sm font-semibold sm:mt-2 ${RISK[level].text}`}>
            <Glyph level={level} />
            {RISK[level].label} · <span className="text-muted">{agree.toLowerCase()}</span>
          </p>
        </div>
      </div>

      {rows.length > 1 && <Scale rows={rows} score={score} level={level} />}

      {/* Rezumatul comun e de obicei chiar verdictul unuia dintre modele, deja în cardul lui de mai jos: nu-l repetăm. */}
      {summary && !rows.some((r) => r.verdict === summary) && <p className="mt-5 max-w-[72ch] text-[15.5px] leading-7 text-body">{summary}</p>}

      {/* Pe telefon, trei carduri gri în card se citesc greu: un rând sub altul, despărțite de linii. De la md, cardurile. */}
      <ul className="mt-5 grid border-t border-line md:grid-cols-3 md:gap-3 md:border-t-0">
        {rows.map((r) => (
          <li key={r.key} className="border-b border-line py-4 last:border-b-0 last:pb-0 md:rounded-xl md:border-b-0 md:bg-sunken md:p-4 md:last:pb-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-ink">{r.name}</p>
              <p className={`inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums ${RISK[r.level].text}`}>
                <Glyph level={r.level} className="h-2.5 w-2.5" />
                {fmt(r.score)} din 10
              </p>
            </div>
            <p className="mt-0.5 text-xs text-muted">{r.role}</p>
            <p className="mt-2.5 text-sm leading-6 text-body">{r.verdict}</p>
          </li>
        ))}
      </ul>
      {children}
    </section>
  );
}
