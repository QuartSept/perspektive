import { clamp, type Point, type Rect } from '../engine/geometry';

export type PerspectiveMode = 1 | 2;

export interface VanishingPoint {
  id: string;
  x: number;
  y: number;
}

export interface Horizon {
  origin: Point;
  /** Radyan; kilitli ufukta 0. */
  angle: number;
}

export interface SceneSnapshot {
  mode: PerspectiveMode;
  horizonLocked: boolean;
  points: VanishingPoint[];
}

export function snapshotsEqual(a: SceneSnapshot, b: SceneSnapshot): boolean {
  return (
    a.mode === b.mode &&
    a.horizonLocked === b.horizonLocked &&
    a.points.length === b.points.length &&
    a.points.every((p, i) => {
      const q = b.points[i];
      return p.id === q.id && p.x === q.x && p.y === q.y;
    })
  );
}

export const RAY_COUNT_MIN = 12;
export const RAY_COUNT_MAX = 72;
export const RAY_COUNT_STEP = 4;
export const RAY_COUNT_DEFAULT = 24;

const newId = (): string => `vp-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Perspektif kurgusu: mod (1/2 nokta), kaçış noktaları, ufuk kilidi, ışın sayısı.
 * Koordinatlar dünya biriminde; noktalar kâğıt dışında da olabilir.
 *
 * Ufuk kilitliyken (2 nokta) tüm noktalar aynı y'yi paylaşır: bir noktayı
 * dikey taşımak ufku ve diğer noktayı da taşır. 1 noktada ufuk her zaman
 * noktadan geçen yatay çizgidir.
 */
export class PerspectiveScene {
  mode: PerspectiveMode = 2;
  points: VanishingPoint[] = [];
  horizonLocked = true;
  rayCount = RAY_COUNT_DEFAULT;

  private listeners = new Set<() => void>();

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  get maxPoints(): number {
    return this.mode;
  }

  get canAddPoint(): boolean {
    return this.points.length < this.maxPoints;
  }

  /** 1 noktada ufuk zaten yataydır; kilit yalnızca 2 noktada anlamlı. */
  get isHorizonLocked(): boolean {
    return this.mode === 1 || this.horizonLocked;
  }

  getPoint(id: string): VanishingPoint | undefined {
    return this.points.find((p) => p.id === id);
  }

  /** Varsayılan kurgu: 2 nokta, ufuk kâğıdın %40 yüksekliğinde. */
  reset(paper: Rect): void {
    const y = paper.y + paper.height * 0.4;
    this.mode = 2;
    this.horizonLocked = true;
    this.rayCount = RAY_COUNT_DEFAULT;
    this.points = [
      { id: newId(), x: paper.x + paper.width * 0.06, y },
      { id: newId(), x: paper.x + paper.width * 0.94, y },
    ];
    this.emit();
  }

  addPoint(at: Point): VanishingPoint | null {
    if (!this.canAddPoint) return null;
    const y = this.isHorizonLocked && this.points.length > 0 ? this.points[0].y : at.y;
    const point = { id: newId(), x: at.x, y };
    this.points.push(point);
    this.emit();
    return point;
  }

  movePoint(id: string, to: Point): void {
    const point = this.getPoint(id);
    if (!point) return;
    point.x = to.x;
    point.y = to.y;
    if (this.isHorizonLocked) {
      for (const p of this.points) p.y = to.y;
    }
    this.emit();
  }

  /** Tüm noktaları (dolayısıyla ufku) kaydırır. */
  translate(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    for (const p of this.points) {
      p.x += dx;
      p.y += dy;
    }
    this.emit();
  }

  removePoint(id: string): void {
    const before = this.points.length;
    this.points = this.points.filter((p) => p.id !== id);
    if (this.points.length !== before) this.emit();
  }

  /**
   * Mod değiştirir. 1 → 2 geçişinde ikinci nokta aynı ufukta, kâğıt merkezine
   * göre karşı tarafa otomatik eklenir. 2 → 1'de `keepId` (yoksa ilk nokta) korunur.
   */
  setMode(mode: PerspectiveMode, paper: Rect, keepId?: string | null): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 1 && this.points.length > 1) {
      const keep = (keepId && this.getPoint(keepId)) || this.points[0];
      this.points = [keep];
    } else if (mode === 2 && this.points.length === 1) {
      const p = this.points[0];
      const centerX = paper.x + paper.width / 2;
      let x = 2 * centerX - p.x;
      if (Math.abs(x - p.x) < paper.width * 0.5) {
        x = p.x <= centerX ? paper.x + paper.width * 0.94 : paper.x + paper.width * 0.06;
      }
      this.points.push({ id: newId(), x, y: p.y });
    }
    if (this.isHorizonLocked) this.levelPoints();
    this.emit();
  }

  setHorizonLocked(locked: boolean): void {
    if (locked === this.horizonLocked) return;
    this.horizonLocked = locked;
    if (this.isHorizonLocked) this.levelPoints();
    this.emit();
  }

  setRayCount(count: number): void {
    const stepped = Math.round(count / RAY_COUNT_STEP) * RAY_COUNT_STEP;
    const next = clamp(stepped, RAY_COUNT_MIN, RAY_COUNT_MAX);
    if (next === this.rayCount) return;
    this.rayCount = next;
    this.emit();
  }

  horizon(): Horizon | null {
    const [a, b] = this.points;
    if (!a) return null;
    if (!b || this.isHorizonLocked) return { origin: { x: a.x, y: a.y }, angle: 0 };
    let angle = Math.atan2(b.y - a.y, b.x - a.x);
    // Ufuk yönünü soldan sağa normalize et
    if (angle > Math.PI / 2) angle -= Math.PI;
    else if (angle < -Math.PI / 2) angle += Math.PI;
    return { origin: { x: a.x, y: a.y }, angle };
  }

  /** Geri alınabilir kurgu durumu (ışın sayısı görünüm tercihi sayılır, dahil değil). */
  snapshot(): SceneSnapshot {
    return {
      mode: this.mode,
      horizonLocked: this.horizonLocked,
      points: this.points.map((p) => ({ ...p })),
    };
  }

  restore(snap: SceneSnapshot): void {
    this.mode = snap.mode;
    this.horizonLocked = snap.horizonLocked;
    this.points = snap.points.map((p) => ({ ...p }));
    this.emit();
  }

  /** Kilitlenince noktaları ortalama y'de hizalar. */
  private levelPoints(): void {
    if (this.points.length < 2) return;
    const y = this.points.reduce((s, p) => s + p.y, 0) / this.points.length;
    for (const p of this.points) p.y = y;
  }
}
