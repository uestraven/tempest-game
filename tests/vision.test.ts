import { describe, expect, it } from 'vitest';
import { Grid } from '../src/core/Grid';
import { TILE, VISION } from '../src/core/constants';
import { alertLevelFor, canSee, stepSuspicion, suspicionRate } from '../src/systems/Vision';

const c = (tx: number, ty: number) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });
const openGrid = () => new Grid(40, 40);

const target = (
  pos: { x: number; y: number },
  stance: 'standing' | 'crouching' | 'sprinting' = 'standing',
  inShadow = false
) => ({ pos, stance, inShadow });

describe('vision cone', () => {
  it('sees a target straight ahead inside range', () => {
    const result = canSee(openGrid(), { pos: c(2, 2), facing: 0 }, target(c(8, 2)));
    expect(result.visible).toBe(true);
  });

  it('cannot see a target behind it', () => {
    const result = canSee(openGrid(), { pos: c(8, 2), facing: 0 }, target(c(2, 2)));
    expect(result.visible).toBe(false);
  });

  it('cannot see past the maximum sight distance', () => {
    const far = { x: c(2, 2).x + VISION.maxDistance + 8, y: c(2, 2).y };
    const result = canSee(openGrid(), { pos: c(2, 2), facing: 0 }, target(far));
    expect(result.visible).toBe(false);
  });

  it('cannot see through a wall', () => {
    const g = openGrid();
    for (let y = 0; y < 40; y++) g.merge(5, y, { collides: true, blocksSight: true });
    const result = canSee(g, { pos: c(2, 2), facing: 0 }, target(c(8, 2)));
    expect(result.visible).toBe(false);
  });

  it('respects the 100 degree total cone', () => {
    const observer = { pos: c(2, 2), facing: 0 };
    // 49 degrees off-centre is inside the cone; 51 degrees is outside.
    const at = (deg: number) => {
      const r = (deg * Math.PI) / 180;
      return target({
        x: observer.pos.x + Math.cos(r) * 100,
        y: observer.pos.y + Math.sin(r) * 100,
      });
    };
    expect(canSee(openGrid(), observer, at(49)).visible).toBe(true);
    expect(canSee(openGrid(), observer, at(51)).visible).toBe(false);
  });
});

describe('suspicion rates', () => {
  const far = VISION.proximityDistance + 10;

  it('matches the locked calibration values', () => {
    expect(suspicionRate(target(c(0, 0), 'standing'), far)).toBe(80);
    expect(suspicionRate(target(c(0, 0), 'crouching'), far)).toBe(45);
    expect(suspicionRate(target(c(0, 0), 'crouching', true), far)).toBe(28);
    expect(suspicionRate(target(c(0, 0), 'sprinting'), far)).toBe(120);
  });

  it('applies the proximity multiplier within 48 px', () => {
    expect(suspicionRate(target(c(0, 0), 'standing'), 40)).toBeCloseTo(120);
  });

  it('slows but never negates detection when crouching in the open', () => {
    expect(suspicionRate(target(c(0, 0), 'crouching'), far)).toBeGreaterThan(0);
  });
});

describe('suspicion integration', () => {
  it('clamps to the combat threshold', () => {
    expect(stepSuspicion(95, 80, 1, true)).toBe(VISION.combatThreshold);
  });

  it('decays once sight is lost and never goes negative', () => {
    expect(stepSuspicion(10, 80, 1, false)).toBe(0);
    expect(stepSuspicion(50, 0, 1, false)).toBeCloseTo(50 - VISION.decayPerSecond);
  });

  it('maps values onto the three alert levels', () => {
    expect(alertLevelFor(0)).toBe('unaware');
    expect(alertLevelFor(29)).toBe('unaware');
    expect(alertLevelFor(30)).toBe('suspicious');
    expect(alertLevelFor(99)).toBe('suspicious');
    expect(alertLevelFor(100)).toBe('combat');
  });
});
