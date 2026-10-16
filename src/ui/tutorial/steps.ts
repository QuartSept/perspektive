/** Uygulamadan öğreticiye bildirilen olaylar (adımın tamamlanma koşulu). */
export type TutorialEvent =
  | 'pointMoved'
  | 'nearPoint'
  | 'strokeAdded'
  | 'shapeAdded'
  | 'erased'
  | 'viewChanged';

export interface TutorialStep {
  /** Metin anahtarlarının kökü: `tutorial.<id>.title` / `.text` / `.textTouch`. */
  id: string;
  /** Vurgulanacak arayüz öğesi (CSS seçici; görünmüyorsa vurgu yok). */
  target?: string;
  /** Bu olay gelince adım tamamlanır; yoksa yalnızca "İleri" ile geçilir. */
  until?: TutorialEvent;
  /** Dokunmatikte olay beklenmez (ör. imleç yaklaştırma). */
  untilMouseOnly?: boolean;
}

/**
 * Tur: kaçış noktası → ışınlar → mıknatıslı çizgi → şekil (köşe çizgileri,
 * kutu) → parça silgisi → görünümü gezdirme → kaydet / dışa aktar.
 */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  { id: 'welcome' },
  { id: 'points', until: 'pointMoved' },
  { id: 'rays', until: 'nearPoint', untilMouseOnly: true },
  { id: 'line', target: '[data-tool="brush"]', until: 'strokeAdded' },
  { id: 'shape', target: '[data-tool="shape"]', until: 'shapeAdded' },
  { id: 'erase', target: '[data-tool="eraser"]', until: 'erased' },
  { id: 'view', until: 'viewChanged' },
  { id: 'done', target: '[data-action="export"], #toolbar-more-toggle' },
];
