/** Görünüm döndürmede düz hizaya (0°, 90°, 180°, 270°) yapışma eşiği. */
export const ROTATION_SNAP = (4 * Math.PI) / 180;
/** Shift ile döndürme adımı. */
export const ROTATION_STEP = (15 * Math.PI) / 180;

/**
 * Ham döndürme açısını yapıştırır: `stepped` ise 15°'lik adımlara yuvarlar,
 * değilse yalnızca dik açıların yakınında (±4°) onlara oturtur.
 */
export function snapRotation(raw: number, stepped = false): number {
  if (stepped) return Math.round(raw / ROTATION_STEP) * ROTATION_STEP;
  const right = Math.PI / 2;
  const nearest = Math.round(raw / right) * right;
  return Math.abs(raw - nearest) <= ROTATION_SNAP ? nearest : raw;
}

/** İki açının farkı (-π, π] aralığında; ±π sıçramasında döndürme zıplamasın. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}
