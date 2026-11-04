import { describe, expect, it } from 'vitest';
import { loadMap, pathBetween, samplePath, type MapObject } from './support/encounter-metrics';
import { PLAYER, SOUND_RADIUS, TILE, VISION } from '../src/core/constants';
import { ENEMIES } from '../src/data/enemies';
import { WEAPONS } from '../src/data/weapons';
import { Grid } from '../src/core/Grid';
import { canSee, stepSuspicion, suspicionRate } from '../src/systems/Vision';
import { SOUND_REFRACTORY, SOUND_SCATTER } from '../src/systems/Hearing';

/**
 * Deterministic playability invariants, added in Phase C.1B-04A.
 *
 * Every one of these pins something the end-to-end playthrough harness
 * actually tripped over, so they are regressions in the literal sense rather
 * than speculative assertions. The harness itself lives in
 * tools/playthrough.mjs and needs a browser; these run headless in CI.
 */

const map = loadMap();
const byName = (name: string): MapObject => {
  const found = map.objects.find((o) => o.name === name);
  if (!found) throw new Error(`map has no object named "${name}"`);
  return found;
};
const walkable = (tx: number, ty: number) => !map.grid.solidAt(tx, ty);

/** Every interactable the mission requires. */
const MANDATORY = [
  'interact_tracks',
  'interact_stall',
  'interact_waybill',
  'interact_ledger',
  'interact_van',
  'interact_inscription',
];

describe('1. every mandatory interactable can actually be reached and used', () => {
  /**
   * `Interaction.resolve` needs BOTH distance <= interactRange and clear reach
   * from the player's ground point. An object authored just outside that from
   * every standable tile would be visible, glinting and impossible - which is
   * exactly the failure mode the harness hit at 31 px against a 28 px range.
   */
  it('gives each one a standable tile inside interactRange with clear reach', () => {
    for (const name of MANDATORY) {
      const o = byName(name);
      const tx = Math.floor(o.x / TILE);
      const ty = Math.floor(o.y / TILE);
      let usable = 0;
      let closest = Infinity;
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const sx = tx + dx;
          const sy = ty + dy;
          if (!walkable(sx, sy)) continue;
          const from = { x: sx * TILE + TILE / 2, y: sy * TILE + TILE / 2 };
          const dist = Math.hypot(from.x - o.x, from.y - o.y);
          closest = Math.min(closest, dist);
          if (dist > PLAYER.interactRange) continue;
          if (!map.grid.hasClearReach(from, { x: o.x, y: o.y })) continue;
          usable++;
        }
      }
      expect(
        usable,
        `${name}: no standable tile within ${PLAYER.interactRange}px with clear reach ` +
          `(closest walkable tile centre is ${Math.round(closest)}px)`
      ).toBeGreaterThan(0);
    }
  });

  it('keeps each one reachable from spawn by a walkable route', () => {
    const spawn = byName('spawn');
    for (const name of MANDATORY)
      expect(pathBetween(map.grid, spawn, byName(name)), name).not.toBeNull();
  });
});

describe('2. the exit trigger can be stood in', () => {
  /**
   * `checkExit` tests `exitZone.contains(player.x, player.y)` against the
   * player's feet. A rectangle whose walkable tiles all lie outside it would
   * make the mission uncompletable; the harness initially stopped 8 px south of
   * this rectangle and the mission silently would not end.
   */
  it('contains at least one walkable tile, and names its rectangle honestly', () => {
    const exit = byName('exit_north');
    expect(exit.width).toBeGreaterThan(0);
    expect(exit.height).toBeGreaterThan(0);

    const inside: { x: number; y: number }[] = [];
    for (let ty = Math.floor(exit.y / TILE); ty < Math.ceil((exit.y + exit.height) / TILE); ty++) {
      for (let tx = Math.floor(exit.x / TILE); tx < Math.ceil((exit.x + exit.width) / TILE); tx++) {
        if (!walkable(tx, ty)) continue;
        const centre = { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
        const within =
          centre.x >= exit.x &&
          centre.x <= exit.x + exit.width &&
          centre.y >= exit.y &&
          centre.y <= exit.y + exit.height;
        if (within) inside.push(centre);
      }
    }
    expect(inside.length, 'no walkable tile centre lies inside the exit rectangle').toBeGreaterThan(
      0
    );
  });

  it('is reachable from the last mandatory beat', () => {
    const exit = byName('exit_north');
    const centre = { x: exit.x + exit.width / 2, y: exit.y + exit.height / 2 };
    expect(pathBetween(map.grid, byName('interact_inscription'), centre)).not.toBeNull();
  });
});

describe('3. alternate evidence sources really do lie on the route', () => {
  /**
   * V2 has two sources: the waybill prop and the overheard conversation, a
   * region trigger. The harness found the trigger firing EN ROUTE to the
   * waybill, which is the design working - but only because the trigger
   * rectangle actually straddles the path. Pin that.
   */
  it('puts the overheard-conversation trigger on the path to the waybill', () => {
    const trigger = byName('trigger_overheard');
    const path = samplePath(map.grid, [
      { x: byName('interact_tracks').x, y: byName('interact_tracks').y },
      { x: byName('interact_waybill').x, y: byName('interact_waybill').y },
    ]);
    expect(path.length).toBeGreaterThan(0);
    const crossings = path.filter(
      (p) =>
        p.x >= trigger.x &&
        p.x <= trigger.x + trigger.width &&
        p.y >= trigger.y &&
        p.y <= trigger.y + trigger.height
    );
    expect(
      crossings.length,
      'the tracks-to-waybill route never enters the overheard trigger, so V2 has ' +
        'one practical source rather than two'
    ).toBeGreaterThan(0);
  });

  it('puts both depot-approach triggers where their branch arrives', () => {
    const spawn = byName('spawn');
    for (const trig of ['trigger_depot_street', 'trigger_depot_garden']) {
      const t = byName(trig);
      const centre = { x: t.x + t.width / 2, y: t.y + t.height / 2 };
      // Reachable, and its own rectangle stands on walkable ground - otherwise
      // the beat it grants could never fire.
      expect(
        walkable(Math.floor(centre.x / TILE), Math.floor(centre.y / TILE)),
        `${trig} centre is solid`
      ).toBe(true);
      expect(pathBetween(map.grid, spawn, centre), trig).not.toBeNull();
    }
    // And they are genuinely separate approaches, not two names for one place.
    const a = byName('trigger_depot_street');
    const b = byName('trigger_depot_garden');
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(200);
  });
});

describe('4. the stealth contract', () => {
  /**
   * Rewritten in Phase C.1B-04B-1. The previous version asserted that
   * `PLAYER.speedCrouch === ENEMIES.lookout.combatSpeed`, which recorded a
   * tuning coincidence as if it were a requirement. The disengagement suite
   * then showed the escape sequence works fine at those speeds, so pinning the
   * equality would have blocked a harmless future tweak while testing nothing
   * about whether stealth actually recovers.
   *
   * These assert the CONTRACT instead. Tuning values are recorded in
   * docs/playtests/valcendre-c1b04b1.md.
   */
  it('gives crouching a real detection advantage', () => {
    const standing = suspicionRate({ pos: { x: 0, y: 0 }, stance: 'standing', inShadow: false }, 100);
    const crouching = suspicionRate({ pos: { x: 0, y: 0 }, stance: 'crouching', inShadow: false }, 100);
    const shadowed = suspicionRate({ pos: { x: 0, y: 0 }, stance: 'crouching', inShadow: true }, 100);
    expect(crouching).toBeLessThan(standing);
    expect(shadowed).toBeLessThan(crouching);
    // Worth having, not merely non-zero: crouching must buy at least 1.5x the
    // time to detection, and shadow more again.
    expect(standing / crouching).toBeGreaterThanOrEqual(1.5);
    expect(standing / shadowed).toBeGreaterThanOrEqual(2.5);
  });

  it('gives standing and sprinting a real mobility advantage', () => {
    // Crouch is for concealment, not for fleeing; the mobility to escape comes
    // from standing up. Both must beat a Lookout's pursuit speed.
    expect(PLAYER.speedWalk).toBeGreaterThan(PLAYER.speedCrouch);
    expect(PLAYER.speedSprint).toBeGreaterThan(PLAYER.speedWalk);
    expect(PLAYER.speedWalk).toBeGreaterThan(ENEMIES.lookout.combatSpeed);
    expect(PLAYER.speedSprint).toBeGreaterThan(ENEMIES.lookout.combatSpeed * 2);
  });

  it('makes mobility cost concealment, so escaping is a real trade', () => {
    const crouch = suspicionRate({ pos: { x: 0, y: 0 }, stance: 'crouching', inShadow: false }, 100);
    const sprint = suspicionRate({ pos: { x: 0, y: 0 }, stance: 'sprinting', inShadow: false }, 100);
    expect(sprint).toBeGreaterThan(crouch);
    // And sprinting is audible while crouching is silent.
    expect(SOUND_RADIUS.footstepCrouch).toBe(0);
    expect(SOUND_RADIUS.footstepSprint).toBeGreaterThan(SOUND_RADIUS.footstepWalk);
  });

  it('lets solid cover break line of sight entirely', () => {
    const grid = new Grid(5, 3);
    for (let x = 0; x < 5; x++) grid.merge(x, 1, { collides: true, blocksSight: true });
    const below = { x: 2 * TILE + 8, y: 2 * TILE + 8 };
    const above = { x: 2 * TILE + 8, y: 8 };
    expect(grid.hasLineOfSight(below, above, false)).toBe(false);
    const observer = { pos: below, facing: -Math.PI / 2 };
    expect(canSee(grid, observer, { pos: above, stance: 'standing', inShadow: false }).visible).toBe(
      false
    );
  });

  it('hides a crouching player behind low cover but not a standing one', () => {
    const grid = new Grid(5, 3);
    grid.merge(2, 1, { collides: true, lowCover: true });
    const below = { x: 2 * TILE + 8, y: 2 * TILE + 8 };
    const above = { x: 2 * TILE + 8, y: 8 };
    expect(grid.hasLineOfSight(below, above, true)).toBe(false);
    expect(grid.hasLineOfSight(below, above, false)).toBe(true);
  });

  it('never lets a sound hand over an exact position, except the radio', () => {
    // A guard that hears you must search an AREA. The radio is the deliberate
    // exception: it is an object in a known place and going to it is the point.
    expect(SOUND_SCATTER.footstep).toBeGreaterThan(0);
    expect(SOUND_SCATTER.gunshot).toBeGreaterThan(0);
    expect(SOUND_SCATTER.distraction).toBe(0);
    // The scatter must be big enough to matter against the body it is hiding.
    expect(SOUND_SCATTER.footstep).toBeGreaterThan(PLAYER.interactRange);
  });

  it('keeps hearing strictly less informative than seeing', () => {
    // Sprint footsteps arrive every 22px of travel. Without rate limiting the
    // implied suspicion gain exceeds the rate for actually seeing a sprinter.
    const stepsPerSecond = PLAYER.speedSprint / 22;
    const bumpPerEvent = 34;
    const unlimited = stepsPerSecond * bumpPerEvent;
    expect(unlimited).toBeGreaterThan(VISION.ratesSprinting); // the defect
    const limited = bumpPerEvent / SOUND_REFRACTORY;
    expect(limited).toBeLessThan(VISION.ratesSprinting); // the fix
  });

  it('lets suspicion decay to patrol from a full alert without being re-bumped', () => {
    // A silent, hidden player must be able to wait a guard out. 100 -> below the
    // 30 threshold at 18/s, inside the 8s investigate timeout.
    const secondsToCalm = (VISION.combatThreshold - VISION.suspiciousThreshold) / VISION.decayPerSecond;
    expect(secondsToCalm).toBeLessThan(VISION.investigateTimeout);
    // VISION is `as const`, so annotate or the literal type 100 is inferred.
    let suspicion: number = VISION.combatThreshold;
    for (let t = 0; t < VISION.investigateTimeout; t += 1 / 60)
      suspicion = stepSuspicion(suspicion, 0, 1 / 60, false);
    expect(suspicion).toBe(0);
  });

  it('records the tuning values the escape sequence was verified against', () => {
    // Documentation, not a requirement: these are the numbers behind the
    // measurements in docs/playtests/valcendre-c1b04b1.md. A change here should
    // prompt a re-run of tools/disengage-tests.mjs, not an automatic failure.
    expect({
      crouch: PLAYER.speedCrouch,
      walk: PLAYER.speedWalk,
      sprint: PLAYER.speedSprint,
      pursuit: ENEMIES.lookout.combatSpeed,
      investigate: ENEMIES.lookout.investigateSpeed,
    }).toEqual({ crouch: 66, walk: 108, sprint: 152, pursuit: 66, investigate: 78 });
  });
});

describe('5. supplies support a combat completion', () => {
  it('places reachable ammunition and medical kits on both branches', () => {
    const spawn = byName('spawn');
    const items = map.objects.filter((o) => o.type === 'item');
    expect(items.length).toBeGreaterThanOrEqual(4);
    for (const item of items)
      expect(pathBetween(map.grid, spawn, item), `${item.name} unreachable`).not.toBeNull();
    expect(items.filter((i) => i.props.kind === 'medkit').length).toBeGreaterThanOrEqual(2);
    expect(items.filter((i) => String(i.props.kind).startsWith('ammo')).length).toBeGreaterThanOrEqual(
      2
    );
  });

  it('carries enough starting rounds to kill more than one guard', () => {
    const pistol = WEAPONS.pistol;
    const perShot = pistol.damagePerRay * pistol.rays;
    const shotsPerKill = Math.ceil(ENEMIES.lookout.hp / perShot);
    expect(pistol.magazine / shotsPerKill).toBeGreaterThanOrEqual(2);
    // And the reserve supports clearing more than one encounter.
    expect((pistol.magazine + pistol.startingReserve) / shotsPerKill).toBeGreaterThanOrEqual(7);
  });
});
