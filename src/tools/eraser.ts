import { ReplaceStrokesCommand } from '../engine/commands';
import type { DrawingDocument } from '../engine/document';
import { clamp, type Point } from '../engine/geometry';
import type { History } from '../engine/history';
import type { Stroke } from '../engine/stroke';
import { segmentTouchesStroke } from '../engine/stroke-geometry';
import { eraseFromStroke } from '../engine/stroke-split';
import type { Viewport } from '../engine/viewport';
import type { Tool, ToolOverlay, ToolPointerEvent } from './tool';

export const ERASER_RADIUS_MIN = 2;
export const ERASER_RADIUS_MAX = 40;

export type EraserKind = 'stroke' | 'pixel';
export const ERASER_KINDS: readonly EraserKind[] = ['stroke', 'pixel'];

/** İki silgi türünün ortak ayarları. Yarıçap ekran pikseli (yakınlaştırmadan bağımsız). */
export class EraserSettings {
  kind: EraserKind = 'stroke';
  radius = 8;

  private listeners = new Set<() => void>();

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  setKind(kind: EraserKind): void {
    if (kind === this.kind) return;
    this.kind = kind;
    this.emit();
  }

  setRadius(radius: number): void {
    const next = clamp(Math.round(radius), ERASER_RADIUS_MIN, ERASER_RADIUS_MAX);
    if (next === this.radius) return;
    this.radius = next;
    this.emit();
  }

  stepRadius(direction: 1 | -1): void {
    this.setRadius(this.radius + direction * (this.radius < 10 ? 1 : 2));
  }
}

/** Sürükleme boyunca silgi hareketini parça parça ileten ortak iskelet. */
abstract class SweepingEraser implements Tool, ToolOverlay {
  readonly id = 'eraser';
  readonly cursor = 'none';
  private last: Point | null = null;

  constructor(
    protected readonly viewport: Viewport,
    protected readonly doc: DrawingDocument,
    protected readonly history: History,
    protected readonly settings: EraserSettings,
    protected readonly onOverlayChange: (strokesChanged: boolean) => void,
  ) {}

  get overlay(): ToolOverlay {
    return this;
  }

  get cursorRadius(): number {
    return this.settings.radius;
  }

  deactivate(): void {
    this.onPointerCancel();
  }

  onPointerDown(e: ToolPointerEvent): void {
    this.begin();
    this.last = e.world;
    this.sweep(e.world, e.world, this.settings.radius / this.viewport.scale);
  }

  onPointerMove(e: ToolPointerEvent): void {
    if (!this.last) return;
    const radius = this.settings.radius / this.viewport.scale;
    let from = this.last;
    for (const p of e.samples) {
      this.sweep(from, p, radius);
      from = p;
    }
    this.last = from;
  }

  onPointerUp(e: ToolPointerEvent): void {
    if (!this.last) return;
    this.sweep(this.last, e.world, this.settings.radius / this.viewport.scale);
    this.last = null;
    this.commit();
  }

  onPointerCancel(): void {
    this.last = null;
    this.discard();
  }

  protected abstract begin(): void;
  protected abstract sweep(a: Point, b: Point, radius: number): void;
  protected abstract commit(): void;
  protected abstract discard(): void;
}

/**
 * Stroke silgisi: sürüklerken dokunulan stroke'lar komple silinmek üzere
 * işaretlenir (soluk görünür), bırakınca tek komutla silinir.
 */
export class StrokeEraserTool extends SweepingEraser {
  private marked = new Set<string>();

  get fadedStrokeIds(): ReadonlySet<string> {
    return this.marked;
  }

  protected begin(): void {
    this.marked = new Set();
  }

  protected sweep(a: Point, b: Point, radius: number): void {
    let changed = false;
    for (const stroke of this.doc.strokes) {
      if (this.marked.has(stroke.id)) continue;
      if (segmentTouchesStroke(stroke, a, b, radius)) {
        this.marked.add(stroke.id);
        changed = true;
      }
    }
    if (changed) this.onOverlayChange(true);
  }

  protected commit(): void {
    const ids = [...this.marked];
    this.discard();
    if (ids.length) this.history.execute(new ReplaceStrokesCommand(this.doc, ids, []));
  }

  protected discard(): void {
    const had = this.marked.size > 0;
    this.marked = new Set();
    if (had) this.onOverlayChange(true);
  }
}

/**
 * Piksel silgisi: yalnızca silginin geçtiği kısım silinir, stroke parçalara
 * bölünür. Sürüklerken etkilenen stroke'lar gizlenir, kalan parçaları
 * önizlenir; bırakınca tek ReplaceStrokesCommand ("bir stroke'u N parçayla
 * değiştir") olarak uygulanır.
 */
export class PixelEraserTool extends SweepingEraser {
  /** Özgün stroke kimliği → şu anki kalan parçaları. */
  private pieces = new Map<string, Stroke[]>();
  private hidden = new Set<string>();
  private previewCache: Stroke[] = [];

  get hiddenStrokeIds(): ReadonlySet<string> {
    return this.hidden;
  }

  get previewStrokes(): readonly Stroke[] {
    return this.previewCache;
  }

  protected begin(): void {
    this.pieces = new Map();
    this.hidden = new Set();
    this.previewCache = [];
  }

  protected sweep(a: Point, b: Point, radius: number): void {
    let changed = false;
    for (const stroke of this.doc.strokes) {
      const current = this.pieces.get(stroke.id) ?? [stroke];
      let touched = false;
      const next: Stroke[] = [];
      for (const piece of current) {
        const result = eraseFromStroke(piece, a, b, radius);
        if (result === null) next.push(piece);
        else {
          touched = true;
          next.push(...result);
        }
      }
      if (touched) {
        this.pieces.set(stroke.id, next);
        this.hidden.add(stroke.id);
        changed = true;
      }
    }
    if (changed) {
      this.previewCache = [...this.pieces.values()].flat();
      this.onOverlayChange(true);
    }
  }

  protected commit(): void {
    const pieces = this.pieces;
    this.discard();
    if (pieces.size === 0) return;
    // Parçalar özgün stroke'un sırasına konur (üst üste binme sırası korunur)
    const originals = [...pieces.keys()]
      .map((id) => ({ id, index: this.doc.indexOf(id) }))
      .filter((o) => o.index >= 0)
      .sort((x, y) => x.index - y.index);
    const added: { index: number; stroke: Stroke }[] = [];
    let inserted = 0;
    originals.forEach((o, j) => {
      const ps = pieces.get(o.id)!;
      ps.forEach((stroke, k) => added.push({ index: o.index - j + inserted + k, stroke }));
      inserted += ps.length;
    });
    this.history.execute(
      new ReplaceStrokesCommand(
        this.doc,
        originals.map((o) => o.id),
        added,
      ),
    );
  }

  protected discard(): void {
    const had = this.pieces.size > 0;
    this.begin();
    if (had) this.onOverlayChange(true);
  }
}

/**
 * Araç çubuğundaki tek silgi düğmesi: ayardaki türe göre stroke ya da piksel
 * silgisine yönlendirir. Tür sürükleme sırasında değişmez.
 */
export class EraserTool implements Tool {
  readonly id = 'eraser';
  readonly cursor = 'none';
  private readonly strokeEraser: StrokeEraserTool;
  private readonly pixelEraser: PixelEraserTool;
  private active: SweepingEraser;

  constructor(
    viewport: Viewport,
    doc: DrawingDocument,
    history: History,
    private readonly settings: EraserSettings,
    onOverlayChange: (strokesChanged: boolean) => void,
  ) {
    this.strokeEraser = new StrokeEraserTool(viewport, doc, history, settings, onOverlayChange);
    this.pixelEraser = new PixelEraserTool(viewport, doc, history, settings, onOverlayChange);
    this.active = this.current();
  }

  private current(): SweepingEraser {
    return this.settings.kind === 'pixel' ? this.pixelEraser : this.strokeEraser;
  }

  get overlay(): ToolOverlay {
    return this.active.overlay;
  }

  deactivate(): void {
    this.active.deactivate();
  }

  onPointerDown(e: ToolPointerEvent): void {
    this.active = this.current();
    this.active.onPointerDown(e);
  }

  onPointerMove(e: ToolPointerEvent): void {
    this.active.onPointerMove(e);
  }

  onPointerUp(e: ToolPointerEvent): void {
    this.active.onPointerUp(e);
  }

  onPointerCancel(): void {
    this.active.onPointerCancel();
  }
}
