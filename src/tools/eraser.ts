import { removeItemsCommand, ReplaceShapesCommand, ReplaceStrokesCommand } from '../engine/commands';
import type { DrawingDocument, LayerBlock } from '../engine/document';
import type { Layered } from '../engine/doc-layers';
import { clamp, type Point } from '../engine/geometry';
import { combineCommands, type Command, type History } from '../engine/history';
import {
  segmentTouchesShape,
  touchedEdges,
  visibleRuns,
  withHiddenEdges,
  type Shape,
} from '../engine/shapes';
import type { Stroke } from '../engine/stroke';
import { segmentTouchesStroke } from '../engine/stroke-geometry';
import { eraseFromStroke } from '../engine/stroke-split';
import { cutPositions, polylineCutter, splitAtPositions, strokeCutter, type Cutter } from '../engine/stroke-cut';
import type { Viewport } from '../engine/viewport';
import type { Tool, ToolOverlay, ToolPointerEvent } from './tool';

export const ERASER_RADIUS_MIN = 2;
export const ERASER_RADIUS_MAX = 40;

/** segment: kesişimden kesişime parça · stroke: bütün çizgi · pixel: silginin geçtiği kısım */
export type EraserKind = 'segment' | 'stroke' | 'pixel';
export const ERASER_KINDS: readonly EraserKind[] = ['segment', 'stroke', 'pixel'];
/** Parça silgisinde bir çizginin ucu başka çizgiye bu kadar yakınsa (T birleşimi) kesim sayılır, ekran pikseli. */
export const JUNCTION_PX = 3;

/** İki silgi türünün ortak ayarları. Yarıçap ekran pikseli (yakınlaştırmadan bağımsız). */
export class EraserSettings {
  kind: EraserKind = 'segment';
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

  /** Sıradaki tür (E'ye tekrar basma). */
  cycleKind(): void {
    this.setKind(ERASER_KINDS[(ERASER_KINDS.indexOf(this.kind) + 1) % ERASER_KINDS.length]);
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
 * Şekiller: "bütün çizgi" türünde komple, parça ve kısmi türlerinde kenar
 * kenar silinir (`edgeMode`). Dokunulan şekil / kenar soluk işaretlenir,
 * bırakınca silinir; bütün kenarları silinen şekil kalkar.
 */
abstract class SweepingEraser implements Tool, ToolOverlay {
  readonly id = 'eraser';
  readonly cursor = 'none';
  private last: Point | null = null;
  protected markedShapes = new Set<string>();
  /** Şekil kimliği → silinmek üzere işaretli kenarlar (kenar kipi). */
  protected markedEdges = new Map<string, Set<number>>();
  /** Şekilleri kenar kenar mı siler. */
  protected get edgeMode(): boolean {
    return false;
  }

  get fadedShapeEdges(): ReadonlyMap<string, ReadonlySet<number>> {
    return this.markedEdges;
  }

  protected resetShapeMarks(): void {
    this.markedShapes = new Set();
    this.markedEdges = new Map();
  }

  protected get hasShapeMarks(): boolean {
    return this.markedShapes.size > 0 || this.markedEdges.size > 0;
  }

  /** Etkin katman kilitli / gizliyken (yalnızca etkin katman kapsamında) nedeni bildirilir. */
  onLayerBlocked: ((reason: LayerBlock) => void) | null = null;
  /** Bir silme uygulandı (bildirim için). */
  onErased: (() => void) | null = null;

  /** Silme komutunu uygular ve bildirir. */
  protected executeErase(command: Command | null): void {
    if (!command) return;
    this.history.execute(command);
    this.onErased?.();
  }

  /** Silgi bu nesneye dokunabilir mi: katmanı düzenlenebilir ve kapsamda. */
  protected erasable(item: Layered): boolean {
    if (!this.doc.isEditable(item)) return false;
    return this.settings.allLayers || this.doc.layerOf(item).id === this.doc.activeLayerId;
  }

  get fadedShapeIds(): ReadonlySet<string> {
    return this.markedShapes;
  }

  /** Dokunulan şekilleri (kenar kipinde kenarları) işaretler; yeni işaret varsa true. */
  protected sweepShapes(a: Point, b: Point, radius: number): boolean {
    let changed = false;
    for (const shape of this.doc.shapes) {
      if (this.markedShapes.has(shape.id) || !this.erasable(shape)) continue;
      if (!this.edgeMode) {
        if (segmentTouchesShape(shape, a, b, radius)) {
          this.markedShapes.add(shape.id);
          changed = true;
        }
        continue;
      }
      for (const edge of touchedEdges(shape, a, b, radius)) {
        let set = this.markedEdges.get(shape.id);
        if (!set) this.markedEdges.set(shape.id, (set = new Set()));
        if (!set.has(edge)) {
          set.add(edge);
          changed = true;
        }
      }
    }
    return changed;
  }

  /**
   * İşaretli şekilleri silen ya da kenarlarını gizleyen tek komut (yoksa null);
   * işaretler temizlenir. Bütün kenarları gizlenen şekil kalkar.
   */
  protected takeShapeRemoval(): Command | null {
    const removeIds = [...this.markedShapes];
    const added: { index: number; shape: Shape }[] = [];
    for (const [id, edges] of this.markedEdges) {
      const shape = this.doc.getShape(id);
      if (!shape) continue;
      removeIds.push(id);
      const next = withHiddenEdges(shape, edges);
      // Aynı kimlik ve sırayla geri konur: seçim ve köşe düzenleme sürer
      if (next) added.push({ index: this.doc.shapeIndexOf(id), shape: next });
    }
    this.resetShapeMarks();
    return removeIds.length ? new ReplaceShapesCommand(this.doc, removeIds, added) : null;
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
    this.resetShapeMarks();
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
    this.executeErase(command);
  }

  protected discard(): void {
    const had = this.marked.size > 0 || this.hasShapeMarks;
    this.marked = new Set();
    this.resetShapeMarks();
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
  protected override get edgeMode(): boolean {
    return true;
  }

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
    this.resetShapeMarks();
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
      [strokeSplitCommand(this.doc, pieces), shapeRemoval].filter((c): c is Command => c !== null),
    );
    this.executeErase(command);
  }

  protected discard(): void {
    const had = this.pieces.size > 0 || this.hasShapeMarks;
    this.begin();
    if (had) this.onOverlayChange(true);
  }
}

/**
 * Stroke'ları kalan parçalarıyla değiştiren tek komut (dokunulan stroke yoksa
 * null). Parçalar özgün stroke'un sırasına konur (üst üste binme sırası korunur).
 */
function strokeSplitCommand(doc: DrawingDocument, pieces: Map<string, Stroke[]>): Command | null {
  if (pieces.size === 0) return null;
  const originals = [...pieces.keys()]
    .map((id) => ({ id, index: doc.indexOf(id) }))
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
    doc,
    originals.map((o) => o.id),
    added,
  );
}

/**
 * Parça silgisi (varsayılan): dokunulan stroke, ekranda görünen diğer
 * çizgilerle (stroke'lar ve şekil kenarları, kilitli katmanlar dahil)
 * kesiştiği, ucu değdiği (T birleşimi) ve kendini kestiği yerlerden
 * parçalara ayrılır; yalnızca silginin değdiği parça silinir. Kesişimi
 * olmayan stroke bütünüyle silinir. Sürüklerken silinecek parçalar soluk,
 * kalanlar normal gösterilir; bırakınca tek komutla uygulanır.
 */
export class SegmentEraserTool extends SweepingEraser {
  protected override get edgeMode(): boolean {
    return true;
  }

  /** Özgün stroke kimliği → sıralı parçalar ve silinecek olanların sırası. */
  private parts = new Map<string, { pieces: Stroke[]; removed: Set<number> }>();
  private hidden = new Set<string>();
  private keptCache: Stroke[] = [];
  private removedCache: Stroke[] = [];
  /** Bu hareket boyunca kesiciler (görünür stroke'lar ve şekil kenarları); ilk gerektiğinde kurulur. */
  private cutters: Map<string, Cutter> | null = null;

  get hiddenStrokeIds(): ReadonlySet<string> {
    return this.hidden;
  }

  get previewStrokes(): readonly Stroke[] {
    return this.keptCache;
  }

  get fadedPreviewStrokes(): readonly Stroke[] {
    return this.removedCache;
  }

  protected begin(): void {
    this.parts = new Map();
    this.hidden = new Set();
    this.keptCache = [];
    this.removedCache = [];
    this.cutters = null;
    this.resetShapeMarks();
  }

  private cutterMap(): Map<string, Cutter> {
    if (this.cutters) return this.cutters;
    const map = new Map<string, Cutter>();
    for (const s of this.doc.strokes) {
      if (this.doc.isVisible(s) && s.points.length >= 4) map.set(s.id, strokeCutter(s));
    }
    for (const shape of this.doc.shapes) {
      if (!this.doc.isVisible(shape)) continue;
      // Silinmiş kenarlar kesici değildir
      visibleRuns(shape).forEach((run, k) => {
        map.set(`${shape.id}#${k}`, polylineCutter(run.points, run.closed, shape.style.width));
      });
    }
    this.cutters = map;
    return map;
  }

  /** Stroke'un kesişim parçaları (kendisi kesici sayılmaz; kendi kesişimleri ayrıca hesaplanır). */
  private piecesOf(stroke: Stroke): Stroke[] {
    const cutters = [...this.cutterMap()].filter(([id]) => id !== stroke.id).map(([, c]) => c);
    const cuts = cutPositions(stroke, cutters, JUNCTION_PX / this.viewport.scale);
    return splitAtPositions(stroke, cuts);
  }

  protected sweep(a: Point, b: Point, radius: number): void {
    let changed = this.sweepShapes(a, b, radius);
    for (const stroke of this.doc.strokes) {
      if (!this.erasable(stroke)) continue;
      let entry = this.parts.get(stroke.id);
      if (!entry) {
        if (!segmentTouchesStroke(stroke, a, b, radius)) continue;
        entry = { pieces: this.piecesOf(stroke), removed: new Set() };
        this.parts.set(stroke.id, entry);
        this.hidden.add(stroke.id);
      }
      entry.pieces.forEach((piece, i) => {
        if (!entry.removed.has(i) && segmentTouchesStroke(piece, a, b, radius)) {
          entry.removed.add(i);
          changed = true;
        }
      });
    }
    if (changed) {
      const entries = [...this.parts.values()];
      this.keptCache = entries.flatMap((e) => e.pieces.filter((_, i) => !e.removed.has(i)));
      this.removedCache = entries.flatMap((e) => e.pieces.filter((_, i) => e.removed.has(i)));
      this.onOverlayChange(true);
    }
  }

  protected commit(): void {
    const pieces = new Map<string, Stroke[]>();
    for (const [id, entry] of this.parts) {
      if (entry.removed.size) pieces.set(id, keptRuns(entry.pieces, entry.removed));
    }
    const shapeRemoval = this.takeShapeRemoval();
    this.discard();
    const command = combineCommands(
      [strokeSplitCommand(this.doc, pieces), shapeRemoval].filter((c): c is Command => c !== null),
    );
    this.executeErase(command);
  }

  protected discard(): void {
    const had = this.parts.size > 0 || this.hasShapeMarks;
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
  private readonly segmentEraser: SegmentEraserTool;
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
    this.segmentEraser = new SegmentEraserTool(viewport, doc, history, settings, onOverlayChange);
    this.active = this.current();
  }

  set onErased(fn: (() => void) | null) {
    this.strokeEraser.onErased = fn;
    this.pixelEraser.onErased = fn;
    this.segmentEraser.onErased = fn;
  }

  set onLayerBlocked(fn: ((reason: LayerBlock) => void) | null) {
    this.strokeEraser.onLayerBlocked = fn;
    this.pixelEraser.onLayerBlocked = fn;
    this.segmentEraser.onLayerBlocked = fn;
  }

  private current(): SweepingEraser {
    if (this.settings.kind === 'pixel') return this.pixelEraser;
    return this.settings.kind === 'segment' ? this.segmentEraser : this.strokeEraser;
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

/**
 * Silinmeyen ardışık parçaları yeniden birleştirir: çizgi yalnızca silinen
 * parçaların sınırlarında bölünmüş olur (gereksiz parça ve eklem oluşmaz).
 */
function keptRuns(pieces: readonly Stroke[], removed: ReadonlySet<number>): Stroke[] {
  const runs: Stroke[] = [];
  let current: Stroke | null = null;
  pieces.forEach((piece, i) => {
    if (removed.has(i)) {
      current = null;
      return;
    }
    if (!current) {
      current = { ...piece, points: [...piece.points] };
      if (piece.pressures) current.pressures = [...piece.pressures];
      runs.push(current);
      return;
    }
    // Komşu parçalar ortak uçla başlar: o nokta bir kez yazılır
    current.points.push(...piece.points.slice(2));
    if (current.pressures && piece.pressures) current.pressures.push(...piece.pressures.slice(1));
  });
  return runs;
}
