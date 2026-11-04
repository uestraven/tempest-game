import { describe, expect, it } from 'vitest';
import { nextReachableWaypoint } from '../src/systems/Patrol';
import { Grid } from '../src/core/Grid';
import { TILE } from '../src/core/constants';

/**
 * Regression cover for the one shared enemy behaviour Phase C.1B-03 changed.
 *
 * Before the change, a waypoint with no path produced an empty path, which
 * `Enemy.followPath` reports as "arrived". A guard whose route crossed a locked
 * door therefore ticked through its waypoints without moving, and read as
 * having walked through the door. These tests pin the new rule and the old bug.
 */

const T = (tx: number, ty: number) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });

/**
 * Two rooms, left and right, joined only by a doorway at (3,2).
 *
 *      0 1 2 3 4 5 6
 *   0  . . . # . . .
 *   1  . . . # . . .
 *   2  . . . D . . .      D = door tile, walkable floor with a door on it
 *   3  . . . # . . .
 *   4  . . . # . . .
 */
function twoRooms(): Grid {
  const grid = new Grid(7, 5);
  for (let y = 0; y < 5; y++)
    if (y !== 2) grid.merge(3, y, { collides: true, blocksSight: true });
  grid.setDoor(3, 2, true);
  return grid;
}

const LEFT = T(1, 2);
const RIGHT = T(5, 2);

describe('patrol waypoint selection', () => {
  it('returns the current waypoint when it is reachable', () => {
    const grid = twoRooms();
    const route = [T(1, 0), T(1, 4)];
    expect(nextReachableWaypoint(grid, LEFT, route, 0, 5)).toBe(0);
    expect(nextReachableWaypoint(grid, LEFT, route, 1, 5)).toBe(1);
  });

  it('skips a waypoint sealed behind a closed door', () => {
    const grid = twoRooms();
    // Waypoint 0 is in the right room, waypoint 1 is in the left room with the
    // guard. With the door closed, only waypoint 1 can be reached.
    const route = [RIGHT, T(1, 4)];
    expect(nextReachableWaypoint(grid, LEFT, route, 0, 5)).toBe(1);
  });

  it('takes up the skipped waypoint once the door opens', () => {
    const grid = twoRooms();
    const route = [RIGHT, T(1, 4)];
    expect(nextReachableWaypoint(grid, LEFT, route, 0, 5)).toBe(1);
    grid.setDoor(3, 2, false);
    expect(nextReachableWaypoint(grid, LEFT, route, 0, 5)).toBe(0);
  });

  it('returns null when every waypoint is cut off, instead of looping', () => {
    const grid = twoRooms();
    // Both waypoints are in the far room; the guard is sealed away from both.
    const route = [RIGHT, T(5, 0), T(5, 4)];
    expect(nextReachableWaypoint(grid, LEFT, route, 0, 5)).toBeNull();
  });

  it('wraps around the route rather than only searching forward to the end', () => {
    const grid = twoRooms();
    const route = [T(1, 0), RIGHT, T(5, 4)];
    // Starting at index 1, both 1 and 2 are sealed; the answer is index 0.
    expect(nextReachableWaypoint(grid, LEFT, route, 1, 5)).toBe(0);
  });

  it('accepts the waypoint it is already standing on without pathfinding', () => {
    const grid = twoRooms();
    // A zero-length route would otherwise be asked of findPath. The guard is
    // within tolerance of waypoint 0, so it is chosen directly.
    const route = [{ x: LEFT.x + 2, y: LEFT.y + 2 }, RIGHT];
    expect(nextReachableWaypoint(grid, LEFT, route, 0, 5)).toBe(0);
  });

  it('handles an empty route without throwing', () => {
    expect(nextReachableWaypoint(twoRooms(), LEFT, [], 0, 5)).toBeNull();
  });

  it('pins the bug it fixes: a sealed waypoint has no path at all', () => {
    // This is what used to be read as "arrived".
    const grid = twoRooms();
    expect(grid.findPath(LEFT, RIGHT)).toBeNull();
    grid.setDoor(3, 2, false);
    expect(grid.findPath(LEFT, RIGHT)).not.toBeNull();
  });

  it('is unaffected by doors on routes that do not cross one', () => {
    const grid = twoRooms();
    const route = [T(1, 0), T(2, 4), T(0, 3)];
    for (let i = 0; i < route.length; i++)
      expect(nextReachableWaypoint(grid, LEFT, route, i, 5)).toBe(i);
  });
});
