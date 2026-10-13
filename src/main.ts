import './styles/theme.css';
import './styles/main.css';

import { applyTranslations, onLanguageChange, setLanguage, t, type MessageKey } from './i18n';
import { ThemeController } from './ui/theme';
import { ReplaceStrokesCommand } from './engine/commands';
import { DrawingDocument } from './engine/document';
import { OrientationCommand } from './engine/orientation';
import { History } from './engine/history';
import { InputController } from './engine/input';
import { LayerStack } from './engine/layers';
import { renderPage } from './engine/page-render';
import { ReferenceImage } from './engine/reference';
import { Paper, type Orientation, type PaperKind } from './engine/paper';
import { Renderer } from './engine/renderer';
import { EditorState } from './engine/state';
import { gridSource, PaperGrid } from './engine/grid';
import { readCanvasTheme } from './engine/theme';
import { Viewport, type Padding } from './engine/viewport';
import { editScene } from './perspective/commands';
import { PerspectiveScene, type PerspectiveMode } from './perspective/scene';
import { combineSources, perspectiveSource } from './perspective/snapping';
import { buildTemplate, type TemplateId } from './perspective/templates';
import { buildGrid } from './perspective/grid';
import { SnapSettings } from './perspective/snap-settings';
import { BrushTool } from './tools/brush';
import { BrushSettings } from './tools/brush-settings';
import { EraserSettings, EraserTool } from './tools/eraser';
import { EraserPanel } from './ui/eraser-panel';
import { HandTool } from './tools/hand';
import { Autosave } from './storage/autosave';
import {
  applySavedDrawing,
  buildSavedDrawing,
  LoadDrawingCommand,
  parseProject,
  serializeProject,
} from './storage/project';
import { TemplatesDialog } from './ui/templates-dialog';
import { ConfirmDialog } from './ui/confirm-dialog';
import { GridDialog } from './ui/grid-dialog';
import { PaperGridPanel } from './ui/paper-grid-panel';
import { ReferencePanel } from './ui/reference-panel';
import { ReferenceStore } from './storage/reference-store';
import { loadPrefs, savePrefs, type PrefsTargets } from './storage/prefs';
import type { Tool } from './tools/tool';
import { VanishingPointTool } from './tools/vanishing-point';
import { BrushPanel } from './ui/brush-panel';
import {
  defaultPrintScale,
  downloadBlob,
  downloadPng,
  downloadSvg,
  PrintView,
  timestamp,
} from './ui/output';
import { OutputDialog, type OutputMode } from './ui/output-dialog';
import { PerspectivePanel } from './ui/perspective-panel';
import { Toolbar, type ToolbarAction } from './ui/toolbar';

const ZOOM_STEP = 1.25;
const FIT_MARGIN = 32;

// Tema, canvas renkleri okunmadan önce uygulanmalı
const themeController = new ThemeController();
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
const paperGrid = new PaperGrid();
const input = new InputController(stage, viewport);

const gridLineSource = gridSource(paperGrid);
const brush = new BrushTool(
  viewport,
  doc,
  history,
  brushSettings,
  // Aday kaynakları: sonraki aşamalarda şekil köşe çizgileri eklenir. Perspektif
  // kapalıyken ızgara yalnızca düz çizgilere uygulanır; serbest çizim kilitlenmez.
  combineSources(perspectiveSource(scene), (start, near) =>
    scene.mode === 0 ? [] : gridLineSource(start, near),
  ),
  {
    isActive: () => snapSettings.enabled && !state.temporaryFree,
    get radius() {
      return snapSettings.radius;
    },
  },
  {
    isActive: () => scene.mode === 0 && brushSettings.straightLines,
    axisSnap: () => brushSettings.axisSnap && !state.temporaryFree,
  },
  {
    isActive: () => paperGrid.snap && !state.temporaryFree,
    get spacing() {
      return paperGrid.spacing;
    },
  },
  () => renderer.requestRender('interaction'),
);
const eraserSettings = new EraserSettings();
const eraser = new EraserTool(viewport, doc, history, eraserSettings, (strokesChanged) => {
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
  onOrientationChange: changeOrientation,
  onMagnetToggle: () => snapSettings.setEnabled(!snapSettings.enabled),
  onLanguageChange: setLanguage,
});

const eraserPanel = new EraserPanel(document.getElementById('eraser-panel')!, eraserSettings);
const brushPanel = new BrushPanel(document.getElementById('brush-panel')!, brushSettings, snapSettings);

const panel = new PerspectivePanel(panelEl, {
  onStraightLinesChange: (enabled) => brushSettings.setStraightLines(enabled),
  onAxisSnapChange: (enabled) => brushSettings.setAxisSnap(enabled),
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
  eraserPanel.setVisible(tool === eraser);
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

// Tema değişince renderer.theme yenilenir; çıktılar her zaman güncelini alsın
const pageSources = {
  paper,
  doc,
  scene,
  grid: paperGrid,
  get theme() {
    return renderer.theme;
  },
};
const printView = new PrintView(pageSources);
const outputDialog = new OutputDialog({
  onExport: async (format, includeGuides) => {
    if (format === 'svg') downloadSvg(pageSources, { includeGuides });
    else await downloadPng(pageSources, { includeGuides });
  },
  onPrint: (includeGuides, scale) => printView.print({ includeGuides, scale }),
});

const helpDialog = document.getElementById('help-dialog') as HTMLDialogElement;
helpDialog.addEventListener('click', (e) => {
  if (e.target === helpDialog) helpDialog.close();
});

function openHelp(): void {
  if (!helpDialog.open) helpDialog.showModal();
}

/** Açık bir modal diyalog varken tuval kısayolları devre dışı. */
function dialogOpen(): boolean {
  return document.querySelector('dialog[open]') !== null;
}

// ---------- Onay ----------

const confirmDialog = new ConfirmDialog();

/** Mevcut çizimin yerine geçecek işlemler için onay (boş tuvalde sorulmaz). */
async function confirmReplace(message: string): Promise<boolean> {
  if (doc.strokes.length === 0) return true;
  return confirmDialog.ask({ message, confirmLabel: t('confirm.continue') });
}

// ---------- Proje dosyası ----------

const projectDialog = document.getElementById('project-dialog') as HTMLDialogElement;
const projectError = document.getElementById('project-error')!;
const projectFile = document.getElementById('project-file') as HTMLInputElement;
const drawingSources = { doc, scene, paper, grid: paperGrid };

projectDialog.addEventListener('click', (e) => {
  if (e.target === projectDialog) projectDialog.close();
});
document.getElementById('project-close')!.addEventListener('click', () => projectDialog.close());
document.getElementById('project-save')!.addEventListener('click', () => {
  const blob = new Blob([serializeProject(drawingSources)], { type: 'application/json' });
  downloadBlob(blob, `perspektif-${timestamp()}.json`);
  projectDialog.close();
});
document.getElementById('project-open')!.addEventListener('click', () => projectFile.click());
projectFile.addEventListener('change', () => {
  const file = projectFile.files?.[0];
  projectFile.value = '';
  if (file) void openProjectFile(file);
});

function openProject(): void {
  if (input.busy) return;
  projectError.hidden = true;
  if (!projectDialog.open) projectDialog.showModal();
}

/** Proje dosyasını açar; mevcut çizim varsa onay ister. Tek adımda geri alınır. */
async function openProjectFile(file: File): Promise<void> {
  const saved = parseProject(await file.text());
  if (!saved) {
    projectError.textContent = t('project.invalid');
    projectError.hidden = false;
    if (!projectDialog.open) projectDialog.showModal();
    return;
  }
  if (!(await confirmReplace(t('project.replaceConfirm')))) return;
  history.execute(new LoadDrawingCommand(drawingSources, saved, onPaperChanged));
  if (projectDialog.open) projectDialog.close();
}

// ---------- Şablonlar ----------

/** Şablonun kâğıt/kurgu/çizimi (o anki kâğıt boyutu ve yönüyle). */
function templateDrawing(id: TemplateId) {
  const tpl = buildTemplate(id, paper);
  return {
    ...buildSavedDrawing(drawingSources),
    scene: {
      mode: tpl.mode,
      horizonLocked: true,
      horizonAngle: 0,
      rayCount: scene.rayCount,
      points: tpl.points,
    },
    strokes: tpl.strokes,
  };
}

const templatesDialog = new TemplatesDialog({
  async onPick(id) {
    if (!(await confirmReplace(t('templates.replaceConfirm')))) return;
    history.execute(new LoadDrawingCommand(drawingSources, templateDrawing(id), onPaperChanged));
  },
  renderPreview(id, maxSizePx) {
    const saved = templateDrawing(id);
    const p = new Paper(paper.kind, paper);
    p.restore(paper.kind, paper.width, paper.height, paper.orientation);
    const s = new PerspectiveScene();
    s.restore(saved.scene);
    s.setRayCount(16);
    const d = new DrawingDocument();
    d.replaceAll(saved.strokes);
    // Küçük önizlemede açık gri kılavuz çizgileri görünsün diye koyulaştır
    const base = renderer.theme;
    const theme = {
      ...base,
      printInks: { ...base.printInks, 'gray-light': base.printInks['gray-dark'] },
    };
    return renderPage(
      { paper: p, doc: d, scene: s, theme },
      { pixelsPerUnit: maxSizePx / Math.max(p.width, p.height), includeGuides: true },
    );
  },
});

function openTemplates(): void {
  if (input.busy || dialogOpen()) return;
  templatesDialog.open();
}

// ---------- İlk kullanım ipucu ----------

const onboardingEl = document.getElementById('onboarding')!;
let onboardingDismissed = false;

/** Boş tuvalde, kapatılmadıysa görünür. */
function syncOnboarding(): void {
  onboardingEl.hidden = onboardingDismissed || doc.strokes.length > 0;
}

function setOnboardingDismissed(dismissed: boolean): void {
  onboardingDismissed = dismissed;
  syncOnboarding();
}

document.getElementById('onboarding-templates')!.addEventListener('click', openTemplates);
document.getElementById('onboarding-help')!.addEventListener('click', () => openHelp());
document.getElementById('onboarding-close')!.addEventListener('click', () => {
  setOnboardingDismissed(true);
  schedulePrefsSave();
});

// ---------- Perspektif ızgarası ----------

const gridDialog = new GridDialog({
  onAdd(plane, cells) {
    const strokes = buildGrid(scene, plane, cells, paper);
    if (!strokes) return false;
    const start = doc.strokes.length;
    history.execute(
      new ReplaceStrokesCommand(
        doc,
        [],
        strokes.map((stroke, i) => ({ index: start + i, stroke })),
      ),
    );
    return true;
  },
});
document.getElementById('open-grid')!.addEventListener('click', () => {
  if (!input.busy && !dialogOpen()) gridDialog.open();
});

// ---------- Referans görsel ----------

const reference = new ReferenceImage();
renderer.reference = reference;
renderer.grid = paperGrid;
reference.onChange(() => renderer.requestRender('paper'));
const referenceStore = new ReferenceStore(reference);

async function loadReferenceFile(file: File): Promise<void> {
  try {
    await reference.load(file);
    referencePanel.showError(false);
  } catch {
    referencePanel.showError(true);
  }
}

const referencePanel = new ReferencePanel(document.getElementById('reference-panel')!, reference, {
  onFile: loadReferenceFile,
});

// Dosyayı tuvale sürükleyip bırakarak açma: görsel → referans, diğerleri → proje dosyası
window.addEventListener('dragover', (e) => {
  if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
});
window.addEventListener('drop', (e) => {
  const file = e.dataTransfer?.files[0];
  if (!file) return;
  e.preventDefault();
  if (input.busy) return;
  if (file.type.startsWith('image/')) void loadReferenceFile(file);
  else void openProjectFile(file);
});

function openOutput(mode: OutputMode): void {
  if (input.busy) return;
  outputDialog.open(mode, defaultPrintScale(paper.kind));
}

/** Tüm stroke'ları siler (geri alınabilir); kaçış noktaları korunur. */
async function clearDrawing(): Promise<void> {
  if (input.busy || doc.strokes.length === 0 || dialogOpen()) return;
  const ok = await confirmDialog.ask({
    message: t('document.clearConfirm'),
    confirmLabel: t('confirm.clear'),
    destructive: true,
  });
  // Onay beklenirken durum değişmiş olabilir
  if (!ok || input.busy || doc.strokes.length === 0) return;
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
    straightLines: brushSettings.straightLines,
    axisSnap: brushSettings.axisSnap,
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
      void clearDrawing();
      break;
    case 'export':
      openOutput('export');
      break;
    case 'project':
      openProject();
      break;
    case 'templates':
      openTemplates();
      break;
    case 'print':
      openOutput('print');
      break;
    case 'help':
      openHelp();
      break;
    case 'theme':
      themeController.cycle();
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
  toolbar.setPaper(paper.kind, paper.orientation);
  fitToPaper();
  renderer.requestRender();
  autosave.markDirty();
}

/**
 * Dikey ↔ yatay. Çizim başlamamışsa yalnızca kâğıt döner, kaçış noktaları
 * yerinde kalır (kullanıcı isterse kendisi taşır). Çizim varsa stroke'lar ve
 * kaçış noktaları kâğıtla birlikte 90° döner; tek adımda geri alınır.
 */
function changeOrientation(orientation: Orientation): void {
  if (orientation === paper.orientation || input.busy) {
    toolbar.setPaper(paper.kind, paper.orientation);
    return;
  }
  if (doc.strokes.length > 0) {
    history.execute(new OrientationCommand(paper, doc, scene, orientation, onPaperChanged));
  } else {
    paper.setOrientation(orientation);
    onPaperChanged();
  }
}

function onPaperChanged(): void {
  toolbar.setPaper(paper.kind, paper.orientation);
  fitToPaper();
  renderer.requestRender();
  autosave.markDirty();
}

viewport.onChange(() => {
  toolbar.setZoom(viewport.scale);
  renderer.requestRender();
});

const autosave = new Autosave(drawingSources, (status) => toolbar.setSaveStatus(status));

new PaperGridPanel(document.getElementById('paper-grid-panel')!, paperGrid);
// Izgara ayarı çizimle birlikte kaydedilir (geri al geçmişine girmez)
paperGrid.onChange(() => {
  renderer.requestRender('paper');
  autosave.markDirty();
});

const prefsTargets: PrefsTargets = {
  brush: brushSettings,
  snap: snapSettings,
  eraser: eraserSettings,
  theme: themeController,
  getGuidesVisible: () => state.guidesVisible,
  setGuidesVisible,
  getOnboardingDismissed: () => onboardingDismissed,
  setOnboardingDismissed,
};
let prefsTimer = 0;
function schedulePrefsSave(): void {
  window.clearTimeout(prefsTimer);
  prefsTimer = window.setTimeout(() => savePrefs(prefsTargets), 300);
}
brushSettings.onChange(schedulePrefsSave);
brushSettings.onChange(updatePanel);
onLanguageChange(() => {
  toolbar.refreshLanguage();
  brushPanel.update();
  eraserPanel.update();
  referencePanel.update();
  syncThemeButton();
  updatePanel();
  schedulePrefsSave();
});
snapSettings.onChange(schedulePrefsSave);

const themeButton = document.getElementById('theme-toggle')!;
function syncThemeButton(): void {
  const label = t('theme.button', { mode: t(`theme.${themeController.preference}` as MessageKey) });
  themeButton.title = label;
  themeButton.setAttribute('aria-label', label);
}
themeController.onChange(() => {
  renderer.theme = readCanvasTheme();
  renderer.requestRender();
  syncThemeButton();
  schedulePrefsSave();
});
syncThemeButton();
eraserSettings.onChange(() => {
  schedulePrefsSave();
  renderer.requestRender('interaction');
});

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
  syncOnboarding();
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
  if (e.code !== 'Space' || isTextEntry(e.target) || dialogOpen()) return;
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
  // Diyalog açıkken kısayollar kapalı (Esc diyaloğu kapatır)
  if (isTextEntry(e.target) || dialogOpen()) return;

  // `#` bazı klavyelerde AltGr (Ctrl+Alt) ile yazılır: değiştirici denetiminden önce
  if (e.key === '#' && !e.metaKey) {
    paperGrid.setVisible(!paperGrid.visible);
    e.preventDefault();
    return;
  }

  if ((e.ctrlKey || e.metaKey) && !e.altKey) {
    const key = e.key.toLowerCase();
    if (key === 's') void autosave.flush();
    else if (key === 'p') openOutput('print');
    else if (key === 'o') {
      if (!dialogOpen()) projectFile.click();
    }
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
      if (input.activeTool === eraser) eraserSettings.stepRadius(dir);
      else brushSettings.stepWidth(dir);
      break;
    }
    case 'e':
    case 'E':
      // Silgi zaten etkinse tür değiştirir (bütün çizgi ↔ kısmi)
      if (input.activeTool === eraser) {
        eraserSettings.setKind(eraserSettings.kind === 'stroke' ? 'pixel' : 'stroke');
      } else selectTool('eraser');
      break;
    case 'h':
    case 'H':
      selectTool('hand');
      break;
    case 'p':
    case 'P':
      selectTool('point');
      break;
    case '?':
      openHelp();
      break;
    case 't':
    case 'T':
      themeController.cycle();
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
      if (state.selectedPointId) deleteSelectedPoint();
      // Seçili nokta yoksa Delete çizimi temizler (onaylı); Backspace yanlışlıkla basılmaya açık, temizlemez
      else if (e.key === 'Delete' && doc.strokes.length > 0) void clearDrawing();
      else return;
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
    applySavedDrawing(drawingSources, saved);
    toolbar.setPaper(paper.kind, paper.orientation);
    history.clear();
    if (initialized) fitToPaper();
    renderer.requestRender();
  }
  syncOnboarding();
  autosave.start();
  await referenceStore.load();
  referenceStore.start();
}

selectTool('brush');
syncMagnetButton();
layers.syncSize();
void restore();
