import type { Rect } from './geometry';

export type PaperKind = 'a4' | 'a5' | 'square' | 'screen';

export const PAPER_KINDS: readonly PaperKind[] = ['a4', 'a5', 'square', 'screen'];

export type Orientation = 'portrait' | 'landscape';

export const ORIENTATIONS: readonly Orientation[] = ['portrait', 'landscape'];

/** Yönlendirme yalnızca A4/A5 için anlamlı; kare simetrik, ekran boyu pencereyi izler. */
export function supportsOrientation(kind: PaperKind): boolean {
  return kind === 'a4' || kind === 'a5';
}

/** 96 DPI'da 1 mm kaç dünya birimi (CSS pikseli). Yazdırma ölçeği buna dayanır. */
export const PX_PER_MM = 96 / 25.4;

/** Ölçüler dikey (portrait) biçimde tutulur; yatay için en/boy yer değiştirir. */
const PAPER_MM: Record<Exclude<PaperKind, 'screen'>, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  a5: { width: 148, height: 210 },
  square: { width: 210, height: 210 },
};

export class Paper {
  kind: PaperKind = 'a4';
  orientation: Orientation = 'portrait';
  width = 0;
  height = 0;

  constructor(kind: PaperKind, screenSize: { width: number; height: number }) {
    this.set(kind, screenSize);
  }

  /** `screen` türünde boyut, o anki tuval alanından alınır. */
  set(
    kind: PaperKind,
    screenSize: { width: number; height: number },
    orientation: Orientation = this.orientation,
  ): void {
    this.kind = kind;
    this.orientation = orientation;
    if (kind === 'screen') {
      this.width = Math.max(1, Math.round(screenSize.width));
      this.height = Math.max(1, Math.round(screenSize.height));
    } else {
      const mm = PAPER_MM[kind];
      const landscape = orientation === 'landscape';
      this.width = (landscape ? mm.height : mm.width) * PX_PER_MM;
      this.height = (landscape ? mm.width : mm.height) * PX_PER_MM;
    }
  }

  /** Yalnızca yönlendirmeyi değiştirir (A4/A5 dışında etkisiz). */
  setOrientation(orientation: Orientation): void {
    if (!supportsOrientation(this.kind)) return;
    this.set(this.kind, { width: this.width, height: this.height }, orientation);
  }

  /** Kayıttan geri yükleme; `screen` türünün boyutu o anki ekrandan değil kayıttan gelir. */
  restore(kind: PaperKind, width: number, height: number, orientation?: Orientation): void {
    if (kind === 'screen') {
      this.kind = kind;
      this.orientation = orientation ?? (width > height ? 'landscape' : 'portrait');
      this.width = width;
      this.height = height;
    } else {
      // Yönlendirme kayıtta yoksa (eski kayıt) boyuttan çıkarılır
      this.set(kind, { width, height }, orientation ?? (width > height ? 'landscape' : 'portrait'));
    }
  }

  get rect(): Rect {
    return { x: 0, y: 0, width: this.width, height: this.height };
  }
}
