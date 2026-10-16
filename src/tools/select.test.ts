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

describe('katmanlar', () => {
  it('kilitli ya da gizli katmandaki şekil seçilemez; seçiliyken kilitlenirse seçim düşer', () => {
    const bottom = doc.layers[0].id;
    doc.setLayers([{ ...doc.layers[0], locked: true }]);
    tool.onPointerDown(ev({ x: 200, y: 102 }));
    tool.onPointerUp(ev({ x: 200, y: 102 }));
    expect(tool.selected).toBeNull();
    doc.setLayers([{ ...doc.layers[0], locked: false }]);
    tool.select('r');
    expect(tool.selected?.id).toBe('r');
    doc.setLayers([{ ...doc.layers[0], id: bottom, visible: false }]);
    expect(tool.selected).toBeNull();
  });

  it('seçili şekil başka katmana taşınır, sırası korunur, geri alınır', () => {
    doc.setLayers([...doc.layers, { id: 'top', name: '', visible: true, locked: false, opacity: 1 }]);
    tool.select('r');
    tool.moveToLayer('top');
    expect(doc.getShape('r')!.layerId).toBe('top');
    expect(doc.shapeIndexOf('r')).toBe(0);
    history.undo();
    expect(doc.getShape('r')!.layerId).toBeUndefined();
  });
});

describe('kutu', () => {
  it('dikdörtgen kutuya dönüşür (aynı kimlik), arka köşe derinliği, ön köşe ön yüzü değiştirir', () => {
    tool.select('r');
    tool.convertToBox('vp', { x: 700, y: 150 });
    const box = doc.getShape('r')!;
    expect(box.kind).toBe('box');
    expect(tool.shapeHandles).toHaveLength(8);
    // Arka köşe 4 (ön köşe 0'ın karşılığı): kaçış noktasına doğru sürüklenir
    const b4 = { x: box.vertices[8], y: box.vertices[9] };
    const toward = { x: 100 + (700 - 100) * 0.6, y: 100 + (150 - 100) * 0.6 };
    drag(b4, toward);
    expect(doc.getShape('r')!.box!.depth).toBeCloseTo(0.6);
    // Ön köşe 2: dikdörtgen gibi (karşı köşe sabit), arka yüz izler
    drag({ x: 300, y: 200 }, { x: 340, y: 240 });
    const after = doc.getShape('r')!;
    expect(after.vertices.slice(0, 8)).toEqual([100, 100, 340, 100, 340, 240, 100, 240]);
    expect(after.vertices[12]).toBeCloseTo(340 + (700 - 340) * 0.6);
  });

  it('kutu taşınınca arka yüz kaçış noktasına göre yeniden hesaplanır', () => {
    tool.select('r');
    tool.convertToBox('vp', { x: 700, y: 150 });
    const depth = doc.getShape('r')!.box!.depth;
    drag({ x: 200, y: 100 }, { x: 230, y: 120 });
    const box = doc.getShape('r')!;
    expect(box.vertices.slice(0, 2)).toEqual([130, 120]);
    expect(box.vertices[8]).toBeCloseTo(130 + (700 - 130) * depth);
  });

  it('kaydırıcı gibi adım adım düzenleme tek adımda geri alınır', () => {
    tool.select('r');
    tool.convertToBox('vp', { x: 700, y: 150 });
    for (const d of [0.4, 0.5, 0.6]) {
      tool.editSelected((s) => ({ ...s, box: { ...s.box!, depth: d } }), d === 0.6);
    }
    expect(doc.getShape('r')!.box!.depth).toBe(0.6);
    history.undo();
    expect(doc.getShape('r')!.box!.depth).toBe(0.3);
    history.undo();
    expect(doc.getShape('r')!.kind).toBe('rect');
  });
});

describe('2 noktalı kutu ve çizgiye dönüştürme', () => {
  const L = { id: 'L', x: 0, y: 200 };
  const R = { id: 'R', x: 1000, y: 200 };

  function twoPointBox() {
    doc.replaceAll([], [shape('s', 'segment', [400, 300, 400, 500])]);
    tool.select('s');
    tool.convertSegmentToBox(L, R);
    return doc.getShape('s')!;
  }

  it('segment kutuya dönüşür; yan köşe o yöndeki, arka köşe iki derinliği değiştirir', () => {
    const box = twoPointBox();
    expect(box.kind).toBe('box');
    expect(box.box!.second!.depth).toBe(0.25);
    // Köşe 1 (A1): L yönünde %50'ye
    const a1 = { x: box.vertices[2], y: box.vertices[3] };
    drag(a1, { x: 400 + (0 - 400) * 0.5, y: 300 + (200 - 300) * 0.5 });
    expect(doc.getShape('s')!.box!.depth).toBeCloseTo(0.5);
    expect(doc.getShape('s')!.box!.second!.depth).toBeCloseTo(0.25);
    // Köşe 2 (C): arka köşeyi bir noktaya taşı → C o noktaya oturur
    const b = doc.getShape('s')!;
    const target = { x: b.vertices[4] + 10, y: b.vertices[5] - 4 };
    drag({ x: b.vertices[4], y: b.vertices[5] }, target);
    const c = doc.getShape('s')!;
    expect(c.vertices[4]).toBeCloseTo(target.x, 0);
    expect(c.vertices[5]).toBeCloseTo(target.y, 0);
  });

  it('ön kenarın üst ucu yalnızca yüksekliği değiştirir', () => {
    twoPointBox();
    drag({ x: 400, y: 300 }, { x: 430, y: 260 });
    const v = doc.getShape('s')!.vertices;
    expect([v[0], v[1], v[8], v[9]]).toEqual([400, 260, 400, 500]);
  });

  it('çizgilere dönüştür: dikdörtgen 4 çizgi; kesikli kutuda arkada kalan kenarlar aktarılmaz; geri alınır', () => {
    tool.select('r');
    tool.convertToStrokes();
    expect(doc.getShape('r')).toBeUndefined();
    expect(doc.strokes.filter((st) => st.points.length === 4)).toHaveLength(4);
    expect(tool.selected).toBeNull();
    history.undo();
    expect(doc.getShape('r')).toBeDefined();
    expect(doc.strokes).toHaveLength(0);

    const box = twoPointBox();
    const before = doc.strokes.length;
    tool.select(box.id);
    tool.convertToStrokes();
    // 12 kenardan 3'ü arkada (kutu göz hizasının altında): 9 çizgi
    expect(doc.strokes.length - before).toBe(9);
  });
});
