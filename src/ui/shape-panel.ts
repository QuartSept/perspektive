import { t, type MessageKey } from '../i18n';
import { SHAPE_KINDS, type ShapeKind } from '../engine/shapes';
import type { ShapeSettings } from '../tools/shape-tools';

/** Şekil paneli (yalnızca şekil aracı etkinken görünür): tür seçimi ve kullanım ipucu. */
export class ShapePanel {
  private readonly kindButtons: HTMLButtonElement[];
  private readonly hint: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly settings: ShapeSettings,
  ) {
    this.kindButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-shape-kind]')];
    this.hint = root.querySelector('#shape-hint')!;

    for (const btn of this.kindButtons) {
      btn.addEventListener('click', () => settings.setKind(btn.dataset.shapeKind as ShapeKind));
    }
    // radiogroup: ok tuşları
    root.querySelector('.segmented')!.addEventListener('keydown', (e) => {
      const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[(e as KeyboardEvent).key];
      if (!delta) return;
      e.preventDefault();
      const n = SHAPE_KINDS.length;
      const next = SHAPE_KINDS[(SHAPE_KINDS.indexOf(settings.kind) + delta + n) % n];
      settings.setKind(next);
      this.kindButtons.find((b) => b.dataset.shapeKind === next)?.focus();
    });

    settings.onChange(() => this.update());
    this.update();
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  update(): void {
    const { kind } = this.settings;
    for (const btn of this.kindButtons) {
      const checked = btn.dataset.shapeKind === kind;
      btn.setAttribute('aria-checked', String(checked));
      btn.tabIndex = checked ? 0 : -1;
    }
    this.hint.textContent = t(`shape.hint.${kind}` as MessageKey);
  }
}
