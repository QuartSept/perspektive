import { getLanguage, t, type MessageKey } from '../i18n';
import { INK_IDS, type InkId } from '../engine/stroke';
import {
  SNAP_RADIUS_MAX,
  SNAP_RADIUS_MIN,
  type SnapSettings,
} from '../perspective/snap-settings';
import {
  BRUSH_OPACITY_MAX,
  BRUSH_OPACITY_MIN,
  BRUSH_WIDTH_MAX,
  BRUSH_WIDTH_MIN,
  BRUSH_WIDTH_STEP,
  type BrushSettings,
} from '../tools/brush-settings';

/** Fırça paneli: mürekkep rengi, kalınlık, opaklık, yumuşatma, mıknatıs yarıçapı. */
export class BrushPanel {
  private readonly swatches: HTMLButtonElement[] = [];
  private readonly width: HTMLInputElement;
  private readonly widthValue: HTMLOutputElement;
  private readonly opacity: HTMLInputElement;
  private readonly opacityValue: HTMLOutputElement;
  private readonly smoothing: HTMLInputElement;
  private readonly smoothingValue: HTMLOutputElement;
  private readonly snapRadius: HTMLInputElement;
  private readonly snapRadiusValue: HTMLOutputElement;

  constructor(
    root: HTMLElement,
    private readonly settings: BrushSettings,
    private readonly snap: SnapSettings,
  ) {
    const swatchGroup = root.querySelector<HTMLElement>('#ink-swatches')!;
    for (const ink of INK_IDS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'swatch';
      btn.setAttribute('role', 'radio');
      btn.dataset.ink = ink;
      btn.dataset.i18nTitle = `ink.${ink}`;
      btn.style.backgroundColor = `var(--ink-${ink})`;
      const label = t(`ink.${ink}` as MessageKey);
      btn.title = label;
      btn.setAttribute('aria-label', label);
      btn.addEventListener('click', () => settings.setInk(ink));
      swatchGroup.appendChild(btn);
      this.swatches.push(btn);
    }
    swatchGroup.addEventListener('keydown', (e) => this.onSwatchKey(e));

    this.width = root.querySelector('#brush-width')!;
    this.widthValue = root.querySelector('#brush-width-value')!;
    this.width.min = String(BRUSH_WIDTH_MIN);
    this.width.max = String(BRUSH_WIDTH_MAX);
    this.width.step = String(BRUSH_WIDTH_STEP);
    this.width.addEventListener('input', () => settings.setWidth(Number(this.width.value)));

    this.opacity = root.querySelector('#brush-opacity')!;
    this.opacityValue = root.querySelector('#brush-opacity-value')!;
    this.opacity.min = String(BRUSH_OPACITY_MIN * 100);
    this.opacity.max = String(BRUSH_OPACITY_MAX * 100);
    this.opacity.step = '5';
    this.opacity.addEventListener('input', () => {
      settings.setOpacity(Number(this.opacity.value) / 100);
    });

    this.smoothing = root.querySelector('#brush-smoothing')!;
    this.smoothingValue = root.querySelector('#brush-smoothing-value')!;
    this.smoothing.min = '0';
    this.smoothing.max = '100';
    this.smoothing.step = '5';
    this.smoothing.addEventListener('input', () => {
      settings.setSmoothing(Number(this.smoothing.value) / 100);
    });

    this.snapRadius = root.querySelector('#snap-radius')!;
    this.snapRadiusValue = root.querySelector('#snap-radius-value')!;
    this.snapRadius.min = String(SNAP_RADIUS_MIN);
    this.snapRadius.max = String(SNAP_RADIUS_MAX);
    this.snapRadius.step = '1';
    this.snapRadius.addEventListener('input', () => snap.setRadius(Number(this.snapRadius.value)));

    settings.onChange(() => this.update());
    snap.onChange(() => this.update());
    this.update();
  }

  update(): void {
    const s = this.settings;
    for (const btn of this.swatches) {
      const checked = btn.dataset.ink === s.ink;
      btn.setAttribute('aria-checked', String(checked));
      btn.tabIndex = checked ? 0 : -1;
    }

    const lang = getLanguage();
    if (Number(this.width.value) !== s.width) this.width.value = String(s.width);
    this.widthValue.textContent = `${new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(s.width)} px`;

    const pct = Math.round(s.opacity * 100);
    if (Number(this.opacity.value) !== pct) this.opacity.value = String(pct);
    this.opacityValue.textContent = new Intl.NumberFormat(lang, {
      style: 'percent',
      maximumFractionDigits: 0,
    }).format(s.opacity);

    const smoothPct = Math.round(s.smoothing * 100);
    if (Number(this.smoothing.value) !== smoothPct) this.smoothing.value = String(smoothPct);
    this.smoothingValue.textContent = new Intl.NumberFormat(lang, {
      style: 'percent',
      maximumFractionDigits: 0,
    }).format(s.smoothing);

    const radius = this.snap.radius;
    if (Number(this.snapRadius.value) !== radius) this.snapRadius.value = String(radius);
    this.snapRadiusValue.textContent = `${radius} px`;
    this.snapRadius.disabled = !this.snap.enabled;
  }

  /** Renk grubunda ok tuşlarıyla gezinme (radiogroup). */
  private onSwatchKey(e: KeyboardEvent): void {
    const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!delta) return;
    e.preventDefault();
    const index = INK_IDS.indexOf(this.settings.ink);
    const next = INK_IDS[(index + delta + INK_IDS.length) % INK_IDS.length] as InkId;
    this.settings.setInk(next);
    this.swatches[INK_IDS.indexOf(next)].focus();
  }
}
