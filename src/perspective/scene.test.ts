import { describe, expect, it } from 'vitest';
import { PerspectiveScene, RAY_COUNT_MAX, RAY_COUNT_MIN } from './scene';

const paper = { x: 0, y: 0, width: 800, height: 1000 };

function twoPointScene(): PerspectiveScene {
  const scene = new PerspectiveScene();
  scene.reset(paper);
  return scene;
}

describe('PerspectiveScene', () => {
  it('varsayılan kurgu: 2 nokta, kilitli ufuk, aynı y', () => {
    const scene = twoPointScene();
    expect(scene.mode).toBe(2);
    expect(scene.points).toHaveLength(2);
    expect(scene.points[0].y).toBe(400);
    expect(scene.points[1].y).toBe(400);
    expect(scene.canAddPoint).toBe(false);
  });

  it('kilitli ufukta bir noktayı taşımak diğerini dikeyde izletir', () => {
    const scene = twoPointScene();
    const [a, b] = scene.points;
    scene.movePoint(a.id, { x: 10, y: 250 });
    expect(scene.getPoint(a.id)).toMatchObject({ x: 10, y: 250 });
    expect(scene.getPoint(b.id)!.y).toBe(250);
    expect(scene.getPoint(b.id)!.x).toBe(b.x);
  });

  it('serbest ufukta noktalar bağımsız, ufuk eğik', () => {
    const scene = twoPointScene();
    scene.setHorizonLocked(false);
    const [a, b] = scene.points;
    scene.movePoint(a.id, { x: a.x, y: 300 });
    expect(scene.getPoint(b.id)!.y).toBe(400);
    expect(scene.horizon()!.angle).not.toBe(0);
  });

  it('yeniden kilitlenince noktalar ortalama y’de hizalanır', () => {
    const scene = twoPointScene();
    scene.setHorizonLocked(false);
    scene.movePoint(scene.points[0].id, { x: 0, y: 300 });
    scene.setHorizonLocked(true);
    expect(scene.points.map((p) => p.y)).toEqual([350, 350]);
  });

  it('kilitli ufukta yeni nokta ufka oturur', () => {
    const scene = twoPointScene();
    scene.removePoint(scene.points[1].id);
    const added = scene.addPoint({ x: 500, y: 900 })!;
    expect(added.y).toBe(400);
  });

  it('mod sınırı aşılmaz', () => {
    const scene = twoPointScene();
    expect(scene.addPoint({ x: 1, y: 1 })).toBeNull();
  });

  it('2 → 1 geçişinde seçili nokta korunur, 1 → 2 ikinciyi karşı tarafa ekler', () => {
    const scene = twoPointScene();
    const keep = scene.points[1].id;
    scene.setMode(1, paper, keep);
    expect(scene.points.map((p) => p.id)).toEqual([keep]);

    scene.setMode(2, paper);
    expect(scene.points).toHaveLength(2);
    const [p, q] = scene.points;
    expect(q.y).toBe(p.y);
    // Karşı tarafta (merkezin öbür yanında)
    expect(Math.sign(p.x - 400)).not.toBe(Math.sign(q.x - 400));
  });

  it('ışın sayısı adıma yuvarlanır ve sınırlanır', () => {
    const scene = new PerspectiveScene();
    scene.setRayCount(30);
    expect(scene.rayCount).toBe(32);
    scene.setRayCount(1);
    expect(scene.rayCount).toBe(RAY_COUNT_MIN);
    scene.setRayCount(999);
    expect(scene.rayCount).toBe(RAY_COUNT_MAX);
  });

  it('anlık görüntü geri yüklenir ve kopyadır', () => {
    const scene = twoPointScene();
    const snap = scene.snapshot();
    scene.movePoint(scene.points[0].id, { x: 5, y: 5 });
    scene.restore(snap);
    expect(scene.points[0].y).toBe(400);
    scene.points[0].x = 123;
    expect(snap.points[0].x).not.toBe(123);
  });
});
