import { describe, expect, it } from 'vitest';
import { proximityWeight, rayAngles, rayOpacities } from './rays';
import { PerspectiveScene } from './scene';
import { candidateLines, chooseLine, distanceToLine, projectOnLine } from './snapping';

function scene(mode: 1 | 2): PerspectiveScene {
  const s = new PerspectiveScene();
  s.reset({ x: 0, y: 0, width: 1000, height: 1000 }); // noktalar (60,400) ve (940,400)
  if (mode === 1) s.setMode(1, { x: 0, y: 0, width: 1000, height: 1000 });
  return s;
}

describe('candidateLines', () => {
  it('2 noktada: iki kaçış noktası + dikey', () => {
    const lines = candidateLines(scene(2), { x: 500, y: 800 });
    expect(lines.map((l) => l.kind)).toEqual(['vanishing-point', 'vanishing-point', 'vertical']);
  });

  it('1 noktada: kaçış noktası + dikey + yatay', () => {
    const lines = candidateLines(scene(1), { x: 500, y: 800 });
    expect(lines.map((l) => l.kind)).toEqual(['vanishing-point', 'vertical', 'horizontal']);
  });

  it('başlangıç kaçış noktasının üstündeyse o ışın atlanır', () => {
    const s = scene(2);
    const lines = candidateLines(s, { x: s.points[0].x, y: s.points[0].y });
    expect(lines.filter((l) => l.kind === 'vanishing-point')).toHaveLength(1);
  });
});

describe('chooseLine', () => {
  const s = scene(2);
  const start = { x: 500, y: 800 };
  const lines = candidateLines(s, start);

  it('kaçış noktasına doğru harekette o ışını seçer (geri yönde de)', () => {
    const toRight = chooseLine(lines, start, { x: 520, y: 791 })!;
    expect(toRight.pointId).toBe(s.points[1].id);
    const away = chooseLine(lines, start, { x: 480, y: 809 })!;
    expect(away.pointId).toBe(s.points[1].id);
  });

  it('dikey harekette dikeyi seçer', () => {
    expect(chooseLine(lines, start, { x: 501, y: 770 })!.kind).toBe('vertical');
  });

  it('hiçbir adaya yakın olmayan yönde null', () => {
    // Yatay hareket: 2 noktada yatay aday yok, ışınlar ~24° ve dikey 90° uzakta
    const s2 = new PerspectiveScene();
    s2.reset({ x: 0, y: 0, width: 1000, height: 1000 });
    s2.movePoint(s2.points[0].id, { x: 60, y: 0 });
    const c = candidateLines(s2, start);
    expect(chooseLine(c, start, { x: 540, y: 800 })).toBeNull();
  });
});

describe('izdüşüm ve uzaklık', () => {
  const line = { origin: { x: 0, y: 0 }, direction: { x: 1, y: 0 }, kind: 'horizontal' as const };
  it('projectOnLine', () => {
    expect(projectOnLine(line, { x: 5, y: 3 })).toEqual({ x: 5, y: 0 });
  });
  it('distanceToLine', () => {
    expect(distanceToLine(line, { x: 5, y: -3 })).toBe(3);
  });
});

describe('ışınlar', () => {
  it('rayAngles eşit aralıklı ve ufuk açısını içerir', () => {
    const a = rayAngles(4, 0.1);
    expect(a).toHaveLength(4);
    expect(a[0]).toBe(0.1);
    expect(a[1] - a[0]).toBeCloseTo(Math.PI / 2);
  });

  it('yakınlık ağırlığı uzaklıkla azalır', () => {
    expect(proximityWeight(0)).toBe(1);
    expect(proximityWeight(10_000)).toBe(0);
    expect(proximityWeight(100)).toBeGreaterThan(proximityWeight(200));
  });

  it('yakın noktanın ışınları belirginleşir, diğeri silikleşir', () => {
    const [near, far] = rayOpacities([1, 0], 0.2, 0.6, 0.06);
    expect(near).toBe(0.6);
    expect(far).toBe(0.06);
    expect(rayOpacities([0, 0], 0.2, 0.6, 0.06)).toEqual([0.2, 0.2]);
  });
});
