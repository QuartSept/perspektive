import { describe, expect, it } from 'vitest';
import type { Point } from '../engine/geometry';
import { buildGrid, clipToPaper, GRID_PLANES, gridHomography, mapGrid } from './grid';
import { PerspectiveScene } from './scene';

const size = { width: 794, height: 1123 };

function scene(mode: 1 | 2): PerspectiveScene {
  const s = new PerspectiveScene();
  s.reset({ x: 0, y: 0, ...size });
  if (mode === 1) s.setMode(1, { x: 0, y: 0, ...size });
  return s;
}

/** Üç nokta doğrusal mı (alan / taban). */
function collinear(a: Point, b: Point, c: Point): number {
  const base = Math.hypot(c.x - a.x, c.y - a.y);
  return Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / base;
}

describe('ızgara homografisi', () => {
  it('2 nokta zemin: u çizgileri V2’ye, v çizgileri V1’e kaçar', () => {
    const s = scene(2);
    const h = gridHomography(s, 'floor', 6, size)!;
    const [V1, V2] = s.points;
    for (let i = 0; i <= 6; i++) {
      expect(collinear(mapGrid(h, i, 0), mapGrid(h, i, 6), V2)).toBeLessThan(1e-6);
      expect(collinear(mapGrid(h, 0, i), mapGrid(h, 6, i), V1)).toBeLessThan(1e-6);
    }
  });

  it('2 nokta zemin: hücre köşegenleri ufuk üzerindeki tek noktaya kaçar (kare hücre)', () => {
    const s = scene(2);
    const h = gridHomography(s, 'floor', 6, size)!;
    // Köşegen (k, k) noktaları doğrusal ve doğru ufku keser
    const pts = [0, 2, 4, 6].map((k) => mapGrid(h, k, k));
    expect(collinear(pts[0], pts[1], pts[3])).toBeLessThan(1e-6);
    expect(collinear(pts[0], pts[2], pts[3])).toBeLessThan(1e-6);
    // Bir başka köşegen ailesi (k, k+2) aynı noktaya gider: iki doğrunun kesişimi ufukta
    const q = [0, 2, 4].map((k) => mapGrid(h, k, k + 2));
    const hy = s.points[0].y;
    const meet = (a: Point, b: Point, c: Point, d: Point) => {
      const den = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
      const s1 = a.x * b.y - a.y * b.x;
      const s2 = c.x * d.y - c.y * d.x;
      return { x: (s1 * (c.x - d.x) - (a.x - b.x) * s2) / den, y: (s1 * (c.y - d.y) - (a.y - b.y) * s2) / den };
    };
    const D = meet(pts[0], pts[3], q[0], q[2]);
    expect(D.y).toBeCloseTo(hy, 3);
  });

  it('1 nokta zemin: derinlik çizgileri kaçış noktasına, enine çizgiler yatay', () => {
    const s = scene(1);
    const h = gridHomography(s, 'floor', 6, size)!;
    const V = s.points[0];
    for (let i = 0; i <= 6; i++) {
      expect(collinear(mapGrid(h, i, 0), mapGrid(h, i, 6), V)).toBeLessThan(1e-6);
      const a = mapGrid(h, 0, i);
      const b = mapGrid(h, 6, i);
      expect(a.y).toBeCloseTo(b.y, 6);
    }
  });

  it('duvarlar: dikey çizgiler dikey, diğerleri kaçış noktasına', () => {
    for (const mode of [1, 2] as const) {
      const s = scene(mode);
      for (const plane of ['wall-left', 'wall-right'] as const) {
        const h = gridHomography(s, plane, 6, size)!;
        const V = mode === 1 ? s.points[0] : plane === 'wall-left' ? s.points[0] : s.points[1];
        for (let i = 0; i <= 6; i++) {
          const a = mapGrid(h, i, 0);
          const b = mapGrid(h, i, 6);
          expect(a.x).toBeCloseTo(b.x, 6);
          expect(collinear(mapGrid(h, 0, i), mapGrid(h, 6, i), V)).toBeLessThan(1e-6);
        }
      }
    }
  });

  it('kurgu yetersizse null', () => {
    const s = scene(2);
    s.removePoint(s.points[1].id);
    expect(gridHomography(s, 'floor', 6, size)).toBeNull();
  });
});

describe('buildGrid', () => {
  it('her düzlemde kâğıda kırpılmış iki noktalı çizgiler üretir', () => {
    for (const mode of [1, 2] as const) {
      for (const plane of GRID_PLANES) {
        const strokes = buildGrid(scene(mode), plane, 6, size)!;
        expect(strokes.length).toBeGreaterThan(4);
        for (const st of strokes) {
          expect(st.points).toHaveLength(4);
          for (let i = 0; i < 4; i += 2) {
            expect(st.points[i]).toBeGreaterThanOrEqual(-1e-6);
            expect(st.points[i]).toBeLessThanOrEqual(size.width + 1e-6);
            expect(st.points[i + 1]).toBeGreaterThanOrEqual(-1e-6);
            expect(st.points[i + 1]).toBeLessThanOrEqual(size.height + 1e-6);
          }
        }
      }
    }
  });

  it('clipToPaper', () => {
    expect(clipToPaper({ x: -10, y: 5 }, { x: 110, y: 5 }, { width: 100, height: 10 })).toEqual([
      { x: 0, y: 5 },
      { x: 100, y: 5 },
    ]);
    expect(clipToPaper({ x: -10, y: -5 }, { x: -1, y: -1 }, { width: 100, height: 10 })).toBeNull();
  });
});
