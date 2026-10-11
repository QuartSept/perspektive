import { addStrokeCommand } from '../engine/commands';
import type { DrawingDocument } from '../engine/document';
import type { Point } from '../engine/geometry';
import type { History } from '../engine/history';
import { lastPoint, newStrokeId, type Stroke } from '../engine/stroke';
import type { Viewport } from '../engine/viewport';
import type { PerspectiveScene } from '../perspective/scene';
import {
  candidateLines,
  decideLine,
  distanceToLine,
  projectOnLine,
  type SnapLine,
} from '../perspective/snapping';
import type { BrushSettings } from './brush-settings';
import type { Tool, ToolOverlay, ToolPointerEvent } from './tool';

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
 *  free      serbest çizim (mıknatıs kapalı, aday yok ya da yarıçap aşıldı)
 */
type Phase =
  | { kind: 'deciding'; start: Point; candidates: SnapLine[] }
  | { kind: 'locked'; line: SnapLine; start: Point }
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

  constructor(
    private readonly viewport: Viewport,
    private readonly doc: DrawingDocument,
    private readonly history: History,
    private readonly settings: BrushSettings,
    private readonly scene: PerspectiveScene,
    private readonly magnet: MagnetSource,
    private readonly onPreviewChange: () => void,
  ) {}

  get overlay(): ToolOverlay {
    return this;
  }

  /** Çizilmekte olan stroke (önizleme için). */
  get preview(): Stroke | null {
    return this.stroke;
  }

  /** Kilitli olunan perspektif doğrusu (görsel geri bildirim için). */
  get snapLine(): SnapLine | null {
    return this.phase.kind === 'locked' ? this.phase.line : null;
  }

  deactivate(): void {
    this.onPointerCancel();
  }

  onPointerDown(e: ToolPointerEvent): void {
    const start = e.world;
    this.stroke = { id: newStrokeId(), points: [start.x, start.y], style: this.settings.toStyle() };
    this.tip = start;
    const candidates = this.magnet.isActive()
      ? candidateLines(this.scene, start, NEAR_POINT_PX / this.viewport.scale)
      : [];
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
    this.handleSample(e.world);
    // İp gecikmesini kapat: serbest stroke imlecin bırakıldığı yerde biter
    if (this.phase.kind !== 'locked') this.pushPoint(e.world);
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

  private handleSample(p: Point): void {
    const phase = this.phase;
    const scale = this.viewport.scale;

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
    const end = projectOnLine(line, p);
    stroke.points.length = 0;
    stroke.points.push(s.x, s.y, end.x, end.y);
  }

  /** Ham örneği ipten geçirip stroke'a ekler. */
  private addFreeSample(p: Point): void {
    const rope = (this.settings.smoothing * SMOOTHING_MAX_PX) / this.viewport.scale;
    const tip = this.tip ?? p;
    const d = Math.hypot(p.x - tip.x, p.y - tip.y);
    if (d <= rope) return;
    const k = (d - rope) / d;
    this.tip = { x: tip.x + (p.x - tip.x) * k, y: tip.y + (p.y - tip.y) * k };
    this.pushPoint(this.tip);
  }

  private pushPoint(p: Point): void {
    const stroke = this.stroke!;
    const last = lastPoint(stroke)!;
    const minDist = MIN_SAMPLE_DISTANCE_PX / this.viewport.scale;
    if (Math.hypot(p.x - last.x, p.y - last.y) < minDist) return;
    stroke.points.push(p.x, p.y);
  }
}
