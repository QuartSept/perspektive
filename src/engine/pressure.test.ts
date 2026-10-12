import { describe, expect, it } from 'vitest';
import { DrawingDocument } from './document';
import { History } from './history';
import { pressureWidthFactor, strokeOutline } from './stroke';
import { Viewport } from './viewport';
import { PerspectiveScene } from '../perspective/scene';
import { parseSavedDrawing } from '../storage/format';
import { BrushTool } from '../tools/brush';
import { BrushSettings } from '../tools/brush-settings';
import type { ToolPointerEvent } from '../tools/tool';

describe('basınç → kalınlık', () => {
  it('tam basınçta ayarlanan kalınlık, sıfırda %20', () => {
    expect(pressureWidthFactor(1)).toBe(1);
    expect(pressureWidthFactor(0)).toBeCloseTo(0.2);
    expect(pressureWidthFactor(2)).toBe(1);
  });

  it('dış hat: noktada yarı kalınlık kadar iki yana açılır', () => {
    // Yatay çizgi, ortası tam basınç, uçlar hafif
    const outline = strokeOutline([0, 0, 50, 0, 100, 0], [0, 1, 0], 10, 4);
    const ys = outline.map((p) => Math.abs(p.y));
    expect(Math.max(...ys)).toBeCloseTo(5); // ortada 10/2
    // Sol (üst) kenar boyunca ilk nokta hafif basınç: 10 × 0.2 / 2
    expect(Math.abs(outline[0].y)).toBeCloseTo(1);
  });
});

describe('fırça basıncı', () => {
  function setup(pointerType: string, pressureOn = true) {
    const viewport = new Viewport();
    const doc = new DrawingDocument();
    const scene = new PerspectiveScene();
    const settings = new BrushSettings();
    settings.setSmoothing(0);
    settings.setPressure(pressureOn);
    const brush = new BrushTool(viewport, doc, new History(), settings, scene, { isActive: () => false, radius: 20 }, () => {});
    const ev = (x: number, y: number, pressure: number): ToolPointerEvent => ({
      screen: { x, y },
      world: { x, y },
      samples: [{ x, y, pressure }],
      pointerType,
      pressure,
      native: {} as PointerEvent,
    });
    brush.onPointerDown(ev(0, 0, 0.2));
    for (let i = 1; i <= 10; i++) brush.onPointerMove(ev(i * 10, Math.sin(i) * 5, 0.2 + i * 0.07));
    brush.onPointerUp(ev(100, 0, 0.9));
    return doc.strokes[0];
  }

  it('kalemle her noktada basınç kaydedilir', () => {
    const s = setup('pen');
    expect(s.pressures).toHaveLength(s.points.length / 2);
    expect(s.pressures![0]).toBeCloseTo(0.2);
  });

  it('fare/dokunmada ya da ayar kapalıyken basınç yok', () => {
    expect(setup('mouse').pressures).toBeUndefined();
    expect(setup('touch').pressures).toBeUndefined();
    expect(setup('pen', false).pressures).toBeUndefined();
  });
});

describe('kayıt biçiminde basınç', () => {
  const base = {
    version: 1,
    savedAt: 1,
    paper: { kind: 'a4', width: 794, height: 1123, orientation: 'portrait' },
    scene: { mode: 2, horizonLocked: true, horizonAngle: 0, rayCount: 24, points: [] },
  };
  const style = { width: 2, opacity: 1, ink: 'black' };

  it('geçerli basınç korunur, 0..1 aralığına sıkıştırılır', () => {
    const d = parseSavedDrawing({ ...base, strokes: [{ id: 's', points: [0, 0, 1, 1], style, pressures: [0.5, 3] }] })!;
    expect(d.strokes[0].pressures).toEqual([0.5, 1]);
  });

  it('nokta sayısıyla uyuşmayan basınç yok sayılır (stroke kalır)', () => {
    const d = parseSavedDrawing({ ...base, strokes: [{ id: 's', points: [0, 0, 1, 1], style, pressures: [0.5] }] })!;
    expect(d.strokes).toHaveLength(1);
    expect(d.strokes[0].pressures).toBeUndefined();
  });
});
