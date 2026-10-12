import { clamp, type Point, type Rect } from '../engine/geometry';

export type PerspectiveMode = 1 | 2;

export interface VanishingPoint {
  id: string;
  x: number;
  y: number;
}

export interface Horizon {
  origin: Point;
  /** Radyan; kilitli ufukta `horizonAngle` (normalde 0). */
  angle: number;
}

export interface SceneSnapshot {
  mode: PerspectiveMode;
  horizonLocked: boolean;
  horizonAngle: number;
  points: VanishingPoint[];
}

export function snapshotsEqual(a: SceneSnapshot, b: SceneSnapshot): boolean {
  return (
    a.mode === b.mode &&
    a.horizonLocked === b.horizonLocked &&
    a.horizonAngle === b.horizonAngle &&
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

/** Doğru açısını (-π/2, π/2] aralığına getirir; ufuk yönsüzdür. */
export function normalizeLineAngle(angle: number): number {
  let a = angle % Math.PI;
  if (a > Math.PI / 2) a -= Math.PI;
  else if (a <= -Math.PI / 2) a += Math.PI;
  return a;
}

/**
 * Perspektif kurgusu: mod (1/2 nokta), kaçış noktaları, ufuk kilidi, ışın sayısı.
 * Koordinatlar dünya biriminde; noktalar kâğıt dışında da olabilir.
 *
 * Ufuk kilitliyken (2 nokta) tüm noktalar `horizonAngle` yönündeki aynı doğru
 * üzerindedir: bir noktayı ufka dik taşımak ufku ve diğer noktayı da taşır.
 * 1 noktada ufuk noktadan geçen, `horizonAngle` yönündeki doğrudur.
 * `horizonAngle` normalde 0'dır (yatay); kâğıt çizimle birlikte 90° döndürülünce
 * ufuk da döner.
 */
export class PerspectiveScene {
  mode: PerspectiveMode = 2;
  points: VanishingPoint[] = [];
  horizonLocked = true;
  /** Kilitli ufkun yönü, radyan. */
  horizonAngle = 0;
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
    this.horizonAngle = 0;
    this.rayCount = RAY_COUNT_DEFAULT;
    this.points = [
      { id: newId(), x: paper.x + paper.width * 0.06, y },
      { id: newId(), x: paper.x + paper.width * 0.94, y },
    ];
    this.emit();
  }

  addPoint(at: Point): VanishingPoint | null {
    if (!this.canAddPoint) return null;
    const pos =
      this.isHorizonLocked && this.points.length > 0 ? this.ontoHorizon(at, this.points[0]) : at;
    const point = { id: newId(), x: pos.x, y: pos.y };
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
      for (const p of this.points) {
        if (p === point) continue;
        const q = this.ontoHorizon(p, to);
        p.x = q.x;
        p.y = q.y;
      }
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
      // Ufuk doğrusu üzerinde, kâğıt merkezine göre karşı tarafa yerleştir
      const p = this.points[0];
      const d = this.horizonDirection();
      const center = { x: paper.x + paper.width / 2, y: paper.y + paper.height / 2 };
      const span = Math.abs(d.x) * paper.width + Math.abs(d.y) * paper.height;
      const tp = (p.x - center.x) * d.x + (p.y - center.y) * d.y;
      let t = -tp;
      if (Math.abs(t - tp) < span * 0.5) t = tp <= 0 ? span * 0.44 : -span * 0.44;
      this.points.push({ id: newId(), x: p.x + d.x * (t - tp), y: p.y + d.y * (t - tp) });
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
    if (!b || this.isHorizonLocked) return { origin: { x: a.x, y: a.y }, angle: this.horizonAngle };
    // Ufuk yönünü soldan sağa normalize et
    const angle = normalizeLineAngle(Math.atan2(b.y - a.y, b.x - a.x));
    return { origin: { x: a.x, y: a.y }, angle };
  }

  /**
   * Kurguyu bir dönüşümle taşır (kâğıt çizimle birlikte döndürülünce):
   * noktalar `map` ile, ufuk yönü `angleDelta` kadar döner.
   */
  transform(map: (p: Point) => Point, angleDelta: number): void {
    for (const p of this.points) {
      const q = map(p);
      p.x = q.x;
      p.y = q.y;
    }
    this.horizonAngle = normalizeLineAngle(this.horizonAngle + angleDelta);
    this.emit();
  }

  /** Geri alınabilir kurgu durumu (ışın sayısı görünüm tercihi sayılır, dahil değil). */
  snapshot(): SceneSnapshot {
    return {
      mode: this.mode,
      horizonLocked: this.horizonLocked,
      horizonAngle: this.horizonAngle,
      points: this.points.map((p) => ({ ...p })),
    };
  }

  restore(snap: SceneSnapshot): void {
    this.mode = snap.mode;
    this.horizonLocked = snap.horizonLocked;
    this.horizonAngle = snap.horizonAngle;
    this.points = snap.points.map((p) => ({ ...p }));
    this.emit();
  }

  /** Kilitli ufkun birim yön vektörü. */
  horizonDirection(): Point {
    return { x: Math.cos(this.horizonAngle), y: Math.sin(this.horizonAngle) };
  }

  /** `p`'nin, `through`'dan geçen kilitli ufuk doğrusu üzerindeki izdüşümü. */
  private ontoHorizon(p: Point, through: Point): Point {
    const d = this.horizonDirection();
    const t = (p.x - through.x) * d.x + (p.y - through.y) * d.y;
    return { x: through.x + d.x * t, y: through.y + d.y * t };
  }

  /** Kilitlenince noktaları ağırlık merkezlerinden geçen ufuk doğrusuna hizalar. */
  private levelPoints(): void {
    if (this.points.length < 2) return;
    const n = this.points.length;
    const c = {
      x: this.points.reduce((s, p) => s + p.x, 0) / n,
      y: this.points.reduce((s, p) => s + p.y, 0) / n,
    };
    for (const p of this.points) {
      const q = this.ontoHorizon(p, c);
      p.x = q.x;
      p.y = q.y;
    }
  }
}
