import './styles/theme.css';
import './styles/main.css';

import { applyTranslations } from './i18n';
import { InputController } from './engine/input';
import { LayerStack } from './engine/layers';
import { Paper, type PaperKind } from './engine/paper';
import { Renderer } from './engine/renderer';
import { readCanvasTheme } from './engine/theme';
import { Viewport, type Padding } from './engine/viewport';
import { HandTool } from './tools/hand';
import type { Tool } from './tools/tool';
import { Toolbar, type ViewAction } from './ui/toolbar';

const ZOOM_STEP = 1.25;
const FIT_MARGIN = 32;

applyTranslations();

const stage = document.getElementById('stage')!;
const toolbarEl = document.querySelector<HTMLElement>('.toolbar')!;
stage.tabIndex = 0;

const viewport = new Viewport();
const layers = new LayerStack(stage);
const paper = new Paper('a4', { width: 0, height: 0 });
const renderer = new Renderer(layers, viewport, paper, readCanvasTheme());
const input = new InputController(stage, viewport);

const tools: Record<string, Tool> = {
  hand: new HandTool(viewport, () => input.updateCursor()),
};

const toolbar = new Toolbar(toolbarEl, {
  onTool: selectTool,
  onViewAction: runViewAction,
  onPaperChange: changePaper,
});

function selectTool(id: string): void {
  const tool = tools[id];
  if (!tool) return;
  input.setTool(tool);
  toolbar.setActiveTool(id);
}

/** Araç çubuğunun altında kalan alan. */
function fitPadding(): Padding {
  const stageTop = stage.getBoundingClientRect().top;
  const toolbarBottom = toolbarEl.getBoundingClientRect().bottom - stageTop;
  return {
    top: toolbarBottom + FIT_MARGIN,
    right: FIT_MARGIN,
    bottom: FIT_MARGIN,
    left: FIT_MARGIN,
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

let initialized = false;
layers.onResize((width, height) => {
  viewport.resize(width, height);
  if (!initialized) {
    initialized = true;
    fitToPaper();
  }
  renderer.requestRender();
});

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const target = e.target as HTMLElement | null;
  if (target?.closest('input, select, textarea, [contenteditable="true"]')) return;

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
    default:
      return;
  }
  e.preventDefault();
});

selectTool('hand');
layers.syncSize();
