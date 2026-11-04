/**
 * Patrol route selection.
 *
 * Phaser-free so the door interaction can be unit tested: this is the one piece
 * of enemy behaviour Phase C.1B-03 changed, and the reason it changed is that
 * `Grid` is door-aware.
 */

import type { Grid, Vec2 } from '../core/Grid';

/**
 * Index of the next waypoint the actor can actually walk to, searching forward
 * from `startIndex` and wrapping. Returns null when none of them is reachable.
 *
 * WHY THIS EXISTS. A waypoint behind a closed door has no path. Without this,
 * the caller would store an empty path, `followPath` would report "arrived" on
 * the spot, and the guard would tick through its whole route standing still -
 * reading, to a player watching, as a guard that walked through a locked door.
 * Skipping instead means a patrol authored across a door confines itself to the
 * side it is on, and takes up the rest of the route the moment the door opens.
 *
 * Bounded to one pass over the route, so an entirely sealed-off route costs one
 * scan rather than looping forever.
 */
export function nextReachableWaypoint(
  grid: Grid,
  from: Vec2,
  route: Vec2[],
  startIndex: number,
  tolerance: number
): number | null {
  const count = route.length;
  if (count === 0) return null;
  for (let tried = 0; tried < count; tried++) {
    const index = (startIndex + tried) % count;
    const candidate = route[index];
    // Already standing on it: no path needed.
    const here = Math.hypot(candidate.x - from.x, candidate.y - from.y) <= tolerance;
    if (here || grid.findPath(from, candidate)) return index;
  }
  return null;
}
