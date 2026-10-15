import type { DrawingDocument } from '../engine/document';
import { rebuildBox, type Shape } from '../engine/shapes';
import type { PerspectiveScene } from './scene';

/**
 * Kutuları kaçış noktalarıyla eşler: noktası taşınmış kutunun arka yüzü
 * yeniden hesaplanır. Türetilmiş veridir; geçmişe yazılmaz (nokta taşıma
 * zaten geri alınabilir, geri alınınca kutular yine eşlenir). Noktası
 * silinmiş ya da perspektif kapalıyken kutu son konumunda kalır.
 * Değişen kutu yoksa belgeye dokunmaz.
 */
export function syncBoxes(doc: DrawingDocument, scene: PerspectiveScene): boolean {
  const updates: { index: number; shape: Shape }[] = [];
  const moved = (id: string | null, vp: { x: number; y: number }) => {
    const p = id ? scene.activePoints.find((q) => q.id === id) : undefined;
    return p && (p.x !== vp.x || p.y !== vp.y) ? { x: p.x, y: p.y } : null;
  };
  doc.shapes.forEach((shape, index) => {
    const box = shape.box;
    if (shape.kind !== 'box' || !box) return;
    const first = moved(box.pointId, box.vp);
    const second = box.second ? moved(box.second.pointId, box.second.vp) : null;
    if (!first && !second) return;
    const patch: Partial<typeof box> = {};
    if (first) patch.vp = first;
    if (second) patch.second = { ...box.second!, vp: second };
    updates.push({ index, shape: rebuildBox(shape, patch) });
  });
  if (!updates.length) return false;
  doc.spliceShapes(
    updates.map((u) => u.shape.id),
    updates,
  );
  return true;
}
