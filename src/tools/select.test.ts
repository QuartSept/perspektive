import { beforeEach, describe, expect, it } from 'vitest';
import { DrawingDocument } from '../engine/document';
import type { Point } from '../engine/geometry';
import { gridSource, PaperGrid } from '../engine/grid';
import { History } from '../engine/history';
import type { Shape } from '../engine/shapes';
import { Viewport } from '../engine/viewport';
import { PerspectiveScene } from '../perspective/scene';
import { axisSource, intersectLines, perspectiveSource, type SnapLine } from '../perspective/snapping';
import { SelectTool } from './select';
import type { ToolPointerEvent } from './tool';

let viewport: Viewport;
let doc: DrawingDocument;
let history: History;
let scene: PerspectiveScene;
let grid: PaperGrid;
let tool: SelectTool;
let perspectiveOn: boolean;
let changes: number;

const style = { width: 2, opacity: 1, ink: 'black' as const };
const shape = (id: string, kind: Shape['kind'], vertices: number[]): Shape => ({
  id,
  kind,
  vertices,
  style,
  cornerLines: true,
});

beforeEach(() => {
  viewport = new Viewport();
  doc = new DrawingDocument();
  history = new History();
  scene = new PerspectiveScene();
  scene.reset({ x: 0, y: 0, width: 1000, height: 1000 }); // noktalar (60,400) ve (940,400)
  grid = new PaperGrid();
  perspectiveOn = false;
  changes = 0;
  const persp = perspectiveSource(scene);
  const axes = axisSource();
  const gridLines = gridSource(grid);
  tool = new SelectTool(
    viewport,
    doc,
    history,
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
    () => changes++,
  );
  doc.replaceAll(
    [],
    [
      shape('r', 'rect', [100, 100, 300, 100, 300, 200, 100, 200]),
      shape('t', 'triangle', [600, 100, 700, 300, 500, 300]),
    ],
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

const verts = (id: string) => doc.getShape(id)!.vertices;

describe('seçim', () => {
  it('kenara tıklamak seçer, tutamaçlar köşelerde; boş alana tıklamak seçimi kaldırır', () => {
    tool.onPointerDown(ev({ x: 200, y: 102 }));
    tool.onPointerUp(ev({ x: 200, y: 102 }));
    expect(tool.selected?.id).toBe('r');
    expect(tool.shapeHandles).toHaveLength(4);
    expect(history.canUndo).toBe(false); // yalnızca seçim: geçmişe girmez
    tool.onPointerDown(ev({ x: 200, y: 150 })); // iç boş
    tool.onPointerUp(ev({ x: 200, y: 150 }));
    expect(tool.selected).toBeNull();
    expect(changes).toBeGreaterThan(0);
  });

  it('seçili şekil silinir ve geri alınır; geri alınan şekil kalkınca seçim de düşer', () => {
    tool.select('t');
    expect(tool.deleteSelected()).toBe(true);
    expect(doc.getShape('t')).toBeUndefined();
    history.undo();
    expect(doc.getShape('t')).toBeDefined();
    tool.select('t');
    doc.replaceAll([], []);
    expect(tool.selected).toBeNull();
    expect(tool.deleteSelected()).toBe(false);
  });
});

describe('köşe düzenleme', () => {
  it('dikdörtgen köşesi: karşı köşe sabit, dikdörtgen kalır; tek adımda geri alınır', () => {
    tool.select('r');
    drag({ x: 300, y: 200 }, { x: 350, y: 260 });
    expect(verts('r')).toEqual([100, 100, 350, 100, 350, 260, 100, 260]);
    // Karşı köşeyi aşan sürükleme: ters dönmüş ama hâlâ eksenlere paralel
    drag({ x: 100, y: 100 }, { x: 400, y: 300 });
    expect(verts('r')).toEqual([400, 300, 350, 300, 350, 260, 400, 260]);
    history.undo();
    expect(verts('r')).toEqual([100, 100, 350, 100, 350, 260, 100, 260]);
    history.undo();
    expect(verts('r')).toEqual([100, 100, 300, 100, 300, 200, 100, 200]);
    expect(tool.selected?.id).toBe('r'); // aynı kimlik: seçim korunur
  });

  it('dikdörtgen sırası dönmüş olsa da (kâğıt döndürme) karşı köşe sabit kalır', () => {
    doc.replaceAll([], [shape('q', 'rect', [300, 100, 300, 200, 100, 200, 100, 100])]);
    tool.select('q');
    drag({ x: 300, y: 100 }, { x: 320, y: 80 });
    expect(verts('q')).toEqual([320, 80, 320, 200, 100, 200, 100, 80]);
  });

  it('çokgen / üçgen köşesi serbest; ızgara açıkken ızgaraya yapışır', () => {
    tool.select('t');
    drag({ x: 600, y: 100 }, { x: 640, y: 70 });
    expect(verts('t').slice(0, 2)).toEqual([640, 70]);
    grid.setSnap(true);
    const g = grid.spacing;
    drag({ x: 640, y: 70 }, { x: 17 * g + 3, y: 2 * g - 2 });
    expect(verts('t')[0]).toBeCloseTo(17 * g);
    expect(verts('t')[1]).toBeCloseTo(2 * g);
  });

  it('iki komşu kenar da bir doğruya yakınsa köşe kesişime oturur', () => {
    perspectiveOn = true;
    doc.replaceAll([], [shape('p', 'polygon', [400, 700, 520, 640, 600, 760])]);
    tool.select('p');
    // Ortadaki köşe: (400,700)→sağ kaçış noktası ve (600,760)→sol kaçış noktası doğrularının kesişimine yakın
    const a = { x: 400, y: 700 };
    const b = { x: 600, y: 760 };
    const [l, r] = scene.points;
    const toR = { origin: a, direction: unit(r.x - a.x, r.y - a.y), kind: 'vanishing-point' as const };
    const toL = { origin: b, direction: unit(l.x - b.x, l.y - b.y), kind: 'vanishing-point' as const };
    const x = intersectLines(toR, toL)!;
    drag({ x: 520, y: 640 }, { x: x.x + 4, y: x.y - 3 });
    expect(verts('p')[2]).toBeCloseTo(x.x);
    expect(verts('p')[3]).toBeCloseTo(x.y);
  });

  it('doğru parçası ucu diğer uca göre eksene oturur', () => {
    doc.replaceAll([], [shape('s', 'segment', [100, 500, 300, 520])]);
    tool.select('s');
    drag({ x: 300, y: 520 }, { x: 320, y: 506 });
    expect(verts('s')).toEqual([100, 500, 320, 500]);
  });
});

describe('taşıma', () => {
  it('kenardan sürüklemek şekli taşır; ızgara açıkken ilk köşe ızgaraya oturur', () => {
    drag({ x: 200, y: 100 }, { x: 230, y: 140 });
    expect(verts('r')).toEqual([130, 140, 330, 140, 330, 240, 130, 240]);
    grid.setSnap(true);
    const g = grid.spacing;
    drag({ x: 230, y: 140 }, { x: 230 + (4 * g - 130) + 2, y: 140 + (4 * g - 140) - 3 });
    expect(verts('r')[0]).toBeCloseTo(4 * g);
    expect(verts('r')[1]).toBeCloseTo(4 * g);
  });

  it('sürüklerken özgün şekil gizlenir, önizleme gösterilir; iptal belgeyi değiştirmez', () => {
    tool.onPointerDown(ev({ x: 200, y: 100 }));
    tool.onPointerMove(ev({ x: 260, y: 130 }));
    expect([...(tool.hiddenShapeIds ?? [])]).toEqual(['r']);
    expect(tool.previewShape?.vertices[0]).toBe(160);
    tool.onPointerCancel();
    expect(tool.previewShape).toBeNull();
    expect(verts('r')[0]).toBe(100);
    expect(history.canUndo).toBe(false);
  });
});

function unit(x: number, y: number): Point {
  const len = Math.hypot(x, y);
  return { x: x / len, y: y / len };
}

describe('köşe çizgisi geçişi', () => {
  it('seçili şeklin köşe çizgileri kapatılır ve geri alınır', () => {
    tool.select('r');
    tool.setCornerLines(false);
    expect(doc.getShape('r')!.cornerLines).toBe(false);
    expect(doc.shapeIndexOf('r')).toBe(0);
    history.undo();
    expect(doc.getShape('r')!.cornerLines).toBe(true);
  });
});

describe('klavye ve dokunma', () => {
  it('seçili şekil ok tuşlarıyla kaydırılır, her adım geri alınır; seçim yokken işlenmez', () => {
    expect(tool.nudge(5, 0)).toBe(false);
    tool.select('r');
    tool.nudge(5, 0);
    tool.nudge(0, -2);
    expect(verts('r').slice(0, 2)).toEqual([105, 98]);
    history.undo();
    expect(verts('r').slice(0, 2)).toEqual([105, 100]);
  });

  it('parmakla tutamaç ve kenar daha geniş alandan yakalanır', () => {
    tool.select('r');
    const touch = (p: Point): ToolPointerEvent => ({ ...ev(p), pointerType: 'touch' });
    // Köşeden 15 px uzak: farede kaçar, parmakla yakalanır
    tool.onPointerDown(touch({ x: 315, y: 200 }));
    tool.onPointerMove(touch({ x: 360, y: 240 }));
    tool.onPointerUp(touch({ x: 360, y: 240 }));
    expect(verts('r')).toEqual([100, 100, 345, 100, 345, 240, 100, 240]);
  });
});
