/** Bildirimin ekranda kaldığı süre. */
const TOAST_MS = 2600;

export interface ToastAction {
  label: string;
  run(): void;
}

/**
 * Tuvalin altında kısa bildirim ("Katman kilitli", "Çizgi silindi · Geri al").
 * Aynı anda tek bildirim gösterilir; yenisi eskisinin yerini alır. Ekran
 * okuyucuya `aria-live` ile duyurulur.
 */
export class Toast {
  private readonly el: HTMLElement;
  private readonly text: HTMLElement;
  private readonly button: HTMLButtonElement;
  private timer = 0;
  private action: ToastAction | null = null;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'toast';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
    this.el.hidden = true;
    this.text = document.createElement('span');
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'toast__action';
    this.button.addEventListener('click', () => {
      this.action?.run();
      this.hide();
    });
    this.el.append(this.text, this.button);
    parent.appendChild(this.el);
  }

  show(message: string, action?: ToastAction): void {
    window.clearTimeout(this.timer);
    this.text.textContent = message;
    this.action = action ?? null;
    this.button.hidden = !action;
    this.button.textContent = action?.label ?? '';
    this.el.hidden = false;
    this.timer = window.setTimeout(() => this.hide(), TOAST_MS);
  }

  hide(): void {
    window.clearTimeout(this.timer);
    this.el.hidden = true;
    this.action = null;
  }
}
