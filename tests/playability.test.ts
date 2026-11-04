import { describe, expect, it } from 'vitest';
import { loadMap, pathBetween, samplePath, type MapObject } from './support/encounter-metrics';
import { PLAYER, TILE, VISION } from '../src/core/constants';
import { ENEMIES } from '../src/data/enemies';
import { WEAPONS } from '../src/data/weapons';

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

describe('4. documented pacing and escape arithmetic', () => {
  /**
   * These are NOT balance assertions - nothing here says the numbers are right.
   * They record the arithmetic the playthroughs ran into, so that a future
   * change to a speed or a damage value shows up as a deliberate decision
   * rather than a surprise.
   */
  it('records that a crouched player cannot outrun a pursuing Lookout', () => {
    // Crouch 66 px/s against combatSpeed 66 px/s: breaking away requires
    // standing up (108) or sprinting (152). The harness learned this the hard
    // way - crouch-fleeing is fatal.
    expect(PLAYER.speedCrouch).toBe(ENEMIES.lookout.combatSpeed);
    expect(PLAYER.speedWalk).toBeGreaterThan(ENEMIES.lookout.combatSpeed);
    expect(PLAYER.speedSprint).toBeGreaterThan(ENEMIES.lookout.combatSpeed);
  });

  it('records time-to-death under sustained fire', () => {
    const hits = Math.ceil(PLAYER.maxHp / ENEMIES.lookout.damage);
    const onePlusTelegraph = ENEMIES.lookout.attackInterval;
    // One Lookout: 9 hits, 1.4 s apart.
    expect(hits).toBe(9);
    const soloSeconds = (hits - 1) * onePlusTelegraph;
    expect(soloSeconds).toBeCloseTo(11.2, 1);
    // Two Lookouts roughly halve it, which is what killed two of three sprints.
    expect(soloSeconds / 2).toBeLessThan(6);
  });

  it('records that a sprinter is detected faster than they can cross a cone', () => {
    // 120/s sprinting against a 100 threshold: 0.84 s of exposure is a fight.
    const secondsToDetect = VISION.combatThreshold / VISION.ratesSprinting;
    expect(secondsToDetect).toBeLessThan(0.9);
    const pxCovered = secondsToDetect * PLAYER.speedSprint;
    expect(pxCovered).toBeLessThan(VISION.maxDistance);
  });

  it('records that the pistol kills a Lookout in two body hits', () => {
    // The combat scenario measured exactly 2 kills from 4 shots; this is why.
    const perShot = WEAPONS.pistol.damagePerRay * WEAPONS.pistol.rays;
    expect(perShot).toBe(34);
    expect(Math.ceil(ENEMIES.lookout.hp / perShot)).toBe(2);
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
