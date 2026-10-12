import { REFERENCE_FITS, type ReferenceFit, type ReferenceImage } from '../engine/reference';
import { idbDelete, idbGet, idbPut } from './idb';

const KEY = 'reference';
const SAVE_DELAY_MS = 300;

interface StoredReference {
  blob: Blob;
  opacity: number;
  visible: boolean;
  fit: ReferenceFit;
}

/**
 * Referans görseli IndexedDB'de tutar (görsel localStorage'a sığmayabilir;
 * IndexedDB yoksa yalnızca oturum boyunca kalır).
 */
export class ReferenceStore {
  private timer = 0;
  private enabled = false;

  constructor(private readonly reference: ReferenceImage) {}

  async load(): Promise<void> {
    try {
      const stored = await idbGet<StoredReference>(KEY);
      if (stored?.blob instanceof Blob) {
        await this.reference.load(stored.blob);
        if (typeof stored.opacity === 'number') this.reference.setOpacity(stored.opacity);
        if (typeof stored.visible === 'boolean') this.reference.setVisible(stored.visible);
        if (REFERENCE_FITS.includes(stored.fit)) this.reference.setFit(stored.fit);
      }
    } catch {
      // Okunamayan ya da çözülemeyen görsel yok sayılır
    }
  }

  /** Yüklemeden sonra çağrılır; değişiklikleri kaydetmeye başlar. */
  start(): void {
    this.enabled = true;
    this.reference.onChange(() => this.schedule());
  }

  private schedule(): void {
    if (!this.enabled) return;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.save(), SAVE_DELAY_MS);
  }

  private async save(): Promise<void> {
    const r = this.reference;
    try {
      if (r.blob) {
        await idbPut(KEY, { blob: r.blob, opacity: r.opacity, visible: r.visible, fit: r.fit });
      } else {
        await idbDelete(KEY);
      }
    } catch {
      // Kaydedilemezse görsel bu oturumla sınırlı kalır
    }
  }
}
