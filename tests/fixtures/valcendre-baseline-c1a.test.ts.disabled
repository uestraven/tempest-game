import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Grid, type TileFlags } from '../src/core/Grid';
import { COMBAT, PLAYER, TILE, VISION } from '../src/core/constants';
import { canSee } from '../src/systems/Vision';
import { ENEMIES } from '../src/data/enemies';
import { OBJECTIVES } from '../src/data/objectives';

/**
 * Pacing measurement for Valcendre.
 *
 * This is the harness behind docs/level-design/valcendre-rework.md §1. It runs
 * the engine's own Grid A* and Vision code over the shipped map, so route
 * lengths, traversal times and guard coverage are measured rather than
 * estimated.
 *
 * The numbers asserted here are the PHASE C.1A BASELINE - the 7.7-second level
 * the rework exists to fix. Phase C.1B is expected to break every one of them;
 * the `it.todo` entries at the bottom name the targets that replace them, from
 * the design document's §7.2 acceptance criteria.
 */

interface TiledProperty {
  name: string;
  value: string | number | boolean;
}
const map = JSON.parse(
  readFileSync(new URL('../public/assets/maps/village.json', import.meta.url), 'utf8')
) as {
  width: number;
  height: number;
  layers: {
    name: string;
    type: string;
    data?: number[];
    objects?: { name: string; type: string; x: number; y: number; width: number; height: number; properties?: TiledProperty[] }[];
  }[];
  tilesets: { firstgid: number; tiles?: { id: number; properties: TiledProperty[] }[] }[];
};

const props = (list: TiledProperty[] | undefined): Record<string, string | number | boolean> =>
  Object.fromEntries((list ?? []).map((p) => [p.name, p.value]));

const objects = (map.layers.find((l) => l.type === 'objectgroup')?.objects ?? []).map((o) => ({
  ...o,
  props: props(o.properties),
}));
const byName = (name: string) => objects.find((o) => o.name === name)!;
const byType = (type: string) => objects.filter((o) => o.type === type);

/** Only the gameplay layers contribute flags, exactly as MapLoader does. */
const GAMEPLAY_LAYERS = new Set(['collision', 'cover', 'propCollision', 'shadowZones']);

function buildGrid(): Grid {
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
  return grid;
}

const grid = buildGrid();

const steps = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  grid.findPath({ x: a.x, y: a.y }, { x: b.x, y: b.y }, 20000) ?? [];

function pathLength(a: { x: number; y: number }, b: { x: number; y: number }): number {
  let distance = 0;
  let prev = { x: a.x, y: a.y };
  for (const step of steps(a, b)) {
    distance += Math.hypot(step.x - prev.x, step.y - prev.y);
    prev = step;
  }
  return distance;
}

const spawn = byName('spawn');
const van = byName('interact_van');
const log = byName('interact_log');
const exitObj = byName('exit_north');
const exitPoint = { x: exitObj.x + exitObj.width / 2, y: exitObj.y + exitObj.height / 2 };

const criticalPath =
  pathLength(spawn, van) + pathLength(van, log) + pathLength(log, exitPoint);
const criticalSteps = [...steps(spawn, van), ...steps(van, log), ...steps(log, exitPoint)];

const walkableTiles = [...Array(map.width * map.height).keys()].filter(
  (i) => !grid.solidAt(i % map.width, Math.floor(i / map.width))
).length;

describe('Valcendre pacing baseline (Phase C.1A)', () => {
  it('measures a critical path barely over 1000 px', () => {
    // 1165 px. C.1B target: 3600-4200 px on the combat route.
    expect(criticalPath).toBeGreaterThan(1000);
    expect(criticalPath).toBeLessThan(1400);
  });

  it('completes in under 10 seconds of pure sprinting', () => {
    // This is the reported ~10 s completion, reproduced in route arithmetic.
    const sprintSeconds = criticalPath / PLAYER.speedSprint;
    expect(sprintSeconds).toBeLessThan(10);
    expect(sprintSeconds).toBeGreaterThan(6);
  });

  it('places two of the three mandatory objectives within 11 tiles of each other', () => {
    expect(pathLength(van, log) / TILE).toBeLessThan(11);
    expect(pathLength(log, exitPoint) / TILE).toBeLessThan(11);
  });

  it('visits under 10% of the walkable level', () => {
    const visited = new Set(
      criticalSteps.map((p) => `${Math.floor(p.x / TILE)},${Math.floor(p.y / TILE)}`)
    ).size;
    // 6.2%. C.1B target: >= 25%.
    expect(visited / walkableTiles).toBeLessThan(0.1);
  });

  it('leaves the garage yard entirely off the critical path', () => {
    // The yard is the level's largest combat space (372 authored tiles) and the
    // speedrun route never enters it, because the service corridor is shorter.
    const inYard = criticalSteps.filter((p) => {
      const tx = Math.floor(p.x / TILE);
      const ty = Math.floor(p.y / TILE);
      return tx >= 35 && tx <= 53 && ty >= 16 && ty <= 33;
    });
    expect(inYard).toHaveLength(0);
  });

  it('makes the stealth route shorter than the combat route, so it is dominant', () => {
    const viaYardDoor =
      pathLength(spawn, { x: 46 * TILE + 8, y: 16 * TILE + 8 }) +
      pathLength({ x: 46 * TILE + 8, y: 16 * TILE + 8 }, van);
    const viaServiceCorridor =
      pathLength(spawn, { x: 39 * TILE + 8, y: 7 * TILE + 8 }) +
      pathLength({ x: 39 * TILE + 8, y: 7 * TILE + 8 }, van);
    // The bypass is ~47 px shorter: strictly better, so route choice has a
    // dominant answer. C.1B requires the stealth route to be >= 500 px LONGER.
    expect(viaServiceCorridor).toBeLessThan(viaYardDoor);
  });

  it('exposes the critical path to guard posts less than a quarter of the time', () => {
    const enemies = byType('enemy').map((e) => ({
      pos: { x: e.x, y: e.y },
      facing: (Number(e.props.facing) * Math.PI) / 180,
    }));
    const seen = criticalSteps.filter((p) =>
      enemies.some(
        (e) => canSee(grid, e, { pos: p, stance: 'standing', inShadow: false }).visible
      )
    ).length;
    // 17%. C.1B target: >= 45%.
    expect(seen / criticalSteps.length).toBeLessThan(0.25);
  });

  it('lets a sprinter cross a cone faster than a guard can shoot', () => {
    const secondsToCombat = VISION.combatThreshold / VISION.ratesSprinting;
    const guardReaction = COMBAT.aimWindup + VISION.maxDistance / COMBAT.enemyBulletSpeed;
    const exposureNeeded = secondsToCombat + COMBAT.aimWindup;
    expect(secondsToCombat).toBeCloseTo(0.83, 2);
    expect(guardReaction).toBeCloseTo(0.89, 2);
    // A sprinter must stay visible 1.28 s before a round is fired, covering
    // 195 px. With 17% coverage, that window almost never closes.
    expect(exposureNeeded).toBeCloseTo(1.28, 2);
    expect(exposureNeeded * PLAYER.speedSprint).toBeGreaterThan(190);
  });

  it('gives one guard a patrol loop under 10 seconds', () => {
    const waypoints: Record<string, { x: number; y: number }[]> = {};
    for (const w of byType('waypoint')) {
      const route = String(w.props.route);
      (waypoints[route] ??= [])[Number(w.props.index)] = { x: w.x, y: w.y };
    }
    const loops = Object.values(waypoints).map((route) => {
      const points = route.filter(Boolean);
      let length = 0;
      for (let i = 0; i < points.length; i++)
        length += pathLength(points[i], points[(i + 1) % points.length]);
      return length / ENEMIES.lookout.patrolSpeed + points.length * 1.1;
    });
    // enemy_l1 paces a 173 px loop in ~6 s. C.1B target: every loop >= 14 s.
    expect(Math.min(...loops)).toBeLessThan(10);
  });

  it('makes BELIAL optional', () => {
    const belial = OBJECTIVES.find((o) => o.id === 'V3')!;
    // The campaign's central hook can be missed. C.1B makes it mandatory.
    expect(belial.optional).toBe(true);
  });
});

describe('invariants that must hold in both the baseline and the rework', () => {
  it('keeps every mandatory objective reachable from spawn', () => {
    for (const name of ['interact_van', 'interact_log']) {
      expect(steps(spawn, byName(name)).length, name).toBeGreaterThan(0);
    }
    expect(steps(spawn, exitPoint).length).toBeGreaterThan(0);
  });

  it('keeps every patrol waypoint on walkable ground', () => {
    for (const w of byType('waypoint')) {
      expect(
        grid.solidAt(Math.floor(w.x / TILE), Math.floor(w.y / TILE)),
        w.name
      ).toBe(false);
    }
  });

  it('never anchors a mandatory objective on an enemy', () => {
    const enemyTiles = new Set(
      byType('enemy').map((e) => `${Math.floor(e.x / TILE)},${Math.floor(e.y / TILE)}`)
    );
    for (const o of byType('interactable')) {
      if (!o.props.objective) continue;
      expect(
        enemyTiles.has(`${Math.floor(o.x / TILE)},${Math.floor(o.y / TILE)}`),
        o.name
      ).toBe(false);
    }
  });

  it('uses only the Lookout archetype in Valcendre', () => {
    for (const e of byType('enemy')) expect(e.props.kind).toBe('lookout');
  });
});

/**
 * Phase C.1B acceptance criteria, from docs/level-design/valcendre-rework.md
 * §7.2. These replace the baseline assertions above when the rework lands.
 */
describe('Phase C.1B targets', () => {
  it.todo('critical path is 3600-4200 px on the combat route');
  it.todo('the garden route is at least 500 px longer than the combat route');
  it.todo('critical-path exposure from guard posts is at least 45%');
  it.todo('every patrol loop is at least 450 px and at least 14 s');
  it.todo('the critical path visits at least 25% of walkable tiles');
  it.todo('seven lookouts, each with at least 3 waypoints');
  it.todo('BELIAL is mandatory');
  it.todo('at most 3 guards hold a line of fire on any critical-path tile');
  it.todo('no gameplay constant in PLAYER, VISION, COMBAT or the weapon tables changed');
});
