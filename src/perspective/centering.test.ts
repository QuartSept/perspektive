import { describe, expect, it } from 'vitest';
import { History } from '../engine/history';
import { EditorState } from '../engine/state';
import { Viewport } from '../engine/viewport';
import { VanishingPointTool } from '../tools/vanishing-point';
import type { ToolPointerEvent } from '../tools/tool';
import { centerPoint, centerSetup, rectCenter, snapToCenter } from './centering';
import { PerspectiveScene } from './scene';

const paper = { x: 0, y: 0, width: 800, height: 1000 };
const C = rectCenter(paper); // (400, 500)

function scene(): PerspectiveScene {
  const s = new PerspectiveScene();
  s.reset(paper); // noktalar (48,400) ve (752,400)
  return s;
}

describe('snapToCenter', () => {
  it('eksenlere ayrı ayrı yapışır, uzakta dokunmaz', () => {
    expect(snapToCenter({ x: 403, y: 700 }, C, 5)).toEqual({
      point: { x: 400, y: 700 },
      snappedX: true,
      snappedY: false,
    });
    expect(snapToCenter({ x: 398, y: 504 }, C, 5).point).toEqual(C);
    expect(snapToCenter({ x: 300, y: 300 }, C, 5).point).toEqual({ x: 300, y: 300 });
  });
});

describe('centerSetup', () => {
  it('2 nokta: ufuk merkezden geçer, noktalar aralarındaki uzaklığı koruyarak simetrik', () => {
    const s = scene();
    s.movePoint(s.points[0].id, { x: 100, y: 300 }); // ufuk 300'e iner; noktalar 100 ve 752
    expect(centerSetup(s, paper)).toBe(true);
    const [a, b] = s.points;
    expect(a.y).toBeCloseTo(500);
    expect(b.y).toBeCloseTo(500);
    expect((a.x + b.x) / 2).toBeCloseTo(400);
    expect(b.x - a.x).toBeCloseTo(652);
    expect(a.x).toBeLessThan(b.x); // sol nokta solda kalır
  });

  it('1 nokta: nokta merkeze; 3 nokta: dikey nokta ufka uzaklığını korur', () => {
    const one = scene();
    one.setMode(1, paper);
    centerSetup(one, paper);
    expect(one.points[0]).toMatchObject(C);

    const three = scene();
    three.setMode(3, paper);
    const v = three.verticalPoint!;
    const offBefore = v.y - three.points[0].y;
    centerSetup(three, paper);
    const v2 = three.verticalPoint!;
    expect(v2.x).toBeCloseTo(400);
    expect(v2.y - 500).toBeCloseTo(offBefore);
  });

  it('kapalı modda (etkin nokta yok) değişiklik yapmaz', () => {
    const s = scene();
    s.setMode(0, paper);
    expect(centerSetup(s, paper)).toBe(false);
  });
});

describe('centerPoint', () => {
  it('seçili nokta merkeze; kilitli ufukta diğer nokta merkez yüksekliğine iner', () => {
    const s = scene();
    const [a, b] = s.points;
    expect(centerPoint(s, a.id, paper)).toBe(true);
    expect(s.getPoint(a.id)).toMatchObject(C);
    expect(s.getPoint(b.id)!.y).toBeCloseTo(500);
    expect(s.getPoint(b.id)!.x).toBeCloseTo(752);
  });
});

describe('VanishingPointTool: merkeze yapışma ve tutma', () => {
  function setup(grabOnly = false) {
    const viewport = new Viewport();
    const s = scene();
    const state = new EditorState();
    const history = new History();
    const tool = new VanishingPointTool(viewport, s, state, history, () => paper, () => {}, { grabOnly });
    return { viewport, s, state, history, tool };
  }
  const ev = (x: number, y: number, extra: Partial<ToolPointerEvent> = {}): ToolPointerEvent => ({
    screen: { x, y },
    world: { x, y },
    samples: [{ x, y, pressure: 0.5 }],
    pointerType: 'mouse',
    pressure: 0.5,
    native: { shiftKey: false } as PointerEvent,
    ...extra,
  });

  it('taşırken merkez eksenine yapışır ve kılavuz gösterir; Shift ile yapışmaz', () => {
    const { s, tool, history } = setup();
    const id = s.points[0].id;
    tool.onPointerDown(ev(48, 400));
    tool.onPointerMove(ev(405, 400));
    expect(s.getPoint(id)!.x).toBe(400);
    expect(tool.guideLines.map((l) => l.kind)).toEqual(['vertical']);
    tool.onPointerMove(ev(405, 400, { native: { shiftKey: true } as PointerEvent }));
    expect(s.getPoint(id)!.x).toBe(405);
    expect(tool.guideLines).toEqual([]);
    tool.onPointerUp(ev(405, 400));
    expect(history.canUndo).toBe(true);
  });

  it('dokunmada isabet alanı geniş (22 px), farede 12 px', () => {
    const { s, tool, state } = setup();
    tool.onPointerDown(ev(48 + 18, 400)); // farede ıskalar: nokta eklenemez (2/2), seçim yok
    expect(state.selectedPointId).toBeNull();
    tool.onPointerUp(ev(48 + 18, 400));
    tool.onPointerDown(ev(48 + 18, 400, { pointerType: 'touch' }));
    expect(state.selectedPointId).toBe(s.points[0].id);
    tool.onPointerUp(ev(48 + 18, 400, { pointerType: 'touch' }));
  });

  it('başka araçtan tutma: dar alan, bırakınca seçim kalkar, nokta eklemez', () => {
    const { s, tool, state, history } = setup(true);
    expect(tool.grabs(ev(48 + 6, 400))).toBe(true);
    expect(tool.grabs(ev(48 + 9, 400))).toBe(false);
    expect(tool.grabs(ev(48 + 12, 400, { pointerType: 'touch' }))).toBe(true);
    expect(tool.hoverGrab({ x: 50, y: 401 })).toBe('grab');
    expect(state.hoveredPointId).toBe(s.points[0].id);

    tool.onPointerDown(ev(50, 400));
    tool.onPointerMove(ev(150, 380));
    tool.onPointerUp(ev(150, 380));
    expect(s.points).toHaveLength(2);
    expect(s.getPoint(s.points[0].id)!.y).toBe(380);
    expect(state.selectedPointId).toBeNull();
    history.undo();
    expect(s.points[0].y).toBe(400);
  });
});

describe('Viewport.centerOn', () => {
  it('ölçeği koruyarak noktayı boş alanın ortasına getirir', () => {
    const v = new Viewport();
    v.resize(1000, 800);
    v.setScale(2);
    v.centerOn({ x: 100, y: 50 }, { top: 100, right: 0, bottom: 0, left: 200 });
    expect(v.scale).toBe(2);
    expect(v.worldToScreen({ x: 100, y: 50 })).toEqual({ x: 600, y: 450 });
  });
});
