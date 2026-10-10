import { addStrokeCommand } from '../engine/commands';
import type { DrawingDocument } from '../engine/document';
import type { Point } from '../engine/geometry';
import type { History } from '../engine/history';
import { lastPoint, newStrokeId, type Stroke } from '../engine/stroke';
import type { Viewport } from '../engine/viewport';
import type { BrushSettings } from './brush-settings';
import type { Tool, ToolPointerEvent } from './tool';

/** Ardışık örnekler arasında en az bu kadar ekran pikseli olmalı. */
const MIN_SAMPLE_DISTANCE_PX = 0.75;

/**
 * Serbest fırça. Stroke çizilirken etkileşim katmanında önizlenir,
 * bırakılınca komut olarak belgeye eklenir.
 * Snapping (Aşama 4) ve yumuşatma (Aşama 5) bu aracın örnek akışına eklenecek.
 */
export class BrushTool implements Tool {
  readonly id = 'brush';
  readonly cursor = 'crosshair';
  private stroke: Stroke | null = null;

  constructor(
    private readonly viewport: Viewport,
    private readonly doc: DrawingDocument,
    private readonly history: History,
    private readonly settings: BrushSettings,
    private readonly onPreviewChange: () => void,
  ) {}

  /** Çizilmekte olan stroke (önizleme için). */
  get preview(): Stroke | null {
    return this.stroke;
  }

  deactivate(): void {
    this.onPointerCancel();
  }

  onPointerDown(e: ToolPointerEvent): void {
    this.stroke = {
      id: newStrokeId(),
      points: [e.world.x, e.world.y],
      style: this.settings.toStyle(),
    };
    this.onPreviewChange();
  }

  onPointerMove(e: ToolPointerEvent): void {
    if (!this.stroke) return;
    let added = false;
    for (const p of e.samples) added = this.addSample(p) || added;
    if (added) this.onPreviewChange();
  }

  onPointerUp(e: ToolPointerEvent): void {
    const stroke = this.stroke;
    if (!stroke) return;
    this.addSample(e.world);
    this.stroke = null;
    this.history.execute(addStrokeCommand(this.doc, stroke));
    this.onPreviewChange();
  }

  onPointerCancel(): void {
    if (!this.stroke) return;
    this.stroke = null;
    this.onPreviewChange();
  }

  private addSample(p: Point): boolean {
    const stroke = this.stroke!;
    const last = lastPoint(stroke)!;
    const minDist = MIN_SAMPLE_DISTANCE_PX / this.viewport.scale;
    if (Math.hypot(p.x - last.x, p.y - last.y) < minDist) return false;
    stroke.points.push(p.x, p.y);
    return true;
  }
}
