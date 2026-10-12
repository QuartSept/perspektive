import { describe, expect, it } from 'vitest';
import type { Stroke } from './stroke';
import { eraseFromStroke } from './stroke-split';

const line = (points: number[], width = 2): Stroke => ({
  id: 'orig',
  points,
  style: { width, opacity: 0.8, ink: 'blue' },
});

const ends = (s: Stroke) => {
  const p = s.points;
  return [p[0], p[1], p[p.length - 2], p[p.length - 1]];
};

describe('eraseFromStroke', () => {
  it('dokunmayan silgi: null', () => {
    expect(eraseFromStroke(line([0, 0, 100, 0]), { x: 50, y: 50 }, { x: 60, y: 50 }, 5)).toBeNull();
  });

  it('ortadan geçen silgi çizgiyi ikiye böler; boşluk = 2 × (yarıçap + kalınlık/2)', () => {
    const pieces = eraseFromStroke(line([0, 0, 100, 0]), { x: 50, y: -20 }, { x: 50, y: 20 }, 5)!;
    expect(pieces).toHaveLength(2);
    const [l, r] = pieces;
    expect(ends(l)[0]).toBe(0);
    expect(ends(l)[2]).toBeCloseTo(44, 1); // 50 − (5 + 1)
    expect(ends(r)[0]).toBeCloseTo(56, 1);
    expect(ends(r)[2]).toBe(100);
  });

  it('parçalar yeni kimlik alır, stil korunur', () => {
    const pieces = eraseFromStroke(line([0, 0, 100, 0]), { x: 50, y: -20 }, { x: 50, y: 20 }, 5)!;
    expect(new Set(pieces.map((p) => p.id)).size).toBe(2);
    expect(pieces.every((p) => p.id !== 'orig')).toBe(true);
    expect(pieces[0].style).toEqual({ width: 2, opacity: 0.8, ink: 'blue' });
  });

  it('uçtan silmek tek parça bırakır', () => {
    const pieces = eraseFromStroke(line([0, 0, 100, 0]), { x: 100, y: 0 }, { x: 100, y: 0 }, 10)!;
    expect(pieces).toHaveLength(1);
    expect(ends(pieces[0])[2]).toBeCloseTo(89, 1);
  });

  it('tamamen silinen çizgi: []', () => {
    expect(eraseFromStroke(line([0, 0, 10, 0]), { x: -5, y: 0 }, { x: 15, y: 0 }, 5)).toEqual([]);
  });

  it('kesilmeyen kısımlarda özgün noktalar korunur', () => {
    const pts = [0, 0, 10, 3, 20, 0, 30, 3, 40, 0, 50, 3, 60, 0];
    const pieces = eraseFromStroke(line(pts), { x: 60, y: 0 }, { x: 60, y: 0 }, 4)!;
    expect(pieces).toHaveLength(1);
    // İlk beş nokta aynen
    expect(pieces[0].points.slice(0, 10)).toEqual(pts.slice(0, 10));
  });

  it('tek noktalı stroke: içerideyse silinir', () => {
    const dot = line([10, 10], 2);
    expect(eraseFromStroke(dot, { x: 12, y: 10 }, { x: 12, y: 10 }, 2)).toEqual([]);
    expect(eraseFromStroke(dot, { x: 30, y: 10 }, { x: 30, y: 10 }, 2)).toBeNull();
  });

  it('silgi bir segmentin içinden geçse de (iki uç dışarıda) böler', () => {
    // Uzun tek segment, silgi ortasından küçük bir daireyle geçer
    const pieces = eraseFromStroke(line([0, 0, 1000, 0], 1), { x: 500, y: 0 }, { x: 500, y: 0 }, 3)!;
    expect(pieces).toHaveLength(2);
  });
});
