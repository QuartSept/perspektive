import type { Point } from './geometry';
import type { Viewport } from './viewport';
import type { Tool, ToolPointerEvent } from '../tools/tool';

const WHEEL_ZOOM_SPEED = 0.0015;
const LINE_HEIGHT_PX = 16;

interface Pinch {
  ids: [number, number];
  lastMid: Point;
  lastDist: number;
}

/**
 * Tuval üzerindeki Pointer Events girdisini yönetir.
 *  - Orta / sağ tuş sürükleme: her araçta kaydırma
 *  - Sol tuş, kalem ucu, tek parmak: etkin araca iletilir
 *  - Tekerlek: imleç noktasında yakınlaştırma
 *  - İki parmak: kaydırma + sıkıştırarak yakınlaştırma (başlamış çizim iptal olur)
 *  - Avuç içi koruması: kalem bir kez kullanıldıktan sonra tek parmak çizmez, kaydırır
 */
export class InputController {
  private tool: Tool | null = null;
  private toolPointer: number | null = null;
  private pan: { pointerId: number; last: Point } | null = null;
  private hoverListeners = new Set<(screen: Point | null) => void>();
  /** Ekrana değen parmaklar (CSS piksel). */
  private touches = new Map<number, Point>();
  private pinch: Pinch | null = null;
  /** Sıkıştırma bitti ama parmaklar hâlâ ekranda: hepsi kalkana dek yok say. */
  private touchSuppressed = false;
  private penSeen = false;

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

  /** Sürmekte olan bir araç, kaydırma ya da sıkıştırma hareketi var mı. */
  get busy(): boolean {
    return this.pan !== null || this.toolPointer !== null || this.pinch !== null;
  }

  /** Bazı ortamlarda (sentetik olaylar, kaybolmuş işaretçi) yakalama başarısız olabilir. */
  private capture(pointerId: number): void {
    try {
      this.stage.setPointerCapture(pointerId);
    } catch {
      // yakalamasız da çalışır; yalnızca tuval dışına taşan hareket kaçabilir
    }
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
    const sample = (ev: PointerEvent, p: Point) => ({ x: p.x, y: p.y, pressure: ev.pressure });
    const samples = coalesced.length
      ? coalesced.map((c) => sample(c, this.viewport.screenToWorld(this.localPoint(c))))
      : [sample(e, world)];
    return { screen, world, samples, pointerType: e.pointerType, pressure: e.pressure, native: e };
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'touch' && this.touchDown(e)) return;
    if (e.pointerType === 'pen') this.penSeen = true;
    if (this.pan || this.toolPointer !== null || this.pinch) return;
    this.stage.focus({ preventScroll: true });

    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      this.capture(e.pointerId);
      this.pan = { pointerId: e.pointerId, last: this.localPoint(e) };
      this.updateCursor();
      return;
    }

    if (e.button === 0 && this.tool) {
      this.capture(e.pointerId);
      this.toolPointer = e.pointerId;
      this.tool.onPointerDown(this.toToolEvent(e));
    }
  };

  /**
   * Dokunma başlangıcı. İkinci parmakta sıkıştırma başlar (tek parmakla
   * başlamış çizim ya da kaydırma iptal olur). true dönerse olay işlendi.
   */
  private touchDown(e: PointerEvent): boolean {
    const p = this.localPoint(e);
    this.touches.set(e.pointerId, p);
    this.capture(e.pointerId);
    if (this.touches.size === 2) {
      if (this.toolPointer !== null && this.touches.has(this.toolPointer)) this.cancelToolGesture();
      if (this.pan && this.touches.has(this.pan.pointerId)) this.pan = null;
      const [a, b] = [...this.touches.entries()];
      this.pinch = {
        ids: [a[0], b[0]],
        lastMid: { x: (a[1].x + b[1].x) / 2, y: (a[1].y + b[1].y) / 2 },
        lastDist: Math.max(1, Math.hypot(a[1].x - b[1].x, a[1].y - b[1].y)),
      };
      this.updateCursor();
      return true;
    }
    if (this.touches.size > 2 || this.touchSuppressed || this.pinch) return true;
    if (this.penSeen) {
      // Kalemle çizilirken tek parmak çizmez (avuç içi), görünümü kaydırır
      if (!this.pan && this.toolPointer === null) this.pan = { pointerId: e.pointerId, last: p };
      return true;
    }
    return false;
  }

  private touchUp(e: PointerEvent): void {
    if (!this.touches.delete(e.pointerId)) return;
    if (this.pinch?.ids.includes(e.pointerId)) {
      this.pinch = null;
      this.updateCursor();
    }
    this.touchSuppressed = this.touches.size > 0 && (this.touchSuppressed || this.pinch === null);
    if (this.touches.size === 0) {
      this.touchSuppressed = false;
      this.emitHover(null);
    }
  }

  private onPointerLeave = (e: PointerEvent): void => {
    if (this.pan || e.pointerId === this.toolPointer) return;
    this.emitHover(null);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, this.localPoint(e));
      if (this.pinch) {
        this.updatePinch();
        return;
      }
    }
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
    if (e.pointerType === 'touch') this.touchUp(e);
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
    if (e.pointerType === 'touch') this.touchUp(e);
    if (this.pan && e.pointerId === this.pan.pointerId) {
      this.pan = null;
      this.updateCursor();
    }
    if (e.pointerId === this.toolPointer) this.cancelToolGesture();
  };

  /** İki parmağın orta noktası kaydırır, aralarındaki uzaklık yakınlaştırır. */
  private updatePinch(): void {
    const pinch = this.pinch!;
    const a = this.touches.get(pinch.ids[0]);
    const b = this.touches.get(pinch.ids[1]);
    if (!a || !b) return;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    this.viewport.panBy(mid.x - pinch.lastMid.x, mid.y - pinch.lastMid.y);
    this.viewport.zoomAt(mid, dist / pinch.lastDist);
    pinch.lastMid = mid;
    pinch.lastDist = dist;
  }

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
