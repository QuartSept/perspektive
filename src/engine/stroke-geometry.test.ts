import { describe, expect, it } from 'vitest';
import { rectsOverlap } from './geometry';
import type { Stroke } from './stroke';
import { segmentDistance, segmentTouchesStroke, strokeBounds } from './stroke-geometry';

const line: Stroke = {
  id: 'l',
  points: [0, 0, 100, 0],
  style: { width: 4, opacity: 1, ink: 'black' },
};

describe('stroke geometrisi', () => {
  it('sınır kutusu', () => {
    expect(strokeBounds(line)).toEqual({ x: 0, y: 0, width: 100, height: 0 });
  });

  it('kesişen parçaların uzaklığı 0', () => {
    expect(segmentDistance({ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 })).toBe(0);
  });

  it('silgi kalınlığın yarısı + tolerans içinde dokunur', () => {
    // y = 7: kalınlık/2 (2) + tolerans (5) = 7
    expect(segmentTouchesStroke(line, { x: 50, y: 7 }, { x: 50, y: 7 }, 5)).toBe(true);
    expect(segmentTouchesStroke(line, { x: 50, y: 7.5 }, { x: 50, y: 7.5 }, 5)).toBe(false);
  });

  it('hızlı hareket stroke’u atlasa da yakalanır', () => {
    // İki örnek stroke'un iki yanında; aradaki parça onu keser
    expect(segmentTouchesStroke(line, { x: 50, y: -40 }, { x: 50, y: 40 }, 1)).toBe(true);
  });

  it('tek noktalı stroke', () => {
    const dot: Stroke = { id: 'd', points: [10, 10], style: { width: 2, opacity: 1, ink: 'red' } };
    expect(segmentTouchesStroke(dot, { x: 13, y: 10 }, { x: 13, y: 10 }, 2)).toBe(true);
    expect(segmentTouchesStroke(dot, { x: 14, y: 10 }, { x: 14, y: 10 }, 2)).toBe(false);
  });
});

describe('rectsOverlap', () => {
  it('pay ile kesişim', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectsOverlap(a, { x: 11, y: 0, width: 5, height: 5 })).toBe(false);
    expect(rectsOverlap(a, { x: 11, y: 0, width: 5, height: 5 }, 1)).toBe(true);
    // Sıfır kalınlıklı (yatay çizgi) sınır kutusu
    expect(rectsOverlap({ x: 0, y: 5, width: 10, height: 0 }, a)).toBe(true);
  });
});
