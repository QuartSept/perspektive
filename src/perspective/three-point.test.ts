import { describe, expect, it } from 'vitest';
import type { Point } from '../engine/geometry';
import { parseSavedDrawing } from '../storage/format';
import { buildGrid, gridHomography, mapGrid } from './grid';
import { PerspectiveScene, type SceneSnapshot } from './scene';
import { candidateLines } from './snapping';

const paper = { x: 0, y: 0, width: 794, height: 1123 };

function threePoint(): PerspectiveScene {
  const s = new PerspectiveScene();
  s.reset(paper);
  s.setMode(3, paper);
  return s;
}

function collinear(a: Point, b: Point, c: Point): number {
  const base = Math.hypot(c.x - a.x, c.y - a.y);
  return Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / base;
}

describe('3 nokta kurgusu', () => {
  it('2 → 3: dikey nokta ufkun altına eklenir; 3 → 2 kaldırır', () => {
    const s = threePoint();
    expect(s.points).toHaveLength(3);
    const v = s.verticalPoint!;
    expect(v.y).toBeGreaterThan(s.horizonPoints[0].y);
    expect(v.x).toBeCloseTo((s.horizonPoints[0].x + s.horizonPoints[1].x) / 2);
    s.setMode(2, paper);
    expect(s.points).toHaveLength(2);
    expect(s.verticalPoint).toBeUndefined();
  });

  it('1 → 3: ikinci ufuk noktası ve dikey nokta eklenir', () => {
    const s = new PerspectiveScene();
    s.reset(paper);
    s.setMode(1, paper);
    s.setMode(3, paper);
    expect(s.horizonPoints).toHaveLength(2);
    expect(s.verticalPoint).toBeDefined();
  });

  it('ufuk kilidi dikey noktayı etkilemez; dikey nokta serbest taşınır', () => {
    const s = threePoint();
    const v = { ...s.verticalPoint! };
    const [a, b] = s.horizonPoints;
    s.movePoint(a.id, { x: a.x, y: a.y - 50 });
    expect(s.getPoint(b.id)!.y).toBeCloseTo(a.y);
    expect(s.verticalPoint).toMatchObject({ x: v.x, y: v.y });
    s.movePoint(v.id, { x: 100, y: 1500 });
    expect(s.horizonPoints.map((p) => p.y)).toEqual([a.y, a.y]);
  });

  it('ufuk sürükleme dikey noktayı taşımaz', () => {
    const s = threePoint();
    const v = { ...s.verticalPoint! };
    s.translate(0, 30);
    expect(s.verticalPoint).toMatchObject({ x: v.x, y: v.y });
  });

  it('dikey nokta silinip yeniden eklenince yine dikey olur; renk sırası role göre', () => {
    const s = threePoint();
    const v = s.verticalPoint!;
    expect(s.colorIndexOf(v)).toBe(2);
    s.removePoint(v.id);
    const added = s.addPoint({ x: 400, y: 1600 })!;
    expect(added.role).toBe('vertical');
    expect(added).toMatchObject({ x: 400, y: 1600 });
    // Bir ufuk noktası silinirse yeni nokta ufka oturur
    const h = s.horizonPoints[0];
    s.removePoint(h.id);
    const nh = s.addPoint({ x: 100, y: 900 })!;
    expect(nh.role).toBeUndefined();
    expect(nh.y).toBeCloseTo(s.horizonPoints[0].y);
    expect(s.colorIndexOf(nh)).toBe(1);
  });

  it('mıknatıs adayları: üç kaçış noktası, paralel dikey yok', () => {
    const s = threePoint();
    const kinds = candidateLines(s, { x: 400, y: 800 }).map((l) => l.kind);
    expect(kinds).toEqual(['vanishing-point', 'vanishing-point', 'vanishing-point']);
  });

  it('kayıt biçimi rolü korur', () => {
    const s = threePoint();
    const snap: SceneSnapshot = s.snapshot();
    const parsed = parseSavedDrawing({
      version: 1,
      savedAt: 1,
      paper: { kind: 'a4', width: 794, height: 1123, orientation: 'portrait' },
      scene: { ...snap, rayCount: 24 },
      strokes: [],
    })!;
    expect(parsed.scene.mode).toBe(3);
    expect(parsed.scene.points.filter((p) => p.role === 'vertical')).toHaveLength(1);
  });
});

describe('3 nokta ızgarası', () => {
  it('zemin: çizgiler ufuk noktalarına kaçar, köşegenler tek noktaya', () => {
    const s = threePoint();
    const h = gridHomography(s, 'floor', 6, paper)!;
    const [L, R] = s.horizonPoints;
    for (let i = 0; i <= 6; i++) {
      expect(collinear(mapGrid(h, i, 0), mapGrid(h, i, 6), R)).toBeLessThan(1e-6);
      expect(collinear(mapGrid(h, 0, i), mapGrid(h, 6, i), L)).toBeLessThan(1e-6);
    }
    const d = [0, 2, 4, 6].map((k) => mapGrid(h, k, k));
    expect(collinear(d[0], d[1], d[3])).toBeLessThan(1e-6);
  });

  it('duvarlar: dikey çizgiler dikey kaçış noktasına gider', () => {
    const s = threePoint();
    const V3 = s.verticalPoint!;
    for (const plane of ['wall-left', 'wall-right'] as const) {
      const h = gridHomography(s, plane, 6, paper)!;
      for (let i = 0; i <= 6; i++) {
        expect(collinear(mapGrid(h, i, 0), mapGrid(h, i, 6), V3)).toBeLessThan(1e-6);
      }
      expect(buildGrid(s, plane, 6, paper)!.length).toBeGreaterThan(4);
    }
  });

  it('fiziksel olmayan yerleşimde (geniş açılı üçgen) null', () => {
    const s = threePoint();
    const [a, b] = s.horizonPoints;
    // Dikey noktayı ufka çok yaklaştır: V3'teki açı geniş olur
    s.movePoint(s.verticalPoint!.id, { x: (a.x + b.x) / 2, y: a.y + 40 });
    expect(gridHomography(s, 'floor', 6, paper)).toBeNull();
  });
});
