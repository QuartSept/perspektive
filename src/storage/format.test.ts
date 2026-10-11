import { describe, expect, it } from 'vitest';
import { newestDrawing, parseSavedDrawing, type SavedDrawing } from './format';

const valid = {
  version: 1,
  savedAt: 123,
  paper: { kind: 'a4', width: 793.7, height: 1122.5 },
  scene: {
    mode: 2,
    horizonLocked: true,
    rayCount: 24,
    points: [
      { id: 'p1', x: 10, y: 20 },
      { id: 'p2', x: 30, y: 20 },
    ],
  },
  strokes: [{ id: 's1', points: [0, 0, 5, 5], style: { width: 2, opacity: 0.5, ink: 'blue' } }],
};

describe('parseSavedDrawing', () => {
  it('geçerli veriyi aynen döndürür', () => {
    expect(parseSavedDrawing(valid)).toEqual(valid);
  });

  it('tanınmayan sürüm / bozuk kök için null', () => {
    expect(parseSavedDrawing(null)).toBeNull();
    expect(parseSavedDrawing('x')).toBeNull();
    expect(parseSavedDrawing({ ...valid, version: 99 })).toBeNull();
    expect(parseSavedDrawing({ ...valid, paper: { kind: 'letter', width: 1, height: 1 } })).toBeNull();
  });

  it('bozuk stroke ve noktaları atlar, geri kalanı yükler', () => {
    const parsed = parseSavedDrawing({
      ...valid,
      scene: { ...valid.scene, points: [{ id: 'p1', x: 'a', y: 0 }, valid.scene.points[1]] },
      strokes: [
        { id: 'odd', points: [1, 2, 3], style: valid.strokes[0].style },
        { id: 'nan', points: [0, NaN], style: valid.strokes[0].style },
        { id: 'ink', points: [0, 0], style: { width: 2, opacity: 1, ink: 'pink' } },
        valid.strokes[0],
      ],
    })!;
    expect(parsed.scene.points.map((p) => p.id)).toEqual(['p2']);
    expect(parsed.strokes.map((s) => s.id)).toEqual(['s1']);
  });

  it('mod sınırından fazla noktayı keser, opaklığı 0..1’e sıkıştırır', () => {
    const parsed = parseSavedDrawing({
      ...valid,
      scene: { ...valid.scene, mode: 1 },
      strokes: [{ id: 's', points: [0, 0], style: { width: 1, opacity: 7, ink: 'black' } }],
    })!;
    expect(parsed.scene.points).toHaveLength(1);
    expect(parsed.strokes[0].style.opacity).toBe(1);
  });
});

describe('newestDrawing', () => {
  const at = (savedAt: number) => ({ ...(valid as SavedDrawing), savedAt });

  it('savedAt değeri büyük olanı seçer, null kaynakları atlar', () => {
    expect(newestDrawing(at(5), at(9))?.savedAt).toBe(9);
    expect(newestDrawing(at(9), null, at(5))?.savedAt).toBe(9);
    expect(newestDrawing(null, at(3))?.savedAt).toBe(3);
    expect(newestDrawing(null, null)).toBeNull();
  });
});
