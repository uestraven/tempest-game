import { describe, expect, it } from 'vitest';
import {
  acousticLinksAlongPatrol,
  doorAudit,
  exposedFraction,
  exposure,
  guardsFromMap,
  loadMap,
  maxShooters,
  patrolMetrics,
  patrolPosts,
  samplePath,
  sealedGrid,
  staticPosts,
  type MapObject,
} from './support/encounter-metrics';
import { TILE, VISION } from '../src/core/constants';
import { ENEMIES } from '../src/data/enemies';
import { canSee } from '../src/systems/Vision';
import { Grid } from '../src/core/Grid';
import { enemyRosterMatches, type EnemySnapshot } from '../src/systems/Save';

/**
 * Valcendre's seven-guard encounter design (Phase C.1B-03).
 *
 * Measured over the SHIPPED map with the engine's own `Grid`, `canSee` and
 * `Hearing` attenuation rule, so a change to detection or to the geometry moves
 * these numbers rather than quietly leaving them stale.
 *
 * TWO COVERAGE METRICS, never mixed:
 *  - static-post: the authored spawn and facing. This is the C.1A section 1.4
 *    method, which is what the >= 45% design target is stated against.
 *  - patrol: the union over the whole route. Strictly larger, worst case.
 */

const map = loadMap();
const guards = guardsFromMap(map);
const byName = (name: string): MapObject => {
  const found = map.objects.find((o) => o.name === name);
  if (!found) throw new Error(`map has no object named "${name}"`);
  return found;
};
const T = (tx: number, ty: number) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });

const statics = staticPosts(guards);
const patrols = patrolPosts(map.grid, guards);

/** The mandatory beat sequence, main-street branch. */
const MAIN = [
  byName('spawn'),
  byName('interact_tracks'),
  byName('interact_waybill'),
  T(39, 48),
  T(77, 42),
  byName('interact_ledger'),
  T(82, 20),
  byName('interact_van'),
  byName('actor_cultist'),
  byName('interact_inscription'),
  { x: byName('exit_north').x + 24, y: byName('exit_north').y + 16 },
].map((p) => ({ x: p.x, y: p.y }));

/** The same chain by the garden branch. */
const GARDEN = [
  byName('spawn'),
  byName('interact_tracks'),
  byName('interact_waybill'),
  T(17, 31),
  T(52, 27),
  byName('interact_ledger'),
  T(82, 20),
  byName('interact_van'),
  byName('actor_cultist'),
  byName('interact_inscription'),
  { x: byName('exit_north').x + 24, y: byName('exit_north').y + 16 },
].map((p) => ({ x: p.x, y: p.y }));

const mainSamples = samplePath(map.grid, MAIN);
const gardenSamples = samplePath(map.grid, GARDEN);

// ------------------------------------------------------------- 1. the roster

describe('1. exactly seven Lookouts, all valid', () => {
  it('authors seven guards with stable ids', () => {
    expect(guards).toHaveLength(7);
    expect(guards.map((g) => g.name)).toEqual([
      'enemy_l1',
      'enemy_l2',
      'enemy_l3',
      'enemy_l4',
      'enemy_l5',
      'enemy_l6',
      'enemy_l7',
    ]);
  });

  it('leaves the obsolete three-guard layout behind with no duplicates', () => {
    const names = map.objects.filter((o) => o.type === 'enemy').map((o) => o.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('makes every guard a Lookout, so no new archetype is introduced', () => {
    for (const g of guards) expect(g.kind, g.name).toBe('lookout');
  });

  it('stands every spawn and every patrol waypoint on walkable ground', () => {
    for (const g of guards) {
      expect(map.grid.solidAt(Math.floor(g.x / TILE), Math.floor(g.y / TILE)), g.name).toBe(false);
      const m = patrolMetrics(map.grid, g);
      expect(m.allWalkable, `${g.name} has a waypoint on a solid tile`).toBe(true);
      expect(m.allLegsPathable, `${g.name} has an unpathable leg`).toBe(true);
    }
  });

  it('keeps every waypoint route id matched to exactly one guard', () => {
    const routeIds = map.objects
      .filter((o) => o.type === 'waypoint')
      .map((o) => String(o.props.route));
    const guardRoutes = map.objects
      .filter((o) => o.type === 'enemy')
      .map((o) => String(o.props.route));
    for (const id of new Set(routeIds))
      expect(guardRoutes.filter((r) => r === id), `route ${id}`).toHaveLength(1);
  });

  it('does not touch the global detection or enemy constants', () => {
    // The encounter is built from facing and position, never from a wider cone.
    expect(VISION.coneDegrees).toBe(100);
    expect(VISION.maxDistance).toBe(176);
    expect(VISION.ratesStanding).toBe(80);
    expect(VISION.ratesCrouching).toBe(45);
    expect(VISION.ratesCrouchingShadow).toBe(28);
    expect(VISION.ratesSprinting).toBe(120);
    expect(ENEMIES.lookout.hp).toBe(60);
    expect(ENEMIES.lookout.damage).toBe(12);
    expect(ENEMIES.lookout.patrolSpeed).toBe(44);
    expect(ENEMIES.lookout.engageRange).toBe(170);
  });
});

// ------------------------------------------------------- 2. patrols vs posts

describe('2. mobile patrols carry distance, sentries do not pretend to', () => {
  /** The four guards the design calls mobile. */
  const MOBILE = ['enemy_l2', 'enemy_l4', 'enemy_l6', 'enemy_l7'];
  /** Sentries with short authored position shifts. */
  const SENTRIES = ['enemy_l1', 'enemy_l3', 'enemy_l5'];

  it('gives every mobile patrol a loop of at least 450 px AND at least 14 s', () => {
    for (const name of MOBILE) {
      const g = guards.find((x) => x.name === name)!;
      const m = patrolMetrics(map.grid, g);
      expect(m.loopPixels, `${name} loop px`).toBeGreaterThanOrEqual(450);
      expect(m.loopSeconds, `${name} loop seconds`).toBeGreaterThanOrEqual(14);
    }
  });

  it('measures loops by traversal, not by straight lines', () => {
    // A* travel is at least the straight-line sum; where it is longer, the
    // straight-line figure was understating the patrol.
    for (const g of guards) {
      const m = patrolMetrics(map.grid, g);
      if (m.waypoints < 2) continue;
      expect(m.loopPixels, `${g.name}`).toBeGreaterThanOrEqual(m.straightLinePixels - 1);
    }
  });

  it('leaves the sentries short on purpose rather than padding them', () => {
    for (const name of SENTRIES) {
      const g = guards.find((x) => x.name === name)!;
      const m = patrolMetrics(map.grid, g);
      expect(m.waypoints, `${name} should be a short shift`).toBeLessThanOrEqual(2);
      // Short, but not stationary: a sentry that never moves never re-scans.
      expect(m.loopPixels, `${name} should still shift`).toBeGreaterThan(0);
    }
  });
});

// ------------------------------------------------------------- 3. exposure

describe('3. critical-path exposure meets the design target', () => {
  it('exposes at least 45% of the main critical path from authored posts', () => {
    const e = exposure(map.grid, statics, mainSamples);
    expect(mainSamples.length).toBeGreaterThan(150);
    expect(exposedFraction(e)).toBeGreaterThanOrEqual(0.45);
  });

  it('never puts more than three effective shooters on a critical-path sample', () => {
    for (const samples of [mainSamples, gardenSamples]) {
      expect(maxShooters(exposure(map.grid, statics, samples))).toBeLessThanOrEqual(3);
      expect(maxShooters(exposure(map.grid, patrols, samples))).toBeLessThanOrEqual(3);
    }
  });

  it('leaves the stealth approach genuinely viable: crouching cuts exposure hard', () => {
    const standing = exposedFraction(exposure(map.grid, statics, mainSamples, 'standing'));
    const crouched = exposedFraction(exposure(map.grid, statics, mainSamples, 'crouching'));
    // Low cover hides a crouching player, so this must be a real reduction and
    // not a rounding difference. The target is a floor on pressure, not a
    // mandate that stealth be impossible.
    expect(crouched).toBeLessThan(standing * 0.75);
    expect(crouched).toBeLessThan(0.45);
  });

  it('keeps the garden route safer than main street, as the longer branch', () => {
    const main = exposedFraction(exposure(map.grid, statics, mainSamples));
    const garden = exposedFraction(exposure(map.grid, statics, gardenSamples));
    expect(garden).toBeLessThan(main);
  });

  it('reports patrol coverage separately, and higher, than static posts', () => {
    const post = exposedFraction(exposure(map.grid, statics, mainSamples));
    const patrol = exposedFraction(exposure(map.grid, patrols, mainSamples));
    // The two metrics are not interchangeable; patrol coverage is the worst case.
    expect(patrol).toBeGreaterThan(post);
  });

  it('covers all three encounter areas rather than massing in one', () => {
    const AREAS: [string, number, number, number, number][] = [
      ['market', 9, 32, 34, 25],
      ['courtyard', 50, 20, 36, 24],
      ['garage+dock', 58, 6, 33, 15],
    ];
    for (const [label, x0, y0, w, h] of AREAS) {
      const tiles: { x: number; y: number }[] = [];
      for (let ty = y0; ty < y0 + h; ty++)
        for (let tx = x0; tx < x0 + w; tx++)
          if (!map.grid.solidAt(tx, ty)) tiles.push(T(tx, ty));
      const e = exposure(map.grid, patrols, tiles);
      expect(exposedFraction(e), `${label} patrol coverage`).toBeGreaterThan(0.5);
      expect(maxShooters(e), `${label} shooters`).toBeLessThanOrEqual(3);
    }
  });

  it('gives the market genuinely overlapping cones', () => {
    // At least one spot in the market is seen by two different guards at once,
    // which is what makes the encounter a problem rather than three sentries.
    const tiles: { x: number; y: number }[] = [];
    for (let ty = 32; ty < 57; ty++)
      for (let tx = 9; tx < 43; tx++) if (!map.grid.solidAt(tx, ty)) tiles.push(T(tx, ty));
    const overlapped = exposure(map.grid, patrols, tiles).filter((s) => s.seenBy.length >= 2);
    expect(overlapped.length).toBeGreaterThan(0);
  });
});

// --------------------------------------------------------- 4. cover and LOS

describe('4. cover still works against sight and bullets', () => {
  it('blocks a guard cone with solid geometry', () => {
    // A wall between a guard post and a point inside its cone and range must
    // defeat the sighting, otherwise "cover" is cosmetic.
    const blocked = exposure(map.grid, statics, [T(70, 14)]);
    // The garage interior is not visible from the market or the courtyard gate.
    expect(blocked[0].seenBy).not.toContain('enemy_l1');
    expect(blocked[0].seenBy).not.toContain('enemy_l5');
  });

  it('stops a bullet at solid geometry rather than passing through', () => {
    const grid = new Grid(6, 3);
    for (let x = 0; x < 6; x++) grid.merge(x, 1, { collides: true, blocksSight: true });
    const shot = grid.raycastShot({ x: 40, y: 40 }, -Math.PI / 2, 32);
    expect(shot.blocked).toBe(true);
    expect(shot.tileY).toBe(1);
  });

  it('hides a crouching player behind low cover but not a standing one', () => {
    const grid = new Grid(5, 3);
    grid.merge(2, 1, { lowCover: true, collides: true });
    const observer = { pos: { x: 2 * 16 + 8, y: 2 * 16 + 8 }, facing: -Math.PI / 2 };
    const at = { x: 2 * 16 + 8, y: 8 };
    expect(canSee(grid, observer, { pos: at, stance: 'crouching', inShadow: false }).visible).toBe(
      false
    );
    expect(canSee(grid, observer, { pos: at, stance: 'standing', inShadow: false }).visible).toBe(
      true
    );
  });
});

// ------------------------------------------------------- 5. the garden route

describe('5. the garden route stays a stealth route', () => {
  it('puts exactly one guard on the garden branch', () => {
    // L4 is the obstacle; a second guard would make it a combat corridor.
    const inGarden = guards.filter(
      (g) => g.x / TILE >= 6 && g.x / TILE <= 52 && g.y / TILE >= 3 && g.y / TILE <= 31
    );
    expect(inGarden.map((g) => g.name)).toEqual(['enemy_l4']);
  });

  it('leaves the shadowed west strip outside L4 patrol, as the bypass', () => {
    const l4 = guards.find((g) => g.name === 'enemy_l4')!;
    // Every L4 waypoint sits east of the shadowed x6-10 corridor.
    for (const wp of l4.route) expect(Math.floor(wp.x / TILE), 'L4 waypoint').toBeGreaterThan(10);
    // And that corridor really is authored shadow, where crouching drops the
    // detection rate from 80/s to 28/s.
    let shadowTiles = 0;
    for (let ty = 3; ty <= 25; ty++)
      for (let tx = 6; tx <= 10; tx++)
        if (!map.grid.solidAt(tx, ty) && map.grid.isShadowWorld(tx * TILE + 8, ty * TILE + 8))
          shadowTiles++;
    expect(shadowTiles).toBeGreaterThan(40);
  });

  it('does not require eliminating L4 to reach the depot', () => {
    // Pathing is geometry, not permission - but with no guard standing in a
    // doorway, the route exists independently of L4's fate.
    const route = map.grid.findPath(T(17, 31), T(52, 27), 60000);
    expect(route).not.toBeNull();
  });

  it('does not let the garden branch skip any mandatory objective', () => {
    // Both branches pass through the same mandatory sites; the branch only
    // changes the middle legs.
    expect(GARDEN[0]).toEqual(MAIN[0]);
    for (let i = 5; i < MAIN.length; i++) expect(GARDEN[i]).toEqual(MAIN[i]);
  });
});

// ------------------------------------------------------- 6. courtyard + key

describe('6. the courtyard encounter does not trap the player', () => {
  it('keeps the office reachable and leaveable regardless of guards', () => {
    const office = byName('interact_ledger');
    for (const from of [T(77, 42), T(52, 27)]) {
      expect(map.grid.findPath(from, office, 60000), 'office unreachable').not.toBeNull();
      expect(map.grid.findPath(office, from, 60000), 'office has no way out').not.toBeNull();
    }
  });

  it('does not put any guard spawn or waypoint inside the office interior', () => {
    // The office is cover for the player; a guard authored inside it would be
    // both a pathing trap and an unavoidable fight for the key.
    for (const g of guards) {
      for (const p of [{ x: g.x, y: g.y }, ...g.route]) {
        const tx = Math.floor(p.x / TILE);
        const ty = Math.floor(p.y / TILE);
        const inOffice = tx >= 53 && tx <= 57 && ty >= 31 && ty <= 38;
        expect(inOffice, `${g.name} is authored inside the depot office`).toBe(false);
      }
    }
  });

  it('gives at least two hard-cover breaks between the gate and the office', () => {
    // Counted as solid tiles adjacent to the gate-to-office path: the player
    // must have something to break line of sight behind.
    const path = samplePath(map.grid, [T(77, 42), { x: byName('interact_ledger').x, y: byName('interact_ledger').y }]);
    let breaks = 0;
    const seen = new Set<string>();
    for (const p of path) {
      const tx = Math.floor(p.x / TILE);
      const ty = Math.floor(p.y / TILE);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!map.grid.solidAt(tx + dx, ty + dy)) continue;
        const key = `${tx + dx},${ty + dy}`;
        if (!seen.has(key)) {
          seen.add(key);
          breaks++;
        }
      }
    }
    expect(breaks).toBeGreaterThanOrEqual(2);
  });

  it('does not make the garage key depend on L5 or L6', () => {
    // The ledger is an interactable with an objective dependency only; no
    // enemy name appears anywhere in its authored properties.
    const ledger = byName('interact_ledger');
    expect(ledger.props.objective).toBe('V5');
    expect(JSON.stringify(ledger.props)).not.toMatch(/enemy|l5|l6/i);
  });
});

// --------------------------------------------------------------- 7. L7 doors

describe('7. L7 patrols without violating the garage door contract', () => {
  const audits = doorAudit(map, guards);

  it('gives every guard somewhere to patrol while the doors are locked', () => {
    for (const a of audits)
      expect(a.hasSealedPatrol, `${a.guard} has no reachable waypoint while sealed`).toBe(true);
  });

  it('confines L7 to the garage while the doors are locked', () => {
    const l7 = audits.find((a) => a.guard === 'enemy_l7')!;
    // Some waypoints are deliberately on the far side of the shutter.
    expect(l7.doorDependentLegs).toBeGreaterThan(0);
    expect(l7.reachableSealed).toBeLessThan(l7.reachableOpen);
    // But it still has a real loop on the side it starts on.
    expect(l7.reachableSealed).toBeGreaterThanOrEqual(3);
    expect(l7.sealedLoopPixels).toBeGreaterThanOrEqual(450);
  });

  it('never gives any guard a path through a closed door', () => {
    // The authority is the Grid: with the doors sealed, no waypoint-to-waypoint
    // path may cross a door tile. This is what stops a guard walking through.
    const sealed = sealedGrid(map);
    const doorTiles = new Set<string>();
    for (const d of map.objects.filter((o) => o.type === 'door')) {
      const tx = Number(d.props.tileX);
      const ty = Number(d.props.tileY);
      for (let y = ty; y < ty + Number(d.props.tileH); y++)
        for (let x = tx; x < tx + Number(d.props.tileW); x++) doorTiles.add(`${x},${y}`);
    }
    expect(doorTiles.size).toBe(6);
    for (const g of guards) {
      for (let i = 0; i < g.route.length; i++) {
        const steps = sealed.findPath(g.route[i], g.route[(i + 1) % g.route.length], 60000);
        if (!steps) continue;
        for (const s of steps)
          expect(
            doorTiles.has(`${Math.floor(s.x / TILE)},${Math.floor(s.y / TILE)}`),
            `${g.name} leg ${i} crosses a sealed door`
          ).toBe(false);
      }
    }
  });

  it('takes up the rest of the route once the doors open', () => {
    const l7 = audits.find((a) => a.guard === 'enemy_l7')!;
    expect(l7.reachableOpen).toBe(guards.find((g) => g.name === 'enemy_l7')!.route.length);
  });

  it('keeps both garage entrances usable: neither is watched from L7 post', () => {
    const l7 = guards.find((g) => g.name === 'enemy_l7')!;
    const observer = { pos: { x: l7.x, y: l7.y }, facing: l7.facing };
    const target = (tx: number, ty: number) => ({
      pos: T(tx, ty),
      stance: 'standing' as const,
      inShadow: false,
    });
    // MEASURED, not assumed: both entrances sit beyond the 176 px sight range
    // from L7's post (195 px at the courtyard door, 210 px at the shutter), so
    // the player can come in either way without being seen at the threshold.
    // Neither door is the "safe" one and neither is a trap.
    for (const [tx, ty] of [
      [81, 18],
      [81, 17],
      [83, 14],
      [82, 14],
    ]) {
      const sight = canSee(map.grid, observer, target(tx, ty));
      expect(sight.visible, `entrance ${tx},${ty} is watched from L7's post`).toBe(false);
      expect(sight.distance, `entrance ${tx},${ty}`).toBeGreaterThan(VISION.maxDistance);
    }
  });

  it('still makes L7 the garage problem: its post covers the interior', () => {
    const l7 = guards.find((g) => g.name === 'enemy_l7')!;
    const observer = { pos: { x: l7.x, y: l7.y }, facing: l7.facing };
    // The transport bay and the cultist are inside the post cone, so getting in
    // is free but working the garage is not.
    for (const name of ['interact_van', 'actor_cultist']) {
      const o = byName(name);
      expect(
        canSee(map.grid, observer, {
          pos: { x: o.x, y: o.y },
          stance: 'standing',
          inShadow: false,
        }).visible,
        name
      ).toBe(true);
    }
  });

  it('covers both entrances once L7 is actually patrolling', () => {
    const l7 = guards.find((g) => g.name === 'enemy_l7')!;
    const posts = patrolPosts(map.grid, [l7]);
    for (const [tx, ty] of [
      [81, 18],
      [83, 14],
    ]) {
      const e = exposure(map.grid, posts, [T(tx, ty)]);
      expect(e[0].seenBy, `entrance ${tx},${ty} never seen on patrol`).toContain('enemy_l7');
    }
  });

  it('leaves the story beats reachable past L7', () => {
    for (const name of ['interact_van', 'actor_cultist', 'interact_inscription'])
      expect(map.grid.findPath(T(82, 20), byName(name), 60000), name).not.toBeNull();
  });
});

// ------------------------------------------------------- 8. alert chaining

describe('8. alert chaining is real, local, and recovers', () => {
  const links = acousticLinksAlongPatrol(map.grid, guards);
  const heard = links.filter((l) => l.heard);

  it('links guards within each encounter', () => {
    const pairs = heard.map((l) => `${l.from}-${l.to}`);
    // Market: L1-L2-L3. Courtyard: L5-L6.
    expect(pairs).toContain('enemy_l1-enemy_l2');
    expect(pairs).toContain('enemy_l2-enemy_l3');
    expect(pairs).toContain('enemy_l5-enemy_l6');
  });

  it('links each encounter to the next, so detection carries pressure forward', () => {
    const pairs = heard.map((l) => `${l.from}-${l.to}`);
    // Market -> garden, through the north-west passage.
    expect(pairs).toContain('enemy_l3-enemy_l4');
    // Courtyard -> garage, across the dock ramp.
    expect(pairs).toContain('enemy_l6-enemy_l7');
  });

  it('respects the attenuation rule rather than shouting through walls', () => {
    for (const l of links) {
      const expected = l.clearLineOfSound ? 160 : 80;
      expect(l.audibleRadius, `${l.from}-${l.to}`).toBe(expected);
      expect(l.heard).toBe(l.distance <= expected);
    }
  });

  it('does not produce a map-wide alarm', () => {
    // Most pairs are never in earshot of each other at all, so one detection
    // cannot raise the whole level.
    expect(heard.length).toBeLessThan(links.length / 2);
    expect(links.length - heard.length).toBeGreaterThanOrEqual(14);
  });

  it('keeps the far ends of the level acoustically independent', () => {
    const pairs = new Set(heard.map((l) => `${l.from}-${l.to}`));
    // A shout in the market can never reach the garage or the depot gate.
    for (const pair of [
      'enemy_l1-enemy_l5',
      'enemy_l1-enemy_l7',
      'enemy_l2-enemy_l7',
      'enemy_l3-enemy_l7',
    ])
      expect(pairs.has(pair), pair).toBe(false);
  });

  it('recovers: suspicion decays and investigation times out', () => {
    // No permanent alarm is possible because the contract itself de-escalates.
    expect(VISION.decayPerSecond).toBeGreaterThan(0);
    expect(VISION.investigateTimeout).toBeGreaterThan(0);
    expect(VISION.investigateTimeout).toBeLessThanOrEqual(10);
  });
});

// ------------------------------------------------ 9. stealth and combat both

describe('9. both playstyles survive the new roster', () => {
  it('reaches every mandatory site without any guard standing in the way', () => {
    // Guards do not occupy the tile of any objective, so none of them has to be
    // killed or moved for an interaction to be possible.
    const guardTiles = new Set<string>();
    for (const g of guards) {
      guardTiles.add(`${Math.floor(g.x / TILE)},${Math.floor(g.y / TILE)}`);
      for (const wp of g.route) guardTiles.add(`${Math.floor(wp.x / TILE)},${Math.floor(wp.y / TILE)}`);
    }
    for (const o of map.objects.filter((x) =>
      ['interactable', 'story', 'item', 'checkpoint'].includes(x.type)
    )) {
      const key = `${Math.floor(o.x / TILE)},${Math.floor(o.y / TILE)}`;
      expect(guardTiles.has(key), `${o.name} shares a tile with a guard waypoint`).toBe(false);
    }
  });

  it('keeps every objective, supply and checkpoint reachable from spawn', () => {
    const spawn = byName('spawn');
    for (const o of map.objects.filter((x) =>
      ['interactable', 'story', 'item', 'checkpoint'].includes(x.type)
    )) {
      expect(
        map.grid.findPath({ x: spawn.x, y: spawn.y }, { x: o.x, y: o.y }, 60000),
        `${o.name} unreachable`
      ).not.toBeNull();
    }
  });

  it('leaves at least one unexposed approach to each V1 evidence source', () => {
    // Not frame-perfect: there is a standing position next to each source that
    // no authored post can see, so the player can wait rather than time a dash.
    for (const name of ['interact_tracks', 'interact_stall']) {
      const o = byName(name);
      const tx = Math.floor(o.x / TILE);
      const ty = Math.floor(o.y / TILE);
      const around: { x: number; y: number }[] = [];
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
          if (!map.grid.solidAt(tx + dx, ty + dy)) around.push(T(tx + dx, ty + dy));
      const unseen = exposure(map.grid, statics, around).filter((s) => s.seenBy.length === 0);
      expect(unseen.length, `${name} has no unexposed approach`).toBeGreaterThan(0);
    }
  });

  it('keeps the radio distraction audible to market guards and only them', () => {
    const radio = byName('interact_radio');
    const radius = Number(radio.props.noise);
    expect(radius).toBeGreaterThan(0);
    const reached = guards.filter((g) => {
      const d = Math.hypot(g.x - radio.x, g.y - radio.y);
      const clear = map.grid.hasClearReach({ x: radio.x, y: radio.y }, { x: g.x, y: g.y });
      return d <= (clear ? radius : radius * 0.5);
    });
    // It must pull somebody, or it is not a distraction...
    expect(reached.length).toBeGreaterThan(0);
    // ...but it must not pull the whole level.
    expect(reached.length).toBeLessThan(guards.length);
    for (const g of reached) expect(['enemy_l2', 'enemy_l3', 'enemy_l4']).toContain(g.name);
  });

  it('gives a fighting player cover at every guard post', () => {
    // Within 5 tiles of each post there is solid geometry to break line of
    // sight behind, so an aggressive player is never in open ground.
    for (const g of guards) {
      const tx = Math.floor(g.x / TILE);
      const ty = Math.floor(g.y / TILE);
      let solids = 0;
      for (let dy = -5; dy <= 5; dy++)
        for (let dx = -5; dx <= 5; dx++) if (map.grid.solidAt(tx + dx, ty + dy)) solids++;
      expect(solids, `${g.name} post has no nearby cover`).toBeGreaterThan(0);
    }
  });

  it('cannot be sprinted through unseen', () => {
    // A sprinting player accumulates 120 suspicion/s and needs only 100 to be
    // in combat, so any continuous exposure longer than ~0.84 s is a fight.
    // At 152 px/s that is 127 px of path. Check the main route contains a run
    // of consecutive exposed samples longer than that.
    const e = exposure(map.grid, statics, mainSamples, 'sprinting');
    let longest = 0;
    let run = 0;
    for (const s of e) {
      run = s.seenBy.length > 0 ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
    // Samples are 16 px apart.
    expect(longest * 16).toBeGreaterThan(127);
  });
});

// ------------------------------------------- 10. checkpoint compatibility

describe('10. checkpoints handle all seven guards and the roster change', () => {
  const snap = (name: string): EnemySnapshot => ({
    name,
    x: 100,
    y: 100,
    facing: 0,
    hp: 60,
    dead: false,
    suspicion: 0,
    routeIndex: 0,
  });
  const roster = guards.map((g) => g.name);

  it('accepts a save written against the current seven-guard roster', () => {
    expect(enemyRosterMatches(roster.map(snap), roster)).toBe(true);
  });

  it('is order-independent, so snapshot order cannot invalidate a save', () => {
    expect(enemyRosterMatches([...roster].reverse().map(snap), roster)).toBe(true);
  });

  it('rejects a pre-C.1B-03 three-guard save rather than reinterpreting it', () => {
    // This is the case the policy exists for: the names still exist, but the
    // positions and routeIndexes describe the old layout.
    const old = ['enemy_l1', 'enemy_l2', 'enemy_l3'].map(snap);
    expect(enemyRosterMatches(old, roster)).toBe(false);
  });

  it('rejects a roster with a renamed or missing guard', () => {
    expect(enemyRosterMatches(roster.slice(1).map(snap), roster)).toBe(false);
    const renamed = [...roster.slice(0, 6), 'enemy_l8'].map(snap);
    expect(enemyRosterMatches(renamed, roster)).toBe(false);
  });

  it('rejects duplicates even when the count happens to match', () => {
    const dupes = [...roster.slice(0, 6), 'enemy_l1'].map(snap);
    expect(enemyRosterMatches(dupes, roster)).toBe(false);
  });

  it('keeps every guard id stable and snapshot-safe', () => {
    // Names are the save key, so they must be unique and non-empty.
    for (const name of roster) expect(name).toMatch(/^enemy_l[1-7]$/);
    expect(new Set(roster).size).toBe(7);
  });

  it('restores every guard to a valid position on a clean reset', () => {
    // resetToSpawn puts a guard back on its authored spawn, which test 1
    // already proves is walkable - so a roster mismatch cannot strand anyone.
    for (const g of guards)
      expect(map.grid.solidAt(Math.floor(g.x / TILE), Math.floor(g.y / TILE)), g.name).toBe(false);
  });
});
