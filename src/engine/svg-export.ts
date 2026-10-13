import type { Point } from './geometry';
import { gridLines } from './grid';
import { PX_PER_MM } from './paper';
import { isClosed, type Shape } from './shapes';
import { strokeOutline, type InkId, type Stroke } from './stroke';
import { rayAngles } from '../perspective/rays';
import type { PerspectiveScene } from '../perspective/scene';

/** SVG için gereken renkler (CanvasTheme'in alt kümesi; DOM'suz test edilebilsin diye). */
export interface SvgTheme {
  inks: Record<InkId, string>;
  printPaper: string;
  vanishingPoints: string[];
  horizon: string;
  markerFill: string;
  printGuideOpacity: number;
  /** Kâğıt ızgarası rengi (opaklık renkte olabilir). */
  grid: string;
}

export interface SvgSources {
  paper: { width: number; height: number };
  strokes: readonly Stroke[];
  /** Şekiller stroke'ların altında yazılır. */
  shapes?: readonly Shape[];
  scene: PerspectiveScene;
  theme: SvgTheme;
  /** Görünür kâğıt ızgarasının aralığı (dünya birimi); yoksa ızgara yazılmaz. */
  gridSpacing?: number | null;
}

/** Kılavuz çizgi kalınlıkları dünya biriminde (ekran/yazdırma çıktısıyla aynı). */
const RAY_WIDTH = 1;
const HORIZON_WIDTH = 1.25;
const MARKER_RADIUS = 5.5;
const MARKER_STROKE = 2;
const GRID_WIDTH = 0.75;

const num = (v: number): string => String(Math.round(v * 100) / 100);

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * `rgba(r, g, b, a)` → ayrı renk + opaklık. Bazı vektör düzenleyiciler
 * öznitelikte rgba tanımadığı için opaklık ayrı yazılır.
 */
export function splitAlpha(color: string): { color: string; alpha: number } {
  const m = color.match(/^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/i);
  if (!m) return { color, alpha: 1 };
  return { color: `rgb(${m[1]}, ${m[2]}, ${m[3]})`, alpha: Number(m[4]) };
}

/** drawStroke ile aynı geometri: orta noktalardan geçen ikinci derece eğriler. */
export function strokePathData(points: readonly number[]): string {
  const n = points.length / 2;
  const parts = [`M${num(points[0])} ${num(points[1])}`];
  for (let i = 1; i < n - 1; i++) {
    const x = points[i * 2];
    const y = points[i * 2 + 1];
    const mx = (x + points[i * 2 + 2]) / 2;
    const my = (y + points[i * 2 + 3]) / 2;
    parts.push(`Q${num(x)} ${num(y)} ${num(mx)} ${num(my)}`);
  }
  parts.push(`L${num(points[(n - 1) * 2])} ${num(points[(n - 1) * 2 + 1])}`);
  return parts.join(' ');
}

function strokeElement(stroke: Stroke, color: string): string {
  const { width, opacity } = stroke.style;
  const op = opacity < 1 ? ` opacity="${num(opacity)}"` : '';
  const p = stroke.points;
  if (stroke.pressures) {
    // Değişken kalınlık: dış hat doldurulur
    const o = strokeOutline(p, stroke.pressures, width);
    const d = `M${o.map((q) => `${num(q.x)} ${num(q.y)}`).join('L')}Z`;
    return `<path d="${d}" fill="${esc(color)}"${op}/>`;
  }
  if (p.length === 2) {
    return `<circle cx="${num(p[0])}" cy="${num(p[1])}" r="${num(width / 2)}" fill="${esc(color)}"${op}/>`;
  }
  // Stroke opaklığı tek path'e uygulanır: kendi üstüne binen yerler koyulaşmaz
  return `<path d="${strokePathData(p)}" fill="none" stroke="${esc(color)}" stroke-width="${num(width)}" stroke-linecap="round" stroke-linejoin="round"${op}/>`;
}

function shapeElement(shape: Shape, color: string): string {
  const v = shape.vertices;
  const parts: string[] = [];
  for (let i = 0; i < v.length; i += 2) parts.push(`${i === 0 ? 'M' : 'L'}${num(v[i])} ${num(v[i + 1])}`);
  const d = parts.join('') + (isClosed(shape.kind) ? 'Z' : '');
  const { width, opacity } = shape.style;
  const op = opacity < 1 ? ` opacity="${num(opacity)}"` : '';
  return `<path d="${d}" fill="none" stroke="${esc(color)}" stroke-width="${num(width)}" stroke-linecap="round" stroke-linejoin="round"${op}/>`;
}

/** Noktadan sayfanın en uzak köşesine uzaklık (+pay): ışınlar sayfayı baştan sona keser. */
function reach(p: Point, w: number, h: number): number {
  const dx = Math.max(Math.abs(p.x), Math.abs(w - p.x));
  const dy = Math.max(Math.abs(p.y), Math.abs(h - p.y));
  return Math.hypot(dx, dy) + 2;
}

function gridElement(src: SvgSources, spacing: number): string | null {
  const { width: w, height: h } = src.paper;
  const { xs, ys } = gridLines({ x: 0, y: 0, width: w, height: h }, spacing);
  if (!xs.length && !ys.length) return null;
  const d = [
    ...xs.map((x) => `M${num(x)} 0V${num(h)}`),
    ...ys.map((y) => `M0 ${num(y)}H${num(w)}`),
  ].join('');
  const { color, alpha } = splitAlpha(src.theme.grid);
  return `<path id="grid" d="${d}" fill="none" stroke="${esc(color)}" stroke-width="${GRID_WIDTH}" opacity="${num(alpha)}"/>`;
}

function guideElements(src: SvgSources): string[] {
  const { scene, theme } = src;
  const { width: w, height: h } = src.paper;
  const out: string[] = [];
  if (src.gridSpacing) {
    const grid = gridElement(src, src.gridSpacing);
    if (grid) out.push(grid);
  }
  const horizon = scene.horizon();
  const angles = rayAngles(scene.rayCount, horizon?.angle ?? 0);

  scene.activePoints.forEach((p) => {
    const r = reach(p, w, h);
    const d = angles
      .map((a) => `M${num(p.x)} ${num(p.y)}L${num(p.x + Math.cos(a) * r)} ${num(p.y + Math.sin(a) * r)}`)
      .join('');
    const color = theme.vanishingPoints[scene.colorIndexOf(p) % theme.vanishingPoints.length];
    out.push(
      `<path d="${d}" fill="none" stroke="${esc(color)}" stroke-width="${RAY_WIDTH}" opacity="${num(theme.printGuideOpacity)}"/>`,
    );
  });

  if (horizon) {
    const r = reach(horizon.origin, w, h);
    const dx = Math.cos(horizon.angle) * r;
    const dy = Math.sin(horizon.angle) * r;
    const { color, alpha } = splitAlpha(theme.horizon);
    const o = horizon.origin;
    out.push(
      `<line x1="${num(o.x - dx)}" y1="${num(o.y - dy)}" x2="${num(o.x + dx)}" y2="${num(o.y + dy)}" stroke="${esc(color)}" stroke-width="${HORIZON_WIDTH}" opacity="${num(alpha)}"/>`,
    );
  }

  scene.activePoints.forEach((p) => {
    const color = theme.vanishingPoints[scene.colorIndexOf(p) % theme.vanishingPoints.length];
    out.push(
      `<circle cx="${num(p.x)}" cy="${num(p.y)}" r="${MARKER_RADIUS}" fill="${esc(theme.markerFill)}" stroke="${esc(color)}" stroke-width="${MARKER_STROKE}"/>`,
    );
  });
  return out;
}

/**
 * Kâğıt alanını SVG olarak üretir. Boyut mm cinsinden yazılır (gerçek ölçek),
 * içerik dünya biriminde (`viewBox`). Kâğıt dışına taşanlar kırpılır.
 * Kılavuzlar çizimin altındadır (PNG/yazdırma ile aynı).
 */
export function buildSvg(src: SvgSources, includeGuides: boolean): string {
  const { width: w, height: h } = src.paper;
  const body: string[] = [];
  if (includeGuides) body.push(`<g id="guides">${guideElements(src).join('')}</g>`);
  const shapes = (src.shapes ?? []).map((s) => shapeElement(s, src.theme.inks[s.style.ink]));
  const strokes = src.strokes.map((s) => strokeElement(s, src.theme.inks[s.style.ink]));
  body.push(`<g id="drawing">${[...shapes, ...strokes].join('')}</g>`);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(w / PX_PER_MM)}mm" height="${num(h / PX_PER_MM)}mm" viewBox="0 0 ${num(w)} ${num(h)}">`,
    '<title>Perspektif</title>',
    `<defs><clipPath id="page"><rect width="${num(w)}" height="${num(h)}"/></clipPath></defs>`,
    `<rect width="${num(w)}" height="${num(h)}" fill="${esc(src.theme.printPaper)}"/>`,
    `<g clip-path="url(#page)">${body.join('')}</g>`,
    '</svg>',
    '',
  ].join('\n');
}
