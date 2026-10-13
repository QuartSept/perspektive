import type { Shape } from './shapes';
import type { Stroke } from './stroke';

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
 * Çizim belgesi: sıralı stroke listesi ve sıralı şekil listesi (sonraki
 * üstte çizilir; şekiller stroke'ların altında kalır). Doğrudan
 * değiştirilmez; değişiklikler komutlar üzerinden yapılır (engine/commands.ts).
 */
export class DrawingDocument {
  private items: Stroke[] = [];
  private shapeItems: Shape[] = [];
  private listeners = new Set<() => void>();

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

  /** Tüm içeriği değiştirir (yükleme için). */
  replaceAll(strokes: Stroke[], shapes: Shape[] = []): void {
    this.items = [...strokes];
    this.shapeItems = [...shapes];
    this.emit();
  }
}
