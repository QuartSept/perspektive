import { t } from '../i18n';

/**
 * Pusula: görünüm dönükken tuvalin sağ altında görünür; ibre kâğıdın üst
 * yönünü gösterir. Tıklayınca döndürme sıfırlanır.
 */
export class Compass {
  private readonly button: HTMLButtonElement;
  private readonly needle: SVGElement;

  constructor(parent: HTMLElement, onReset: () => void) {
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'compass';
    this.button.hidden = true;
    this.button.innerHTML =
      '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14"/>' +
      '<g class="compass__needle"><path d="M16 5 20 16h-8z" class="compass__north"/><path d="M16 27 12 16h8z"/></g></svg>';
    this.needle = this.button.querySelector('.compass__needle')!;
    this.button.addEventListener('click', onReset);
    parent.appendChild(this.button);
    this.refreshLanguage();
  }

  refreshLanguage(): void {
    const label = t('view.resetRotation');
    this.button.title = label;
    this.button.setAttribute('aria-label', label);
  }

  /** Görünüm açısını (radyan) gösterir; 0'da gizlenir. */
  update(rotation: number): void {
    this.button.hidden = Math.abs(rotation) < 1e-6;
    this.needle.setAttribute('transform', `rotate(${(rotation * 180) / Math.PI} 16 16)`);
  }
}
