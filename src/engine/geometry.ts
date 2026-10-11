export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

/** İki dikdörtgen `margin` payıyla kesişiyor mu. */
export function rectsOverlap(a: Rect, b: Rect, margin = 0): boolean {
  return (
    a.x - margin <= b.x + b.width &&
    a.x + a.width + margin >= b.x &&
    a.y - margin <= b.y + b.height &&
    a.y + a.height + margin >= b.y
  );
}
