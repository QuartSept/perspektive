import { t } from '../i18n';
import {
  ERASER_KINDS,
  ERASER_RADIUS_MAX,
  ERASER_RADIUS_MIN,
  type EraserKind,
  type EraserSettings,
} from '../tools/eraser';

/** Silgi paneli (yalnızca silgi etkinken görünür): tür ve boyut. */
export class EraserPanel {
  private readonly kindButtons: HTMLButtonElement[];
  private readonly radius: HTMLInputElement;
  private readonly radiusValue: HTMLOutputElement;
  private readonly hint: HTMLElement;
  private readonly allLayers: HTMLInputElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly settings: EraserSettings,
  ) {
    this.kindButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-eraser-kind]')];
    this.radius = root.querySelector('#eraser-radius')!;
    this.radiusValue = root.querySelector('#eraser-radius-value')!;
    this.hint = root.querySelector('#eraser-hint')!;
    this.allLayers = root.querySelector('#eraser-all-layers')!;
    this.allLayers.addEventListener('change', () => settings.setAllLayers(this.allLayers.checked));

    this.radius.min = String(ERASER_RADIUS_MIN);
    this.radius.max = String(ERASER_RADIUS_MAX);
    this.radius.step = '1';
    this.radius.addEventListener('input', () => settings.setRadius(Number(this.radius.value)));

    for (const btn of this.kindButtons) {
      btn.addEventListener('click', () => settings.setKind(btn.dataset.eraserKind as EraserKind));
    }
    // radiogroup: ok tuşları
    root.querySelector('.segmented')!.addEventListener('keydown', (e) => {
      const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[(e as KeyboardEvent).key];
      if (!delta) return;
      e.preventDefault();
      const i = ERASER_KINDS.indexOf(settings.kind);
      const next = ERASER_KINDS[(i + delta + ERASER_KINDS.length) % ERASER_KINDS.length];
      settings.setKind(next);
      this.kindButtons.find((b) => b.dataset.eraserKind === next)?.focus();
    });

    settings.onChange(() => this.update());
    this.update();
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  update(): void {
    const { kind, radius } = this.settings;
    this.allLayers.checked = this.settings.allLayers;
    for (const btn of this.kindButtons) {
      const checked = btn.dataset.eraserKind === kind;
      btn.setAttribute('aria-checked', String(checked));
      btn.tabIndex = checked ? 0 : -1;
    }
    if (Number(this.radius.value) !== radius) this.radius.value = String(radius);
    this.radiusValue.textContent = `${radius} px`;
    this.hint.textContent = t(
      kind === 'pixel' ? 'eraser.hintPixel' : kind === 'segment' ? 'eraser.hintSegment' : 'eraser.hintStroke',
    );
  }
}
