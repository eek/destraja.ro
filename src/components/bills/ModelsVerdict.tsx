import { Fragment, type ReactNode } from 'react';
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

// Clasele întregi, ca Tailwind să le găsească în sursă: zonele de risc, mai șterse pe rândurile modelelor.
const ZONES = {
  faint: ['bg-risk-green/20', 'bg-risk-amber/20', 'bg-risk-red/20'],
  soft: ['bg-risk-green/30', 'bg-risk-amber/30', 'bg-risk-red/30'],
};
const Zones = ({ tone }: { tone: keyof typeof ZONES }) => (
  <>
    {['w-[38%]', 'w-[30%]', 'w-[32%]'].map((w, i) => (
      <span key={w} className={`${w} ${ZONES[tone][i]}`} />
    ))}
  </>
);

/**
 * Pe scala 0–10, cu zonele de risc: un rând pentru fiecare model, cu numele și scorul lui în stânga și punctul lui pe
 * scală, iar dedesubt media, cu punctul mare. Etichetele plutitoare de deasupra unei singure scale se suprapuneau când
 * scorurile erau apropiate (6, 7, 8 pe un telefon) și nu se mai vedea cine ce scor a dat; pe rânduri, fiecare punct are
 * eticheta lui, și la scoruri egale, și la capetele scalei.
 */
function Scale({ rows, score, level }: { rows: { name: string; level: RiskLevel; score: number }[]; score: number; level: RiskLevel }) {
  return (
    <div className="mt-6 mb-2 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2.5" aria-hidden>
      {rows.map((r) => (
        <Fragment key={r.name}>
          <span className="whitespace-nowrap text-xs text-muted">
            {r.name} <span className={`font-semibold tabular-nums ${RISK[r.level].text}`}>{fmt(r.score)}</span>
          </span>
          <span className="relative h-3">
            <span className="absolute inset-x-0 top-1/2 flex h-1 -translate-y-1/2 overflow-hidden rounded-full">
              <Zones tone="faint" />
            </span>
            <span
              className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface ${RISK[r.level].fill}`}
              style={{ left: `${r.score * 10}%` }}
            />
          </span>
        </Fragment>
      ))}
      <span className="whitespace-nowrap text-xs font-semibold text-ink">
        Media <span className="tabular-nums">{fmt(score)}</span>
      </span>
      <span className="relative h-[18px]">
        <span className="absolute inset-x-0 top-1/2 flex h-2.5 -translate-y-1/2 overflow-hidden rounded-full">
          <Zones tone="soft" />
        </span>
        <span
          className={`absolute top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-surface shadow-[0_0_0_1.5px_var(--ink)] ${RISK[level].fill}`}
          style={{ left: `${score * 10}%` }}
        />
      </span>
      <span />
      <span className="-mt-1 flex justify-between text-[11px] tabular-nums text-muted">
        <span>
          0<span className="hidden sm:inline">, fără risc</span>
        </span>
        <span>
          10<span className="hidden sm:inline">, risc maxim</span>
        </span>
      </span>
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
      {/* Scorul comun și linia de sub el stau centrate, la orice lățime. Golul din stânga are lățimea semnului de întrebare,
          ca cifra să fie chiar la mijloc. */}
      <div className="mt-5 flex flex-col items-center text-center">
        <div className="flex items-start gap-1">
          <span className="w-7 shrink-0" aria-hidden />
          <p className="font-display text-5xl font-semibold leading-none tabular-nums text-ink">
            {fmt(score)}
            <span className="font-sans text-lg font-normal text-muted">/10</span>
          </p>
          <RiskInfo />
        </div>
        <p className={`mt-2 inline-flex flex-wrap items-center justify-center gap-x-1.5 text-sm font-semibold ${RISK[level].text}`}>
          <Glyph level={level} />
          {RISK[level].label} · <span className="text-muted">{agree.toLowerCase()}</span>
        </p>
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
