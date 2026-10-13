import { describe, expect, it } from 'vitest';
import type { Shape } from '../engine/shapes';
import {
  clipSegment,
  CornerLineSettings,
  cornerLines,
  cornerLineSource,
  cornerTargets,
  preferCornerLines,
} from './corner-lines';
import { PerspectiveScene } from './scene';
import { distanceToLine, perspectiveSource } from './snapping';

const paper = { x: 0, y: 0, width: 1000, height: 1000 };

function scene(): PerspectiveScene {
  const s = new PerspectiveScene();
  s.reset(paper); // noktalar (60,400) ve (940,400)
  return s;
}

const rect = (id: string, cornerLines = true): Shape => ({
  id,
  kind: 'rect',
  vertices: [400, 600, 600, 600, 600, 800, 400, 800],
  style: { width: 2, opacity: 1, ink: 'black' },
  cornerLines,
});

describe('clipSegment', () => {
  it('içerideki parça aynen, taşan kenarda kesilir, dışarıdaki null', () => {
    const r = { x: 0, y: 0, width: 100, height: 100 };
    expect(clipSegment({ x: 10, y: 10 }, { x: 50, y: 50 }, r)).toEqual([
      { x: 10, y: 10 },
      { x: 50, y: 50 },
    ]);
    expect(clipSegment({ x: 50, y: 50 }, { x: 150, y: 50 }, r)).toEqual([
      { x: 50, y: 50 },
      { x: 100, y: 50 },
    ]);
    expect(clipSegment({ x: 150, y: 10 }, { x: 200, y: 50 }, r)).toBeNull();
  });
});

describe('hedef noktalar', () => {
  it('Hepsi: tüm etkin noktalar; Seçili: seçilen ya da ilk nokta; kapalıda yok', () => {
    const s = scene();
    const settings = new CornerLineSettings();
    expect(cornerTargets(s, settings)).toHaveLength(2);
    settings.setTarget('one');
    expect(cornerTargets(s, settings).map((p) => p.id)).toEqual([s.points[0].id]);
    settings.setPoint(s.points[1].id);
    expect(cornerTargets(s, settings).map((p) => p.id)).toEqual([s.points[1].id]);
    settings.setPoint('silinmiş');
    expect(cornerTargets(s, settings).map((p) => p.id)).toEqual([s.points[0].id]);
    s.setMode(0, paper);
    expect(cornerTargets(s, settings)).toEqual([]);
  });
});

describe('cornerLines', () => {
  it('her köşeden her hedefe; köşe çizgisi kapalı şekil atlanır', () => {
    const s = scene();
    const lines = cornerLines([rect('a'), rect('b', false)], s.activePoints, paper);
    expect(lines).toHaveLength(8);
    // Kâğıt içindeki noktaya kadar uzanır
    const l = lines[0];
    expect(l.to).toEqual({ x: s.points[0].x, y: s.points[0].y });
  });

  it('kâğıt dışındaki noktaya giden çizgi kâğıt kenarında kesilir', () => {
    const s = scene();
    s.movePoint(s.points[1].id, { x: 1500, y: 400 });
    const lines = cornerLines([rect('a')], [s.points[1]], paper);
    for (const l of lines) expect(l.to.x).toBeCloseTo(1000);
  });
});

describe('mıknatıs adayı', () => {
  it('köşe çizgisine yakın başlangıç için çizgi; başlangıç çizgiye oturtulur', () => {
    const s = scene();
    const lines = cornerLines([rect('a')], s.activePoints, paper);
    const source = cornerLineSource(() => lines);
    // (400,600) köşesinden sol noktaya giden çizginin 4 birim yanı
    const vp = s.points[0];
    const d = { x: vp.x - 400, y: vp.y - 600 };
    const len = Math.hypot(d.x, d.y);
    const start = { x: 400 + (d.x / len) * 100 - (d.y / len) * 4, y: 600 + (d.y / len) * 100 + (d.x / len) * 4 };
    const found = source(start, 10).filter((l) => l.pointId === vp.id);
    expect(found).toHaveLength(1);
    expect(distanceToLine(found[0], { x: 400, y: 600 })).toBeCloseTo(0);
    expect(distanceToLine(found[0], vp)).toBeCloseTo(0);
    // Uzaktaki başlangıç: aday yok
    expect(source({ x: 900, y: 950 }, 10)).toEqual([]);
  });

  it('preferCornerLines aynı noktanın düz ışınını köşe çizgisiyle değiştirir', () => {
    const s = scene();
    const lines = cornerLines([rect('a')], s.activePoints, paper);
    const combined = preferCornerLines(perspectiveSource(s), cornerLineSource(() => lines));
    const vp = s.points[0];
    const start = { x: 400 + (vp.x - 400) * 0.2, y: 600 + (vp.y - 600) * 0.2 + 3 };
    const result = combined(start, 10);
    const toVp = result.filter((l) => l.pointId === vp.id);
    expect(toVp).toHaveLength(1);
    expect(distanceToLine(toVp[0], { x: 400, y: 600 })).toBeCloseTo(0);
    // Diğer nokta ve dikey adaylar korunur
    expect(result.some((l) => l.pointId === s.points[1].id)).toBe(true);
    expect(result.some((l) => l.kind === 'vertical')).toBe(true);
  });
});

describe('CornerLineSettings', () => {
  it('yalnızca değişiklikte bildirir; kayıt gidiş-dönüşü', () => {
    const c = new CornerLineSettings();
    let n = 0;
    c.onChange(() => n++);
    c.setTarget('all');
    c.setTarget('one');
    c.setPoint('p');
    expect(n).toBe(2);
    const other = new CornerLineSettings();
    other.restore(c.toSaved());
    expect(other.toSaved()).toEqual({ target: 'one', pointId: 'p' });
  });
});
