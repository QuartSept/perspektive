import type { DrawingDocument } from './document';
import type { Command } from './history';
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
