/**
 * Çizim katmanları (V4). Sıra dizideki sıradır: ilk eleman en altta çizilir.
 * Kılavuzlar (ışınlar, ızgara, köşe çizgileri, kaçış noktaları) katman değildir.
 */
export interface Layer {
  id: string;
  /** Boşsa arayüz sıra numarasıyla varsayılan bir ad gösterir ("Katman 1"). */
  name: string;
  visible: boolean;
  /** Kilitli katmana çizilemez, silinemez, seçilemez. */
  locked: boolean;
  /** 0–1; çizim katmanın tamamına uygulanır (nesnelerin kendi opaklığı ayrıca). */
  opacity: number;
}

/** Performans için üst sınır. */
export const MAX_LAYERS = 20;
export const LAYER_OPACITY_MIN = 0;
export const LAYER_OPACITY_MAX = 1;

export const newLayerId = (): string => `l-${Math.random().toString(36).slice(2, 10)}`;

export function createLayer(name = '', id = newLayerId()): Layer {
  return { id, name, visible: true, locked: false, opacity: 1 };
}

/** Katmana ait nesne (stroke ya da şekil). */
export interface Layered {
  layerId?: string;
}
