// Etichetele pentru proiectele de la Camera Deputaților, fără acces la fișiere: le folosesc și componentele din browser.

export type StageKey = 'comisii' | 'raport' | 'plen' | 'altele' | 'senat' | 'promulgare' | 'lege' | 'incheiat';

// Stadiile din lista Camerei, în ordinea drumului. Primele patru înseamnă că proiectul e acum la Cameră.
export const STAGES: { key: StageKey; label: string; match: RegExp; atChamber: boolean }[] = [
  { key: 'comisii', label: 'La comisii', match: /^la comisii/i, atChamber: true },
  { key: 'raport', label: 'Cu raport', match: /^raport/i, atChamber: true },
  { key: 'plen', label: 'Pe ordinea de zi', match: /^pe ordinea de zi/i, atChamber: true },
  { key: 'altele', label: 'Reexaminare', match: /^(în reexaminare|aviz|sesizare)/i, atChamber: true },
  { key: 'senat', label: 'La Senat', match: /^la senat/i, atChamber: false },
  { key: 'promulgare', label: 'La promulgare', match: /^la promulgare/i, atChamber: false },
  { key: 'lege', label: 'Lege', match: /^lege\s/i, atChamber: false },
  { key: 'incheiat', label: 'Încheiat', match: /./, atChamber: false },
];
export const stageOf = (stadiu: string): StageKey => STAGES.find((s) => s.match.test(stadiu))!.key;
export const stageLabel = (key: StageKey) => STAGES.find((s) => s.key === key)!.label;

/** „Comisia pentru administrație publică…” → „Administrație publică…”, ca să încapă pe un rând. */
export const shortCommittee = (name: string) => name.replace(/^Comisia (pentru )?/, '').replace(/^./, (c) => c.toUpperCase());

/** „2026-11-03” → „3 nov.” */
export const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

/** Zile de la `today` până la `iso` (amândouă YYYY-MM-DD); negativ dacă a trecut. */
export const dayDiff = (iso: string, today: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
