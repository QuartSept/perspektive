import type { DrawingDocument } from './document';
import type { LayerName, LayerStack } from './layers';
import type { Paper } from './paper';
import { drawGrid, gridFade, type PaperGrid } from './grid';
import { fitImage, type ReferenceImage } from './reference';
import type { EditorState } from './state';
import { drawShape, shapeBounds } from './shapes';
import { drawStroke } from './stroke';
import { strokeBounds } from './stroke-geometry';
import { rectsOverlap } from './geometry';
import type { CanvasTheme } from './theme';
import type { Viewport } from './viewport';
import { cornerLines, cornerTargets, type CornerLineSettings } from '../perspective/corner-lines';
import {
  drawCornerLines,
  drawGuides,
  drawMarkers,
  drawSnapLine,
  type GuideView,
} from '../perspective/guide-renderer';
import type { PerspectiveScene } from '../perspective/scene';
import type { ToolOverlay } from '../tools/tool';

/** Silinmek üzere işaretli stroke'ların opaklık çarpanı. */
const FADED_ALPHA = 0.2;
/** Şekil köşe tutamacı kenar uzunluğu, CSS piksel. */
const HANDLE_SIZE = 8;

/** Katmanları kirli (dirty) bayraklarıyla, kare başına en fazla bir kez çizer. */
export class Renderer {
  private dirty = new Set<LayerName>();
  private frame = 0;
  /** Kâğıt katmanında, kâğıdın üstünde çizilen referans görsel. */
  reference: ReferenceImage | null = null;
  /** Kâğıt katmanında, referans görselin üstünde çizilen kâğıt ızgarası. */
  grid: PaperGrid | null = null;
  /** Köşe kaçış çizgisi ayarı (yoksa çizilmez). */
  corners: CornerLineSettings | null = null;

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

    const ref = this.reference;
    if (ref?.bitmap && ref.visible) {
      const r = fitImage(ref.bitmap.width, ref.bitmap.height, this.paper.rect, ref.fit);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, width, height);
      ctx.clip();
      ctx.globalAlpha = ref.opacity;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(ref.bitmap, r.x, r.y, r.width, r.height);
      ctx.restore();
    }

    const grid = this.grid;
    if (grid?.visible) {
      const scale = this.viewport.scale;
      drawGrid(
        ctx,
        this.paper.rect,
        grid.spacing,
        t.grid,
        1 / scale,
        gridFade(grid.spacing * scale),
        this.viewport.visibleWorldRect(),
      );
    }

    ctx.strokeStyle = t.paperBorder;
    ctx.lineWidth = 1 / this.viewport.scale;
    ctx.strokeRect(0, 0, width, height);
  }

  private drawDrawing(): void {
    const ctx = this.layers.clear('drawing');
    this.viewport.applyTo(ctx, this.layers.dpr);
    const overlay = this.getOverlay();
    const faded = overlay?.fadedStrokeIds;
    const hidden = overlay?.hiddenStrokeIds;
    const view = this.viewport.visibleWorldRect();
    const fadedShapes = overlay?.fadedShapeIds;
    const hiddenShapes = overlay?.hiddenShapeIds;
    // Şekiller stroke'ların altında
    for (const shape of this.doc.shapes) {
      if (hiddenShapes?.has(shape.id)) continue;
      if (!rectsOverlap(shapeBounds(shape), view, shape.style.width / 2)) continue;
      const alpha = fadedShapes?.has(shape.id) ? FADED_ALPHA : 1;
      drawShape(ctx, shape, this.theme.inks[shape.style.ink], alpha);
    }
    for (const stroke of this.doc.strokes) {
      if (hidden?.has(stroke.id)) continue;
      // Görünür alanın dışındaki stroke'ları atla (yakınlaştırılmış büyük çizimlerde kazanç)
      if (!rectsOverlap(strokeBounds(stroke), view, stroke.style.width / 2)) continue;
      const alpha = faded?.has(stroke.id) ? FADED_ALPHA : 1;
      drawStroke(ctx, stroke, this.theme.inks[stroke.style.ink], alpha);
    }
  }

  private drawGuides(): void {
    const ctx = this.layers.clear('guides');
    if (!this.state.guidesVisible) return;
    const view = this.guideView(ctx);
    drawGuides(view);
    drawCornerLines(view, this.visibleCornerLines());
  }

  /**
   * Belgedeki şekillerin köşe çizgileri; düzenlenen / çizilen şeklin yerine
   * önizlemesi kullanılır (çizgiler sürüklerken köşeyi izler).
   */
  visibleCornerLines() {
    if (!this.corners) return [];
    const overlay = this.getOverlay();
    const hidden = overlay?.hiddenShapeIds;
    const shapes = this.doc.shapes.filter((s) => !hidden?.has(s.id));
    if (overlay?.previewShape) shapes.push(overlay.previewShape);
    return cornerLines(shapes, cornerTargets(this.scene, this.corners), this.paper.rect);
  }

  private drawInteraction(): void {
    const ctx = this.layers.clear('interaction');
    const overlay = this.getOverlay();
    if (overlay?.snapLine) drawSnapLine(this.guideView(ctx), overlay.snapLine);
    if (overlay?.preview || overlay?.previewStrokes?.length || overlay?.previewShape) {
      this.viewport.applyTo(ctx, this.layers.dpr);
      const shape = overlay.previewShape;
      if (shape) {
        const color = this.theme.inks[shape.style.ink];
        drawShape(ctx, shape, color, 1, overlay.previewShapeOpen ? false : undefined);
      }
      for (const s of overlay.previewStrokes ?? []) drawStroke(ctx, s, this.theme.inks[s.style.ink]);
      if (overlay.preview) drawStroke(ctx, overlay.preview, this.theme.inks[overlay.preview.style.ink]);
    }
    if (overlay?.shapeHandles?.length) {
      this.drawHandles(ctx, overlay.shapeHandles, overlay.activeHandle ?? null);
    }
    if (this.state.markersVisible) drawMarkers(this.guideView(ctx));
    if (overlay?.cursorRadius && this.state.pointer) {
      this.drawCursorCircle(ctx, this.state.pointer, overlay.cursorRadius);
    }
  }

  /** Seçili şeklin köşe tutamaçları: ekran uzayında sabit boyutlu kareler. */
  private drawHandles(
    ctx: CanvasRenderingContext2D,
    handles: readonly { x: number; y: number }[],
    active: number | null,
  ): void {
    const { dpr } = this.layers;
    const t = this.theme;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    handles.forEach((h, i) => {
      const s = this.viewport.worldToScreen(h);
      const r = i === active ? HANDLE_SIZE / 2 + 1.5 : HANDLE_SIZE / 2;
      ctx.beginPath();
      ctx.rect(s.x - r, s.y - r, r * 2, r * 2);
      ctx.fillStyle = i === active ? t.snap : t.markerFill;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = i === active ? t.snap : t.cursor;
      ctx.stroke();
    });
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
