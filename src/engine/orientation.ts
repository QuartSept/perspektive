import type { DrawingDocument } from './document';
import type { Point } from './geometry';
import type { Command } from './history';
import type { Orientation, Paper } from './paper';
import type { Stroke } from './stroke';
import { normalizeLineAngle, type PerspectiveScene, type SceneSnapshot } from '../perspective/scene';

export interface ContentRotation {
  map(p: Point): Point;
  /** Yönlerin döndüğü açı (radyan, ekran koordinatında saat yönü pozitif). */
  angle: number;
}

/**
 * Kâğıt dikey ↔ yatay dönerken içeriğe uygulanan 90° dönüşüm; içerik kâğıt
 * üzerindeki yerini korur (kâğıdı elde çevirmek gibi).
 *  dikey → yatay: saat yönünde   (x, y) → (H − y, x)   H: dikey kâğıdın yüksekliği
 *  yatay → dikey: saat yönü tersi (x, y) → (y, W − x)   W: yatay kâğıdın genişliği
 * İkisi birbirinin tersidir; ileri-geri çevirmek içeriği yerine döndürür.
 */
export function contentRotation(to: Orientation, paperWidth: number, paperHeight: number): ContentRotation {
  return to === 'landscape'
    ? { map: (p) => ({ x: paperHeight - p.y, y: p.x }), angle: Math.PI / 2 }
    : { map: (p) => ({ x: p.y, y: paperWidth - p.x }), angle: -Math.PI / 2 };
}

export function rotateStroke(stroke: Stroke, rotation: ContentRotation): Stroke {
  const points = new Array<number>(stroke.points.length);
  for (let i = 0; i < stroke.points.length; i += 2) {
    const q = rotation.map({ x: stroke.points[i], y: stroke.points[i + 1] });
    points[i] = q.x;
    points[i + 1] = q.y;
  }
  return { id: stroke.id, points, style: stroke.style };
}

function rotateSnapshot(snap: SceneSnapshot, rotation: ContentRotation): SceneSnapshot {
  return {
    ...snap,
    horizonAngle: normalizeLineAngle(snap.horizonAngle + rotation.angle),
    points: snap.points.map((p) => ({ id: p.id, ...rotation.map(p) })),
  };
}

interface OrientationState {
  orientation: Orientation;
  strokes: readonly Stroke[];
  scene: SceneSnapshot;
}

/**
 * Çizim başlamışken yönlendirme değişimi: kâğıt, stroke'lar ve kaçış noktaları
 * birlikte 90° döner. Tek adımda geri alınır. (Çizim yoksa kaçış noktaları
 * yerinde kalır ve bu komut kullanılmaz.)
 */
export class OrientationCommand implements Command {
  private readonly before: OrientationState;
  private readonly after: OrientationState;

  constructor(
    private readonly paper: Paper,
    private readonly doc: DrawingDocument,
    private readonly scene: PerspectiveScene,
    to: Orientation,
    private readonly onChanged: () => void,
  ) {
    const rotation = contentRotation(to, paper.width, paper.height);
    const sceneSnap = scene.snapshot();
    this.before = { orientation: paper.orientation, strokes: [...doc.strokes], scene: sceneSnap };
    this.after = {
      orientation: to,
      strokes: doc.strokes.map((s) => rotateStroke(s, rotation)),
      scene: rotateSnapshot(sceneSnap, rotation),
    };
  }

  apply(): void {
    this.set(this.after);
  }

  revert(): void {
    this.set(this.before);
  }

  private set(state: OrientationState): void {
    this.paper.setOrientation(state.orientation);
    this.doc.replaceAll([...state.strokes]);
    this.scene.restore(state.scene);
    this.onChanged();
  }
}
