import { clamp, type Rect } from './geometry';

export type ReferenceFit = 'contain' | 'cover';
export const REFERENCE_FITS: readonly ReferenceFit[] = ['contain', 'cover'];

export const REFERENCE_OPACITY_MIN = 0.1;
export const REFERENCE_OPACITY_MAX = 1;

/**
 * Görseli kâğıda yerleştirir: `contain` tamamı görünür (kenarda boşluk kalabilir),
 * `cover` kâğıdı tamamen kaplar (taşan kısım kırpılır). Her iki durumda ortalanır.
 */
export function fitImage(imageWidth: number, imageHeight: number, paper: Rect, fit: ReferenceFit): Rect {
  const sx = paper.width / imageWidth;
  const sy = paper.height / imageHeight;
  const s = fit === 'contain' ? Math.min(sx, sy) : Math.max(sx, sy);
  const width = imageWidth * s;
  const height = imageHeight * s;
  return {
    x: paper.x + (paper.width - width) / 2,
    y: paper.y + (paper.height - height) / 2,
    width,
    height,
  };
}

/**
 * Referans görsel altlığı: kâğıdın altında yarı saydam gösterilen, üzerinden
 * çizilecek fotoğraf. Çizimin parçası değildir: geri al geçmişine, proje
 * dosyasına ve PNG/SVG/yazdırma çıktısına girmez.
 */
export class ReferenceImage {
  blob: Blob | null = null;
  bitmap: ImageBitmap | null = null;
  opacity = 0.5;
  visible = true;
  fit: ReferenceFit = 'contain';

  private listeners = new Set<() => void>();

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  get loaded(): boolean {
    return this.bitmap !== null;
  }

  /** Görseli çözer ve yükler; çözülemeyen dosyada hata fırlatır. */
  async load(blob: Blob): Promise<void> {
    const bitmap = await createImageBitmap(blob);
    this.bitmap?.close();
    this.blob = blob;
    this.bitmap = bitmap;
    this.visible = true;
    this.emit();
  }

  clear(): void {
    if (!this.bitmap) return;
    this.bitmap.close();
    this.bitmap = null;
    this.blob = null;
    this.emit();
  }

  setOpacity(opacity: number): void {
    const next = clamp(Math.round(opacity * 100) / 100, REFERENCE_OPACITY_MIN, REFERENCE_OPACITY_MAX);
    if (next === this.opacity) return;
    this.opacity = next;
    this.emit();
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    this.emit();
  }

  setFit(fit: ReferenceFit): void {
    if (fit === this.fit) return;
    this.fit = fit;
    this.emit();
  }
}
