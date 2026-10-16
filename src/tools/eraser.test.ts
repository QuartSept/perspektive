import { beforeEach, describe, expect, it } from 'vitest';
import { DrawingDocument } from '../engine/document';
import type { Point } from '../engine/geometry';
import { History } from '../engine/history';
import { rectToBox } from '../engine/shapes';
import type { Stroke } from '../engine/stroke';
import { Viewport } from '../engine/viewport';
import { EraserSettings, EraserTool } from './eraser';
import type { ToolPointerEvent } from './tool';

let viewport: Viewport;
let doc: DrawingDocument;
let history: History;
let settings: EraserSettings;
let eraser: EraserTool;

const line = (id: string, y: number): Stroke => ({
  id,
  points: [0, y, 100, y],
  style: { width: 2, opacity: 1, ink: 'black' },
});

const ev = (p: Point): ToolPointerEvent => ({
  screen: viewport.worldToScreen(p),
  world: p,
  samples: [{ ...p, pressure: 0.5 }],
  pointerType: 'mouse',
  pressure: 0.5,
  native: {} as PointerEvent,
});

function erase(path: Point[]): void {
  eraser.onPointerDown(ev(path[0]));
  for (const p of path.slice(1)) eraser.onPointerMove(ev(p));
  eraser.onPointerUp(ev(path[path.length - 1]));
}

beforeEach(() => {
  viewport = new Viewport();
  doc = new DrawingDocument();
  history = new History();
  settings = new EraserSettings();
  settings.setRadius(5);
  eraser = new EraserTool(viewport, doc, history, settings, () => {});
  doc.replaceAll([line('a', 0), line('b', 50), line('c', 100)]);
});

describe('EraserTool', () => {
  it('bütün çizgi türü: dokunulan stroke komple silinir', () => {
    erase([{ x: 50, y: 45 }, { x: 50, y: 55 }]);
    expect(doc.strokes.map((s) => s.id)).toEqual(['a', 'c']);
  });

  it('kısmi tür: dokunulan stroke iki parçaya bölünür, sırası korunur', () => {
    settings.setKind('pixel');
    erase([{ x: 50, y: 40 }, { x: 50, y: 60 }]);
    const ids = doc.strokes.map((s) => s.id);
    expect(ids).toHaveLength(4);
    expect(ids[0]).toBe('a');
    expect(ids[3]).toBe('c');
    // Ortadaki iki parça b'nin yerinde, b'nin y'sinde
    expect(doc.strokes[1].points[1]).toBe(50);
    expect(doc.strokes[2].points[1]).toBe(50);
  });

  it('kısmi tür: birden fazla stroke tek hareketle, tek adımda geri alınır', () => {
    settings.setKind('pixel');
    erase([{ x: 50, y: -10 }, { x: 50, y: 110 }]);
    expect(doc.strokes).toHaveLength(6);
    history.undo();
    expect(doc.strokes.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    history.redo();
    expect(doc.strokes).toHaveLength(6);
  });

  it('kısmi tür: sürükleme sırasında önizleme, bırakmadan belge değişmez', () => {
    settings.setKind('pixel');
    eraser.onPointerDown(ev({ x: 50, y: 40 }));
    eraser.onPointerMove(ev({ x: 50, y: 60 }));
    expect(doc.strokes.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect([...(eraser.overlay.hiddenStrokeIds ?? [])]).toEqual(['b']);
    expect(eraser.overlay.previewStrokes).toHaveLength(2);
    eraser.onPointerCancel();
    expect(eraser.overlay.previewStrokes ?? []).toHaveLength(0);
    expect(doc.strokes.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('yarıçap ekran pikseli: 2x yakınlaştırmada dünyada yarısı kadar siler', () => {
    settings.setKind('pixel');
    viewport.setScale(2, { x: 0, y: 0 });
    erase([{ x: 50, y: 50 }]);
    const [left] = doc.strokes.filter((s) => s.points[1] === 50);
    // yarıçap 5 px / 2 = 2.5 dünya birimi + kalınlık/2 (1) → 46.5
    expect(left.points[2]).toBeCloseTo(46.5, 1);
  });
});

describe('EraserTool ve şekiller', () => {
  const rect = {
    id: 'r',
    kind: 'rect' as const,
    vertices: [200, 0, 300, 0, 300, 100, 200, 100],
    style: { width: 2, opacity: 1, ink: 'black' as const },
    cornerLines: true,
  };

  it('bütün çizgi türünde şekil komple silinir; stroke ile tek adımda geri alınır', () => {
    settings.setKind('stroke');
    doc.replaceAll([line('a', 0)], [rect]);
    // Önce stroke'a, sonra dikdörtgenin sol kenarına dokunan hareket
    erase([{ x: 50, y: -5 }, { x: 50, y: 5 }, { x: 200, y: 50 }]);
    expect(doc.shapes).toHaveLength(0);
    expect(doc.strokes.some((s) => s.id === 'a')).toBe(false);
    history.undo();
    expect(doc.shapes.map((s) => s.id)).toEqual(['r']);
    expect(doc.strokes.map((s) => s.id)).toEqual(['a']);
  });

  it('parça ve kısmi türlerinde yalnızca dokunulan kenar silinir; köşeler korunur', () => {
    for (const kind of ['segment', 'pixel'] as const) {
      settings.setKind(kind);
      doc.replaceAll([], [rect]);
      history.clear();
      // Sol kenar (kapanış kenarı, numara 3)
      erase([{ x: 195, y: 50 }, { x: 205, y: 50 }]);
      expect(doc.shapes).toHaveLength(1);
      expect(doc.shapes[0].id).toBe('r');
      expect(doc.shapes[0].hiddenEdges).toEqual([3]);
      expect(doc.shapes[0].vertices).toEqual(rect.vertices);
      history.undo();
      expect(doc.shapes[0].hiddenEdges).toBeUndefined();
    }
  });

  it('bütün kenarları silinen şekil kalkar; silinmiş kenar yeniden silinemez', () => {
    doc.replaceAll([], [{ ...rect, hiddenEdges: [0, 1, 2] }]);
    // Silinmiş üst kenardan geçmek bir şey yapmaz
    erase([{ x: 250, y: -5 }, { x: 250, y: 5 }]);
    expect(doc.shapes).toHaveLength(1);
    erase([{ x: 195, y: 50 }, { x: 205, y: 50 }]);
    expect(doc.shapes).toHaveLength(0);
  });

  it('sürüklerken kenar soluk işaretlenir (bütün çizgi türünde şekil); iptalde belge değişmez', () => {
    doc.replaceAll([], [rect]);
    eraser.onPointerDown(ev({ x: 300, y: 40 }));
    expect([...(eraser.overlay.fadedShapeEdges?.get('r') ?? [])]).toEqual([1]);
    eraser.onPointerCancel();
    expect(eraser.overlay.fadedShapeEdges?.size ?? 0).toBe(0);
    settings.setKind('stroke');
    eraser.onPointerDown(ev({ x: 300, y: 40 }));
    expect([...(eraser.overlay.fadedShapeIds ?? [])]).toEqual(['r']);
    eraser.onPointerCancel();
    expect(doc.shapes).toHaveLength(1);
  });

  it('şeklin içinden geçmek silmez', () => {
    doc.replaceAll([], [rect]);
    erase([{ x: 240, y: 40 }, { x: 260, y: 60 }]);
    expect(doc.shapes).toHaveLength(1);
  });
});

describe('EraserTool ve katmanlar', () => {
  it('kısmi silgide parçalar özgün stroke’un katmanında kalır', () => {
    settings.setKind('pixel');
    doc.replaceAll([{ ...line('k', 50), layerId: 'L2' }]);
    erase([{ x: 50, y: 40 }, { x: 50, y: 60 }]);
    expect(doc.strokes).toHaveLength(2);
    expect(doc.strokes.every((s) => s.layerId === 'L2')).toBe(true);
  });
});

describe('EraserTool katman kapsamı', () => {
  function layered() {
    // a: alt katman, b: üst (etkin) katman
    const bottom = doc.layers[0].id;
    doc.setLayers([...doc.layers, { id: 'top', name: '', visible: true, locked: false, opacity: 1 }], 'top');
    doc.replaceAll([{ ...line('a', 50), layerId: bottom }, { ...line('b', 52), layerId: 'top' }]);
    return bottom;
  }

  it('varsayılan: yalnızca etkin katman silinir', () => {
    layered();
    erase([{ x: 50, y: 40 }, { x: 50, y: 60 }]);
    expect(doc.strokes.map((s) => s.id)).toEqual(['a']);
  });

  it('tüm katmanlar: kilitli ve gizli katman yine korunur', () => {
    const bottom = layered();
    settings.setAllLayers(true);
    doc.setLayers(doc.layers.map((l) => (l.id === bottom ? { ...l, locked: true } : l)));
    erase([{ x: 50, y: 40 }, { x: 50, y: 60 }]);
    expect(doc.strokes.map((s) => s.id)).toEqual(['a']);
    doc.setLayers(doc.layers.map((l) => (l.id === bottom ? { ...l, locked: false } : l)));
    history.undo();
    erase([{ x: 50, y: 40 }, { x: 50, y: 60 }]);
    expect(doc.strokes).toHaveLength(0);
  });

  it('etkin katman kilitliyken bildirir ve silmez', () => {
    layered();
    let reason = '';
    eraser.onLayerBlocked = (r) => (reason = r);
    doc.setLayers(doc.layers.map((l) => (l.id === 'top' ? { ...l, locked: true } : l)));
    erase([{ x: 50, y: 40 }, { x: 50, y: 60 }]);
    expect(reason).toBe('locked');
    expect(doc.strokes).toHaveLength(2);
  });
});

describe('parça silgisi (kesişimden kesişime)', () => {
  const v = (id: string, x: number, y0 = -30, y1 = 130): Stroke => ({
    id,
    points: [x, y0, x, y1],
    style: { width: 2, opacity: 1, ink: 'black' },
  });

  beforeEach(() => {
    settings.setKind('segment');
    // b (y=50) yatay; 30 ve 70'te dikeyler keser
    doc.replaceAll([line('b', 50), v('p', 30), v('q', 70)]);
  });

  it('varsayılan tür parça silgisi', () => {
    expect(new EraserSettings().kind).toBe('segment');
  });

  it('iki kesişim arası silinir, uçlardaki kuyruklar ve kesen çizgiler kalır; tek adımda geri alınır', () => {
    erase([{ x: 50, y: 45 }, { x: 50, y: 55 }]);
    const pieces = doc.strokes.filter((st) => !['p', 'q'].includes(st.id));
    expect(pieces.map((st) => [st.points[0], st.points[st.points.length - 2]])).toEqual([
      [0, 30],
      [70, 100],
    ]);
    expect(doc.strokes.some((st) => st.id === 'p')).toBe(true);
    expect(doc.strokes.some((st) => st.id === 'q')).toBe(true);
    history.undo();
    expect(doc.strokes.map((st) => st.id)).toEqual(['b', 'p', 'q']);
  });

  it('kuyruğa dokununca yalnızca kuyruk silinir', () => {
    erase([{ x: 10, y: 45 }, { x: 10, y: 55 }]);
    const b = doc.strokes.filter((st) => !['p', 'q'].includes(st.id));
    // Kalan 30–70 ve 70–100 silinmediği için yeniden tek çizgi
    expect(b.map((st) => [st.points[0], st.points[st.points.length - 2]])).toEqual([[30, 100]]);
  });

  it('kesişimi olmayan çizgi bütünüyle silinir', () => {
    doc.replaceAll([line('yalniz', 50)]);
    erase([{ x: 50, y: 45 }, { x: 50, y: 55 }]);
    expect(doc.strokes).toHaveLength(0);
  });

  it('T birleşimi: çizginin üstünde biten dikey de bölme noktasıdır', () => {
    doc.replaceAll([line('b', 50), v('t', 40, -30, 48.5)]);
    erase([{ x: 70, y: 45 }, { x: 70, y: 55 }]);
    const b = doc.strokes.filter((st) => st.id !== 't');
    expect(b).toHaveLength(1);
    expect(b[0].points[b[0].points.length - 2]).toBeCloseTo(40);
  });

  it('gizli katmandaki çizgi kesici sayılmaz; kilitli katmandaki sayılır', () => {
    const bottom = doc.layers[0].id;
    doc.setLayers([...doc.layers, { id: 'K', name: '', visible: true, locked: true, opacity: 1 }], bottom);
    doc.replaceAll([{ ...line('b', 50), layerId: bottom }, { ...v('p', 30), layerId: 'K' }]);
    erase([{ x: 10, y: 45 }, { x: 10, y: 55 }]);
    expect(doc.strokes.find((st) => st.id !== 'p')!.points[0]).toBeCloseTo(30);
    history.undo();
    doc.setLayers(doc.layers.map((l) => (l.id === 'K' ? { ...l, visible: false } : l)), bottom);
    erase([{ x: 10, y: 45 }, { x: 10, y: 55 }]);
    expect(doc.strokes.map((st) => st.id)).toEqual(['p']);
  });

  it('sürüklerken silinecek parça soluk, kalanlar normal önizlenir; iptalde belge değişmez', () => {
    eraser.onPointerDown(ev({ x: 50, y: 45 }));
    eraser.onPointerMove(ev({ x: 50, y: 55 }));
    expect([...(eraser.overlay.hiddenStrokeIds ?? [])]).toEqual(['b']);
    expect(eraser.overlay.fadedPreviewStrokes).toHaveLength(1);
    expect(eraser.overlay.previewStrokes).toHaveLength(2);
    eraser.onPointerCancel();
    expect(doc.strokes.map((st) => st.id)).toEqual(['b', 'p', 'q']);
  });

  it('E türü sırayla değiştirir: parça → bütün çizgi → kısmi → parça', () => {
    settings.cycleKind();
    expect(settings.kind).toBe('stroke');
    settings.cycleKind();
    expect(settings.kind).toBe('pixel');
    settings.cycleKind();
    expect(settings.kind).toBe('segment');
  });
});

describe('parça silgisi ve silinmiş kenarlar', () => {
  it('silinmiş şekil kenarı kesici sayılmaz', () => {
    settings.setKind('segment');
    // b (y=50) dikdörtgenin sol (x=200) ve sağ (x=300) kenarlarını keser
    const r = {
      id: 'r',
      kind: 'rect' as const,
      vertices: [200, 0, 300, 0, 300, 100, 200, 100],
      style: { width: 2, opacity: 1, ink: 'black' as const },
      cornerLines: true,
      hiddenEdges: [3],
    };
    doc.replaceAll([{ id: 'b', points: [100, 50, 400, 50], style: { width: 2, opacity: 1, ink: 'black' } }], [r]);
    // Sol kenar silinmiş: 100–300 arası tek parça, onu sil → yalnızca 300–400 kalır
    erase([{ x: 150, y: 45 }, { x: 150, y: 55 }]);
    expect(doc.strokes.map((s) => [s.points[0], s.points[s.points.length - 2]])).toEqual([[300, 400]]);
  });
});

describe('kutu kenarları', () => {
  it('parça silgisi kutunun tek kenarını siler', () => {
    settings.setKind('segment');
    const r = {
      id: 'k',
      kind: 'rect' as const,
      vertices: [200, 0, 300, 0, 300, 100, 200, 100],
      style: { width: 2, opacity: 1, ink: 'black' as const },
      cornerLines: true,
    };
    doc.replaceAll([], [rectToBox(r, 'vp', { x: 600, y: 50 }, 0.5)]);
    // Ön sol kenar (3): x = 200
    erase([{ x: 195, y: 50 }, { x: 205, y: 50 }]);
    expect(doc.shapes[0].hiddenEdges).toEqual([3]);
    expect(doc.shapes[0].kind).toBe('box');
  });
});
