import { describe, expect, it } from 'vitest';
import { DrawingDocument } from './document';
import { History } from './history';
import { contentRotation, OrientationCommand, rotateStroke } from './orientation';
import { Paper } from './paper';
import type { Stroke } from './stroke';
import { PerspectiveScene } from '../perspective/scene';

const screen = { width: 1000, height: 700 };
const stroke = (id: string, points: number[]): Stroke => ({
  id,
  points,
  style: { width: 2, opacity: 1, ink: 'black' },
});

function setup() {
  const paper = new Paper('a4', screen); // dikey
  const doc = new DrawingDocument();
  const scene = new PerspectiveScene();
  scene.reset(paper.rect);
  return { paper, doc, scene, history: new History() };
}

describe('contentRotation', () => {
  it('dikey → yatay → dikey içeriği yerine döndürür', () => {
    const W = 200;
    const H = 300;
    const toL = contentRotation('landscape', W, H);
    const toP = contentRotation('portrait', H, W);
    const p = { x: 20, y: 50 };
    const q = toP.map(toL.map(p));
    expect(q.x).toBeCloseTo(p.x);
    expect(q.y).toBeCloseTo(p.y);
  });

  it('kâğıt köşeleri yeni kâğıdın köşelerine gider', () => {
    const r = contentRotation('landscape', 200, 300);
    // Dikey kâğıdın sol üstü → yatay kâğıdın sağ üstü (saat yönünde 90°)
    expect(r.map({ x: 0, y: 0 })).toEqual({ x: 300, y: 0 });
    expect(r.map({ x: 200, y: 300 })).toEqual({ x: 0, y: 200 });
  });

  it('stroke kimliği ve stili korunur', () => {
    const s = stroke('a', [0, 0, 10, 0]);
    const r = rotateStroke(s, contentRotation('landscape', 200, 300));
    expect(r.id).toBe('a');
    expect(r.style).toBe(s.style);
    expect(r.points).toEqual([300, 0, 300, 10]);
  });
});

describe('OrientationCommand', () => {
  it('kâğıt, stroke ve kaçış noktaları birlikte döner; geri alınca eski hâline gelir', () => {
    const { paper, doc, scene, history } = setup();
    doc.replaceAll([stroke('a', [10, 20, 100, 20])]);
    const beforePoints = scene.points.map((p) => ({ ...p }));
    const beforePaper = { w: paper.width, h: paper.height };
    let changed = 0;

    history.execute(new OrientationCommand(paper, doc, scene, 'landscape', () => changed++));
    expect(paper.orientation).toBe('landscape');
    expect(paper.width).toBeCloseTo(beforePaper.h);
    // Yatay çizgi dikey oldu
    const [x0, , x1] = doc.strokes[0].points;
    expect(x0).toBeCloseTo(x1);
    // Kilitli ufuk dikey: iki nokta aynı x'te, ufuk açısı 90°
    expect(scene.points[0].x).toBeCloseTo(scene.points[1].x);
    expect(scene.horizon()!.angle).toBeCloseTo(Math.PI / 2);

    history.undo();
    expect(paper.orientation).toBe('portrait');
    expect(doc.strokes[0].points).toEqual([10, 20, 100, 20]);
    expect(scene.points).toEqual(beforePoints);
    expect(scene.horizon()!.angle).toBe(0);
    expect(changed).toBe(2);
  });
});

describe('döndürülmüş ufukta kilit', () => {
  it('noktayı taşımak diğerini dikey ufuk doğrusu üzerinde tutar', () => {
    const { paper, doc, scene, history } = setup();
    doc.replaceAll([stroke('a', [1, 1])]);
    history.execute(new OrientationCommand(paper, doc, scene, 'landscape', () => {}));
    const [a, b] = scene.points;
    scene.movePoint(a.id, { x: a.x + 50, y: a.y + 7 });
    expect(scene.getPoint(b.id)!.x).toBeCloseTo(a.x);
    // Ufka paralel (dikey) konum korunur
    expect(scene.getPoint(b.id)!.y).toBeCloseTo(b.y);
  });

  it('yeni nokta döndürülmüş ufka oturur', () => {
    const { paper, doc, scene, history } = setup();
    doc.replaceAll([stroke('a', [1, 1])]);
    history.execute(new OrientationCommand(paper, doc, scene, 'landscape', () => {}));
    const keep = scene.points[0];
    scene.removePoint(scene.points[1].id);
    const added = scene.addPoint({ x: keep.x + 300, y: 100 })!;
    expect(added.x).toBeCloseTo(keep.x);
    expect(added.y).toBeCloseTo(100);
  });
});

describe('3 nokta döndürme', () => {
  it('dikey kaçış noktasının rolü korunur', () => {
    const { paper, doc, scene, history } = setup();
    scene.setMode(3, paper.rect);
    doc.replaceAll([stroke('a', [1, 1, 5, 5])]);
    history.execute(new OrientationCommand(paper, doc, scene, 'landscape', () => {}));
    expect(scene.points.filter((p) => p.role === 'vertical')).toHaveLength(1);
  });

  it('basınç bilgisi döndürmede korunur', () => {
    const s: Stroke = { ...stroke('p', [0, 0, 10, 0]), pressures: [0.2, 0.9] };
    expect(rotateStroke(s, contentRotation('landscape', 200, 300)).pressures).toEqual([0.2, 0.9]);
  });
});

describe('katman', () => {
  it('döndürülen stroke katmanını korur', () => {
    const r = contentRotation('landscape', 200, 300);
    const s = { ...stroke('a', [0, 0, 10, 10]), layerId: 'L2' };
    expect(rotateStroke(s, r).layerId).toBe('L2');
  });
});
