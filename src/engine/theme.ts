import { INK_IDS, type InkId } from './stroke';

/** Canvas çizimleri için CSS değişkenlerinden okunan renkler. */
export interface CanvasTheme {
  /** Mürekkep paleti: `--ink-<id>`. */
  inks: Record<InkId, string>;
  desk: string;
  paper: string;
  paperBorder: string;
  paperShadow: string;
  /** Kaçış noktası başına renk (ışınlar + işaretçi). */
  vanishingPoints: string[];
  horizon: string;
  horizonActive: string;
  guideOpacity: number;
  guideOpacityStrong: number;
  guideOpacityDim: number;
  markerFill: string;
  /** Kilitlenen perspektif doğrusu. */
  snap: string;
  snapOpacity: number;
  markerHalo: string;
  /** Silgi gibi daire imleçler. */
  cursor: string;
  cursorHalo: string;
  /** Kâğıt ızgarası (opaklık renkte). */
  grid: string;
  /** Köşe kaçış çizgileri: nokta renginde, kesikli, bu opaklıkta. */
  cornerLineOpacity: number;
  /** PNG / SVG / yazdırma: temadan bağımsız renkler. */
  printPaper: string;
  printGuideOpacity: number;
  printInks: Record<InkId, string>;
  printVanishingPoints: string[];
  printHorizon: string;
  printMarkerFill: string;
  printGrid: string;
  printCornerLineOpacity: number;
}

/** Çıktı için tema: ekran renklerinin yerine temadan bağımsız --print-* renkleri. */
export function toPrintTheme(theme: CanvasTheme): CanvasTheme {
  return {
    ...theme,
    inks: theme.printInks,
    vanishingPoints: theme.printVanishingPoints,
    horizon: theme.printHorizon,
    markerFill: theme.printMarkerFill,
    grid: theme.printGrid,
    cornerLineOpacity: theme.printCornerLineOpacity,
  };
}

export function readCanvasTheme(el: Element = document.documentElement): CanvasTheme {
  const s = getComputedStyle(el);
  const v = (name: string) => s.getPropertyValue(name).trim();
  const n = (name: string, fallback: number) => {
    const parsed = parseFloat(v(name));
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const inks = {} as Record<InkId, string>;
  const printInks = {} as Record<InkId, string>;
  for (const id of INK_IDS) {
    inks[id] = v(`--ink-${id}`);
    printInks[id] = v(`--print-ink-${id}`);
  }
  return {
    inks,
    desk: v('--color-desk'),
    paper: v('--color-paper'),
    paperBorder: v('--color-paper-border'),
    paperShadow: v('--color-paper-shadow'),
    vanishingPoints: [v('--color-vp-1'), v('--color-vp-2'), v('--color-vp-3')],
    horizon: v('--color-horizon'),
    horizonActive: v('--color-horizon-active'),
    guideOpacity: n('--guide-opacity', 0.2),
    guideOpacityStrong: n('--guide-opacity-strong', 0.55),
    guideOpacityDim: n('--guide-opacity-dim', 0.07),
    markerFill: v('--color-marker-fill'),
    snap: v('--color-snap'),
    snapOpacity: n('--snap-opacity', 0.75),
    markerHalo: v('--color-marker-halo'),
    cursor: v('--color-cursor'),
    cursorHalo: v('--color-cursor-halo'),
    grid: v('--color-grid'),
    cornerLineOpacity: n('--corner-line-opacity', 0.55),
    printPaper: v('--color-print-paper'),
    printGuideOpacity: n('--print-guide-opacity', 0.35),
    printInks,
    printVanishingPoints: [v('--print-vp-1'), v('--print-vp-2'), v('--print-vp-3')],
    printHorizon: v('--print-horizon'),
    printMarkerFill: v('--print-marker-fill'),
    printGrid: v('--print-grid'),
    printCornerLineOpacity: n('--print-corner-line-opacity', 0.6),
  };
}
