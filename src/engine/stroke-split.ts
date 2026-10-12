import type { Point } from './geometry';
import { newStrokeId, type Stroke } from './stroke';
import { segmentDistance, segmentTouchesStroke } from './stroke-geometry';

/** Bu uzunluktan kısa kalan parçalar atılır (dünya birimi). */
const MIN_PIECE_LENGTH = 0.5;
/** Sınır noktası arama adımı. */
const BISECT_STEPS = 12;

function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

const lerp = (p: Point, q: Point, t: number): Point => ({
  x: p.x + (q.x - p.x) * t,
  y: p.y + (q.y - p.y) * t,
});

function pieceLength(points: number[]): number {
  let len = 0;
  for (let i = 2; i < points.length; i += 2) {
    len += Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]);
  }
  return len;
}

/**
 * Piksel silgisi: `a`→`b` silgi hareketinin `radius` yarıçaplı kapsülü içinde
 * kalan kısmı stroke'tan çıkarır ve kalan parçaları döndürür.
 *  - dokunulmadıysa null
 *  - tamamen silindiyse []
 * Kalınlığın yarısı yarıçapa eklenir: parçaların yuvarlak uçları boşluğa
 * taşmaz, görünen boşluk silgi dairesi kadardır.
 * Kesilmeyen kısımlarda özgün noktalar korunur (eğri biçimi değişmez).
 */
export function eraseFromStroke(stroke: Stroke, a: Point, b: Point, radius: number): Stroke[] | null {
  if (!segmentTouchesStroke(stroke, a, b, radius)) return null;
  const reach = radius + stroke.style.width / 2;
  const inside = (p: Point) => pointSegmentDistance(p, a, b) <= reach;
  const p = stroke.points;
  const n = p.length / 2;
  const at = (i: number): Point => ({ x: p[i * 2], y: p[i * 2 + 1] });

  if (n === 1) return inside(at(0)) ? [] : null;

  /** İçeride/dışarıda geçişinin olduğu nokta (ikiye bölerek). */
  const boundary = (from: Point, to: Point, fromInside: boolean): Point => {
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < BISECT_STEPS; k++) {
      const mid = (lo + hi) / 2;
      if (inside(lerp(from, to, mid)) === fromInside) lo = mid;
      else hi = mid;
    }
    return lerp(from, to, (lo + hi) / 2);
  };

  const pieces: number[][] = [];
  let current: number[] | null = inside(at(0)) ? null : [p[0], p[1]];
  let cut = current === null;
  const step = Math.max(reach / 4, 1e-6);

  for (let i = 0; i < n - 1; i++) {
    const P = at(i);
    const Q = at(i + 1);
    // Kapsülden uzak parça: olduğu gibi kalır
    if (segmentDistance(P, Q, a, b) > reach) {
      if (current) current.push(Q.x, Q.y);
      else current = [Q.x, Q.y];
      continue;
    }
    // Yakın parça: sınırları bulmak için örnekle
    const steps = Math.max(1, Math.ceil(Math.hypot(Q.x - P.x, Q.y - P.y) / step));
    let prev = P;
    let prevIn = inside(P);
    for (let k = 1; k <= steps; k++) {
      const pt = k === steps ? Q : lerp(P, Q, k / steps);
      const ptIn = inside(pt);
      if (ptIn !== prevIn) {
        cut = true;
        const edge = boundary(prev, pt, prevIn);
        if (prevIn) {
          current = [edge.x, edge.y];
        } else {
          current!.push(edge.x, edge.y);
          pieces.push(current!);
          current = null;
        }
      }
      if (k === steps && !ptIn) current!.push(Q.x, Q.y);
      prev = pt;
      prevIn = ptIn;
    }
  }
  if (current) pieces.push(current);
  if (!cut) return null;

  return pieces
    .filter((pts) => pts.length >= 4 && pieceLength(pts) >= MIN_PIECE_LENGTH)
    .map((pts) => ({ id: newStrokeId(), points: pts, style: { ...stroke.style } }));
}
