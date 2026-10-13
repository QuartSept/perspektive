import { beforeEach, describe, expect, it } from 'vitest';
import { DrawingDocument } from '../engine/document';
import type { Point } from '../engine/geometry';
import { History } from '../engine/history';
import { Viewport } from '../engine/viewport';
import { PerspectiveScene } from '../perspective/scene';
import { distanceToLine, perspectiveSource } from '../perspective/snapping';
import { BrushTool } from './brush';
import { BrushSettings } from './brush-settings';
import type { ToolPointerEvent } from './tool';

/**
 * Fırçanın uçtan uca davranışı. Hareketler ekran pikseli cinsinden verilir;
 * dünya koordinatına görünüm ölçeğiyle çevrilir (yakınlaştırma testleri için).
 */
let viewport: Viewport;
let doc: DrawingDocument;
let scene: PerspectiveScene;
let magnetActive: boolean;
let brush: BrushTool;

beforeEach(() => {
  viewport = new Viewport();
  doc = new DrawingDocument();
  scene = new PerspectiveScene();
  scene.reset({ x: 0, y: 0, width: 1000, height: 1000 }); // noktalar (60,400) ve (940,400)
  const settings = new BrushSettings();
  settings.setSmoothing(0);
  magnetActive = true;
  brush = new BrushTool(
    viewport,
    doc,
    new History(),
    settings,
    perspectiveSource(scene),
    { isActive: () => magnetActive, radius: 20 },
    () => {},
  );
});

function ev(screen: Point): ToolPointerEvent {
  const world = viewport.screenToWorld(screen);
  return {
    screen,
    world,
    samples: [{ ...world, pressure: 0.5 }],
    pointerType: 'mouse',
    pressure: 0.5,
    native: {} as PointerEvent,
  };
}

/** Ekran noktaları boyunca stroke çizer; son stroke'u döndürür. */
function draw(path: Point[]) {
  brush.onPointerDown(ev(path[0]));
  for (const p of path.slice(1)) brush.onPointerMove(ev(p));
  brush.onPointerUp(ev(path[path.length - 1]));
  return doc.strokes[doc.strokes.length - 1];
}

/** `from`'dan `to` yönüne, dik yönde ±wobble titreyerek ilerleyen yol. */
function wobblyPath(from: Point, to: Point, steps: number, stepPx: number, wobble: number): Point[] {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const d = { x: (to.x - from.x) / len, y: (to.y - from.y) / len };
  return Array.from({ length: steps + 1 }, (_, i) => {
    const w = i === 0 ? 0 : i % 2 ? wobble : -wobble;
    return { x: from.x + d.x * i * stepPx - d.y * w, y: from.y + d.y * i * stepPx + d.x * w };
  });
}

const vp = (i: number) => scene.points[i];

describe('BrushTool snapping', () => {
  it('kaçış noktasına doğru titrek çizgi düz ve noktaya hizalı çıkar', () => {
    const stroke = draw(wobblyPath({ x: 400, y: 800 }, vp(1), 15, 10, 3));
    expect(stroke.points).toHaveLength(4);
    const line = {
      origin: { x: stroke.points[0], y: stroke.points[1] },
      direction: (() => {
        const dx = stroke.points[2] - stroke.points[0];
        const dy = stroke.points[3] - stroke.points[1];
        const l = Math.hypot(dx, dy);
        return { x: dx / l, y: dy / l };
      })(),
      kind: 'vanishing-point' as const,
    };
    expect(distanceToLine(line, vp(1))).toBeLessThan(1e-6);
  });

  it('yakınlaştırmadan bağımsız: aynı ekran hareketi 2x ölçekte de kilitlenir', () => {
    viewport.setScale(2, { x: 0, y: 0 });
    const target = viewport.worldToScreen(vp(1));
    const start = viewport.worldToScreen({ x: 400, y: 800 });
    const stroke = draw(wobblyPath(start, target, 15, 10, 3));
    expect(stroke.points).toHaveLength(4);
  });

  it('yarıçap aşılınca kilit bırakılır ve aynı stroke içinde yeniden alınmaz', () => {
    const path = wobblyPath({ x: 400, y: 800 }, vp(1), 6, 10, 0);
    const last = path[path.length - 1];
    // Doğrudan 40 px uzaklaş, sonra çizgiye geri dön
    path.push({ x: last.x + 30, y: last.y + 40 }, { x: last.x + 10, y: last.y - 5 });
    expect(brush.snapLine).toBeNull();
    const stroke = draw(path);
    expect(stroke.points.length).toBeGreaterThan(4);
  });

  it('mıknatıs kapalıyken serbest çizer', () => {
    magnetActive = false;
    const stroke = draw(wobblyPath({ x: 400, y: 800 }, vp(1), 15, 10, 3));
    expect(stroke.points.length).toBeGreaterThan(4);
  });

  it('kaçış noktasından başlayan stroke o noktadan çıkan ışına kilitlenir', () => {
    const p = vp(0);
    const start = { x: p.x + 4, y: p.y - 3 };
    // ~60° aşağı-sağa: "başlangıç → nokta" yönüyle ilgisi yok
    const stroke = draw(wobblyPath(start, { x: start.x + 200, y: start.y + 350 }, 12, 10, 2));
    expect(stroke.points).toHaveLength(4);
    const [x0, y0, x1, y1] = stroke.points;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const line = {
      origin: { x: x0, y: y0 },
      direction: { x: (x1 - x0) / len, y: (y1 - y0) / len },
      kind: 'vanishing-point' as const,
    };
    expect(distanceToLine(line, p)).toBeLessThan(1e-6);
  });

  it('iki aday neredeyse eşitse ilk pikselerde kilitlenmez, 40 px sonra kilitlenir', () => {
    const start = { x: 500, y: 405 };
    brush.onPointerDown(ev(start));
    brush.onPointerMove(ev({ x: 520, y: 405 }));
    expect(brush.snapLine).toBeNull();
    brush.onPointerMove(ev({ x: 545, y: 405 }));
    expect(brush.snapLine).not.toBeNull();
    brush.onPointerUp(ev({ x: 545, y: 405 }));
  });
});
