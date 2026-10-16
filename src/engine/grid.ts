import type { Point, Rect } from './geometry';
import { PX_PER_MM } from './paper';
import {
  DEFAULT_GRID,
  GRID_SPACINGS_MM,
  type GridSpacingMm,
  type SavedGrid,
} from '../storage/format';
import type { SnapLine, SnapSource } from '../perspective/snapping';

/** Izgara yapışma eşiği, ekran pikseli (yakınlaştırmadan bağımsız hissettirir). */
export const GRID_SNAP_PX = 8;
/** Ekranda aralık bundan küçükse ızgara çizilmez; iki katına dek soluklaşarak belirir. */
export const GRID_MIN_SCREEN_PX = 5;

/** Bir koordinat ızgara çizgisi üzerinde sayılır (yapışmış başlangıç noktası). */
const ON_LINE_EPSILON = 1e-6;

/**
 * Kâğıt ızgarası (mm tabanlı, kâğıdın sol üst köşesinden başlar). Çizim verisi
 * değildir; yalnızca ayarı kayıtta tutulur. Göster kapalı + yapış açık = görünmez cetvel.
 */
export class PaperGrid {
  visible = DEFAULT_GRID.visible;
  snap = DEFAULT_GRID.snap;
  spacingMm: GridSpacingMm = DEFAULT_GRID.spacingMm;
  /** Kâğıdın merkezinden geçen yatay ve dikey kılavuz. */
  centerMark = DEFAULT_GRID.centerMark;
  private listeners = new Set<() => void>();

  /** Aralık, dünya biriminde. */
  get spacing(): number {
    return this.spacingMm * PX_PER_MM;
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    this.emit();
  }

  setSnap(snap: boolean): void {
    if (snap === this.snap) return;
    this.snap = snap;
    this.emit();
  }

  setSpacing(mm: GridSpacingMm): void {
    if (mm === this.spacingMm || !GRID_SPACINGS_MM.includes(mm)) return;
    this.spacingMm = mm;
    this.emit();
  }

  setCenterMark(on: boolean): void {
    if (on === this.centerMark) return;
    this.centerMark = on;
    this.emit();
  }

  restore(saved: SavedGrid): void {
    this.visible = saved.visible;
    this.snap = saved.snap;
    this.spacingMm = saved.spacingMm;
    this.centerMark = saved.centerMark;
    this.emit();
  }

  toSaved(): SavedGrid {
    return {
      visible: this.visible,
      snap: this.snap,
      spacingMm: this.spacingMm,
      centerMark: this.centerMark,
    };
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}

export interface GridSnapResult {
  point: Point;
  /** x dikey bir ızgara çizgisine oturdu. */
  snappedX: boolean;
  /** y yatay bir ızgara çizgisine oturdu. */
  snappedY: boolean;
}

/**
 * Noktayı ızgaraya yapıştırır: her koordinat ayrı ayrı en yakın çizgiye
 * `tolerance` içindeyse oturur. İkisi birden oturursa nokta düğüme yapışmış olur.
 */
export function snapToGrid(p: Point, spacing: number, tolerance: number): GridSnapResult {
  const gx = Math.round(p.x / spacing) * spacing;
  const gy = Math.round(p.y / spacing) * spacing;
  const snappedX = Math.abs(p.x - gx) <= tolerance;
  const snappedY = Math.abs(p.y - gy) <= tolerance;
  return {
    point: { x: snappedX ? gx : p.x, y: snappedY ? gy : p.y },
    snappedX,
    snappedY,
  };
}

/**
 * Doğru üzerindeki noktayı (izdüşüm) doğrunun en yakın ızgara çizgisini
 * kestiği yere kaydırır; `tolerance` içinde kesişim yoksa null.
 * Kilitli çizginin ucu böylece ızgara çizgilerinde biter.
 */
export function snapAlongLine(
  line: SnapLine,
  p: Point,
  spacing: number,
  tolerance: number,
): Point | null {
  const { origin: o, direction: d } = line;
  const t0 = (p.x - o.x) * d.x + (p.y - o.y) * d.y;
  const q = { x: o.x + d.x * t0, y: o.y + d.y * t0 };
  let best: Point | null = null;
  let bestDist = tolerance;
  // Dikey ızgara çizgisiyle (x sabit) ve yatay ızgara çizgisiyle (y sabit) kesişim
  for (const axis of ['x', 'y'] as const) {
    const dir = d[axis];
    if (Math.abs(dir) < 1e-9) continue;
    const target = Math.round(q[axis] / spacing) * spacing;
    const dt = (target - q[axis]) / dir;
    // Doğru boyunca uzaklık (d birim vektör)
    const dist = Math.abs(dt);
    if (dist <= bestDist) {
      bestDist = dist;
      best = { x: q.x + d.x * dt, y: q.y + d.y * dt };
    }
  }
  return best;
}

/**
 * Mıknatıs aday kaynağı: başlangıç (yapıştırılmış) bir ızgara çizgisi
 * üzerindeyse o çizgi. Düğümdeyse yatay ve dikey ikisi birden.
 */
export function gridSource(grid: PaperGrid): SnapSource {
  return (start) => {
    if (!grid.snap) return [];
    const s = grid.spacing;
    const lines: SnapLine[] = [];
    const onLine = (v: number) => Math.abs(v - Math.round(v / s) * s) < ON_LINE_EPSILON;
    if (onLine(start.y)) lines.push({ origin: start, direction: { x: 1, y: 0 }, kind: 'horizontal' });
    if (onLine(start.x)) lines.push({ origin: start, direction: { x: 0, y: 1 }, kind: 'vertical' });
    return lines;
  };
}

/** Görünür alan için ızgara çizgisi koordinatları (kâğıtla kırpılmış). */
export function gridLines(
  paper: Rect,
  spacing: number,
  view: Rect = paper,
): { xs: number[]; ys: number[] } {
  const left = Math.max(paper.x, view.x);
  const right = Math.min(paper.x + paper.width, view.x + view.width);
  const top = Math.max(paper.y, view.y);
  const bottom = Math.min(paper.y + paper.height, view.y + view.height);
  const xs: number[] = [];
  const ys: number[] = [];
  if (right <= left || bottom <= top) return { xs, ys };
  // Kâğıt kenarları da ızgara çizgisi sayılmaz (kenar zaten çizili): yalnızca iç çizgiler
  for (let k = Math.ceil(left / spacing); k * spacing <= right; k++) {
    const x = k * spacing;
    if (x > paper.x && x < paper.x + paper.width) xs.push(x);
  }
  for (let k = Math.ceil(top / spacing); k * spacing <= bottom; k++) {
    const y = k * spacing;
    if (y > paper.y && y < paper.y + paper.height) ys.push(y);
  }
  return { xs, ys };
}

/** Ekrandaki aralığa göre ızgara opaklık çarpanı (0 = çizilmez). */
export function gridFade(spacingScreenPx: number): number {
  if (spacingScreenPx < GRID_MIN_SCREEN_PX) return 0;
  return Math.min(1, (spacingScreenPx - GRID_MIN_SCREEN_PX) / GRID_MIN_SCREEN_PX);
}

/** Izgarayı dünya dönüşümü uygulanmış bağlama çizer; çizgi kalınlığı `lineWidth` dünya birimi. */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  paper: Rect,
  spacing: number,
  color: string,
  lineWidth: number,
  alpha: number,
  view?: Rect,
): void {
  if (alpha <= 0) return;
  const { xs, ys } = gridLines(paper, spacing, view);
  if (!xs.length && !ys.length) return;
  ctx.beginPath();
  for (const x of xs) {
    ctx.moveTo(x, paper.y);
    ctx.lineTo(x, paper.y + paper.height);
  }
  for (const y of ys) {
    ctx.moveTo(paper.x, y);
    ctx.lineTo(paper.x + paper.width, y);
  }
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'butt';
  ctx.stroke();
  ctx.restore();
}

/** Merkez işareti kesik deseni, dünya birimi değil çizim birimi (`lineWidth` ile ölçeklenir). */
const CENTER_DASH = [6, 4];

/**
 * Kâğıdın merkezinden geçen yatay ve dikey kesikli çizgiler. Dönüşüm uygulanmış
 * bağlama çizilir; `lineWidth` dünya birimidir (ekranda 1 CSS px için 1 / ölçek).
 */
export function drawCenterMark(
  ctx: CanvasRenderingContext2D,
  paper: Rect,
  color: string,
  lineWidth: number,
): void {
  const cx = paper.x + paper.width / 2;
  const cy = paper.y + paper.height / 2;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, paper.y);
  ctx.lineTo(cx, paper.y + paper.height);
  ctx.moveTo(paper.x, cy);
  ctx.lineTo(paper.x + paper.width, cy);
  ctx.setLineDash(CENTER_DASH.map((d) => d * lineWidth));
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.restore();
}
