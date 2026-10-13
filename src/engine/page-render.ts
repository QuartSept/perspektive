import type { DrawingDocument } from './document';
import { drawGrid } from './grid';
import type { Paper } from './paper';
import { EditorState } from './state';
import { drawShape } from './shapes';
import { drawStroke } from './stroke';
import { toPrintTheme, type CanvasTheme } from './theme';
import { Viewport } from './viewport';
import { drawGuides, drawMarkers } from '../perspective/guide-renderer';
import type { PerspectiveScene } from '../perspective/scene';

/** Çıktıda ızgara çizgi kalınlığı, dünya birimi (≈0,2 mm). */
export const PRINT_GRID_WIDTH = 0.75;

/** Çok büyük kâğıtlarda (ekran boyu) tarayıcı canvas sınırını aşmamak için. */
const MAX_PIXELS = 40_000_000;

export interface PageSources {
  paper: Paper;
  doc: DrawingDocument;
  scene: PerspectiveScene;
  theme: CanvasTheme;
  /** Kâğıt ızgarası; görünürse "kılavuzlarla" çıktıya girer. */
  grid?: { visible: boolean; spacing: number } | null;
}

export interface PageRenderOptions {
  /** Dünya birimi (96 DPI pikseli) başına çıktı pikseli: 2 ≈ 192 DPI, 3.125 = 300 DPI. */
  pixelsPerUnit: number;
  includeGuides: boolean;
}

/**
 * Yalnızca kâğıt alanını ekran dışı bir canvas'a çizer (PNG ve yazdırma için).
 * Kâğıt dışındaki çizimler kırpılır. Kılavuzlar çizimin altında kalır ki
 * mürekkep üstte okunsun; imleç vurgusu olmadan temel opaklıkla çizilir.
 */
export function renderPage(src: PageSources, options: PageRenderOptions): HTMLCanvasElement {
  const { paper, doc, scene } = src;
  // Çıktı ekran temasından bağımsız: beyaz kâğıt, özgün mürekkepler
  const theme = toPrintTheme(src.theme);
  let k = options.pixelsPerUnit;
  const pixels = paper.width * paper.height * k * k;
  if (pixels > MAX_PIXELS) k *= Math.sqrt(MAX_PIXELS / pixels);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(paper.width * k));
  canvas.height = Math.max(1, Math.round(paper.height * k));
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = theme.printPaper;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Kâğıdı (0,0)'dan başlayarak tuvale eşleyen sanal görünüm.
  // Kılavuz çizgileri "CSS pikseli" cinsinden çizildiği için dpr = k verilir;
  // böylece çıktıda ekrandakiyle aynı fiziksel kalınlıkta olurlar.
  const viewport = new Viewport();
  viewport.width = canvas.width / k;
  viewport.height = canvas.height / k;
  viewport.scale = canvas.width / k / paper.width;

  if (options.includeGuides && src.grid?.visible) {
    viewport.applyTo(ctx, k);
    drawGrid(ctx, paper.rect, src.grid.spacing, theme.grid, PRINT_GRID_WIDTH, 1);
  }

  if (options.includeGuides) {
    const state = new EditorState();
    const view = {
      ctx,
      dpr: k,
      viewport,
      scene,
      state,
      theme: { ...theme, guideOpacity: theme.printGuideOpacity },
    };
    drawGuides(view);
    drawMarkers(view);
  }

  viewport.applyTo(ctx, k);
  for (const shape of doc.shapes) {
    drawShape(ctx, shape, theme.inks[shape.style.ink]);
  }
  for (const stroke of doc.strokes) {
    drawStroke(ctx, stroke, theme.inks[stroke.style.ink]);
  }
  return canvas;
}
