import { describe, expect, it } from 'vitest';
import { fitImage } from './reference';

const paper = { x: 0, y: 0, width: 200, height: 300 };

describe('fitImage', () => {
  it('sığdır: görselin tamamı kâğıtta, ortalı', () => {
    // Yatay görsel dikey kâğıtta: genişliğe göre
    expect(fitImage(400, 200, paper, 'contain')).toEqual({ x: 0, y: 100, width: 200, height: 100 });
  });

  it('kapla: kâğıdı tamamen kaplar, taşan kısım ortalı', () => {
    expect(fitImage(400, 200, paper, 'cover')).toEqual({ x: -200, y: 0, width: 600, height: 300 });
  });
});
