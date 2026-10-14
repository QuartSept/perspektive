import type { Point } from './geometry';

/** Kaydedilmeyen, anlık arayüz durumu (imleç, seçim, görünürlük). */
export interface EditorStateData {
  /** Tuval üzerindeki imleç, CSS piksel; tuval dışında null. */
  pointer: Point | null;
  guidesVisible: boolean;
  markersVisible: boolean;
  hoveredPointId: string | null;
  selectedPointId: string | null;
  draggingPointId: string | null;
  horizonHovered: boolean;
  /** Space basılı: mıknatıs geçici olarak kapalı. */
  temporaryFree: boolean;
  /** Kaçış noktası işaretçisi boyutu (1 = eski tam boyut). */
  markerScale: number;
}

export const MARKER_SCALE_DEFAULT = 0.7;
export const MARKER_SCALE_MIN = 0.5;
export const MARKER_SCALE_MAX = 1.5;

export class EditorState implements EditorStateData {
  pointer: Point | null = null;
  guidesVisible = true;
  markersVisible = true;
  hoveredPointId: string | null = null;
  selectedPointId: string | null = null;
  draggingPointId: string | null = null;
  horizonHovered = false;
  temporaryFree = false;
  markerScale = MARKER_SCALE_DEFAULT;

  private listeners = new Set<(changed: Set<keyof EditorStateData>) => void>();

  onChange(fn: (changed: Set<keyof EditorStateData>) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  update(patch: Partial<EditorStateData>): void {
    const changed = new Set<keyof EditorStateData>();
    for (const key of Object.keys(patch) as (keyof EditorStateData)[]) {
      if (this[key] !== patch[key]) {
        (this as Record<keyof EditorStateData, unknown>)[key] = patch[key];
        changed.add(key);
      }
    }
    if (changed.size === 0) return;
    for (const fn of this.listeners) fn(changed);
  }
}
