import { ORIENTATIONS, PAPER_KINDS, type Orientation, type PaperKind } from '../engine/paper';
import { INK_IDS, type InkId, type Stroke } from '../engine/stroke';
import {
  normalizeLineAngle,
  type PerspectiveMode,
  type VanishingPoint,
} from '../perspective/scene';

/**
 * Kaydedilen çizim. Biçim değişirse `version` artırılır ve
 * `parseSavedDrawing` eski sürümleri dönüştürür.
 */
export interface SavedDrawing {
  version: 1;
  savedAt: number;
  paper: { kind: PaperKind; width: number; height: number; orientation: Orientation };
  scene: {
    mode: PerspectiveMode;
    horizonLocked: boolean;
    /** Sonradan eklendi (içerik döndürme); eski kayıtlarda 0. */
    horizonAngle: number;
    rayCount: number;
    points: VanishingPoint[];
  };
  strokes: Stroke[];
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const isString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

function parseStroke(v: unknown): Stroke | null {
  if (!isObject(v) || !isString(v.id) || !Array.isArray(v.points) || !isObject(v.style)) {
    return null;
  }
  const points = v.points;
  if (points.length < 2 || points.length % 2 !== 0 || !points.every(isFiniteNumber)) return null;
  const { width, opacity, ink } = v.style;
  if (!isFiniteNumber(width) || width <= 0 || !isFiniteNumber(opacity)) return null;
  if (!INK_IDS.includes(ink as InkId)) return null;
  return {
    id: v.id,
    points: [...points],
    style: { width, opacity: Math.min(1, Math.max(0, opacity)), ink: ink as InkId },
  };
}

function parsePoint(v: unknown): VanishingPoint | null {
  if (!isObject(v) || !isString(v.id) || !isFiniteNumber(v.x) || !isFiniteNumber(v.y)) return null;
  return { id: v.id, x: v.x, y: v.y };
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
 * Depodan gelen veriyi doğrular. Bozuk ya da tanınmayan veri için null döner;
 * tek tek bozuk stroke'lar atlanır, geri kalanı yüklenir.
 */
export function parseSavedDrawing(v: unknown): SavedDrawing | null {
  if (!isObject(v) || v.version !== 1) return null;
  const { paper, scene, strokes } = v;
  if (!isObject(paper) || !isObject(scene) || !Array.isArray(strokes)) return null;

  if (!PAPER_KINDS.includes(paper.kind as PaperKind)) return null;
  if (!isFiniteNumber(paper.width) || !isFiniteNumber(paper.height)) return null;
  if (paper.width <= 0 || paper.height <= 0) return null;

  if (scene.mode !== 1 && scene.mode !== 2) return null;
  if (!Array.isArray(scene.points)) return null;
  const points = scene.points.map(parsePoint).filter((p): p is VanishingPoint => p !== null);

  return {
    version: 1,
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
      mode: scene.mode,
      horizonLocked: scene.horizonLocked !== false,
      horizonAngle: isFiniteNumber(scene.horizonAngle) ? normalizeLineAngle(scene.horizonAngle) : 0,
      rayCount: isFiniteNumber(scene.rayCount) ? scene.rayCount : 24,
      points: points.slice(0, scene.mode),
    },
    strokes: strokes.map(parseStroke).filter((s): s is Stroke => s !== null),
  };
}
