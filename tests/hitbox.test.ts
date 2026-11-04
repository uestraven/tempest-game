import { describe, expect, it } from 'vitest';
import {
  TORSO_OFFSET_Y,
  bulletHitbox,
  drawnTorso,
  rayRectEntry,
  rectContains,
} from '../src/core/hitbox';
import { HURTBOX, PLAYER } from '../src/core/constants';

/** Unit direction for an angle in radians. */
const dir = (a: number) => ({ dx: Math.cos(a), dy: Math.sin(a) });

describe('drawn torso geometry (screen space)', () => {
  const feetX = 100;
  const feetY = 200;
  const box = drawnTorso(feetX, feetY);

  it('is 12 x 18, centred on x and spanning y-24 to y-6', () => {
    expect(box.width).toBe(12);
    expect(box.height).toBe(18);
    expect(box.x).toBe(feetX - 6);
    expect(box.y).toBe(feetY - 24);
    expect(box.y + box.height).toBe(feetY - 6);
  });

  it('is distinct from the movement collision body', () => {
    // The feet box is 12x10 at the sprite's base; the hurtbox must not be it.
    expect(HURTBOX.height).not.toBe(PLAYER.bodyHeight);
    expect(box.y + box.height).toBeLessThan(feetY);
  });

  it('contains the torso but not the feet or the head top', () => {
    expect(rectContains(box, feetX, feetY - 15)).toBe(true);
    expect(rectContains(box, feetX, feetY - 1)).toBe(false);
    expect(rectContains(box, feetX, feetY - 30)).toBe(false);
  });
});

describe('ground-plane bullet hitbox', () => {
  it('is 12 x 18 centred on the actor position', () => {
    const box = bulletHitbox(100, 200);
    expect(box).toEqual({ x: 94, y: 191, width: 12, height: 18 });
  });

  it('is the drawn torso shifted down by exactly the render offset', () => {
    const ground = bulletHitbox(100, 200);
    const drawn = drawnTorso(100, 200);
    expect(ground.y - drawn.y).toBe(TORSO_OFFSET_Y);
    expect(ground.width).toBe(drawn.width);
    expect(ground.height).toBe(drawn.height);
  });

  it('contains the actor position itself, so a point-blank shot cannot miss', () => {
    expect(rectContains(bulletHitbox(100, 200), 100, 200)).toBe(true);
  });
});

describe('ray against the drawn torso rectangle', () => {
  const box = drawnTorso(100, 200); // x 94..106, y 176..194

  it('hits a shot aimed level with the torso', () => {
    const { dx, dy } = dir(0);
    const entry = rayRectEntry(0, 185, dx, dy, box, 400);
    expect(entry).toBeCloseTo(94);
  });

  it('misses a shot aimed at the feet', () => {
    const { dx, dy } = dir(0);
    expect(rayRectEntry(0, 199, dx, dy, box, 400)).toBeNull();
  });

  it('misses a shot aimed over the head', () => {
    const { dx, dy } = dir(0);
    expect(rayRectEntry(0, 170, dx, dy, box, 400)).toBeNull();
  });

  it('misses a shot that passes beside the body', () => {
    const { dx, dy } = dir(-Math.PI / 2); // straight up
    expect(rayRectEntry(80, 300, dx, dy, box, 400)).toBeNull();
  });

  it('hits on the exact edge of the box', () => {
    const { dx, dy } = dir(0);
    expect(rayRectEntry(0, 176, dx, dy, box, 400)).toBeCloseTo(94);
    expect(rayRectEntry(0, 194, dx, dy, box, 400)).toBeCloseTo(94);
  });

  it('returns 0 for a muzzle already inside the box, so point blank registers', () => {
    const { dx, dy } = dir(0);
    expect(rayRectEntry(100, 185, dx, dy, box, 400)).toBe(0);
  });

  it('does not hit behind the shooter', () => {
    const { dx, dy } = dir(Math.PI); // facing left, box is to the right
    expect(rayRectEntry(0, 185, dx, dy, box, 400)).toBeNull();
  });

  it('respects the weapon range', () => {
    const { dx, dy } = dir(0);
    expect(rayRectEntry(0, 185, dx, dy, box, 90)).toBeNull();
    expect(rayRectEntry(0, 185, dx, dy, box, 95)).toBeCloseTo(94);
  });

  it('hits on a diagonal that crosses the torso', () => {
    // From below-left, angled up and right through the middle of the box.
    const from = { x: 70, y: 215 };
    const to = { x: 100, y: 185 };
    const len = Math.hypot(to.x - from.x, to.y - from.y);
    const entry = rayRectEntry(
      from.x,
      from.y,
      (to.x - from.x) / len,
      (to.y - from.y) / len,
      box,
      400
    );
    expect(entry).not.toBeNull();
    expect(entry!).toBeLessThan(len);
  });

  it('reports the nearer of two stacked bodies first', () => {
    const near = drawnTorso(100, 200);
    const far = drawnTorso(160, 200);
    const { dx, dy } = dir(0);
    const a = rayRectEntry(0, 185, dx, dy, near, 400)!;
    const b = rayRectEntry(0, 185, dx, dy, far, 400)!;
    expect(a).toBeLessThan(b);
  });
});
