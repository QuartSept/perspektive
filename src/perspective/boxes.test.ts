import { describe, expect, it } from 'vitest';
import { UpdateShapeCommand } from '../engine/commands';
import { DrawingDocument } from '../engine/document';
import { History } from '../engine/history';
import {
  boxOccludedEdges,
  cornerHasVisibleEdge,
  edgeCount,
  mapShape,
  rebuildBox,
  rectToBox,
  rectVertices,
  shapeEdges,
  BOX_DEPTH_MAX,
  BOX_DEPTH_MIN,
  type Shape,
} from '../engine/shapes';
import { buildSvg } from '../engine/svg-export';
import { parseSavedDrawing } from '../storage/format';
import { syncBoxes } from './boxes';
import { PerspectiveScene } from './scene';

const style = { width: 2, opacity: 1, ink: 'black' as const };
const rect = (): Shape => ({
  id: 'r',
  kind: 'rect',
  vertices: rectVertices({ x: 100, y: 100 }, { x: 200, y: 160 }),
  style,
  cornerLines: true,
});

describe('kutu geometrisi (1 nokta)', () => {
  it('arka köşeler ön köşelerden kaçış noktasına doğru derinlik oranında', () => {
    const box = rectToBox(rect(), 'vp', { x: 500, y: 130 }, 0.5);
    expect(box.kind).toBe('box');
    expect(box.id).toBe('r');
    expect(box.vertices.slice(0, 8)).toEqual(rect().vertices);
    // (100,100) → (500,130) yarı yolda: (300,115)
    expect(box.vertices.slice(8, 10)).toEqual([300, 115]);
    expect(edgeCount(box)).toBe(12);
  });

  it('derinlik sınırlanır; uç değerlerde arka yüz öne / kaçış noktasına yakın', () => {
    const near = rebuildBox(rectToBox(rect(), 'vp', { x: 500, y: 130 }), { depth: -1 });
    expect(near.box!.depth).toBe(BOX_DEPTH_MIN);
    expect(near.vertices[8]).toBeCloseTo(100 + 400 * BOX_DEPTH_MIN);
    const far = rebuildBox(near, { depth: 5 });
    expect(far.box!.depth).toBe(BOX_DEPTH_MAX);
    expect(far.vertices[8]).toBeCloseTo(100 + 400 * BOX_DEPTH_MAX);
  });

  it('arkada kalan kenarlar: nokta ön yüzün içindeyse arka yüz ve derinlik kenarları gizli', () => {
    const inside = rectToBox(rect(), 'vp', { x: 150, y: 130 });
    expect([...boxOccludedEdges(inside)].sort((a, b) => a - b)).toEqual([4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('nokta sağ üstteyse üst ve sağ yüz görünür; yalnızca sol-alt arka kenarlar ve sol-alt derinlik kenarı gizli', () => {
    const box = rectToBox(rect(), 'vp', { x: 600, y: -200 });
    // Kenar 4: arka üst (görünür), 5: arka sağ (görünür), 6: arka alt (gizli), 7: arka sol (gizli)
    // Derinlik kenarı 11 (sol-alt köşe 3): sol ve alt yüz ikisi de arkada
    expect([...boxOccludedEdges(box)].sort((a, b) => a - b)).toEqual([6, 7, 11]);
  });

  it('kâğıt döndürmede kaçış noktası da dönüşür; köşe çizgisi kuralı kutu kenarlarıyla', () => {
    const box = rectToBox(rect(), 'vp', { x: 500, y: 130 });
    const m = mapShape(box, (p) => ({ x: -p.y, y: p.x }));
    expect(m.box!.vp).toEqual({ x: -130, y: 500 });
    const hidden = { ...box, hiddenEdges: [0, 3, 8] };
    expect(cornerHasVisibleEdge(hidden, 0)).toBe(false);
    expect(cornerHasVisibleEdge(hidden, 4)).toBe(true);
    expect(shapeEdges(box)[8]).toEqual([
      { x: 100, y: 100 },
      { x: box.vertices[8], y: box.vertices[9] },
    ]);
  });
});

describe('syncBoxes', () => {
  it('kaçış noktası taşınınca kutu yeniden hesaplanır; geri alınınca yine eşlenir', () => {
    const scene = new PerspectiveScene();
    scene.reset({ x: 0, y: 0, width: 1000, height: 1000 });
    scene.setMode(1, { x: 0, y: 0, width: 1000, height: 1000 });
    const p = scene.points[0];
    const doc = new DrawingDocument();
    doc.replaceAll([], [rectToBox(rect(), p.id, { x: p.x, y: p.y })]);
    expect(syncBoxes(doc, scene)).toBe(false);
    scene.movePoint(p.id, { x: 800, y: 300 });
    expect(syncBoxes(doc, scene)).toBe(true);
    const box = doc.shapes[0];
    expect(box.box!.vp).toEqual({ x: 800, y: 300 });
    expect(box.vertices[8]).toBeCloseTo(100 + (800 - 100) * box.box!.depth);
  });

  it('nokta silinmiş ya da perspektif kapalıysa kutu son konumunda kalır', () => {
    const scene = new PerspectiveScene();
    scene.reset({ x: 0, y: 0, width: 1000, height: 1000 });
    const doc = new DrawingDocument();
    doc.replaceAll([], [rectToBox(rect(), 'yok', { x: 500, y: 130 })]);
    expect(syncBoxes(doc, scene)).toBe(false);
    expect(doc.shapes[0].box!.vp).toEqual({ x: 500, y: 130 });
  });
});

describe('kutu kaydı ve çıktı', () => {
  it('kayıt gidiş-dönüş; arka köşeler ön yüzden yeniden hesaplanır', () => {
    const box = rectToBox(rect(), 'vp', { x: 500, y: 130 }, 0.4);
    const tampered = { ...box, vertices: [...box.vertices.slice(0, 8), 0, 0, 0, 0, 0, 0, 0, 0] };
    const saved = {
      version: 3,
      savedAt: 1,
      paper: { kind: 'a4', width: 800, height: 1000, orientation: 'portrait' },
      scene: { mode: 1, horizonLocked: true, horizonAngle: 0, rayCount: 24, points: [] },
      strokes: [],
      shapes: [tampered],
      layers: [{ id: 'a', name: '', visible: true, locked: false, opacity: 1 }],
      activeLayerId: 'a',
    };
    const parsed = parseSavedDrawing(saved)!;
    expect(parsed.shapes[0].vertices).toEqual(box.vertices);
    expect(parsed.shapes[0].box).toEqual(box.box);
    // Parametresiz kutu geçersiz
    expect(parseSavedDrawing({ ...saved, shapes: [{ ...tampered, box: undefined }] })!.shapes).toEqual([]);
  });

  it('SVG: görünen kenarlar düz, arkadakiler kesikli; gizli ayarında yazılmaz', () => {
    const box = rectToBox(rect(), 'vp', { x: 150, y: 130 });
    const theme = {
      inks: { black: '#111', 'gray-dark': '#555', gray: '#888', 'gray-light': '#bbb', red: '#b43', blue: '#25e', green: '#3a4', ochre: '#c82' },
      printPaper: '#fff',
      vanishingPoints: ['#36b'],
      horizon: 'rgba(194, 85, 61, 0.5)',
      markerFill: '#fff',
      printGuideOpacity: 0.35,
      grid: 'rgba(0,0,0,0.2)',
    };
    const scene = new PerspectiveScene();
    const svg = buildSvg({ paper: { width: 800, height: 1000 }, strokes: [], shapes: [box], scene, theme }, false);
    expect(svg).toContain('<g class="box">');
    expect(svg).toContain('stroke-dasharray="6 4"');
    const hidden = buildSvg(
      { paper: { width: 800, height: 1000 }, strokes: [], shapes: [rebuildBox(box, { back: 'hidden' })], scene, theme },
      false,
    );
    expect(hidden).not.toContain('stroke-dasharray');
  });
});

describe('geri al', () => {
  it('kutu düzenleme komutu geri alınır', () => {
    const doc = new DrawingDocument();
    const history = new History();
    const r = rect();
    doc.replaceAll([], [r]);
    const box = rectToBox(r, 'vp', { x: 500, y: 130 });
    history.execute(new UpdateShapeCommand(doc, r, box));
    expect(doc.shapes[0].kind).toBe('box');
    history.undo();
    expect(doc.shapes[0].kind).toBe('rect');
  });
});
