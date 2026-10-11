import './styles/theme.css';
import './styles/main.css';

import { applyTranslations, t } from './i18n';
import { ReplaceStrokesCommand } from './engine/commands';
import { DrawingDocument } from './engine/document';
import { History } from './engine/history';
import { InputController } from './engine/input';
import { LayerStack } from './engine/layers';
import { Paper, type PaperKind } from './engine/paper';
import { Renderer } from './engine/renderer';
import { EditorState } from './engine/state';
import { readCanvasTheme } from './engine/theme';
import { Viewport, type Padding } from './engine/viewport';
import { editScene } from './perspective/commands';
import { PerspectiveScene, type PerspectiveMode } from './perspective/scene';
import { SnapSettings } from './perspective/snap-settings';
import { BrushTool } from './tools/brush';
import { BrushSettings } from './tools/brush-settings';
import { StrokeEraserTool } from './tools/eraser';
import { HandTool } from './tools/hand';
import { Autosave } from './storage/autosave';
import { loadPrefs, savePrefs, type PrefsTargets } from './storage/prefs';
import type { Tool } from './tools/tool';
import { VanishingPointTool } from './tools/vanishing-point';
import { BrushPanel } from './ui/brush-panel';
import { PerspectivePanel } from './ui/perspective-panel';
import { Toolbar, type ToolbarAction } from './ui/toolbar';

const ZOOM_STEP = 1.25;
const FIT_MARGIN = 32;

applyTranslations();

const stage = document.getElementById('stage')!;
const toolbarEl = document.querySelector<HTMLElement>('.toolbar')!;
const sidebarEl = document.getElementById('sidebar')!;
const panelEl = document.getElementById('perspective-panel')!;
stage.tabIndex = 0;

const viewport = new Viewport();
const layers = new LayerStack(stage);
const paper = new Paper('a4', { width: 0, height: 0 });
const scene = new PerspectiveScene();
const state = new EditorState();
const doc = new DrawingDocument();
const history = new History();
const brushSettings = new BrushSettings();
const snapSettings = new SnapSettings();
const input = new InputController(stage, viewport);

const brush = new BrushTool(
  viewport,
  doc,
  history,
  brushSettings,
  scene,
  {
    isActive: () => snapSettings.enabled && !state.temporaryFree,
    get radius() {
      return snapSettings.radius;
    },
  },
  () => renderer.requestRender('interaction'),
);
const eraser = new StrokeEraserTool(viewport, doc, history, (strokesChanged) => {
  if (strokesChanged) renderer.requestRender('drawing', 'interaction');
  else renderer.requestRender('interaction');
});
const tools: Record<string, Tool> = {
  brush,
  eraser,
  point: new VanishingPointTool(viewport, scene, state, history, () => input.updateCursor()),
  hand: new HandTool(viewport, () => input.updateCursor()),
};

const renderer = new Renderer(
  layers,
  viewport,
  paper,
  scene,
  state,
  doc,
  () => input.activeTool?.overlay,
  readCanvasTheme(),
);

const toolbar = new Toolbar(toolbarEl, {
  onTool: selectTool,
  onAction: runAction,
  onPaperChange: changePaper,
  onMagnetToggle: () => snapSettings.setEnabled(!snapSettings.enabled),
});

new BrushPanel(document.getElementById('brush-panel')!, brushSettings, snapSettings);

const panel = new PerspectivePanel(panelEl, {
  onModeChange: changeMode,
  onHorizonFreeChange: (free) => editScene(history, scene, () => scene.setHorizonLocked(!free)),
  onRayCountChange: (count) => scene.setRayCount(count),
  onGuidesVisibleChange: setGuidesVisible,
  onDeletePoint: deleteSelectedPoint,
});

function selectTool(id: string): void {
  const tool = tools[id];
  if (!tool || input.busy) return;
  input.setTool(tool);
  renderer.requestRender('drawing', 'interaction');
  toolbar.setActiveTool(id);
  syncMarkers();
  updatePanel();
}

/** İşaretçiler kılavuzlar açıkken ya da nokta aracı etkinken görünür. */
function syncMarkers(): void {
  state.update({ markersVisible: state.guidesVisible || input.activeTool === tools.point });
}

function setGuidesVisible(visible: boolean): void {
  state.update({ guidesVisible: visible });
  syncMarkers();
}

function changeMode(mode: PerspectiveMode): void {
  editScene(history, scene, () => scene.setMode(mode, paper.rect, state.selectedPointId));
}

function deleteSelectedPoint(): void {
  const id = state.selectedPointId;
  if (!id) return;
  editScene(history, scene, () => scene.removePoint(id));
}

/** Tüm stroke'ları siler (geri alınabilir); kaçış noktaları korunur. */
function clearDrawing(): void {
  if (input.busy || doc.strokes.length === 0) return;
  if (!window.confirm(t('document.clearConfirm'))) return;
  history.execute(new ReplaceStrokesCommand(doc, doc.strokes.map((s) => s.id), []));
}

function undo(): void {
  if (!input.busy) history.undo();
}

function redo(): void {
  if (!input.busy) history.redo();
}

function updatePanel(): void {
  panel.update({
    scene,
    guidesVisible: state.guidesVisible,
    hasSelection: state.selectedPointId !== null,
    pointToolActive: input.activeTool === tools.point,
  });
}

/** Araç çubuğu ve panelin kapatmadığı alan. */
function fitPadding(): Padding {
  const stageRect = stage.getBoundingClientRect();
  const toolbarBottom = toolbarEl.getBoundingClientRect().bottom - stageRect.top;
  const panelRight = sidebarEl.getBoundingClientRect().right - stageRect.left;
  return {
    top: toolbarBottom + FIT_MARGIN,
    right: FIT_MARGIN,
    bottom: FIT_MARGIN,
    left: Math.max(FIT_MARGIN, panelRight + FIT_MARGIN),
  };
}

function fitToPaper(): void {
  viewport.fitRect(paper.rect, fitPadding());
}

function runAction(action: ToolbarAction): void {
  switch (action) {
    case 'undo':
      undo();
      break;
    case 'redo':
      redo();
      break;
    case 'clear':
      clearDrawing();
      break;
    case 'zoom-in':
      viewport.zoomAt({ x: viewport.width / 2, y: viewport.height / 2 }, ZOOM_STEP);
      break;
    case 'zoom-out':
      viewport.zoomAt({ x: viewport.width / 2, y: viewport.height / 2 }, 1 / ZOOM_STEP);
      break;
    case 'zoom-reset':
      viewport.setScale(1);
      break;
    case 'zoom-fit':
      fitToPaper();
      break;
  }
}

function changePaper(kind: PaperKind): void {
  if (kind === 'screen') {
    const pad = fitPadding();
    paper.set(kind, {
      width: viewport.width - pad.left - pad.right,
      height: viewport.height - pad.top - pad.bottom,
    });
  } else {
    paper.set(kind, viewport);
  }
  toolbar.setPaper(kind);
  fitToPaper();
  renderer.requestRender();
  autosave.markDirty();
}

viewport.onChange(() => {
  toolbar.setZoom(viewport.scale);
  renderer.requestRender();
});

const autosave = new Autosave({ doc, scene, paper }, (status) => toolbar.setSaveStatus(status));

const prefsTargets: PrefsTargets = {
  brush: brushSettings,
  snap: snapSettings,
  getGuidesVisible: () => state.guidesVisible,
  setGuidesVisible,
};
let prefsTimer = 0;
function schedulePrefsSave(): void {
  window.clearTimeout(prefsTimer);
  prefsTimer = window.setTimeout(() => savePrefs(prefsTargets), 300);
}
brushSettings.onChange(schedulePrefsSave);
snapSettings.onChange(schedulePrefsSave);

scene.onChange(() => {
  autosave.markDirty();
  if (state.selectedPointId && !scene.getPoint(state.selectedPointId)) {
    state.update({ selectedPointId: null, hoveredPointId: null, draggingPointId: null });
  }
  renderer.requestRender('guides', 'interaction');
  input.updateCursor();
  updatePanel();
});

function syncMagnetButton(): void {
  toolbar.setMagnet(snapSettings.enabled, state.temporaryFree);
}

snapSettings.onChange(syncMagnetButton);

state.onChange((changed) => {
  if (changed.has('temporaryFree')) syncMagnetButton();
  if (changed.has('guidesVisible')) schedulePrefsSave();
  renderer.requestRender('guides', 'interaction');
  if (changed.has('selectedPointId') || changed.has('guidesVisible')) updatePanel();
});

doc.onChange(() => {
  renderer.requestRender('drawing');
  toolbar.setCanClear(doc.strokes.length > 0);
  autosave.markDirty();
});

history.onChange(() => toolbar.setHistory(history.canUndo, history.canRedo));

input.onHover((pointer) => state.update({ pointer }));

let initialized = false;
layers.onResize((width, height) => {
  viewport.resize(width, height);
  if (!initialized) {
    initialized = true;
    fitToPaper();
  }
  renderer.requestRender();
});

/** Kısayollar yalnızca metin yazılan alanlarda devre dışı (onay kutusu, kaydırıcı hariç). */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'range', 'button'].includes(target.type);
  }
  return false;
}

// Space basılı tutulunca geçici serbest mod. Odaktaki düğmenin Space ile
// tetiklenmesini de engeller.
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || isTextEntry(e.target)) return;
  e.preventDefault();
  state.update({ temporaryFree: true });
});
window.addEventListener('keyup', (e) => {
  if (e.code !== 'Space') return;
  if (!isTextEntry(e.target)) e.preventDefault();
  state.update({ temporaryFree: false });
});
window.addEventListener('blur', () => state.update({ temporaryFree: false }));

window.addEventListener('keydown', (e) => {
  if (isTextEntry(e.target)) return;

  if ((e.ctrlKey || e.metaKey) && !e.altKey) {
    const key = e.key.toLowerCase();
    if (key === 's') void autosave.flush();
    else if (key === 'z' && !e.shiftKey) undo();
    else if ((key === 'z' && e.shiftKey) || key === 'y') redo();
    else return;
    e.preventDefault();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  switch (e.key) {
    case '+':
    case '=':
      runAction('zoom-in');
      break;
    case '-':
      runAction('zoom-out');
      break;
    case '0':
      runAction('zoom-fit');
      break;
    case '1':
      runAction('zoom-reset');
      break;
    case 'b':
    case 'B':
      selectTool('brush');
      break;
    case '[':
    case ']': {
      // Etkin aracın boyutu: silgide yarıçap, diğerlerinde fırça kalınlığı
      const dir = e.key === ']' ? 1 : -1;
      if (input.activeTool === eraser) eraser.stepRadius(dir);
      else brushSettings.stepWidth(dir);
      break;
    }
    case 'e':
    case 'E':
      selectTool('eraser');
      break;
    case 'h':
    case 'H':
      selectTool('hand');
      break;
    case 'p':
    case 'P':
      selectTool('point');
      break;
    case 'm':
    case 'M':
      snapSettings.setEnabled(!snapSettings.enabled);
      break;
    case 'g':
    case 'G':
      setGuidesVisible(!state.guidesVisible);
      break;
    case 'Delete':
    case 'Backspace':
      if (!state.selectedPointId) return;
      deleteSelectedPoint();
      break;
    case 'Escape':
      state.update({ selectedPointId: null });
      break;
    default:
      return;
  }
  e.preventDefault();
});

async function restore(): Promise<void> {
  paper.set('a4', viewport);
  scene.reset(paper.rect);
  loadPrefs(prefsTargets);

  const saved = await autosave.load();
  if (saved) {
    paper.restore(saved.paper.kind, saved.paper.width, saved.paper.height);
    toolbar.setPaper(paper.kind);
    scene.restore(saved.scene);
    scene.setRayCount(saved.scene.rayCount);
    doc.replaceAll(saved.strokes);
    history.clear();
    if (initialized) fitToPaper();
    renderer.requestRender();
  }
  autosave.start();
}

selectTool('brush');
syncMagnetButton();
layers.syncSize();
void restore();
