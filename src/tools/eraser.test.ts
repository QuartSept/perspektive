import { beforeEach, describe, expect, it } from 'vitest';
import { DrawingDocument } from '../engine/document';
import type { Point } from '../engine/geometry';
import { History } from '../engine/history';
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

  it('iki türde de şekil komple silinir; stroke ile tek adımda geri alınır', () => {
    for (const kind of ['stroke', 'pixel'] as const) {
      settings.setKind(kind);
      doc.replaceAll([line('a', 0)], [rect]);
      history.clear();
      // Önce stroke'a, sonra dikdörtgenin sol kenarına dokunan hareket
      erase([{ x: 50, y: -5 }, { x: 50, y: 5 }, { x: 200, y: 50 }]);
      expect(doc.shapes).toHaveLength(0);
      expect(doc.strokes.some((s) => s.id === 'a')).toBe(false);
      history.undo();
      expect(doc.shapes.map((s) => s.id)).toEqual(['r']);
      expect(doc.strokes.map((s) => s.id)).toEqual(['a']);
    }
  });

  it('sürüklerken şekil soluk işaretlenir, iptalde belge değişmez', () => {
    doc.replaceAll([], [rect]);
    eraser.onPointerDown(ev({ x: 300, y: 40 }));
    expect([...(eraser.overlay.fadedShapeIds ?? [])]).toEqual(['r']);
    eraser.onPointerCancel();
    expect(eraser.overlay.fadedShapeIds?.size ?? 0).toBe(0);
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
