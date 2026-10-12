import type { Point } from '../engine/geometry';
import { newStrokeId, type Stroke } from '../engine/stroke';
import type { PerspectiveScene } from './scene';
import { TEMPLATE_STYLE } from './templates';

export const GRID_PLANES = ['floor', 'wall-left', 'wall-right'] as const;
export type GridPlane = (typeof GRID_PLANES)[number];
export const GRID_SIZES = [4, 6, 8, 10] as const;

interface Size {
  width: number;
  height: number;
}

/** Homojen eksen: sonlu kaçış noktası (w = 1) ya da paralel doğrular için yön (w = 0). */
interface Axis {
  x: number;
  y: number;
  w: 0 | 1;
}

/**
 * Düzlemdeki (u, v) ızgara koordinatını görüntüye eşleyen homografi:
 *   H(u, v) = (α·u·A + β·v·B + C) / (α·u·A.w + β·v·B.w + 1)
 * A ve B eksenlerin kaçış noktaları (ya da yönleri), C başlangıç köşesi.
 * α/β oranı, kare köşegenlerinin kaçış noktasına göre seçilir; böylece
 * hücreler perspektifte gerçekten kare olur.
 */
export interface GridHomography {
  A: Axis;
  B: Axis;
  C: Point;
  alpha: number;
  beta: number;
}

export function mapGrid(h: GridHomography, u: number, v: number): Point {
  const w = h.alpha * u * h.A.w + h.beta * v * h.B.w + 1;
  return {
    x: (h.alpha * u * h.A.x + h.beta * v * h.B.x + h.C.x) / w,
    y: (h.alpha * u * h.A.y + h.beta * v * h.B.y + h.C.y) / w,
  };
}

/** Liang–Barsky: doğru parçasını kâğıda kırpar; tamamen dışarıdaysa null. */
export function clipToPaper(a: Point, b: Point, size: Size): [Point, Point] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const edges: [number, number][] = [
    [-dx, a.x],
    [dx, size.width - a.x],
    [-dy, a.y],
    [dy, size.height - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return null;
    }
  }
  return [
    { x: a.x + dx * t0, y: a.y + dy * t0 },
    { x: a.x + dx * t1, y: a.y + dy * t1 },
  ];
}

/** Sonlu eksende u = n noktası, kaçış noktasına uzaklığın bu oranına düşer. */
const FAR_FRACTION = 0.6;

/**
 * Kurguya göre ızgara homografisi. Ufuk çizgisi koordinatlarında çalışılır
 * (e: ufuk yönü, up: ufka dik, yukarı), böylece döndürülmüş ufukta da doğru.
 * Kurgu bu düzlem için yetersizse (eksik kaçış noktası) null.
 */
export function gridHomography(
  scene: PerspectiveScene,
  plane: GridPlane,
  cells: number,
  size: Size,
): GridHomography | null {
  const horizon = scene.horizon();
  if (!horizon || scene.points.length < scene.mode) return null;
  const e = { x: Math.cos(horizon.angle), y: Math.sin(horizon.angle) };
  const up = { x: e.y, y: -e.x };
  const O = horizon.origin;
  const along = (p: Point) => (p.x - O.x) * e.x + (p.y - O.y) * e.y;
  const at = (t: number, s: number): Point => ({
    x: O.x + e.x * t + up.x * s,
    y: O.y + e.y * t + up.y * s,
  });

  // Kâğıt merkezinin ufuk üzerindeki izdüşümü ve ufkun altına uzaklık
  const center = { x: size.width / 2, y: size.height / 2 };
  const tc = along(center);
  const below = Math.min(size.width, size.height) * 0.42;
  const finiteAlpha = FAR_FRACTION / (1 - FAR_FRACTION) / cells;

  if (scene.mode === 1) {
    const V = scene.points[0];
    // Yerleşim kâğıt merkezine göre: nokta kenarda olsa da ızgara kâğıtta kalır
    // 1 noktada görüş uzaklığı serbest; kâğıt boyutuna göre makul bir değer
    const d = Math.max(size.width, size.height) * 0.9;
    if (plane === 'floor') {
      // u: yatay (ufka paralel), v: derinlik (kaçış noktasına)
      const alpha = (Math.min(size.width, size.height) * 0.85) / cells;
      return {
        A: { x: e.x, y: e.y, w: 0 },
        B: { x: V.x, y: V.y, w: 1 },
        C: at(tc - (alpha * cells) / 2, -below),
        alpha,
        beta: alpha / d,
      };
    }
    // Yan duvarlar: u derinlik (kaçış noktasına), v dikey
    const side = plane === 'wall-left' ? -1 : 1;
    return {
      A: { x: V.x, y: V.y, w: 1 },
      B: { x: up.x, y: up.y, w: 0 },
      C: at(tc + side * size.width * 0.3, -below),
      alpha: finiteAlpha,
      beta: finiteAlpha * d,
    };
  }

  // 2 nokta: izleyici, iki kaçış noktasına bakış açısı 90° olacak yerde
  const [P1, P2] = scene.points;
  let [t1, t2] = [along(P1), along(P2)];
  let [V1, V2] = [P1, P2];
  if (t1 > t2) {
    [t1, t2] = [t2, t1];
    [V1, V2] = [V2, V1];
  }
  const t0 = Math.min(t2 - (t2 - t1) * 0.1, Math.max(t1 + (t2 - t1) * 0.1, tc));
  const d0 = Math.sqrt((t0 - t1) * (t2 - t0));
  const C = at(t0, -below);

  if (plane === 'floor') {
    // Kare köşegenlerinin kaçış noktası: izleyiciden iki yönün açıortayı
    const u1 = { a: t1 - t0, s: d0 };
    const u2 = { a: t2 - t0, s: d0 };
    const l1 = Math.hypot(u1.a, u1.s);
    const l2 = Math.hypot(u2.a, u2.s);
    const bis = { a: u1.a / l1 + u2.a / l2, s: u1.s / l1 + u2.s / l2 };
    const tD = t0 + (bis.a / bis.s) * d0;
    const alpha = finiteAlpha;
    return {
      A: { x: V1.x, y: V1.y, w: 1 },
      B: { x: V2.x, y: V2.y, w: 1 },
      C,
      alpha,
      beta: (alpha * (tD - t1)) / (t2 - tD),
    };
  }

  // Duvar: köşeden sol duvar sol kaçış noktasına, sağ duvar sağa; v dikey.
  // Dikey düzlemde kare köşegenleri, kaçış noktasının üstünde izleyici-nokta
  // uzaklığı kadar yukarıdaki noktaya kaçar.
  const Vk = plane === 'wall-left' ? V1 : V2;
  const tk = plane === 'wall-left' ? t1 : t2;
  const dk = Math.hypot(tk - t0, d0);
  return {
    A: { x: Vk.x, y: Vk.y, w: 1 },
    B: { x: up.x, y: up.y, w: 0 },
    C,
    alpha: finiteAlpha,
    beta: finiteAlpha * dk,
  };
}

/** Izgara çizgileri: kâğıda kırpılmış iki noktalı açık gri stroke'lar. */
export function buildGrid(
  scene: PerspectiveScene,
  plane: GridPlane,
  cells: number,
  size: Size,
): Stroke[] | null {
  const h = gridHomography(scene, plane, cells, size);
  if (!h) return null;
  const strokes: Stroke[] = [];
  const push = (a: Point, b: Point) => {
    const c = clipToPaper(a, b, size);
    if (!c || Math.hypot(c[1].x - c[0].x, c[1].y - c[0].y) < 0.5) return;
    strokes.push({
      id: newStrokeId(),
      points: [c[0].x, c[0].y, c[1].x, c[1].y],
      style: { ...TEMPLATE_STYLE },
    });
  };
  for (let i = 0; i <= cells; i++) {
    push(mapGrid(h, i, 0), mapGrid(h, i, cells));
    push(mapGrid(h, 0, i), mapGrid(h, cells, i));
  }
  return strokes;
}
