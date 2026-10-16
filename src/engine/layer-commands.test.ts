import { describe, expect, it } from 'vitest';
import { MAX_LAYERS } from './doc-layers';
import { DrawingDocument } from './document';
import { History } from './history';
import {
  addLayerCommand,
  beginLayerEdit,
  duplicateLayerCommand,
  mergeDownCommand,
  moveLayerCommand,
  removeLayerCommand,
  updateLayerCommand,
} from './layer-commands';
import type { Shape } from './shapes';
import type { Stroke } from './stroke';

const stroke = (id: string, layerId?: string, opacity = 1): Stroke => ({
  id,
  points: [0, 0, 10, 10],
  style: { width: 2, opacity, ink: 'black' },
  ...(layerId ? { layerId } : {}),
});
const shape = (id: string, layerId: string): Shape => ({
  id,
  kind: 'segment',
  vertices: [0, 0, 5, 5],
  style: { width: 2, opacity: 1, ink: 'black' },
  cornerLines: true,
  layerId,
});

function setup() {
  const doc = new DrawingDocument();
  const history = new History();
  const bottom = doc.layers[0].id;
  history.execute(addLayerCommand(doc, 'Üst')!);
  const top = doc.activeLayerId;
  doc.replaceAll([stroke('a', bottom), stroke('b', top), stroke('c')], [shape('h', top)]);
  history.clear();
  return { doc, history, bottom, top };
}

describe('belge katmanları', () => {
  it('yeni belge tek katmanla açılır; katmanı olmayan nesne en alttaki katmanda', () => {
    const doc = new DrawingDocument();
    expect(doc.layers).toHaveLength(1);
    expect(doc.layerOf(stroke('x')).id).toBe(doc.layers[0].id);
    expect(doc.layerOf(stroke('y', 'bilinmeyen')).id).toBe(doc.layers[0].id);
  });

  it('görünürlük ve kilit: düzenlenebilirlik', () => {
    const { doc, history, top } = setup();
    history.execute(updateLayerCommand(doc, top, { locked: true })!);
    expect(doc.isVisible(stroke('b', top))).toBe(true);
    expect(doc.isEditable(stroke('b', top))).toBe(false);
    history.execute(updateLayerCommand(doc, top, { visible: false, locked: false })!);
    expect(doc.isEditable(stroke('b', top))).toBe(false);
    expect(doc.isVisible(stroke('b', top))).toBe(false);
  });
});

describe('katman komutları', () => {
  it('ekle: etkin katmanın üstüne, yeni katman etkin; geri alınır; sınırda null', () => {
    const { doc, history, bottom, top } = setup();
    doc.setActiveLayer(bottom);
    history.execute(addLayerCommand(doc, 'Orta')!);
    expect(doc.layers.map((l) => l.name)).toEqual(['', 'Orta', 'Üst']);
    expect(doc.activeLayer.name).toBe('Orta');
    history.undo();
    expect(doc.layers.map((l) => l.id)).toEqual([bottom, top]);
    expect(doc.activeLayerId).toBe(bottom);
    while (doc.layers.length < MAX_LAYERS) history.execute(addLayerCommand(doc)!);
    expect(addLayerCommand(doc)).toBeNull();
  });

  it('sil: içindeki nesnelerle birlikte; tek adımda geri gelir; son katman silinmez', () => {
    const { doc, history, bottom, top } = setup();
    history.execute(removeLayerCommand(doc, top)!);
    expect(doc.layers.map((l) => l.id)).toEqual([bottom]);
    expect(doc.strokes.map((s) => s.id)).toEqual(['a', 'c']);
    expect(doc.shapes).toHaveLength(0);
    expect(doc.activeLayerId).toBe(bottom);
    expect(removeLayerCommand(doc, bottom)).toBeNull();
    history.undo();
    expect(doc.layers.map((l) => l.id)).toEqual([bottom, top]);
    expect(doc.strokes.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(doc.shapes.map((s) => s.id)).toEqual(['h']);
    expect(doc.activeLayerId).toBe(top);
  });

  it('sırala: katman taşınır, değişiklik yoksa null', () => {
    const { doc, history, bottom, top } = setup();
    history.execute(moveLayerCommand(doc, top, 0)!);
    expect(doc.layers.map((l) => l.id)).toEqual([top, bottom]);
    // Katmansız stroke artık en alttaki (top) katmanda sayılır
    expect(doc.layerOf(stroke('c')).id).toBe(top);
    expect(moveLayerCommand(doc, top, 0)).toBeNull();
    history.undo();
    expect(doc.layers.map((l) => l.id)).toEqual([bottom, top]);
  });

  it('çoğalt: nesneler yeni kimliklerle kopya katmana, kopya etkin; geri alınır', () => {
    const { doc, history, top } = setup();
    history.execute(duplicateLayerCommand(doc, top, 'Kopya')!);
    expect(doc.layers).toHaveLength(3);
    const copy = doc.activeLayer;
    expect(copy.name).toBe('Kopya');
    const copied = doc.strokes.filter((s) => s.layerId === copy.id);
    expect(copied).toHaveLength(1);
    expect(copied[0].id).not.toBe('b');
    expect(doc.shapes.filter((s) => s.layerId === copy.id)).toHaveLength(1);
    history.undo();
    expect(doc.layers).toHaveLength(2);
    expect(doc.strokes).toHaveLength(3);
  });

  it('aşağıyla birleştir: nesneler alt katmana, sıra korunur, opaklık oranlanır', () => {
    const { doc, history, bottom, top } = setup();
    history.execute(updateLayerCommand(doc, top, { opacity: 0.5 })!);
    history.execute(mergeDownCommand(doc, top)!);
    expect(doc.layers.map((l) => l.id)).toEqual([bottom]);
    expect(doc.strokes.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    const b = doc.strokes[1];
    expect(b.layerId).toBe(bottom);
    expect(b.style.opacity).toBeCloseTo(0.5);
    expect(doc.shapes[0].layerId).toBe(bottom);
    expect(mergeDownCommand(doc, bottom)).toBeNull();
    history.undo();
    expect(doc.layers.map((l) => l.id)).toEqual([bottom, top]);
    expect(doc.strokes[1].layerId).toBe(top);
    expect(doc.strokes[1].style.opacity).toBe(1);
  });

  it('opaklık sınırlanır; kaydırıcı sürükleme tek adımda kaydedilir', () => {
    const { doc, history, top } = setup();
    // 1'in üstü 1'e sınırlanır: değişiklik yok
    expect(updateLayerCommand(doc, top, { opacity: 3 })).toBeNull();
    const commit = beginLayerEdit(history, doc);
    for (const o of [0.9, 0.7, 0.4]) {
      doc.setLayers(doc.layers.map((l) => (l.id === top ? { ...l, opacity: o } : l)));
    }
    commit();
    expect(doc.getLayer(top)!.opacity).toBe(0.4);
    history.undo();
    expect(doc.getLayer(top)!.opacity).toBe(1);
  });
});
