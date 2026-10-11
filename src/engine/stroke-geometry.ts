import type { Point, Rect } from './geometry';
import type { Stroke } from './stroke';

const boundsCache = new WeakMap<Stroke, Rect>();

/**
 * Stroke'un nokta sınırları (kalınlık hariç). Belgeye eklenen stroke'lar
 * değiştirilmediği için sonuç önbelleğe alınır.
 */
export function strokeBounds(stroke: Stroke): Rect {
  const cached = boundsCache.get(stroke);
  if (cached) return cached;
  const p = stroke.points;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    minX = Math.min(minX, p[i]);
    maxX = Math.max(maxX, p[i]);
    minY = Math.min(minY, p[i + 1]);
    maxY = Math.max(maxY, p[i + 1]);
  }
  const rect = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  boundsCache.set(stroke, rect);
  return rect;
}

function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

export function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b),
  );
}

/**
 * `a`→`b` doğru parçası (silgi hareketi) stroke'a `tolerance` kadar
 * yaklaşıyor mu. Stroke kalınlığının yarısı otomatik eklenir.
 */
export function segmentTouchesStroke(stroke: Stroke, a: Point, b: Point, tolerance: number): boolean {
  const reach = tolerance + stroke.style.width / 2;
  const box = strokeBounds(stroke);
  if (
    Math.max(a.x, b.x) < box.x - reach ||
    Math.min(a.x, b.x) > box.x + box.width + reach ||
    Math.max(a.y, b.y) < box.y - reach ||
    Math.min(a.y, b.y) > box.y + box.height + reach
  ) {
    return false;
  }

  const p = stroke.points;
  if (p.length === 2) {
    return pointSegmentDistance({ x: p[0], y: p[1] }, a, b) <= reach;
  }
  for (let i = 0; i + 3 < p.length; i += 2) {
    const c = { x: p[i], y: p[i + 1] };
    const d = { x: p[i + 2], y: p[i + 3] };
    if (segmentDistance(a, b, c, d) <= reach) return true;
  }
  return false;
}
