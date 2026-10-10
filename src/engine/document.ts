import type { Stroke } from './stroke';

/**
 * Çizim belgesi: sıralı stroke listesi (sonraki üstte çizilir).
 * Doğrudan değiştirilmez; değişiklikler komutlar üzerinden yapılır (engine/commands.ts).
 */
export class DrawingDocument {
  private items: Stroke[] = [];
  private listeners = new Set<() => void>();

  get strokes(): readonly Stroke[] {
    return this.items;
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

  /**
   * Önce `removeIds` silinir, sonra `insert` öğeleri verilen indekslere
   * (artan sırada) eklenir. Tek değişiklik bildirimi yayınlanır.
   */
  splice(removeIds: readonly string[], insert: readonly { index: number; stroke: Stroke }[]): void {
    if (removeIds.length) {
      const ids = new Set(removeIds);
      this.items = this.items.filter((s) => !ids.has(s.id));
    }
    for (const { index, stroke } of [...insert].sort((a, b) => a.index - b.index)) {
      this.items.splice(Math.min(index, this.items.length), 0, stroke);
    }
    this.emit();
  }

  /** Tüm içeriği değiştirir (yükleme için). */
  replaceAll(strokes: Stroke[]): void {
    this.items = [...strokes];
    this.emit();
  }
}
