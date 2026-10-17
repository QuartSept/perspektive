import type { Point } from '../engine/geometry';
import type { EditorState } from '../engine/state';
import type { CanvasTheme } from '../engine/theme';
import type { Viewport } from '../engine/viewport';
import { proximityWeight, rayAngles, rayOpacities } from './rays';
import type { PerspectiveScene } from './scene';
import type { CornerLine } from './corner-lines';
import type { SnapLine } from './snapping';

/** İşaretçi yarıçapı ve çizgisi `markerScale` = 1'de (CSS piksel). */
export const MARKER_RADIUS = 5.5;
const MARKER_STROKE = 2;

/** Ölçeğe göre işaretçi yarıçapı ve çizgi kalınlığı (çizgi çok incelmesin). */
export function markerMetrics(scale: number): { radius: number; stroke: number } {
  return { radius: MARKER_RADIUS * scale, stroke: Math.max(1.25, MARKER_STROKE * scale) };
}

export interface GuideView {
  ctx: CanvasRenderingContext2D;
  dpr: number;
  viewport: Viewport;
  scene: PerspectiveScene;
  state: EditorState;
  theme: CanvasTheme;
}

/** Ekrandaki noktadan görünür alanın en uzak köşesine uzaklık. */
function reachToCorners(p: Point, width: number, height: number): number {
  const dx = Math.max(Math.abs(p.x), Math.abs(width - p.x));
  const dy = Math.max(Math.abs(p.y), Math.abs(height - p.y));
  return Math.hypot(dx, dy) + 2;
}

/** Her kaçış noktası için 0..1 vurgu ağırlığı. */
function emphasisWeights(view: GuideView, screens: Point[]): number[] {
  const { scene, state } = view;
  if (state.draggingPointId) {
    return scene.activePoints.map((p) => (p.id === state.draggingPointId ? 1 : 0));
  }
  const pointer = state.pointer;
  if (!pointer) return scene.activePoints.map(() => 0);
  return screens.map((s) => proximityWeight(Math.hypot(s.x - pointer.x, s.y - pointer.y)));
}

export function vanishingPointColor(theme: CanvasTheme, index: number): string {
  return theme.vanishingPoints[index % theme.vanishingPoints.length];
}

/** Hayalet ışınlar ve ufuk çizgisi (ekran uzayında, 1 CSS px). */
export function drawGuides(view: GuideView): void {
  const { ctx, dpr, viewport, scene, state, theme } = view;
  const { width, height } = viewport;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineCap = 'butt';

  const horizon = scene.horizon();
  const baseAngle = horizon?.angle ?? 0;
  const points = scene.activePoints;
  const screens = points.map((p) => viewport.worldToScreen(p));
  const opacities = rayOpacities(
    emphasisWeights(view, screens),
    theme.guideOpacity,
    theme.guideOpacityStrong,
    theme.guideOpacityDim,
  );
  // Işınlar ekranda çizilir: görünüm dönükse açılar da döner
  const angles = rayAngles(scene.rayCount, viewport.screenAngle(baseAngle));

  screens.forEach((s, i) => {
    const reach = reachToCorners(s, width, height);
    ctx.beginPath();
    for (const a of angles) {
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + Math.cos(a) * reach, s.y + Math.sin(a) * reach);
    }
    ctx.globalAlpha = opacities[i];
    ctx.strokeStyle = vanishingPointColor(theme, scene.colorIndexOf(points[i]));
    ctx.lineWidth = 1;
    ctx.stroke();
  });
  ctx.globalAlpha = 1;

  if (horizon) {
    const o = viewport.worldToScreen(horizon.origin);
    const reach = reachToCorners(o, width, height);
    const angle = viewport.screenAngle(horizon.angle);
    const dx = Math.cos(angle) * reach;
    const dy = Math.sin(angle) * reach;
    const active = state.horizonHovered;
    ctx.beginPath();
    ctx.moveTo(o.x - dx, o.y - dy);
    ctx.lineTo(o.x + dx, o.y + dy);
    ctx.strokeStyle = active ? theme.horizonActive : theme.horizon;
    ctx.lineWidth = active ? 2 : 1.25;
    ctx.stroke();
  }
}

/**
 * İmleç çizgileri: her kaçış noktasından imlecin üzerinden geçip ekran
 * kenarına kadar uzanan ince, soluk çizgi (nokta renginde); imlecin iki
 * yanında da yol gösterir. Kılavuzlar gizliyken de çizilir.
 */
export function drawCursorRays(view: GuideView, pointer: Point): void {
  const { ctx, dpr, viewport, scene, theme } = view;
  const points = scene.activePoints;
  if (!points.length) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.save();
  ctx.lineWidth = 1;
  ctx.globalAlpha = theme.cursorRayOpacity;
  // İmleçten bu kadar öteye uzatılınca çizgi her durumda ekrandan çıkar
  const reach = Math.hypot(ctx.canvas.width, ctx.canvas.height) / dpr;
  for (const p of points) {
    const s = viewport.worldToScreen(p);
    const dx = pointer.x - s.x;
    const dy = pointer.y - s.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(pointer.x + (dx / len) * reach, pointer.y + (dy / len) * reach);
    ctx.strokeStyle = vanishingPointColor(theme, scene.colorIndexOf(p));
    ctx.stroke();
  }
  ctx.restore();
}

/** Köşe çizgisi kesik deseni, CSS piksel. */
export const CORNER_LINE_DASH = [5, 4];

/** Köşe kaçış çizgileri: kaçış noktası renginde, kesikli (hayalet ışınlardan ayrışsın). */
export function drawCornerLines(view: GuideView, lines: readonly CornerLine[]): void {
  if (!lines.length) return;
  const { ctx, dpr, viewport, scene, theme } = view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.save();
  ctx.setLineDash(CORNER_LINE_DASH);
  ctx.lineWidth = 1;
  ctx.globalAlpha = theme.cornerLineOpacity;
  // Renge göre tek path: çok şekilde de hızlı
  const byColor = new Map<number, CornerLine[]>();
  for (const l of lines) {
    const i = scene.colorIndexOf(l.point);
    byColor.set(i, [...(byColor.get(i) ?? []), l]);
  }
  for (const [index, group] of byColor) {
    ctx.beginPath();
    for (const l of group) {
      const a = viewport.worldToScreen(l.from);
      const b = viewport.worldToScreen(l.to);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.strokeStyle = vanishingPointColor(theme, index);
    ctx.stroke();
  }
  ctx.restore();
}

/** Kilitli perspektif doğrusu: kalın, vurgu renginde, ekran boyunca. */
export function drawSnapLine(view: GuideView, line: SnapLine): void {
  const { ctx, dpr, viewport, theme } = view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const o = viewport.worldToScreen(line.origin);
  const reach = reachToCorners(o, viewport.width, viewport.height);
  const dir = viewport.screenDirection(line.direction);
  const dx = dir.x * reach;
  const dy = dir.y * reach;
  ctx.beginPath();
  ctx.moveTo(o.x - dx, o.y - dy);
  ctx.lineTo(o.x + dx, o.y + dy);
  ctx.strokeStyle = theme.snap;
  ctx.globalAlpha = theme.snapOpacity;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Kaçış noktası işaretçileri (üzerine gelme / seçim durumlarıyla). */
export function drawMarkers(view: GuideView): void {
  const { ctx, dpr, viewport, scene, state, theme } = view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const { radius, stroke } = markerMetrics(state.markerScale);
  scene.activePoints.forEach((p) => {
    const s = viewport.worldToScreen(p);
    const color = vanishingPointColor(theme, scene.colorIndexOf(p));
    const selected = state.selectedPointId === p.id;
    const hot = selected || state.hoveredPointId === p.id || state.draggingPointId === p.id;

    if (hot) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, radius + 6, 0, Math.PI * 2);
      ctx.fillStyle = theme.markerHalo;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(s.x, s.y, hot ? radius + 1 : radius, 0, Math.PI * 2);
    ctx.fillStyle = selected ? color : theme.markerFill;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = stroke;
    ctx.stroke();
  });
}
