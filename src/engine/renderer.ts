import type { DrawingDocument } from './document';
import type { LayerName, LayerStack } from './layers';
import type { Paper } from './paper';
import type { EditorState } from './state';
import { drawStroke, type Stroke } from './stroke';
import type { CanvasTheme } from './theme';
import type { Viewport } from './viewport';
import {
  drawGuides,
  drawMarkers,
  drawSnapLine,
  type GuideView,
} from '../perspective/guide-renderer';
import type { PerspectiveScene } from '../perspective/scene';
import type { SnapLine } from '../perspective/snapping';

/** Etkileşim katmanında anlık gösterilenler (çizilmekte olan stroke, kilit doğrusu). */
export interface InteractionSource {
  readonly preview: Stroke | null;
  readonly snapLine: SnapLine | null;
}

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
    private readonly interaction: InteractionSource,
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
    for (const stroke of this.doc.strokes) {
      drawStroke(ctx, stroke, this.theme.inks[stroke.style.ink]);
    }
  }

  private drawGuides(): void {
    const ctx = this.layers.clear('guides');
    if (this.state.guidesVisible) drawGuides(this.guideView(ctx));
  }

  private drawInteraction(): void {
    const ctx = this.layers.clear('interaction');
    const { preview, snapLine } = this.interaction;
    if (snapLine) drawSnapLine(this.guideView(ctx), snapLine);
    if (preview) {
      this.viewport.applyTo(ctx, this.layers.dpr);
      drawStroke(ctx, preview, this.theme.inks[preview.style.ink]);
    }
    if (this.state.markersVisible) drawMarkers(this.guideView(ctx));
  }
}
