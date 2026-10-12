import { formatPercent, t } from '../i18n';
import {
  REFERENCE_FITS,
  REFERENCE_OPACITY_MAX,
  REFERENCE_OPACITY_MIN,
  type ReferenceFit,
  type ReferenceImage,
} from '../engine/reference';

export interface ReferencePanelHandlers {
  /** Seçilen dosyayı yükler (hata durumunu panel gösterir). */
  onFile(file: File): Promise<void>;
}

/** Referans görsel paneli: yükle, opaklık, göster, sığdır/kapla, kaldır. */
export class ReferencePanel {
  private readonly empty: HTMLElement;
  private readonly controls: HTMLElement;
  private readonly fileInput: HTMLInputElement;
  private readonly opacity: HTMLInputElement;
  private readonly opacityValue: HTMLOutputElement;
  private readonly visible: HTMLInputElement;
  private readonly fitButtons: HTMLButtonElement[];
  private readonly error: HTMLElement;

  constructor(
    root: HTMLElement,
    private readonly reference: ReferenceImage,
    handlers: ReferencePanelHandlers,
  ) {
    this.empty = root.querySelector('#reference-empty')!;
    this.controls = root.querySelector('#reference-controls')!;
    this.fileInput = root.querySelector('#reference-file')!;
    this.opacity = root.querySelector('#reference-opacity')!;
    this.opacityValue = root.querySelector('#reference-opacity-value')!;
    this.visible = root.querySelector('#reference-visible')!;
    this.fitButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-reference-fit]')];
    this.error = root.querySelector('#reference-error')!;

    root.querySelectorAll('[data-reference-load]').forEach((btn) => {
      btn.addEventListener('click', () => this.fileInput.click());
    });
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files?.[0];
      this.fileInput.value = '';
      if (file) void handlers.onFile(file);
    });
    root.querySelector('#reference-remove')!.addEventListener('click', () => reference.clear());

    this.opacity.min = String(REFERENCE_OPACITY_MIN * 100);
    this.opacity.max = String(REFERENCE_OPACITY_MAX * 100);
    this.opacity.step = '5';
    this.opacity.addEventListener('input', () => reference.setOpacity(Number(this.opacity.value) / 100));
    this.visible.addEventListener('change', () => reference.setVisible(this.visible.checked));
    for (const btn of this.fitButtons) {
      btn.addEventListener('click', () => reference.setFit(btn.dataset.referenceFit as ReferenceFit));
    }
    root.querySelector('#reference-fit')!.addEventListener('keydown', (e) => {
      const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[(e as KeyboardEvent).key];
      if (!delta) return;
      e.preventDefault();
      const i = REFERENCE_FITS.indexOf(reference.fit);
      const next = REFERENCE_FITS[(i + delta + REFERENCE_FITS.length) % REFERENCE_FITS.length];
      reference.setFit(next);
      this.fitButtons.find((b) => b.dataset.referenceFit === next)?.focus();
    });

    reference.onChange(() => this.update());
    this.update();
  }

  showError(show: boolean): void {
    this.error.textContent = show ? t('reference.invalid') : '';
    this.error.hidden = !show;
  }

  update(): void {
    const r = this.reference;
    this.empty.hidden = r.loaded;
    this.controls.hidden = !r.loaded;
    const pct = Math.round(r.opacity * 100);
    if (Number(this.opacity.value) !== pct) this.opacity.value = String(pct);
    this.opacityValue.textContent = formatPercent(r.opacity);
    this.visible.checked = r.visible;
    for (const btn of this.fitButtons) {
      const checked = btn.dataset.referenceFit === r.fit;
      btn.setAttribute('aria-checked', String(checked));
      btn.tabIndex = checked ? 0 : -1;
    }
  }
}
