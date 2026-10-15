import type { Point, Rect } from '../engine/geometry';
import type { History } from '../engine/history';
import type { EditorState } from '../engine/state';
import type { Viewport } from '../engine/viewport';
import { CENTER_SNAP_PX, rectCenter, snapToCenter } from '../perspective/centering';
import { beginSceneEdit } from '../perspective/commands';
import type { PerspectiveScene } from '../perspective/scene';
import type { SnapLine } from '../perspective/snapping';
import type { Tool, ToolOverlay, ToolPointerEvent } from './tool';

/** Nokta isabet yarıçapı, CSS piksel: işaret küçük çizilse de yakalaması kolay kalır. */
export const POINT_HIT_PX = 12;
export const POINT_HIT_TOUCH_PX = 22;
/**
 * Başka araçtayken noktayı tutma yarıçapı: daha dar, ki noktanın hemen
 * yanından başlayan çizgi (noktadan çıkan ışın) çizilebilsin.
 */
export const POINT_GRAB_PX = 7;
export const POINT_GRAB_TOUCH_PX = 16;
const HORIZON_HIT_DISTANCE = 6;

type Drag =
  | { kind: 'point'; id: string; offset: Point }
  | { kind: 'horizon'; lastWorld: Point };

export interface VanishingPointToolOptions {
  /**
   * Yalnızca var olan noktayı tutup taşır (fırça, şekil, seç araçlarından):
   * nokta eklemez, ufku sürüklemez, bırakınca seçim bırakılır.
   */
  grabOnly?: boolean;
}

/**
 * Kaçış noktası aracı:
 *  - boş alana tıkla: nokta ekle (mod sınırına kadar), sürükleyerek yerleştir
 *  - noktayı sürükle: taşı (kilitli ufukta diğer nokta da dikeyde izler)
 *  - ufuk çizgisini sürükle: ufku dikeyde taşı
 *  - silme: seçip Delete / panel düğmesi (main.ts)
 * Nokta eklerken ve taşırken kâğıdın merkez eksenlerine yapışır (Shift: kapalı).
 */
export class VanishingPointTool implements Tool, ToolOverlay {
  readonly id = 'point';
  private drag: Drag | null = null;
  /** Sürükleme bitince değişikliği geçmişe yazar. */
  private commitEdit: (() => void) | null = null;
  /** Merkeze yapışma anında gösterilen eksenler. */
  private centerGuides: SnapLine[] = [];
  private readonly grabOnly: boolean;

  constructor(
    private readonly viewport: Viewport,
    private readonly scene: PerspectiveScene,
    private readonly state: EditorState,
    private readonly history: History,
    private readonly paperRect: () => Rect,
    private readonly onCursorChange: () => void,
    options: VanishingPointToolOptions = {},
  ) {
    this.grabOnly = options.grabOnly ?? false;
  }

  get overlay(): ToolOverlay {
    return this;
  }

  get guideLines(): readonly SnapLine[] {
    return this.centerGuides;
  }

  get cursor(): string {
    if (this.drag) return this.drag.kind === 'point' ? 'grabbing' : 'ns-resize';
    if (this.state.hoveredPointId) return 'grab';
    if (this.state.horizonHovered) return 'ns-resize';
    return this.scene.canAddPoint ? 'crosshair' : 'default';
  }

  deactivate(): void {
    this.endDrag();
    this.state.update({
      hoveredPointId: null,
      horizonHovered: false,
      draggingPointId: null,
      selectedPointId: null,
    });
  }

  /** Başka araçtayken: bu basış bir noktayı tutuyor mu (dar yarıçap). */
  grabs(e: ToolPointerEvent): boolean {
    return this.hitPoint(e.screen, e.pointerType === 'touch' ? POINT_GRAB_TOUCH_PX : POINT_GRAB_PX) !== null;
  }

  /** Başka araçtayken üzerine gelme: nokta vurgulanır; imleç önerisi (yoksa null). */
  hoverGrab(screen: Point): string | null {
    const id = this.hitPoint(screen, POINT_GRAB_PX);
    this.state.update({ hoveredPointId: id });
    return id ? 'grab' : null;
  }

  onPointerDown(e: ToolPointerEvent): void {
    this.commitEdit = beginSceneEdit(this.history, this.scene);
    const radius = e.pointerType === 'touch' ? POINT_HIT_TOUCH_PX : POINT_HIT_PX;
    const hitId = this.hitPoint(e.screen, this.grabOnly ? Infinity : radius);
    if (hitId) {
      const p = this.scene.getPoint(hitId)!;
      this.drag = { kind: 'point', id: hitId, offset: { x: p.x - e.world.x, y: p.y - e.world.y } };
      this.state.update({ selectedPointId: hitId, draggingPointId: hitId });
    } else if (this.grabOnly) {
      // Çağıran yalnızca isabette yönlendirir; yine de güvenli taraf
      this.commitEdit = null;
    } else if (this.hitHorizon(e.screen)) {
      this.drag = { kind: 'horizon', lastWorld: e.world };
      this.state.update({ selectedPointId: null, horizonHovered: true });
    } else if (this.scene.canAddPoint) {
      const p = this.scene.addPoint(this.snapTarget(e.world, e))!;
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
      const target = { x: e.world.x + drag.offset.x, y: e.world.y + drag.offset.y };
      this.scene.movePoint(drag.id, this.snapTarget(target, e));
      return;
    }
    if (drag?.kind === 'horizon') {
      // Ufku kendine dik yönde taşı (döndürülmüş ufukta da doğru çalışır)
      const angle = this.scene.horizon()?.angle ?? 0;
      const n = { x: -Math.sin(angle), y: Math.cos(angle) };
      const d = (e.world.x - drag.lastWorld.x) * n.x + (e.world.y - drag.lastWorld.y) * n.y;
      this.scene.translate(n.x * d, n.y * d);
      drag.lastWorld = e.world;
      return;
    }
    if (!this.grabOnly) this.updateHover(e.screen, e.pointerType);
  }

  onPointerUp(e: ToolPointerEvent): void {
    this.endDrag();
    if (this.grabOnly) {
      // Başka araçta seçili nokta kalmasın (Delete yanlışlıkla noktayı silmesin)
      this.state.update({ selectedPointId: null });
      this.hoverGrab(e.screen);
    } else {
      this.updateHover(e.screen, e.pointerType);
    }
  }

  onPointerCancel(): void {
    this.endDrag();
    if (this.grabOnly) this.state.update({ selectedPointId: null });
  }

  /**
   * Merkeze yapışma: hedef kâğıdın merkez dikey / yatay eksenine yakınsa oturur
   * ve eksen kılavuzu gösterilir. Shift basılıyken yapışma yok.
   */
  private snapTarget(p: Point, e: ToolPointerEvent): Point {
    const center = rectCenter(this.paperRect());
    const shift = (e.native as PointerEvent | undefined)?.shiftKey === true;
    if (shift) {
      this.setGuides([]);
      return p;
    }
    const snap = snapToCenter(p, center, CENTER_SNAP_PX / this.viewport.scale);
    const guides: SnapLine[] = [];
    if (snap.snappedX) guides.push({ origin: center, direction: { x: 0, y: 1 }, kind: 'vertical' });
    if (snap.snappedY) guides.push({ origin: center, direction: { x: 1, y: 0 }, kind: 'horizontal' });
    this.setGuides(guides);
    return snap.point;
  }

  private setGuides(guides: SnapLine[]): void {
    const changed =
      guides.length !== this.centerGuides.length ||
      guides.some((g, i) => g.kind !== this.centerGuides[i].kind);
    this.centerGuides = guides;
    if (changed) this.onCursorChange();
  }

  private endDrag(): void {
    this.commitEdit?.();
    this.commitEdit = null;
    this.drag = null;
    this.centerGuides = [];
    this.state.update({ draggingPointId: null });
    this.onCursorChange();
  }

  private updateHover(screen: Point, pointerType = 'mouse'): void {
    const radius = pointerType === 'touch' ? POINT_HIT_TOUCH_PX : POINT_HIT_PX;
    const hoveredPointId = this.hitPoint(screen, radius);
    const horizonHovered = !hoveredPointId && this.hitHorizon(screen);
    this.state.update({ hoveredPointId, horizonHovered });
    this.onCursorChange();
  }

  /** En yakın kaçış noktası (isabet yarıçapı içinde). */
  private hitPoint(screen: Point, radius: number): string | null {
    if (!this.state.markersVisible) return null;
    let best: string | null = null;
    let bestDist = radius;
    for (const p of this.scene.activePoints) {
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
    const angle = this.viewport.screenAngle(horizon.angle);
    const dist = Math.abs((screen.x - o.x) * Math.sin(angle) - (screen.y - o.y) * Math.cos(angle));
    return dist <= HORIZON_HIT_DISTANCE;
  }
}
