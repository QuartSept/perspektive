import { t, type MessageKey } from '../i18n';
import {
  RAY_COUNT_MAX,
  RAY_COUNT_MIN,
  RAY_COUNT_STEP,
  type PerspectiveMode,
  type PerspectiveScene,
} from '../perspective/scene';

export interface PerspectivePanelHandlers {
  onModeChange(mode: PerspectiveMode): void;
  onHorizonFreeChange(free: boolean): void;
  onRayCountChange(count: number): void;
  onGuidesVisibleChange(visible: boolean): void;
  onDeletePoint(): void;
}

export interface PerspectivePanelView {
  scene: PerspectiveScene;
  guidesVisible: boolean;
  hasSelection: boolean;
  pointToolActive: boolean;
}

/** Perspektif paneli: mod, ufuk kilidi, ışın sayısı, kılavuz görünürlüğü. */
export class PerspectivePanel {
  private readonly modeButtons: HTMLButtonElement[];
  private readonly horizonFree: HTMLInputElement;
  private readonly rayCount: HTMLInputElement;
  private readonly rayCountValue: HTMLOutputElement;
  private readonly guidesVisible: HTMLInputElement;
  private readonly deleteButton: HTMLButtonElement;
  private readonly hint: HTMLElement;

  constructor(root: HTMLElement, handlers: PerspectivePanelHandlers) {
    this.modeButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-mode]')];
    this.horizonFree = root.querySelector('#horizon-free')!;
    this.rayCount = root.querySelector('#ray-count')!;
    this.rayCountValue = root.querySelector('#ray-count-value')!;
    this.guidesVisible = root.querySelector('#guides-visible')!;
    this.deleteButton = root.querySelector('#delete-point')!;
    this.hint = root.querySelector('#perspective-hint')!;

    this.rayCount.min = String(RAY_COUNT_MIN);
    this.rayCount.max = String(RAY_COUNT_MAX);
    this.rayCount.step = String(RAY_COUNT_STEP);

    for (const btn of this.modeButtons) {
      btn.addEventListener('click', () => {
        handlers.onModeChange(Number(btn.dataset.mode) as PerspectiveMode);
      });
    }
    this.horizonFree.addEventListener('change', () => {
      handlers.onHorizonFreeChange(this.horizonFree.checked);
    });
    this.rayCount.addEventListener('input', () => {
      handlers.onRayCountChange(Number(this.rayCount.value));
    });
    this.guidesVisible.addEventListener('change', () => {
      handlers.onGuidesVisibleChange(this.guidesVisible.checked);
    });
    this.deleteButton.addEventListener('click', () => handlers.onDeletePoint());
  }

  update(view: PerspectivePanelView): void {
    const { scene } = view;
    for (const btn of this.modeButtons) {
      const checked = Number(btn.dataset.mode) === scene.mode;
      btn.setAttribute('aria-checked', String(checked));
      btn.tabIndex = checked ? 0 : -1;
    }

    this.horizonFree.disabled = scene.mode === 1;
    this.horizonFree.checked = scene.mode === 2 && !scene.horizonLocked;
    this.horizonFree.closest('.switch')?.classList.toggle('is-disabled', scene.mode === 1);

    const count = String(scene.rayCount);
    if (this.rayCount.value !== count) this.rayCount.value = count;
    this.rayCountValue.textContent = count;

    this.guidesVisible.checked = view.guidesVisible;
    this.deleteButton.disabled = !view.hasSelection;

    const hintKey: MessageKey = !view.pointToolActive
      ? 'perspective.hintOtherTool'
      : scene.canAddPoint
        ? 'perspective.hintAdd'
        : 'perspective.hintEdit';
    this.hint.textContent = t(hintKey);
  }
}
