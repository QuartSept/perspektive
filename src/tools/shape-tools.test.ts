import { beforeEach, describe, expect, it } from 'vitest';
import { DrawingDocument } from '../engine/document';
import type { Point } from '../engine/geometry';
import { gridSource, PaperGrid } from '../engine/grid';
import { History } from '../engine/history';
import { Viewport } from '../engine/viewport';
import { PerspectiveScene } from '../perspective/scene';
import { axisSource, distanceToLine, perspectiveSource, type SnapLine } from '../perspective/snapping';
import { ShapeSettings, ShapeTool } from './shape-tools';
import type { ToolPointerEvent } from './tool';

let viewport: Viewport;
let doc: DrawingDocument;
let history: History;
let scene: PerspectiveScene;
let grid: PaperGrid;
let settings: ShapeSettings;
let tool: ShapeTool;
let perspectiveOn: boolean;

beforeEach(() => {
  viewport = new Viewport();
  doc = new DrawingDocument();
  history = new History();
  scene = new PerspectiveScene();
  scene.reset({ x: 0, y: 0, width: 1000, height: 1000 }); // noktalar (60,400) ve (940,400)
  grid = new PaperGrid();
  settings = new ShapeSettings();
  perspectiveOn = false;
  const persp = perspectiveSource(scene);
  const axes = axisSource();
  const gridLines = gridSource(grid);
  tool = new ShapeTool(
    viewport,
    doc,
    history,
    settings,
    () => ({ width: 2, opacity: 1, ink: 'black' }),
    {
      edgeCandidates: (start, near): SnapLine[] => [
        ...(perspectiveOn ? persp(start, near) : axes(start, near)),
        ...gridLines(start, near),
      ],
      grid: {
        isActive: () => grid.snap,
        get spacing() {
          return grid.spacing;
        },
      },
    },
    () => {},
  );
});

const ev = (p: Point): ToolPointerEvent => ({
  screen: p,
  world: p,
  samples: [{ ...p, pressure: 0.5 }],
  pointerType: 'mouse',
  pressure: 0.5,
  native: {} as PointerEvent,
});

function drag(from: Point, to: Point): void {
  tool.onPointerDown(ev(from));
  tool.onPointerMove(ev({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }));
  tool.onPointerMove(ev(to));
  tool.onPointerUp(ev(to));
}

function click(p: Point): void {
  tool.onPointerMove(ev(p));
  tool.onPointerDown(ev(p));
  tool.onPointerUp(ev(p));
}

describe('sürükleyerek şekiller', () => {
  it('dikdörtgen: iki köşeden eksenlere paralel dört köşe; tek adımda geri alınır', () => {
    settings.setKind('rect');
    drag({ x: 100, y: 100 }, { x: 300, y: 200 });
    expect(doc.shapes).toHaveLength(1);
    const s = doc.shapes[0];
    expect(s.kind).toBe('rect');
    expect(s.vertices).toEqual([100, 100, 300, 100, 300, 200, 100, 200]);
    expect(s.cornerLines).toBe(true);
    history.undo();
    expect(doc.shapes).toHaveLength(0);
    history.redo();
    expect(doc.shapes).toHaveLength(1);
  });

  it('üçgen kutuya oturur (tepe üstte ortada); tıklama şekil oluşturmaz', () => {
    settings.setKind('triangle');
    drag({ x: 300, y: 300 }, { x: 100, y: 100 });
    expect(doc.shapes[0].vertices).toEqual([200, 100, 300, 300, 100, 300]);
    tool.onPointerDown(ev({ x: 50, y: 50 }));
    tool.onPointerUp(ev({ x: 51, y: 50 }));
    expect(doc.shapes).toHaveLength(1);
  });

  it('köşeler ızgaraya yapışır', () => {
    grid.setSnap(true);
    const g = grid.spacing;
    settings.setKind('rect');
    drag({ x: g + 3, y: g - 2 }, { x: 4 * g - 4, y: 3 * g + 5 });
    expect(doc.shapes[0].vertices.map((v) => v / g)).toEqual([1, 1, 4, 1, 4, 3, 1, 3]);
  });

  it('doğru parçası eksene 8° içinde oturur, daha eğikte serbest kalır', () => {
    settings.setKind('segment');
    drag({ x: 100, y: 100 }, { x: 300, y: 110 }); // ~2.9°
    expect(doc.shapes[0].vertices).toEqual([100, 100, 300, 100]);
    drag({ x: 100, y: 100 }, { x: 300, y: 160 }); // ~16.7°
    expect(doc.shapes[1].vertices).toEqual([100, 100, 300, 160]);
  });

  it('perspektifte doğru parçası kaçış noktası ışınına oturur', () => {
    perspectiveOn = true;
    settings.setKind('segment');
    const start = { x: 500, y: 800 };
    const vp = scene.points[1];
    // Işın yönünden ~5° sapan bitiş
    const a = Math.atan2(vp.y - start.y, vp.x - start.x) + (5 * Math.PI) / 180;
    drag(start, { x: start.x + Math.cos(a) * 200, y: start.y + Math.sin(a) * 200 });
    const v = doc.shapes[0].vertices;
    const ray = {
      origin: start,
      direction: { x: vp.x - start.x, y: vp.y - start.y },
      kind: 'vanishing-point' as const,
    };
    const len = Math.hypot(ray.direction.x, ray.direction.y);
    ray.direction = { x: ray.direction.x / len, y: ray.direction.y / len };
    expect(distanceToLine(ray, { x: v[2], y: v[3] })).toBeCloseTo(0);
  });
});

describe('çokgen', () => {
  beforeEach(() => settings.setKind('polygon'));

  it('tıkla-tıkla, ilk köşeye tıklayınca kapanır', () => {
    click({ x: 100, y: 100 });
    click({ x: 300, y: 130 });
    click({ x: 250, y: 300 });
    expect(tool.drawingPolygon).toBe(true);
    expect(tool.previewShapeOpen).toBe(true);
    click({ x: 104, y: 103 }); // ilk köşeye yakın
    expect(tool.drawingPolygon).toBe(false);
    expect(doc.shapes).toHaveLength(1);
    expect(doc.shapes[0].kind).toBe('polygon');
    expect(doc.shapes[0].vertices).toEqual([100, 100, 300, 130, 250, 300]);
  });

  it('çift tıklama ve Enter bitirir; iki köşeyle bitmez', () => {
    click({ x: 100, y: 100 });
    click({ x: 300, y: 130 });
    click({ x: 300, y: 130 }); // çift tıklama ama yalnızca 2 köşe
    expect(tool.drawingPolygon).toBe(true);
    click({ x: 250, y: 300 });
    click({ x: 250, y: 300 });
    expect(doc.shapes).toHaveLength(1);

    click({ x: 500, y: 500 });
    click({ x: 700, y: 530 });
    click({ x: 650, y: 700 });
    expect(tool.handleKey('Enter')).toBe(true);
    expect(doc.shapes).toHaveLength(2);
  });

  it('Backspace son köşeyi geri alır, Esc vazgeçer; çizim yokken tuşlar işlenmez', () => {
    expect(tool.handleKey('Escape')).toBe(false);
    click({ x: 100, y: 100 });
    click({ x: 300, y: 130 });
    click({ x: 250, y: 300 });
    tool.handleKey('Backspace');
    tool.handleKey('Enter'); // 2 köşe: şekil oluşmaz
    expect(doc.shapes).toHaveLength(0);
    expect(tool.drawingPolygon).toBe(false);
    click({ x: 100, y: 100 });
    click({ x: 300, y: 130 });
    expect(tool.handleKey('Escape')).toBe(true);
    expect(tool.drawingPolygon).toBe(false);
  });

  it('kenarlar eksene oturur; tür değişimi yarım çokgeni bırakır', () => {
    click({ x: 100, y: 100 });
    click({ x: 300, y: 104 }); // ~1.1°: yatay
    click({ x: 296, y: 300 }); // dikey
    tool.handleKey('Enter');
    expect(doc.shapes[0].vertices).toEqual([100, 100, 300, 100, 300, 300]);
    click({ x: 10, y: 10 });
    tool.cancel();
    expect(tool.drawingPolygon).toBe(false);
  });
});
