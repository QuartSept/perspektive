import { t } from '../i18n';
import { GRID_PLANES, GRID_SIZES, type GridPlane } from '../perspective/grid';

export interface GridDialogHandlers {
  /** Izgarayı ekler; kurgu yetersizse false. */
  onAdd(plane: GridPlane, cells: number): boolean;
}

/** Perspektif ızgarası ekleme: düzlem (zemin / sol duvar / sağ duvar) ve hücre sayısı. */
export class GridDialog {
  private readonly dialog: HTMLDialogElement;
  private readonly sizeSelect: HTMLSelectElement;
  private readonly error: HTMLElement;

  constructor(private readonly handlers: GridDialogHandlers) {
    this.dialog = document.getElementById('grid-dialog') as HTMLDialogElement;
    this.sizeSelect = this.dialog.querySelector('#grid-size')!;
    this.error = this.dialog.querySelector('#grid-error')!;
    this.sizeSelect.replaceChildren(
      ...GRID_SIZES.map((n) => {
        const o = document.createElement('option');
        o.value = String(n);
        o.textContent = String(n);
        return o;
      }),
    );
    this.sizeSelect.value = '6';
    this.dialog.querySelector('#grid-cancel')!.addEventListener('click', () => this.dialog.close());
    this.dialog.addEventListener('click', (e) => {
      if (e.target === this.dialog) this.dialog.close();
    });
    this.dialog.querySelector('form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      const plane = this.dialog.querySelector<HTMLInputElement>('input[name="grid-plane"]:checked')!
        .value as GridPlane;
      if (!GRID_PLANES.includes(plane)) return;
      if (this.handlers.onAdd(plane, Number(this.sizeSelect.value))) {
        this.dialog.close();
      } else {
        this.error.textContent = t('grid.needPoints');
        this.error.hidden = false;
      }
    });
  }

  open(): void {
    this.error.hidden = true;
    this.dialog.showModal();
  }
}
