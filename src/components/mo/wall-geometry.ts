/**
 * Geometria zidului de zile de pe /monitorul-oficial, comună desenului (Wall.tsx, pe server) și indicatorului
 * (WallHover.tsx, în browser): un rând pe an, o coloană pe zi (desktop) sau pe săptămână (telefon).
 */
export const WALL = {
  day: { label: 40, top: 20, col: 3, cell: 2.4, row: 15, rowGap: 3, cols: 366 },
  week: { label: 30, top: 18, col: 6, cell: 5, row: 10, rowGap: 2.5, cols: 53 },
} as const;

export type WallMode = keyof typeof WALL;

/** Pragurile culorilor: actele dintr-o zi (fixe, ca sensul lor să nu se schimbe când se completează anii). */
export const DAY_BINS = [1, 11, 26, 51, 101] as const;
/** Pragurile pe săptămână (sumă de zile). */
export const WEEK_BINS = [1, 51, 126, 251, 501] as const;

export function binOf(v: number, bins: readonly number[]): number {
  let b = 0;
  for (let i = 0; i < bins.length; i++) if (v >= bins[i]) b = i + 1;
  return b;
}

export const binLabels = (bins: readonly number[]) =>
  bins.map((lo, i) => (i === bins.length - 1 ? `${lo}+` : lo === bins[i + 1] - 1 ? `${lo}` : `${lo}–${bins[i + 1] - 1}`));

/** Săptămâna: suma zilelor citite și câte zile din ea lipsesc (necitite sau încă neindexate). */
export function weeks(values: (number | null)[]): { sum: number; known: number; unknown: number; from: number }[] {
  const out = [];
  for (let w = 0; w < 53; w++) {
    let sum = 0;
    let known = 0;
    let unknown = 0;
    for (let d = w * 7; d < Math.min(values.length, w * 7 + 7); d++) {
      const v = values[d];
      if (v === null) unknown++;
      else {
        known++;
        sum += v;
      }
    }
    out.push({ sum, known, unknown, from: w * 7 });
  }
  return out;
}
