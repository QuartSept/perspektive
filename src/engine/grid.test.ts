import { describe, expect, it } from 'vitest';
import { gridFade, gridLines, gridSource, PaperGrid, snapAlongLine, snapToGrid } from './grid';
import { PX_PER_MM } from './paper';

describe('PaperGrid', () => {
  it('varsayılan kapalı, 10 mm; aralık dünya biriminde', () => {
    const g = new PaperGrid();
    expect(g.toSaved()).toEqual({ visible: false, snap: false, spacingMm: 10, centerMark: false });
    expect(g.spacing).toBeCloseTo(10 * PX_PER_MM);
  });

  it('yalnızca değişiklikte bildirir; bilinmeyen aralığı reddeder', () => {
    const g = new PaperGrid();
    let n = 0;
    g.onChange(() => n++);
    g.setVisible(true);
    g.setVisible(true);
    g.setSpacing(20);
    g.setSpacing(7 as never);
    expect(n).toBe(2);
    expect(g.spacingMm).toBe(20);
    g.restore({ visible: false, snap: true, spacingMm: 5, centerMark: true });
    expect(g.toSaved()).toEqual({ visible: false, snap: true, spacingMm: 5, centerMark: true });
  });
});

describe('snapToGrid', () => {
  it('eşik içinde düğüme, tek eksende çizgiye yapışır, uzakta dokunmaz', () => {
    expect(snapToGrid({ x: 21, y: 39 }, 20, 3)).toEqual({
      point: { x: 20, y: 40 },
      snappedX: true,
      snappedY: true,
    });
    expect(snapToGrid({ x: 21, y: 50 }, 20, 3)).toEqual({
      point: { x: 20, y: 50 },
      snappedX: true,
      snappedY: false,
    });
    expect(snapToGrid({ x: 30, y: 50 }, 20, 3).point).toEqual({ x: 30, y: 50 });
  });
});

describe('snapAlongLine', () => {
  it('doğrunun en yakın ızgara çizgisini kestiği yere kayar', () => {
    const diag = {
      origin: { x: 0, y: 0 },
      direction: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
      kind: 'vanishing-point' as const,
    };
    const p = snapAlongLine(diag, { x: 41, y: 42 }, 20, 4)!;
    expect(p.x).toBeCloseTo(40);
    expect(p.y).toBeCloseTo(40);
  });

  it('yatay doğruda yalnızca dikey ızgara çizgileri; eşik dışında null', () => {
    const h = { origin: { x: 0, y: 5 }, direction: { x: 1, y: 0 }, kind: 'horizontal' as const };
    expect(snapAlongLine(h, { x: 58, y: 9 }, 20, 3)).toEqual({ x: 60, y: 5 });
    expect(snapAlongLine(h, { x: 50, y: 9 }, 20, 3)).toBeNull();
  });
});

describe('gridSource', () => {
  it('ızgara çizgisi üzerindeki başlangıç için o çizgi; yapış kapalıyken boş', () => {
    const g = new PaperGrid();
    const src = gridSource(g);
    const s = g.spacing;
    expect(src({ x: 2 * s, y: 3 * s }, 0)).toEqual([]);
    g.setSnap(true);
    expect(src({ x: 2 * s, y: 3 * s }, 0).map((l) => l.kind)).toEqual(['horizontal', 'vertical']);
    expect(src({ x: 2 * s + 5, y: 3 * s }, 0).map((l) => l.kind)).toEqual(['horizontal']);
    expect(src({ x: 2 * s + 5, y: 3 * s + 5 }, 0)).toEqual([]);
  });
});

describe('gridLines ve gridFade', () => {
  it('yalnızca kâğıt içindeki iç çizgiler, görünür alanla kırpılır', () => {
    const paper = { x: 0, y: 0, width: 100, height: 60 };
    expect(gridLines(paper, 20)).toEqual({ xs: [20, 40, 60, 80], ys: [20, 40] });
    expect(gridLines(paper, 20, { x: 30, y: -10, width: 30, height: 200 })).toEqual({
      xs: [40, 60],
      ys: [20, 40],
    });
    expect(gridLines(paper, 20, { x: 500, y: 0, width: 10, height: 10 })).toEqual({ xs: [], ys: [] });
  });

  it('ekranda sıkışınca soluklaşır, çok sıkışınca çizilmez', () => {
    expect(gridFade(3)).toBe(0);
    expect(gridFade(7.5)).toBeCloseTo(0.5);
    expect(gridFade(40)).toBe(1);
  });
});
