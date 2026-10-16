import { clamp, type Point, type Rect } from './geometry';

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Dünya (world) koordinatlarını ekran (CSS piksel) koordinatlarına eşler.
 *   screen = R(rotation) · (world · scale) + offset
 * Dünya birimi: %100 yakınlaştırmada 1 CSS pikseli (96 DPI). Döndürme
 * yalnızca görünümdür (kâğıdı masada çevirmek gibi); çizim, kayıt ve
 * çıktılar dünya koordinatlarıyla çalışır.
 */
export class Viewport {
  static readonly MIN_SCALE = 0.05;
  static readonly MAX_SCALE = 16;

  offsetX = 0;
  offsetY = 0;
  scale = 1;
  /** Görünüm açısı, radyan (ekranda saat yönü pozitif). */
  rotation = 0;
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

  /** Dünya noktasının ölçeklenip döndürülmüş hâli (ötelemesiz). */
  private turn(p: Point): Point {
    const c = Math.cos(this.rotation);
    const s = Math.sin(this.rotation);
    return { x: (p.x * c - p.y * s) * this.scale, y: (p.x * s + p.y * c) * this.scale };
  }

  worldToScreen(p: Point): Point {
    const q = this.turn(p);
    return { x: q.x + this.offsetX, y: q.y + this.offsetY };
  }

  screenToWorld(p: Point): Point {
    const dx = p.x - this.offsetX;
    const dy = p.y - this.offsetY;
    const c = Math.cos(this.rotation);
    const s = Math.sin(this.rotation);
    return { x: (dx * c + dy * s) / this.scale, y: (-dx * s + dy * c) / this.scale };
  }

  /** Dünya açısının (radyan) ekrandaki karşılığı. */
  screenAngle(worldAngle: number): number {
    return worldAngle + this.rotation;
  }

  /** Dünya yönünün (birim vektör) ekrandaki karşılığı. */
  screenDirection(d: Point): Point {
    const c = Math.cos(this.rotation);
    const s = Math.sin(this.rotation);
    return { x: d.x * c - d.y * s, y: d.x * s + d.y * c };
  }

  /** Ekranda görünen alanı kapsayan dünya dikdörtgeni (dönükken köşelerin sınır kutusu). */
  visibleWorldRect(): Rect {
    const corners = [
      { x: 0, y: 0 },
      { x: this.width, y: 0 },
      { x: 0, y: this.height },
      { x: this.width, y: this.height },
    ].map((p) => this.screenToWorld(p));
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
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
    this.pin(world, anchor);
    this.emit();
  }

  /** Görünüm açısını değiştirir; ekrandaki `anchor` noktası yerinde kalır. */
  setRotation(angle: number, anchor: Point = { x: this.width / 2, y: this.height / 2 }): void {
    // (-π, π] aralığında tutulur
    let a = angle % (Math.PI * 2);
    if (a > Math.PI) a -= Math.PI * 2;
    else if (a <= -Math.PI) a += Math.PI * 2;
    if (a === this.rotation) return;
    const world = this.screenToWorld(anchor);
    this.rotation = a;
    this.pin(world, anchor);
    this.emit();
  }

  /** Ötelemeyi, dünya noktası ekranda `screen`'e düşecek şekilde ayarlar. */
  private pin(world: Point, screen: Point): void {
    const q = this.turn(world);
    this.offsetX = screen.x - q.x;
    this.offsetY = screen.y - q.y;
  }

  zoomAt(anchor: Point, factor: number): void {
    this.setScale(this.scale * factor, anchor);
  }

  /**
   * Dünya dikdörtgenini ekrana ortalayarak sığdırır (dönükken döndürülmüş
   * sınır kutusu sığar; açı korunur). Kenar boşlukları CSS piksel.
   */
  fitRect(rect: Rect, padding: Padding): void {
    const availW = Math.max(1, this.width - padding.left - padding.right);
    const availH = Math.max(1, this.height - padding.top - padding.bottom);
    const c = Math.abs(Math.cos(this.rotation));
    const s = Math.abs(Math.sin(this.rotation));
    const boxW = rect.width * c + rect.height * s;
    const boxH = rect.width * s + rect.height * c;
    this.scale = clamp(Math.min(availW / boxW, availH / boxH), Viewport.MIN_SCALE, Viewport.MAX_SCALE);
    const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    this.pin(center, { x: padding.left + availW / 2, y: padding.top + availH / 2 });
    this.emit();
  }

  /**
   * Dünya noktasını, kenar boşlukları dışında kalan alanın ortasına kaydırır;
   * ölçek değişmez ("sığdır"dan farkı).
   */
  centerOn(world: Point, padding: Padding): void {
    const availW = Math.max(1, this.width - padding.left - padding.right);
    const availH = Math.max(1, this.height - padding.top - padding.bottom);
    const before = { x: this.offsetX, y: this.offsetY };
    this.pin(world, { x: padding.left + availW / 2, y: padding.top + availH / 2 });
    if (before.x === this.offsetX && before.y === this.offsetY) return;
    this.emit();
  }

  /** Bağlama dünya → cihaz pikseli dönüşümünü uygular. */
  applyTo(ctx: CanvasRenderingContext2D, dpr: number): void {
    const k = this.scale * dpr;
    const c = Math.cos(this.rotation);
    const s = Math.sin(this.rotation);
    ctx.setTransform(k * c, k * s, -k * s, k * c, this.offsetX * dpr, this.offsetY * dpr);
  }
}
