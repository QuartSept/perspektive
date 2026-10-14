import { addStrokeCommand } from '../engine/commands';
import type { DrawingDocument, LayerBlock } from '../engine/document';
import type { Point } from '../engine/geometry';
import { GRID_SNAP_PX, snapAlongLine, snapToGrid } from '../engine/grid';
import type { History } from '../engine/history';
import { lastPoint, newStrokeId, type Stroke } from '../engine/stroke';
import type { Viewport } from '../engine/viewport';
import {
  AXIS_RELEASE_ANGLE,
  AXIS_SNAP_ANGLE,
  axisSource,
  chooseLine,
  decideLine,
  distanceToLine,
  projectOnLine,
  undirectedAngle,
  type SnapLine,
  type SnapSource,
} from '../perspective/snapping';
import type { BrushSettings } from './brush-settings';
import type { Sample, Tool, ToolOverlay, ToolPointerEvent } from './tool';

/** Ardışık örnekler arasında en az bu kadar ekran pikseli olmalı. */
const MIN_SAMPLE_DISTANCE_PX = 0.75;
/** Yön kararı için başlangıçtan en az bu kadar ekran pikseli hareket gerekir. */
const DECIDE_MIN_PX = 12;
/** Bu uzaklığa kadar uygun aday çıkmazsa stroke serbest kalır. */
const DECIDE_MAX_PX = 40;
/** Stroke kaçış noktasına bu kadar yakın başlarsa noktadan çıkan ışına kilitlenir. */
const NEAR_POINT_PX = 10;
/** Yumuşatma %100'deyken "ip" uzunluğu, ekran pikseli. */
const SMOOTHING_MAX_PX = 14;

/** Perspektifsiz modda düz çizgi davranışı. */
export interface StraightLineSource {
  /** Stroke başlangıcında: düz çizgi modu etkin mi (perspektif kapalı + ayar açık). */
  isActive(): boolean;
  /** Şu an eksene yapışma etkin mi (ayar açık, Space basılı değil). */
  axisSnap(): boolean;
}

const axes = axisSource();

/** Kâğıt ızgarasına yapışma (görünmez cetvel). */
export interface GridSnapper {
  /** Şu an ızgaraya yapışma etkin mi (ayar açık, Space basılı değil). */
  isActive(): boolean;
  /** Izgara aralığı, dünya birimi. */
  readonly spacing: number;
}

export interface MagnetSource {
  /** Mıknatıs şu an etkin mi (kalıcı ayar + Space ile geçici serbest mod). */
  isActive(): boolean;
  /** Kilidin bırakılacağı dik uzaklık, ekran pikseli. */
  readonly radius: number;
}

/**
 * Stroke aşamaları:
 *  deciding  ilk birkaç pikselde hareket yönü toplanır
 *  locked    stroke, seçilen perspektif doğrusuna izdüşürülür (düz çizgi)
 *  straight  perspektifsiz düz çizgi: başlangıç → imleç; yataya/dikeye yapışabilir
 *  free      serbest çizim (mıknatıs kapalı, aday yok ya da yarıçap aşıldı)
 */
type Phase =
  | { kind: 'deciding'; start: Point; candidates: SnapLine[] }
  | { kind: 'locked'; line: SnapLine; start: Point }
  | { kind: 'straight'; start: Point; axis: SnapLine | null }
  | { kind: 'free' };

/**
 * Fırça. Stroke çizilirken etkileşim katmanında önizlenir, bırakılınca komut
 * olarak belgeye eklenir. Mıknatıs açıkken stroke kaçış noktası ışınlarına,
 * dikeye (ve 1 noktada yataya) kilitlenir.
 *
 * Serbest çizim "ip" (lazy brush) yöntemiyle yumuşatılır: fırça ucu imleci
 * sabit uzunlukta bir iple izler, ipten kısa titremeler çizgiye geçmez.
 * Örnekleme hızından bağımsızdır.
 */
export class BrushTool implements Tool, ToolOverlay {
  readonly id = 'brush';
  readonly cursor = 'crosshair';
  private stroke: Stroke | null = null;
  private phase: Phase = { kind: 'free' };
  /** Yumuşatılmış fırça ucu (ipin ucundaki nokta). */
  private tip: Point | null = null;
  /** Bu stroke basınç kaydediyor mu (kalem + ayar açık). */
  private withPressure = false;
  /** Etkin katman kilitli / gizliyken çizim başlamaz; nedeni bildirilir. */
  onLayerBlocked: ((reason: LayerBlock) => void) | null = null;

  constructor(
    private readonly viewport: Viewport,
    private readonly doc: DrawingDocument,
    private readonly history: History,
    private readonly settings: BrushSettings,
    /** Mıknatıs adayları (perspektif + ileride eksen, ızgara, şekil köşeleri). */
    private readonly snapSource: SnapSource,
    private readonly magnet: MagnetSource,
    private readonly straight: StraightLineSource,
    private readonly grid: GridSnapper,
    private readonly onPreviewChange: () => void,
  ) {}

  get overlay(): ToolOverlay {
    return this;
  }

  /** Çizilmekte olan stroke (önizleme için). */
  get preview(): Stroke | null {
    return this.stroke;
  }

  /** Kilitli olunan perspektif doğrusu ya da yapışılan eksen (görsel geri bildirim için). */
  get snapLine(): SnapLine | null {
    if (this.phase.kind === 'locked') return this.phase.line;
    if (this.phase.kind === 'straight') return this.phase.axis;
    return null;
  }

  deactivate(): void {
    this.onPointerCancel();
  }

  onPointerDown(e: ToolPointerEvent): void {
    const blocked = this.doc.activeLayerBlocked;
    if (blocked) {
      this.onLayerBlocked?.(blocked);
      return;
    }
    // Düz çizgiler ızgara düğümünden/çizgisinden başlar; serbest stroke kendi noktasından
    const snapped = this.grid.isActive()
      ? snapToGrid(e.world, this.grid.spacing, this.gridTolerance).point
      : e.world;
    const straight = this.straight.isActive();
    const candidates =
      !straight && this.magnet.isActive()
        ? this.snapSource(snapped, NEAR_POINT_PX / this.viewport.scale)
        : [];
    const start = straight || candidates.length ? snapped : e.world;
    this.withPressure = this.settings.pressure && e.pointerType === 'pen';
    this.stroke = {
      id: newStrokeId(),
      points: [start.x, start.y],
      style: this.settings.toStyle(),
      layerId: this.doc.activeLayerId,
    };
    if (this.withPressure) this.stroke.pressures = [e.pressure];
    this.tip = start;
    if (straight) {
      // Düz çizgi tek kalınlıkta: basınç kaydedilmez
      delete this.stroke.pressures;
      this.phase = { kind: 'straight', start, axis: null };
      this.onPreviewChange();
      return;
    }
    this.phase = candidates.length
      ? { kind: 'deciding', start, candidates }
      : { kind: 'free' };
    this.onPreviewChange();
  }

  onPointerMove(e: ToolPointerEvent): void {
    if (!this.stroke) return;
    for (const p of e.samples) this.handleSample(p);
    this.onPreviewChange();
  }

  onPointerUp(e: ToolPointerEvent): void {
    const stroke = this.stroke;
    if (!stroke) return;
    const end: Sample = { ...e.world, pressure: e.pressure };
    this.handleSample(end);
    // İp gecikmesini kapat: serbest stroke imlecin bırakıldığı yerde biter
    if (this.phase.kind !== 'locked' && this.phase.kind !== 'straight') this.pushPoint(end);
    this.stroke = null;
    this.tip = null;
    this.phase = { kind: 'free' };
    this.history.execute(addStrokeCommand(this.doc, stroke));
    this.onPreviewChange();
  }

  onPointerCancel(): void {
    if (!this.stroke) return;
    this.stroke = null;
    this.tip = null;
    this.phase = { kind: 'free' };
    this.onPreviewChange();
  }

  /** Izgara yapışma eşiği, dünya biriminde. */
  private get gridTolerance(): number {
    return GRID_SNAP_PX / this.viewport.scale;
  }

  /** Doğru üzerindeki uç: ızgara açıksa doğrunun ızgara çizgisini kestiği yere oturur. */
  private endOnLine(line: SnapLine, p: Point): Point {
    const onGrid = this.grid.isActive()
      ? snapAlongLine(line, p, this.grid.spacing, this.gridTolerance)
      : null;
    return onGrid ?? projectOnLine(line, p);
  }

  private handleSample(p: Sample): void {
    const phase = this.phase;
    const scale = this.viewport.scale;

    if (phase.kind === 'straight') {
      this.setStraightEnd(phase, p);
      return;
    }

    if (phase.kind === 'deciding') {
      // Karar verilene dek ham örnekler önizlenir; kilitlenince düz çizgiyle değişir
      this.addFreeSample(p);
      if (!this.magnet.isActive()) {
        this.phase = { kind: 'free' };
        return;
      }
      // Başlangıçtan şimdiki noktaya yön, titremeyi ortalar
      const moved = Math.hypot(p.x - phase.start.x, p.y - phase.start.y) * scale;
      if (moved < DECIDE_MIN_PX) return;
      const final = moved >= DECIDE_MAX_PX;
      const decision = decideLine(phase.candidates, phase.start, p, final);
      if (decision.kind === 'lock') {
        this.phase = { kind: 'locked', line: decision.line, start: phase.start };
        this.setLockedEnd(decision.line, phase.start, p);
      } else if (decision.kind === 'none' && final) {
        this.phase = { kind: 'free' };
      }
      // 'wait' ya da henüz aday yok: hareket sürdükçe yeniden denenir
      return;
    }

    if (phase.kind === 'locked') {
      const offLine = distanceToLine(phase.line, p) * scale > this.magnet.radius;
      if (offLine || !this.magnet.isActive()) {
        // Kilit bırakılır; stroke son izdüşüm noktasından serbest devam eder
        this.phase = { kind: 'free' };
        this.tip = lastPoint(this.stroke!);
        if (this.withPressure) this.stroke!.pressures = [p.pressure, p.pressure];
        this.addFreeSample(p);
      } else {
        this.setLockedEnd(phase.line, phase.start, p);
      }
      return;
    }

    this.addFreeSample(p);
  }

  /**
   * Kilitliyken stroke iki noktadır: başlangıcın ve imlecin doğru üzerindeki
   * izdüşümleri. (Kaçış noktasından başlayan ışında başlangıç doğruya oturtulur.)
   */
  private setLockedEnd(line: SnapLine, start: Point, p: Point): void {
    const stroke = this.stroke!;
    const s = projectOnLine(line, start);
    const end = this.endOnLine(line, p);
    stroke.points.length = 0;
    stroke.points.push(s.x, s.y, end.x, end.y);
    // Kilitli düz çizgi tek kalınlıkta
    delete stroke.pressures;
  }

  /**
   * Perspektifsiz düz çizgi: stroke başlangıç ve imleçten oluşur. Eksene
   * yapışma açıkken yataya/dikeye 4° içinde yaklaşınca tam eksene oturur;
   * titremesin diye ancak 6°'yi aşınca bırakır.
   */
  private setStraightEnd(phase: { start: Point; axis: SnapLine | null }, p: Point): void {
    const { start } = phase;
    const dx = p.x - start.x;
    const dy = p.y - start.y;
    const len = Math.hypot(dx, dy);
    if (!this.straight.axisSnap() || len < 1e-9) {
      phase.axis = null;
    } else {
      const move = { x: dx / len, y: dy / len };
      const keep = phase.axis && undirectedAngle(move, phase.axis.direction) <= AXIS_RELEASE_ANGLE;
      if (!keep) phase.axis = chooseLine(axes(start, 0), start, p, AXIS_SNAP_ANGLE);
    }
    let end: Point;
    if (phase.axis) end = this.endOnLine(phase.axis, p);
    else if (this.grid.isActive()) end = snapToGrid(p, this.grid.spacing, this.gridTolerance).point;
    else end = p;
    const stroke = this.stroke!;
    stroke.points.length = 0;
    stroke.points.push(start.x, start.y, end.x, end.y);
  }

  /** Ham örneği ipten geçirip stroke'a ekler. */
  private addFreeSample(p: Sample): void {
    const rope = (this.settings.smoothing * SMOOTHING_MAX_PX) / this.viewport.scale;
    const tip = this.tip ?? p;
    const d = Math.hypot(p.x - tip.x, p.y - tip.y);
    if (d <= rope) return;
    const k = (d - rope) / d;
    this.tip = { x: tip.x + (p.x - tip.x) * k, y: tip.y + (p.y - tip.y) * k };
    this.pushPoint({ ...this.tip, pressure: p.pressure });
  }

  private pushPoint(p: Sample): void {
    const stroke = this.stroke!;
    const last = lastPoint(stroke)!;
    const minDist = MIN_SAMPLE_DISTANCE_PX / this.viewport.scale;
    if (Math.hypot(p.x - last.x, p.y - last.y) < minDist) return;
    stroke.points.push(p.x, p.y);
    if (stroke.pressures) stroke.pressures.push(p.pressure);
  }
}
