import { describe, expect, it } from 'vitest';
import { Grid } from '../src/core/Grid';
import { TILE } from '../src/core/constants';
import { aimOrigin, bulletHitbox, drawnTorso, rayRectEntry, rectCenter } from '../src/core/hitbox';

/**
 * Hit detection from all four cardinal directions and across cover boundaries.
 *
 * The rule under test: aiming at the VISIBLE torso registers a hit unless cover
 * intercepts the shot, and missing the visible torso never produces an invisible
 * hit - while cover blocks exactly what it visually blocks.
 *
 * These two requirements only hold together because the aim angle is measured
 * in screen space (shooter's drawn torso -> crosshair) and then resolved in the
 * ground plane (shooter position -> target hitbox). `shoot` below reproduces
 * that pipeline exactly as Village.sampleInput and Combat.playerFire do it.
 *
 * An earlier version resolved the shot against the drawn torso rectangle in the
 * tile grid's space. That put the ray about one tile north of the ground line,
 * so bullets sailed over cover standing between the two actors. The
 * "cover in the line of fire" cases below are the regression guard.
 */

const c = (tx: number, ty: number) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });

/** Enemy standing in the middle of an open grid. */
const ENEMY = c(10, 10);
/** Where the crosshair sits when the player aims at the enemy's visible torso. */
const visibleTorso = () => rectCenter(drawnTorso(ENEMY.x, ENEMY.y));

function shoot(
  grid: Grid,
  shooter: { x: number; y: number },
  crosshair: { x: number; y: number },
  range = 220
): { hit: boolean; blockedByCover: boolean } {
  // 1. Screen space: angle from the shooter's drawn torso to the crosshair.
  const from = aimOrigin(shooter.x, shooter.y);
  const angle = Math.atan2(crosshair.y - from.y, crosshair.x - from.x);
  // 2. Ground plane: occlusion, then the hit test bounded by the wall distance.
  const wall = grid.raycastShot(shooter, angle, range);
  const entry = rayRectEntry(
    shooter.x,
    shooter.y,
    Math.cos(angle),
    Math.sin(angle),
    bulletHitbox(ENEMY.x, ENEMY.y),
    wall.distance
  );
  return { hit: entry !== null, blockedByCover: wall.blocked };
}

describe('aiming at the visible torso from each cardinal direction', () => {
  const open = () => new Grid(24, 24);

  it('registers from the west', () => {
    expect(shoot(open(), c(4, 10), visibleTorso()).hit).toBe(true);
  });

  it('registers from the east', () => {
    expect(shoot(open(), c(16, 10), visibleTorso()).hit).toBe(true);
  });

  it('registers from the north', () => {
    expect(shoot(open(), c(10, 4), visibleTorso()).hit).toBe(true);
  });

  it('registers from the south', () => {
    expect(shoot(open(), c(10, 16), visibleTorso()).hit).toBe(true);
  });

  it('registers on all four diagonals', () => {
    for (const [tx, ty] of [
      [5, 5],
      [15, 5],
      [5, 15],
      [15, 15],
    ]) {
      expect(shoot(open(), c(tx, ty), visibleTorso()).hit, `from ${tx},${ty}`).toBe(true);
    }
  });

  it('registers at point blank', () => {
    expect(shoot(open(), c(10, 11), visibleTorso()).hit).toBe(true);
  });
});

describe('missing the visible torso never produces an invisible hit', () => {
  const open = () => new Grid(24, 24);

  it('misses when aimed well below the body', () => {
    expect(shoot(open(), c(4, 10), { x: ENEMY.x, y: ENEMY.y + 24 }).hit).toBe(false);
  });

  it('misses when aimed well above the head', () => {
    expect(shoot(open(), c(4, 10), { x: ENEMY.x, y: ENEMY.y - 48 }).hit).toBe(false);
  });

  it('misses when aimed a tile to the side', () => {
    const aside = { x: ENEMY.x + TILE + 8, y: visibleTorso().y };
    expect(shoot(open(), c(10, 16), aside).hit).toBe(false);
  });

  it('misses when the enemy is behind the shooter', () => {
    const behind = { x: c(4, 10).x - 60, y: visibleTorso().y };
    expect(shoot(open(), c(4, 10), behind).hit).toBe(false);
  });

  it('misses beyond the weapon range', () => {
    expect(shoot(open(), c(4, 10), visibleTorso(), 40).hit).toBe(false);
  });
});

describe('cover boundaries', () => {
  function high(tx: number, ty: number): Grid {
    const g = new Grid(24, 24);
    g.merge(tx, ty, { collides: true, blocksSight: true });
    return g;
  }

  it('cover directly in the line of fire stops the shot, from the west', () => {
    const result = shoot(high(7, 10), c(4, 10), visibleTorso());
    expect(result.blockedByCover).toBe(true);
    expect(result.hit).toBe(false);
  });

  it('cover directly in the line of fire stops the shot, from the north', () => {
    expect(shoot(high(10, 7), c(10, 4), visibleTorso()).hit).toBe(false);
  });

  it('cover directly in the line of fire stops the shot, from the south', () => {
    expect(shoot(high(10, 13), c(10, 16), visibleTorso()).hit).toBe(false);
  });

  it('cover directly in the line of fire stops the shot, from the east', () => {
    expect(shoot(high(13, 10), c(16, 10), visibleTorso()).hit).toBe(false);
  });

  it('cover one tile off the line of fire does not stop the shot', () => {
    expect(shoot(high(7, 8), c(4, 10), visibleTorso()).hit).toBe(true);
    expect(shoot(high(7, 12), c(4, 10), visibleTorso()).hit).toBe(true);
  });

  it('low cover stops the bullet even though it would not hide a standing target', () => {
    const g = new Grid(24, 24);
    g.merge(7, 10, { collides: true, lowCover: true });
    expect(shoot(g, c(4, 10), visibleTorso()).hit).toBe(false);
    // Sight is a separate question: low cover only hides a crouched target.
    expect(g.hasLineOfSight(c(4, 10), ENEMY, false)).toBe(true);
    expect(g.hasLineOfSight(c(4, 10), ENEMY, true)).toBe(false);
  });

  it('an enemy hugging its own cover is not hittable through it', () => {
    expect(shoot(high(9, 10), c(4, 10), visibleTorso()).hit).toBe(false);
  });

  it('the same enemy is hittable once the shooter flanks the cover', () => {
    expect(shoot(high(9, 10), c(10, 16), visibleTorso()).hit).toBe(true);
  });

  it('agrees with line of sight: if a guard can see the spot, a bullet reaches it', () => {
    const g = high(7, 10);
    expect(g.hasLineOfSight(c(4, 10), ENEMY, false)).toBe(false);
    expect(shoot(g, c(4, 10), visibleTorso()).hit).toBe(false);
  });
});

describe('the two box readings stay consistent', () => {
  it('puts the ground hitbox on the actor and the drawn torso above it', () => {
    const ground = bulletHitbox(100, 200);
    const drawn = drawnTorso(100, 200);
    expect(ground.y).toBeGreaterThan(drawn.y);
    expect(rectCenter(ground)).toEqual({ x: 100, y: 200 });
    expect(rectCenter(drawn)).toEqual({ x: 100, y: 185 });
    expect(aimOrigin(100, 200)).toEqual({ x: 100, y: 185 });
  });

  it('keeps the bullet hitbox smaller than the whole sprite rectangle', () => {
    const ground = bulletHitbox(100, 200);
    expect(ground.width).toBeLessThan(24);
    expect(ground.height).toBeLessThan(32);
  });
});
