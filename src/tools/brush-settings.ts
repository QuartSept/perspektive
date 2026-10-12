import { clamp } from '../engine/geometry';
import type { InkId, StrokeStyle } from '../engine/stroke';

export const BRUSH_WIDTH_MIN = 0.5;
export const BRUSH_WIDTH_MAX = 24;
export const BRUSH_WIDTH_STEP = 0.5;
export const BRUSH_OPACITY_MIN = 0.1;
export const BRUSH_OPACITY_MAX = 1;

/** Fırçanın o anki stili; yeni stroke'lar bunun kopyasını alır. */
export class BrushSettings implements StrokeStyle {
  width = 2;
  opacity = 1;
  ink: InkId = 'black';
  /** Serbest çizim yumuşatması, 0..1 (stroke'a kaydedilmez). */
  smoothing = 0.35;
  /** Kalemle çizerken basınç kalınlığı etkilesin mi. */
  pressure = true;

  private listeners = new Set<() => void>();

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  setWidth(width: number): void {
    const next = clamp(
      Math.round(width / BRUSH_WIDTH_STEP) * BRUSH_WIDTH_STEP,
      BRUSH_WIDTH_MIN,
      BRUSH_WIDTH_MAX,
    );
    if (next === this.width) return;
    this.width = next;
    this.emit();
  }

  /** `[` `]` için: küçük boyutlarda ince, büyüklerde kaba adım. */
  stepWidth(direction: 1 | -1): void {
    const step = this.width < 4 ? 0.5 : this.width < 10 ? 1 : 2;
    this.setWidth(this.width + direction * step);
  }

  setOpacity(opacity: number): void {
    const next = clamp(Math.round(opacity * 100) / 100, BRUSH_OPACITY_MIN, BRUSH_OPACITY_MAX);
    if (next === this.opacity) return;
    this.opacity = next;
    this.emit();
  }

  setSmoothing(smoothing: number): void {
    const next = clamp(Math.round(smoothing * 100) / 100, 0, 1);
    if (next === this.smoothing) return;
    this.smoothing = next;
    this.emit();
  }

  setPressure(enabled: boolean): void {
    if (enabled === this.pressure) return;
    this.pressure = enabled;
    this.emit();
  }

  setInk(ink: InkId): void {
    if (ink === this.ink) return;
    this.ink = ink;
    this.emit();
  }

  toStyle(): StrokeStyle {
    return { width: this.width, opacity: this.opacity, ink: this.ink };
  }
}
