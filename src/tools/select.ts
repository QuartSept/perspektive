import { ReplaceShapesCommand } from '../engine/commands';
import type { DrawingDocument } from '../engine/document';
import type { Point } from '../engine/geometry';
import type { History } from '../engine/history';
import { segmentTouchesShape, shapeVertices, type Shape } from '../engine/shapes';
import type { Viewport } from '../engine/viewport';
import { distanceToLine, intersectLines, type SnapLine } from '../perspective/snapping';
import { EdgeSnapper, type ShapeSnapping } from './shape-tools';
import type { Tool, ToolOverlay, ToolPointerEvent } from './tool';

/** Köşe tutamacını yakalama yarıçapı, ekran pikseli. */
export const HANDLE_HIT_PX = 10;
/** Şekle tıklama toleransı (kenardan), ekran pikseli. */
const SHAPE_HIT_PX = 6;
/** İki kenar doğrusunun kesişimi imlece bu kadar yakınsa köşe kesişime oturur. */
const INTERSECT_PX = 24;

type Drag =
  | {
      kind: 'vertex';
      original: Shape;
      index: number;
      /** Komşu köşe başına kenar yapıştırıcı (önceki, sonraki). */
      snappers: EdgeSnapper[];
    }
  | { kind: 'move'; original: Shape; grab: Point; snapper: EdgeSnapper };

/**
 * Seç / düzenle aracı:
 *  - şekle tıkla: seçilir, köşe tutamaçları görünür; boş alana tıkla: seçim kalkar
 *  - tutamacı sürükle: köşe taşınır (ızgara, kaçış ışını, eksen yapışması açık);
 *    dikdörtgende karşı köşe sabit kalır, şekil dikdörtgen kalarak yeniden boyutlanır
 *  - şeklin kenarını sürükle: şekil taşınır
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

  /** Seçili şekil (geri alma vb. ile belgeden kalktıysa null). */
  get selected(): Shape | null {
    return this.selectedId ? (this.doc.getShape(this.selectedId) ?? null) : null;
  }

  get cursor(): string {
    if (this.drag) return 'grabbing';
    if (this.hoverHandle !== null) return 'grab';
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

  onPointerDown(e: ToolPointerEvent): void {
    const selected = this.selected;
    const handle = selected ? this.hitHandle(selected, e.screen) : null;
    if (selected && handle !== null) {
      const count = selected.vertices.length / 2;
      const neighbors = selected.kind === 'rect' ? 0 : selected.kind === 'segment' ? 1 : 2;
      this.drag = {
        kind: 'vertex',
        original: selected,
        index: handle,
        snappers: Array.from({ length: Math.min(neighbors, count - 1) }, () => this.newSnapper()),
      };
    } else {
      const hit = this.hitShape(e.world);
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
    this.draft =
      drag.kind === 'vertex' ? this.movedVertex(drag, e.world) : this.movedShape(drag, e.world);
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
    const handle = selected ? this.hitHandle(selected, e.screen) : null;
    const overShape = handle === null && this.hitShape(e.world) !== null;
    if (handle === this.hoverHandle && overShape === this.hoverShape) return;
    this.hoverHandle = handle;
    this.hoverShape = overShape;
    this.onChange();
  }

  private hitHandle(shape: Shape, screen: Point): number | null {
    let best: number | null = null;
    let bestDist = HANDLE_HIT_PX;
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
  private hitShape(world: Point): Shape | null {
    const tolerance = SHAPE_HIT_PX / this.viewport.scale;
    const shapes = this.doc.shapes;
    for (let i = shapes.length - 1; i >= 0; i--) {
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
    return { ...drag.original, vertices: v.map((c, i) => c + (i % 2 ? dy : dx)) };
  }

  private movedVertex(drag: Extract<Drag, { kind: 'vertex' }>, p: Point): Shape {
    const { original, index } = drag;
    const pts = shapeVertices(original);
    const n = pts.length;

    if (original.kind === 'rect') {
      // Karşı köşe sabit; komşular sürüklenen köşeyle paylaştıkları koordinatı izler.
      // Kenarlar eksenlere paralel kalır: köşe yalnızca ızgaraya yapışır.
      const corner = this.newSnapper().vertex(p);
      const opposite = pts[(index + 2) % 4];
      const next = pts.map((q) => ({ ...q }));
      next[index] = corner;
      for (const j of [(index + 1) % 4, (index + 3) % 4]) {
        const sharesX = Math.abs(pts[j].x - pts[index].x) <= Math.abs(pts[j].y - pts[index].y);
        next[j] = sharesX ? { x: corner.x, y: opposite.y } : { x: opposite.x, y: corner.y };
      }
      return { ...original, vertices: next.flatMap((q) => [q.x, q.y]) };
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
