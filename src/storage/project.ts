import type { DrawingDocument } from '../engine/document';
import type { Command } from '../engine/history';
import type { Paper } from '../engine/paper';
import type { PerspectiveScene } from '../perspective/scene';
import { parseSavedDrawing, type SavedDrawing } from './format';

/** Proje dosyasını tanıtan alan; başka uygulamaların JSON'ı yanlışlıkla yüklenmesin. */
const APP_ID = 'perspektif';

export interface DrawingSources {
  doc: DrawingDocument;
  scene: PerspectiveScene;
  paper: Paper;
}

/** Çizimin kaydedilebilir anlık görüntüsü (otomatik kayıt ve proje dosyası ortak). */
export function buildSavedDrawing({ doc, scene, paper }: DrawingSources): SavedDrawing {
  return {
    version: 1,
    savedAt: Date.now(),
    paper: {
      kind: paper.kind,
      width: paper.width,
      height: paper.height,
      orientation: paper.orientation,
    },
    scene: {
      mode: scene.mode,
      horizonLocked: scene.horizonLocked,
      horizonAngle: scene.horizonAngle,
      rayCount: scene.rayCount,
      points: scene.points.map((p) => ({ ...p })),
    },
    // Belgedeki stroke'lar değiştirilmez; doğrudan verilebilir
    strokes: [...doc.strokes],
  };
}

/** Kayıtlı çizimi uygular (yükleme, proje dosyası açma, geri al). */
export function applySavedDrawing({ doc, scene, paper }: DrawingSources, saved: SavedDrawing): void {
  paper.restore(saved.paper.kind, saved.paper.width, saved.paper.height, saved.paper.orientation);
  scene.restore(saved.scene);
  scene.setRayCount(saved.scene.rayCount);
  doc.replaceAll(saved.strokes);
}

export function serializeProject(sources: DrawingSources): string {
  return JSON.stringify({ app: APP_ID, ...buildSavedDrawing(sources) });
}

/** Proje dosyası metnini doğrular; tanınmazsa null. */
export function parseProject(text: string): SavedDrawing | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const app = (data as { app?: unknown }).app;
  if (app !== undefined && app !== APP_ID) return null;
  return parseSavedDrawing(data);
}

/** Proje dosyası açma: mevcut çizimin yerine geçer, tek adımda geri alınır. */
export class LoadDrawingCommand implements Command {
  private readonly before: SavedDrawing;

  constructor(
    private readonly sources: DrawingSources,
    private readonly after: SavedDrawing,
    private readonly onChanged: () => void,
  ) {
    this.before = buildSavedDrawing(sources);
  }

  apply(): void {
    applySavedDrawing(this.sources, this.after);
    this.onChanged();
  }

  revert(): void {
    applySavedDrawing(this.sources, this.before);
    this.onChanged();
  }
}
