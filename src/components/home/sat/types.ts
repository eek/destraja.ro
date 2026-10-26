import type { RiskLevel } from '@/lib/types';

/** Un afiș de pe avizier: un proiect încă în consultare. */
export type Notice = { id: string; level: RiskLevel };

export type SceneOptions = {
  notices: Notice[];
  activeId: string | null;
  reducedMotion: boolean;
  /** Crainicul ține un ziar dacă vreun proiect are articole din ultima săptămână. */
  newspaper: boolean;
  /** Posterul static: fără afișe (le desenează DOM-ul), unghiul de bază. */
  poster?: boolean;
  /** Elementul pe care se trage ca să rotești satul. */
  surface: HTMLElement;
  /**
   * Dreptunghiurile pe ecran, în px CSS: [cx, cy, w, h] pentru fiecare afiș, apoi unul pentru toată tabla.
   * facing: tabla e cu fața spre privitor (altfel afișele nu se pot apăsa).
   */
  onProject: (rects: Float32Array, facing: boolean) => void;
  onFirstFrame: () => void;
  onContextLost: () => void;
  /** Prima dată când cineva rotește satul (ascundem îndemnul). */
  onRotate: () => void;
  /** Camera s-a apropiat de avizier sau s-a întors la sat. */
  onZoom: (zoomed: boolean) => void;
};

export interface VillageScene {
  setNotices(notices: Notice[], newspaper: boolean): void;
  /** fromUser: străjerul se uită spre afișul ales, iar camera se întoarce spre avizier dacă era cu spatele. */
  setActive(id: string | null, fromUser: boolean): void;
  setTheme(): void;
  setVisible(visible: boolean): void;
  setReducedMotion(reduced: boolean): void;
  /** Prim-planul avizierului, pentru telefoane. */
  setZoom(on: boolean): void;
  dispose(): void;
}

/** Cum se așază afișele pe avizier: mai multe rânduri când sunt multe. */
export function boardGrid(n: number) {
  const rows = n <= 8 ? 2 : n <= 27 ? 3 : n <= 48 ? 4 : 5;
  const cols = Math.max(4, Math.ceil(n / rows));
  return { rows, cols };
}

/**
 * Unde e tabla avizierului în poster, în procente din imagine, măsurat pe pixelii posterului.
 * skew: tabla e văzută puțin din stânga, așa că marginile de sus și de jos urcă spre dreapta.
 */
export const POSTER_BOARD = { left: 46.4, top: 46.38, width: 17.14, height: 6.82, skew: -3.9 };
