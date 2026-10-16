import { t } from '../i18n';

export interface ConfirmOptions {
  message: string;
  confirmLabel: string;
  /** Geri dönüşü zor işlem: onay düğmesi uyarı renginde, odak "Vazgeç"te başlar. */
  destructive?: boolean;
}

/**
 * Uygulama içi onay penceresi. Tarayıcının `window.confirm`'ü bazı ortamlarda
 * (gömülü tarayıcılar, iframe'ler) pencere göstermeden `false` döndürüyor;
 * bu yüzden onaylar her zaman buradan sorulur.
 */
export class ConfirmDialog {
  private readonly dialog: HTMLDialogElement;
  private readonly message: HTMLElement;
  private readonly ok: HTMLButtonElement;
  private readonly cancel: HTMLButtonElement;
  private pending: ((value: boolean) => void) | null = null;

  constructor() {
    this.dialog = document.getElementById('confirm-dialog') as HTMLDialogElement;
    this.message = this.dialog.querySelector('#confirm-message')!;
    this.ok = this.dialog.querySelector('#confirm-ok')!;
    this.cancel = this.dialog.querySelector('#confirm-cancel')!;

    // Düğmeler sonucu hemen verir: `close` olayı bazı ortamlarda (arka plandaki
    // gömülü sekmeler) gecikebiliyor ya da hiç gelmeyebiliyor
    this.ok.addEventListener('click', () => this.finish(true));
    this.cancel.addEventListener('click', () => this.finish(false));
    this.dialog.addEventListener('click', (e) => {
      if (e.target === this.dialog) this.finish(false);
    });
    // Esc ile kapanış
    this.dialog.addEventListener('close', () => this.resolve(this.dialog.returnValue === 'ok'));
  }

  private finish(ok: boolean): void {
    this.resolve(ok);
    if (this.dialog.open) this.dialog.close(ok ? 'ok' : 'cancel');
  }

  private resolve(ok: boolean): void {
    const resolve = this.pending;
    this.pending = null;
    resolve?.(ok);
  }

  ask({ message, confirmLabel, destructive = false }: ConfirmOptions): Promise<boolean> {
    // Açık bir soru varken yenisi gelirse eskisi vazgeçilmiş sayılır
    if (this.dialog.open) this.finish(false);
    this.message.textContent = message;
    this.ok.textContent = confirmLabel;
    this.cancel.textContent = t('confirm.cancel');
    this.ok.classList.toggle('btn--danger', destructive);
    this.ok.classList.toggle('btn--primary', !destructive);
    this.dialog.returnValue = '';
    return new Promise((resolve) => {
      this.pending = resolve;
      this.dialog.showModal();
      (destructive ? this.cancel : this.ok).focus();
    });
  }
}
