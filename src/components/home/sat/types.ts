import type { RiskLevel } from '@/lib/types';

/** Un afiș de pe avizier: un proiect încă în consultare. */
export type Notice = { id: string; level: RiskLevel };

export type SceneOptions = {
  notices: Notice[];
  activeId: string | null;
  reducedMotion: boolean;
  /** Crainicul ține un ziar dacă vreun proiect are articole din ultima săptămână. */
  newspaper: boolean;
  /** Posterul static: fără afișe (le desenează DOM-ul), fără mișcare, unghiul de bază. */
  poster?: boolean;
  /** Dreptunghiurile afișelor pe ecran, în px CSS: [cx, cy, w, h] pentru fiecare afiș. */
  onProject: (rects: Float32Array) => void;
  onFirstFrame: () => void;
  onContextLost: () => void;
};

export interface VillageScene {
  setNotices(notices: Notice[], newspaper: boolean): void;
  /** fromUser: străjerul se întoarce spre afișul ales. */
  setActive(id: string | null, fromUser: boolean): void;
  setTheme(): void;
  setVisible(visible: boolean): void;
  setReducedMotion(reduced: boolean): void;
  dispose(): void;
}

/** Cum se așază afișele pe avizier: mai multe rânduri când sunt multe. */
export function boardGrid(n: number) {
  const rows = n <= 8 ? 2 : n <= 27 ? 3 : n <= 48 ? 4 : 5;
  const cols = Math.max(4, Math.ceil(n / rows));
  return { rows, cols };
}

/** Unde e tabla avizierului în poster, în procente din imagine (măsurat pe pixelii posterului). */
export const POSTER_BOARD = { left: 42.9, top: 45.7, width: 24.45, height: 9.55 };
