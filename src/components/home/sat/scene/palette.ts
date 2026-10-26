import { Color } from './three';
import type { RiskLevel } from '@/lib/types';

/* Materialele machetei rămân aceleași zi și noapte; tema schimbă doar lumina.
   Doar neutre: hârtie, lemn de balsa, piatră, cerneală bleumarin. Fără verde, roșu sau galben aici. */
export const MAT = {
  paper: '#f7f5ef',
  paperWarm: '#efebe2',
  ground: '#f1eee6',
  path: '#e2dccf',
  square: '#e8e3d8',
  soil: '#cdc3b0',
  soilDark: '#b9ad97',
  balsa: '#dfcba7',
  balsaLight: '#eadcc2',
  balsaDark: '#c2a77d',
  wood: '#a98d66',
  stone: '#aeaaa1',
  stoneDark: '#8c8880',
  slate: '#56607a',
  navy: '#22345c',
  ink: '#18213a',
  water: '#d9e0ea',
  pane: '#2d3a58',
  canopy: '#f3f1ea',
  canopyWarm: '#e9e0cc',
  fir: '#a7aebb',
  firDark: '#8f97a6',
  /** Lumina caldă de noapte: culoarea hârtiei, nu chihlimbar. */
  lamp: '#fff3d6',
  strata: ['#f1eee6', '#e6d6b8', '#f4f1ea', '#cdc3af', '#a39e94', '#2a3653'],
} as const;

export type MatKey = Exclude<keyof typeof MAT, 'strata'>;

/** Culorile lui MAT ca obiecte Color, deja în spațiul liniar de lucru. */
export const C: Record<MatKey, Color> = Object.fromEntries(
  Object.entries(MAT)
    .filter(([k]) => k !== 'strata')
    .map(([k, v]) => [k, new Color(v as string)]),
) as Record<MatKey, Color>;

export type Tokens = {
  dark: boolean;
  risk: Record<RiskLevel, Color>;
  riskHex: Record<RiskLevel, string>;
  ink: string;
  surface: string;
  lamp: Color;
};

const LAMP = MAT.lamp;

function cssVar(style: CSSStyleDeclaration, name: string, fallback: string) {
  return style.getPropertyValue(name).trim() || fallback;
}

/** Citește tokenurile temei curente din :root. */
export function readTokens(dark: boolean): Tokens {
  const s = getComputedStyle(document.documentElement);
  const riskHex: Record<RiskLevel, string> = {
    red: cssVar(s, '--risk-red', '#d0372b'),
    yellow: cssVar(s, '--risk-amber', '#dd9c12'),
    green: cssVar(s, '--risk-green', '#3b8a52'),
  };
  return {
    dark,
    riskHex,
    risk: { red: new Color(riskHex.red), yellow: new Color(riskHex.yellow), green: new Color(riskHex.green) },
    ink: cssVar(s, '--ink', '#121a2b'),
    surface: cssVar(s, '--surface', '#fffefb'),
    lamp: new Color(LAMP),
  };
}

export const LAMP_HEX = LAMP;
