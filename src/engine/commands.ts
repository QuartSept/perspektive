import type { DrawingDocument } from './document';
import { combineCommands, type Command } from './history';
import type { Shape } from './shapes';
import type { Stroke } from './stroke';

interface Placed {
  index: number;
  stroke: Stroke;
}

/**
 * Genel stroke değişikliği: bazı stroke'ları kaldırır, yerlerine yenilerini koyar.
 *  - stroke ekleme:   removed = [],   added = [yeni]
 *  - stroke silgisi:  removed = [...], added = []
 *  - piksel silgisi (v2): removed = [s], added = [s'nin parçaları] (aynı indekste)
 */
export class ReplaceStrokesCommand implements Command {
  private readonly removed: Placed[];
  private readonly added: Placed[];

  constructor(
    private readonly doc: DrawingDocument,
    removeIds: readonly string[],
    added: readonly Placed[],
  ) {
    this.removed = removeIds
      .map((id) => ({ index: doc.indexOf(id), stroke: doc.strokes[doc.indexOf(id)] }))
      .filter((p) => p.index >= 0);
    this.added = [...added];
  }

  apply(): void {
    this.doc.splice(
      this.removed.map((p) => p.stroke.id),
      this.added,
    );
  }

  revert(): void {
    this.doc.splice(
      this.added.map((p) => p.stroke.id),
      this.removed,
    );
  }
}

export function addStrokeCommand(doc: DrawingDocument, stroke: Stroke): ReplaceStrokesCommand {
  return new ReplaceStrokesCommand(doc, [], [{ index: doc.strokes.length, stroke }]);
}

interface PlacedShape {
  index: number;
  shape: Shape;
}

/**
 * Genel şekil değişikliği (`ReplaceStrokesCommand`'ın şekil karşılığı):
 *  - şekil ekleme:   removed = [],    added = [yeni]
 *  - şekil silme:    removed = [...], added = []
 *  - köşe taşıma:    removed = [s],   added = [s'] (aynı indekste)
 */
export class ReplaceShapesCommand implements Command {
  private readonly removed: PlacedShape[];
  private readonly added: PlacedShape[];

  constructor(
    private readonly doc: DrawingDocument,
    removeIds: readonly string[],
    added: readonly PlacedShape[],
  ) {
    this.removed = removeIds
      .map((id) => ({ index: doc.shapeIndexOf(id), shape: doc.getShape(id)! }))
      .filter((p) => p.index >= 0);
    this.added = [...added];
  }

  apply(): void {
    this.doc.spliceShapes(
      this.removed.map((p) => p.shape.id),
      this.added,
    );
  }

  revert(): void {
    this.doc.spliceShapes(
      this.added.map((p) => p.shape.id),
      this.removed,
    );
  }
}

export function addShapeCommand(doc: DrawingDocument, shape: Shape): ReplaceShapesCommand {
  return new ReplaceShapesCommand(doc, [], [{ index: doc.shapes.length, shape }]);
}

/** Stroke ve şekilleri tek adımda siler (silgi, temizle); silinecek bir şey yoksa null. */
export function removeItemsCommand(
  doc: DrawingDocument,
  strokeIds: readonly string[],
  shapeIds: readonly string[],
): Command | null {
  const commands: Command[] = [];
  if (strokeIds.length) commands.push(new ReplaceStrokesCommand(doc, strokeIds, []));
  if (shapeIds.length) commands.push(new ReplaceShapesCommand(doc, shapeIds, []));
  return combineCommands(commands);
}
