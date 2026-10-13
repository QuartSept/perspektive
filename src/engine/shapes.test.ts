import { describe, expect, it } from 'vitest';
import { removeItemsCommand, addShapeCommand } from './commands';
import { DrawingDocument } from './document';
import { History } from './history';
import { OrientationCommand } from './orientation';
import { Paper } from './paper';
import {
  isClosed,
  mapShape,
  rectVertices,
  segmentTouchesShape,
  shapeBounds,
  shapeEdges,
  triangleVertices,
  type Shape,
} from './shapes';
import { PerspectiveScene } from '../perspective/scene';

const shape = (id: string, kind: Shape['kind'], vertices: number[]): Shape => ({
  id,
  kind,
  vertices,
  style: { width: 2, opacity: 1, ink: 'black' },
  cornerLines: true,
});

describe('şekil geometrisi', () => {
  it('dikdörtgen ve üçgen köşeleri', () => {
    expect(rectVertices({ x: 0, y: 0 }, { x: 10, y: 5 })).toEqual([0, 0, 10, 0, 10, 5, 0, 5]);
    expect(triangleVertices({ x: 10, y: 0 }, { x: 0, y: 8 })).toEqual([5, 0, 10, 8, 0, 8]);
  });

  it('kapalı şekilde son kenar ilk köşeye döner; doğru parçası açık', () => {
    expect(isClosed('segment')).toBe(false);
    expect(shapeEdges(shape('a', 'triangle', [0, 0, 10, 0, 5, 8]))).toHaveLength(3);
    expect(shapeEdges(shape('b', 'segment', [0, 0, 10, 0]))).toHaveLength(1);
    expect(shapeBounds(shape('c', 'rect', rectVertices({ x: 2, y: 3 }, { x: 12, y: 8 })))).toEqual({
      x: 2,
      y: 3,
      width: 10,
      height: 5,
    });
  });

  it('silgi teması kenarlara bakar (iç boş)', () => {
    const r = shape('r', 'rect', rectVertices({ x: 0, y: 0 }, { x: 100, y: 100 }));
    // Kapanış kenarı (sol): x = 0
    expect(segmentTouchesShape(r, { x: -3, y: 50 }, { x: -3, y: 60 }, 2)).toBe(true);
    // İçeride, kenarlardan uzak
    expect(segmentTouchesShape(r, { x: 40, y: 40 }, { x: 60, y: 60 }, 2)).toBe(false);
  });

  it('mapShape köşeleri dönüştürür, kimlik ve stil korunur', () => {
    const s = shape('m', 'segment', [1, 2, 3, 4]);
    const m = mapShape(s, (p) => ({ x: -p.y, y: p.x }));
    expect(m.vertices).toEqual([-2, 1, -4, 3]);
    expect(m.id).toBe('m');
    expect(s.vertices).toEqual([1, 2, 3, 4]);
  });
});

describe('belge ve komutlar', () => {
  it('şekil ekle / sil geri alınır; stroke ve şekil tek adımda silinir', () => {
    const doc = new DrawingDocument();
    const history = new History();
    history.execute(addShapeCommand(doc, shape('a', 'segment', [0, 0, 1, 1])));
    history.execute(addShapeCommand(doc, shape('b', 'segment', [0, 0, 2, 2])));
    doc.splice([], [{ index: 0, stroke: { id: 's', points: [0, 0], style: { width: 1, opacity: 1, ink: 'black' } } }]);
    expect(doc.isEmpty).toBe(false);

    history.execute(removeItemsCommand(doc, ['s'], ['a', 'b'])!);
    expect(doc.isEmpty).toBe(true);
    history.undo();
    expect(doc.shapes.map((s) => s.id)).toEqual(['a', 'b']);
    expect(doc.strokes.map((s) => s.id)).toEqual(['s']);
    expect(removeItemsCommand(doc, [], [])).toBeNull();
  });

  it('kâğıt döndürme şekilleri de döndürür ve geri alınır', () => {
    const paper = new Paper('a4', { width: 1000, height: 700 });
    const doc = new DrawingDocument();
    const scene = new PerspectiveScene();
    scene.reset(paper.rect);
    doc.replaceAll([], [shape('a', 'segment', [10, 20, 30, 40])]);
    const H = paper.height;
    const history = new History();
    history.execute(new OrientationCommand(paper, doc, scene, 'landscape', () => {}));
    expect(doc.shapes[0].vertices).toEqual([H - 20, 10, H - 40, 30]);
    history.undo();
    expect(doc.shapes[0].vertices).toEqual([10, 20, 30, 40]);
  });
});
