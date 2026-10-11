import { t } from '../i18n';
import type { PrintScale } from './output';

export type OutputMode = 'png' | 'print';

export interface OutputDialogHandlers {
  onPng(includeGuides: boolean): Promise<void>;
  onPrint(includeGuides: boolean, scale: PrintScale): void;
}

/**
 * Dışa aktarma / yazdırma diyaloğu (yerel <dialog>). İçerik seçimi her iki
 * modda ortak; ölçek seçimi yalnızca yazdırmada görünür.
 */
export class OutputDialog {
  private readonly dialog: HTMLDialogElement;
  private readonly title: HTMLElement;
  private readonly scaleGroup: HTMLElement;
  private readonly confirmButton: HTMLButtonElement;
  private readonly error: HTMLElement;
  private mode: OutputMode = 'png';

  constructor(private readonly handlers: OutputDialogHandlers) {
    this.dialog = document.getElementById('output-dialog') as HTMLDialogElement;
    this.title = this.dialog.querySelector('#output-title')!;
    this.scaleGroup = this.dialog.querySelector('#output-scale')!;
    this.confirmButton = this.dialog.querySelector('#output-confirm')!;
    this.error = this.dialog.querySelector('#output-error')!;

    this.dialog.querySelector('#output-cancel')!.addEventListener('click', () => this.dialog.close());
    this.dialog.querySelector('form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.confirm();
    });
    // Arka plana tıklayınca kapan
    this.dialog.addEventListener('click', (e) => {
      if (e.target === this.dialog) this.dialog.close();
    });
  }

  get isOpen(): boolean {
    return this.dialog.open;
  }

  open(mode: OutputMode, defaultScale: PrintScale): void {
    this.mode = mode;
    this.title.textContent = t(mode === 'png' ? 'output.pngTitle' : 'output.printTitle');
    this.confirmButton.textContent = t(mode === 'png' ? 'output.download' : 'output.print');
    this.scaleGroup.hidden = mode !== 'print';
    this.error.hidden = true;
    const scaleInput = this.dialog.querySelector<HTMLInputElement>(
      `input[name="scale"][value="${defaultScale}"]`,
    );
    if (scaleInput) scaleInput.checked = true;
    this.dialog.showModal();
    this.confirmButton.focus();
  }

  private value(name: string): string {
    return this.dialog.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)!.value;
  }

  private async confirm(): Promise<void> {
    const includeGuides = this.value('content') === 'guides';
    if (this.mode === 'print') {
      this.dialog.close();
      this.handlers.onPrint(includeGuides, this.value('scale') as PrintScale);
      return;
    }
    this.confirmButton.disabled = true;
    try {
      await this.handlers.onPng(includeGuides);
      this.dialog.close();
    } catch {
      this.error.textContent = t('output.pngError');
      this.error.hidden = false;
    } finally {
      this.confirmButton.disabled = false;
    }
  }
}
