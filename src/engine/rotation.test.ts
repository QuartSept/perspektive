import { describe, expect, it } from 'vitest';
import { angleDelta, ROTATION_SNAP, snapRotation } from './rotation';

const deg = (d: number) => (d * Math.PI) / 180;

describe('snapRotation', () => {
  it('dik açıların yakınında (±4°) onlara oturur, uzakta dokunmaz', () => {
    expect(snapRotation(deg(3))).toBe(0);
    expect(snapRotation(deg(-3.5))).toBeCloseTo(0);
    expect(snapRotation(deg(88))).toBeCloseTo(deg(90));
    expect(snapRotation(deg(183))).toBeCloseTo(deg(180));
    expect(snapRotation(deg(30))).toBeCloseTo(deg(30));
    expect(snapRotation(deg(90) + ROTATION_SNAP * 1.5)).toBeCloseTo(deg(90) + ROTATION_SNAP * 1.5);
  });

  it('Shift ile 15° adımlar', () => {
    expect(snapRotation(deg(22), true)).toBeCloseTo(deg(15));
    expect(snapRotation(deg(23), true)).toBeCloseTo(deg(30));
    expect(snapRotation(deg(-50), true)).toBeCloseTo(deg(-45));
  });
});

describe('angleDelta', () => {
  it('±180° sıçramasında kısa yoldan fark', () => {
    expect(angleDelta(deg(170), deg(-170))).toBeCloseTo(deg(20));
    expect(angleDelta(deg(-170), deg(170))).toBeCloseTo(deg(-20));
    expect(angleDelta(deg(10), deg(40))).toBeCloseTo(deg(30));
  });
});
