export const LAYER_NAMES = ['paper', 'drawing', 'guides', 'interaction'] as const;
export type LayerName = (typeof LAYER_NAMES)[number];

export interface Layer {
  name: LayerName;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

/**
 * Üst üste dizilmiş canvas katmanları:
 *  (1) kâğıt  (2) çizim  (3) kılavuz ışınları  (4) etkileşim/önizleme
 * Boyutlar CSS piksel, arka tamponlar cihaz pikseli (devicePixelRatio).
 */
export class LayerStack {
  readonly layers: Record<LayerName, Layer>;
  width = 0;
  height = 0;
  dpr = 1;

  private resizeListeners = new Set<(width: number, height: number) => void>();

  constructor(private readonly container: HTMLElement) {
    const layers = {} as Record<LayerName, Layer>;
    for (const name of LAYER_NAMES) {
      const canvas = document.createElement('canvas');
      canvas.dataset.layer = name;
      const ctx = canvas.getContext('2d', { alpha: name !== 'paper' });
      if (!ctx) throw new Error('Canvas 2D context unavailable');
      container.appendChild(canvas);
      layers[name] = { name, canvas, ctx };
    }
    this.layers = layers;

    new ResizeObserver(() => this.syncSize()).observe(container);
    // devicePixelRatio değişimi (ekranlar arası taşıma, tarayıcı yakınlaştırması)
    window.addEventListener('resize', () => this.syncSize());
  }

  onResize(fn: (width: number, height: number) => void): void {
    this.resizeListeners.add(fn);
  }

  get(name: LayerName): Layer {
    return this.layers[name];
  }

  /** Dönüşümü sıfırlar ve katmanı tamamen temizler. */
  clear(name: LayerName): CanvasRenderingContext2D {
    const { ctx, canvas } = this.layers[name];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return ctx;
  }

  syncSize(): void {
    const rect = this.container.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    const dpr = window.devicePixelRatio || 1;
    if (width === this.width && height === this.height && dpr === this.dpr) return;

    this.width = width;
    this.height = height;
    this.dpr = dpr;
    for (const { canvas } of Object.values(this.layers)) {
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    for (const fn of this.resizeListeners) fn(width, height);
  }
}
