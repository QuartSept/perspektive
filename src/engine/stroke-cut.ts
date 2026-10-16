import type { Point, Rect } from './geometry';
import { rectsOverlap } from './geometry';
import { newStrokeId, type Stroke } from './stroke';
import { strokeBounds } from './stroke-geometry';

/**
 * Parça silgisi için geometri: bir stroke'u diğer çizgilerle kesiştiği
 * yerlerden parçalara ayırır.
 */

/** Bundan kısa parçalar atılır, bundan yakın kesim noktaları birleştirilir (dünya birimi). */
export const MIN_CUT_PIECE = 0.5;

/** Kesici: başka bir çizgi (stroke ya da şekil kenarları). */
export interface Cutter {
  /** Kırık çizginin noktaları (kapalı şekilde son nokta ilkine eşit). */
  points: readonly Point[];
  /** Uçları T birleşimi için sayılır mı (açık çizgi). */
  open: boolean;
  width: number;
  bounds: Rect;
}

export function strokeCutter(stroke: Stroke): Cutter {
  const p = stroke.points;
  const points: Point[] = [];
  for (let i = 0; i + 1 < p.length; i += 2) points.push({ x: p[i], y: p[i + 1] });
  return { points, open: true, width: stroke.style.width, bounds: strokeBounds(stroke) };
}

export function polylineCutter(points: readonly Point[], closed: boolean, width: number): Cutter {
  const pts = closed && points.length > 2 ? [...points, points[0]] : [...points];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const q of pts) {
    minX = Math.min(minX, q.x);
    maxX = Math.max(maxX, q.x);
    minY = Math.min(minY, q.y);
    maxY = Math.max(maxY, q.y);
  }
  return {
    points: pts,
    open: !closed,
    width,
    bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
  };
}

/** İki doğru parçasının kesişim parametreleri (t: ab üzerinde, u: cd üzerinde); kesişmiyorsa null. */
function intersect(a: Point, b: Point, c: Point, d: Point): { t: number; u: number } | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null; // paralel / çakışık: kesim sayılmaz
  const qx = c.x - a.x;
  const qy = c.y - a.y;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u };
}

/** Noktanın doğru parçası üzerindeki izdüşüm parametresi (0..1) ve uzaklığı. */
function project(p: Point, a: Point, b: Point): { t: number; dist: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return { t, dist: Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)) };
}

/**
 * Stroke üzerindeki kesim noktaları, yay uzunluğu cinsinden (artan, uçlar hariç):
 *  - kesicilerle kesişimler
 *  - T birleşimi: açık kesicinin ucu stroke'a `junction` kadar yakınsa izdüşümü
 *  - stroke'un kendi kendini kestiği yerler (komşu olmayan parçalar)
 */
export function cutPositions(stroke: Stroke, cutters: readonly Cutter[], junction: number): number[] {
  const p = stroke.points;
  const n = p.length / 2;
  if (n < 2) return [];
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) pts.push({ x: p[i * 2], y: p[i * 2 + 1] });
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = cum[n - 1];
  const cuts: number[] = [];
  const at = (i: number, t: number) => cum[i] + (cum[i + 1] - cum[i]) * t;

  const box = strokeBounds(stroke);
  for (const cutter of cutters) {
    const reach = junction + (cutter.width + stroke.style.width) / 2;
    if (!rectsOverlap(box, cutter.bounds, reach)) continue;
    const cp = cutter.points;
    for (let i = 0; i + 1 < n; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      for (let j = 0; j + 1 < cp.length; j++) {
        const hit = intersect(a, b, cp[j], cp[j + 1]);
        if (hit) cuts.push(at(i, hit.t));
      }
    }
    // T birleşimi: kesicinin ucu stroke'a değiyorsa (tam kesişmeden) en yakın noktadan kes
    if (cutter.open && cp.length) {
      for (const end of [cp[0], cp[cp.length - 1]]) {
        let best: { s: number; dist: number } | null = null;
        for (let i = 0; i + 1 < n; i++) {
          const pr = project(end, pts[i], pts[i + 1]);
          if (!best || pr.dist < best.dist) best = { s: at(i, pr.t), dist: pr.dist };
        }
        if (best && best.dist <= reach) cuts.push(best.s);
      }
    }
  }

  // Kendi kesişimleri (komşu parçalar ortak uçta zaten değer)
  for (let i = 0; i + 1 < n; i++) {
    for (let j = i + 2; j + 1 < n; j++) {
      const hit = intersect(pts[i], pts[i + 1], pts[j], pts[j + 1]);
      if (hit) cuts.push(at(i, hit.t), at(j, hit.u));
    }
  }

  // Uçlara çok yakın ve birbirine çok yakın kesimler birleştirilir
  const sorted = cuts.filter((s) => s > MIN_CUT_PIECE && s < total - MIN_CUT_PIECE).sort((a, b) => a - b);
  const merged: number[] = [];
  for (const s of sorted) {
    if (!merged.length || s - merged[merged.length - 1] > MIN_CUT_PIECE) merged.push(s);
  }
  return merged;
}

/**
 * Stroke'u yay uzunluğu aralıklarına göre parçalara ayırır (sırayla).
 * Parçalar yeni kimlik alır; stil, katman ve (varsa) basınç korunur.
 */
export function splitAtPositions(stroke: Stroke, cuts: readonly number[]): Stroke[] {
  const p = stroke.points;
  const n = p.length / 2;
  if (n < 2 || !cuts.length) return [stroke];
  const pr = stroke.pressures;
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]));
  const bounds = [0, ...cuts, cum[n - 1]];

  /** Yay uzunluğu `s`'deki nokta ve basınç. */
  const sample = (s: number): { x: number; y: number; pr: number } => {
    let i = 0;
    while (i < n - 2 && cum[i + 1] < s) i++;
    const len = cum[i + 1] - cum[i];
    const t = len > 0 ? Math.max(0, Math.min(1, (s - cum[i]) / len)) : 0;
    return {
      x: p[i * 2] + (p[i * 2 + 2] - p[i * 2]) * t,
      y: p[i * 2 + 1] + (p[i * 2 + 3] - p[i * 2 + 1]) * t,
      pr: pr ? pr[i] + (pr[i + 1] - pr[i]) * t : 0,
    };
  };

  const pieces: Stroke[] = [];
  for (let k = 0; k + 1 < bounds.length; k++) {
    const s0 = bounds[k];
    const s1 = bounds[k + 1];
    if (s1 - s0 < MIN_CUT_PIECE) continue;
    const pts: number[] = [];
    const prs: number[] = [];
    const push = (q: { x: number; y: number; pr: number }) => {
      pts.push(q.x, q.y);
      prs.push(q.pr);
    };
    push(sample(s0));
    // Aradaki özgün noktalar korunur (eğri biçimi değişmez)
    for (let i = 1; i < n - 1; i++) {
      if (cum[i] > s0 && cum[i] < s1) push({ x: p[i * 2], y: p[i * 2 + 1], pr: pr ? pr[i] : 0 });
    }
    push(sample(s1));
    const piece: Stroke = { id: newStrokeId(), points: pts, style: { ...stroke.style } };
    if (pr) piece.pressures = prs;
    if (stroke.layerId) piece.layerId = stroke.layerId;
    pieces.push(piece);
  }
  return pieces;
}
