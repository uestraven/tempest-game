/**
 * Hitbox geometry and ray intersection.
 *
 * THE COORDINATE SPACE MATTERS, and getting it wrong is what made hits feel
 * imprecise in the prototype. This game is top-down with a 2D tile grid, so
 * there is exactly one space in which gameplay geometry is meaningful: the
 * GROUND PLANE. A tile at (tx, ty) is a place on the ground. An actor's `y` is
 * its position on the ground, not its height.
 *
 * Sprites are drawn with a vertical offset for readability: a 24x32 character
 * anchored at the feet has its torso drawn roughly 15px above its ground
 * position. That offset is a RENDERING convention. If a shot is resolved
 * against the drawn torso rectangle in the same space as the tile grid, the
 * shot is effectively aimed about one tile north of where the target stands -
 * which lets bullets sail over cover that visibly stands between the two
 * actors. tests/hitbox-directions.test.ts pins that down.
 *
 * So:
 *   - `bulletHitbox` is the GROUND-PLANE body box. Occlusion and hit tests use
 *     it, in the same space as the tile grid.
 *   - `drawnTorso` is the SCREEN-SPACE rectangle the player actually sees and
 *     aims at. It is used for exactly two things: converting a mouse position
 *     into an aim angle, and drawing the debug overlay and impact effects.
 *   - Because both actors are drawn with the same offset, an angle measured
 *     from the shooter's drawn torso to the target's drawn torso is identical to
 *     the angle between their ground positions. That is what makes "aim at the
 *     visible torso" and "cover blocks what it visually blocks" both true.
 *
 * Three distinct concepts, deliberately never conflated:
 *   1. Movement collider - the small 12x10 box at the feet, owned by Arcade
 *      Physics. Makes walking round corners and through doorways feel right.
 *   2. Bullet hitbox - `bulletHitbox` below.
 *   3. Vision / shooting origin - the actor's ground position. Vision occlusion
 *      is ground-plane too, so a guard's line of sight is blocked by exactly
 *      the cover the player can see between them.
 *
 * Phaser-free so all of this can be unit tested.
 */

import { HURTBOX } from './constants';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Distance from an actor's ground position to the centre of its drawn torso.
 * Rendering and input only - never used in collision math.
 */
export const TORSO_OFFSET_Y = HURTBOX.topOffset - HURTBOX.height / 2;

/**
 * Ground-plane body box that bullets must cross: 12 wide x 18 deep, centred on
 * the actor's position. Same space as the tile grid.
 */
export function bulletHitbox(feetX: number, feetY: number): Rect {
  return {
    x: feetX - HURTBOX.width / 2,
    y: feetY - HURTBOX.height / 2,
    width: HURTBOX.width,
    height: HURTBOX.height,
  };
}

/**
 * Screen-space rectangle of the drawn torso for a feet-anchored 24x32 sprite:
 * y - 24 to y - 6 with the locked values. What the player sees and aims at.
 */
export function drawnTorso(feetX: number, feetY: number): Rect {
  return {
    x: feetX - HURTBOX.width / 2,
    y: feetY - HURTBOX.topOffset,
    width: HURTBOX.width,
    height: HURTBOX.height,
  };
}

/** Point a shooter's aim angle is measured from: the centre of its drawn torso. */
export function aimOrigin(feetX: number, feetY: number): { x: number; y: number } {
  return { x: feetX, y: feetY - TORSO_OFFSET_Y };
}

export function rectCenter(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

export function rectContains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
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
