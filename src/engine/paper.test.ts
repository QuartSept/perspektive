import { describe, expect, it } from 'vitest';
import { Paper, PX_PER_MM, supportsOrientation } from './paper';

const screen = { width: 1000, height: 700 };

describe('Paper yönlendirme', () => {
  it('varsayılan dikey: A4 210×297 mm', () => {
    const p = new Paper('a4', screen);
    expect(p.orientation).toBe('portrait');
    expect(p.width).toBeCloseTo(210 * PX_PER_MM);
    expect(p.height).toBeCloseTo(297 * PX_PER_MM);
  });

  it('yatay seçilince en/boy yer değiştirir', () => {
    const p = new Paper('a5', screen);
    p.set('a5', screen, 'landscape');
    expect(p.width).toBeCloseTo(210 * PX_PER_MM);
    expect(p.height).toBeCloseTo(148 * PX_PER_MM);
  });

  it('kâğıt türü değişince seçili yönlendirme korunur', () => {
    const p = new Paper('a4', screen);
    p.set('a4', screen, 'landscape');
    p.set('a5', screen);
    expect(p.orientation).toBe('landscape');
    expect(p.width).toBeGreaterThan(p.height);
  });

  it('yönlendirmesi olmayan eski kayıt boyuttan çıkarılır', () => {
    const p = new Paper('a4', screen);
    p.restore('a4', 297 * PX_PER_MM, 210 * PX_PER_MM);
    expect(p.orientation).toBe('landscape');
    p.restore('a4', 210 * PX_PER_MM, 297 * PX_PER_MM);
    expect(p.orientation).toBe('portrait');
  });

  it('yalnızca A4/A5 yönlendirmeyi destekler', () => {
    expect(supportsOrientation('a4')).toBe(true);
    expect(supportsOrientation('a5')).toBe(true);
    expect(supportsOrientation('square')).toBe(false);
    expect(supportsOrientation('screen')).toBe(false);
  });
});
