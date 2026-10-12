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
  /**
   * Stroke kaçış noktasının üstünden başladı: noktadan geçen her doğru geçerli
   * bir ışındır, yön hareketten belirlenir (`direction` karar anında doldurulur).
   */
  radial?: boolean;
}

/** Hareket yönü bir adayla en fazla bu kadar açı farkıyla eşleşirse kilitlenir. */
export const SNAP_MAX_ANGLE = (25 * Math.PI) / 180;
/** En iyi iki aday bundan yakınsa karar ertelenir (daha uzun hareket beklenir). */
export const SNAP_AMBIGUITY_ANGLE = (4 * Math.PI) / 180;
/** Bundan az farklı iki aday aynı doğru sayılır (ör. ufuk üzerindeki iki ışın). */
const SAME_LINE_ANGLE = (1 * Math.PI) / 180;

/**
 * Stroke başlangıcından geçen aday doğrular:
 *  - her kaçış noktasına giden ışın (başlangıç noktası → kaçış noktası);
 *    başlangıç noktaya `nearPointRadius` kadar yakınsa o noktadan çıkan serbest ışın
 *  - dikey (ufka dik); 3 noktada bunun yerine dikey kaçış noktasının ışını
 *  - yalnızca 1 noktada: yatay (ufka paralel)
 */
export function candidateLines(
  scene: PerspectiveScene,
  start: Point,
  nearPointRadius = 0,
): SnapLine[] {
  const lines: SnapLine[] = [];
  for (const p of scene.points) {
    const dx = p.x - start.x;
    const dy = p.y - start.y;
    const len = Math.hypot(dx, dy);
    if (len <= nearPointRadius) {
      lines.push({
        origin: { x: p.x, y: p.y },
        direction: { x: 1, y: 0 },
        kind: 'vanishing-point',
        pointId: p.id,
        radial: true,
      });
      continue;
    }
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
    // 3 noktada dikeyler paralel değil: dikey kaçış noktasının ışını zaten aday
    if (!scene.verticalPoint) {
      lines.push({ origin: start, direction: { x: -h.y, y: h.x }, kind: 'vertical' });
    }
    if (scene.mode === 1) lines.push({ origin: start, direction: h, kind: 'horizontal' });
  }
  return lines;
}

/** İki yön arasındaki yönsüz açı (0..π/2). */
export function undirectedAngle(a: Point, b: Point): number {
  const dot = Math.abs(a.x * b.x + a.y * b.y);
  return Math.acos(Math.min(1, dot));
}

function unit(dx: number, dy: number): Point | null {
  const len = Math.hypot(dx, dy);
  return len < 1e-9 ? null : { x: dx / len, y: dy / len };
}

interface Ranked {
  line: SnapLine;
  angle: number;
}

/** Adayları hareket yönüne açısal yakınlığa göre sıralar (serbest ışınların yönü doldurulur). */
function rankLines(candidates: SnapLine[], start: Point, current: Point): Ranked[] {
  const move = unit(current.x - start.x, current.y - start.y);
  if (!move) return [];
  return candidates
    .map((line) => {
      // Serbest ışın: kaçış noktasından geçer, yönü hareketten alır. "Nokta → imleç"
      // yönü kısa karar mesafesinde başlangıcın noktadan sapması yüzünden güvenilmez.
      if (line.radial) line = { ...line, direction: move };
      return { line, angle: undirectedAngle(move, line.direction) };
    })
    .sort((a, b) => a.angle - b.angle);
}

export type SnapDecision =
  | { kind: 'lock'; line: SnapLine }
  /** İki farklı aday neredeyse eşit; daha fazla hareket gerekiyor. */
  | { kind: 'wait' }
  | { kind: 'none' };

/**
 * Hareket yönüne göre kilitlenecek doğruyu seçer. `final` true ise (karar
 * mesafesinin sonu) belirsizlikte beklemek yerine en iyi aday seçilir.
 */
export function decideLine(
  candidates: SnapLine[],
  start: Point,
  current: Point,
  final: boolean,
): SnapDecision {
  const ranked = rankLines(candidates, start, current);
  const best = ranked[0];
  if (!best || best.angle > SNAP_MAX_ANGLE) return { kind: 'none' };
  const second = ranked[1];
  if (
    !final &&
    second &&
    second.angle - best.angle < SNAP_AMBIGUITY_ANGLE &&
    undirectedAngle(best.line.direction, second.line.direction) > SAME_LINE_ANGLE
  ) {
    return { kind: 'wait' };
  }
  return { kind: 'lock', line: best.line };
}

/** Hareket yönüne en uygun aday; hiçbiri yeterince yakın değilse null. */
export function chooseLine(candidates: SnapLine[], start: Point, current: Point): SnapLine | null {
  const decision = decideLine(candidates, start, current, true);
  return decision.kind === 'lock' ? decision.line : null;
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
