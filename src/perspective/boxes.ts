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
  doc.shapes.forEach((shape, index) => {
    const box = shape.box;
    if (shape.kind !== 'box' || !box?.pointId) return;
    const p = scene.activePoints.find((q) => q.id === box.pointId);
    if (!p || (p.x === box.vp.x && p.y === box.vp.y)) return;
    updates.push({ index, shape: rebuildBox(shape, { vp: { x: p.x, y: p.y } }) });
  });
  if (!updates.length) return false;
  doc.spliceShapes(
    updates.map((u) => u.shape.id),
    updates,
  );
  return true;
}
