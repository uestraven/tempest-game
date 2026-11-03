/**
 * Hurtbox geometry and ray intersection.
 *
 * Three distinct concepts, deliberately never conflated:
 *
 *  1. Movement collision body - the small 12x10 box at the feet (PLAYER.bodyWidth
 *     / bodyHeight). Owned by Arcade Physics. Makes walking around corners and
 *     through doorways feel right.
 *  2. Bullet hurtbox - the torso rectangle defined here. What a shot has to cross
 *     to count as a hit. Matches what the player visually reads as "the body".
 *  3. Sight origin - a separate eye/chest point used by AI vision and as the
 *     muzzle position. Not a hurtbox, and not the movement body.
 *
 * Phaser-free so the hit geometry can be unit tested.
 */

import { HURTBOX } from './constants';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Torso hurtbox for an actor whose sprite is anchored at the feet.
 * With the locked values this spans y - 24 to y - 6, 12 px wide and centred on x.
 */
export function hurtboxAt(feetX: number, feetY: number): Rect {
  return {
    x: feetX - HURTBOX.width / 2,
    y: feetY - HURTBOX.topOffset,
    width: HURTBOX.width,
    height: HURTBOX.height,
  };
}

/** Centre of a rectangle. What a shooter should aim at, not the sight origin. */
export function rectCenter(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

export function rectContains(rect: Rect, x: number, y: number): boolean {
  return (
    x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
  );
}

/**
 * Distance along a ray at which it first enters `rect`, or null if it never does
 * within `maxDistance`. Slab method; `dirX`/`dirY` must be a unit vector.
 *
 * An origin already inside the rectangle returns 0, so a point-blank shot still
 * registers instead of passing through.
 */
export function rayRectEntry(
  originX: number,
  originY: number,
  dirX: number,
  dirY: number,
  rect: Rect,
  maxDistance: number
): number | null {
  let tMin = 0;
  let tMax = maxDistance;

  const axes: [number, number, number, number][] = [
    [originX, dirX, rect.x, rect.x + rect.width],
    [originY, dirY, rect.y, rect.y + rect.height],
  ];

  for (const [origin, dir, lo, hi] of axes) {
    if (Math.abs(dir) < 1e-9) {
      // Parallel to this slab: either always inside it, or never.
      if (origin < lo || origin > hi) return null;
      continue;
    }
    let t1 = (lo - origin) / dir;
    let t2 = (hi - origin) / dir;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }

  return tMin;
}
