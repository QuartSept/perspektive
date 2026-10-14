import type { Layer } from '../engine/doc-layers';
import { formatPercent, t } from '../i18n';

export interface LayersPanelHandlers {
  onSelect(id: string): void;
  onToggleVisible(id: string): void;
  onToggleLocked(id: string): void;
  onRename(id: string, name: string): void;
  onAdd(): void;
  onDuplicate(): void;
  onMoveUp(): void;
  onMoveDown(): void;
  onMergeDown(): void;
  onDelete(): void;
  /** Opaklık kaydırıcısı: `final` sürüklemenin bittiğini bildirir (tek geri al adımı). */
  onOpacity(value: number, final: boolean): void;
  onToggleReference(): void;
}

export interface LayersPanelView {
  layers: readonly Layer[];
  activeId: string;
  canAdd: boolean;
  /** Referans görsel yüklüyse en altta özel satır. */
  reference: { loaded: boolean; visible: boolean };
}

const EYE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/></svg>';
const EYE_OFF =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4l16 16M9.5 6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.6 3.4M6.3 7.6A16 16 0 0 0 2.5 12S6 18.5 12 18.5c1.4 0 2.6-.3 3.7-.8"/></svg>';
const LOCK =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="10.5" width="13" height="9" rx="1.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>';
const UNLOCK =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="10.5" width="13" height="9" rx="1.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 6.8-1.2"/></svg>';

/** Katmanın görünen adı: boşsa sıra numarasıyla varsayılan ad. */
export function layerDisplayName(layer: Layer, index: number): string {
  return layer.name.trim() || t('layers.defaultName', { n: index + 1 });
}

/**
 * Katman paneli: liste (en üstteki katman başta), göz / kilit, ad (tıkla:
 * etkin, çift tıkla: yeniden adlandır), alt düğmeler ve etkin katmanın
 * opaklığı. Sürükle-bırak yerine yukarı / aşağı düğmeleri: dokunmatikte ve
 * klavyede de çalışır.
 */
export class LayersPanel {
  private readonly title: HTMLElement;
  private readonly list: HTMLElement;
  private readonly opacity: HTMLInputElement;
  private readonly opacityValue: HTMLOutputElement;
  private readonly buttons: Record<string, HTMLButtonElement>;
  private view: LayersPanelView | null = null;
  /** Yeniden adlandırılan katman (o satır giriş alanı gösterir). */
  private renaming: string | null = null;

  constructor(
    root: HTMLElement,
    private readonly handlers: LayersPanelHandlers,
  ) {
    this.title = root.querySelector('#layers-title')!;
    this.list = root.querySelector('#layers-list')!;
    this.opacity = root.querySelector('#layer-opacity')!;
    this.opacityValue = root.querySelector('#layer-opacity-value')!;
    this.buttons = {};
    for (const btn of root.querySelectorAll<HTMLButtonElement>('[data-layer-action]')) {
      this.buttons[btn.dataset.layerAction!] = btn;
    }
    const actions: Record<string, () => void> = {
      add: handlers.onAdd,
      duplicate: handlers.onDuplicate,
      up: handlers.onMoveUp,
      down: handlers.onMoveDown,
      merge: handlers.onMergeDown,
      delete: handlers.onDelete,
    };
    for (const [key, btn] of Object.entries(this.buttons)) {
      btn.addEventListener('click', () => actions[key]?.());
    }

    this.opacity.min = '0';
    this.opacity.max = '100';
    this.opacity.step = '5';
    this.opacity.addEventListener('input', () => handlers.onOpacity(Number(this.opacity.value) / 100, false));
    this.opacity.addEventListener('change', () => handlers.onOpacity(Number(this.opacity.value) / 100, true));

    this.list.addEventListener('click', (e) => this.onListClick(e));
    this.list.addEventListener('dblclick', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('[data-layer-id]');
      if (row && (e.target as HTMLElement).closest('.layer-row__name')) this.startRename(row.dataset.layerId!);
    });
    this.list.addEventListener('keydown', (e) => this.onListKey(e));
  }

  update(view: LayersPanelView): void {
    this.view = view;
    const { layers, activeId } = view;
    this.title.textContent = t('layers.titleCount', { n: layers.length });
    const active = layers.find((l) => l.id === activeId);
    const index = layers.findIndex((l) => l.id === activeId);

    this.buttons.add.disabled = !view.canAdd;
    this.buttons.duplicate.disabled = !view.canAdd;
    this.buttons.up.disabled = index >= layers.length - 1;
    this.buttons.down.disabled = index <= 0;
    this.buttons.merge.disabled = index <= 0;
    this.buttons.delete.disabled = layers.length <= 1;

    const pct = String(Math.round((active?.opacity ?? 1) * 100));
    if (this.opacity.value !== pct) this.opacity.value = pct;
    this.opacityValue.textContent = formatPercent(active?.opacity ?? 1);

    this.renderList();
  }

  private renderList(): void {
    const view = this.view!;
    const rows: HTMLElement[] = [];
    // En üstteki katman listenin başında
    for (let i = view.layers.length - 1; i >= 0; i--) rows.push(this.row(view.layers[i], i));
    if (view.reference.loaded) rows.push(this.referenceRow(view.reference.visible));
    const focused = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-layer-id]')
      ?.dataset.layerId;
    this.list.replaceChildren(...rows);
    if (focused) this.list.querySelector<HTMLElement>(`[data-layer-id="${focused}"] .layer-row__name`)?.focus();
    const input = this.list.querySelector<HTMLInputElement>('.layer-row__input');
    if (input) {
      input.focus();
      input.select();
    }
  }

  private row(layer: Layer, index: number): HTMLElement {
    const active = layer.id === this.view!.activeId;
    const name = layerDisplayName(layer, index);
    const row = document.createElement('li');
    row.className = 'layer-row';
    row.dataset.layerId = layer.id;
    row.classList.toggle('is-active', active);
    row.classList.toggle('is-hidden', !layer.visible);

    const eye = iconButton(layer.visible ? EYE : EYE_OFF, 'visible', t(layer.visible ? 'layers.hide' : 'layers.show', { name }));
    eye.setAttribute('aria-pressed', String(!layer.visible));
    const lock = iconButton(layer.locked ? LOCK : UNLOCK, 'lock', t(layer.locked ? 'layers.unlock' : 'layers.lock', { name }));
    lock.setAttribute('aria-pressed', String(layer.locked));
    lock.classList.toggle('is-on', layer.locked);

    let label: HTMLElement;
    if (this.renaming === layer.id) {
      const input = document.createElement('input');
      input.className = 'layer-row__input';
      input.value = layer.name || name;
      input.maxLength = 80;
      input.setAttribute('aria-label', t('layers.rename'));
      const finish = (commit: boolean) => {
        if (this.renaming !== layer.id) return;
        this.renaming = null;
        if (commit && input.value.trim() !== name) this.handlers.onRename(layer.id, input.value.trim());
        else this.renderList();
      };
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(true);
        else if (e.key === 'Escape') finish(false);
      });
      input.addEventListener('blur', () => finish(true));
      label = input;
    } else {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'layer-row__name';
      btn.textContent = name;
      btn.title = t('layers.nameHint');
      btn.setAttribute('aria-pressed', String(active));
      label = btn;
    }
    row.append(eye, lock, label);
    return row;
  }

  private referenceRow(visible: boolean): HTMLElement {
    const row = document.createElement('li');
    row.className = 'layer-row layer-row--reference';
    row.classList.toggle('is-hidden', !visible);
    const eye = iconButton(visible ? EYE : EYE_OFF, 'reference', t(visible ? 'layers.hideReference' : 'layers.showReference'));
    eye.setAttribute('aria-pressed', String(!visible));
    const name = document.createElement('span');
    name.className = 'layer-row__name layer-row__name--static';
    name.textContent = t('reference.title');
    row.append(eye, name);
    return row;
  }

  private onListClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLButtonElement>('button');
    if (!btn) return;
    if (btn.dataset.role === 'reference') {
      this.handlers.onToggleReference();
      return;
    }
    const id = btn.closest<HTMLElement>('[data-layer-id]')?.dataset.layerId;
    if (!id) return;
    if (btn.dataset.role === 'visible') this.handlers.onToggleVisible(id);
    else if (btn.dataset.role === 'lock') this.handlers.onToggleLocked(id);
    else if (btn.classList.contains('layer-row__name')) this.handlers.onSelect(id);
  }

  /** Ad düğmesinde F2: yeniden adlandır; yukarı / aşağı ok: komşu katmana geç. */
  private onListKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (!target.classList.contains('layer-row__name')) return;
    const id = target.closest<HTMLElement>('[data-layer-id]')?.dataset.layerId;
    if (!id || !this.view) return;
    if (e.key === 'F2') {
      e.preventDefault();
      this.startRename(id);
      return;
    }
    const delta = { ArrowUp: 1, ArrowDown: -1 }[e.key];
    if (!delta) return;
    e.preventDefault();
    const layers = this.view.layers;
    const next = layers[layers.findIndex((l) => l.id === id) + delta];
    if (next) {
      this.handlers.onSelect(next.id);
      this.list.querySelector<HTMLElement>(`[data-layer-id="${next.id}"] .layer-row__name`)?.focus();
    }
  }

  private startRename(id: string): void {
    this.renaming = id;
    this.renderList();
  }
}

function iconButton(svg: string, role: string, label: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'layer-row__icon';
  btn.dataset.role = role;
  btn.innerHTML = svg;
  btn.title = label;
  btn.setAttribute('aria-label', label);
  return btn;
}
