import { describe, expect, it } from 'vitest';
import { removeItemsCommand, addShapeCommand } from './commands';
import { DrawingDocument } from './document';
import { History } from './history';
import { OrientationCommand } from './orientation';
import { Paper } from './paper';
import {
  cornerHasVisibleEdge,
  edgeCount,
  isClosed,
  mapShape,
  rectVertices,
  segmentTouchesShape,
  shapeBounds,
  shapeEdges,
  shapeVertices,
  touchedEdges,
  triangleVertices,
  visibleRuns,
  withHiddenEdges,
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

describe('silinmiş kenarlar', () => {
  const rect = shape('r', 'rect', rectVertices({ x: 0, y: 0 }, { x: 100, y: 50 }));

  it('görünen kenarlar ardışık parçalar; hiç silinmemiş kapalı şekil tek kapalı parça', () => {
    expect(visibleRuns(rect)).toEqual([{ points: shapeVertices(rect), closed: true }]);
    // Üst kenar (0) silinmiş: sağ, alt, sol tek parça (kapanış kenarı bölünmez)
    const r = visibleRuns({ ...rect, hiddenEdges: [0] });
    expect(r).toHaveLength(1);
    expect(r[0].closed).toBe(false);
    expect(r[0].points).toEqual([
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
      { x: 0, y: 0 },
    ]);
    // Karşılıklı iki kenar silinmiş: iki ayrı parça
    expect(visibleRuns({ ...rect, hiddenEdges: [0, 2] })).toHaveLength(2);
  });

  it('kenar sayısı ve köşe kuralı: köşeye değen bir kenar görünüyorsa köşe çizgisi çıkar', () => {
    expect(edgeCount(rect)).toBe(4);
    expect(edgeCount(shape('s', 'segment', [0, 0, 1, 1]))).toBe(1);
    const r = { ...rect, hiddenEdges: [0, 3] }; // köşe 0'a değen iki kenar da silinmiş
    expect(cornerHasVisibleEdge(r, 0)).toBe(false);
    expect(cornerHasVisibleEdge(r, 1)).toBe(true);
  });

  it('withHiddenEdges: tekil ve sıralı; hepsi silinirse null', () => {
    expect(withHiddenEdges(rect, [2, 0, 2])!.hiddenEdges).toEqual([0, 2]);
    expect(withHiddenEdges({ ...rect, hiddenEdges: [0, 1] }, [2, 3])).toBeNull();
  });

  it('silgi ve seçim yalnızca görünen kenarlara bakar', () => {
    const r = { ...rect, hiddenEdges: [0] };
    expect(touchedEdges(r, { x: 50, y: -2 }, { x: 50, y: 2 }, 1)).toEqual([]);
    expect(touchedEdges(r, { x: 98, y: 25 }, { x: 102, y: 25 }, 1)).toEqual([1]);
    expect(segmentTouchesShape(r, { x: 50, y: -2 }, { x: 50, y: 2 }, 1)).toBe(false);
  });
});
