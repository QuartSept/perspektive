import type { Point } from './geometry';
import { angleDelta, snapRotation } from './rotation';
import type { Viewport } from './viewport';
import type { Tool, ToolPointerEvent } from '../tools/tool';

const WHEEL_ZOOM_SPEED = 0.0015;
const LINE_HEIGHT_PX = 16;

/**
 * Etkin araçtan bağımsız olarak bazı basışları üstlenen yardımcı (ör. her
 * araçta kaçış noktasını tutup taşımak). Basış ona aitse hareketin geri kalanı
 * `tool`'a gider; etkin araç o hareketi hiç görmez.
 */
export interface GestureGrabber {
  readonly tool: Tool;
  /** Bu basış üstlenilsin mi. */
  grabs(e: ToolPointerEvent): boolean;
  /** Tuş basılı değilken üzerine gelme; imleç önerisi (yoksa null: etkin aracın imleci). */
  hoverGrab(screen: Point): string | null;
}

interface Pinch {
  ids: [number, number];
  lastMid: Point;
  lastDist: number;
  /** Parmaklar arası doğrunun son açısı. */
  lastAngle: number;
  /** Yapıştırılmamış birikmiş görünüm açısı (yapışma bunun üstüne uygulanır). */
  rawRotation: number;
}

/** R basılıyken fareyle döndürme. */
interface RotateDrag {
  pointerId: number;
  /** Ekran merkezine göre imlecin başlangıç açısı. */
  startAngle: number;
  startRotation: number;
}

/**
 * Tuval üzerindeki Pointer Events girdisini yönetir.
 *  - Orta / sağ tuş sürükleme: her araçta kaydırma
 *  - Sol tuş, kalem ucu, tek parmak: etkin araca iletilir
 *  - Tekerlek: imleç noktasında yakınlaştırma
 *  - İki parmak: kaydırma + sıkıştırarak yakınlaştırma + döndürme (başlamış çizim iptal olur)
 *  - R basılıyken sol tuşla sürükleme: görünümü döndürür (Shift: 15° adım)
 *  - Avuç içi koruması: kalem bir kez kullanıldıktan sonra tek parmak çizmez, kaydırır
 */
export class InputController {
  private tool: Tool | null = null;
  private toolPointer: number | null = null;
  private grabber: GestureGrabber | null = null;
  /** Süren hareketi üstlenen araç (genellikle etkin araç, tutucu üstlendiyse onun aracı). */
  private gestureTool: Tool | null = null;
  /** Tutucunun üzerine gelme imleci. */
  private grabCursor: string | null = null;
  private pan: { pointerId: number; last: Point } | null = null;
  private rotate: RotateDrag | null = null;
  /** R basılı: sol tuşla sürükleme görünümü döndürür. */
  private rotateKey = false;
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
    return this.pan !== null || this.toolPointer !== null || this.pinch !== null || this.rotate !== null;
  }

  /** R tuşu basılı mı (main.ts klavyeden bildirir). */
  setRotateKey(held: boolean): void {
    if (held === this.rotateKey) return;
    this.rotateKey = held;
    this.updateCursor();
  }

  private get center(): Point {
    return { x: this.viewport.width / 2, y: this.viewport.height / 2 };
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
    this.grabCursor = null;
    tool.activate?.();
    this.updateCursor();
  }

  /** Etkin araç tutucunun kendi aracıysa tutucu devre dışı kalır. */
  setGrabber(grabber: GestureGrabber | null): void {
    this.grabber = grabber;
  }

  updateCursor(): void {
    const tool = this.gestureTool ?? this.tool;
    const cursor = this.gestureTool ? tool?.cursor : (this.grabCursor ?? tool?.cursor);
    if (this.pan || this.rotate) this.stage.style.cursor = 'grabbing';
    else if (this.rotateKey) this.stage.style.cursor = 'grab';
    else this.stage.style.cursor = cursor ?? 'default';
  }

  /** Tutucu bu araçta geçerli mi. */
  private grabberActive(): boolean {
    return this.grabber !== null && this.tool !== null && this.tool !== this.grabber.tool;
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
    if (this.pan || this.toolPointer !== null || this.pinch || this.rotate) return;
    this.stage.focus({ preventScroll: true });

    if (e.button === 0 && this.rotateKey) {
      // R + sürükle: ekran merkezi etrafında döndür
      e.preventDefault();
      this.capture(e.pointerId);
      const p = this.localPoint(e);
      const c = this.center;
      this.rotate = {
        pointerId: e.pointerId,
        startAngle: Math.atan2(p.y - c.y, p.x - c.x),
        startRotation: this.viewport.rotation,
      };
      this.updateCursor();
      return;
    }

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
      const ev = this.toToolEvent(e);
      this.gestureTool = this.grabberActive() && this.grabber!.grabs(ev) ? this.grabber!.tool : this.tool;
      this.gestureTool.onPointerDown(ev);
      this.updateCursor();
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
        lastAngle: Math.atan2(b[1].y - a[1].y, b[1].x - a[1].x),
        rawRotation: this.viewport.rotation,
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
    this.grabCursor = null;
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
    if (this.rotate && e.pointerId === this.rotate.pointerId) {
      const p = this.localPoint(e);
      const c = this.center;
      const raw = this.rotate.startRotation + angleDelta(this.rotate.startAngle, Math.atan2(p.y - c.y, p.x - c.x));
      this.viewport.setRotation(snapRotation(raw, e.shiftKey), c);
      return;
    }
    if (this.pan && e.pointerId === this.pan.pointerId) {
      const p = this.localPoint(e);
      this.viewport.panBy(p.x - this.pan.last.x, p.y - this.pan.last.y);
      this.pan.last = p;
      return;
    }
    if (!this.tool) return;
    if (this.toolPointer !== null) {
      if (e.pointerId === this.toolPointer) (this.gestureTool ?? this.tool).onPointerMove(this.toToolEvent(e));
      return;
    }
    // Tuş basılı değil: tutucu üzerine gelmeyi değerlendirir, etkin araç da önizler
    if (this.grabberActive() && e.pointerType !== 'touch') {
      const cursor = this.grabber!.hoverGrab(this.localPoint(e));
      if (cursor !== this.grabCursor) {
        this.grabCursor = cursor;
        this.updateCursor();
      }
    }
    this.tool.onPointerMove(this.toToolEvent(e));
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') this.touchUp(e);
    if (this.rotate && e.pointerId === this.rotate.pointerId) {
      this.rotate = null;
      this.updateCursor();
      return;
    }
    if (this.pan && e.pointerId === this.pan.pointerId) {
      this.pan = null;
      this.updateCursor();
      return;
    }
    if (e.pointerId === this.toolPointer) {
      this.toolPointer = null;
      const tool = this.gestureTool ?? this.tool;
      this.gestureTool = null;
      tool?.onPointerUp(this.toToolEvent(e));
      this.updateCursor();
    }
  };

  private onPointerCancel = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') this.touchUp(e);
    if (this.rotate && e.pointerId === this.rotate.pointerId) {
      this.rotate = null;
      this.updateCursor();
    }
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
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    this.viewport.panBy(mid.x - pinch.lastMid.x, mid.y - pinch.lastMid.y);
    this.viewport.zoomAt(mid, dist / pinch.lastDist);
    // Döndürme: parmaklar arası doğrunun açısı kadar, iki parmak ortası etrafında
    pinch.rawRotation += angleDelta(pinch.lastAngle, angle);
    this.viewport.setRotation(snapRotation(pinch.rawRotation), mid);
    pinch.lastMid = mid;
    pinch.lastDist = dist;
    pinch.lastAngle = angle;
  }

  private cancelToolGesture(): void {
    if (this.toolPointer === null) return;
    this.toolPointer = null;
    const tool = this.gestureTool ?? this.tool;
    this.gestureTool = null;
    tool?.onPointerCancel?.();
    this.updateCursor();
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
