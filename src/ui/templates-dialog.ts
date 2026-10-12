import { t, type MessageKey } from '../i18n';
import { TEMPLATE_IDS, type TemplateId } from '../perspective/templates';

export interface TemplatesDialogHandlers {
  onPick(id: TemplateId): void | Promise<void>;
  /** Şablonun küçük önizlemesi (o anki kâğıt boyutu ve yönüyle). */
  renderPreview(id: TemplateId, maxSizePx: number): HTMLCanvasElement;
}

const PREVIEW_PX = 132;

/** Şablon seçimi: her şablon önizleme + ad + kısa açıklamalı bir düğme. */
export class TemplatesDialog {
  private readonly dialog: HTMLDialogElement;
  private readonly grid: HTMLElement;

  constructor(private readonly handlers: TemplatesDialogHandlers) {
    this.dialog = document.getElementById('templates-dialog') as HTMLDialogElement;
    this.grid = this.dialog.querySelector('#templates-grid')!;
    this.dialog.querySelector('#templates-close')!.addEventListener('click', () => this.dialog.close());
    this.dialog.addEventListener('click', (e) => {
      if (e.target === this.dialog) this.dialog.close();
    });
  }

  open(): void {
    // Önizlemeler her açılışta yeniden üretilir: kâğıt boyutu/yönü değişmiş olabilir
    this.grid.replaceChildren(...TEMPLATE_IDS.map((id) => this.card(id)));
    this.dialog.showModal();
    this.grid.querySelector<HTMLButtonElement>('button')?.focus();
  }

  private card(id: TemplateId): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'template-card';
    const preview = this.handlers.renderPreview(id, PREVIEW_PX);
    preview.className = 'template-card__preview';
    preview.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.className = 'template-card__name';
    name.textContent = t(`template.${id}.name` as MessageKey);
    const desc = document.createElement('span');
    desc.className = 'template-card__desc';
    desc.textContent = t(`template.${id}.desc` as MessageKey);
    btn.append(preview, name, desc);
    btn.addEventListener('click', () => {
      this.dialog.close();
      void this.handlers.onPick(id);
    });
    return btn;
  }
}
