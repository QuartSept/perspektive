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
let straightActive: boolean;
let axisSnapOn: boolean;
let brush: BrushTool;

beforeEach(() => {
  viewport = new Viewport();
  doc = new DrawingDocument();
  scene = new PerspectiveScene();
  scene.reset({ x: 0, y: 0, width: 1000, height: 1000 }); // noktalar (60,400) ve (940,400)
  const settings = new BrushSettings();
  settings.setSmoothing(0);
  magnetActive = true;
  straightActive = false;
  axisSnapOn = true;
  brush = new BrushTool(
    viewport,
    doc,
    new History(),
    settings,
    perspectiveSource(scene),
    { isActive: () => magnetActive, radius: 20 },
    { isActive: () => straightActive, axisSnap: () => axisSnapOn },
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

describe('perspektifsiz düz çizgi', () => {
  beforeEach(() => {
    straightActive = true;
  });

  const angled = (deg: number, len = 200): Point[] => {
    const a = (deg * Math.PI) / 180;
    // Titrek yol: sonuç yalnızca başlangıç ve bitişe bağlı olmalı
    return Array.from({ length: 21 }, (_, i) => ({
      x: 300 + Math.cos(a) * len * (i / 20) + (i % 2 ? 4 : -4) * (i > 0 && i < 20 ? 1 : 0),
      y: 300 + Math.sin(a) * len * (i / 20) + (i % 3 ? 3 : -3) * (i > 0 && i < 20 ? 1 : 0),
    }));
  };

  it('fare yolundan bağımsız: başlangıç → bitiş düz, iki nokta', () => {
    const s = draw(angled(30));
    expect(s.points).toHaveLength(4);
    expect(s.points[0]).toBe(300);
    expect(s.points[1]).toBe(300);
    expect(s.points[2]).toBeCloseTo(300 + Math.cos(Math.PI / 6) * 200);
    expect(s.points[3]).toBeCloseTo(300 + Math.sin(Math.PI / 6) * 200);
  });

  it('yataya 3° yakın çizgi tam yatay, dikeye 3° yakın tam dikey olur', () => {
    const h = draw(angled(3));
    expect(h.points[3]).toBe(h.points[1]);
    const v = draw(angled(87));
    expect(v.points[2]).toBe(v.points[0]);
  });

  it('8° eğik çizgi eksene yapışmaz; eksene yapış kapalıyken 3° da yapışmaz', () => {
    const s = draw(angled(8));
    expect(s.points[3]).not.toBeCloseTo(s.points[1], 3);
    axisSnapOn = false;
    const t = draw(angled(3));
    expect(t.points[3]).not.toBeCloseTo(t.points[1], 3);
  });

  it('yapıştıktan sonra 5°’ye kadar bırakmaz (titreşme yok), 7°’de bırakır', () => {
    brush.onPointerDown(ev({ x: 0, y: 0 }));
    brush.onPointerMove(ev({ x: 100, y: 3 })); // ~1.7°: yapışır
    expect(brush.snapLine?.kind).toBe('horizontal');
    const at = (deg: number) => ({ x: 100, y: 100 * Math.tan((deg * Math.PI) / 180) });
    brush.onPointerMove(ev(at(5)));
    expect(brush.snapLine?.kind).toBe('horizontal');
    brush.onPointerMove(ev(at(7)));
    expect(brush.snapLine).toBeNull();
    brush.onPointerUp(ev(at(7)));
  });

  it('düz çizgi kapalıyken (ya da perspektifli modda) eski davranış: serbest çizim', () => {
    straightActive = false;
    magnetActive = false;
    const s = draw(angled(30));
    expect(s.points.length).toBeGreaterThan(4);
  });
});
