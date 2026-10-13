import { t, type MessageKey } from '../i18n';
import type { CornerTarget } from '../perspective/corner-lines';
import {
  RAY_COUNT_MAX,
  RAY_COUNT_MIN,
  RAY_COUNT_STEP,
  type PerspectiveMode,
  type PerspectiveScene,
} from '../perspective/scene';

export interface PerspectivePanelHandlers {
  onStraightLinesChange(enabled: boolean): void;
  onAxisSnapChange(enabled: boolean): void;
  onModeChange(mode: PerspectiveMode): void;
  onHorizonFreeChange(free: boolean): void;
  onRayCountChange(count: number): void;
  onGuidesVisibleChange(visible: boolean): void;
  onDeletePoint(): void;
  onCornerTargetChange(target: CornerTarget): void;
  onCornerPointChange(id: string): void;
}

export interface PerspectivePanelView {
  scene: PerspectiveScene;
  straightLines: boolean;
  axisSnap: boolean;
  guidesVisible: boolean;
  hasSelection: boolean;
  pointToolActive: boolean;
  cornerTarget: CornerTarget;
  /** "Seçili" modunda çizgilerin gittiği nokta (çözümlenmiş). */
  cornerPointId: string | null;
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
  private readonly freeLineOptions: HTMLElement;
  private readonly straightLines: HTMLInputElement;
  private readonly axisSnap: HTMLInputElement;
  private readonly cornerOptions: HTMLElement;
  private readonly cornerTargetButtons: HTMLButtonElement[];
  private readonly cornerPoint: HTMLElement;
  /** Nokta düğmeleri yalnızca kurgu değişince yeniden kurulur. */
  private cornerPointKey = '';

  constructor(root: HTMLElement, handlers: PerspectivePanelHandlers) {
    this.modeButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-mode]')];
    this.horizonFree = root.querySelector('#horizon-free')!;
    this.rayCount = root.querySelector('#ray-count')!;
    this.rayCountValue = root.querySelector('#ray-count-value')!;
    this.guidesVisible = root.querySelector('#guides-visible')!;
    this.deleteButton = root.querySelector('#delete-point')!;
    this.hint = root.querySelector('#perspective-hint')!;
    this.freeLineOptions = root.querySelector('#free-line-options')!;
    this.straightLines = root.querySelector('#straight-lines')!;
    this.axisSnap = root.querySelector('#axis-snap')!;
    this.straightLines.addEventListener('change', () => {
      handlers.onStraightLinesChange(this.straightLines.checked);
    });
    this.axisSnap.addEventListener('change', () => handlers.onAxisSnapChange(this.axisSnap.checked));

    this.cornerOptions = root.querySelector('#corner-line-options')!;
    this.cornerTargetButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-corner-target]')];
    this.cornerPoint = root.querySelector('#corner-point')!;
    for (const btn of this.cornerTargetButtons) {
      btn.addEventListener('click', () => handlers.onCornerTargetChange(btn.dataset.cornerTarget as CornerTarget));
    }
    this.cornerPoint.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-point-id]');
      if (btn) handlers.onCornerPointChange(btn.dataset.pointId!);
    });
    radioKeys(root.querySelector('#corner-target')!, () => this.cornerTargetButtons, (b) =>
      handlers.onCornerTargetChange(b.dataset.cornerTarget as CornerTarget),
    );
    radioKeys(this.cornerPoint, () => [...this.cornerPoint.querySelectorAll('button')], (b) =>
      handlers.onCornerPointChange(b.dataset.pointId!),
    );

    this.rayCount.min = String(RAY_COUNT_MIN);
    this.rayCount.max = String(RAY_COUNT_MAX);
    this.rayCount.step = String(RAY_COUNT_STEP);

    for (const btn of this.modeButtons) {
      btn.addEventListener('click', () => {
        handlers.onModeChange(Number(btn.dataset.mode) as PerspectiveMode);
      });
    }
    // radiogroup: ok tuşları seçimi değiştirir
    root.querySelector('.segmented[aria-labelledby="perspective-mode-label"]')!.addEventListener('keydown', (e) => {
      const key = (e as KeyboardEvent).key;
      const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[key];
      if (!delta) return;
      e.preventDefault();
      const index = this.modeButtons.findIndex((b) => b.getAttribute('aria-checked') === 'true');
      const next = this.modeButtons[(index + delta + this.modeButtons.length) % this.modeButtons.length];
      handlers.onModeChange(Number(next.dataset.mode) as PerspectiveMode);
      next.focus();
    });
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

    // Ufuk kilidi yalnızca ufukta iki nokta varken (2 ve 3 nokta) anlamlı
    const lockApplies = scene.mode >= 2;
    this.horizonFree.disabled = !lockApplies;
    this.horizonFree.checked = lockApplies && !scene.horizonLocked;
    this.horizonFree.closest('.switch')?.classList.toggle('is-disabled', !lockApplies);
    this.rayCount.disabled = scene.mode === 0;

    // Perspektifsiz çizim seçenekleri yalnızca kapalı modda
    this.freeLineOptions.hidden = scene.mode !== 0;
    this.straightLines.checked = view.straightLines;
    this.axisSnap.checked = view.axisSnap;
    this.axisSnap.disabled = !view.straightLines;
    this.axisSnap.closest('.switch')?.classList.toggle('is-disabled', !view.straightLines);

    const count = String(scene.rayCount);
    if (this.rayCount.value !== count) this.rayCount.value = count;
    this.rayCountValue.textContent = count;

    this.guidesVisible.checked = view.guidesVisible;
    this.deleteButton.disabled = !view.hasSelection;
    this.updateCorners(view);

    this.hint.textContent = t(hintKeyFor(view));
  }

  /** Köşe çizgisi hedefi: yalnızca birden fazla kaçış noktası varken anlamlı. */
  private updateCorners(view: PerspectivePanelView): void {
    const points = view.scene.activePoints;
    this.cornerOptions.hidden = points.length < 2;
    for (const btn of this.cornerTargetButtons) {
      setChecked(btn, btn.dataset.cornerTarget === view.cornerTarget);
    }
    this.cornerPoint.hidden = points.length < 2 || view.cornerTarget !== 'one';
    const key = points.map((p) => `${p.id}:${view.scene.colorIndexOf(p)}`).join(',') + t('corners.pointLabel');
    if (key !== this.cornerPointKey) {
      this.cornerPointKey = key;
      this.cornerPoint.replaceChildren(
        ...points.map((p, i) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.setAttribute('role', 'radio');
          btn.dataset.pointId = p.id;
          btn.title = t('corners.pointLabel', { n: i + 1 });
          btn.setAttribute('aria-label', btn.title);
          const dot = document.createElement('span');
          dot.className = 'vp-dot';
          dot.style.background = `var(--color-vp-${view.scene.colorIndexOf(p) + 1})`;
          btn.append(dot, String(i + 1));
          return btn;
        }),
      );
    }
    for (const btn of this.cornerPoint.querySelectorAll('button')) {
      setChecked(btn, btn.dataset.pointId === view.cornerPointId);
    }
  }
}

/** radiogroup: ok tuşları seçimi değiştirir. */
function radioKeys(
  group: HTMLElement,
  buttons: () => HTMLButtonElement[],
  choose: (btn: HTMLButtonElement) => void,
): void {
  group.addEventListener('keydown', (e) => {
    const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[(e as KeyboardEvent).key];
    if (!delta) return;
    e.preventDefault();
    const list = buttons();
    const index = list.findIndex((b) => b.getAttribute('aria-checked') === 'true');
    const next = list[(index + delta + list.length) % list.length];
    choose(next);
    next.focus();
  });
}

function setChecked(btn: HTMLButtonElement, checked: boolean): void {
  btn.setAttribute('aria-checked', String(checked));
  btn.tabIndex = checked ? 0 : -1;
}

function hintKeyFor({ scene, pointToolActive }: PerspectivePanelView): MessageKey {
  if (scene.mode === 0) return 'perspective.hintOff';
  if (!pointToolActive) return 'perspective.hintOtherTool';
  if (scene.canAddPoint) return 'perspective.hintAdd';
  return scene.mode === 3 ? 'perspective.hintVertical' : 'perspective.hintEdit';
}
