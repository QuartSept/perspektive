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
}

export class EditorState implements EditorStateData {
  pointer: Point | null = null;
  guidesVisible = true;
  markersVisible = true;
  hoveredPointId: string | null = null;
  selectedPointId: string | null = null;
  draggingPointId: string | null = null;
  horizonHovered = false;

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
