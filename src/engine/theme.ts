/** Canvas çizimleri için CSS değişkenlerinden okunan renkler. */
export interface CanvasTheme {
  desk: string;
  paper: string;
  paperBorder: string;
  paperShadow: string;
}

export function readCanvasTheme(el: Element = document.documentElement): CanvasTheme {
  const s = getComputedStyle(el);
  const v = (name: string) => s.getPropertyValue(name).trim();
  return {
    desk: v('--color-desk'),
    paper: v('--color-paper'),
    paperBorder: v('--color-paper-border'),
    paperShadow: v('--color-paper-shadow'),
  };
}
