import type { Point, Rect } from '../engine/geometry';
import type { PerspectiveScene, VanishingPoint } from './scene';

/** Kâğıt merkezine yapışma eşiği, ekran pikseli. */
export const CENTER_SNAP_PX = 8;

export function rectCenter(r: Rect): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

export interface CenterSnap {
  point: Point;
  /** x merkezin dikey eksenine oturdu. */
  snappedX: boolean;
  /** y merkezin yatay eksenine oturdu. */
  snappedY: boolean;
}

/** Noktayı merkezin dikey / yatay eksenine (ikisi birden: merkeze) `tolerance` içindeyse oturtur. */
export function snapToCenter(p: Point, center: Point, tolerance: number): CenterSnap {
  const snappedX = Math.abs(p.x - center.x) <= tolerance;
  const snappedY = Math.abs(p.y - center.y) <= tolerance;
  return {
    point: { x: snappedX ? center.x : p.x, y: snappedY ? center.y : p.y },
    snappedX,
    snappedY,
  };
}

/**
 * Kurguyu kâğıdın merkezine göre yerleştirir (seçili nokta yokken "Merkeze al"):
 *  - 1 nokta: nokta merkeze
 *  - 2 / 3 nokta: ufuk merkezden geçer, iki ufuk noktası merkezin iki yanına
 *    aralarındaki uzaklığı koruyarak simetrik yerleşir; dikey kaçış noktası
 *    ufka uzaklığını koruyarak merkezden geçen dikmeye alınır
 * Kurgu değişmeyecekse (nokta yok) false.
 */
export function centerSetup(scene: PerspectiveScene, paper: Rect): boolean {
  const center = rectCenter(paper);
  const horizon = scene.horizonPoints;
  if (!horizon.length) return false;
  const snap = scene.snapshot();
  const moved = new Map<string, Point>();

  if (horizon.length === 1) {
    moved.set(horizon[0].id, center);
  } else {
    const [a, b] = horizon;
    // Ufuk yönü: kilitliyse kilit açısı, değilse iki noktanın doğrusu
    const d = scene.isHorizonLocked ? scene.horizonDirection() : unit(b.x - a.x, b.y - a.y);
    const half = Math.abs((b.x - a.x) * d.x + (b.y - a.y) * d.y) / 2;
    // Soldaki (ufuk yönünde geride kalan) nokta solda kalsın
    const aFirst = (b.x - a.x) * d.x + (b.y - a.y) * d.y >= 0;
    const left = { x: center.x - d.x * half, y: center.y - d.y * half };
    const right = { x: center.x + d.x * half, y: center.y + d.y * half };
    moved.set(a.id, aFirst ? left : right);
    moved.set(b.id, aFirst ? right : left);

    const v = scene.verticalPoint;
    if (v) {
      // Ufka dik uzaklık korunur, ufuk boyunca merkeze hizalanır
      const n = { x: -d.y, y: d.x };
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const off = (v.x - mid.x) * n.x + (v.y - mid.y) * n.y;
      moved.set(v.id, { x: center.x + n.x * off, y: center.y + n.y * off });
    }
  }

  scene.restore({
    ...snap,
    points: snap.points.map((p): VanishingPoint => {
      const q = moved.get(p.id);
      return q ? { ...p, x: q.x, y: q.y } : p;
    }),
  });
  return true;
}

/**
 * Seçili noktayı kâğıt merkezine taşır. Kilitli ufukta diğer ufuk noktası
 * ufukla birlikte merkez yüksekliğine iner (yatay konumu korunur).
 */
export function centerPoint(scene: PerspectiveScene, id: string, paper: Rect): boolean {
  const p = scene.getPoint(id);
  if (!p || !scene.activePoints.includes(p)) return false;
  scene.movePoint(id, rectCenter(paper));
  return true;
}

function unit(x: number, y: number): Point {
  const len = Math.hypot(x, y);
  return len < 1e-9 ? { x: 1, y: 0 } : { x: x / len, y: y / len };
}
