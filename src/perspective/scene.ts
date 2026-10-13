import { clamp, type Point, type Rect } from '../engine/geometry';

/** 0: perspektif kapalı (kaçış noktası ve ışın yok), 1–3: nokta sayısı. */
export type PerspectiveMode = 0 | 1 | 2 | 3;
export const PERSPECTIVE_MODES: readonly PerspectiveMode[] = [0, 1, 2, 3];

export interface VanishingPoint {
  id: string;
  x: number;
  y: number;
  /**
   * 3 noktada dikey kaçış noktası (dikey çizgilerin birleştiği yer; ufka
   * bağlı değildir). Yoksa nokta ufuk üzerindedir.
   */
  role?: 'vertical';
}

export const isVerticalPoint = (p: VanishingPoint): boolean => p.role === 'vertical';

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
      return p.id === q.id && p.x === q.x && p.y === q.y && p.role === q.role;
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
 * Perspektif kurgusu: mod (kapalı/1/2/3 nokta), kaçış noktaları, ufuk kilidi, ışın sayısı.
 * Kapalı modda noktalar silinmez, yalnızca pasif kalır (`activePoints` boş);
 * yeniden açınca kurgu geri gelir.
 * 3 noktada ufuk üzerindeki iki noktaya ek olarak dikey kaçış noktası vardır;
 * ufuk kilidi ve ufuk sürükleme yalnızca ufuk noktalarını etkiler.
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

  /** Etkin noktalar: çizim, mıknatıs ve düzenleme bunları kullanır (kapalı modda boş). */
  get activePoints(): VanishingPoint[] {
    return this.mode === 0 ? [] : this.points;
  }

  /** Ufuk üzerindeki etkin noktalar (eklenme sırasıyla). */
  get horizonPoints(): VanishingPoint[] {
    return this.activePoints.filter((p) => !isVerticalPoint(p));
  }

  /** 3 noktada dikey kaçış noktası. */
  get verticalPoint(): VanishingPoint | undefined {
    return this.activePoints.find(isVerticalPoint);
  }

  /** Mod değişiminde kullanılır: kapalı moddan dönerken pasif noktalar da sayılır. */
  private allHorizonPoints(): VanishingPoint[] {
    return this.points.filter((p) => !isVerticalPoint(p));
  }

  /** Renk sırası: ufuk noktaları 0, 1; dikey nokta 2 (silme/ekleme sırasından bağımsız). */
  colorIndexOf(p: VanishingPoint): number {
    return isVerticalPoint(p) ? 2 : Math.max(0, this.horizonPoints.indexOf(p));
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
    const horizonPoints = this.horizonPoints;
    // 3 noktada ufuk dolunca eklenen nokta dikey kaçış noktasıdır (serbest)
    if (this.mode === 3 && horizonPoints.length >= 2 && !this.verticalPoint) {
      const point: VanishingPoint = { id: newId(), x: at.x, y: at.y, role: 'vertical' };
      this.points.push(point);
      this.emit();
      return point;
    }
    const pos =
      this.isHorizonLocked && horizonPoints.length > 0 ? this.ontoHorizon(at, horizonPoints[0]) : at;
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
    if (this.isHorizonLocked && !isVerticalPoint(point)) {
      for (const p of this.horizonPoints) {
        if (p === point) continue;
        const q = this.ontoHorizon(p, to);
        p.x = q.x;
        p.y = q.y;
      }
    }
    this.emit();
  }

  /** Ufku (ufuk noktalarını) kaydırır; dikey kaçış noktası yerinde kalır. */
  translate(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    for (const p of this.horizonPoints) {
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
   * Mod değiştirir. Ufuk noktası eksikse ikincisi aynı ufukta, kâğıt merkezine
   * göre karşı tarafa otomatik eklenir. 3 noktaya geçişte dikey kaçış noktası
   * ufkun altına (kuşbakışı) eklenir; 3'ten çıkışta kaldırılır. 1'e geçişte
   * `keepId` (yoksa ilk ufuk noktası) korunur.
   */
  setMode(mode: PerspectiveMode, paper: Rect, keepId?: string | null): void {
    if (mode === this.mode) return;
    this.mode = mode;
    // Kapalı mod noktalara dokunmaz (geri açınca kurgu aynen döner)
    if (mode === 0) {
      this.emit();
      return;
    }
    if (mode < 3) this.points = this.allHorizonPoints();
    if (mode === 1 && this.points.length > 1) {
      const keep = (keepId && this.getPoint(keepId)) || this.points[0];
      this.points = [keep];
    } else if (mode >= 2 && this.horizonPoints.length === 1) {
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
    if (mode === 3 && !this.verticalPoint && this.horizonPoints.length > 0) {
      this.points.push({ id: newId(), ...this.defaultVerticalPosition(paper), role: 'vertical' });
    }
    this.emit();
  }

  /**
   * Ufuk noktalarının ortasından ufka dik, aşağıda (kuşbakışı). Kâğıdın alt
   * kenarının hemen içine konur ki sığdırılmış görünümde görünsün ve
   * sürüklenebilsin; ufuk kâğıt dışındaysa kâğıt boyunun biraz altına.
   */
  private defaultVerticalPosition(paper: Rect): Point {
    const hp = this.horizonPoints;
    const m = {
      x: hp.reduce((s, p) => s + p.x, 0) / hp.length,
      y: hp.reduce((s, p) => s + p.y, 0) / hp.length,
    };
    const angle = this.horizon()?.angle ?? this.horizonAngle;
    const down = { x: -Math.sin(angle), y: Math.cos(angle) };
    const inside =
      m.x >= paper.x && m.x <= paper.x + paper.width && m.y >= paper.y && m.y <= paper.y + paper.height;
    let dist = (Math.abs(down.x) * paper.width + Math.abs(down.y) * paper.height) * 1.1;
    if (inside) {
      let t = Infinity;
      if (down.x > 1e-9) t = Math.min(t, (paper.x + paper.width - m.x) / down.x);
      if (down.x < -1e-9) t = Math.min(t, (paper.x - m.x) / down.x);
      if (down.y > 1e-9) t = Math.min(t, (paper.y + paper.height - m.y) / down.y);
      if (down.y < -1e-9) t = Math.min(t, (paper.y - m.y) / down.y);
      dist = t * 0.92;
    }
    return { x: m.x + down.x * dist, y: m.y + down.y * dist };
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
    const [a, b] = this.horizonPoints;
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

  /** Kilitlenince ufuk noktalarını ağırlık merkezlerinden geçen ufuk doğrusuna hizalar. */
  private levelPoints(): void {
    const hp = this.horizonPoints;
    if (hp.length < 2) return;
    const n = hp.length;
    const c = {
      x: hp.reduce((s, p) => s + p.x, 0) / n,
      y: hp.reduce((s, p) => s + p.y, 0) / n,
    };
    for (const p of hp) {
      const q = this.ontoHorizon(p, c);
      p.x = q.x;
      p.y = q.y;
    }
  }
}
