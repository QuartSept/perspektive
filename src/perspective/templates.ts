import type { Point } from '../engine/geometry';
import { newStrokeId, type Stroke, type StrokeStyle } from '../engine/stroke';
import type { PerspectiveMode, VanishingPoint } from './scene';

export const TEMPLATE_IDS = ['cube', 'road', 'room', 'room-corner', 'blank-2', 'blank-1'] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export interface TemplateResult {
  mode: PerspectiveMode;
  points: VanishingPoint[];
  strokes: Stroke[];
}

/** Üzerinden geçilecek açık kılavuz çizgilerin stili. */
export const TEMPLATE_STYLE: StrokeStyle = { width: 1.5, opacity: 1, ink: 'gray-light' };

interface Size {
  width: number;
  height: number;
}

const vp = (x: number, y: number): VanishingPoint => ({
  id: `vp-${Math.random().toString(36).slice(2, 10)}`,
  x,
  y,
});

/** Şablon çizgileri ayrı iki noktalı stroke'lardır (çok noktalı stroke köşeleri yumuşatır). */
const segment = (a: Point, b: Point): Stroke => ({
  id: newStrokeId(),
  points: [a.x, a.y, b.x, b.y],
  style: { ...TEMPLATE_STYLE },
});

/** `a`→`b` doğrusunun verilen x'teki noktası. */
function atX(a: Point, b: Point, x: number): Point {
  const t = (x - a.x) / (b.x - a.x);
  return { x, y: a.y + (b.y - a.y) * t };
}

/** İki doğrunun (a1→a2, b1→b2) kesişimi. */
function intersect(a1: Point, a2: Point, b1: Point, b2: Point): Point {
  const d = (a1.x - a2.x) * (b1.y - b2.y) - (a1.y - a2.y) * (b1.x - b2.x);
  const s = a1.x * a2.y - a1.y * a2.x;
  const t = b1.x * b2.y - b1.y * b2.x;
  return {
    x: (s * (b1.x - b2.x) - (a1.x - a2.x) * t) / d,
    y: (s * (b1.y - b2.y) - (a1.y - a2.y) * t) / d,
  };
}

/** `from` noktasından `dir` yönünde kâğıt kenarına kadar (from kâğıdın içinde). */
export function toPaperEdge(from: Point, dir: Point, size: Size): Point {
  let t = Infinity;
  if (dir.x > 0) t = Math.min(t, (size.width - from.x) / dir.x);
  if (dir.x < 0) t = Math.min(t, -from.x / dir.x);
  if (dir.y > 0) t = Math.min(t, (size.height - from.y) / dir.y);
  if (dir.y < 0) t = Math.min(t, -from.y / dir.y);
  return { x: from.x + dir.x * t, y: from.y + dir.y * t };
}

/** Kaçış noktasından uzaklaşan yönde kenara: oda duvarları izleyiciye doğru açılır. */
function awayFrom(point: Point, vanishing: Point, size: Size): Point {
  return toPaperEdge(point, { x: point.x - vanishing.x, y: point.y - vanishing.y }, size);
}

/** 2 nokta: ufkun altında üst yüzü görünen bir kutu. */
function cube({ width: W, height: H }: Size): TemplateResult {
  const hy = H * 0.4;
  const v1 = vp(W * 0.06, hy);
  const v2 = vp(W * 0.94, hy);
  const cx = W * 0.48;
  const a = { x: cx, y: hy + H * 0.16 }; // ön kenar üstü
  const b = { x: cx, y: hy + H * 0.36 }; // ön kenar altı
  const xl = cx - W * 0.17;
  const xr = cx + W * 0.2;
  const tl = atX(a, v1, xl);
  const bl = atX(b, v1, xl);
  const tr = atX(a, v2, xr);
  const br = atX(b, v2, xr);
  const back = intersect(tl, v2, tr, v1);
  return {
    mode: 2,
    points: [v1, v2],
    strokes: [
      segment(a, b),
      segment(tl, bl),
      segment(tr, br),
      segment(a, tl),
      segment(a, tr),
      segment(b, bl),
      segment(b, br),
      segment(tl, back),
      segment(tr, back),
    ],
  };
}

/** 1 nokta: ufka uzanan yol ve perspektifle kısalan orta şerit. */
function road({ width: W, height: H }: Size): TemplateResult {
  const hy = H * 0.45;
  const v = vp(W * 0.5, hy);
  const strokes = [segment({ x: W * 0.08, y: H }, v), segment({ x: W * 0.92, y: H }, v)];
  // Eşit aralıklı derinlik: ekran y'si ufka yaklaştıkça sıklaşır
  let y = H;
  for (let k = 0; k < 9; k++) {
    const next = hy + (y - hy) * 0.72;
    strokes.push(segment({ x: W * 0.5, y }, { x: W * 0.5, y: y - (y - next) * 0.5 }));
    y = next;
  }
  return { mode: 1, points: [v], strokes };
}

/** 1 nokta: arka duvar ve köşelerinden kâğıt kenarına açılan duvar/zemin/tavan çizgileri. */
function room(size: Size): TemplateResult {
  const { width: W, height: H } = size;
  const v = vp(W * 0.5, H * 0.45);
  const tl = { x: W * 0.3, y: H * 0.3 };
  const tr = { x: W * 0.7, y: H * 0.3 };
  const br = { x: W * 0.7, y: H * 0.62 };
  const bl = { x: W * 0.3, y: H * 0.62 };
  return {
    mode: 1,
    points: [v],
    strokes: [
      segment(tl, tr),
      segment(tr, br),
      segment(br, bl),
      segment(bl, tl),
      ...[tl, tr, br, bl].map((c) => segment(c, awayFrom(c, v, size))),
    ],
  };
}

/** 2 nokta: içeriden bakılan oda köşesi; kaçış noktaları kâğıt dışında. */
function roomCorner(size: Size): TemplateResult {
  const { width: W, height: H } = size;
  const hy = H * 0.45;
  const v1 = vp(-W * 0.2, hy);
  const v2 = vp(W * 1.2, hy);
  const top = { x: W * 0.5, y: H * 0.14 };
  const bottom = { x: W * 0.5, y: H * 0.84 };
  return {
    mode: 2,
    points: [v1, v2],
    strokes: [
      segment(top, bottom),
      // Sol duvar sağ kaçış noktasına, sağ duvar sol kaçış noktasına kaçar
      segment(bottom, awayFrom(bottom, v2, size)),
      segment(bottom, awayFrom(bottom, v1, size)),
      segment(top, awayFrom(top, v2, size)),
      segment(top, awayFrom(top, v1, size)),
    ],
  };
}

export function buildTemplate(id: TemplateId, size: Size): TemplateResult {
  const { width: W, height: H } = size;
  switch (id) {
    case 'cube':
      return cube(size);
    case 'road':
      return road(size);
    case 'room':
      return room(size);
    case 'room-corner':
      return roomCorner(size);
    case 'blank-2':
      return { mode: 2, points: [vp(W * 0.06, H * 0.4), vp(W * 0.94, H * 0.4)], strokes: [] };
    case 'blank-1':
      return { mode: 1, points: [vp(W * 0.5, H * 0.4)], strokes: [] };
  }
}
