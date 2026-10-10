import { clamp, type Point, type Rect } from './geometry';

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Dünya (world) koordinatlarını ekran (CSS piksel) koordinatlarına eşler.
 *   screen = world * scale + offset
 * Dünya birimi: %100 yakınlaştırmada 1 CSS pikseli (96 DPI).
 */
export class Viewport {
  static readonly MIN_SCALE = 0.05;
  static readonly MAX_SCALE = 16;

  offsetX = 0;
  offsetY = 0;
  scale = 1;
  width = 0;
  height = 0;

  private listeners = new Set<() => void>();

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  worldToScreen(p: Point): Point {
    return { x: p.x * this.scale + this.offsetX, y: p.y * this.scale + this.offsetY };
  }

  screenToWorld(p: Point): Point {
    return { x: (p.x - this.offsetX) / this.scale, y: (p.y - this.offsetY) / this.scale };
  }

  /** Ekranda görünen dünya dikdörtgeni. */
  visibleWorldRect(): Rect {
    const tl = this.screenToWorld({ x: 0, y: 0 });
    return { x: tl.x, y: tl.y, width: this.width / this.scale, height: this.height / this.scale };
  }

  resize(width: number, height: number): void {
    // Görünüm merkezini koru
    if (this.width > 0 && this.height > 0) {
      this.offsetX += (width - this.width) / 2;
      this.offsetY += (height - this.height) / 2;
    }
    this.width = width;
    this.height = height;
    this.emit();
  }

  panBy(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    this.offsetX += dx;
    this.offsetY += dy;
    this.emit();
  }

  /** Ekrandaki `anchor` noktası sabit kalacak şekilde ölçeği ayarlar. */
  setScale(scale: number, anchor: Point = { x: this.width / 2, y: this.height / 2 }): void {
    const next = clamp(scale, Viewport.MIN_SCALE, Viewport.MAX_SCALE);
    if (next === this.scale) return;
    const world = this.screenToWorld(anchor);
    this.scale = next;
    this.offsetX = anchor.x - world.x * next;
    this.offsetY = anchor.y - world.y * next;
    this.emit();
  }

  zoomAt(anchor: Point, factor: number): void {
    this.setScale(this.scale * factor, anchor);
  }

  /** Dünya dikdörtgenini ekrana ortalayarak sığdırır. Kenar boşlukları CSS piksel. */
  fitRect(rect: Rect, padding: Padding): void {
    const availW = Math.max(1, this.width - padding.left - padding.right);
    const availH = Math.max(1, this.height - padding.top - padding.bottom);
    const scale = clamp(
      Math.min(availW / rect.width, availH / rect.height),
      Viewport.MIN_SCALE,
      Viewport.MAX_SCALE,
    );
    this.scale = scale;
    this.offsetX = padding.left + (availW - rect.width * scale) / 2 - rect.x * scale;
    this.offsetY = padding.top + (availH - rect.height * scale) / 2 - rect.y * scale;
    this.emit();
  }

  /** Bağlama dünya → cihaz pikseli dönüşümünü uygular. */
  applyTo(ctx: CanvasRenderingContext2D, dpr: number): void {
    ctx.setTransform(
      this.scale * dpr,
      0,
      0,
      this.scale * dpr,
      this.offsetX * dpr,
      this.offsetY * dpr,
    );
  }
}
