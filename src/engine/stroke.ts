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
  /**
   * Kalem basıncı, nokta başına 0..1 (yalnızca kalemle çizilen serbest
   * stroke'larda). Varsa kalınlık noktadan noktaya değişir.
   */
  pressures?: number[];
  /** Katman kimliği (yoksa ya da bilinmiyorsa en alttaki katman). */
  layerId?: string;
}

/** Basınç → kalınlık çarpanı: tam basınçta ayarlanan kalınlık, hafifte %20'si. */
export function pressureWidthFactor(pressure: number): number {
  return 0.2 + 0.8 * Math.min(1, Math.max(0, pressure));
}

/**
 * Değişken kalınlıklı stroke'un dış hattı (yuvarlak uçlarla). Doldurularak
 * çizilir: yarı saydam stroke'ta üst üste binen yerler koyulaşmaz.
 */
export function strokeOutline(
  points: readonly number[],
  pressures: readonly number[],
  width: number,
  capSteps = 6,
): Point[] {
  const n = points.length / 2;
  const at = (i: number): Point => ({ x: points[i * 2], y: points[i * 2 + 1] });
  const hw = (i: number) => (width * pressureWidthFactor(pressures[i] ?? 1)) / 2;
  const circle = (c: Point, r: number, from: number, to: number, steps: number): Point[] =>
    Array.from({ length: steps - 1 }, (_, k) => {
      const a = from + ((to - from) * (k + 1)) / steps;
      return { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r };
    });

  if (n === 1) {
    const c = at(0);
    return circle(c, hw(0), 0, Math.PI * 2, capSteps * 2 + 1);
  }

  // Her noktada teğete dik birim vektör (komşu noktalardan)
  const normals: Point[] = [];
  let last = { x: 0, y: -1 };
  for (let i = 0; i < n; i++) {
    const a = at(Math.max(0, i - 1));
    const b = at(Math.min(n - 1, i + 1));
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > 1e-9) last = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
    normals.push(last);
  }

  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i < n; i++) {
    const p = at(i);
    const r = hw(i);
    left.push({ x: p.x + normals[i].x * r, y: p.y + normals[i].y * r });
    right.push({ x: p.x - normals[i].x * r, y: p.y - normals[i].y * r });
  }
  const angleEnd = Math.atan2(normals[n - 1].y, normals[n - 1].x);
  const angleStart = Math.atan2(normals[0].y, normals[0].x);
  return [
    ...left,
    // Uç: soldan sağa, ileri yönden geçerek
    ...circle(at(n - 1), hw(n - 1), angleEnd, angleEnd - Math.PI, capSteps),
    ...right.reverse(),
    // Baş: sağdan sola, geri yönden geçerek
    ...circle(at(0), hw(0), angleStart + Math.PI, angleStart, capSteps),
  ];
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
export function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  color: string,
  alphaFactor = 1,
): void {
  const p = stroke.points;
  const n = p.length / 2;
  if (n === 0) return;
  const { width, opacity } = stroke.style;

  ctx.globalAlpha = opacity * alphaFactor;
  if (stroke.pressures) {
    const outline = strokeOutline(p, stroke.pressures, width);
    ctx.beginPath();
    ctx.moveTo(outline[0].x, outline[0].y);
    for (let i = 1; i < outline.length; i++) ctx.lineTo(outline[i].x, outline[i].y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }
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
