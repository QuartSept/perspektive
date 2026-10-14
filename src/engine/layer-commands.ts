import { ReplaceShapesCommand, ReplaceStrokesCommand } from './commands';
import {
  createLayer,
  LAYER_OPACITY_MAX,
  LAYER_OPACITY_MIN,
  MAX_LAYERS,
  type Layer,
} from './doc-layers';
import type { DrawingDocument } from './document';
import { clamp } from './geometry';
import { CompositeCommand, type Command, type History } from './history';
import { newShapeId, type Shape } from './shapes';
import { newStrokeId, type Stroke } from './stroke';

interface LayerState {
  layers: readonly Layer[];
  activeId: string;
}

const layerState = (doc: DrawingDocument): LayerState => ({
  layers: doc.layers.map((l) => ({ ...l })),
  activeId: doc.activeLayerId,
});

function sameLayers(a: LayerState, b: LayerState): boolean {
  return (
    a.activeId === b.activeId &&
    a.layers.length === b.layers.length &&
    a.layers.every((l, i) => {
      const m = b.layers[i];
      return (
        l.id === m.id &&
        l.name === m.name &&
        l.visible === m.visible &&
        l.locked === m.locked &&
        l.opacity === m.opacity
      );
    })
  );
}

/** Katman listesi ve etkin katman değişikliği (ekle, sırala, göster/gizle, kilit, opaklık, ad). */
export class LayerListCommand implements Command {
  constructor(
    private readonly doc: DrawingDocument,
    private readonly before: LayerState,
    private readonly after: LayerState,
  ) {}

  apply(): void {
    this.doc.setLayers(this.after.layers, this.after.activeId);
  }

  revert(): void {
    this.doc.setLayers(this.before.layers, this.before.activeId);
  }
}

/** Katman listesini `mutate` ile değiştiren komut; değişiklik yoksa null. */
function layerChange(
  doc: DrawingDocument,
  mutate: (layers: Layer[]) => string | void,
): LayerListCommand | null {
  const before = layerState(doc);
  const layers = before.layers.map((l) => ({ ...l }));
  const activeId = mutate(layers) ?? before.activeId;
  const after = { layers, activeId };
  return sameLayers(before, after) ? null : new LayerListCommand(doc, before, after);
}

/**
 * Sürükleme gibi çok adımlı katman değişikliği (ör. opaklık kaydırıcısı):
 * ara adımlar `doc.setLayers` ile doğrudan uygulanır, bitince tek komut kaydedilir.
 */
export function beginLayerEdit(history: History, doc: DrawingDocument): () => void {
  const before = layerState(doc);
  return () => {
    const after = layerState(doc);
    if (!sameLayers(before, after)) history.record(new LayerListCommand(doc, before, after));
  };
}

/** Etkin katmanın üstüne yeni katman ekler ve onu etkin yapar; sınırdaysa null. */
export function addLayerCommand(doc: DrawingDocument, name = ''): LayerListCommand | null {
  if (doc.layers.length >= MAX_LAYERS) return null;
  const layer = createLayer(name);
  return layerChange(doc, (layers) => {
    layers.splice(doc.layerIndex(doc.activeLayerId) + 1, 0, layer);
    return layer.id;
  });
}

/** Katman özelliklerini değiştirir (ad, görünürlük, kilit, opaklık). */
export function updateLayerCommand(
  doc: DrawingDocument,
  id: string,
  patch: Partial<Pick<Layer, 'name' | 'visible' | 'locked' | 'opacity'>>,
): LayerListCommand | null {
  return layerChange(doc, (layers) => {
    const layer = layers.find((l) => l.id === id);
    if (!layer) return;
    Object.assign(layer, patch);
    layer.opacity = clamp(layer.opacity, LAYER_OPACITY_MIN, LAYER_OPACITY_MAX);
  });
}

/** Katmanı yeni sıraya taşır (0 = en alt). */
export function moveLayerCommand(doc: DrawingDocument, id: string, toIndex: number): LayerListCommand | null {
  return layerChange(doc, (layers) => {
    const from = layers.findIndex((l) => l.id === id);
    if (from < 0) return;
    const [layer] = layers.splice(from, 1);
    layers.splice(clamp(Math.round(toIndex), 0, layers.length), 0, layer);
  });
}

const strokesOf = (doc: DrawingDocument, id: string) => doc.strokes.filter((s) => doc.layerOf(s).id === id);
const shapesOf = (doc: DrawingDocument, id: string) => doc.shapes.filter((s) => doc.layerOf(s).id === id);

/**
 * Katmanı ve içindeki nesneleri siler (tek adımda geri alınır). Son kalan
 * katman silinemez; etkin katman silinirse altındaki (yoksa üstündeki) etkin olur.
 */
export function removeLayerCommand(doc: DrawingDocument, id: string): Command | null {
  const index = doc.layerIndex(id);
  if (index < 0 || doc.layers.length <= 1) return null;
  const nextActive =
    doc.activeLayerId === id ? doc.layers[index > 0 ? index - 1 : 1].id : doc.activeLayerId;
  const list = layerChange(doc, (layers) => {
    layers.splice(index, 1);
    return nextActive;
  })!;
  const commands: Command[] = [];
  const strokes = strokesOf(doc, id).map((s) => s.id);
  const shapes = shapesOf(doc, id).map((s) => s.id);
  if (strokes.length) commands.push(new ReplaceStrokesCommand(doc, strokes, []));
  if (shapes.length) commands.push(new ReplaceShapesCommand(doc, shapes, []));
  // Önce nesneler kalkar, sonra katman (geri alırken tersi)
  commands.push(list);
  return new CompositeCommand(commands);
}

/** Katmanı içeriğiyle birlikte üstüne kopyalar; kopya etkin olur. */
export function duplicateLayerCommand(doc: DrawingDocument, id: string, name = ''): Command | null {
  const index = doc.layerIndex(id);
  if (index < 0 || doc.layers.length >= MAX_LAYERS) return null;
  const source = doc.layers[index];
  const copy: Layer = { ...source, id: createLayer().id, name };
  const list = layerChange(doc, (layers) => {
    layers.splice(index + 1, 0, copy);
    return copy.id;
  })!;
  const strokes = strokesOf(doc, id).map(
    (s, k): { index: number; stroke: Stroke } => ({
      index: doc.strokes.length + k,
      stroke: { ...s, id: newStrokeId(), layerId: copy.id },
    }),
  );
  const shapes = shapesOf(doc, id).map(
    (s, k): { index: number; shape: Shape } => ({
      index: doc.shapes.length + k,
      shape: { ...s, id: newShapeId(), layerId: copy.id },
    }),
  );
  // Önce katman (nesneler ona bağlanır), sonra nesneler
  const commands: Command[] = [list];
  if (strokes.length) commands.push(new ReplaceStrokesCommand(doc, [], strokes));
  if (shapes.length) commands.push(new ReplaceShapesCommand(doc, [], shapes));
  return new CompositeCommand(commands);
}

/**
 * Katmanı altındakiyle birleştirir: nesneler alt katmana geçer (sıraları korunur),
 * üst katman kalkar. Görünüm korunsun diye nesne opaklığı iki katman opaklığının
 * oranıyla düzeltilir (alt katman daha saydamsa üst sınır 1).
 */
export function mergeDownCommand(doc: DrawingDocument, id: string): Command | null {
  const index = doc.layerIndex(id);
  if (index <= 0) return null;
  const upper = doc.layers[index];
  const lower = doc.layers[index - 1];
  const ratio = lower.opacity > 0 ? upper.opacity / lower.opacity : 1;
  const restyle = <T extends { style: Stroke['style'] }>(o: T): T =>
    ratio === 1 ? o : { ...o, style: { ...o.style, opacity: clamp(o.style.opacity * ratio, 0, 1) } };

  const strokes = strokesOf(doc, id);
  const shapes = shapesOf(doc, id);
  const commands: Command[] = [];
  if (strokes.length) {
    commands.push(
      new ReplaceStrokesCommand(
        doc,
        strokes.map((s) => s.id),
        strokes.map((s) => ({ index: doc.strokes.indexOf(s), stroke: { ...restyle(s), layerId: lower.id } })),
      ),
    );
  }
  if (shapes.length) {
    commands.push(
      new ReplaceShapesCommand(
        doc,
        shapes.map((s) => s.id),
        shapes.map((s) => ({ index: doc.shapes.indexOf(s), shape: { ...restyle(s), layerId: lower.id } })),
      ),
    );
  }
  commands.push(
    layerChange(doc, (layers) => {
      layers.splice(index, 1);
      return doc.activeLayerId === id ? lower.id : doc.activeLayerId;
    })!,
  );
  return new CompositeCommand(commands);
}
