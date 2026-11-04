/**
 * Encounter measurement over the shipped map, using the engine's own `Grid` and
 * `canSee` so the numbers cannot drift from the detection the player actually
 * experiences.
 *
 * Shared by `tests/encounters.test.ts` (which asserts) and
 * `tools/encounter-report.ts` (which prints). One implementation, so the
 * reported figures and the asserted figures are the same figures.
 *
 * TWO KINDS OF COVERAGE, deliberately kept apart (brief C.1B-03 section 9):
 *
 *  - STATIC-POST coverage: what a guard sees from its authored spawn with its
 *    authored facing. Reproducible, and the honest basis for a design target,
 *    because it does not depend on when the player arrives.
 *  - PATROL coverage: the union over the guard's whole route, facing along the
 *    direction of travel. Strictly larger, and it describes the worst case
 *    rather than a typical one.
 *
 * They are not interchangeable. A target quoted against one is meaningless
 * against the other.
 */

import { readFileSync } from 'node:fs';
import { Grid, type TileFlags, type Vec2 } from '../../src/core/Grid';
import { SOUND_RADIUS, TILE, VISION } from '../../src/core/constants';
import { canSee } from '../../src/systems/Vision';
import { ENEMIES, type EnemyKind } from '../../src/data/enemies';

const ROOT = new URL('../../', import.meta.url).pathname;

interface TiledProperty {
  name: string;
  value: string | number | boolean;
}

interface RawObject {
  name: string;
  type?: string;
  class?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  properties?: TiledProperty[];
}

interface TiledMap {
  width: number;
  height: number;
  layers: {
    name: string;
    type: string;
    data?: number[];
    objects?: RawObject[];
  }[];
  tilesets: { firstgid: number; tiles?: { id: number; properties: TiledProperty[] }[] }[];
}

export interface MapObject {
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  props: Record<string, string | number | boolean>;
}

/** Only these layers contribute flags to the gameplay grid, exactly as MapLoader does. */
const GAMEPLAY_LAYERS = new Set(['collision', 'cover', 'propCollision', 'shadowZones']);

export interface LoadedMap {
  grid: Grid;
  objects: MapObject[];
  width: number;
  height: number;
}

export function loadMap(): LoadedMap {
  const map = JSON.parse(
    readFileSync(`${ROOT}public/assets/maps/village.json`, 'utf8')
  ) as TiledMap;

  const props = (list: TiledProperty[] | undefined): Record<string, string | number | boolean> =>
    Object.fromEntries((list ?? []).map((p) => [p.name, p.value]));

  const grid = new Grid(map.width, map.height);
  const tileset = map.tilesets[0];
  const flagsById = new Map<number, Partial<TileFlags>>();
  for (const tile of tileset.tiles ?? [])
    flagsById.set(tile.id, props(tile.properties) as unknown as Partial<TileFlags>);
  for (const layer of map.layers) {
    if (layer.type !== 'tilelayer' || !layer.data || !GAMEPLAY_LAYERS.has(layer.name)) continue;
    for (let i = 0; i < layer.data.length; i++) {
      const gid = layer.data[i];
      if (gid === 0) continue;
      const flags = flagsById.get(gid - tileset.firstgid);
      if (flags) grid.merge(i % map.width, Math.floor(i / map.width), flags);
    }
  }

  const objects: MapObject[] = [];
  for (const layer of map.layers) {
    if (layer.type !== 'objectgroup') continue;
    for (const o of layer.objects ?? [])
      objects.push({
        name: o.name,
        type: String(o.type ?? o.class ?? ''),
        x: o.x,
        y: o.y,
        width: o.width,
        height: o.height,
        props: props(o.properties),
      });
  }
  return { grid, objects, width: map.width, height: map.height };
}

// ------------------------------------------------------------------- guards

export interface Guard {
  name: string;
  kind: EnemyKind;
  /** Authored spawn post, in world pixels. */
  x: number;
  y: number;
  /** Authored facing at spawn, in radians. */
  facing: number;
  /** Authored patrol waypoints in index order, in world pixels. */
  route: Vec2[];
}

export function guardsFromMap(map: LoadedMap): Guard[] {
  const routes = new Map<string, Vec2[]>();
  for (const wp of map.objects.filter((o) => o.type === 'waypoint')) {
    const id = String(wp.props.route ?? '');
    const list = routes.get(id) ?? [];
    list[Number(wp.props.index ?? 0)] = { x: wp.x, y: wp.y };
    routes.set(id, list);
  }
  return map.objects
    .filter((o) => o.type === 'enemy')
    .map((o) => ({
      name: o.name,
      kind: String(o.props.kind ?? 'lookout') as EnemyKind,
      x: o.x,
      y: o.y,
      facing: (Number(o.props.facing ?? 0) * Math.PI) / 180,
      route: (routes.get(String(o.props.route ?? '')) ?? []).filter(Boolean),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// -------------------------------------------------------------- patrol loops

export interface PatrolMetrics {
  waypoints: number;
  /** Every waypoint stands on a walkable tile. */
  allWalkable: boolean;
  /** Every leg of the loop is pathable with the doors in their start state. */
  allLegsPathable: boolean;
  /** Total A* travel distance once around the loop, in pixels. */
  loopPixels: number;
  /**
   * Seconds for one loop: A* travel at patrolSpeed, plus the engine's 1.1 s
   * pause at each waypoint, plus the time the bounded 3 rad/s turn rate costs
   * at each corner. Measured from traversal, not from straight lines.
   */
  loopSeconds: number;
  /** Straight-line sum, reported only to show how much it understates the loop. */
  straightLinePixels: number;
}

/** The engine's pause at each waypoint (Enemy.updatePatrol). */
const WAYPOINT_PAUSE = 1.1;
/** Enemy.TURN_RATE_PATROL. */
const TURN_RATE_PATROL = 3.0;

export function pathBetween(grid: Grid, a: Vec2, b: Vec2): Vec2[] | null {
  return grid.findPath({ x: a.x, y: a.y }, { x: b.x, y: b.y }, 60000);
}

function polylineLength(from: Vec2, steps: Vec2[]): number {
  let total = 0;
  let prev = from;
  for (const s of steps) {
    total += Math.hypot(s.x - prev.x, s.y - prev.y);
    prev = s;
  }
  return total;
}

export function patrolMetrics(grid: Grid, guard: Guard): PatrolMetrics {
  const route = guard.route;
  const allWalkable = route.every(
    (wp) => !grid.solidAt(Math.floor(wp.x / TILE), Math.floor(wp.y / TILE))
  );
  if (route.length < 2) {
    return {
      waypoints: route.length,
      allWalkable,
      allLegsPathable: true,
      loopPixels: 0,
      loopSeconds: 0,
      straightLinePixels: 0,
    };
  }

  let loopPixels = 0;
  let straightLinePixels = 0;
  let allLegsPathable = true;
  let turnSeconds = 0;
  let previousHeading: number | null = null;

  for (let i = 0; i < route.length; i++) {
    const from = route[i];
    const to = route[(i + 1) % route.length];
    straightLinePixels += Math.hypot(to.x - from.x, to.y - from.y);
    const steps = pathBetween(grid, from, to);
    if (!steps) {
      allLegsPathable = false;
      continue;
    }
    loopPixels += polylineLength(from, steps);
    const heading = Math.atan2(to.y - from.y, to.x - from.x);
    if (previousHeading !== null) {
      let delta = (heading - previousHeading) % (Math.PI * 2);
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      turnSeconds += Math.abs(delta) / TURN_RATE_PATROL;
    }
    previousHeading = heading;
  }

  const speed = ENEMIES[guard.kind].patrolSpeed;
  return {
    waypoints: route.length,
    allWalkable,
    allLegsPathable,
    loopPixels,
    loopSeconds: loopPixels / speed + route.length * WAYPOINT_PAUSE + turnSeconds,
    straightLinePixels,
  };
}

// ----------------------------------------------------------------- exposure

export type Stance = 'standing' | 'crouching' | 'sprinting';

/** An observation post: a position plus the direction being looked in. */
export interface Post {
  guard: string;
  x: number;
  y: number;
  facing: number;
}

/** The authored spawn post of each guard. */
export function staticPosts(guards: Guard[]): Post[] {
  return guards.map((g) => ({ guard: g.name, x: g.x, y: g.y, facing: g.facing }));
}

/**
 * Posts sampled along each patrol route, facing along the direction of travel.
 * This is the union of what a guard can ever see while patrolling, which is a
 * worst case rather than a typical one.
 */
export function patrolPosts(grid: Grid, guards: Guard[], stepPx = 24): Post[] {
  const posts: Post[] = [];
  for (const guard of guards) {
    if (guard.route.length < 2) {
      posts.push({ guard: guard.name, x: guard.x, y: guard.y, facing: guard.facing });
      continue;
    }
    for (let i = 0; i < guard.route.length; i++) {
      const from = guard.route[i];
      const to = guard.route[(i + 1) % guard.route.length];
      const steps = pathBetween(grid, from, to);
      if (!steps) continue;
      let prev = from;
      let carried = 0;
      for (const step of steps) {
        const segment = Math.hypot(step.x - prev.x, step.y - prev.y);
        const heading = Math.atan2(step.y - prev.y, step.x - prev.x);
        carried += segment;
        if (carried >= stepPx || posts.length === 0) {
          carried = 0;
          posts.push({ guard: guard.name, x: prev.x, y: prev.y, facing: heading });
        }
        prev = step;
      }
    }
  }
  return posts;
}

export interface SampleExposure {
  x: number;
  y: number;
  /** Guards that can see this point from at least one of the supplied posts. */
  seenBy: string[];
  /** Guards that can see it AND are inside their own engagement range. */
  shooters: string[];
}

/**
 * Which guards can see each sampled point. Uses `canSee` directly, so the 100
 * degree cone, the 176 px range and the occlusion rules are the engine's, not a
 * reimplementation.
 *
 * `stance` matters: a standing player is seen at the full rate, a crouching one
 * is additionally hidden by low cover. Exposure is reported for a STANDING
 * player, which is the generous reading for the level designer and the harsh
 * one for the player.
 */
export function exposure(
  grid: Grid,
  posts: Post[],
  samples: Vec2[],
  stance: Stance = 'standing'
): SampleExposure[] {
  return samples.map((pt) => {
    const seenBy = new Set<string>();
    const shooters = new Set<string>();
    for (const post of posts) {
      const sight = canSee(
        grid,
        { pos: { x: post.x, y: post.y }, facing: post.facing },
        { pos: pt, stance, inShadow: grid.isShadowWorld(pt.x, pt.y) }
      );
      if (!sight.visible) continue;
      seenBy.add(post.guard);
      // "Effective shooter" means it can both see the player and actually
      // engage from where it stands.
      if (sight.distance <= ENEMIES.lookout.engageRange) shooters.add(post.guard);
    }
    return { x: pt.x, y: pt.y, seenBy: [...seenBy].sort(), shooters: [...shooters].sort() };
  });
}

export function exposedFraction(samples: SampleExposure[]): number {
  if (samples.length === 0) return 0;
  return samples.filter((s) => s.seenBy.length > 0).length / samples.length;
}

export function maxShooters(samples: SampleExposure[]): number {
  return samples.reduce((worst, s) => Math.max(worst, s.shooters.length), 0);
}

// ------------------------------------------------------------ critical path

/** Samples the A* route through an ordered list of mandatory points. */
export function samplePath(grid: Grid, waypoints: Vec2[], stepPx = 16): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const steps = pathBetween(grid, waypoints[i], waypoints[i + 1]);
    if (!steps) continue;
    let prev = waypoints[i];
    let carried = 0;
    for (const step of steps) {
      carried += Math.hypot(step.x - prev.x, step.y - prev.y);
      if (carried >= stepPx) {
        carried = 0;
        out.push({ x: step.x, y: step.y });
      }
      prev = step;
    }
  }
  return out;
}

// ----------------------------------------------------------- acoustic links

export interface AcousticLink {
  from: string;
  to: string;
  distance: number;
  /** Shout radius after wall attenuation at the hearer's position. */
  audibleRadius: number;
  heard: boolean;
  /** True when no wall stands between them, so the shout carries at full radius. */
  clearLineOfSound: boolean;
}

/**
 * Who can hear whom shout, measured with `Hearing`'s own attenuation rule:
 * a shout crossing a wall carries at half radius.
 *
 * Measured between AUTHORED POSTS. A link that only exists at one moment of a
 * patrol is reported separately by `acousticLinksAlongPatrol`.
 */
export function acousticLinks(grid: Grid, guards: Guard[]): AcousticLink[] {
  const links: AcousticLink[] = [];
  for (const from of guards) {
    for (const to of guards) {
      if (from.name >= to.name) continue;
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      const clear = grid.hasClearReach({ x: from.x, y: from.y }, { x: to.x, y: to.y });
      const audibleRadius = clear ? SOUND_RADIUS.shout : SOUND_RADIUS.shout * 0.5;
      links.push({
        from: from.name,
        to: to.name,
        distance,
        audibleRadius,
        heard: distance <= audibleRadius,
        clearLineOfSound: clear,
      });
    }
  }
  return links;
}

/**
 * The same question asked over the patrol, not just the post: can `from` ever
 * be close enough, anywhere on its route, for `to` to hear it shout from
 * anywhere on `to`'s route?
 */
export function acousticLinksAlongPatrol(grid: Grid, guards: Guard[]): AcousticLink[] {
  const positions = new Map<string, Vec2[]>();
  for (const g of guards) {
    const pts = patrolPosts(grid, [g], 24).map((p) => ({ x: p.x, y: p.y }));
    positions.set(g.name, pts.length > 0 ? pts : [{ x: g.x, y: g.y }]);
  }

  const links: AcousticLink[] = [];
  for (const from of guards) {
    for (const to of guards) {
      if (from.name >= to.name) continue;
      let best: AcousticLink | null = null;
      for (const a of positions.get(from.name)!) {
        for (const b of positions.get(to.name)!) {
          const distance = Math.hypot(b.x - a.x, b.y - a.y);
          if (best && distance >= best.distance) continue;
          const clear = grid.hasClearReach(a, b);
          const audibleRadius = clear ? SOUND_RADIUS.shout : SOUND_RADIUS.shout * 0.5;
          best = {
            from: from.name,
            to: to.name,
            distance,
            audibleRadius,
            heard: distance <= audibleRadius,
            clearLineOfSound: clear,
          };
        }
      }
      if (best) links.push(best);
    }
  }
  return links;
}

/** Re-exported so callers do not have to reach into the engine for the numbers. */
export const CONTRACT = {
  coneDegrees: VISION.coneDegrees,
  maxDistance: VISION.maxDistance,
  engageRange: ENEMIES.lookout.engageRange,
  shoutRadius: SOUND_RADIUS.shout,
  patrolSpeed: ENEMIES.lookout.patrolSpeed,
} as const;

// ------------------------------------------------- door-state patrol audit

export interface DoorAudit {
  guard: string;
  /** Waypoints reachable from the spawn with every door locked. */
  reachableSealed: number;
  /** Waypoints reachable once the doors are open. */
  reachableOpen: number;
  /** Legs whose only path runs through a door; deferred until it unlocks. */
  doorDependentLegs: number;
  /**
   * The guard has somewhere to patrol while the doors are locked. False means a
   * guard that would stand still for the first half of the mission.
   */
  hasSealedPatrol: boolean;
  /** Loop length over just the waypoints it can reach while sealed, in pixels. */
  sealedLoopPixels: number;
}

/** A copy of the grid with every authored door closed. */
export function sealedGrid(map: LoadedMap): Grid {
  const sealed = loadMap().grid;
  for (const d of map.objects.filter((o) => o.type === 'door')) {
    const tx = Number(d.props.tileX);
    const ty = Number(d.props.tileY);
    for (let y = ty; y < ty + Number(d.props.tileH); y++)
      for (let x = tx; x < tx + Number(d.props.tileW); x++) sealed.setDoor(x, y, true);
  }
  return sealed;
}

/**
 * Whether a patrol depends on a locked door, and whether that dependency is
 * safe.
 *
 * A door-dependent leg is NOT a defect on its own: `Enemy.selectReachableWaypoint`
 * skips a waypoint it cannot path to, so the patrol confines itself to the side
 * it is on and takes up the rest when the door opens. What WOULD be a defect is
 * a guard with no reachable waypoint at all while sealed, because that guard
 * stands still for half the mission.
 */
export function doorAudit(map: LoadedMap, guards: Guard[]): DoorAudit[] {
  const sealed = sealedGrid(map);
  return guards.map((g) => {
    const from = { x: g.x, y: g.y };
    const canReach = (grid: Grid, wp: Vec2): boolean =>
      Math.hypot(wp.x - from.x, wp.y - from.y) <= 6 || grid.findPath(from, wp, 60000) !== null;

    const sealedWps = g.route.filter((wp) => canReach(sealed, wp));
    const openWps = g.route.filter((wp) => canReach(map.grid, wp));

    let doorDependentLegs = 0;
    for (let i = 0; i < g.route.length; i++) {
      const a = g.route[i];
      const b = g.route[(i + 1) % g.route.length];
      if (map.grid.findPath(a, b, 60000) && !sealed.findPath(a, b, 60000)) doorDependentLegs++;
    }

    let sealedLoopPixels = 0;
    for (let i = 0; i < sealedWps.length && sealedWps.length > 1; i++) {
      const steps = sealed.findPath(sealedWps[i], sealedWps[(i + 1) % sealedWps.length], 60000);
      if (steps) sealedLoopPixels += polylineLength(sealedWps[i], steps);
    }

    return {
      guard: g.name,
      reachableSealed: sealedWps.length,
      reachableOpen: openWps.length,
      doorDependentLegs,
      hasSealedPatrol: sealedWps.length >= 1,
      sealedLoopPixels,
    };
  });
}
