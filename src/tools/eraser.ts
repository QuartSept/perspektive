import { ReplaceStrokesCommand } from '../engine/commands';
import type { DrawingDocument } from '../engine/document';
import { clamp, type Point } from '../engine/geometry';
import type { History } from '../engine/history';
import { segmentTouchesStroke } from '../engine/stroke-geometry';
import type { Viewport } from '../engine/viewport';
import type { Tool, ToolOverlay, ToolPointerEvent } from './tool';

export const ERASER_RADIUS_MIN = 2;
export const ERASER_RADIUS_MAX = 40;

/**
 * Stroke silgisi: sürüklerken dokunulan stroke'lar komple silinmek üzere
 * işaretlenir (soluk görünür), bırakınca tek komutla silinir.
 *
 * v2'de PixelEraser aynı Tool arayüzünü uygulayacak ve stroke'u parçalara
 * bölen bir ReplaceStrokesCommand üretecek; araç çubuğunda aynı düğmenin
 * altında tür seçimi olacak.
 */
export class StrokeEraserTool implements Tool, ToolOverlay {
  readonly id = 'eraser';
  readonly cursor = 'none';
  /** Ekran pikseli (yakınlaştırmadan bağımsız). */
  radius = 8;

  private marked = new Set<string>();
  private last: Point | null = null;

  constructor(
    private readonly viewport: Viewport,
    private readonly doc: DrawingDocument,
    private readonly history: History,
    private readonly onOverlayChange: (strokesChanged: boolean) => void,
  ) {}

  get overlay(): ToolOverlay {
    return this;
  }

  get fadedStrokeIds(): ReadonlySet<string> {
    return this.marked;
  }

  get cursorRadius(): number {
    return this.radius;
  }

  stepRadius(direction: 1 | -1): void {
    const step = this.radius < 10 ? 1 : 2;
    this.radius = clamp(this.radius + direction * step, ERASER_RADIUS_MIN, ERASER_RADIUS_MAX);
    this.onOverlayChange(false);
  }

  deactivate(): void {
    this.onPointerCancel();
  }

  onPointerDown(e: ToolPointerEvent): void {
    this.marked = new Set();
    this.last = e.world;
    this.sweep(e.world, e.world);
  }

  onPointerMove(e: ToolPointerEvent): void {
    if (!this.last) return;
    let from = this.last;
    for (const p of e.samples) {
      this.sweep(from, p);
      from = p;
    }
    this.last = from;
  }

  onPointerUp(e: ToolPointerEvent): void {
    if (!this.last) return;
    this.sweep(this.last, e.world);
    const ids = [...this.marked];
    this.reset();
    if (ids.length) this.history.execute(new ReplaceStrokesCommand(this.doc, ids, []));
  }

  onPointerCancel(): void {
    if (!this.last && this.marked.size === 0) return;
    this.reset();
  }

  private reset(): void {
    const hadMarks = this.marked.size > 0;
    this.last = null;
    this.marked = new Set();
    if (hadMarks) this.onOverlayChange(true);
  }

  private sweep(a: Point, b: Point): void {
    const tolerance = this.radius / this.viewport.scale;
    let changed = false;
    for (const stroke of this.doc.strokes) {
      if (this.marked.has(stroke.id)) continue;
      if (segmentTouchesStroke(stroke, a, b, tolerance)) {
        this.marked.add(stroke.id);
        changed = true;
      }
    }
    if (changed) this.onOverlayChange(true);
  }
}
