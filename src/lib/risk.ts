import type { RiskLevel } from './types';

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

export function levelFromScore(s: number): RiskLevel {
  if (s >= 7) return 'red';
  if (s >= 4) return 'yellow';
  return 'green';
}
