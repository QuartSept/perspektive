import { describe, expect, it } from 'vitest';
import { parallelCandidates } from './parallel';

describe('parallelCandidates', () => {
  it('başlangıçtan geçer; aynı yöndekilerden en yakını kalır; kısa parçalar atlanır; sınır uygulanır', () => {
    const start = { x: 0, y: 0 };
    const lines = parallelCandidates(
      [
        { a: { x: 0, y: 500 }, b: { x: 100, y: 500 } }, // yatay, uzak
        { a: { x: 0, y: 50 }, b: { x: 100, y: 50.5 } }, // ~yatay, yakın
        { a: { x: 10, y: 10 }, b: { x: 12, y: 12 } }, // kısa
        { a: { x: 200, y: 0 }, b: { x: 200, y: 100 } }, // dikey
      ],
      start,
      5,
    );
    expect(lines).toHaveLength(2);
    expect(lines[0].origin).toEqual(start);
    expect(lines[0].ref!.a.y).toBe(50);
    expect(lines[0].kind).toBe('parallel');
    expect(Math.abs(lines[1].direction.y)).toBeCloseTo(1);
    const many = Array.from({ length: 30 }, (_, i) => ({ a: { x: 0, y: i * 10 }, b: { x: 100, y: i * 10 + i * 8 } }));
    expect(parallelCandidates(many, start, 5, 4)).toHaveLength(4);
  });
});
