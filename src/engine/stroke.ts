import type { Point } from './geometry';

export const INK_IDS = [
  'black',
  'gray-dark',
  'gray',
  'gray-light',
  'red',
  'blue',
  'green',
  'ochre',
] as const;
export type InkId = (typeof INK_IDS)[number];

export interface StrokeStyle {
  /** Dünya birimi (kâğıtla birlikte ölçeklenir). */
  width: number;
  /** 0..1, stroke'un tamamına uygulanır (kendi üstüne binmesi koyulaşmaz). */
  opacity: number;
  ink: InkId;
}

export interface Stroke {
  id: string;
  /** Düz dizi: [x0, y0, x1, y1, ...] dünya koordinatı. */
  points: number[];
  style: StrokeStyle;
}

export const newStrokeId = (): string => `s-${Math.random().toString(36).slice(2, 10)}`;

export function pointCount(stroke: Stroke): number {
  return stroke.points.length / 2;
}

export function lastPoint(stroke: Stroke): Point | null {
  const n = stroke.points.length;
  return n >= 2 ? { x: stroke.points[n - 2], y: stroke.points[n - 1] } : null;
}

/**
 * Stroke'u bağlamın mevcut (dünya) dönüşümüyle çizer.
 * Ara noktalar orta noktalardan geçen ikinci derece eğrilerle yumuşatılır.
 */
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, color: string): void {
  const p = stroke.points;
  const n = p.length / 2;
  if (n === 0) return;
  const { width, opacity } = stroke.style;

  ctx.globalAlpha = opacity;
  if (n === 1) {
    ctx.beginPath();
    ctx.arc(p[0], p[1], width / 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }

  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  for (let i = 1; i < n - 1; i++) {
    const x = p[i * 2];
    const y = p[i * 2 + 1];
    const mx = (x + p[i * 2 + 2]) / 2;
    const my = (y + p[i * 2 + 3]) / 2;
    ctx.quadraticCurveTo(x, y, mx, my);
  }
  ctx.lineTo(p[(n - 1) * 2], p[(n - 1) * 2 + 1]);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.globalAlpha = 1;
}
