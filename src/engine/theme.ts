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
}

export function readCanvasTheme(el: Element = document.documentElement): CanvasTheme {
  const s = getComputedStyle(el);
  const v = (name: string) => s.getPropertyValue(name).trim();
  const n = (name: string, fallback: number) => {
    const parsed = parseFloat(v(name));
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const inks = {} as Record<InkId, string>;
  for (const id of INK_IDS) inks[id] = v(`--ink-${id}`);
  return {
    inks,
    desk: v('--color-desk'),
    paper: v('--color-paper'),
    paperBorder: v('--color-paper-border'),
    paperShadow: v('--color-paper-shadow'),
    vanishingPoints: [v('--color-vp-1'), v('--color-vp-2')],
    horizon: v('--color-horizon'),
    horizonActive: v('--color-horizon-active'),
    guideOpacity: n('--guide-opacity', 0.2),
    guideOpacityStrong: n('--guide-opacity-strong', 0.55),
    guideOpacityDim: n('--guide-opacity-dim', 0.07),
    markerFill: v('--color-marker-fill'),
    snap: v('--color-snap'),
    snapOpacity: n('--snap-opacity', 0.75),
    markerHalo: v('--color-marker-halo'),
  };
}
