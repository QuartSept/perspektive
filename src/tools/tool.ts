import type { Point } from '../engine/geometry';

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

/**
 * Tüm araçların ortak arayüzü (el, fırça, silgi, nokta yerleştirme...).
 * InputController yalnızca sol tuş hareketlerini etkin araca iletir;
 * sol tuş basılı değilken de onPointerMove çağrılır (üzerine gelme önizlemesi için).
 */
export interface Tool {
  readonly id: string;
  readonly cursor: string;
  activate?(): void;
  deactivate?(): void;
  onPointerDown(e: ToolPointerEvent): void;
  onPointerMove(e: ToolPointerEvent): void;
  onPointerUp(e: ToolPointerEvent): void;
  onPointerCancel?(): void;
}
