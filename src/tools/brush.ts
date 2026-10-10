import { addStrokeCommand } from '../engine/commands';
import type { DrawingDocument } from '../engine/document';
import type { Point } from '../engine/geometry';
import type { History } from '../engine/history';
import { lastPoint, newStrokeId, type Stroke } from '../engine/stroke';
import type { Viewport } from '../engine/viewport';
import type { PerspectiveScene } from '../perspective/scene';
import {
  candidateLines,
  chooseLine,
  distanceToLine,
  projectOnLine,
  type SnapLine,
} from '../perspective/snapping';
import type { BrushSettings } from './brush-settings';
import type { Tool, ToolPointerEvent } from './tool';

/** Ardışık örnekler arasında en az bu kadar ekran pikseli olmalı. */
const MIN_SAMPLE_DISTANCE_PX = 0.75;
/** Yön kararı için başlangıçtan en az bu kadar ekran pikseli hareket gerekir. */
const DECIDE_MIN_PX = 12;
/** Bu uzaklığa kadar uygun aday çıkmazsa stroke serbest kalır. */
const DECIDE_MAX_PX = 40;

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
  | { kind: 'locked'; line: SnapLine }
  | { kind: 'free' };

/**
 * Fırça. Stroke çizilirken etkileşim katmanında önizlenir, bırakılınca komut
 * olarak belgeye eklenir. Mıknatıs açıkken stroke kaçış noktası ışınlarına,
 * dikeye (ve 1 noktada yataya) kilitlenir.
 */
export class BrushTool implements Tool {
  readonly id = 'brush';
  readonly cursor = 'crosshair';
  private stroke: Stroke | null = null;
  private phase: Phase = { kind: 'free' };

  constructor(
    private readonly viewport: Viewport,
    private readonly doc: DrawingDocument,
    private readonly history: History,
    private readonly settings: BrushSettings,
    private readonly scene: PerspectiveScene,
    private readonly magnet: MagnetSource,
    private readonly onPreviewChange: () => void,
  ) {}

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
    const candidates = this.magnet.isActive() ? candidateLines(this.scene, start) : [];
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
    // Karar aşamasında kalan kısa hareket ham örnekleriyle olduğu gibi kalır
    this.handleSample(e.world);
    this.stroke = null;
    this.phase = { kind: 'free' };
    this.history.execute(addStrokeCommand(this.doc, stroke));
    this.onPreviewChange();
  }

  onPointerCancel(): void {
    if (!this.stroke) return;
    this.stroke = null;
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
      const line = chooseLine(phase.candidates, phase.start, p);
      if (line) {
        this.phase = { kind: 'locked', line };
        this.setLockedEnd(line, p);
      } else if (moved >= DECIDE_MAX_PX) {
        this.phase = { kind: 'free' };
      }
      return;
    }

    if (phase.kind === 'locked') {
      const offLine = distanceToLine(phase.line, p) * scale > this.magnet.radius;
      if (offLine || !this.magnet.isActive()) {
        // Kilit bırakılır; stroke son izdüşüm noktasından serbest devam eder
        this.phase = { kind: 'free' };
        this.addFreeSample(p);
      } else {
        this.setLockedEnd(phase.line, p);
      }
      return;
    }

    this.addFreeSample(p);
  }

  /** Kilitliyken stroke iki noktadır: başlangıç ve imlecin doğru üzerindeki izdüşümü. */
  private setLockedEnd(line: SnapLine, p: Point): void {
    const stroke = this.stroke!;
    const end = projectOnLine(line, p);
    stroke.points.length = 2;
    stroke.points.push(end.x, end.y);
  }

  private addFreeSample(p: Point): void {
    const stroke = this.stroke!;
    const last = lastPoint(stroke)!;
    const minDist = MIN_SAMPLE_DISTANCE_PX / this.viewport.scale;
    if (Math.hypot(p.x - last.x, p.y - last.y) < minDist) return;
    stroke.points.push(p.x, p.y);
  }
}
