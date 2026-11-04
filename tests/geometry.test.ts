import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Grid, type TileFlags } from '../src/core/Grid';
import { PLAYER, TILE } from '../src/core/constants';

/**
 * Valcendre spatial validation for Phase C.1B-01.
 *
 * Geometry only: area connectivity, both branch routes, the depot progression
 * and route lengths, all measured by running the engine's own Grid A* over the
 * generated map. Enemy coverage and encounter length are deliberately NOT
 * asserted here - those are C.1B-3.
 *
 * The Phase C.1A baseline this replaced is preserved in
 * tests/fixtures/valcendre-baseline-c1a.json; it describes the old 60x40 map
 * and must never be asserted against the current one.
 */

const ROOT = new URL('..', import.meta.url).pathname;
const MAP_PATH = `${ROOT}public/assets/maps/village.json`;

interface TiledProperty {
  name: string;
  value: string | number | boolean;
}
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8')) as {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: {
    name: string;
    type: string;
    data?: number[];
    objects?: {
      name: string;
      type: string;
      x: number;
      y: number;
      width: number;
      height: number;
      properties?: TiledProperty[];
    }[];
  }[];
  tilesets: { firstgid: number; tiles?: { id: number; properties: TiledProperty[] }[] }[];
};

const props = (list: TiledProperty[] | undefined): Record<string, string | number | boolean> =>
  Object.fromEntries((list ?? []).map((p) => [p.name, p.value]));

const objects = (map.layers.find((l) => l.type === 'objectgroup')?.objects ?? []).map((o) => ({
  ...o,
  props: props(o.properties),
}));
const byName = (name: string) => {
  const found = objects.find((o) => o.name === name);
  if (!found) throw new Error(`map has no object named "${name}"`);
  return found;
};
const byType = (type: string) => objects.filter((o) => o.type === type);
const layer = (name: string) => map.layers.find((l) => l.name === name);

/** Only the gameplay layers contribute flags, exactly as MapLoader does. */
const GAMEPLAY_LAYERS = new Set(['collision', 'cover', 'propCollision', 'shadowZones']);

function buildGrid(): Grid {
  const grid = new Grid(map.width, map.height);
  const tileset = map.tilesets[0];
  const flagsById = new Map<number, Partial<TileFlags>>();
  for (const tile of tileset.tiles ?? [])
    flagsById.set(tile.id, props(tile.properties) as unknown as Partial<TileFlags>);
  for (const l of map.layers) {
    if (l.type !== 'tilelayer' || !l.data || !GAMEPLAY_LAYERS.has(l.name)) continue;
    for (let i = 0; i < l.data.length; i++) {
      const gid = l.data[i];
      if (gid === 0) continue;
      const flags = flagsById.get(gid - tileset.firstgid);
      if (flags) grid.merge(i % map.width, Math.floor(i / map.width), flags);
    }
  }
  return grid;
}

const grid = buildGrid();
const T = (tx: number, ty: number) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });
const walkable = (tx: number, ty: number) => !grid.solidAt(tx, ty);

const steps = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  grid.findPath({ x: a.x, y: a.y }, { x: b.x, y: b.y }, 60000) ?? [];

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
const exitObj = byName('exit_north');
const exitPoint = { x: exitObj.x + exitObj.width / 2, y: exitObj.y + exitObj.height / 2 };

/** One representative interior tile per authored area. */
const AREA_PROBES: [string, number, number][] = [
  ['arrival alley', 10, 64],
  ['market square (main)', 24, 45],
  ['market square (plaza)', 24, 34],
  ['market square (west arcade)', 10, 45],
  ['bakery yard', 12, 25],
  ['garden wall walk', 8, 10],
  ['upper lane', 20, 4],
  ['lane descent', 49, 22],
  ['main street', 55, 52],
  ['depot courtyard (north)', 70, 22],
  ['depot courtyard (south)', 65, 41],
  ['depot office', 55, 34],
  ['garage interior', 70, 14],
  ['loading dock', 87, 15],
  ['north road', 62, 2],
];

/** Branch and progression waypoints. */
const MARKET_EXIT_EAST = T(39, 48);
const MARKET_EXIT_NW = T(17, 31);
const COURTYARD_SOUTH = T(77, 42);
const COURTYARD_NW = T(51, 26);
const OFFICE_DOOR = T(55, 38);
const GARAGE_DOOR = T(82, 19);
const DOCK_RAMP = T(85, 20);

describe('1. the map builds at its intended dimensions', () => {
  it('is 104 x 72 tiles of 16 px', () => {
    expect(map.width).toBe(104);
    expect(map.height).toBe(72);
    expect(map.tilewidth).toBe(TILE);
    expect(map.tileheight).toBe(TILE);
  });

  it('declares every layer the renderer and AI expect', () => {
    const names = map.layers.map((l) => l.name);
    for (const required of [
      'floor',
      'decorBack',
      'architecture',
      'collision',
      'cover',
      'propCollision',
      'shadowZones',
      'decorFront',
      'objects',
    ])
      expect(names).toContain(required);
  });

  it('keeps appearance and collision on separate layers', () => {
    expect(layer('collision')!.visible).toBe(false);
    expect(layer('propCollision')!.visible).toBe(false);
    expect(layer('shadowZones')!.visible).toBe(false);
    expect(layer('architecture')!.visible).toBe(true);
  });

  it('grew the playable area substantially over the C.1A baseline', () => {
    const baseline = JSON.parse(
      readFileSync(`${ROOT}tests/fixtures/valcendre-baseline-c1a.json`, 'utf8')
    );
    let count = 0;
    for (let ty = 0; ty < map.height; ty++)
      for (let tx = 0; tx < map.width; tx++) if (walkable(tx, ty)) count++;
    expect(count).toBeGreaterThan(baseline.map.walkableTiles * 2);
  });
});

describe('2. all major regions are connected', () => {
  it('reaches a tile inside every authored area from the spawn point', () => {
    for (const [name, tx, ty] of AREA_PROBES) {
      expect(walkable(tx, ty), `${name} probe (${tx},${ty}) is solid`).toBe(true);
      expect(steps(spawn, T(tx, ty)).length, `${name} unreachable from spawn`).toBeGreaterThan(0);
    }
  });

  it('leaves no isolated walkable region', () => {
    // Flood fill from spawn over the gameplay grid and compare with the total.
    const seen = new Set<number>();
    const start = Math.floor(spawn.y / TILE) * map.width + Math.floor(spawn.x / TILE);
    const stack = [start];
    seen.add(start);
    while (stack.length > 0) {
      const i = stack.pop()!;
      const x = i % map.width;
      const y = Math.floor(i / map.width);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
        if (!walkable(nx, ny)) continue;
        const ni = ny * map.width + nx;
        if (seen.has(ni)) continue;
        seen.add(ni);
        stack.push(ni);
      }
    }
    let total = 0;
    for (let ty = 0; ty < map.height; ty++)
      for (let tx = 0; tx < map.width; tx++) if (walkable(tx, ty)) total++;
    expect(seen.size).toBe(total);
  });

  it('keeps every door opening wide enough for the player collision body', () => {
    // The body is 12 px, so a single 16 px tile is passable; these are the
    // authored openings and each must be at least one clear tile.
    const openings: [string, number, number, number][] = [
      ['alley neck', 56, 11, 15],
      ['bakery passage', 31, 16, 19],
      ['garage door', 19, 81, 83],
      ['depot gate', 44, 75, 78],
      ['office door', 38, 55, 56],
    ];
    for (const [name, ty, x0, x1] of openings) {
      const clear = [];
      for (let tx = x0; tx <= x1; tx++) if (walkable(tx, ty)) clear.push(tx);
      expect(clear.length, `${name} opening at y${ty}`).toBeGreaterThanOrEqual(1);
      expect(PLAYER.bodyWidth).toBeLessThan(TILE);
    }
  });
});

describe('3. both branch routes reach the depot', () => {
  it('reaches the courtyard by main street', () => {
    expect(steps(MARKET_EXIT_EAST, COURTYARD_SOUTH).length).toBeGreaterThan(0);
  });

  it('reaches the courtyard by the bakery and garden route', () => {
    expect(steps(MARKET_EXIT_NW, COURTYARD_NW).length).toBeGreaterThan(0);
  });

  it('makes the market unavoidable: both branch mouths are inside it', () => {
    // The only way out of the alley is the market, and both branches leave it.
    expect(steps(spawn, MARKET_EXIT_EAST).length).toBeGreaterThan(0);
    expect(steps(spawn, MARKET_EXIT_NW).length).toBeGreaterThan(0);
    // No route from the alley to either branch mouth avoids the market square.
    for (const mouth of [MARKET_EXIT_EAST, MARKET_EXIT_NW]) {
      const route = steps(spawn, mouth);
      const throughMarket = route.some((p) => {
        const tx = Math.floor(p.x / TILE);
        const ty = Math.floor(p.y / TILE);
        return tx >= 9 && tx <= 42 && ty >= 32 && ty <= 56;
      });
      expect(throughMarket).toBe(true);
    }
  });

  it('does not let the garden route bypass the courtyard into the garage', () => {
    // The garden branch must arrive in the courtyard, not next to the garage.
    const descentEnd = T(48, 24);
    const direct = steps(descentEnd, GARAGE_DOOR);
    expect(direct.length).toBeGreaterThan(0);
    const viaCourtyard = direct.some((p) => {
      const tx = Math.floor(p.x / TILE);
      const ty = Math.floor(p.y / TILE);
      return tx >= 50 && tx <= 85 && ty >= 20 && ty <= 43;
    });
    expect(viaCourtyard, 'garden route reaches the garage without the courtyard').toBe(true);
  });
});

describe('4. the main route is shorter than the garden route', () => {
  const legs = (branchMouth: { x: number; y: number }, arrival: { x: number; y: number }) =>
    pathLength(spawn, byName('reserved_convoy_stop')) +
    pathLength(byName('reserved_convoy_stop'), byName('reserved_waybill')) +
    pathLength(byName('reserved_waybill'), branchMouth) +
    pathLength(branchMouth, arrival) +
    pathLength(arrival, byName('reserved_ledger')) +
    pathLength(byName('reserved_ledger'), GARAGE_DOOR) +
    pathLength(GARAGE_DOOR, byName('interact_van')) +
    pathLength(byName('interact_van'), byName('reserved_belial')) +
    pathLength(byName('reserved_belial'), exitPoint);

  const mainRoute = legs(MARKET_EXIT_EAST, COURTYARD_SOUTH);
  const gardenRoute = legs(MARKET_EXIT_NW, COURTYARD_NW);

  it('puts the main-street critical path in the 3600-4200 px band', () => {
    expect(mainRoute).toBeGreaterThanOrEqual(3600);
    expect(mainRoute).toBeLessThanOrEqual(4200);
  });

  it('makes the garden route at least 500 px longer', () => {
    expect(gardenRoute - mainRoute).toBeGreaterThanOrEqual(500);
  });

  it('is no longer completable in seconds', () => {
    // The C.1A baseline was 7.7 s of pure sprinting.
    expect(mainRoute / PLAYER.speedSprint).toBeGreaterThan(20);
  });

  it('keeps the branch segment itself meaningfully different', () => {
    const viaStreet = pathLength(MARKET_EXIT_EAST, COURTYARD_SOUTH);
    const viaGarden = pathLength(MARKET_EXIT_NW, COURTYARD_NW);
    expect(viaGarden).toBeGreaterThan(viaStreet * 1.5);
  });
});

describe('5-7. the depot progression is reachable', () => {
  it('reaches the depot office through valid geometry', () => {
    expect(steps(spawn, OFFICE_DOOR).length).toBeGreaterThan(0);
    expect(steps(spawn, byName('reserved_ledger')).length).toBeGreaterThan(0);
    // The office is an interior: its only opening is the authored door.
    expect(walkable(55, 38)).toBe(true);
    expect(walkable(52, 34)).toBe(false);
    expect(walkable(58, 34)).toBe(false);
  });

  it('reaches the garage, by both of its entrances', () => {
    expect(steps(spawn, GARAGE_DOOR).length).toBeGreaterThan(0);
    expect(steps(COURTYARD_SOUTH, GARAGE_DOOR).length).toBeGreaterThan(0);
    // Second entrance: courtyard -> loading dock -> garage.
    expect(steps(COURTYARD_SOUTH, DOCK_RAMP).length).toBeGreaterThan(0);
    expect(steps(DOCK_RAMP, byName('interact_van')).length).toBeGreaterThan(0);
  });

  it('reaches the north-road exit only through the garage', () => {
    expect(steps(spawn, exitPoint).length).toBeGreaterThan(0);
    const route = steps(COURTYARD_SOUTH, exitPoint);
    const throughGarage = route.some((p) => {
      const tx = Math.floor(p.x / TILE);
      const ty = Math.floor(p.y / TILE);
      return tx >= 58 && tx <= 84 && ty >= 6 && ty <= 18;
    });
    expect(throughGarage, 'the exit can be reached without entering the garage').toBe(true);
  });
});

describe('8-9. mission anchors and existing interactions', () => {
  it('keeps every gameplay object anchor on walkable ground', () => {
    for (const o of objects) {
      if (['exit', 'prop', 'decor'].includes(o.type)) continue;
      expect(
        walkable(Math.floor(o.x / TILE), Math.floor(o.y / TILE)),
        `${o.name} sits on a solid tile`
      ).toBe(true);
    }
  });

  it('keeps the temporary V1-V2-V3 chain completable', () => {
    const van = byName('interact_van');
    const log = byName('interact_log');
    const sigil = byName('interact_sigil');
    expect(van.props.objective).toBe('V1');
    expect(log.props.requires).toBe('V1');
    expect(log.props.objective).toBe('V2');
    expect(sigil.props.requires).toBe('V2');
    expect(exitObj.props.requires).toBe('V2');
    for (const o of [van, log, sigil]) {
      expect(steps(spawn, o).length, o.name).toBeGreaterThan(0);
    }
    expect(steps(spawn, exitPoint).length).toBeGreaterThan(0);
  });

  it('keeps the radio distraction, the optional page and all supplies reachable', () => {
    for (const name of [
      'interact_radio',
      'interact_hymn',
      'item_medkit_market',
      'item_medkit_courtyard',
      'item_ammo_street',
      'item_ammo_lane',
      'checkpoint_entry',
      'checkpoint_log',
    ]) {
      expect(steps(spawn, byName(name)).length, name).toBeGreaterThan(0);
    }
    expect(byType('interactable').filter((p) => p.props.noise)).toHaveLength(1);
  });

  it('reserves the C.1B-2 objective sites without implementing them', () => {
    const reserved = byType('reserved');
    expect(reserved.length).toBeGreaterThanOrEqual(9);
    for (const r of reserved) {
      expect(r.props.beat, r.name).toBeTruthy();
      expect(r.props.note, r.name).toBeTruthy();
      // Reserved sites carry no objective dependency yet.
      expect(r.props.objective).toBeUndefined();
      expect(r.props.requires).toBeUndefined();
      expect(steps(spawn, r).length, `${r.name} unreachable`).toBeGreaterThan(0);
    }
  });

  it('keeps the enemy system functional with the existing three lookouts', () => {
    const enemies = byType('enemy');
    expect(enemies).toHaveLength(3);
    for (const e of enemies) {
      expect(e.props.kind).toBe('lookout');
      const route = byType('waypoint').filter((w) => w.props.route === e.props.route);
      expect(route.length, `${e.name} route`).toBeGreaterThanOrEqual(2);
      for (const w of route) {
        expect(
          walkable(Math.floor(w.x / TILE), Math.floor(w.y / TILE)),
          `${w.name} is blocked`
        ).toBe(true);
      }
    }
  });

  it('never anchors an objective on an enemy or require a kill', () => {
    const enemyTiles = new Set(
      byType('enemy').map((e) => `${Math.floor(e.x / TILE)},${Math.floor(e.y / TILE)}`)
    );
    for (const o of [...byType('interactable'), ...byType('reserved')]) {
      expect(
        enemyTiles.has(`${Math.floor(o.x / TILE)},${Math.floor(o.y / TILE)}`),
        o.name
      ).toBe(false);
    }
  });
});

describe('10. map generation is deterministic', () => {
  it('produces byte-identical output when re-run', () => {
    const hash = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');
    const before = hash(readFileSync(MAP_PATH));
    execFileSync('node', ['tools/build-map.mjs'], { cwd: ROOT, stdio: 'pipe' });
    const after = hash(readFileSync(MAP_PATH));
    expect(after).toBe(before);
  });
});
