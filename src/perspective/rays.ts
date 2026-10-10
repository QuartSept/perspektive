import { clamp } from '../engine/geometry';

/** İmleç bu uzaklıktan (CSS px) yakınsa vurgu tamdır. */
export const PROXIMITY_NEAR = 40;
/** Bu uzaklıktan sonra vurgu yoktur. */
export const PROXIMITY_FAR = 240;

/**
 * Eşit aralıklı ışın açıları. `baseAngle` ışınlardan birinin ufukla
 * çakışmasını sağlar; sayı 4'ün katı olduğunda dikey ışın da bulunur.
 */
export function rayAngles(count: number, baseAngle = 0): number[] {
  const step = (Math.PI * 2) / count;
  return Array.from({ length: count }, (_, i) => baseAngle + i * step);
}

/** Uzaklığa göre 0..1 yumuşak yakınlık ağırlığı (smoothstep). */
export function proximityWeight(distance: number): number {
  const t = clamp((PROXIMITY_FAR - distance) / (PROXIMITY_FAR - PROXIMITY_NEAR), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Her noktanın ışın opaklığı: kendi yakınlığı onu belirginleştirir,
 * diğer noktaların yakınlığı onu silikleştirir.
 */
export function rayOpacities(
  weights: readonly number[],
  base: number,
  strong: number,
  dim: number,
): number[] {
  return weights.map((w, i) => {
    let others = 0;
    weights.forEach((o, j) => {
      if (j !== i) others = Math.max(others, o);
    });
    const alpha = base + (strong - base) * w - (base - dim) * others * (1 - w);
    return clamp(alpha, dim, strong);
  });
}
