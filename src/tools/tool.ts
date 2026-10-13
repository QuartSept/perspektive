import type { Point } from '../engine/geometry';
import type { Shape } from '../engine/shapes';
import type { Stroke } from '../engine/stroke';
import type { SnapLine } from '../perspective/snapping';

/** Basınçlı örnek (dünya koordinatı). Fare ve dokunmada basınç anlamsızdır. */
export interface Sample extends Point {
  pressure: number;
}

export interface ToolPointerEvent {
  /** Tuval öğesine göre CSS piksel. */
  screen: Point;
  /** Dünya koordinatı. */
  world: Point;
  /**
   * Son olaydan bu yana tarayıcının birleştirdiği ara örnekler (dünya koordinatı),
   * `world` dahil, zaman sırasıyla. Akıcı stroke için kullanılır.
   */
  samples: Sample[];
  /** 'mouse' | 'pen' | 'touch' */
  pointerType: string;
  pressure: number;
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
  /** Geçici olarak çizilmeyen stroke'lar (yerlerine `previewStrokes` gösterilir). */
  readonly hiddenStrokeIds?: ReadonlySet<string>;
  /** Etkileşim katmanında gösterilen geçici stroke'lar (ör. piksel silgisinin kalan parçaları). */
  readonly previewStrokes?: readonly Stroke[];
  /** Silinmek üzere işaretlenen şekiller (soluk çizilir). */
  readonly fadedShapeIds?: ReadonlySet<string>;
  /** Geçici olarak çizilmeyen şekiller (ör. düzenlenirken yerine önizleme gösterilir). */
  readonly hiddenShapeIds?: ReadonlySet<string>;
  /** Çizilmekte olan şekil. */
  readonly previewShape?: Shape | null;
  /** Önizleme şekli açık çizilsin (bitmemiş çokgen). */
  readonly previewShapeOpen?: boolean;
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
