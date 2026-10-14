import type { Point, Rect } from './geometry';
import type { StrokeStyle } from './stroke';
import { segmentDistance } from './stroke-geometry';

/**
 * Düzenlenebilir geometrik şekiller (V3). Köşe bilgisi korunur; ekranda,
 * çıktılarda ve silgide kenarlardan oluşan düz bir çizgi olarak ele alınır.
 */
export const SHAPE_KINDS = ['segment', 'rect', 'triangle', 'polygon'] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

export interface Shape {
  id: string;
  kind: ShapeKind;
  /** Köşeler, düz dizi: [x0, y0, x1, y1, ...] dünya koordinatı. */
  vertices: number[];
  style: StrokeStyle;
  /** Bu şeklin köşelerinden kaçış noktalarına kılavuz çizgi çizilsin mi. */
  cornerLines: boolean;
  /** Katman kimliği (yoksa ya da bilinmiyorsa en alttaki katman). */
  layerId?: string;
}

export const newShapeId = (): string => `h-${Math.random().toString(36).slice(2, 10)}`;

/** Türün geçerli köşe sayısı aralığı. */
export function vertexCountRange(kind: ShapeKind): [min: number, max: number] {
  switch (kind) {
    case 'segment':
      return [2, 2];
    case 'rect':
      return [4, 4];
    case 'triangle':
      return [3, 3];
    case 'polygon':
      return [3, Infinity];
  }
}

/** Doğru parçası dışındaki şekiller kapalıdır (son köşe ilkine bağlanır). */
export function isClosed(kind: ShapeKind): boolean {
  return kind !== 'segment';
}

export function shapeVertices(shape: Shape): Point[] {
  const v = shape.vertices;
  const out: Point[] = [];
  for (let i = 0; i + 1 < v.length; i += 2) out.push({ x: v[i], y: v[i + 1] });
  return out;
}

/** İki köşeden eksenlere paralel dikdörtgen: köşeler saat yönünde, `a`'dan başlar. */
export function rectVertices(a: Point, b: Point): number[] {
  return [a.x, a.y, b.x, a.y, b.x, b.y, a.x, b.y];
}

/** Sürüklenen kutuya oturan ikizkenar üçgen: tepe üst kenarın ortasında. */
export function triangleVertices(a: Point, b: Point): number[] {
  const left = Math.min(a.x, b.x);
  const right = Math.max(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const bottom = Math.max(a.y, b.y);
  return [(left + right) / 2, top, right, bottom, left, bottom];
}

const boundsCache = new WeakMap<Shape, Rect>();

/** Köşe sınırları (kalınlık hariç). Belgedeki şekiller değiştirilmez; önbelleğe alınır. */
export function shapeBounds(shape: Shape): Rect {
  const cached = boundsCache.get(shape);
  if (cached) return cached;
  const v = shape.vertices;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < v.length; i += 2) {
    minX = Math.min(minX, v[i]);
    maxX = Math.max(maxX, v[i]);
    minY = Math.min(minY, v[i + 1]);
    maxY = Math.max(maxY, v[i + 1]);
  }
  const rect = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  boundsCache.set(shape, rect);
  return rect;
}

/** Kenarlar (kapalı şekilde son köşeden ilkine giden kenar dahil). */
export function shapeEdges(shape: Shape, closed = isClosed(shape.kind)): [Point, Point][] {
  const pts = shapeVertices(shape);
  const edges: [Point, Point][] = [];
  for (let i = 0; i + 1 < pts.length; i++) edges.push([pts[i], pts[i + 1]]);
  if (closed && pts.length > 2) edges.push([pts[pts.length - 1], pts[0]]);
  return edges;
}

/** `a`→`b` doğru parçası (silgi hareketi) şeklin bir kenarına `tolerance` kadar yaklaşıyor mu. */
export function segmentTouchesShape(shape: Shape, a: Point, b: Point, tolerance: number): boolean {
  const reach = tolerance + shape.style.width / 2;
  const box = shapeBounds(shape);
  if (
    Math.max(a.x, b.x) < box.x - reach ||
    Math.min(a.x, b.x) > box.x + box.width + reach ||
    Math.max(a.y, b.y) < box.y - reach ||
    Math.min(a.y, b.y) > box.y + box.height + reach
  ) {
    return false;
  }
  return shapeEdges(shape).some(([c, d]) => segmentDistance(a, b, c, d) <= reach);
}

/** Köşeleri dönüştürülmüş kopya (ör. kâğıt yönü değişimi). */
export function mapShape(shape: Shape, map: (p: Point) => Point): Shape {
  const vertices = new Array<number>(shape.vertices.length);
  for (let i = 0; i < shape.vertices.length; i += 2) {
    const q = map({ x: shape.vertices[i], y: shape.vertices[i + 1] });
    vertices[i] = q.x;
    vertices[i + 1] = q.y;
  }
  return { ...shape, vertices };
}

/**
 * Şekli bağlamın mevcut (dünya) dönüşümüyle çizer: köşeler keskin konumda,
 * uçlar ve birleşimler fırçayla uyumlu yuvarlak. `closed` önizlemede
 * (bitmemiş çokgen) açık çizmek için verilir.
 */
export function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  color: string,
  alphaFactor = 1,
  closed = isClosed(shape.kind),
): void {
  const v = shape.vertices;
  if (v.length < 4) return;
  ctx.beginPath();
  ctx.moveTo(v[0], v[1]);
  for (let i = 2; i < v.length; i += 2) ctx.lineTo(v[i], v[i + 1]);
  if (closed) ctx.closePath();
  ctx.globalAlpha = shape.style.opacity * alphaFactor;
  ctx.strokeStyle = color;
  ctx.lineWidth = shape.style.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.globalAlpha = 1;
}
