import { PAPER_KINDS, type PaperKind } from '../engine/paper';
import { getLanguage } from '../i18n';

export type ViewAction = 'zoom-in' | 'zoom-out' | 'zoom-reset' | 'zoom-fit';
export type ToolbarAction = ViewAction | 'undo' | 'redo';

export interface ToolbarHandlers {
  onTool(id: string): void;
  onAction(action: ToolbarAction): void;
  onPaperChange(kind: PaperKind): void;
}

/** index.html'deki araç çubuğu öğelerini olaylara bağlar. */
export class Toolbar {
  private readonly toolButtons: HTMLButtonElement[];
  private readonly zoomReadout: HTMLElement;
  private readonly paperSelect: HTMLSelectElement;
  private readonly undoButton: HTMLButtonElement;
  private readonly redoButton: HTMLButtonElement;

  constructor(root: HTMLElement, handlers: ToolbarHandlers) {
    this.toolButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-tool]')];
    this.zoomReadout = root.querySelector('[data-action="zoom-reset"]')!;
    this.paperSelect = root.querySelector('#paper-select')!;
    this.undoButton = root.querySelector('[data-action="undo"]')!;
    this.redoButton = root.querySelector('[data-action="redo"]')!;

    for (const btn of this.toolButtons) {
      btn.addEventListener('click', () => handlers.onTool(btn.dataset.tool!));
    }
    root.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => handlers.onAction(btn.dataset.action as ToolbarAction));
    });
    this.paperSelect.addEventListener('change', () => {
      const kind = this.paperSelect.value as PaperKind;
      if (PAPER_KINDS.includes(kind)) handlers.onPaperChange(kind);
      this.paperSelect.blur();
    });
  }

  setActiveTool(id: string): void {
    for (const btn of this.toolButtons) {
      btn.setAttribute('aria-pressed', String(btn.dataset.tool === id));
    }
  }

  setZoom(scale: number): void {
    // TR: "%100", EN: "100%"
    const text = new Intl.NumberFormat(getLanguage(), {
      style: 'percent',
      maximumFractionDigits: 0,
    }).format(scale);
    if (this.zoomReadout.textContent !== text) this.zoomReadout.textContent = text;
  }

  setHistory(canUndo: boolean, canRedo: boolean): void {
    this.undoButton.disabled = !canUndo;
    this.redoButton.disabled = !canRedo;
  }

  setPaper(kind: PaperKind): void {
    this.paperSelect.value = kind;
  }
}
