import { PX_PER_MM } from '../engine/paper';
import { renderPage, type PageSources } from '../engine/page-render';
import { buildSvg } from '../engine/svg-export';
import { cornerLines, cornerTargets } from '../perspective/corner-lines';
import { toPrintTheme } from '../engine/theme';

/** PNG: ≈192 DPI (A4 → 1587×2245 px). */
const PNG_PIXELS_PER_UNIT = 2;
/** Yazdırma: 300 DPI. */
const PRINT_PIXELS_PER_UNIT = 300 / 96;
/** "Sayfaya sığdır" kenar boşluğu. */
const FIT_MARGIN_MM = 10;
const A4_MM = { short: 210, long: 297 };

export type PrintScale = 'actual' | 'fit';

export interface OutputOptions {
  includeGuides: boolean;
}

export interface PrintOptions extends OutputOptions {
  scale: PrintScale;
}

export function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** Tarayıcıya dosya indirtir. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Kâğıt alanını PNG olarak indirir. */
export async function downloadPng(src: PageSources, options: OutputOptions): Promise<void> {
  const canvas = renderPage(src, {
    pixelsPerUnit: PNG_PIXELS_PER_UNIT,
    includeGuides: options.includeGuides,
  });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG encoding failed');
  downloadBlob(blob, `perspektif-${timestamp()}.png`);
}

/** Kâğıt alanını gerçek ölçekli SVG olarak indirir. */
export function downloadSvg(src: PageSources, options: OutputOptions): void {
  const svg = buildSvg(
    {
      paper: src.paper,
      strokes: src.doc.strokes,
      shapes: src.doc.shapes,
      layers: src.doc.layers,
      scene: src.scene,
      theme: toPrintTheme(src.theme),
      gridSpacing: src.grid?.visible ? src.grid.spacing : null,
      centerMark: src.grid?.centerMark ?? false,
      markerScale: src.markerScale,
      cornerLines: src.corners
        ? cornerLines(
            src.doc.shapes.filter((s) => src.doc.isVisible(s)),
            cornerTargets(src.scene, src.corners),
            src.paper.rect,
          )
        : [],
    },
    options.includeGuides,
  );
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `perspektif-${timestamp()}.svg`);
}

/** Gerçek boyutta kâğıda sığmayan çizim her durumda sayfaya sığdırılır. */
export function defaultPrintScale(paperKind: string): PrintScale {
  return paperKind === 'a4' || paperKind === 'a5' ? 'actual' : 'fit';
}

/**
 * Ayrı yazdırma görünümü: #print-root içine çıktı canvas'ı konur,
 * `@media print` kuralları yalnızca onu gösterir. A4 sayfa, kenar boşluğu
 * sıfır; boşluk ve ortalama sayfa kutusunun içinde yapılır ki ölçek
 * tarayıcının kendi kenar ayarından etkilenmesin.
 */
export class PrintView {
  private readonly root: HTMLElement;
  private readonly pageStyle: HTMLStyleElement;

  constructor(private readonly src: PageSources) {
    this.root = document.getElementById('print-root')!;
    this.pageStyle = document.createElement('style');
    document.head.appendChild(this.pageStyle);

    // Tarayıcı menüsünden yazdırılırsa da boş sayfa çıkmasın (eşzamanlı hazırlanır)
    window.addEventListener('beforeprint', () => {
      if (!this.root.hasChildNodes()) {
        this.prepare({ includeGuides: false, scale: defaultPrintScale(src.paper.kind) });
      }
    });
    window.addEventListener('afterprint', () => this.clear());
  }

  print(options: PrintOptions): void {
    this.prepare(options);
    window.print();
  }

  private prepare(options: PrintOptions): void {
    const { paper } = this.src;
    const landscape = paper.width > paper.height;
    const pageW = landscape ? A4_MM.long : A4_MM.short;
    const pageH = landscape ? A4_MM.short : A4_MM.long;

    const paperW = paper.width / PX_PER_MM;
    const paperH = paper.height / PX_PER_MM;
    const fitsActual = paperW <= pageW + 0.01 && paperH <= pageH + 0.01;
    let w = paperW;
    let h = paperH;
    if (options.scale === 'fit' || !fitsActual) {
      const s = Math.min((pageW - 2 * FIT_MARGIN_MM) / paperW, (pageH - 2 * FIT_MARGIN_MM) / paperH);
      w = paperW * s;
      h = paperH * s;
    }

    const canvas = renderPage(this.src, {
      pixelsPerUnit: PRINT_PIXELS_PER_UNIT,
      includeGuides: options.includeGuides,
    });
    this.clear();
    this.root.appendChild(canvas);
    this.root.style.setProperty('--page-w', `${pageW}mm`);
    this.root.style.setProperty('--page-h', `${pageH}mm`);
    this.root.style.setProperty('--print-w', `${w}mm`);
    this.root.style.setProperty('--print-h', `${h}mm`);
    this.pageStyle.textContent = `@page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 0; }`;
  }

  private clear(): void {
    this.root.replaceChildren();
  }
}
