import type { DrawingDocument } from './document';
import type { LayerName, LayerStack } from './layers';
import type { Paper } from './paper';
import type { EditorState } from './state';
import { drawStroke } from './stroke';
import type { CanvasTheme } from './theme';
import type { Viewport } from './viewport';
import {
  drawGuides,
  drawMarkers,
  drawSnapLine,
  type GuideView,
} from '../perspective/guide-renderer';
import type { PerspectiveScene } from '../perspective/scene';
import type { ToolOverlay } from '../tools/tool';

/** Silinmek üzere işaretli stroke'ların opaklık çarpanı. */
const FADED_ALPHA = 0.2;

/** Katmanları kirli (dirty) bayraklarıyla, kare başına en fazla bir kez çizer. */
export class Renderer {
  private dirty = new Set<LayerName>();
  private frame = 0;

  constructor(
    private readonly layers: LayerStack,
    private readonly viewport: Viewport,
    private readonly paper: Paper,
    private readonly scene: PerspectiveScene,
    private readonly state: EditorState,
    private readonly doc: DrawingDocument,
    /** Etkin aracın anlık geri bildirimi. */
    private readonly getOverlay: () => ToolOverlay | undefined,
    public theme: CanvasTheme,
  ) {}

  requestRender(...names: LayerName[]): void {
    if (names.length === 0) names = ['paper', 'drawing', 'guides', 'interaction'];
    for (const n of names) this.dirty.add(n);
    if (!this.frame) this.frame = requestAnimationFrame(() => this.flush());
  }

  private flush(): void {
    this.frame = 0;
    const dirty = this.dirty;
    this.dirty = new Set();
    if (dirty.has('paper')) this.drawPaper();
    if (dirty.has('drawing')) this.drawDrawing();
    if (dirty.has('guides')) this.drawGuides();
    if (dirty.has('interaction')) this.drawInteraction();
  }

  private guideView(ctx: CanvasRenderingContext2D): GuideView {
    return {
      ctx,
      dpr: this.layers.dpr,
      viewport: this.viewport,
      scene: this.scene,
      state: this.state,
      theme: this.theme,
    };
  }

  private drawPaper(): void {
    const { dpr } = this.layers;
    const ctx = this.layers.clear('paper');
    const { canvas } = this.layers.get('paper');
    const t = this.theme;

    ctx.fillStyle = t.desk;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    this.viewport.applyTo(ctx, dpr);
    const { width, height } = this.paper;

    // Gölge bulanıklığı dönüşümden etkilenmez; cihaz pikseli cinsinden verilir.
    ctx.save();
    ctx.shadowColor = t.paperShadow;
    ctx.shadowBlur = 18 * dpr;
    ctx.shadowOffsetY = 3 * dpr;
    ctx.fillStyle = t.paper;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    ctx.strokeStyle = t.paperBorder;
    ctx.lineWidth = 1 / this.viewport.scale;
    ctx.strokeRect(0, 0, width, height);
  }

  private drawDrawing(): void {
    const ctx = this.layers.clear('drawing');
    this.viewport.applyTo(ctx, this.layers.dpr);
    const faded = this.getOverlay()?.fadedStrokeIds;
    for (const stroke of this.doc.strokes) {
      const alpha = faded?.has(stroke.id) ? FADED_ALPHA : 1;
      drawStroke(ctx, stroke, this.theme.inks[stroke.style.ink], alpha);
    }
  }

  private drawGuides(): void {
    const ctx = this.layers.clear('guides');
    if (this.state.guidesVisible) drawGuides(this.guideView(ctx));
  }

  private drawInteraction(): void {
    const ctx = this.layers.clear('interaction');
    const overlay = this.getOverlay();
    if (overlay?.snapLine) drawSnapLine(this.guideView(ctx), overlay.snapLine);
    if (overlay?.preview) {
      this.viewport.applyTo(ctx, this.layers.dpr);
      drawStroke(ctx, overlay.preview, this.theme.inks[overlay.preview.style.ink]);
    }
    if (this.state.markersVisible) drawMarkers(this.guideView(ctx));
    if (overlay?.cursorRadius && this.state.pointer) {
      this.drawCursorCircle(ctx, this.state.pointer, overlay.cursorRadius);
    }
  }

  /** Ekran uzayında, açık ve koyu zeminde görünür çift halkalı imleç. */
  private drawCursorCircle(
    ctx: CanvasRenderingContext2D,
    at: { x: number; y: number },
    radius: number,
  ): void {
    const { dpr } = this.layers;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.beginPath();
    ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = this.theme.cursorHalo;
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = this.theme.cursor;
    ctx.stroke();
  }
}
