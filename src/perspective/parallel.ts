import type { Point } from '../engine/geometry';
import { segmentDistance } from '../engine/stroke-geometry';
import type { SnapLine } from './snapping';

/** Paralel yapışmada kaynak alınan düz parça (şekil kenarı ya da iki noktalı stroke). */
export interface Segment {
  a: Point;
  b: Point;
}

/** Bundan az farklı yönler aynı sayılır (yakındaki parça kalır). */
const SAME_DIRECTION = (1 * Math.PI) / 180;
/** En fazla bu kadar farklı yön aday olur (çok çizgide her yön yapışmasın). */
export const PARALLEL_MAX = 12;

/**
 * Başlangıçtan geçen, verilen parçalara paralel aday doğrular. Başlangıca en
 * yakın parçalar önceliklidir; aynı yöndekilerden yalnızca en yakını kalır.
 * `minLength`'ten kısa parçalar yön için güvenilmez, atlanır.
 */
export function parallelCandidates(
  segments: Iterable<Segment>,
  start: Point,
  minLength: number,
  max = PARALLEL_MAX,
): SnapLine[] {
  const ranked: { seg: Segment; dir: Point; dist: number }[] = [];
  for (const seg of segments) {
    const dx = seg.b.x - seg.a.x;
    const dy = seg.b.y - seg.a.y;
    const len = Math.hypot(dx, dy);
    if (len < minLength) continue;
    ranked.push({ seg, dir: { x: dx / len, y: dy / len }, dist: segmentDistance(start, start, seg.a, seg.b) });
  }
  ranked.sort((p, q) => p.dist - q.dist);
  const lines: SnapLine[] = [];
  for (const { seg, dir } of ranked) {
    if (lines.length >= max) break;
    const same = lines.some((l) => Math.acos(Math.min(1, Math.abs(l.direction.x * dir.x + l.direction.y * dir.y))) < SAME_DIRECTION);
    if (same) continue;
    lines.push({ origin: start, direction: dir, kind: 'parallel', ref: { a: seg.a, b: seg.b } });
  }
  return lines;
}
