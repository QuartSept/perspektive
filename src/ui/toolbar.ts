import {
  ORIENTATIONS,
  PAPER_KINDS,
  supportsOrientation,
  type Orientation,
  type PaperKind,
} from '../engine/paper';
import { formatPercent, getLanguage, isLang, t, type Lang, type MessageKey } from '../i18n';
import type { SaveStatus } from '../storage/autosave';

export type ViewAction = 'zoom-in' | 'zoom-out' | 'zoom-reset' | 'zoom-fit';
export type ToolbarAction =
  | ViewAction
  | 'undo'
  | 'redo'
  | 'clear'
  | 'export'
  | 'project'
  | 'print'
  | 'help';

export interface ToolbarHandlers {
  onTool(id: string): void;
  onAction(action: ToolbarAction): void;
  onPaperChange(kind: PaperKind): void;
  onOrientationChange(orientation: Orientation): void;
  onMagnetToggle(): void;
  onLanguageChange(lang: Lang): void;
}

/** index.html'deki araç çubuğu öğelerini olaylara bağlar. */
export class Toolbar {
  private readonly toolButtons: HTMLButtonElement[];
  private readonly zoomReadout: HTMLElement;
  private readonly paperSelect: HTMLSelectElement;
  private readonly orientationSelect: HTMLSelectElement;
  private readonly undoButton: HTMLButtonElement;
  private readonly redoButton: HTMLButtonElement;
  private readonly magnetButton: HTMLButtonElement;
  private readonly clearButton: HTMLButtonElement;
  private readonly saveStatus: HTMLElement;
  private readonly langSelect: HTMLSelectElement;
  private zoom = 1;
  private status: SaveStatus = 'idle';

  constructor(root: HTMLElement, handlers: ToolbarHandlers) {
    this.toolButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-tool]')];
    this.zoomReadout = root.querySelector('[data-action="zoom-reset"]')!;
    this.paperSelect = root.querySelector('#paper-select')!;
    this.orientationSelect = root.querySelector('#orientation-select')!;
    this.undoButton = root.querySelector('[data-action="undo"]')!;
    this.redoButton = root.querySelector('[data-action="redo"]')!;
    this.magnetButton = root.querySelector('#magnet-toggle')!;
    this.clearButton = root.querySelector('[data-action="clear"]')!;
    this.saveStatus = root.querySelector('#save-status')!;
    this.langSelect = root.querySelector('#lang-select')!;
    this.langSelect.value = getLanguage();
    this.langSelect.addEventListener('change', () => {
      if (isLang(this.langSelect.value)) handlers.onLanguageChange(this.langSelect.value);
      // Odak seçimde kalırsa tuval kısayolları çalışmaz
      this.langSelect.blur();
    });
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
    this.orientationSelect.addEventListener('change', () => {
      const value = this.orientationSelect.value as Orientation;
      if (ORIENTATIONS.includes(value)) handlers.onOrientationChange(value);
      this.orientationSelect.blur();
    });
  }

  setActiveTool(id: string): void {
    for (const btn of this.toolButtons) {
      btn.setAttribute('aria-pressed', String(btn.dataset.tool === id));
    }
  }

  setZoom(scale: number): void {
    this.zoom = scale;
    // TR: "%100", EN: "100%"
    const text = formatPercent(scale);
    if (this.zoomReadout.textContent !== text) this.zoomReadout.textContent = text;
  }

  /** Dil değişince dinamik metinleri yeniler. */
  refreshLanguage(): void {
    this.langSelect.value = getLanguage();
    this.setZoom(this.zoom);
    this.setSaveStatus(this.status);
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
    this.status = status;
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

  setPaper(kind: PaperKind, orientation: Orientation): void {
    this.paperSelect.value = kind;
    this.orientationSelect.value = orientation;
    // Kare simetrik, ekran boyu pencere şeklini izler: seçim anlamsız
    this.orientationSelect.disabled = !supportsOrientation(kind);
  }
}
