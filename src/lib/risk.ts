import type { RiskLevel } from './types';

/** Ce măsoară scorul de risc și ce nu: lângă fiecare scor (RiskInfo) și în metodologie. */
export const RISK_MEANING = 'Riscul e juridic: cât de clar, proporțional și constituțional e textul. Nu spune dacă legea e bună sau rea pentru țară.';
export const RISK_MEANING_MORE =
  'O lege cu un scop bun poate avea risc ridicat când e scrisă vag sau prea larg, iar câteva articole rescrise o pot coborî. La fel, o lege cu risc redus poate să nu-ți placă, și e în regulă.';

export type RiskMeta = {
  label: string;
  short: string;
  /** punct, bară, dungă */
  fill: string;
  /** text colorat pe fundalul paginii */
  text: string;
  /** chip: fundal pal + text */
  chip: string;
  svgFill: string;
};

export const RISK: Record<RiskLevel, RiskMeta> = {
  red: {
    label: 'Risc ridicat',
    short: 'ridicat',
    fill: 'bg-risk-red',
    text: 'text-risk-red-text',
    chip: 'bg-risk-red-soft text-risk-red-text',
    svgFill: 'fill-risk-red',
  },
  yellow: {
    label: 'Risc moderat',
    short: 'moderat',
    fill: 'bg-risk-amber',
    text: 'text-risk-amber-text',
    chip: 'bg-risk-amber-soft text-risk-amber-text',
    svgFill: 'fill-risk-amber',
  },
  green: {
    label: 'Risc redus',
    short: 'redus',
    fill: 'bg-risk-green',
    text: 'text-risk-green-text',
    chip: 'bg-risk-green-soft text-risk-green-text',
    svgFill: 'fill-risk-green',
  },
};

export const RISK_LEVELS: RiskLevel[] = ['red', 'yellow', 'green'];

/** Aceeași regulă ca scorul comun al unui proiect (scripts/straja-council.mjs și /metodologie). */
export function levelFromScore(s: number): RiskLevel {
  if (s >= 6.8) return 'red';
  if (s >= 3.8) return 'yellow';
  return 'green';
}
