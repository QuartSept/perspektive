import { beforeEach, describe, expect, it } from 'vitest';
import { DrawingDocument } from '../engine/document';
import type { Point } from '../engine/geometry';
import { gridSource, PaperGrid } from '../engine/grid';
import { History } from '../engine/history';
import { Viewport } from '../engine/viewport';
import { cornerLines, cornerLineSource, preferCornerLines } from '../perspective/corner-lines';
import { parallelCandidates, type Segment } from '../perspective/parallel';
import { PerspectiveScene } from '../perspective/scene';
import { combineSources, distanceToLine, perspectiveSource } from '../perspective/snapping';
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
let grid: PaperGrid;
let gridSpaceHeld: boolean;
let parallelOn: boolean;
let segments: Segment[];
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
  grid = new PaperGrid();
  gridSpaceHeld = false;
  parallelOn = true;
  segments = [];
  brush = new BrushTool(
    viewport,
    doc,
    new History(),
    settings,
    combineSources(perspectiveSource(scene), gridSource(grid)),
    { isActive: () => magnetActive, radius: 20 },
    { isActive: () => straightActive, axisSnap: () => axisSnapOn, parallelSnap: () => parallelOn, parallelLines: (start) => parallelCandidates(segments, start, 1) },
    {
      isActive: () => grid.snap && !gridSpaceHeld,
      get spacing() {
        return grid.spacing;
      },
    },
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

describe('düz çizgi', () => {
  beforeEach(() => {
    straightActive = true;
  });

  it('perspektif açıkken: kaçış noktasına 4° yakın düz çizgi tam ışına oturur, uzakta serbest', () => {
    // (300,300) → sağ nokta (940,400): ~8.9°
    const a = Math.atan2(100, 640) + (3 * Math.PI) / 180;
    const s = draw([{ x: 300, y: 300 }, { x: 300 + Math.cos(a) * 300, y: 300 + Math.sin(a) * 300 }]);
    const ray = { origin: { x: 300, y: 300 }, direction: { x: 640 / Math.hypot(640, 100), y: 100 / Math.hypot(640, 100) }, kind: 'vanishing-point' as const };
    expect(distanceToLine(ray, { x: s.points[2], y: s.points[3] })).toBeCloseTo(0);
    const b = (40 * Math.PI) / 180;
    const free = draw([{ x: 300, y: 300 }, { x: 300 + Math.cos(b) * 200, y: 300 + Math.sin(b) * 200 }]);
    expect(free.points[2]).toBeCloseTo(300 + Math.cos(b) * 200);
    // Mıknatıs kapalıyken kaçış ışınına yapışmaz
    magnetActive = false;
    const off = draw([{ x: 300, y: 300 }, { x: 300 + Math.cos(a) * 300, y: 300 + Math.sin(a) * 300 }]);
    expect(off.points[3]).toBeCloseTo(300 + Math.sin(a) * 300);
  });

  it('mevcut düz çizgiye 4° yakın düz çizgi tam paralel olur; ayar kapalıyken olmaz', () => {
    magnetActive = false;
    axisSnapOn = false;
    // 25° eğik referans çizgi
    const ref = (25 * Math.PI) / 180;
    segments = [{ a: { x: 500, y: 600 }, b: { x: 500 + Math.cos(ref) * 300, y: 600 + Math.sin(ref) * 300 } }];
    const a = ref + (2.5 * Math.PI) / 180;
    const path = [{ x: 300, y: 300 }, { x: 300 + Math.cos(a) * 250, y: 300 + Math.sin(a) * 250 }];
    const s = draw(path);
    const angle = Math.atan2(s.points[3] - s.points[1], s.points[2] - s.points[0]);
    expect(angle).toBeCloseTo(ref, 6);
    expect(brush.snapLine).toBeNull();
    parallelOn = false;
    const t = draw(path);
    expect(Math.atan2(t.points[3] - t.points[1], t.points[2] - t.points[0])).toBeCloseTo(a, 6);
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

describe('ızgaraya yapış', () => {
  // 10 mm ≈ 37.8 dünya birimi; görünüm ölçeği 1 (ekran = dünya)
  const g = () => grid.spacing;

  beforeEach(() => {
    grid.setSnap(true);
  });

  it('düz çizginin iki ucu da yakın ızgara düğümüne oturur', () => {
    straightActive = true;
    axisSnapOn = false;
    const s = draw([
      { x: g() + 3, y: g() - 2 },
      { x: 3 * g(), y: 1.5 * g() },
      { x: 5 * g() + 4, y: 2 * g() + 5 },
    ]);
    expect(s.points[0]).toBeCloseTo(g());
    expect(s.points[1]).toBeCloseTo(g());
    expect(s.points[2]).toBeCloseTo(5 * g());
    expect(s.points[3]).toBeCloseTo(2 * g());
  });

  it('eksene yapışan düz çizginin ucu ızgara çizgisinde biter', () => {
    straightActive = true;
    const s = draw([
      { x: g() + 2, y: g() + 1 },
      { x: 4 * g() + 5, y: g() + 3 },
    ]);
    expect(s.points[1]).toBeCloseTo(g());
    expect(s.points[3]).toBeCloseTo(g());
    expect(s.points[2]).toBeCloseTo(4 * g());
  });

  it('eşikten uzak uç ve Space basılıyken yapışma olmaz', () => {
    straightActive = true;
    axisSnapOn = false;
    const far = { x: 5 * g() + 15, y: 2 * g() + 15 };
    const s = draw([{ x: g(), y: g() }, far]);
    expect(s.points[2]).toBeCloseTo(far.x);
    expect(s.points[3]).toBeCloseTo(far.y);
    gridSpaceHeld = true;
    const t = draw([{ x: g() + 3, y: g() + 3 }, { x: 4 * g() + 3, y: 2 * g() + 3 }]);
    expect(t.points[0]).toBeCloseTo(g() + 3);
  });

  it('perspektifte ızgara çizgisi mıknatıs adayı olur: yatay çizgi kilitlenir, ucu çizgide biter', () => {
    // 2 noktada yatay aday yok; burada ışınlar ~32° ve ~48° uzakta, yatay hareket kilitlenmezdi
    const start = { x: 10 * g() + 2, y: 20 * g() + 1 };
    const s = draw(wobblyPath(start, { x: 20 * g(), y: start.y }, 12, 15, 1.5));
    expect(s.points).toHaveLength(4);
    expect(s.points[0]).toBeCloseTo(10 * g());
    expect(s.points[1]).toBeCloseTo(20 * g());
    expect(s.points[3]).toBeCloseTo(20 * g());
    const endX = s.points[2] / g();
    expect(endX).toBeCloseTo(Math.round(endX));
  });

  it('serbest stroke başlangıcı ızgaraya kaydırılmaz', () => {
    magnetActive = false;
    const start = { x: g() + 3, y: g() + 3 };
    const s = draw(wobblyPath(start, { x: 300, y: 500 }, 10, 15, 4));
    expect(s.points[0]).toBeCloseTo(start.x);
    expect(s.points[1]).toBeCloseTo(start.y);
  });
});

describe('köşe kaçış çizgisine kilit', () => {
  it('köşe çizgisinin biraz yanından başlayan stroke tam çizgiye oturur', () => {
    const shape = {
      id: 'r',
      kind: 'rect' as const,
      vertices: [400, 600, 600, 600, 600, 800, 400, 800],
      style: { width: 2, opacity: 1, ink: 'black' as const },
      cornerLines: true,
    };
    const lines = cornerLines([shape], scene.activePoints, { x: 0, y: 0, width: 1000, height: 1000 });
    const settings = new BrushSettings();
    settings.setSmoothing(0);
    brush = new BrushTool(
      viewport,
      doc,
      new History(),
      settings,
      preferCornerLines(perspectiveSource(scene), cornerLineSource(() => lines)),
      { isActive: () => true, radius: 20 },
      { isActive: () => false, axisSnap: () => false, parallelSnap: () => false, parallelLines: () => [] },
      { isActive: () => false, spacing: 10 },
      () => {},
    );
    // (600,600) köşesinden sağ kaçış noktasına (940,400) giden çizginin 3 px altından başla
    const target = vp(1);
    const d = { x: target.x - 600, y: target.y - 600 };
    const len = Math.hypot(d.x, d.y);
    const u = { x: d.x / len, y: d.y / len };
    const start = { x: 600 + u.x * 40 - u.y * 3, y: 600 + u.y * 40 + u.x * 3 };
    const s = draw(wobblyPath(start, { x: start.x + u.x * 200, y: start.y + u.y * 200 }, 15, 12, 2));
    expect(s.points).toHaveLength(4);
    const line = { origin: { x: 600, y: 600 }, direction: u, kind: 'vanishing-point' as const };
    expect(distanceToLine(line, { x: s.points[0], y: s.points[1] })).toBeCloseTo(0);
    expect(distanceToLine(line, { x: s.points[2], y: s.points[3] })).toBeCloseTo(0);
  });
});

describe('katmanlar', () => {
  it('stroke etkin katmana çizilir; kilitli katmanda çizim başlamaz ve bildirilir', () => {
    let reason = '';
    brush.onLayerBlocked = (r) => (reason = r);
    doc.setLayers([...doc.layers, { id: 'top', name: '', visible: true, locked: false, opacity: 1 }], 'top');
    const s = draw([{ x: 100, y: 100 }, { x: 140, y: 160 }, { x: 180, y: 230 }]);
    expect(s.layerId).toBe('top');
    doc.setLayers(doc.layers.map((l) => (l.id === 'top' ? { ...l, locked: true } : l)));
    const before = doc.strokes.length;
    draw([{ x: 300, y: 100 }, { x: 340, y: 160 }]);
    expect(doc.strokes).toHaveLength(before);
    expect(reason).toBe('locked');
  });
});
