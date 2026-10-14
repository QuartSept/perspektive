import type { Point, Rect } from './geometry';
import type { StrokeStyle } from './stroke';
import { segmentDistance } from './stroke-geometry';

/**
 * Düzenlenebilir geometrik şekiller (V3). Köşe bilgisi korunur; ekranda,
 * çıktılarda ve silgide kenarlardan oluşan düz bir çizgi olarak ele alınır.
 */
export const SHAPE_KINDS = ['segment', 'rect', 'triangle', 'polygon', 'box'] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

/** Kutunun arkada kalan (görünmeyen) kenarlarının çizimi. */
export const BOX_BACK_STYLES = ['dashed', 'solid', 'hidden'] as const;
export type BoxBackStyle = (typeof BOX_BACK_STYLES)[number];

/** Derinlik oranı sınırları (0: ön yüz, 1: kaçış noktası). */
export const BOX_DEPTH_MIN = 0.02;
export const BOX_DEPTH_MAX = 0.95;
export const BOX_DEPTH_DEFAULT = 0.3;

/**
 * Derinlikli kutu (1 nokta) parametreleri. Köşelerin ilk dördü ön yüz, son
 * dördü arka yüzdür; arka köşeler türetilir: ön + derinlik · (KN − ön).
 */
export interface BoxParams {
  /** Kutunun gittiği kaçış noktası (silinmişse null: kutu son konumunda kalır). */
  pointId: string | null;
  /** Kaçış noktasının son bilinen konumu (nokta taşınınca güncellenir). */
  vp: Point;
  depth: number;
  back: BoxBackStyle;
}

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
  /**
   * Silgiyle silinmiş kenarlar (kenar i: köşe i → köşe i+1; kapalı şekilde
   * son kenar son köşeden ilkine). Köşeler korunur, şekil düzenlenebilir kalır.
   */
  hiddenEdges?: number[];
  /** Yalnızca `box` türünde. */
  box?: BoxParams;
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
    case 'box':
      return [8, 8];
  }
}

/** Doğru parçası dışındaki çokgenler kapalıdır (son köşe ilkine bağlanır); kutunun kenarları ayrı tanımlıdır. */
export function isClosed(kind: ShapeKind): boolean {
  return kind !== 'segment' && kind !== 'box';
}

/** Kutu kenarları (köşe çiftleri): ön yüz 0–3, arka yüz 4–7, derinlik kenarları 8–11. */
const BOX_EDGES: readonly [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

/** Kenarlar köşe numarası çiftleri olarak (kenar numarası dizideki sıradır). */
export function edgePairs(shape: Shape): readonly [number, number][] {
  if (shape.kind === 'box') return BOX_EDGES;
  const n = shape.vertices.length / 2;
  const pairs: [number, number][] = [];
  for (let i = 0; i + 1 < n; i++) pairs.push([i, i + 1]);
  if (isClosed(shape.kind) && n > 2) pairs.push([n - 1, 0]);
  return pairs;
}

/** Ön köşelerden arka köşeler: kaçış noktasına doğru `depth` oranında. */
export function boxBackVertices(front: readonly number[], vp: Point, depth: number): number[] {
  const back: number[] = [];
  for (let i = 0; i < 8; i += 2) {
    back.push(front[i] + (vp.x - front[i]) * depth, front[i + 1] + (vp.y - front[i + 1]) * depth);
  }
  return back;
}

/** Kutunun köşelerini parametrelerinden yeniden hesaplar (ön yüz korunur). */
export function rebuildBox(shape: Shape, patch: Partial<BoxParams> = {}, front?: readonly number[]): Shape {
  const box = { ...shape.box!, ...patch };
  box.depth = Math.min(BOX_DEPTH_MAX, Math.max(BOX_DEPTH_MIN, box.depth));
  const f = (front ?? shape.vertices).slice(0, 8);
  return { ...shape, box, vertices: [...f, ...boxBackVertices(f, box.vp, box.depth)] };
}

/** Dikdörtgenden (ön yüz) kutu: aynı kimlik, stil ve katman; kenar silmeleri sıfırlanır. */
export function rectToBox(rect: Shape, pointId: string, vp: Point, depth = BOX_DEPTH_DEFAULT): Shape {
  const { hiddenEdges: _drop, ...rest } = rect;
  return rebuildBox({ ...rest, kind: 'box', box: { pointId, vp, depth, back: 'dashed' } }, {}, rect.vertices);
}

/**
 * Arkada kalan kenarlar: bir kenar, değdiği yüzlerden en az biri bakana
 * dönükse görünür. Ön yüz hep dönük, arka yüz hep arkada; yan yüz, arka
 * kenarı ön kenarın dış tarafında kalıyorsa (kaçış noktası o taraftaysa) dönük.
 */
export function boxOccludedEdges(shape: Shape): Set<number> {
  const v = shape.vertices;
  const p = (i: number): Point => ({ x: v[i * 2], y: v[i * 2 + 1] });
  // Ön yüzün yönü (saat yönü / tersi) iç tarafı belirler
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const a = p(i);
    const b = p((i + 1) % 4);
    area += a.x * b.y - b.x * a.y;
  }
  const sign = Math.sign(area) || 1;
  /** Yan yüz i (ön kenar i ile arka kenar 4+i arasında) dönük mü. */
  const sideVisible = (i: number) => {
    const a = p(i);
    const b = p((i + 1) % 4);
    const m = { x: (p(4 + i).x + p(4 + ((i + 1) % 4)).x) / 2, y: (p(4 + i).y + p(4 + ((i + 1) % 4)).y) / 2 };
    const cross = (b.x - a.x) * (m.y - a.y) - (b.y - a.y) * (m.x - a.x);
    // İç taraf ön yüz yönüyle aynı işarette; dış taraftaysa yüz görünür
    return cross * sign < -1e-9;
  };
  const sides = [0, 1, 2, 3].map(sideVisible);
  const hidden = new Set<number>();
  for (let i = 0; i < 4; i++) {
    // Arka kenar 4+i: arka yüz + yan yüz i
    if (!sides[i]) hidden.add(4 + i);
    // Derinlik kenarı 8+i (köşe i): yan yüzler i-1 ve i
    if (!sides[i] && !sides[(i + 3) % 4]) hidden.add(8 + i);
  }
  return hidden;
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

/** Kenar sayısı: kapalı şekilde köşe sayısı, açıkta bir eksiği; kutuda 12. */
export function edgeCount(shape: Shape): number {
  return edgePairs(shape).length;
}

/** Kenar görünüyor mu (silinmemiş). */
export function edgeVisible(shape: Shape, index: number): boolean {
  return !shape.hiddenEdges?.includes(index);
}

/** Kenarlar (kapalı şekilde son köşeden ilkine giden kenar dahil); dizideki sıra kenar numarasıdır. */
export function shapeEdges(shape: Shape): [Point, Point][] {
  const pts = shapeVertices(shape);
  return edgePairs(shape).map(([i, j]) => [pts[i], pts[j]]);
}

/** Görünen (silinmemiş) kenarlar ve numaraları. */
export function visibleEdges(shape: Shape): { index: number; a: Point; b: Point }[] {
  return shapeEdges(shape)
    .map(([a, b], index) => ({ index, a, b }))
    .filter((e) => edgeVisible(shape, e.index));
}

/**
 * Görünen kenarlar ardışık parçalara (kırık çizgilere) toplanır; kapalı
 * şeklin hiç kenarı silinmemişse tek kapalı parça (`closed`) döner.
 * `skip` verilen kenarlar da atlanır (ör. silinmek üzere işaretli olanlar).
 */
export function visibleRuns(
  shape: Shape,
  skip?: ReadonlySet<number>,
): { points: Point[]; closed: boolean }[] {
  const pts = shapeVertices(shape);
  const count = edgeCount(shape);
  const shown = (i: number) => edgeVisible(shape, i) && !skip?.has(i);
  if (shape.kind === 'box') {
    // Kutu kenarları ayrı ayrı (zincir değil)
    return edgePairs(shape)
      .map(([i, j], k) => ({ k, points: [pts[i], pts[j]] }))
      .filter((e) => shown(e.k))
      .map((e) => ({ points: e.points, closed: false }));
  }
  const all = Array.from({ length: count }, (_, i) => shown(i));
  if (isClosed(shape.kind) && count > 2 && all.every(Boolean)) return [{ points: pts, closed: true }];
  // Kapalı şekilde koşu bir gizli kenardan sonra başlasın ki kapanış kenarı bölünmesin
  const start = isClosed(shape.kind) ? Math.max(0, all.indexOf(false)) + 1 : 0;
  const runs: { points: Point[]; closed: boolean }[] = [];
  let current: Point[] | null = null;
  for (let k = 0; k < count; k++) {
    const i = (start + k) % count;
    if (!all[i]) {
      current = null;
      continue;
    }
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (!current) {
      current = [a];
      runs.push({ points: current, closed: false });
    }
    current.push(b);
  }
  return runs;
}

/** Köşeden kaçış çizgisi çıksın mı: köşeye değen en az bir kenar görünüyor. */
export function cornerHasVisibleEdge(shape: Shape, vertex: number): boolean {
  return edgePairs(shape).some(([i, j], k) => (i === vertex || j === vertex) && edgeVisible(shape, k));
}

/** `a`→`b` doğru parçası (silgi hareketi) şeklin hangi görünen kenarlarına `tolerance` kadar yaklaşıyor. */
export function touchedEdges(shape: Shape, a: Point, b: Point, tolerance: number): number[] {
  const reach = tolerance + shape.style.width / 2;
  const box = shapeBounds(shape);
  if (
    Math.max(a.x, b.x) < box.x - reach ||
    Math.min(a.x, b.x) > box.x + box.width + reach ||
    Math.max(a.y, b.y) < box.y - reach ||
    Math.min(a.y, b.y) > box.y + box.height + reach
  ) {
    return [];
  }
  return visibleEdges(shape)
    .filter((e) => segmentDistance(a, b, e.a, e.b) <= reach)
    .map((e) => e.index);
}

/** `a`→`b` doğru parçası (silgi hareketi) şeklin görünen bir kenarına `tolerance` kadar yaklaşıyor mu. */
export function segmentTouchesShape(shape: Shape, a: Point, b: Point, tolerance: number): boolean {
  return touchedEdges(shape, a, b, tolerance).length > 0;
}

/**
 * Kenarları gizlenmiş kopya; bütün kenarlar gizlenirse null (şekil kalkar).
 * Kenar numaraları sıralı ve tekil tutulur.
 */
export function withHiddenEdges(shape: Shape, add: Iterable<number>): Shape | null {
  const hidden = new Set(shape.hiddenEdges ?? []);
  for (const i of add) hidden.add(i);
  const count = edgeCount(shape);
  const list = [...hidden].filter((i) => i >= 0 && i < count).sort((x, y) => x - y);
  if (list.length >= count) return null;
  return { ...shape, hiddenEdges: list };
}

/** Köşeleri dönüştürülmüş kopya (ör. kâğıt yönü değişimi); kutunun kaçış noktası da dönüşür. */
export function mapShape(shape: Shape, map: (p: Point) => Point): Shape {
  const vertices = new Array<number>(shape.vertices.length);
  for (let i = 0; i < shape.vertices.length; i += 2) {
    const q = map({ x: shape.vertices[i], y: shape.vertices[i + 1] });
    vertices[i] = q.x;
    vertices[i + 1] = q.y;
  }
  const mapped: Shape = { ...shape, vertices };
  if (shape.box) mapped.box = { ...shape.box, vp: map(shape.box.vp) };
  return mapped;
}

/** Kutunun arka kenar kesik deseni (dünya birimi, kalınlıkla ölçeklenir). */
export function boxDash(width: number): number[] {
  return [Math.max(4, width * 3), Math.max(3, width * 2)];
}

/**
 * Şekli bağlamın mevcut (dünya) dönüşümüyle çizer: köşeler keskin konumda,
 * uçlar ve birleşimler fırçayla uyumlu yuvarlak. Silinmiş kenarlar çizilmez.
 * `closed` önizlemede (bitmemiş çokgen) açık çizmek için verilir; `skip`
 * kenarları atlanır (soluk ayrıca çizilecek olanlar).
 */
export function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  color: string,
  alphaFactor = 1,
  closed = isClosed(shape.kind),
  skip?: ReadonlySet<number>,
): void {
  const v = shape.vertices;
  if (v.length < 4) return;
  if (shape.kind === 'box') {
    drawBox(ctx, shape, color, alphaFactor, skip);
    return;
  }
  ctx.beginPath();
  if (!closed && isClosed(shape.kind) && !shape.hiddenEdges?.length && !skip) {
    // Bitmemiş çokgen önizlemesi: kapanış kenarı yok
    ctx.moveTo(v[0], v[1]);
    for (let i = 2; i < v.length; i += 2) ctx.lineTo(v[i], v[i + 1]);
  } else {
    for (const run of visibleRuns(shape, skip)) {
      ctx.moveTo(run.points[0].x, run.points[0].y);
      for (let i = 1; i < run.points.length; i++) ctx.lineTo(run.points[i].x, run.points[i].y);
      if (run.closed) ctx.closePath();
    }
  }
  ctx.globalAlpha = shape.style.opacity * alphaFactor;
  ctx.strokeStyle = color;
  ctx.lineWidth = shape.style.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Kutu: görünen kenarlar düz, arkada kalanlar ayara göre kesikli / düz / hiç. */
function drawBox(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  color: string,
  alphaFactor: number,
  skip?: ReadonlySet<number>,
): void {
  const occluded = shape.box?.back === 'solid' ? new Set<number>() : boxOccludedEdges(shape);
  const edges = shapeEdges(shape);
  const stroke = (indices: number[], dash: number[]) => {
    if (!indices.length) return;
    ctx.beginPath();
    for (const k of indices) {
      const [a, b] = edges[k];
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.setLineDash(dash);
    ctx.stroke();
  };
  const shown = edges.map((_, k) => k).filter((k) => edgeVisible(shape, k) && !skip?.has(k));
  ctx.save();
  ctx.globalAlpha = shape.style.opacity * alphaFactor;
  ctx.strokeStyle = color;
  ctx.lineWidth = shape.style.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  stroke(shown.filter((k) => !occluded.has(k)), []);
  if (shape.box?.back !== 'hidden') stroke(shown.filter((k) => occluded.has(k)), boxDash(shape.style.width));
  ctx.restore();
}
