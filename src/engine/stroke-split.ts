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

  const pr = stroke.pressures;
  /** Parça noktaları ve (varsa) basınçları birlikte tutulur. */
  type Piece = { pts: number[]; prs: number[] };
  const pressureAt = (i: number, t: number) => (pr ? pr[i] + (pr[i + 1] - pr[i]) * t : 0);

  /** P→Q üzerinde içeride/dışarıda geçişinin parametresi (ikiye bölerek). */
  const boundary = (P: Point, Q: Point, lo: number, hi: number, loInside: boolean): number => {
    for (let k = 0; k < BISECT_STEPS; k++) {
      const mid = (lo + hi) / 2;
      if (inside(lerp(P, Q, mid)) === loInside) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };

  const pieces: Piece[] = [];
  const startPiece = (x: number, y: number, pressure: number): Piece => ({
    pts: [x, y],
    prs: pr ? [pressure] : [],
  });
  const extend = (piece: Piece, x: number, y: number, pressure: number) => {
    piece.pts.push(x, y);
    if (pr) piece.prs.push(pressure);
  };

  let current: Piece | null = inside(at(0)) ? null : startPiece(p[0], p[1], pr?.[0] ?? 0);
  let cut = current === null;
  const step = Math.max(reach / 4, 1e-6);

  for (let i = 0; i < n - 1; i++) {
    const P = at(i);
    const Q = at(i + 1);
    const prQ = pr?.[i + 1] ?? 0;
    // Kapsülden uzak parça: olduğu gibi kalır
    if (segmentDistance(P, Q, a, b) > reach) {
      if (current) extend(current, Q.x, Q.y, prQ);
      else current = startPiece(Q.x, Q.y, prQ);
      continue;
    }
    // Yakın parça: sınırları bulmak için örnekle
    const steps = Math.max(1, Math.ceil(Math.hypot(Q.x - P.x, Q.y - P.y) / step));
    let prevT = 0;
    let prevIn = inside(P);
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const ptIn = inside(k === steps ? Q : lerp(P, Q, t));
      if (ptIn !== prevIn) {
        cut = true;
        const tb = boundary(P, Q, prevT, t, prevIn);
        const edge = lerp(P, Q, tb);
        if (prevIn) {
          current = startPiece(edge.x, edge.y, pressureAt(i, tb));
        } else {
          extend(current!, edge.x, edge.y, pressureAt(i, tb));
          pieces.push(current!);
          current = null;
        }
      }
      if (k === steps && !ptIn) extend(current!, Q.x, Q.y, prQ);
      prevT = t;
      prevIn = ptIn;
    }
  }
  if (current) pieces.push(current);
  if (!cut) return null;

  return pieces
    .filter((pc) => pc.pts.length >= 4 && pieceLength(pc.pts) >= MIN_PIECE_LENGTH)
    .map((pc) => {
      const piece: Stroke = { id: newStrokeId(), points: pc.pts, style: { ...stroke.style } };
      if (pr) piece.pressures = pc.prs;
      return piece;
    });
}
