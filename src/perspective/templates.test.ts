import { describe, expect, it } from 'vitest';
import type { Point } from '../engine/geometry';
import type { Stroke } from '../engine/stroke';
import { buildTemplate, TEMPLATE_IDS, toPaperEdge } from './templates';

const portrait = { width: 794, height: 1123 };
const landscape = { width: 1123, height: 794 };

/** Stroke'un doğrusu `p` noktasından geçiyor mu (dik uzaklık). */
function lineDistance(s: Stroke, p: Point): number {
  const [x0, y0, x1, y1] = s.points;
  const len = Math.hypot(x1 - x0, y1 - y0);
  return Math.abs((p.x - x0) * (y1 - y0) - (p.y - y0) * (x1 - x0)) / len;
}

const isVertical = (s: Stroke) => Math.abs(s.points[0] - s.points[2]) < 1e-6;

describe('şablonlar', () => {
  for (const size of [portrait, landscape]) {
    for (const id of TEMPLATE_IDS) {
      it(`${id} (${size.width}×${size.height}): nokta sayısı moda uyar, çizgiler kâğıtta ve iki noktalı`, () => {
        const t = buildTemplate(id, size);
        expect(t.points).toHaveLength(t.mode);
        for (const s of t.strokes) {
          expect(s.points).toHaveLength(4);
          for (let i = 0; i < 4; i += 2) {
            expect(s.points[i]).toBeGreaterThanOrEqual(-1e-6);
            expect(s.points[i]).toBeLessThanOrEqual(size.width + 1e-6);
            expect(s.points[i + 1]).toBeGreaterThanOrEqual(-1e-6);
            expect(s.points[i + 1]).toBeLessThanOrEqual(size.height + 1e-6);
          }
        }
        // Kilitli ufuk: noktalar aynı yükseklikte
        expect(new Set(t.points.map((p) => p.y)).size).toBe(1);
      });
    }
  }

  it('küp: dikey olmayan her kenar bir kaçış noktasına gider', () => {
    const t = buildTemplate('cube', portrait);
    const [v1, v2] = t.points;
    for (const s of t.strokes.filter((s) => !isVertical(s))) {
      expect(Math.min(lineDistance(s, v1), lineDistance(s, v2))).toBeLessThan(1e-6);
    }
    expect(t.strokes.filter(isVertical)).toHaveLength(3);
  });

  it('oda ve yol: dikey/yatay olmayan çizgiler tek kaçış noktasına gider', () => {
    for (const id of ['room', 'road'] as const) {
      const t = buildTemplate(id, landscape);
      const v = t.points[0];
      for (const s of t.strokes) {
        const horizontal = Math.abs(s.points[1] - s.points[3]) < 1e-6;
        if (isVertical(s) || horizontal) continue;
        expect(lineDistance(s, v)).toBeLessThan(1e-6);
      }
    }
  });

  it('oda köşesi: duvar çizgileri karşı kaçış noktalarına kaçar', () => {
    const t = buildTemplate('room-corner', portrait);
    const [v1, v2] = t.points;
    const walls = t.strokes.filter((s) => !isVertical(s));
    expect(walls).toHaveLength(4);
    for (const s of walls) {
      expect(Math.min(lineDistance(s, v1), lineDistance(s, v2))).toBeLessThan(1e-6);
    }
  });

  it('toPaperEdge kâğıt kenarında durur', () => {
    expect(toPaperEdge({ x: 10, y: 10 }, { x: 1, y: 0 }, { width: 100, height: 50 })).toEqual({ x: 100, y: 10 });
    expect(toPaperEdge({ x: 50, y: 25 }, { x: -1, y: -1 }, { width: 100, height: 50 })).toEqual({ x: 25, y: 0 });
  });
});
