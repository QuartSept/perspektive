import type { Point } from '../engine/geometry';
import type { PerspectiveScene } from './scene';

/** Stroke'un kilitlenebileceği sonsuz doğru (dünya koordinatı). */
export interface SnapLine {
  origin: Point;
  /** Birim vektör. */
  direction: Point;
  kind: 'vanishing-point' | 'vertical' | 'horizontal';
  /** kind = 'vanishing-point' ise noktanın kimliği. */
  pointId?: string;
}

/** Hareket yönü bir adayla en fazla bu kadar açı farkıyla eşleşirse kilitlenir. */
export const SNAP_MAX_ANGLE = (25 * Math.PI) / 180;

/**
 * Stroke başlangıcından geçen aday doğrular:
 *  - her kaçış noktasına giden ışın (başlangıç noktası → kaçış noktası)
 *  - dikey (ufka dik)
 *  - yalnızca 1 noktada: yatay (ufka paralel)
 */
export function candidateLines(scene: PerspectiveScene, start: Point): SnapLine[] {
  const lines: SnapLine[] = [];
  for (const p of scene.points) {
    const dx = p.x - start.x;
    const dy = p.y - start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    lines.push({
      origin: start,
      direction: { x: dx / len, y: dy / len },
      kind: 'vanishing-point',
      pointId: p.id,
    });
  }

  const horizon = scene.horizon();
  if (horizon) {
    const h = { x: Math.cos(horizon.angle), y: Math.sin(horizon.angle) };
    lines.push({ origin: start, direction: { x: -h.y, y: h.x }, kind: 'vertical' });
    if (scene.mode === 1) lines.push({ origin: start, direction: h, kind: 'horizontal' });
  }
  return lines;
}

/** İki yön arasındaki yönsüz açı (0..π/2). */
function undirectedAngle(a: Point, b: Point): number {
  const dot = Math.abs(a.x * b.x + a.y * b.y);
  return Math.acos(Math.min(1, dot));
}

/** Hareket yönüne en uygun aday; hiçbiri yeterince yakın değilse null. */
export function chooseLine(candidates: SnapLine[], start: Point, current: Point): SnapLine | null {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return null;
  const move = { x: dx / len, y: dy / len };

  let best: SnapLine | null = null;
  let bestAngle = SNAP_MAX_ANGLE;
  for (const line of candidates) {
    const angle = undirectedAngle(move, line.direction);
    if (angle <= bestAngle) {
      best = line;
      bestAngle = angle;
    }
  }
  return best;
}

/** Noktanın doğru üzerindeki izdüşümü. */
export function projectOnLine(line: SnapLine, p: Point): Point {
  const t = (p.x - line.origin.x) * line.direction.x + (p.y - line.origin.y) * line.direction.y;
  return { x: line.origin.x + line.direction.x * t, y: line.origin.y + line.direction.y * t };
}

/** Noktanın doğruya dik uzaklığı. */
export function distanceToLine(line: SnapLine, p: Point): number {
  return Math.abs(
    (p.x - line.origin.x) * line.direction.y - (p.y - line.origin.y) * line.direction.x,
  );
}
