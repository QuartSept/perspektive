import { describe, expect, it } from 'vitest';
import { Viewport } from './viewport';

function view(rotation = 0): Viewport {
  const v = new Viewport();
  v.resize(1000, 800);
  v.setScale(1.5);
  v.panBy(30, -20);
  if (rotation) v.setRotation(rotation);
  return v;
}

const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
};

describe('Viewport döndürme', () => {
  it('gidiş-dönüş: screenToWorld(worldToScreen(p)) = p (çeşitli açılarda)', () => {
    for (const angle of [0, 0.3, Math.PI / 2, -2.1, Math.PI]) {
      const v = view(angle);
      for (const p of [{ x: 0, y: 0 }, { x: 123.4, y: -56.7 }, { x: -900, y: 400 }]) {
        close(v.screenToWorld(v.worldToScreen(p)), p);
      }
    }
  });

  it('0° davranışı eskisiyle aynı: ekran = dünya · ölçek + öteleme', () => {
    const v = view();
    expect(v.rotation).toBe(0);
    close(v.worldToScreen({ x: 10, y: 20 }), { x: 10 * v.scale + v.offsetX, y: 20 * v.scale + v.offsetY });
  });

  it('döndürme sabitleme noktası yerinde kalır; 90°de dünya x ekseni ekranda aşağı bakar', () => {
    const v = view();
    const anchor = { x: 400, y: 300 };
    const world = v.screenToWorld(anchor);
    v.setRotation(Math.PI / 2, anchor);
    close(v.worldToScreen(world), anchor);
    const d = v.screenDirection({ x: 1, y: 0 });
    expect(d.x).toBeCloseTo(0);
    expect(d.y).toBeCloseTo(1);
    expect(v.screenAngle(0.25)).toBeCloseTo(0.25 + Math.PI / 2);
  });

  it('açı (-π, π] aralığında tutulur; yakınlaştırma sabitleme noktası dönükken de korunur', () => {
    const v = view();
    v.setRotation(Math.PI * 3);
    expect(v.rotation).toBeCloseTo(Math.PI);
    v.setRotation(0.7);
    const anchor = { x: 200, y: 650 };
    const world = v.screenToWorld(anchor);
    v.zoomAt(anchor, 1.8);
    close(v.worldToScreen(world), anchor);
  });

  it('görünür alan: dönükken ekran köşelerinin hepsini kapsar', () => {
    const v = view(0.6);
    const r = v.visibleWorldRect();
    for (const c of [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 0, y: 800 }, { x: 1000, y: 800 }]) {
      const w = v.screenToWorld(c);
      expect(w.x).toBeGreaterThanOrEqual(r.x - 1e-6);
      expect(w.x).toBeLessThanOrEqual(r.x + r.width + 1e-6);
      expect(w.y).toBeGreaterThanOrEqual(r.y - 1e-6);
      expect(w.y).toBeLessThanOrEqual(r.y + r.height + 1e-6);
    }
  });

  it('sığdır: 90°de dikey kâğıdın döndürülmüş sınır kutusu sığar, merkez ortada', () => {
    const v = view(Math.PI / 2);
    const paper = { x: 0, y: 0, width: 200, height: 300 };
    const pad = { top: 0, right: 0, bottom: 0, left: 0 };
    v.fitRect(paper, pad);
    // Dönükken kâğıt ekranda 300 geniş × 200 yüksek: min(1000/300, 800/200) = 3.33
    expect(v.scale).toBeCloseTo(1000 / 300);
    close(v.worldToScreen({ x: 100, y: 150 }), { x: 500, y: 400 });
    expect(v.rotation).toBeCloseTo(Math.PI / 2);
  });

  it('merkeze git dönükken de noktayı ortaya getirir', () => {
    const v = view(-1.1);
    v.centerOn({ x: 50, y: 70 }, { top: 0, right: 0, bottom: 0, left: 200 });
    close(v.worldToScreen({ x: 50, y: 70 }), { x: 600, y: 400 });
  });
});
