import type { Rect } from './geometry';

export type PaperKind = 'a4' | 'a5' | 'square' | 'screen';

export const PAPER_KINDS: readonly PaperKind[] = ['a4', 'a5', 'square', 'screen'];

/** 96 DPI'da 1 mm kaç dünya birimi (CSS pikseli). Yazdırma ölçeği buna dayanır. */
export const PX_PER_MM = 96 / 25.4;

const PAPER_MM: Record<Exclude<PaperKind, 'screen'>, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  a5: { width: 148, height: 210 },
  square: { width: 210, height: 210 },
};

export class Paper {
  kind: PaperKind = 'a4';
  width = 0;
  height = 0;

  constructor(kind: PaperKind, screenSize: { width: number; height: number }) {
    this.set(kind, screenSize);
  }

  /** `screen` türünde boyut, o anki tuval alanından alınır. */
  set(kind: PaperKind, screenSize: { width: number; height: number }): void {
    this.kind = kind;
    if (kind === 'screen') {
      this.width = Math.max(1, Math.round(screenSize.width));
      this.height = Math.max(1, Math.round(screenSize.height));
    } else {
      const mm = PAPER_MM[kind];
      this.width = mm.width * PX_PER_MM;
      this.height = mm.height * PX_PER_MM;
    }
  }

  get rect(): Rect {
    return { x: 0, y: 0, width: this.width, height: this.height };
  }
}
