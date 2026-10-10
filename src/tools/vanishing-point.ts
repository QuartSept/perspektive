import type { Point } from '../engine/geometry';
import type { EditorState } from '../engine/state';
import type { Viewport } from '../engine/viewport';
import type { PerspectiveScene } from '../perspective/scene';
import type { Tool, ToolPointerEvent } from './tool';

/** CSS piksel. */
const POINT_HIT_RADIUS = 12;
const HORIZON_HIT_DISTANCE = 6;

type Drag =
  | { kind: 'point'; id: string; offset: Point }
  | { kind: 'horizon'; lastWorld: Point };

/**
 * Kaçış noktası aracı:
 *  - boş alana tıkla: nokta ekle (mod sınırına kadar), sürükleyerek yerleştir
 *  - noktayı sürükle: taşı (kilitli ufukta diğer nokta da dikeyde izler)
 *  - ufuk çizgisini sürükle: ufku dikeyde taşı
 *  - silme: seçip Delete / panel düğmesi (main.ts)
 */
export class VanishingPointTool implements Tool {
  readonly id = 'point';
  private drag: Drag | null = null;

  constructor(
    private readonly viewport: Viewport,
    private readonly scene: PerspectiveScene,
    private readonly state: EditorState,
    private readonly onCursorChange: () => void,
  ) {}

  get cursor(): string {
    if (this.drag) return this.drag.kind === 'point' ? 'grabbing' : 'ns-resize';
    if (this.state.hoveredPointId) return 'grab';
    if (this.state.horizonHovered) return 'ns-resize';
    return this.scene.canAddPoint ? 'crosshair' : 'default';
  }

  deactivate(): void {
    this.drag = null;
    this.state.update({
      hoveredPointId: null,
      horizonHovered: false,
      draggingPointId: null,
      selectedPointId: null,
    });
  }

  onPointerDown(e: ToolPointerEvent): void {
    const hitId = this.hitPoint(e.screen);
    if (hitId) {
      const p = this.scene.getPoint(hitId)!;
      this.drag = { kind: 'point', id: hitId, offset: { x: p.x - e.world.x, y: p.y - e.world.y } };
      this.state.update({ selectedPointId: hitId, draggingPointId: hitId });
    } else if (this.hitHorizon(e.screen)) {
      this.drag = { kind: 'horizon', lastWorld: e.world };
      this.state.update({ selectedPointId: null, horizonHovered: true });
    } else if (this.scene.canAddPoint) {
      const p = this.scene.addPoint(e.world)!;
      this.drag = { kind: 'point', id: p.id, offset: { x: p.x - e.world.x, y: p.y - e.world.y } };
      this.state.update({ selectedPointId: p.id, draggingPointId: p.id, hoveredPointId: p.id });
    } else {
      this.state.update({ selectedPointId: null });
    }
    this.onCursorChange();
  }

  onPointerMove(e: ToolPointerEvent): void {
    const drag = this.drag;
    if (drag?.kind === 'point') {
      this.scene.movePoint(drag.id, { x: e.world.x + drag.offset.x, y: e.world.y + drag.offset.y });
      return;
    }
    if (drag?.kind === 'horizon') {
      this.scene.translate(0, e.world.y - drag.lastWorld.y);
      drag.lastWorld = e.world;
      return;
    }
    this.updateHover(e.screen);
  }

  onPointerUp(e: ToolPointerEvent): void {
    this.endDrag();
    this.updateHover(e.screen);
  }

  onPointerCancel(): void {
    this.endDrag();
  }

  private endDrag(): void {
    this.drag = null;
    this.state.update({ draggingPointId: null });
    this.onCursorChange();
  }

  private updateHover(screen: Point): void {
    const hoveredPointId = this.hitPoint(screen);
    const horizonHovered = !hoveredPointId && this.hitHorizon(screen);
    this.state.update({ hoveredPointId, horizonHovered });
    this.onCursorChange();
  }

  /** En yakın kaçış noktası (isabet yarıçapı içinde). */
  private hitPoint(screen: Point): string | null {
    if (!this.state.markersVisible) return null;
    let best: string | null = null;
    let bestDist = POINT_HIT_RADIUS;
    for (const p of this.scene.points) {
      const s = this.viewport.worldToScreen(p);
      const d = Math.hypot(s.x - screen.x, s.y - screen.y);
      if (d <= bestDist) {
        best = p.id;
        bestDist = d;
      }
    }
    return best;
  }

  private hitHorizon(screen: Point): boolean {
    if (!this.state.guidesVisible) return false;
    const horizon = this.scene.horizon();
    if (!horizon) return false;
    const o = this.viewport.worldToScreen(horizon.origin);
    const dist = Math.abs(
      (screen.x - o.x) * Math.sin(horizon.angle) - (screen.y - o.y) * Math.cos(horizon.angle),
    );
    return dist <= HORIZON_HIT_DISTANCE;
  }
}
