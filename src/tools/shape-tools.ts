import { addShapeCommand } from '../engine/commands';
import type { DrawingDocument } from '../engine/document';
import type { Point } from '../engine/geometry';
import { GRID_SNAP_PX, snapAlongLine, snapToGrid } from '../engine/grid';
import type { History } from '../engine/history';
import {
  newShapeId,
  rectVertices,
  SHAPE_KINDS,
  triangleVertices,
  type Shape,
  type ShapeKind,
} from '../engine/shapes';
import type { StrokeStyle } from '../engine/stroke';
import type { Viewport } from '../engine/viewport';
import { chooseLine, projectOnLine, undirectedAngle, type SnapLine } from '../perspective/snapping';
import type { GridSnapper } from './brush';
import type { Tool, ToolOverlay, ToolPointerEvent } from './tool';

/** Kenar yönü bir adaya bu açı içinde yaklaşınca ona oturur; bırakma açısı titreşmeyi önler. */
export const EDGE_SNAP_ANGLE = (8 * Math.PI) / 180;
export const EDGE_RELEASE_ANGLE = (12 * Math.PI) / 180;
/** Bundan kısa sürükleme / kenar şekil oluşturmaz, ekran pikseli. */
const MIN_SIZE_PX = 3;
/** Çokgende ilk köşeye bu kadar yakın tıklamak şekli kapatır, ekran pikseli. */
export const CLOSE_PX = 10;
/** Son köşeye bu kadar yakın tıklamak (çift tıklama) çokgeni bitirir, ekran pikseli. */
const REPEAT_PX = 4;
/** Kaçış noktasına bu kadar yakın başlayan kenar noktadan çıkan ışına oturabilir. */
const NEAR_POINT_PX = 10;

export class ShapeSettings {
  kind: ShapeKind = 'rect';
  private listeners = new Set<() => void>();

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setKind(kind: ShapeKind): void {
    if (kind === this.kind || !SHAPE_KINDS.includes(kind)) return;
    this.kind = kind;
    for (const fn of this.listeners) fn();
  }

  /** Sıradaki tür (kısayolla döngü). */
  cycle(): void {
    this.setKind(SHAPE_KINDS[(SHAPE_KINDS.indexOf(this.kind) + 1) % SHAPE_KINDS.length]);
  }
}

export interface ShapeSnapping {
  /**
   * Kenarın oturabileceği doğrular: `start`'tan geçen perspektif ışınları,
   * eksenler, ızgara çizgileri. Mıknatıs kapalıysa / Space basılıyken boş.
   */
  edgeCandidates(start: Point, nearPointRadius: number): SnapLine[];
  grid: GridSnapper;
}

/**
 * Şekil köşesi ve kenarı yapıştırma (şekil aracı ve seç/düzenle aracı ortak).
 * Bir kenar için oturulan doğruyu korur (titreşmesin diye); yeni kenarda `reset`.
 */
export class EdgeSnapper {
  /** Kenarın şu an oturduğu doğru. */
  line: SnapLine | null = null;

  constructor(
    private readonly viewport: Viewport,
    private readonly snapping: ShapeSnapping,
  ) {}

  reset(): void {
    this.line = null;
  }

  private get tolerance(): number {
    return GRID_SNAP_PX / this.viewport.scale;
  }

  /** Köşe: ızgara açıksa en yakın düğüme / çizgiye. */
  vertex(p: Point): Point {
    const grid = this.snapping.grid;
    return grid.isActive() ? snapToGrid(p, grid.spacing, this.tolerance).point : p;
  }

  /** `from`→`p` kenarının yönü bir adaya (kaçış ışını, eksen, ızgara çizgisi) yakınsa o doğru. */
  lineFor(from: Point, p: Point): SnapLine | null {
    const dx = p.x - from.x;
    const dy = p.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return this.line;
    const move = { x: dx / len, y: dy / len };
    const keep = this.line && undirectedAngle(move, this.line.direction) <= EDGE_RELEASE_ANGLE;
    if (!keep) {
      const candidates = this.snapping.edgeCandidates(from, NEAR_POINT_PX / this.viewport.scale);
      this.line = chooseLine(candidates, from, p, EDGE_SNAP_ANGLE);
    }
    return this.line;
  }

  /** Doğru üzerindeki nokta: ızgara açıksa doğrunun ızgara çizgisini kestiği yer. */
  onLine(line: SnapLine, p: Point): Point {
    const grid = this.snapping.grid;
    const onGrid = grid.isActive() ? snapAlongLine(line, p, grid.spacing, this.tolerance) : null;
    return onGrid ?? projectOnLine(line, p);
  }

  /** `from`'dan imlece giden kenarın ucu: oturduğu doğruya, yoksa ızgaraya. */
  edgeEnd(from: Point, p: Point): Point {
    if (Math.hypot(p.x - from.x, p.y - from.y) < 1e-9) return from;
    const line = this.lineFor(from, p);
    return line ? this.onLine(line, p) : this.vertex(p);
  }
}

/**
 * Şekil aracı: doğru parçası, dikdörtgen ve üçgen sürükleyerek; çokgen
 * tıklayarak çizilir (ilk köşeye tıkla, çift tıkla ya da Enter: bitir;
 * Backspace: son köşeyi geri al; Esc: vazgeç). Köşeler ızgaraya, kenarlar
 * (doğru parçası ve çokgen) kaçış ışınlarına / eksenlere / ızgara
 * çizgilerine yapışır. Stil fırçadan alınır (basınçsız).
 */
export class ShapeTool implements Tool, ToolOverlay {
  readonly id = 'shape';
  readonly cursor = 'crosshair';
  /** Sürüklenen şeklin başlangıç köşesi. */
  private dragStart: Point | null = null;
  private dragEnd: Point | null = null;
  /** Çizilmekte olan çokgenin köşeleri. */
  private polygon: Point[] | null = null;
  /** Çokgende imlecin (yapıştırılmış) konumu: sıradaki köşe adayı. */
  private hover: Point | null = null;
  /** Sıradaki kenarın yapıştırılması. */
  private readonly snap: EdgeSnapper;

  constructor(
    private readonly viewport: Viewport,
    private readonly doc: DrawingDocument,
    private readonly history: History,
    private readonly settings: ShapeSettings,
    private readonly style: () => StrokeStyle,
    snapping: ShapeSnapping,
    private readonly onPreviewChange: () => void,
  ) {
    this.snap = new EdgeSnapper(viewport, snapping);
  }

  get overlay(): ToolOverlay {
    return this;
  }

  /** Çokgen çizimi sürüyor mu (tıklamalar arasında). */
  get drawingPolygon(): boolean {
    return this.polygon !== null;
  }

  get snapLine(): SnapLine | null {
    return this.dragStart || this.polygon ? this.snap.line : null;
  }

  get previewShapeOpen(): boolean {
    return this.polygon !== null;
  }

  get previewShape(): Shape | null {
    const style = this.style();
    if (this.polygon) {
      const pts = this.hover ? [...this.polygon, this.hover] : this.polygon;
      if (pts.length < 2) return null;
      return this.makeShape('polygon', pts.flatMap((p) => [p.x, p.y]), style);
    }
    if (!this.dragStart || !this.dragEnd) return null;
    const vertices = this.dragVertices(this.dragStart, this.dragEnd);
    return vertices ? this.makeShape(this.settings.kind, vertices, style) : null;
  }

  deactivate(): void {
    this.cancel();
  }

  /** Süren çizimi bırakır (araç ya da tür değişimi). */
  cancel(): void {
    const had = this.dragStart || this.polygon;
    this.dragStart = null;
    this.dragEnd = null;
    this.polygon = null;
    this.hover = null;
    this.snap.reset();
    if (had) this.onPreviewChange();
  }

  /** Klavye: çokgende Enter / Backspace / Escape. İşlendiyse true. */
  handleKey(key: string): boolean {
    if (!this.polygon) return false;
    if (key === 'Enter') this.finishPolygon();
    else if (key === 'Escape') this.cancel();
    else if (key === 'Backspace') {
      this.polygon.pop();
      this.snap.reset();
      if (this.polygon.length === 0) this.cancel();
      else this.onPreviewChange();
    } else return false;
    return true;
  }

  onPointerDown(e: ToolPointerEvent): void {
    if (this.settings.kind === 'polygon') {
      this.updateHover(e.world);
      return;
    }
    this.dragStart = this.snap.vertex(e.world);
    this.dragEnd = this.dragStart;
    this.snap.reset();
    this.onPreviewChange();
  }

  onPointerMove(e: ToolPointerEvent): void {
    if (this.settings.kind === 'polygon') {
      if (this.polygon) this.updateHover(e.world);
      return;
    }
    if (!this.dragStart) return;
    this.dragEnd =
      this.settings.kind === 'segment'
        ? this.snap.edgeEnd(this.dragStart, e.world)
        : this.snap.vertex(e.world);
    this.onPreviewChange();
  }

  onPointerUp(e: ToolPointerEvent): void {
    if (this.settings.kind === 'polygon') {
      this.polygonClick(e.world);
      return;
    }
    const start = this.dragStart;
    if (!start) return;
    this.onPointerMove(e);
    const vertices = this.dragVertices(start, this.dragEnd!);
    this.dragStart = null;
    this.dragEnd = null;
    this.snap.reset();
    if (vertices) {
      const shape = this.makeShape(this.settings.kind, vertices, this.style());
      this.history.execute(addShapeCommand(this.doc, shape));
    }
    this.onPreviewChange();
  }

  onPointerCancel(): void {
    // Çokgen tıklamalar arasında sürer; yalnızca süren sürükleme bırakılır
    if (!this.dragStart) return;
    this.dragStart = null;
    this.dragEnd = null;
    this.snap.reset();
    this.onPreviewChange();
  }

  private makeShape(kind: ShapeKind, vertices: number[], style: StrokeStyle): Shape {
    return { id: newShapeId(), kind, vertices, style, cornerLines: true, layerId: this.doc.activeLayerId };
  }

  /** Sürüklemeden köşeler; şekil çok küçükse null. */
  private dragVertices(a: Point, b: Point): number[] | null {
    const minSize = MIN_SIZE_PX / this.viewport.scale;
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    switch (this.settings.kind) {
      case 'segment':
        return Math.hypot(w, h) >= minSize ? [a.x, a.y, b.x, b.y] : null;
      case 'rect':
        return w >= minSize && h >= minSize ? rectVertices(a, b) : null;
      case 'triangle':
        return w >= minSize && h >= minSize ? triangleVertices(a, b) : null;
      default:
        return null;
    }
  }

  private screenDistance(a: Point, b: Point): number {
    return Math.hypot(a.x - b.x, a.y - b.y) * this.viewport.scale;
  }

  private updateHover(p: Point): void {
    const pts = this.polygon;
    if (!pts) {
      this.hover = null;
      return;
    }
    // İlk köşeye yakınsa oraya oturur: tıklamak şekli kapatır
    if (pts.length >= 3 && this.screenDistance(p, pts[0]) <= CLOSE_PX) {
      this.hover = pts[0];
      this.snap.reset();
    } else {
      this.hover = this.snap.edgeEnd(pts[pts.length - 1], p);
    }
    this.onPreviewChange();
  }

  private polygonClick(p: Point): void {
    const pts = this.polygon;
    if (!pts) {
      this.polygon = [this.snap.vertex(p)];
      this.hover = null;
      this.snap.reset();
      this.onPreviewChange();
      return;
    }
    this.updateHover(p);
    const q = this.hover ?? p;
    if (pts.length >= 3 && q === pts[0]) {
      this.finishPolygon();
      return;
    }
    // Aynı yere ikinci tıklama (çift tıklama): bitir
    if (this.screenDistance(q, pts[pts.length - 1]) <= REPEAT_PX) {
      if (pts.length >= 3) this.finishPolygon();
      return;
    }
    pts.push(q);
    this.snap.reset();
    this.onPreviewChange();
  }

  private finishPolygon(): void {
    const pts = this.polygon;
    if (!pts) return;
    const style = this.style();
    this.cancel();
    if (pts.length >= 3) {
      const shape = this.makeShape('polygon', pts.flatMap((p) => [p.x, p.y]), style);
      this.history.execute(addShapeCommand(this.doc, shape));
    }
    this.onPreviewChange();
  }
}
