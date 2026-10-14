import { createLayer, MAX_LAYERS, type Layer } from '../engine/doc-layers';
import { ORIENTATIONS, PAPER_KINDS, type Orientation, type PaperKind } from '../engine/paper';
import { edgeCount, SHAPE_KINDS, vertexCountRange, type Shape, type ShapeKind } from '../engine/shapes';
import { INK_IDS, type InkId, type Stroke, type StrokeStyle } from '../engine/stroke';
import {
  CORNER_TARGETS,
  DEFAULT_CORNER_LINES,
  type CornerTarget,
  type SavedCornerLines,
} from '../perspective/corner-lines';
import {
  normalizeLineAngle,
  PERSPECTIVE_MODES,
  type PerspectiveMode,
  type VanishingPoint,
} from '../perspective/scene';

/** Şu anki kayıt biçimi sürümü. */
export const SAVE_VERSION = 3;

/** v2 → v3: eski kayıtların tek katmanı bu kimlikle oluşturulur. */
export const LEGACY_LAYER_ID = 'layer-1';

export const GRID_SPACINGS_MM = [5, 10, 20] as const;
export type GridSpacingMm = (typeof GRID_SPACINGS_MM)[number];

/** Kâğıt ızgarası / görünmez cetvel ayarı (çizim verisi değil, kurgunun parçası). */
export interface SavedGrid {
  visible: boolean;
  snap: boolean;
  spacingMm: GridSpacingMm;
  /** Kâğıt merkezi kılavuzu (sonradan eklendi; yoksa kapalı). */
  centerMark: boolean;
}

export const DEFAULT_GRID: SavedGrid = { visible: false, snap: false, spacingMm: 10, centerMark: false };

/**
 * Kaydedilen çizim (sürüm 3). Biçim değişirse `SAVE_VERSION` artırılır ve
 * `MIGRATIONS`'a bir önceki sürümden dönüştürme adımı eklenir.
 */
export interface SavedDrawing {
  version: typeof SAVE_VERSION;
  savedAt: number;
  paper: { kind: PaperKind; width: number; height: number; orientation: Orientation };
  scene: {
    mode: PerspectiveMode;
    horizonLocked: boolean;
    /** Sonradan eklendi (içerik döndürme); eski kayıtlarda 0. */
    horizonAngle: number;
    rayCount: number;
    /** Kapalı modda (0) pasif noktalar da saklanır; yeniden açınca kurgu döner. */
    points: VanishingPoint[];
  };
  strokes: Stroke[];
  grid: SavedGrid;
  shapes: Shape[];
  /** Köşe kaçış çizgilerinin hedefi (sonradan eklendi; yoksa varsayılan). */
  cornerLines: SavedCornerLines;
  /** Alttan üste katmanlar (en az bir). Nesneler `layerId` ile bağlanır. */
  layers: Layer[];
  activeLayerId: string;
}

type Raw = Record<string, unknown>;

/**
 * Sürüm dönüştürücüleri: anahtar kaynak sürüm, sonuç bir sonraki sürüm.
 * Yalnızca yapı dönüştürülür; doğrulama sonra `parseSavedDrawing`'de yapılır.
 */
const MIGRATIONS: Record<number, (d: Raw) => Raw> = {
  // v1 → v2: perspektif kapalı modu, kâğıt ızgarası ayarı ve şekiller eklendi
  1: (d) => ({ ...d, version: 2, grid: { ...DEFAULT_GRID }, shapes: [] }),
  // v2 → v3: katmanlar; tüm nesneler tek katmana ("Katman 1") atanır
  2: (d) => ({
    ...d,
    version: 3,
    layers: [createLayer('', LEGACY_LAYER_ID)],
    activeLayerId: LEGACY_LAYER_ID,
    strokes: Array.isArray(d.strokes)
      ? d.strokes.map((s) => (isObject(s) ? { ...s, layerId: LEGACY_LAYER_ID } : s))
      : d.strokes,
    shapes: Array.isArray(d.shapes)
      ? d.shapes.map((s) => (isObject(s) ? { ...s, layerId: LEGACY_LAYER_ID } : s))
      : d.shapes,
  }),
};

/** Eski sürümü şu ankine taşır; tanınmayan ya da daha yeni sürüm için null. */
export function migrateSavedDrawing(v: Raw): Raw | null {
  let d = v;
  while (d.version !== SAVE_VERSION) {
    const version = d.version;
    if (typeof version !== 'number' || !Number.isInteger(version) || version > SAVE_VERSION) {
      return null;
    }
    const step = MIGRATIONS[version];
    if (!step) return null;
    d = step(d);
  }
  return d;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const isString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

function parseStyle(v: unknown): StrokeStyle | null {
  if (!isObject(v)) return null;
  const { width, opacity, ink } = v;
  if (!isFiniteNumber(width) || width <= 0 || !isFiniteNumber(opacity)) return null;
  if (!INK_IDS.includes(ink as InkId)) return null;
  return { width, opacity: Math.min(1, Math.max(0, opacity)), ink: ink as InkId };
}

function parseStroke(v: unknown): Stroke | null {
  if (!isObject(v) || !isString(v.id) || !Array.isArray(v.points)) return null;
  const points = v.points;
  if (points.length < 2 || points.length % 2 !== 0 || !points.every(isFiniteNumber)) return null;
  const style = parseStyle(v.style);
  if (!style) return null;
  const stroke: Stroke = { id: v.id, points: [...points], style };
  if (isString(v.layerId)) stroke.layerId = v.layerId;
  // Basınç isteğe bağlı; nokta sayısıyla uyuşmuyorsa yok sayılır
  const pr = v.pressures;
  if (Array.isArray(pr) && pr.length === points.length / 2 && pr.every(isFiniteNumber)) {
    stroke.pressures = pr.map((x) => Math.min(1, Math.max(0, x)));
  }
  return stroke;
}

function parsePoint(v: unknown): VanishingPoint | null {
  if (!isObject(v) || !isString(v.id) || !isFiniteNumber(v.x) || !isFiniteNumber(v.y)) return null;
  return v.role === 'vertical' ? { id: v.id, x: v.x, y: v.y, role: 'vertical' } : { id: v.id, x: v.x, y: v.y };
}

function parseShape(v: unknown): Shape | null {
  if (!isObject(v) || !isString(v.id) || !SHAPE_KINDS.includes(v.kind as ShapeKind)) return null;
  const kind = v.kind as ShapeKind;
  const vertices = v.vertices;
  if (!Array.isArray(vertices) || vertices.length % 2 !== 0 || !vertices.every(isFiniteNumber)) {
    return null;
  }
  const [min, max] = vertexCountRange(kind);
  const count = vertices.length / 2;
  if (count < min || count > max) return null;
  const style = parseStyle(v.style);
  if (!style) return null;
  const shape: Shape = { id: v.id, kind, vertices: [...vertices], style, cornerLines: v.cornerLines !== false };
  if (isString(v.layerId)) shape.layerId = v.layerId;
  if (Array.isArray(v.hiddenEdges)) {
    // Geçerli kenar numaraları, tekil ve sıralı; hepsi silinmişse şekil yok sayılır
    const count = edgeCount(shape);
    const hidden = [...new Set(v.hiddenEdges.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < count))]
      .sort((a, b) => a - b);
    if (hidden.length >= count) return null;
    if (hidden.length) shape.hiddenEdges = hidden;
  }
  return shape;
}

function parseGrid(v: unknown): SavedGrid {
  if (!isObject(v)) return { ...DEFAULT_GRID };
  return {
    visible: v.visible === true,
    snap: v.snap === true,
    spacingMm: GRID_SPACINGS_MM.includes(v.spacingMm as GridSpacingMm)
      ? (v.spacingMm as GridSpacingMm)
      : DEFAULT_GRID.spacingMm,
    centerMark: v.centerMark === true,
  };
}

function parseLayer(v: unknown): Layer | null {
  if (!isObject(v) || !isString(v.id)) return null;
  return {
    id: v.id,
    name: typeof v.name === 'string' ? v.name.slice(0, 80) : '',
    visible: v.visible !== false,
    locked: v.locked === true,
    opacity: isFiniteNumber(v.opacity) ? Math.min(1, Math.max(0, v.opacity)) : 1,
  };
}

/** Katmanları doğrular: yinelenen kimlikler atlanır, en fazla MAX_LAYERS, hiç yoksa bir tane. */
function parseLayers(v: unknown): Layer[] {
  const seen = new Set<string>();
  const layers = (Array.isArray(v) ? v : [])
    .map(parseLayer)
    .filter((l): l is Layer => l !== null && !seen.has(l.id) && (seen.add(l.id), true))
    .slice(0, MAX_LAYERS);
  return layers.length ? layers : [createLayer('', LEGACY_LAYER_ID)];
}

function parseCornerLines(v: unknown): SavedCornerLines {
  if (!isObject(v)) return { ...DEFAULT_CORNER_LINES };
  return {
    target: CORNER_TARGETS.includes(v.target as CornerTarget)
      ? (v.target as CornerTarget)
      : DEFAULT_CORNER_LINES.target,
    pointId: isString(v.pointId) ? v.pointId : null,
  };
}

/** Birden fazla kaynaktan okunan kayıtlar arasından en yenisi (savedAt). */
export function newestDrawing(...candidates: (SavedDrawing | null)[]): SavedDrawing | null {
  let best: SavedDrawing | null = null;
  for (const c of candidates) {
    if (c && (!best || c.savedAt > best.savedAt)) best = c;
  }
  return best;
}

/**
 * Depodan gelen veriyi gerekirse şu anki sürüme taşır ve doğrular. Bozuk ya da
 * tanınmayan veri için null döner; tek tek bozuk stroke/şekil/noktalar atlanır,
 * geri kalanı yüklenir.
 */
export function parseSavedDrawing(input: unknown): SavedDrawing | null {
  if (!isObject(input)) return null;
  const v = migrateSavedDrawing(input);
  if (!v) return null;
  const { paper, scene, strokes } = v;
  if (!isObject(paper) || !isObject(scene) || !Array.isArray(strokes)) return null;

  if (!PAPER_KINDS.includes(paper.kind as PaperKind)) return null;
  if (!isFiniteNumber(paper.width) || !isFiniteNumber(paper.height)) return null;
  if (paper.width <= 0 || paper.height <= 0) return null;

  if (!PERSPECTIVE_MODES.includes(scene.mode as PerspectiveMode)) return null;
  const mode = scene.mode as PerspectiveMode;
  if (!Array.isArray(scene.points)) return null;
  const points = scene.points.map(parsePoint).filter((p): p is VanishingPoint => p !== null);

  return {
    version: SAVE_VERSION,
    savedAt: isFiniteNumber(v.savedAt) ? v.savedAt : 0,
    paper: {
      kind: paper.kind as PaperKind,
      width: paper.width,
      height: paper.height,
      // Yönlendirme sonradan eklendi; eski kayıtlarda boyuttan çıkarılır
      orientation: ORIENTATIONS.includes(paper.orientation as Orientation)
        ? (paper.orientation as Orientation)
        : paper.width > paper.height
          ? 'landscape'
          : 'portrait',
    },
    scene: {
      mode,
      horizonLocked: scene.horizonLocked !== false,
      horizonAngle: isFiniteNumber(scene.horizonAngle) ? normalizeLineAngle(scene.horizonAngle) : 0,
      rayCount: isFiniteNumber(scene.rayCount) ? scene.rayCount : 24,
      // Kapalı modda pasif kurgu (en fazla 3 nokta) korunur
      points: points.slice(0, mode === 0 ? 3 : mode),
    },
    grid: parseGrid(v.grid),
    cornerLines: parseCornerLines(v.cornerLines),
    ...layersAndObjects(v),
  };
}

/**
 * Katmanlar, etkin katman ve nesneler. Katmanı bilinmeyen nesne en alttaki
 * katmana atanır; etkin katman yoksa en üstteki seçilir.
 */
function layersAndObjects(v: Raw): Pick<SavedDrawing, 'layers' | 'activeLayerId' | 'strokes' | 'shapes'> {
  const layers = parseLayers(v.layers);
  const ids = new Set(layers.map((l) => l.id));
  const bottom = layers[0].id;
  const fix = <T extends { layerId?: string }>(o: T): T =>
    o.layerId && ids.has(o.layerId) ? o : { ...o, layerId: bottom };
  const strokes = Array.isArray(v.strokes) ? v.strokes : [];
  const shapes = Array.isArray(v.shapes) ? v.shapes : [];
  return {
    layers,
    activeLayerId:
      isString(v.activeLayerId) && ids.has(v.activeLayerId) ? v.activeLayerId : layers[layers.length - 1].id,
    strokes: strokes.map(parseStroke).filter((s): s is Stroke => s !== null).map(fix),
    shapes: shapes.map(parseShape).filter((s): s is Shape => s !== null).map(fix),
  };
}
