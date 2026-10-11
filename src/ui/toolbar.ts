import { PAPER_KINDS, type PaperKind } from '../engine/paper';
import { getLanguage, t, type MessageKey } from '../i18n';
import type { SaveStatus } from '../storage/autosave';

export type ViewAction = 'zoom-in' | 'zoom-out' | 'zoom-reset' | 'zoom-fit';
export type ToolbarAction = ViewAction | 'undo' | 'redo' | 'clear' | 'export-png' | 'print';

export interface ToolbarHandlers {
  onTool(id: string): void;
  onAction(action: ToolbarAction): void;
  onPaperChange(kind: PaperKind): void;
  onMagnetToggle(): void;
}

/** index.html'deki araç çubuğu öğelerini olaylara bağlar. */
export class Toolbar {
  private readonly toolButtons: HTMLButtonElement[];
  private readonly zoomReadout: HTMLElement;
  private readonly paperSelect: HTMLSelectElement;
  private readonly undoButton: HTMLButtonElement;
  private readonly redoButton: HTMLButtonElement;
  private readonly magnetButton: HTMLButtonElement;
  private readonly clearButton: HTMLButtonElement;
  private readonly saveStatus: HTMLElement;

  constructor(root: HTMLElement, handlers: ToolbarHandlers) {
    this.toolButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-tool]')];
    this.zoomReadout = root.querySelector('[data-action="zoom-reset"]')!;
    this.paperSelect = root.querySelector('#paper-select')!;
    this.undoButton = root.querySelector('[data-action="undo"]')!;
    this.redoButton = root.querySelector('[data-action="redo"]')!;
    this.magnetButton = root.querySelector('#magnet-toggle')!;
    this.clearButton = root.querySelector('[data-action="clear"]')!;
    this.saveStatus = root.querySelector('#save-status')!;
    this.magnetButton.addEventListener('click', () => handlers.onMagnetToggle());

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

  /** `suspended`: açık ama Space ile geçici olarak devre dışı. */
  setMagnet(enabled: boolean, suspended: boolean): void {
    this.magnetButton.setAttribute('aria-pressed', String(enabled));
    this.magnetButton.classList.toggle('is-suspended', enabled && suspended);
  }

  setCanClear(canClear: boolean): void {
    this.clearButton.disabled = !canClear;
  }

  setSaveStatus(status: SaveStatus): void {
    const key: MessageKey | null =
      status === 'pending' || status === 'saving'
        ? 'save.saving'
        : status === 'saved'
          ? 'save.saved'
          : status === 'error'
            ? 'save.error'
            : null;
    this.saveStatus.dataset.status = status;
    this.saveStatus.textContent = key ? t(key) : '';
  }

  setPaper(kind: PaperKind): void {
    this.paperSelect.value = kind;
  }
}
