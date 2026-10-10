import type { Point } from './geometry';
import type { Viewport } from './viewport';
import type { Tool, ToolPointerEvent } from '../tools/tool';

const WHEEL_ZOOM_SPEED = 0.0015;
const LINE_HEIGHT_PX = 16;

/**
 * Tuval üzerindeki Pointer Events girdisini yönetir.
 *  - Orta / sağ tuş sürükleme: her araçta kaydırma
 *  - Sol tuş: etkin araca iletilir
 *  - Tekerlek: imleç noktasında yakınlaştırma
 * Dokunmatik/kalem de aynı akıştan geçer (sonraki sürümler).
 */
export class InputController {
  private tool: Tool | null = null;
  private toolPointer: number | null = null;
  private pan: { pointerId: number; last: Point } | null = null;
  private hoverListeners = new Set<(screen: Point | null) => void>();

  constructor(
    private readonly stage: HTMLElement,
    private readonly viewport: Viewport,
  ) {
    stage.addEventListener('pointerdown', this.onPointerDown);
    stage.addEventListener('pointermove', this.onPointerMove);
    stage.addEventListener('pointerup', this.onPointerUp);
    stage.addEventListener('pointercancel', this.onPointerCancel);
    stage.addEventListener('lostpointercapture', this.onPointerCancel);
    stage.addEventListener('pointerleave', this.onPointerLeave);
    stage.addEventListener('wheel', this.onWheel, { passive: false });
    stage.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** İmlecin tuval üzerindeki konumu (her araçta); tuvalden çıkınca null. */
  onHover(fn: (screen: Point | null) => void): void {
    this.hoverListeners.add(fn);
  }

  private emitHover(screen: Point | null): void {
    for (const fn of this.hoverListeners) fn(screen);
  }

  /** Sürmekte olan bir araç ya da kaydırma hareketi var mı. */
  get busy(): boolean {
    return this.pan !== null || this.toolPointer !== null;
  }

  get activeTool(): Tool | null {
    return this.tool;
  }

  setTool(tool: Tool): void {
    if (this.tool === tool) return;
    this.cancelToolGesture();
    this.tool?.deactivate?.();
    this.tool = tool;
    tool.activate?.();
    this.updateCursor();
  }

  updateCursor(): void {
    this.stage.style.cursor = this.pan ? 'grabbing' : (this.tool?.cursor ?? 'default');
  }

  private localPoint(e: MouseEvent): Point {
    const r = this.stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private toToolEvent(e: PointerEvent): ToolPointerEvent {
    const screen = this.localPoint(e);
    const world = this.viewport.screenToWorld(screen);
    const coalesced = e.type === 'pointermove' ? (e.getCoalescedEvents?.() ?? []) : [];
    const samples = coalesced.length
      ? coalesced.map((c) => this.viewport.screenToWorld(this.localPoint(c)))
      : [world];
    return { screen, world, samples, native: e };
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (this.pan || this.toolPointer !== null) return;
    this.stage.focus({ preventScroll: true });

    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      this.stage.setPointerCapture(e.pointerId);
      this.pan = { pointerId: e.pointerId, last: this.localPoint(e) };
      this.updateCursor();
      return;
    }

    if (e.button === 0 && this.tool) {
      this.stage.setPointerCapture(e.pointerId);
      this.toolPointer = e.pointerId;
      this.tool.onPointerDown(this.toToolEvent(e));
    }
  };

  private onPointerLeave = (e: PointerEvent): void => {
    if (this.pan || e.pointerId === this.toolPointer) return;
    this.emitHover(null);
  };

  private onPointerMove = (e: PointerEvent): void => {
    this.emitHover(this.localPoint(e));
    if (this.pan && e.pointerId === this.pan.pointerId) {
      const p = this.localPoint(e);
      this.viewport.panBy(p.x - this.pan.last.x, p.y - this.pan.last.y);
      this.pan.last = p;
      return;
    }
    if (!this.tool) return;
    if (this.toolPointer === null || e.pointerId === this.toolPointer) {
      this.tool.onPointerMove(this.toToolEvent(e));
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (this.pan && e.pointerId === this.pan.pointerId) {
      this.pan = null;
      this.updateCursor();
      return;
    }
    if (e.pointerId === this.toolPointer) {
      this.toolPointer = null;
      this.tool?.onPointerUp(this.toToolEvent(e));
    }
  };

  private onPointerCancel = (e: PointerEvent): void => {
    if (this.pan && e.pointerId === this.pan.pointerId) {
      this.pan = null;
      this.updateCursor();
    }
    if (e.pointerId === this.toolPointer) this.cancelToolGesture();
  };

  private cancelToolGesture(): void {
    if (this.toolPointer === null) return;
    this.toolPointer = null;
    this.tool?.onPointerCancel?.();
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const delta =
      e.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? e.deltaY * LINE_HEIGHT_PX
        : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? e.deltaY * this.viewport.height
          : e.deltaY;
    this.viewport.zoomAt(this.localPoint(e), Math.exp(-delta * WHEEL_ZOOM_SPEED));
  };
}
