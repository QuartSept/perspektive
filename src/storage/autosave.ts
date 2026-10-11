import type { DrawingDocument } from '../engine/document';
import type { Paper } from '../engine/paper';
import type { PerspectiveScene } from '../perspective/scene';
import { newestDrawing, parseSavedDrawing, type SavedDrawing } from './format';
import { idbGet, idbPut } from './idb';

const KEY = 'current';
/** IndexedDB yoksa ya da yazma başarısızsa yedek. */
const FALLBACK_KEY = 'perspektif.drawing.v1';
const SAVE_DELAY_MS = 600;
/** Kayıt başarısız olursa yeniden deneme aralığı. */
const RETRY_MS = 5000;

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface AutosaveSources {
  doc: DrawingDocument;
  scene: PerspectiveScene;
  paper: Paper;
}

/**
 * Çizimi otomatik kaydeder: her değişiklikte kısa bir gecikmeyle,
 * sekme gizlenince/kapanırken hemen. Yükleme tamamlanmadan kayıt yapılmaz
 * (yoksa boş başlangıç durumu kayıtlı çizimin üzerine yazılırdı).
 *
 * Asıl depo IndexedDB'dir. Bir yazma başarısız olursa o kayıt localStorage'a
 * yedeklenir ama sonraki kayıtlar yine önce IndexedDB'yi dener; yüklemede iki
 * kaynaktan en yeni olanı seçilir. (Önceden tek hata kalıcı olarak yedeğe
 * geçiriyor, yükleme ise eski IndexedDB kaydını okuyordu.)
 */
export class Autosave {
  private timer = 0;
  private enabled = false;
  private dirty = false;
  private writing: Promise<void> | null = null;
  /** IndexedDB hiç açılamadı (bazı gizli pencereler): doğrudan yedeğe yazılır. */
  private idbUnavailable = false;

  constructor(
    private readonly sources: AutosaveSources,
    private readonly onStatus: (status: SaveStatus) => void,
  ) {}

  /** Kayıtlı çizimi okur; iki kaynaktan yeni olanı (yoksa ya da bozuksa null). */
  async load(): Promise<SavedDrawing | null> {
    let fromIdb: SavedDrawing | null = null;
    try {
      fromIdb = parseSavedDrawing(await idbGet(KEY));
    } catch {
      this.idbUnavailable = true;
    }
    let fromFallback: SavedDrawing | null = null;
    try {
      const raw = localStorage.getItem(FALLBACK_KEY);
      fromFallback = raw ? parseSavedDrawing(JSON.parse(raw)) : null;
    } catch {
      // Okunamayan yedek yok sayılır
    }
    return newestDrawing(fromIdb, fromFallback);
  }

  /** Yükleme bittikten sonra çağrılır; değişiklikleri izlemeye başlar. */
  start(): void {
    this.enabled = true;
    window.addEventListener('pagehide', () => void this.flush());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.flush();
    });
  }

  /** Değişiklik bildirimi. */
  markDirty(): void {
    if (!this.enabled) return;
    this.dirty = true;
    this.onStatus('pending');
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.flush(), SAVE_DELAY_MS);
  }

  /** Bekleyen değişikliği hemen yazar. */
  async flush(): Promise<void> {
    window.clearTimeout(this.timer);
    if (!this.enabled || !this.dirty) return;
    // Önceki yazma bitsin; sıra korunur
    if (this.writing) await this.writing;
    if (!this.dirty) return;
    this.dirty = false;
    this.onStatus('saving');
    this.writing = this.write(this.snapshot());
    try {
      await this.writing;
      this.onStatus(this.dirty ? 'pending' : 'saved');
    } catch {
      this.dirty = true;
      this.onStatus('error');
      // Yeni değişiklik gelmese de kendiliğinden yeniden dene
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => void this.flush(), RETRY_MS);
    } finally {
      this.writing = null;
    }
  }

  private snapshot(): SavedDrawing {
    const { doc, scene, paper } = this.sources;
    return {
      version: 1,
      savedAt: Date.now(),
      paper: { kind: paper.kind, width: paper.width, height: paper.height },
      scene: {
        mode: scene.mode,
        horizonLocked: scene.horizonLocked,
        rayCount: scene.rayCount,
        points: scene.points.map((p) => ({ ...p })),
      },
      // Belgedeki stroke'lar değiştirilmez; yapılandırılmış kopya için doğrudan verilebilir
      strokes: [...doc.strokes],
    };
  }

  private async write(data: SavedDrawing): Promise<void> {
    if (!this.idbUnavailable) {
      try {
        await idbPut(KEY, data);
        // Eski yedek artık geride; yüklemede karışıklık olmasın
        try {
          localStorage.removeItem(FALLBACK_KEY);
        } catch {
          // önemsiz
        }
        return;
      } catch {
        // Yedeğe düş; sonraki kayıt yine IndexedDB'yi dener
      }
    }
    // İkisi de başarısızsa hata yukarı çıkar (durum: "Kaydedilemedi", yeniden deneme)
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(data));
  }
}
