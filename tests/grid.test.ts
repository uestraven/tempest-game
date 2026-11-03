import { describe, expect, it } from 'vitest';
import { Grid, angleDelta } from '../src/core/Grid';
import { TILE } from '../src/core/constants';

/** Centre of tile (tx, ty) in world pixels. */
const c = (tx: number, ty: number) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });

function gridWithWallColumn(column: number, fromY: number, toY: number): Grid {
  const g = new Grid(12, 12);
  for (let y = fromY; y <= toY; y++) g.merge(column, y, { collides: true, blocksSight: true });
  return g;
}

describe('line of sight', () => {
  it('is blocked by a solid wall', () => {
    const g = gridWithWallColumn(5, 0, 11);
    expect(g.hasLineOfSight(c(1, 1), c(9, 1), false)).toBe(false);
  });

  it('is clear when nothing intervenes', () => {
    const g = gridWithWallColumn(5, 0, 11);
    expect(g.hasLineOfSight(c(1, 1), c(4, 1), false)).toBe(true);
  });

  it('does not see around a corner', () => {
    const g = new Grid(12, 12);
    // Solid block with a diagonal relationship to both endpoints.
    g.merge(5, 5, { collides: true, blocksSight: true });
    g.merge(5, 6, { collides: true, blocksSight: true });
    g.merge(6, 5, { collides: true, blocksSight: true });
    g.merge(6, 6, { collides: true, blocksSight: true });
    expect(g.hasLineOfSight(c(4, 4), c(7, 7), false)).toBe(false);
  });

  it('hides a crouching target behind low cover but not a standing one', () => {
    const g = new Grid(12, 12);
    g.merge(5, 1, { collides: true, lowCover: true });
    expect(g.hasLineOfSight(c(1, 1), c(9, 1), true)).toBe(false);
    expect(g.hasLineOfSight(c(1, 1), c(9, 1), false)).toBe(true);
  });
});

describe('hitscan', () => {
  it('stops at the first solid tile, so a player is never shot through a wall', () => {
    const g = gridWithWallColumn(5, 0, 11);
    const hit = g.raycastShot(c(1, 1), 0, 220);
    expect(hit.blocked).toBe(true);
    expect(hit.tileX).toBe(5);
    // Impact lands on the near face of tile 5 (x = 80), 56 px from the muzzle at x = 24.
    expect(hit.distance).toBeCloseTo(5 * TILE - (TILE + TILE / 2), 4);
  });

  it('is blocked by low cover regardless of stance', () => {
    const g = new Grid(12, 12);
    g.merge(5, 1, { collides: true, lowCover: true });
    expect(g.raycastShot(c(1, 1), 0, 220).blocked).toBe(true);
  });

  it('travels the full range when unobstructed', () => {
    const g = new Grid(40, 12);
    const hit = g.raycastShot(c(1, 1), 0, 220);
    expect(hit.blocked).toBe(false);
    expect(hit.distance).toBe(220);
  });

  it('treats out-of-bounds as solid', () => {
    const g = new Grid(6, 6);
    expect(g.raycastShot(c(1, 1), 0, 400).blocked).toBe(true);
  });
});

describe('pathfinding', () => {
  it('finds no path through a sealed wall', () => {
    const g = gridWithWallColumn(5, 0, 11);
    expect(g.findPath(c(1, 1), c(9, 1))).toBeNull();
  });

  it('routes through a gap in the wall', () => {
    const g = gridWithWallColumn(5, 0, 10); // row 11 left open
    const path = g.findPath(c(1, 1), c(9, 1));
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(8);
    // Every step stays on open ground.
    for (const step of path!) expect(g.isSolidWorld(step.x, step.y)).toBe(false);
  });

  it('does not squeeze diagonally between two solids', () => {
    const g = new Grid(8, 8);
    g.merge(4, 3, { collides: true });
    g.merge(3, 4, { collides: true });
    const path = g.findPath(c(3, 3), c(4, 4));
    expect(path).not.toBeNull();
    // A corner-cutting path would be a single diagonal step.
    expect(path!.length).toBeGreaterThan(1);
  });
});

describe('angleDelta', () => {
  it('returns the shortest signed difference', () => {
    expect(angleDelta(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(angleDelta(0, -Math.PI / 2)).toBeCloseTo(-Math.PI / 2);
    expect(Math.abs(angleDelta(0.1, 0.1 + Math.PI * 2))).toBeLessThan(1e-9);
  });
});
