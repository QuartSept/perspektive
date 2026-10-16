import { describe, expect, it } from 'vitest';
import { cutPositions, polylineCutter, splitAtPositions, strokeCutter } from './stroke-cut';
import type { Stroke } from './stroke';

const s = (id: string, points: number[], width = 2): Stroke => ({
  id,
  points,
  style: { width, opacity: 1, ink: 'black' },
});

describe('cutPositions', () => {
  const a = s('a', [0, 0, 100, 0]);

  it('çapraz çizgilerle kesişim noktaları (yay uzunluğu)', () => {
    const cuts = cutPositions(a, [strokeCutter(s('b', [30, -20, 30, 20])), strokeCutter(s('c', [70, -20, 70, 20]))], 0);
    expect(cuts).toEqual([30, 70]);
  });

  it('T birleşimi: kesicinin ucu çizgiye değiyorsa (tam kesişmeden) kesim', () => {
    // Ucu çizginin 1.5 birim üstünde biten dikey: kalınlıklar toplamının yarısı (2) içinde
    const cuts = cutPositions(a, [strokeCutter(s('t', [40, -30, 40, -1.5]))], 0);
    expect(cuts).toHaveLength(1);
    expect(cuts[0]).toBeCloseTo(40);
    // Uzakta biten: kesim yok
    expect(cutPositions(a, [strokeCutter(s('u', [40, -30, 40, -8]))], 0)).toEqual([]);
  });

  it('kendi kesişimi (halka) iki kesim verir; paralel / çakışık çizgi kesim değildir', () => {
    // 0,0 → 100,0 → 100,50 → 50,50 → 50,-20: ilk parçayı x=50'de keser
    const loop = s('l', [0, 0, 100, 0, 100, 50, 50, 50, 50, -20]);
    const cuts = cutPositions(loop, [], 0);
    expect(cuts).toHaveLength(2);
    expect(cuts[0]).toBeCloseTo(50);
    expect(cutPositions(a, [strokeCutter(s('p', [0, 0, 100, 0]))], 0)).toEqual([]);
    expect(cutPositions(a, [strokeCutter(s('q', [0, 10, 100, 10]))], 0)).toEqual([]);
  });

  it('kapalı şekil kenarları kesicidir (kapanış kenarı dahil)', () => {
    const square = polylineCutter(
      [
        { x: 20, y: -10 },
        { x: 60, y: -10 },
        { x: 60, y: 10 },
        { x: 20, y: 10 },
      ],
      true,
      2,
    );
    expect(cutPositions(a, [square], 0)).toEqual([20, 60]);
  });
});

describe('splitAtPositions', () => {
  it('parçalar sırayla, ara noktalar korunur; basınç ve katman taşınır', () => {
    const st: Stroke = { ...s('a', [0, 0, 50, 0, 100, 0]), pressures: [0.2, 0.6, 1], layerId: 'L' };
    const pieces = splitAtPositions(st, [25, 75]);
    expect(pieces.map((p) => p.points)).toEqual([
      [0, 0, 25, 0],
      [25, 0, 50, 0, 75, 0],
      [75, 0, 100, 0],
    ]);
    expect(pieces[1].pressures).toEqual([0.4, 0.6, 0.8]);
    expect(pieces.every((p) => p.layerId === 'L' && p.id !== 'a')).toBe(true);
  });

  it('kesim yoksa stroke kendisi', () => {
    const st = s('a', [0, 0, 10, 0]);
    expect(splitAtPositions(st, [])).toEqual([st]);
  });
});
