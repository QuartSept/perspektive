import { createLayer, type Layer, type Layered } from './doc-layers';
import type { Shape } from './shapes';
import type { Stroke } from './stroke';

/** Etkin katmana neden çizilemediği. */
export type LayerBlock = 'locked' | 'hidden';

/** Kimliği olan öğeleri `removeIds` sonrası verilen indekslere (artan sırada) ekler. */
function spliceList<T extends { id: string }>(
  list: T[],
  removeIds: readonly string[],
  insert: readonly { index: number; item: T }[],
): T[] {
  let next = list;
  if (removeIds.length) {
    const ids = new Set(removeIds);
    next = next.filter((s) => !ids.has(s.id));
  } else {
    next = [...next];
  }
  for (const { index, item } of [...insert].sort((a, b) => a.index - b.index)) {
    next.splice(Math.min(index, next.length), 0, item);
  }
  return next;
}

/**
 * Çizim belgesi: katmanlar, sıralı stroke listesi ve sıralı şekil listesi.
 * Katmanlar alttan üste çizilir; katman içinde şekiller stroke'ların altında,
 * sonra eklenen üstte kalır. Doğrudan değiştirilmez; değişiklikler komutlar
 * üzerinden yapılır (engine/commands.ts, engine/layer-commands.ts).
 */
export class DrawingDocument {
  private items: Stroke[] = [];
  private shapeItems: Shape[] = [];
  private layerItems: Layer[] = [createLayer()];
  private activeId = this.layerItems[0].id;
  private listeners = new Set<() => void>();

  /** Alttan üste katmanlar (en az bir tane). */
  get layers(): readonly Layer[] {
    return this.layerItems;
  }

  /** Çizim araçlarının çizdiği katman. */
  get activeLayer(): Layer {
    return this.getLayer(this.activeId) ?? this.layerItems[this.layerItems.length - 1];
  }

  get activeLayerId(): string {
    return this.activeLayer.id;
  }

  getLayer(id: string): Layer | undefined {
    return this.layerItems.find((l) => l.id === id);
  }

  layerIndex(id: string): number {
    return this.layerItems.findIndex((l) => l.id === id);
  }

  /** Nesnenin katmanı: katmanı yoksa ya da bilinmiyorsa en alttaki katman. */
  layerOf(item: Layered): Layer {
    return (item.layerId && this.getLayer(item.layerId)) || this.layerItems[0];
  }

  /** Nesne ekranda görünüyor mu (katmanı görünür). */
  isVisible(item: Layered): boolean {
    return this.layerOf(item).visible;
  }

  /** Nesne silinebilir / seçilebilir mi (katmanı görünür ve kilitsiz). */
  isEditable(item: Layered): boolean {
    const layer = this.layerOf(item);
    return layer.visible && !layer.locked;
  }

  /**
   * Katman listesini ve etkin katmanı değiştirir (katman komutları ve yükleme).
   * Boş liste kabul edilmez; etkin katman listede yoksa en üstteki seçilir.
   */
  setLayers(layers: readonly Layer[], activeId: string = this.activeId): void {
    if (!layers.length) return;
    this.layerItems = layers.map((l) => ({ ...l }));
    this.activeId = this.getLayer(activeId) ? activeId : this.layerItems[this.layerItems.length - 1].id;
    this.emit();
  }

  /** Etkin katmana çizilemiyorsa nedeni (kilitli / gizli), çizilebiliyorsa null. */
  get activeLayerBlocked(): LayerBlock | null {
    const layer = this.activeLayer;
    if (layer.locked) return 'locked';
    if (!layer.visible) return 'hidden';
    return null;
  }

  /** Etkin katmanı değiştirir (geri al geçmişine girmez). */
  setActiveLayer(id: string): void {
    if (id === this.activeId || !this.getLayer(id)) return;
    this.activeId = id;
    this.emit();
  }

  get strokes(): readonly Stroke[] {
    return this.items;
  }

  get shapes(): readonly Shape[] {
    return this.shapeItems;
  }

  /** Ne stroke ne şekil var. */
  get isEmpty(): boolean {
    return this.items.length === 0 && this.shapeItems.length === 0;
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  indexOf(id: string): number {
    return this.items.findIndex((s) => s.id === id);
  }

  shapeIndexOf(id: string): number {
    return this.shapeItems.findIndex((s) => s.id === id);
  }

  getShape(id: string): Shape | undefined {
    return this.shapeItems.find((s) => s.id === id);
  }

  /**
   * Önce `removeIds` silinir, sonra `insert` öğeleri verilen indekslere
   * (artan sırada) eklenir. Tek değişiklik bildirimi yayınlanır.
   */
  splice(removeIds: readonly string[], insert: readonly { index: number; stroke: Stroke }[]): void {
    this.items = spliceList(
      this.items,
      removeIds,
      insert.map(({ index, stroke }) => ({ index, item: stroke })),
    );
    this.emit();
  }

  /** `splice`'ın şekil listesi karşılığı. */
  spliceShapes(removeIds: readonly string[], insert: readonly { index: number; shape: Shape }[]): void {
    this.shapeItems = spliceList(
      this.shapeItems,
      removeIds,
      insert.map(({ index, shape }) => ({ index, item: shape })),
    );
    this.emit();
  }

  /** Tüm nesneleri değiştirir; katmanlar korunur (kâğıt döndürme vb.). */
  replaceAll(strokes: Stroke[], shapes: Shape[] = []): void {
    this.items = [...strokes];
    this.shapeItems = [...shapes];
    this.emit();
  }

  /** Belgenin tamamını yükler: nesneler ve katmanlar (kayıt, proje dosyası, geri al). */
  load(strokes: Stroke[], shapes: Shape[], layers: readonly Layer[], activeId: string): void {
    this.items = [...strokes];
    this.shapeItems = [...shapes];
    this.layerItems = layers.length ? layers.map((l) => ({ ...l })) : [createLayer()];
    this.activeId = this.getLayer(activeId) ? activeId : this.layerItems[this.layerItems.length - 1].id;
    this.emit();
  }
}
