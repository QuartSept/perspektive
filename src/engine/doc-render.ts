import type { DrawingDocument } from './document';
import { rectsOverlap, type Rect } from './geometry';
import { drawShape, shapeBounds, type Shape } from './shapes';
import { drawStroke, type InkId, type Stroke } from './stroke';
import { strokeBounds } from './stroke-geometry';

/** Silinmek üzere işaretli nesnelerin opaklık çarpanı. */
export const FADED_ALPHA = 0.2;

export interface DocDrawOptions {
  /** Görünür dünya dikdörtgeni: dışındaki nesneler atlanır. */
  view?: Rect;
  fadedStrokeIds?: ReadonlySet<string>;
  hiddenStrokeIds?: ReadonlySet<string>;
  fadedShapeIds?: ReadonlySet<string>;
  hiddenShapeIds?: ReadonlySet<string>;
}

/** Her hedef tuval için bir ara tuval (opaklığı 1 olmayan katmanı ayrı çizip birleştirmek için). */
const scratches = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();

function scratchFor(target: HTMLCanvasElement): CanvasRenderingContext2D {
  let canvas = scratches.get(target);
  if (!canvas) {
    canvas = document.createElement('canvas');
    scratches.set(target, canvas);
  }
  if (canvas.width !== target.width || canvas.height !== target.height) {
    canvas.width = target.width;
    canvas.height = target.height;
  }
  return canvas.getContext('2d')!;
}

/**
 * Belgeyi katman sırasıyla çizer: gizli katmanlar atlanır, katman içinde
 * şekiller stroke'ların altındadır. Opaklığı 1 olmayan katman ara tuvalde
 * çizilip tek seferde saydamlaştırılır (üst üste binen çizgiler koyulaşmaz).
 * `ctx`'e dünya dönüşümü uygulanmış olmalı.
 */
export function drawDocument(
  ctx: CanvasRenderingContext2D,
  doc: DrawingDocument,
  inks: Record<InkId, string>,
  options: DocDrawOptions = {},
): void {
  const buckets = new Map<string, { shapes: Shape[]; strokes: Stroke[] }>();
  for (const layer of doc.layers) buckets.set(layer.id, { shapes: [], strokes: [] });
  for (const shape of doc.shapes) buckets.get(doc.layerOf(shape).id)!.shapes.push(shape);
  for (const stroke of doc.strokes) buckets.get(doc.layerOf(stroke).id)!.strokes.push(stroke);

  const { view } = options;
  const drawItems = (target: CanvasRenderingContext2D, items: { shapes: Shape[]; strokes: Stroke[] }) => {
    for (const shape of items.shapes) {
      if (options.hiddenShapeIds?.has(shape.id)) continue;
      if (view && !rectsOverlap(shapeBounds(shape), view, shape.style.width / 2)) continue;
      const alpha = options.fadedShapeIds?.has(shape.id) ? FADED_ALPHA : 1;
      drawShape(target, shape, inks[shape.style.ink], alpha);
    }
    for (const stroke of items.strokes) {
      if (options.hiddenStrokeIds?.has(stroke.id)) continue;
      // Görünür alanın dışındakileri atla (yakınlaştırılmış büyük çizimlerde kazanç)
      if (view && !rectsOverlap(strokeBounds(stroke), view, stroke.style.width / 2)) continue;
      const alpha = options.fadedStrokeIds?.has(stroke.id) ? FADED_ALPHA : 1;
      drawStroke(target, stroke, inks[stroke.style.ink], alpha);
    }
  };

  for (const layer of doc.layers) {
    const items = buckets.get(layer.id)!;
    if (!layer.visible || layer.opacity <= 0) continue;
    if (!items.shapes.length && !items.strokes.length) continue;
    if (layer.opacity >= 1) {
      drawItems(ctx, items);
      continue;
    }
    const scratch = scratchFor(ctx.canvas);
    scratch.setTransform(1, 0, 0, 1, 0, 0);
    scratch.clearRect(0, 0, scratch.canvas.width, scratch.canvas.height);
    scratch.setTransform(ctx.getTransform());
    drawItems(scratch, items);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = layer.opacity;
    ctx.drawImage(scratch.canvas, 0, 0);
    ctx.restore();
  }
}
