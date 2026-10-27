import { ReplaceShapesCommand, ReplaceStrokesCommand, UpdateShapeCommand } from '../engine/commands';
import { CompositeCommand } from '../engine/history';
import { newStrokeId, type Stroke } from '../engine/stroke';
import type { DrawingDocument } from '../engine/document';
import type { Point } from '../engine/geometry';
import type { History } from '../engine/history';
import {
  boxOccludedEdges,
  rebuildBox,
  rectToBox,
  segmentToBox,
  segmentTouchesShape,
  shapeEdges,
  shapeVertices,
  visibleEdges,
  visibleRuns,
  type Shape,
} from '../engine/shapes';
import type { Viewport } from '../engine/viewport';
import { distanceToLine, intersectLines, type SnapLine } from '../perspective/snapping';
import { EdgeSnapper, type ShapeSnapping } from './shape-tools';
import type { RotateHandle, Tool, ToolOverlay, ToolPointerEvent } from './tool';

/** Köşe tutamacını yakalama yarıçapı, ekran pikseli (parmakla daha geniş). */
export const HANDLE_HIT_PX = 10;
const HANDLE_HIT_TOUCH_PX = 20;
/** Şekle tıklama toleransı (kenardan), ekran pikseli (parmakla daha geniş). */
const SHAPE_HIT_PX = 6;
const SHAPE_HIT_TOUCH_PX = 14;
/** İki kenar doğrusunun kesişimi imlece bu kadar yakınsa köşe kesişime oturur. */
const INTERSECT_PX = 24;
/** Döndürme tutamacının şeklin üst kenarından uzaklığı, ekran pikseli. */
export const ROTATE_HANDLE_PX = 28;
/** Döndürme tutamacını yakalama yarıçapı, ekran pikseli (parmakla daha geniş). */
const ROTATE_HIT_PX = 9;
const ROTATE_HIT_TOUCH_PX = 20;
/** Dönüş 90°'nin katlarına bu kadar yaklaşınca oturur; Shift ile 15° adım. */
const ROTATE_SNAP = (3 * Math.PI) / 180;
const ROTATE_STEP = (15 * Math.PI) / 180;

type Drag =
  | {
      kind: 'vertex';
      original: Shape;
      index: number;
      /** Köşe ile tutulan nokta arası fark (köşe imlece sıçramasın; parmakta önemli). */
      offset: Point;
      /** Komşu köşe başına kenar yapıştırıcı (önceki, sonraki). */
      snappers: EdgeSnapper[];
    }
  | { kind: 'move'; original: Shape; grab: Point; snapper: EdgeSnapper }
  | {
      kind: 'rotate';
      original: Shape;
      /** Döndürme merkezi, dünya koordinatı. */
      pivot: Point;
      /** Başlangıçta merkezden imlece açı (ekran). */
      startAngle: number;
      /** Başlangıçta merkezden tutamaca (ekran) fark. */
      handleOffset: Point;
      /** O anki dönüş, radyan. */
      angle: number;
    };

/**
 * Seç / düzenle aracı:
 *  - şekle tıkla: seçilir, köşe tutamaçları görünür; boş alana tıkla: seçim kalkar
 *  - tutamacı sürükle: köşe taşınır (ızgara, kaçış ışını, eksen yapışması açık);
 *    dikdörtgende karşı köşe sabit kalır, şekil dikdörtgen kalarak yeniden boyutlanır
 *  - şeklin kenarını sürükle: şekil taşınır
 *  - üstteki yuvarlak tutamacı sürükle: şekil merkezi çevresinde döner (90°'ye
 *    hafif yapışır, Shift ile 15° adım; kutu kaçış noktasına bağlı olduğu için dönmez)
 *  - Delete / Backspace: seçili şekli siler (main.ts)
 * Her düzenleme tek adımda geri alınır.
 */
export class SelectTool implements Tool, ToolOverlay {
  readonly id = 'select';
  private selectedId: string | null = null;
  private drag: Drag | null = null;
  /** Sürüklenirken şeklin yeni hâli. */
  private draft: Shape | null = null;
  private hoverHandle: number | null = null;
  private hoverShape = false;
  private hoverRotate = false;
  /** `editSelected` dizisinin başındaki hâl (tek geri al adımı için). */
  private editOriginal: Shape | null = null;

  constructor(
    private readonly viewport: Viewport,
    private readonly doc: DrawingDocument,
    private readonly history: History,
    private readonly snapping: ShapeSnapping,
    /** Seçim, önizleme ya da imleç değişti. */
    private readonly onChange: () => void,
  ) {}

  get overlay(): ToolOverlay {
    return this;
  }

  /** Seçili şekil (belgeden kalktıysa ya da katmanı kilitlendi / gizlendiyse null). */
  get selected(): Shape | null {
    const shape = this.selectedId ? this.doc.getShape(this.selectedId) : undefined;
    return shape && this.doc.isEditable(shape) ? shape : null;
  }

  /** Seçili şekli başka katmana taşır (sırası korunur, geri alınabilir). */
  moveToLayer(layerId: string): void {
    const shape = this.selected;
    if (!shape || this.drag || !this.doc.getLayer(layerId) || this.doc.layerOf(shape).id === layerId) return;
    const index = this.doc.shapeIndexOf(shape.id);
    this.history.execute(new ReplaceShapesCommand(this.doc, [shape.id], [{ index, shape: { ...shape, layerId } }]));
    this.onChange();
  }

  get cursor(): string {
    if (this.drag) return 'grabbing';
    if (this.hoverHandle !== null || this.hoverRotate) return 'grab';
    return this.hoverShape ? 'move' : 'default';
  }

  get hiddenShapeIds(): ReadonlySet<string> | undefined {
    return this.draft ? new Set([this.draft.id]) : undefined;
  }

  get previewShape(): Shape | null {
    return this.draft;
  }

  get shapeHandles(): readonly Point[] | undefined {
    const shape = this.draft ?? this.selected;
    return shape ? shapeVertices(shape) : undefined;
  }

  /** Seçili şeklin döndürme tutamacı (kutuda yok). */
  get rotateHandle(): RotateHandle | null {
    const drag = this.drag;
    if (drag?.kind === 'rotate') {
      const pivot = this.viewport.worldToScreen(drag.pivot);
      const c = Math.cos(drag.angle);
      const s = Math.sin(drag.angle);
      const o = drag.handleOffset;
      const handle = { x: pivot.x + o.x * c - o.y * s, y: pivot.y + o.x * s + o.y * c };
      const degrees = Math.round((drag.angle * 180) / Math.PI);
      return { pivot, anchor: pivot, handle, active: true, degrees };
    }
    const shape = this.drag ? null : this.selected;
    if (!shape || !canRotate(shape)) return null;
    const pts = shapeVertices(shape).map((v) => this.viewport.worldToScreen(v));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const cx = (minX + maxX) / 2;
    return {
      pivot: { x: cx, y: (minY + maxY) / 2 },
      anchor: { x: cx, y: minY },
      handle: { x: cx, y: minY - ROTATE_HANDLE_PX },
      active: this.hoverRotate,
      degrees: null,
    };
  }

  get activeHandle(): number | null {
    if (this.drag?.kind === 'vertex') return this.drag.index;
    return this.hoverHandle;
  }

  get snapLine(): SnapLine | null {
    if (this.drag?.kind !== 'vertex') return null;
    return this.drag.snappers.find((s) => s.line)?.line ?? null;
  }

  deactivate(): void {
    this.drag = null;
    this.draft = null;
    this.hoverHandle = null;
    this.hoverShape = false;
    this.hoverRotate = false;
    this.select(null);
  }

  /** Seçimi değiştirir (null: seçimi kaldırır). */
  select(id: string | null): void {
    if (id === this.selectedId) return;
    this.selectedId = id;
    this.onChange();
  }

  /** Seçili şekli siler; silindiyse true. */
  deleteSelected(): boolean {
    const shape = this.selected;
    if (!shape || this.drag) return false;
    this.history.execute(new ReplaceShapesCommand(this.doc, [shape.id], []));
    this.select(null);
    return true;
  }

  /** Seçili şekli dünya biriminde kaydırır (klavye); kaydırıldıysa true. */
  nudge(dx: number, dy: number): boolean {
    const shape = this.selected;
    if (!shape || this.drag) return false;
    const index = this.doc.shapeIndexOf(shape.id);
    const vertices = shape.vertices.map((c, i) => c + (i % 2 ? dy : dx));
    this.history.execute(
      new ReplaceShapesCommand(this.doc, [shape.id], [{ index, shape: { ...shape, vertices } }]),
    );
    this.onChange();
    return true;
  }

  /** Seçili dikey doğru parçasını 2 noktalı kutuya dönüştürür (ilk nokta soldaki). */
  convertSegmentToBox(first: { id: string; x: number; y: number }, second: { id: string; x: number; y: number }): void {
    const shape = this.selected;
    if (!shape || shape.kind !== 'segment' || this.drag) return;
    this.history.execute(new UpdateShapeCommand(this.doc, shape, segmentToBox(shape, first, second)));
    this.onChange();
  }

  /**
   * Seçili şekli çizgilere dönüştürür (düzenlenemez): görünen kenarlar aynı
   * katmanda stroke olur; kutunun arkada kalan kenarları yalnızca "Görünür"
   * ayarında aktarılır (stroke kesikli olamaz). Tek adımda geri alınır.
   */
  convertToStrokes(): void {
    const shape = this.selected;
    if (!shape || this.drag) return;
    const strokes = shapeToStrokes(shape);
    const start = this.doc.strokes.length;
    this.history.execute(
      new CompositeCommand([
        new ReplaceShapesCommand(this.doc, [shape.id], []),
        new ReplaceStrokesCommand(
          this.doc,
          [],
          strokes.map((stroke, i) => ({ index: start + i, stroke })),
        ),
      ]),
    );
    this.select(null);
  }

  /** Seçili dikdörtgeni kutuya dönüştürür (aynı kimlik; geri alınabilir). */
  convertToBox(pointId: string, vp: Point): void {
    const shape = this.selected;
    if (!shape || shape.kind !== 'rect' || this.drag) return;
    this.history.execute(new UpdateShapeCommand(this.doc, shape, rectToBox(shape, pointId, vp)));
    this.onChange();
  }

  /**
   * Seçili şekli adım adım değiştirir (ör. derinlik kaydırıcısı): ara adımlar
   * doğrudan uygulanır, `final` gelince tek geri al adımı kaydedilir.
   */
  editSelected(update: (shape: Shape) => Shape, final: boolean): void {
    const shape = this.selected;
    if (!shape || this.drag) return;
    this.editOriginal ??= shape;
    const next = update(shape);
    const index = this.doc.shapeIndexOf(shape.id);
    if (next !== shape) this.doc.spliceShapes([shape.id], [{ index, shape: next }]);
    if (final) {
      const before = this.editOriginal;
      this.editOriginal = null;
      const after = this.doc.getShape(shape.id);
      if (after && after !== before) this.history.record(new UpdateShapeCommand(this.doc, before, after));
    }
    this.onChange();
  }

  /** Seçili şeklin köşe çizgilerini açar / kapatır (geri alınabilir). */
  setCornerLines(enabled: boolean): void {
    const shape = this.selected;
    if (!shape || shape.cornerLines === enabled || this.drag) return;
    const index = this.doc.shapeIndexOf(shape.id);
    this.history.execute(
      new ReplaceShapesCommand(this.doc, [shape.id], [{ index, shape: { ...shape, cornerLines: enabled } }]),
    );
    this.onChange();
  }

  onPointerDown(e: ToolPointerEvent): void {
    const touch = e.pointerType === 'touch';
    const selected = this.selected;
    const rotate = selected ? this.hitRotate(e.screen, touch) : null;
    if (selected && rotate) {
      this.drag = {
        kind: 'rotate',
        original: selected,
        pivot: this.viewport.screenToWorld(rotate.pivot),
        startAngle: Math.atan2(e.screen.y - rotate.pivot.y, e.screen.x - rotate.pivot.x),
        handleOffset: { x: rotate.handle.x - rotate.pivot.x, y: rotate.handle.y - rotate.pivot.y },
        angle: 0,
      };
      this.onChange();
      return;
    }
    const handle = selected ? this.hitHandle(selected, e.screen, touch) : null;
    if (selected && handle !== null) {
      const count = selected.vertices.length / 2;
      const neighbors =
        selected.kind === 'rect' || selected.kind === 'box' ? 0 : selected.kind === 'segment' ? 1 : 2;
      this.drag = {
        kind: 'vertex',
        original: selected,
        index: handle,
        offset: {
          x: selected.vertices[handle * 2] - e.world.x,
          y: selected.vertices[handle * 2 + 1] - e.world.y,
        },
        snappers: Array.from({ length: Math.min(neighbors, count - 1) }, () => this.newSnapper()),
      };
    } else {
      const hit = this.hitShape(e.world, touch);
      this.select(hit?.id ?? null);
      if (hit) this.drag = { kind: 'move', original: hit, grab: e.world, snapper: this.newSnapper() };
    }
    this.onChange();
  }

  onPointerMove(e: ToolPointerEvent): void {
    const drag = this.drag;
    if (!drag) {
      this.updateHover(e);
      return;
    }
    if (drag.kind === 'rotate') {
      this.draft = this.rotatedShape(drag, e);
      this.onChange();
      return;
    }
    this.draft =
      drag.kind === 'vertex'
        ? this.movedVertex(drag, { x: e.world.x + drag.offset.x, y: e.world.y + drag.offset.y })
        : this.movedShape(drag, e.world);
    this.onChange();
  }

  onPointerUp(e: ToolPointerEvent): void {
    if (!this.drag) return;
    this.onPointerMove(e);
    const draft = this.draft;
    const original = this.drag.original;
    this.drag = null;
    this.draft = null;
    if (draft && draft.vertices.some((v, i) => v !== original.vertices[i])) {
      const index = this.doc.shapeIndexOf(original.id);
      if (index >= 0) {
        // Aynı kimlikle aynı sıraya: seçim geri al / ileri al boyunca korunur
        this.history.execute(new ReplaceShapesCommand(this.doc, [original.id], [{ index, shape: draft }]));
      }
    }
    this.updateHover(e);
    this.onChange();
  }

  onPointerCancel(): void {
    if (!this.drag) return;
    this.drag = null;
    this.draft = null;
    this.onChange();
  }

  private newSnapper(): EdgeSnapper {
    return new EdgeSnapper(this.viewport, this.snapping);
  }

  private updateHover(e: ToolPointerEvent): void {
    const selected = this.selected;
    const rotate = selected ? this.hitRotate(e.screen) !== null : false;
    const handle = selected && !rotate ? this.hitHandle(selected, e.screen) : null;
    const overShape = !rotate && handle === null && this.hitShape(e.world) !== null;
    if (handle === this.hoverHandle && overShape === this.hoverShape && rotate === this.hoverRotate) return;
    this.hoverHandle = handle;
    this.hoverShape = overShape;
    this.hoverRotate = rotate;
    this.onChange();
  }

  /** İmleç döndürme tutamacının üstündeyse tutamaç (yoksa null). */
  private hitRotate(screen: Point, touch = false): RotateHandle | null {
    const r = this.rotateHandle;
    if (!r) return null;
    const d = Math.hypot(r.handle.x - screen.x, r.handle.y - screen.y);
    return d <= (touch ? ROTATE_HIT_TOUCH_PX : ROTATE_HIT_PX) ? r : null;
  }

  /** Şekil, merkez çevresinde imlecin döndüğü kadar döner (90°'ye yapışma, Shift: 15° adım). */
  private rotatedShape(drag: Extract<Drag, { kind: 'rotate' }>, e: ToolPointerEvent): Shape {
    const pivot = this.viewport.worldToScreen(drag.pivot);
    let angle = Math.atan2(e.screen.y - pivot.y, e.screen.x - pivot.x) - drag.startAngle;
    // -π..π aralığına
    angle = Math.atan2(Math.sin(angle), Math.cos(angle));
    if (e.native?.shiftKey) {
      angle = Math.round(angle / ROTATE_STEP) * ROTATE_STEP;
    } else {
      const right = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
      if (Math.abs(angle - right) <= ROTATE_SNAP) angle = right;
    }
    drag.angle = angle;
    return rotateShape(drag.original, drag.pivot, angle);
  }

  private hitHandle(shape: Shape, screen: Point, touch = false): number | null {
    let best: number | null = null;
    let bestDist = touch ? HANDLE_HIT_TOUCH_PX : HANDLE_HIT_PX;
    shapeVertices(shape).forEach((v, i) => {
      const s = this.viewport.worldToScreen(v);
      const d = Math.hypot(s.x - screen.x, s.y - screen.y);
      if (d <= bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }

  /** Noktanın altındaki en üstteki şekil (kenarına yakınlıkla). */
  private hitShape(world: Point, touch = false): Shape | null {
    const tolerance = (touch ? SHAPE_HIT_TOUCH_PX : SHAPE_HIT_PX) / this.viewport.scale;
    const shapes = this.doc.shapes;
    for (let i = shapes.length - 1; i >= 0; i--) {
      // Kilitli ya da gizli katmandaki şekil seçilemez
      if (!this.doc.isEditable(shapes[i])) continue;
      if (segmentTouchesShape(shapes[i], world, world, tolerance)) return shapes[i];
    }
    return null;
  }

  private movedShape(drag: Extract<Drag, { kind: 'move' }>, p: Point): Shape {
    const v = drag.original.vertices;
    let dx = p.x - drag.grab.x;
    let dy = p.y - drag.grab.y;
    // Izgara açıksa ilk köşe ızgaraya oturacak kadar düzeltilir
    const first = { x: v[0] + dx, y: v[1] + dy };
    const snapped = drag.snapper.vertex(first);
    dx += snapped.x - first.x;
    dy += snapped.y - first.y;
    const moved = v.map((c, i) => c + (i % 2 ? dy : dx));
    // Kutu: ön yüz taşınır, arka yüz kaçış noktasına göre yeniden hesaplanır
    if (drag.original.kind === 'box') return rebuildBox(drag.original, {}, moved);
    return { ...drag.original, vertices: moved };
  }

  /**
   * 2 noktalı kutu: ön uçlar (0, 4) yüksekliği değiştirir (kenar dikey kalır),
   * yan köşeler o yöndeki derinliği, arka köşeler (2, 6) iki derinliği birden.
   */
  private movedTwoPointBox(original: Shape, index: number, p: Point): Shape {
    const box = original.box!;
    const second = box.second!;
    const v = original.vertices;
    const a = { x: v[0], y: v[1] };
    const b = { x: v[8], y: v[9] };
    const base = index < 4 ? a : b;
    /** `x`'ten `vp`'ye giden doğru üzerindeki `q` noktasının oranı. */
    const ratio = (x: Point, vp: Point, q: Point) => {
      const dx = vp.x - x.x;
      const dy = vp.y - x.y;
      const len2 = dx * dx + dy * dy;
      return len2 > 0 ? ((q.x - x.x) * dx + (q.y - x.y) * dy) / len2 : 0;
    };
    switch (index % 4) {
      case 0: {
        // Ön uç: yalnızca yükseklik (x kenar boyunca sabit)
        const y = this.newSnapper().vertex(p).y;
        const next = [...v];
        next[index === 0 ? 1 : 9] = y;
        return rebuildBox(original, {}, next);
      }
      case 1:
        return rebuildBox(original, { depth: ratio(base, box.vp, p) });
      case 3:
        return rebuildBox(original, { second: { ...second, depth: ratio(base, second.vp, p) } });
      default: {
        // Arka köşe: imleç iki yandaki doğruların kesişimi olacak şekilde iki derinlik
        const t1 = crossRatio(base, box.vp, second.vp, p);
        const t2 = crossRatio(base, second.vp, box.vp, p);
        return rebuildBox(original, {
          depth: t1 ?? box.depth,
          second: { ...second, depth: t2 ?? second.depth },
        });
      }
    }
  }

  /**
   * Dikdörtgen köşesi: karşı köşe sabit; komşular sürüklenen köşeyle paylaştıkları
   * kenar doğrultusunu izler. Kenarlar kendi doğrultularında kalır (döndürülmüş
   * dikdörtgen de dikdörtgen kalır): köşe yalnızca ızgaraya yapışır.
   */
  private resizedRect(pts: Point[], index: number, p: Point): number[] {
    const corner = this.newSnapper().vertex(p);
    const opposite = pts[(index + 2) % 4];
    const next = pts.map((q) => ({ ...q }));
    next[index] = corner;
    const neighbors = [(index + 1) % 4, (index + 3) % 4];
    // Kenar doğrultuları: karşı köşeden komşulara (çökmüş dikdörtgende eksenler)
    const dirs = neighbors.map((j) => {
      const dx = pts[j].x - opposite.x;
      const dy = pts[j].y - opposite.y;
      const len = Math.hypot(dx, dy);
      return len > 1e-9 ? { x: dx / len, y: dy / len } : null;
    });
    if (!dirs[0] && !dirs[1]) {
      dirs[0] = { x: 1, y: 0 };
      dirs[1] = { x: 0, y: 1 };
    } else if (!dirs[0]) dirs[0] = { x: -dirs[1]!.y, y: dirs[1]!.x };
    else if (!dirs[1]) dirs[1] = { x: -dirs[0].y, y: dirs[0].x };
    neighbors.forEach((j, k) => {
      const d = dirs[k]!;
      const t = (corner.x - opposite.x) * d.x + (corner.y - opposite.y) * d.y;
      next[j] = { x: opposite.x + d.x * t, y: opposite.y + d.y * t };
    });
    return next.flatMap((q) => [q.x, q.y]);
  }

  private movedVertex(drag: Extract<Drag, { kind: 'vertex' }>, p: Point): Shape {
    const { original, index } = drag;
    const pts = shapeVertices(original);
    const n = pts.length;

    if (original.kind === 'box' && original.box?.second) return this.movedTwoPointBox(original, index, p);

    if (original.kind === 'box' && original.box) {
      if (index >= 4) {
        // Arka köşe: derinlik, köşeden kaçış noktasına giden doğru üzerinde
        const f = pts[index - 4];
        const vp = original.box.vp;
        const dx = vp.x - f.x;
        const dy = vp.y - f.y;
        const len2 = dx * dx + dy * dy;
        const depth = len2 > 0 ? ((p.x - f.x) * dx + (p.y - f.y) * dy) / len2 : original.box.depth;
        return rebuildBox(original, { depth });
      }
      // Ön köşe: dikdörtgen gibi yeniden boyutlanır, arka yüz izler
      return rebuildBox(original, {}, this.resizedRect(pts.slice(0, 4), index, p));
    }

    if (original.kind === 'rect') {
      return { ...original, vertices: this.resizedRect(pts, index, p) };
    }

    const neighbors =
      original.kind === 'segment' ? [pts[1 - index]] : [pts[(index - 1 + n) % n], pts[(index + 1) % n]];
    const lines = neighbors
      .map((from, k) => drag.snappers[k]?.lineFor(from, p) ?? null)
      .filter((l): l is SnapLine => l !== null);
    const snapper = drag.snappers[0];
    let corner: Point;
    if (lines.length === 2) {
      const x = intersectLines(lines[0], lines[1]);
      const near = x && Math.hypot(x.x - p.x, x.y - p.y) * this.viewport.scale <= INTERSECT_PX;
      if (x && near) corner = x;
      else {
        const closer = distanceToLine(lines[0], p) <= distanceToLine(lines[1], p) ? lines[0] : lines[1];
        corner = snapper.onLine(closer, p);
      }
    } else if (lines.length === 1) {
      corner = snapper.onLine(lines[0], p);
    } else {
      corner = snapper.vertex(p);
    }
    const vertices = [...original.vertices];
    vertices[index * 2] = corner.x;
    vertices[index * 2 + 1] = corner.y;
    return { ...original, vertices };
  }
}

/** Kutu kaçış noktasına bağlı (döndürülünce perspektif bozulur): dönmez. */
export function canRotate(shape: Shape): boolean {
  return shape.kind !== 'box';
}

/** Şeklin köşelerini `pivot` çevresinde `angle` radyan döndürür. */
export function rotateShape(shape: Shape, pivot: Point, angle: number): Shape {
  if (angle === 0) return shape;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const v = shape.vertices;
  const vertices: number[] = [];
  for (let i = 0; i < v.length; i += 2) {
    const dx = v[i] - pivot.x;
    const dy = v[i + 1] - pivot.y;
    vertices.push(pivot.x + dx * c - dy * s, pivot.y + dx * s + dy * c);
  }
  return { ...shape, vertices };
}

/**
 * `base`'den `vpA`'ya giden doğru ile `vpB`'den `p`'ye giden doğrunun
 * kesişiminin, ilk doğru üzerindeki oranı (paralelse null).
 */
function crossRatio(base: Point, vpA: Point, vpB: Point, p: Point): number | null {
  const d = { x: vpA.x - base.x, y: vpA.y - base.y };
  const e = { x: p.x - vpB.x, y: p.y - vpB.y };
  const den = d.x * e.y - d.y * e.x;
  if (Math.abs(den) < 1e-9) return null;
  return ((vpB.x - base.x) * e.y - (vpB.y - base.y) * e.x) / den;
}

/** Şeklin görünen kenarlarından stroke'lar (bkz. `SelectTool.convertToStrokes`). */
export function shapeToStrokes(shape: Shape): Stroke[] {
  const make = (pts: Point[]): Stroke => {
    const stroke: Stroke = { id: newStrokeId(), points: pts.flatMap((q) => [q.x, q.y]), style: { ...shape.style } };
    if (shape.layerId) stroke.layerId = shape.layerId;
    return stroke;
  };
  if (shape.kind === 'box') {
    // Kutu kenarları ayrı ayrı; arkada kalanlar yalnızca "Görünür" ayarında
    const occluded = shape.box?.back === 'solid' ? new Set<number>() : boxOccludedEdges(shape);
    const edges = shapeEdges(shape);
    return visibleEdges(shape)
      .filter((e) => !occluded.has(e.index))
      .map((e) => make([edges[e.index][0], edges[e.index][1]]));
  }
  // Ardışık kenarlar tek çizgi (köşeler keskin kalsın diye iki noktalı parçalar halinde)
  return visibleRuns(shape).flatMap((run) => {
    const pts = run.closed ? [...run.points, run.points[0]] : run.points;
    return pts.slice(1).map((q, i) => make([pts[i], q]));
  });
}
