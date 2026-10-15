import type { DrawingDocument } from './document';
import type { LayerName, LayerStack } from './layers';
import type { Paper } from './paper';
import { drawCenterMark, drawGrid, gridFade, type PaperGrid } from './grid';
import { fitImage, type ReferenceImage } from './reference';
import type { EditorState } from './state';
import { drawShape } from './shapes';
import { drawDocument, FADED_ALPHA } from './doc-render';
import { drawStroke } from './stroke';
import type { CanvasTheme } from './theme';
import type { Viewport } from './viewport';
import { cornerLines, cornerTargets, type CornerLineSettings } from '../perspective/corner-lines';
import {
  drawCornerLines,
  drawCursorRays,
  drawGuides,
  drawMarkers,
  drawSnapLine,
  type GuideView,
} from '../perspective/guide-renderer';
import type { PerspectiveScene } from '../perspective/scene';
import type { ToolOverlay } from '../tools/tool';

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
  /** İmleçten kaçış noktalarına çizgiler şu an çizilsin mi (fırça etkin, ayar açık, çizilmiyor). */
  cursorRays: () => boolean = () => false;

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
    if (grid?.centerMark) drawCenterMark(ctx, this.paper.rect, t.centerMark, 1 / this.viewport.scale);

    ctx.strokeStyle = t.paperBorder;
    ctx.lineWidth = 1 / this.viewport.scale;
    ctx.strokeRect(0, 0, width, height);
  }

  private drawDrawing(): void {
    const ctx = this.layers.clear('drawing');
    this.viewport.applyTo(ctx, this.layers.dpr);
    const overlay = this.getOverlay();
    drawDocument(ctx, this.doc, this.theme.inks, {
      view: this.viewport.visibleWorldRect(),
      fadedStrokeIds: overlay?.fadedStrokeIds,
      hiddenStrokeIds: overlay?.hiddenStrokeIds,
      fadedShapeIds: overlay?.fadedShapeIds,
      hiddenShapeIds: overlay?.hiddenShapeIds,
      fadedShapeEdges: overlay?.fadedShapeEdges,
    });
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
    // Gizli katmandaki şekillerin köşe çizgileri de gizli
    const shapes = this.doc.shapes.filter((s) => !hidden?.has(s.id) && this.doc.isVisible(s));
    if (overlay?.previewShape) shapes.push(overlay.previewShape);
    return cornerLines(shapes, cornerTargets(this.scene, this.corners), this.paper.rect);
  }

  private drawInteraction(): void {
    const ctx = this.layers.clear('interaction');
    const overlay = this.getOverlay();
    // Kılavuzlardan bağımsız: G ile gizlenmez
    if (this.state.pointer && this.cursorRays()) drawCursorRays(this.guideView(ctx), this.state.pointer);
    if (overlay?.snapLine) drawSnapLine(this.guideView(ctx), overlay.snapLine);
    for (const line of overlay?.guideLines ?? []) drawSnapLine(this.guideView(ctx), line);
    if (
      overlay?.preview ||
      overlay?.previewStrokes?.length ||
      overlay?.fadedPreviewStrokes?.length ||
      overlay?.previewShape
    ) {
      this.viewport.applyTo(ctx, this.layers.dpr);
      // Önizleme kendi katmanının opaklığıyla (bırakınca görünüm değişmesin)
      const alpha = (item: { layerId?: string }) => this.doc.layerOf(item).opacity;
      const shape = overlay.previewShape;
      if (shape) {
        const color = this.theme.inks[shape.style.ink];
        drawShape(ctx, shape, color, alpha(shape), overlay.previewShapeOpen ? false : undefined);
      }
      for (const s of overlay.previewStrokes ?? []) drawStroke(ctx, s, this.theme.inks[s.style.ink], alpha(s));
      for (const s of overlay.fadedPreviewStrokes ?? []) {
        drawStroke(ctx, s, this.theme.inks[s.style.ink], alpha(s) * FADED_ALPHA);
      }
      if (overlay.preview) {
        drawStroke(ctx, overlay.preview, this.theme.inks[overlay.preview.style.ink], alpha(overlay.preview));
      }
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
