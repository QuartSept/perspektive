import type { Point, Rect } from '../engine/geometry';
import { cornerHasVisibleEdge, type Shape } from '../engine/shapes';
import type { PerspectiveScene, VanishingPoint } from './scene';
import type { SnapLine, SnapSource } from './snapping';

/** Köşe çizgilerinin hedefi: tüm kaçış noktaları, kullanıcının seçtiği tek nokta ya da hiçbiri. */
export type CornerTarget = 'all' | 'one' | 'off';
export const CORNER_TARGETS: readonly CornerTarget[] = ['all', 'one', 'off'];

export interface SavedCornerLines {
  target: CornerTarget;
  /** `one` modunda hedef nokta (yoksa ilk etkin nokta). */
  pointId: string | null;
}

export const DEFAULT_CORNER_LINES: SavedCornerLines = { target: 'all', pointId: null };

/** Köşe çizgisi ayarı (çizimle kaydedilir, geri al geçmişine girmez). */
export class CornerLineSettings {
  target: CornerTarget = DEFAULT_CORNER_LINES.target;
  pointId: string | null = DEFAULT_CORNER_LINES.pointId;
  private listeners = new Set<() => void>();

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setTarget(target: CornerTarget): void {
    if (target === this.target || !CORNER_TARGETS.includes(target)) return;
    this.target = target;
    this.emit();
  }

  setPoint(id: string | null): void {
    if (id === this.pointId) return;
    this.pointId = id;
    this.emit();
  }

  restore(saved: SavedCornerLines): void {
    this.target = saved.target;
    this.pointId = saved.pointId;
    this.emit();
  }

  toSaved(): SavedCornerLines {
    return { target: this.target, pointId: this.pointId };
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}

/** Köşe çizgilerinin gittiği noktalar (perspektif kapalıyken boş). */
export function cornerTargets(
  scene: PerspectiveScene,
  settings: { target: CornerTarget; pointId: string | null },
): VanishingPoint[] {
  const points = scene.activePoints;
  if (settings.target === 'off') return [];
  if (settings.target === 'all' || points.length <= 1) return points;
  const chosen = points.find((p) => p.id === settings.pointId) ?? points[0];
  return [chosen];
}

export interface CornerLine {
  /** Şeklin köşesi. */
  corner: Point;
  point: VanishingPoint;
  /** Kâğıtla kırpılmış görünür parça. */
  from: Point;
  to: Point;
}

/**
 * `a`→`b` doğru parçasını dikdörtgenle kırpar (Liang–Barsky); tamamen
 * dışarıdaysa null.
 */
export function clipSegment(a: Point, b: Point, rect: Rect): [Point, Point] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, a.x - rect.x],
    [dx, rect.x + rect.width - a.x],
    [-dy, a.y - rect.y],
    [dy, rect.y + rect.height - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return null;
  }
  return [
    { x: a.x + dx * t0, y: a.y + dy * t0 },
    { x: a.x + dx * t1, y: a.y + dy * t1 },
  ];
}

/**
 * Şekillerin (köşe çizgisi açık olanların) her köşesinden hedef kaçış
 * noktalarına giden çizgiler; kâğıt dışına taşan kısım kırpılır.
 */
export function cornerLines(
  shapes: readonly Shape[],
  targets: readonly VanishingPoint[],
  paper: Rect,
): CornerLine[] {
  const out: CornerLine[] = [];
  if (!targets.length) return out;
  for (const shape of shapes) {
    if (!shape.cornerLines) continue;
    const v = shape.vertices;
    for (let i = 0; i + 1 < v.length; i += 2) {
      // Kenarları silinmiş köşeden çizgi çıkmaz (en az bir görünen kenar gerekir)
      if (!cornerHasVisibleEdge(shape, i / 2)) continue;
      const corner = { x: v[i], y: v[i + 1] };
      for (const point of targets) {
        if (Math.hypot(point.x - corner.x, point.y - corner.y) < 1e-6) continue;
        const clipped = clipSegment(corner, point, paper);
        if (clipped) out.push({ corner, point, from: clipped[0], to: clipped[1] });
      }
    }
  }
  return out;
}

/**
 * Mıknatıs aday kaynağı: başlangıç bir köşe çizgisine `nearPointRadius`
 * kadar yakınsa o çizgi (başlangıç çizgiye oturtulur). Arka yüz çizimi
 * (1 noktalı kutu) böyle kurulur.
 */
export function cornerLineSource(lines: () => readonly CornerLine[]): SnapSource {
  return (start, nearPointRadius) => {
    const out: SnapLine[] = [];
    for (const l of lines()) {
      const dx = l.point.x - l.corner.x;
      const dy = l.point.y - l.corner.y;
      const len = Math.hypot(dx, dy);
      const d = { x: dx / len, y: dy / len };
      const t = (start.x - l.corner.x) * d.x + (start.y - l.corner.y) * d.y;
      // Köşe ile kaçış noktası arasında (biraz pay ile)
      if (t < -nearPointRadius || t > len + nearPointRadius) continue;
      const off = Math.abs((start.x - l.corner.x) * d.y - (start.y - l.corner.y) * d.x);
      if (off > nearPointRadius) continue;
      out.push({
        origin: { x: l.corner.x + d.x * t, y: l.corner.y + d.y * t },
        direction: d,
        kind: 'vanishing-point',
        pointId: l.point.id,
      });
    }
    return out;
  };
}

/**
 * Köşe çizgisi adayı olan kaçış noktası için düz ışın adayını düşürür:
 * ikisi neredeyse aynı yönde, ama köşe çizgisi başlangıcı tam çizgiye oturtur.
 */
export function preferCornerLines(perspective: SnapSource, corners: SnapSource): SnapSource {
  return (start, near) => {
    const corner = corners(start, near);
    if (!corner.length) return perspective(start, near);
    const ids = new Set(corner.map((l) => l.pointId));
    const rest = perspective(start, near).filter(
      (l) => l.kind !== 'vanishing-point' || l.radial || !ids.has(l.pointId),
    );
    return [...corner, ...rest];
  };
}
