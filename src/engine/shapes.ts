import type { StrokeStyle } from './stroke';

/**
 * Düzenlenebilir geometrik şekiller (V3). Çizim araçları ve düzenleme
 * sonraki aşamalarda gelir; burada kayıt biçiminin dayandığı model durur.
 */
export const SHAPE_KINDS = ['segment', 'rect', 'triangle', 'polygon'] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

export interface Shape {
  id: string;
  kind: ShapeKind;
  /** Köşeler, düz dizi: [x0, y0, x1, y1, ...] dünya koordinatı. */
  vertices: number[];
  style: StrokeStyle;
  /** Bu şeklin köşelerinden kaçış noktalarına kılavuz çizgi çizilsin mi. */
  cornerLines: boolean;
}

/** Türün geçerli köşe sayısı aralığı. */
export function vertexCountRange(kind: ShapeKind): [min: number, max: number] {
  switch (kind) {
    case 'segment':
      return [2, 2];
    case 'rect':
      return [4, 4];
    case 'triangle':
      return [3, 3];
    case 'polygon':
      return [3, Infinity];
  }
}
