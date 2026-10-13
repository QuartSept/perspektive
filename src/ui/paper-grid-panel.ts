import type { PaperGrid } from '../engine/grid';
import { GRID_SPACINGS_MM, type GridSpacingMm } from '../storage/format';

/** Kâğıt ızgarası paneli: göster, ızgaraya yapış, aralık (5 / 10 / 20 mm). */
export class PaperGridPanel {
  private readonly visible: HTMLInputElement;
  private readonly snap: HTMLInputElement;
  private readonly spacingButtons: HTMLButtonElement[];

  constructor(
    root: HTMLElement,
    private readonly grid: PaperGrid,
  ) {
    this.visible = root.querySelector('#paper-grid-visible')!;
    this.snap = root.querySelector('#paper-grid-snap')!;
    this.spacingButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-grid-spacing]')];

    this.visible.addEventListener('change', () => grid.setVisible(this.visible.checked));
    this.snap.addEventListener('change', () => grid.setSnap(this.snap.checked));
    for (const btn of this.spacingButtons) {
      btn.addEventListener('click', () => grid.setSpacing(spacingOf(btn)));
    }
    // radiogroup: ok tuşları seçimi değiştirir
    root.querySelector('#paper-grid-spacing')!.addEventListener('keydown', (e) => {
      const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[(e as KeyboardEvent).key];
      if (!delta) return;
      e.preventDefault();
      const n = GRID_SPACINGS_MM.length;
      const next = GRID_SPACINGS_MM[(GRID_SPACINGS_MM.indexOf(grid.spacingMm) + delta + n) % n];
      grid.setSpacing(next);
      this.spacingButtons.find((b) => spacingOf(b) === next)?.focus();
    });

    grid.onChange(() => this.update());
    this.update();
  }

  update(): void {
    const g = this.grid;
    this.visible.checked = g.visible;
    this.snap.checked = g.snap;
    for (const btn of this.spacingButtons) {
      const checked = spacingOf(btn) === g.spacingMm;
      btn.setAttribute('aria-checked', String(checked));
      btn.tabIndex = checked ? 0 : -1;
    }
  }
}

function spacingOf(btn: HTMLButtonElement): GridSpacingMm {
  return Number(btn.dataset.gridSpacing) as GridSpacingMm;
}
