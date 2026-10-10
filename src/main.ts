import './styles/theme.css';
import './styles/main.css';

import { applyTranslations } from './i18n';
import { InputController } from './engine/input';
import { LayerStack } from './engine/layers';
import { Paper, type PaperKind } from './engine/paper';
import { Renderer } from './engine/renderer';
import { EditorState } from './engine/state';
import { readCanvasTheme } from './engine/theme';
import { Viewport, type Padding } from './engine/viewport';
import { PerspectiveScene, type PerspectiveMode } from './perspective/scene';
import { HandTool } from './tools/hand';
import type { Tool } from './tools/tool';
import { VanishingPointTool } from './tools/vanishing-point';
import { PerspectivePanel } from './ui/perspective-panel';
import { Toolbar, type ViewAction } from './ui/toolbar';

const ZOOM_STEP = 1.25;
const FIT_MARGIN = 32;

applyTranslations();

const stage = document.getElementById('stage')!;
const toolbarEl = document.querySelector<HTMLElement>('.toolbar')!;
const panelEl = document.getElementById('perspective-panel')!;
stage.tabIndex = 0;

const viewport = new Viewport();
const layers = new LayerStack(stage);
const paper = new Paper('a4', { width: 0, height: 0 });
const scene = new PerspectiveScene();
const state = new EditorState();
const renderer = new Renderer(layers, viewport, paper, scene, state, readCanvasTheme());
const input = new InputController(stage, viewport);

const tools: Record<string, Tool> = {
  point: new VanishingPointTool(viewport, scene, state, () => input.updateCursor()),
  hand: new HandTool(viewport, () => input.updateCursor()),
};

const toolbar = new Toolbar(toolbarEl, {
  onTool: selectTool,
  onViewAction: runViewAction,
  onPaperChange: changePaper,
});

const panel = new PerspectivePanel(panelEl, {
  onModeChange: changeMode,
  onHorizonFreeChange: (free) => scene.setHorizonLocked(!free),
  onRayCountChange: (count) => scene.setRayCount(count),
  onGuidesVisibleChange: setGuidesVisible,
  onDeletePoint: deleteSelectedPoint,
});

function selectTool(id: string): void {
  const tool = tools[id];
  if (!tool) return;
  input.setTool(tool);
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
  scene.setMode(mode, paper.rect, state.selectedPointId);
}

function deleteSelectedPoint(): void {
  if (!state.selectedPointId) return;
  scene.removePoint(state.selectedPointId);
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
  const panelRight = panelEl.getBoundingClientRect().right - stageRect.left;
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

function runViewAction(action: ViewAction): void {
  switch (action) {
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
}

viewport.onChange(() => {
  toolbar.setZoom(viewport.scale);
  renderer.requestRender();
});

scene.onChange(() => {
  if (state.selectedPointId && !scene.getPoint(state.selectedPointId)) {
    state.update({ selectedPointId: null, hoveredPointId: null, draggingPointId: null });
  }
  renderer.requestRender('guides', 'interaction');
  input.updateCursor();
  updatePanel();
});

state.onChange((changed) => {
  renderer.requestRender('guides', 'interaction');
  if (changed.has('selectedPointId') || changed.has('guidesVisible')) updatePanel();
});

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

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (isTextEntry(e.target)) return;

  switch (e.key) {
    case '+':
    case '=':
      runViewAction('zoom-in');
      break;
    case '-':
      runViewAction('zoom-out');
      break;
    case '0':
      runViewAction('zoom-fit');
      break;
    case '1':
      runViewAction('zoom-reset');
      break;
    case 'h':
    case 'H':
      selectTool('hand');
      break;
    case 'p':
    case 'P':
      selectTool('point');
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

paper.set('a4', viewport);
scene.reset(paper.rect);
selectTool('point');
layers.syncSize();
