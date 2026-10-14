import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GRID,
  LEGACY_LAYER_ID,
  migrateSavedDrawing,
  newestDrawing,
  parseSavedDrawing,
  SAVE_VERSION,
  type SavedDrawing,
} from './format';

const valid = {
  version: 1,
  savedAt: 123,
  paper: { kind: 'a4', width: 793.7, height: 1122.5, orientation: 'portrait' },
  scene: {
    mode: 2,
    horizonLocked: true,
    horizonAngle: 0,
    rayCount: 24,
    points: [
      { id: 'p1', x: 10, y: 20 },
      { id: 'p2', x: 30, y: 20 },
    ],
  },
  strokes: [{ id: 's1', points: [0, 0, 5, 5], style: { width: 2, opacity: 0.5, ink: 'blue' } }],
};

describe('parseSavedDrawing', () => {
  it('sürüm 1 kaydı güncel sürüme taşınır: içerik aynı, ızgara varsayılan, şekil yok, tek katman', () => {
    expect(parseSavedDrawing(valid)).toEqual({
      ...valid,
      version: SAVE_VERSION,
      grid: DEFAULT_GRID,
      shapes: [],
      cornerLines: { target: 'all', pointId: null },
      strokes: valid.strokes.map((s) => ({ ...s, layerId: LEGACY_LAYER_ID })),
      layers: [{ id: LEGACY_LAYER_ID, name: '', visible: true, locked: false, opacity: 1 }],
      activeLayerId: LEGACY_LAYER_ID,
    });
  });

  it('yönlendirmesi olmayan eski kaydı boyuttan çıkarır', () => {
    const legacy = { ...valid, paper: { kind: 'a4', width: 1122.5, height: 793.7 } };
    expect(parseSavedDrawing(legacy)?.paper.orientation).toBe('landscape');
    const legacyPortrait = { ...valid, paper: { kind: 'a4', width: 793.7, height: 1122.5 } };
    expect(parseSavedDrawing(legacyPortrait)?.paper.orientation).toBe('portrait');
  });

  it('ufuk açısı olmayan eski kayıtta 0, bozuk açıda 0, geniş açı normalize edilir', () => {
    const { horizonAngle: _omit, ...legacyScene } = valid.scene;
    void _omit;
    expect(parseSavedDrawing({ ...valid, scene: legacyScene })?.scene.horizonAngle).toBe(0);
    expect(parseSavedDrawing({ ...valid, scene: { ...valid.scene, horizonAngle: 'x' } })?.scene.horizonAngle).toBe(0);
    expect(parseSavedDrawing({ ...valid, scene: { ...valid.scene, horizonAngle: Math.PI } })?.scene.horizonAngle).toBeCloseTo(0);
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

describe('sürüm 2', () => {
  const v2 = {
    ...valid,
    version: 2,
    grid: { visible: true, snap: true, spacingMm: 5, centerMark: true },
    shapes: [
      {
        id: 'r1',
        kind: 'rect',
        vertices: [0, 0, 10, 0, 10, 5, 0, 5],
        style: { width: 2, opacity: 1, ink: 'black' },
        cornerLines: false,
      },
    ],
    cornerLines: { target: 'one', pointId: 'p2' },
  };

  it('sürüm 2 kaydı sürüm 3’e taşınır: tüm nesneler tek katmanda', () => {
    expect(parseSavedDrawing(v2)).toEqual({
      ...v2,
      version: 3,
      strokes: v2.strokes.map((s) => ({ ...s, layerId: LEGACY_LAYER_ID })),
      shapes: v2.shapes.map((s) => ({ ...s, layerId: LEGACY_LAYER_ID })),
      layers: [{ id: LEGACY_LAYER_ID, name: '', visible: true, locked: false, opacity: 1 }],
      activeLayerId: LEGACY_LAYER_ID,
    });
  });

  it('köşe çizgisi ayarı yoksa ya da bozuksa varsayılan', () => {
    const { cornerLines: _omit, ...without } = v2;
    expect(parseSavedDrawing(without)!.cornerLines).toEqual({ target: 'all', pointId: null });
    expect(parseSavedDrawing({ ...v2, cornerLines: { target: 'x', pointId: 3 } })!.cornerLines).toEqual({
      target: 'all',
      pointId: null,
    });
  });

  it('daha yeni ya da tanınmayan sürüm reddedilir', () => {
    expect(parseSavedDrawing({ ...v2, version: SAVE_VERSION + 1 })).toBeNull();
    expect(parseSavedDrawing({ ...v2, version: 0 })).toBeNull();
    expect(parseSavedDrawing({ ...v2, version: '2' })).toBeNull();
    expect(migrateSavedDrawing({ version: 1.5 })).toBeNull();
  });

  it('dönüştürücü yapıyı taşır, girdiyi değiştirmez', () => {
    const input = { ...valid };
    const out = migrateSavedDrawing(input)!;
    expect(out.version).toBe(SAVE_VERSION);
    expect(input.version).toBe(1);
  });

  it('kapalı mod (0): pasif kurgu korunur (en fazla 3 nokta)', () => {
    const points = [
      { id: 'a', x: 1, y: 2 },
      { id: 'b', x: 3, y: 2 },
      { id: 'c', x: 2, y: 9, role: 'vertical' },
      { id: 'd', x: 5, y: 5 },
    ];
    const d = parseSavedDrawing({ ...v2, scene: { ...v2.scene, mode: 0, points } })!;
    expect(d.scene.mode).toBe(0);
    expect(d.scene.points.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(parseSavedDrawing({ ...v2, scene: { ...v2.scene, mode: 4 } })).toBeNull();
  });

  it('ızgara: bilinmeyen aralık varsayılana döner, eksik alanlar kapalı', () => {
    expect(parseSavedDrawing({ ...v2, grid: { spacingMm: 7 } })!.grid).toEqual(DEFAULT_GRID);
    expect(parseSavedDrawing({ ...v2, grid: 'x' })!.grid).toEqual(DEFAULT_GRID);
  });

  it('şekiller: bozuk olanlar atlanır, köşe sayısı türe uymalı', () => {
    const style = { width: 2, opacity: 1, ink: 'blue' };
    const shapes = [
      { id: 'ok-seg', kind: 'segment', vertices: [0, 0, 5, 5], style },
      { id: 'ok-poly', kind: 'polygon', vertices: [0, 0, 5, 0, 5, 5, 0, 9], style },
      { id: 'bad-kind', kind: 'circle', vertices: [0, 0, 5, 5], style },
      { id: 'bad-tri', kind: 'triangle', vertices: [0, 0, 5, 5], style },
      { id: 'bad-odd', kind: 'segment', vertices: [0, 0, 5], style },
      { id: 'bad-style', kind: 'segment', vertices: [0, 0, 5, 5], style: { width: 0, opacity: 1, ink: 'blue' } },
    ];
    const d = parseSavedDrawing({ ...v2, shapes })!;
    expect(d.shapes.map((s) => s.id)).toEqual(['ok-seg', 'ok-poly']);
    // cornerLines belirtilmemişse açık
    expect(d.shapes[0].cornerLines).toBe(true);
  });
});

describe('sürüm 3: katmanlar', () => {
  const style = { width: 2, opacity: 1, ink: 'blue' };
  const v3 = {
    ...valid,
    version: 3,
    grid: DEFAULT_GRID,
    cornerLines: { target: 'all', pointId: null },
    layers: [
      { id: 'a', name: 'Eskiz', visible: true, locked: false, opacity: 0.5 },
      { id: 'b', name: '', visible: false, locked: true, opacity: 1 },
    ],
    activeLayerId: 'b',
    strokes: [{ id: 's1', points: [0, 0, 5, 5], style, layerId: 'b' }],
    shapes: [{ id: 'h1', kind: 'segment', vertices: [0, 0, 5, 5], style, cornerLines: true, layerId: 'a' }],
  };

  it('geçerli kayıt aynen döner', () => {
    expect(parseSavedDrawing(v3)).toEqual(v3);
  });

  it('bilinmeyen katmandaki nesne en alttakine, geçersiz etkin katman en üsttekine', () => {
    const d = parseSavedDrawing({
      ...v3,
      activeLayerId: 'yok',
      strokes: [{ id: 's1', points: [0, 0, 5, 5], style, layerId: 'yok' }, { id: 's2', points: [1, 1], style }],
    })!;
    expect(d.strokes.map((s) => s.layerId)).toEqual(['a', 'a']);
    expect(d.activeLayerId).toBe('b');
  });

  it('bozuk katmanlar atlanır, yinelenen kimlik tek, hiç yoksa bir katman; opaklık sınırlanır', () => {
    const d = parseSavedDrawing({
      ...v3,
      layers: [{ id: 'a', opacity: 3 }, { id: 'a' }, { name: 'kimliksiz' }, 'x'],
    })!;
    expect(d.layers).toEqual([{ id: 'a', name: '', visible: true, locked: false, opacity: 1 }]);
    const empty = parseSavedDrawing({ ...v3, layers: [] })!;
    expect(empty.layers).toHaveLength(1);
    expect(empty.strokes[0].layerId).toBe(empty.layers[0].id);
  });
});
