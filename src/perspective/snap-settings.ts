import { clamp } from '../engine/geometry';

export const SNAP_RADIUS_MIN = 4;
export const SNAP_RADIUS_MAX = 60;
export const SNAP_RADIUS_DEFAULT = 20;

/** Mıknatıs ayarları. Yarıçap ekran pikseli (yakınlaştırmadan bağımsız). */
export class SnapSettings {
  enabled = true;
  radius = SNAP_RADIUS_DEFAULT;

  private listeners = new Set<() => void>();

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    this.emit();
  }

  setRadius(radius: number): void {
    const next = clamp(Math.round(radius), SNAP_RADIUS_MIN, SNAP_RADIUS_MAX);
    if (next === this.radius) return;
    this.radius = next;
    this.emit();
  }
}
