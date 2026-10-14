import { removeItemsCommand, ReplaceShapesCommand, ReplaceStrokesCommand } from '../engine/commands';
import type { DrawingDocument, LayerBlock } from '../engine/document';
import type { Layered } from '../engine/doc-layers';
import { clamp, type Point } from '../engine/geometry';
import { combineCommands, type Command, type History } from '../engine/history';
import { segmentTouchesShape } from '../engine/shapes';
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
  /** Kapalıyken yalnızca etkin katman silinir. Kilitli / gizli katmana hiç dokunulmaz. */
  allLayers = false;

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

  setAllLayers(all: boolean): void {
    if (all === this.allLayers) return;
    this.allLayers = all;
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

/**
 * Sürükleme boyunca silgi hareketini parça parça ileten ortak iskelet.
 * Şekiller her iki türde de komple silinir: dokunulan şekil soluk
 * işaretlenir, bırakınca silinir.
 */
abstract class SweepingEraser implements Tool, ToolOverlay {
  readonly id = 'eraser';
  readonly cursor = 'none';
  private last: Point | null = null;
  protected markedShapes = new Set<string>();
  /** Etkin katman kilitli / gizliyken (yalnızca etkin katman kapsamında) nedeni bildirilir. */
  onLayerBlocked: ((reason: LayerBlock) => void) | null = null;

  /** Silgi bu nesneye dokunabilir mi: katmanı düzenlenebilir ve kapsamda. */
  protected erasable(item: Layered): boolean {
    if (!this.doc.isEditable(item)) return false;
    return this.settings.allLayers || this.doc.layerOf(item).id === this.doc.activeLayerId;
  }

  get fadedShapeIds(): ReadonlySet<string> {
    return this.markedShapes;
  }

  /** Dokunulan şekilleri işaretler; yeni işaret varsa true. */
  protected sweepShapes(a: Point, b: Point, radius: number): boolean {
    let changed = false;
    for (const shape of this.doc.shapes) {
      if (this.markedShapes.has(shape.id) || !this.erasable(shape)) continue;
      if (segmentTouchesShape(shape, a, b, radius)) {
        this.markedShapes.add(shape.id);
        changed = true;
      }
    }
    return changed;
  }

  /** İşaretli şekilleri silen komut (yoksa null); işaretler temizlenir. */
  protected takeShapeRemoval(): Command | null {
    const ids = [...this.markedShapes];
    this.markedShapes = new Set();
    return ids.length ? new ReplaceShapesCommand(this.doc, ids, []) : null;
  }

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
    const blocked = this.settings.allLayers ? null : this.doc.activeLayerBlocked;
    if (blocked) this.onLayerBlocked?.(blocked);
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
    this.markedShapes = new Set();
  }

  protected sweep(a: Point, b: Point, radius: number): void {
    let changed = this.sweepShapes(a, b, radius);
    for (const stroke of this.doc.strokes) {
      if (this.marked.has(stroke.id) || !this.erasable(stroke)) continue;
      if (segmentTouchesStroke(stroke, a, b, radius)) {
        this.marked.add(stroke.id);
        changed = true;
      }
    }
    if (changed) this.onOverlayChange(true);
  }

  protected commit(): void {
    const command = removeItemsCommand(this.doc, [...this.marked], [...this.markedShapes]);
    this.discard();
    if (command) this.history.execute(command);
  }

  protected discard(): void {
    const had = this.marked.size > 0 || this.markedShapes.size > 0;
    this.marked = new Set();
    this.markedShapes = new Set();
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
    this.markedShapes = new Set();
  }

  protected sweep(a: Point, b: Point, radius: number): void {
    let changed = false;
    // Şekil kısmen silinmez (köşe bilgisi bozulur): komple silinmek üzere işaretlenir
    const shapesChanged = this.sweepShapes(a, b, radius);
    for (const stroke of this.doc.strokes) {
      if (!this.erasable(stroke)) continue;
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
    if (changed) this.previewCache = [...this.pieces.values()].flat();
    if (changed || shapesChanged) this.onOverlayChange(true);
  }

  protected commit(): void {
    const pieces = this.pieces;
    const shapeRemoval = this.takeShapeRemoval();
    this.discard();
    const command = combineCommands(
      [this.strokeSplitCommand(pieces), shapeRemoval].filter((c): c is Command => c !== null),
    );
    if (command) this.history.execute(command);
  }

  /** Stroke'ları kalan parçalarıyla değiştiren komut (dokunulan stroke yoksa null). */
  private strokeSplitCommand(pieces: Map<string, Stroke[]>): Command | null {
    if (pieces.size === 0) return null;
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
    return new ReplaceStrokesCommand(
      this.doc,
      originals.map((o) => o.id),
      added,
    );
  }

  protected discard(): void {
    const had = this.pieces.size > 0 || this.markedShapes.size > 0;
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

  set onLayerBlocked(fn: ((reason: LayerBlock) => void) | null) {
    this.strokeEraser.onLayerBlocked = fn;
    this.pixelEraser.onLayerBlocked = fn;
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
