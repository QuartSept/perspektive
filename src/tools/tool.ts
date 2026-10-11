import type { Point } from '../engine/geometry';
import type { Stroke } from '../engine/stroke';
import type { SnapLine } from '../perspective/snapping';

export interface ToolPointerEvent {
  /** Tuval öğesine göre CSS piksel. */
  screen: Point;
  /** Dünya koordinatı. */
  world: Point;
  /**
   * Son olaydan bu yana tarayıcının birleştirdiği ara örnekler (dünya koordinatı),
   * `world` dahil, zaman sırasıyla. Akıcı stroke için kullanılır.
   */
  samples: Point[];
  native: PointerEvent;
}

/** Etkin aracın tuvalde anlık gösterdiği geri bildirim. */
export interface ToolOverlay {
  /** Çizilmekte olan stroke. */
  readonly preview?: Stroke | null;
  /** Kilitli perspektif doğrusu. */
  readonly snapLine?: SnapLine | null;
  /** Silinmek üzere işaretlenen stroke'lar (soluk çizilir). */
  readonly fadedStrokeIds?: ReadonlySet<string>;
  /** İmleç yerine çizilen daire yarıçapı, CSS piksel (ör. silgi). */
  readonly cursorRadius?: number | null;
}

/**
 * Tüm araçların ortak arayüzü (fırça, silgi, nokta yerleştirme, el...).
 * InputController yalnızca sol tuş hareketlerini etkin araca iletir;
 * sol tuş basılı değilken de onPointerMove çağrılır (üzerine gelme önizlemesi için).
 */
export interface Tool {
  readonly id: string;
  readonly cursor: string;
  readonly overlay?: ToolOverlay;
  activate?(): void;
  deactivate?(): void;
  onPointerDown(e: ToolPointerEvent): void;
  onPointerMove(e: ToolPointerEvent): void;
  onPointerUp(e: ToolPointerEvent): void;
  onPointerCancel?(): void;
}
